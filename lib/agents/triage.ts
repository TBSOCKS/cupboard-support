import { getAnthropic, MODELS } from '@/lib/anthropic';
import type { AgentName } from '@/types';

export type IntentCategory =
  | 'order_status'
  | 'returns'
  | 'product'
  | 'account'
  | 'general'
  | 'gibberish'
  | 'continuation'
  | 'unknown';

export interface TriageResult {
  intent: IntentCategory;
  confidence: number; // 0.0 to 1.0
  entities: {
    order_number: string | null;
    email: string | null;
    product_sku: string | null;
  };
  reasoning: string;
  routed_to: AgentName;
  auto_escalate: boolean;
  escalate_reason: string | null;
}

// Map intent → specialist agent. 'gibberish' and 'continuation' have no
// specialist - the chat route intercepts them before routing.
const INTENT_TO_AGENT: Record<IntentCategory, AgentName> = {
  order_status: 'order_status',
  returns: 'returns',
  product: 'product',
  account: 'account',
  general: 'general',
  gibberish: 'general', // unused - chat route intercepts
  continuation: 'general', // unused - chat route intercepts and reuses current_agent
  unknown: 'general',
};

const TRIAGE_SYSTEM_PROMPT = `You are the triage classifier for Cupboard, a fictional home goods e-commerce store. Your only job is to read an incoming customer message and decide where to route it.

You output JSON only - no prose, no preamble, no markdown fences.

# Possible intents

- order_status: questions about where an order is, tracking, delivery delays, "where's my package"
- returns: return requests, refund status, exchanges, damaged items, "I want to send this back"
- product: questions about products before or after purchase - sizing, materials, care, availability, comparisons
- account: login issues, payment methods, subscription/membership, charge disputes, address changes
- general: shipping policies, return windows, store hours, gift cards, anything policy/FAQ-flavored
- gibberish: input that looks like accidental typing - keyboard mashes ("sdkjfh", "asdfasdf"), random characters, no recognizable words. Distinct from "unknown" - gibberish is clearly NOT a real attempt to communicate.
- continuation: the customer's message is a short reply (1-3 words, or a brief sentence) that responds to something the assistant just asked. The message only makes sense in context of the previous turn. Examples: "yes", "no", "refund", "the second one", "5/3 if it helps". Use this when the customer is clearly answering a clarifying question rather than starting a new topic.
- unknown: a real attempt to communicate that you cannot confidently classify into any of the above

# IMPORTANT: continuation vs new topic

If you see PREVIOUS ASSISTANT MESSAGE in the input, check whether the customer's new message is responding to a question in that previous message. If yes, classify as 'continuation' regardless of what individual words appear. Example:

  PREVIOUS ASSISTANT: "Would you prefer a replacement or a refund?"
  CUSTOMER: "refund"
  -> intent = 'continuation' (NOT 'returns', because they're answering the assistant's question, not starting a new returns flow)

When in doubt, prefer 'continuation' for short replies (under 5 words) that follow a question.

# Auto-escalate to a human (set auto_escalate=true) if the message contains any of:

- explicit request for a human, agent, manager, supervisor, person, or representative
- legal threats: lawsuit, attorney, BBB, sue, lawyer
- charge disputes or fraud claims
- threats, abuse, or extremely angry/profane language
- mentions of injury, damage to property, or safety issues

Do NOT auto-escalate for gibberish or continuation - those are handled separately.

# Entity extraction

Extract from the message:
- order_number: any string matching CB-NNNNNN (with or without hyphen)
- email: any email address mentioned
- product_sku: any string matching CB-X### (e.g. CB-K001) - distinct from order numbers

# Confidence scoring

- 0.9+ : clear, unambiguous intent with supporting context
- 0.7-0.9: clear intent, slight ambiguity
- 0.5-0.7: best guess, multiple plausible intents
- below 0.5: cannot confidently classify (use unknown)

For gibberish, set confidence high (0.9+) - you ARE confident it's gibberish.
For continuation, set confidence high when there's a clear preceding question.

# Output schema (return EXACTLY this shape)

{
  "intent": "order_status" | "returns" | "product" | "account" | "general" | "gibberish" | "continuation" | "unknown",
  "confidence": 0.0-1.0,
  "entities": {
    "order_number": string | null,
    "email": string | null,
    "product_sku": string | null
  },
  "reasoning": "one short sentence explaining the classification",
  "auto_escalate": boolean,
  "escalate_reason": string | null
}`;

export interface TriageUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export async function triage(
  userMessage: string,
  previousAssistantMessage?: string | null
): Promise<TriageResult> {
  const { result } = await triageWithUsage(userMessage, previousAssistantMessage);
  return result;
}

/**
 * Same as triage(), but also returns token usage. Used by the eval runner
 * for accurate cost reporting.
 */
export async function triageWithUsage(
  userMessage: string,
  previousAssistantMessage?: string | null
): Promise<{ result: TriageResult; usage: TriageUsage }> {
  const anthropic = getAnthropic();

  const userContent = previousAssistantMessage
    ? `PREVIOUS ASSISTANT MESSAGE: ${previousAssistantMessage}\n\nCUSTOMER MESSAGE: ${userMessage}`
    : userMessage;

  const response = await anthropic.messages.create({
    model: MODELS.triage,
    max_tokens: 500,
    system: [
      {
        type: 'text',
        text: TRIAGE_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
  });

  const usage: TriageUsage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_creation_input_tokens: (response.usage as any).cache_creation_input_tokens,
    cache_read_input_tokens: (response.usage as any).cache_read_input_tokens,
  };

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Triage returned no text content');
  }

  let parsed: Omit<TriageResult, 'routed_to'>;
  try {
    const cleaned = textBlock.text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('Triage JSON parse failed', textBlock.text);
    return {
      result: {
        intent: 'unknown',
        confidence: 0,
        entities: { order_number: null, email: null, product_sku: null },
        reasoning: 'Could not parse classifier output',
        routed_to: 'general',
        auto_escalate: false,
        escalate_reason: null,
      },
      usage,
    };
  }

  return {
    result: {
      ...parsed,
      routed_to: INTENT_TO_AGENT[parsed.intent] ?? 'general',
    },
    usage,
  };
}
