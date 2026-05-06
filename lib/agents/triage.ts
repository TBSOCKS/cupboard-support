import { getAnthropic, MODELS } from '@/lib/anthropic';
import type { AgentName } from '@/types';

export type IntentCategory =
  | 'order_status'
  | 'returns'
  | 'product'
  | 'account'
  | 'general'
  | 'gibberish'
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

// Map intent → specialist agent. 'gibberish' has no specialist -
// the chat route handles it with a special playful response.
const INTENT_TO_AGENT: Record<IntentCategory, AgentName> = {
  order_status: 'order_status',
  returns: 'returns',
  product: 'product',
  account: 'account',
  general: 'general',
  gibberish: 'general', // unused - chat route intercepts before routing
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
- unknown: a real attempt to communicate that you cannot confidently classify into any of the above

# Auto-escalate to a human (set auto_escalate=true) if the message contains any of:

- explicit request for a human, agent, manager, supervisor, person, or representative
- legal threats: lawsuit, attorney, BBB, sue, lawyer
- charge disputes or fraud claims
- threats, abuse, or extremely angry/profane language
- mentions of injury, damage to property, or safety issues

Do NOT auto-escalate for gibberish - that's handled separately.

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

For gibberish, set confidence high (0.9+) - you ARE confident it's gibberish, just like you'd be confident about any other classification.

# Output schema (return EXACTLY this shape)

{
  "intent": "order_status" | "returns" | "product" | "account" | "general" | "gibberish" | "unknown",
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

export async function triage(userMessage: string): Promise<TriageResult> {
  const anthropic = getAnthropic();

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
    messages: [{ role: 'user', content: userMessage }],
  });

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
      intent: 'unknown',
      confidence: 0,
      entities: { order_number: null, email: null, product_sku: null },
      reasoning: 'Could not parse classifier output',
      routed_to: 'general',
      auto_escalate: false,
      escalate_reason: null,
    };
  }

  return {
    ...parsed,
    routed_to: INTENT_TO_AGENT[parsed.intent] ?? 'general',
  };
}
