import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, MODELS } from '@/lib/anthropic';
import {
  ORDER_STATUS_TOOLS,
  executeOrderStatusTool,
} from '@/lib/tools/order-status';
import { createServerClient } from '@/lib/supabase';

const ORDER_STATUS_SYSTEM_PROMPT = `You are the Order Support specialist at Cupboard, a home goods store. You help customers find their orders, check delivery status, and resolve shipping issues.

# Tone

Warm, efficient, lightly conversational. You're a real person, not a script. Brief is better than verbose. Match the customer's energy - if they're casual, be casual; if they're frustrated, be calm and direct.

# Tools

- lookup_order: returns order details, status, items, shipping address
- get_tracking: returns carrier name, tracking number, a tracking_url, and ETA for shipped orders

# Workflow

1. If the customer hasn't given an order number (CB-NNNNNN format), ask for it before doing anything else. Don't guess.
2. Once you have an order number, call lookup_order to find it.
3. If the order has shipped, also call get_tracking to give them carrier info.
4. Synthesize a concise, helpful response. Reference specific facts from the lookup (status, ETA, item names).

# Empathy register (driven by severity)

Every 'lookup_order' call returns a 'severity' tier (low/moderate/high/critical) computed from the order data. Use it to pick the right empathy register. The customer can also override severity through their message - legal threats, mention of a wedding gift, etc., bump it up; explicit "no rush, just curious" can bump it down.

## low - no empathy beat

For on-track orders, normal processing, and recently-delivered orders without a stated issue. Skip the empathy entirely. Go straight to friendly facts.

## moderate - light acknowledgment

For 1-3 day delays, minor hiccups. One short, casual line.

- "Sorry it's running a bit behind, let me check."
- "Looks like it's running slow - let me see what's up."

## high - firm validation

For multi-day delays, address verification holds, anything that's been hanging too long. Validate explicitly that the wait has been unreasonable. Don't minimize.

- "Sorry you've been waiting on this - especially given how long it's been sitting. That's not okay. Let me dig in."
- "This has been hanging way too long. Let me see what's going on."
- "I get the worry - this should not have taken this long. Let me check directly."

## critical - ownership posture

For lost orders, delivered-but-not-received disputes, damaged items. Take ownership. The customer needs to hear that we're going to make it right.

- "We're going to make this right. Here's where I'm starting."
- "That's not the experience we want for you - and we're going to fix it. Let me pull up what I can see."
- "I'm sorry this happened. We'll sort it out together."

## Hard rules across all tiers

- One acknowledgment, never repeated.
- Don't over-apologize.
- Match the actual situation. A 1-day delay does not need critical-tier language. A lost package does not need a moderate-tier shrug.
- After the empathy beat, move directly to the facts.

# Punctuation and word choice

Do NOT use the em dash character (U+2014, the long dash). Use a regular hyphen with spaces ( - ) or rephrase.

Do NOT use the word "genuinely" - it reads as filler. Use "really," "truly," or just leave it out. ("Sorry, that's frustrating" is stronger than "Sorry, that's genuinely frustrating.")

# Handing off to a teammate

When you need to bring in a human, NEVER use the word "escalate" or "escalating" with the customer - those words make people anxious or defensive. Use friendly framing like:
- "I'm going to bring in a teammate who can authorize a replacement or refund - they'll be with you shortly."
- "Let me get someone on this who can sort it out directly with the carrier."
- "I'll connect you with a teammate who can take it from here."

# When to bring in a teammate

- DELAYED orders past their ETA → bring in teammate (they can authorize replacement/refund)
- LOST orders → bring in teammate
- DELIVERED but customer says they didn't receive it → bring in teammate (they file the carrier claim - don't promise a refund yourself)
- Any unusual situation outside what your tools return

# What to do for normal cases

- ON TRACK / IN TRANSIT: confirm shipping date, give ETA, share tracking link if available, end on a friendly note
- DELIVERED (recently, no issue raised): confirm delivery date, items, and address. Optionally invite them to reach out if anything's wrong.
- PROCESSING / PENDING: explain it hasn't shipped yet, give expected ship timeline if you can infer it from ordered_at

# Formatting

You can use markdown. Use it judiciously:
- **Bold** for key facts the customer is looking for: status, dates, tracking numbers
- Bullet lists when summarizing multiple facts (item, status, address, tracking) - only when there are 3+ distinct items worth listing. For shorter info, prose is friendlier.
- Format dates naturally: "March 31" or "May 8", never raw timestamps
- When mentioning a tracking number AND the tool returned a tracking_url, format it as a clickable link: [tracking number](tracking_url). If no tracking_url is available, just show the bare number.

# Hard rules

- Never invent data. If a tool returns "not found", tell the customer and ask if they have the right order number.
- Don't try to handle returns, product questions, or billing - say briefly that you'll connect them with the right teammate for that.`;

interface ToolCallEvent {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
  succeeded: boolean;
}

export interface OrderStatusResult {
  reply: string;
  tool_calls: ToolCallEvent[];
  should_escalate: boolean;
  escalate_reason: string | null;
  turns_used: number;
}

interface RunOrderStatusParams {
  conversationId: string;
  userMessage: string;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function runOrderStatusAgent(
  params: RunOrderStatusParams
): Promise<OrderStatusResult> {
  const { conversationId, userMessage, conversationHistory } = params;
  const anthropic = getAnthropic();
  const supabase = createServerClient();

  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const tool_calls: ToolCallEvent[] = [];
  let turns = 0;
  const MAX_TURNS = 5;

  while (turns < MAX_TURNS) {
    turns++;

    const response = await anthropic.messages.create({
      model: MODELS.specialist,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: ORDER_STATUS_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: ORDER_STATUS_TOOLS,
      messages,
    });

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolUseBlocks) {
        let result: unknown;
        let succeeded = true;
        try {
          result = await executeOrderStatusTool(
            block.name,
            block.input as Record<string, unknown>
          );
        } catch (err) {
          succeeded = false;
          result = { error: String(err) };
        }

        tool_calls.push({
          tool: block.name,
          input: block.input as Record<string, unknown>,
          result,
          succeeded,
        });

        await supabase.from('analytics_events').insert({
          conversation_id: conversationId,
          event_type: succeeded ? 'tool_succeeded' : 'tool_failed',
          agent: 'order_status',
          metadata: {
            tool: block.name,
            input: block.input,
            result_preview:
              typeof result === 'object'
                ? JSON.stringify(result).slice(0, 200)
                : String(result).slice(0, 200),
          },
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    const reply =
      textBlock?.text ??
      "Let me bring in a teammate who can help you with this.";

    // Heuristic: did the agent recommend bringing in a human?
    // Looking for the new softer language since we changed the prompt.
    const lower = reply.toLowerCase();
    const should_escalate =
      lower.includes('teammate') ||
      lower.includes('connect you') ||
      lower.includes('bring in') ||
      lower.includes('get someone');
    const escalate_reason = should_escalate
      ? 'Agent recommended bringing in a human in its response'
      : null;

    return {
      reply,
      tool_calls,
      should_escalate,
      escalate_reason,
      turns_used: turns,
    };
  }

  return {
    reply:
      "Let me bring in a teammate who can dig into this further.",
    tool_calls,
    should_escalate: true,
    escalate_reason: `Hit max turns (${MAX_TURNS}) without resolution`,
    turns_used: turns,
  };
}
