import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropic, MODELS } from '@/lib/anthropic';
import {
  ORDER_STATUS_TOOLS,
  executeOrderStatusTool,
} from '@/lib/tools/order-status';
import { createServerClient } from '@/lib/supabase';

const ORDER_STATUS_SYSTEM_PROMPT = `You are the Order Support specialist at Cupboard, a home goods store. You help customers find their orders, check delivery status, and resolve shipping issues.

Your tone: warm, efficient, lightly conversational. You're a real person, not a script. Brief is better than verbose.

You have two tools:
- lookup_order: returns order details, status, items, shipping address
- get_tracking: returns carrier name and tracking number for shipped orders

Workflow:
1. If the customer hasn't given an order number (CB-NNNNNN format), ask for it before doing anything else. Don't guess.
2. Once you have an order number, call lookup_order to find it.
3. If the order has shipped, also call get_tracking to give them carrier info.
4. Synthesize a concise, helpful response. Reference specific facts from the lookup (status, ETA, item names).

Important rules:
- Never invent information. If a tool returns "not found", tell the customer and offer next steps.
- For DELAYED, LOST, or problematic orders: acknowledge the issue, share what you know, and tell them you're escalating to a human specialist who can authorize a replacement or refund.
- For DELIVERED orders where the customer says they didn't receive it: do not promise a refund. Tell them you'll connect them with a specialist who can file a carrier claim.
- Don't apologize excessively. One acknowledgment is enough.
- If the customer's question is clearly outside order tracking (returns, products, billing), say so briefly and let them know you'll route them to the right person — don't try to answer it yourself.

Format dates naturally. "Estimated to arrive May 8" not "2026-05-08T00:00:00Z".`;

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

    // If Claude wants to use tools, run them and loop
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      );

      // Add the assistant's tool-use turn to messages
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool call and build the tool_result message
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

        // Log to analytics_events
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
      continue; // loop back for Claude to read tool results
    }

    // Otherwise we have a final text response
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    const reply = textBlock?.text ?? "I'm sorry — let me connect you with someone who can help.";

    // Heuristic: should we escalate based on the conversation?
    const lower = reply.toLowerCase();
    const should_escalate =
      lower.includes('escalat') ||
      lower.includes('connect you') ||
      lower.includes('specialist') ||
      lower.includes('human');
    const escalate_reason = should_escalate
      ? 'Agent recommended escalation in its response'
      : null;

    return {
      reply,
      tool_calls,
      should_escalate,
      escalate_reason,
      turns_used: turns,
    };
  }

  // Hit max turns without resolution — escalate
  return {
    reply:
      "I'm having trouble resolving this — let me connect you with a specialist who can dig in further.",
    tool_calls,
    should_escalate: true,
    escalate_reason: `Hit max turns (${MAX_TURNS}) without resolution`,
    turns_used: turns,
  };
}
