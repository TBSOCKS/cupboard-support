import { triageWithUsage, type IntentCategory } from '@/lib/agents/triage';
import { runOrderStatusAgent } from '@/lib/agents/order-status';
import type { EvalCase, EvalMode } from './types';
import { computeCostCents, type ActualOutputs } from './grading';

export interface RunCaseResult {
  actual: ActualOutputs;
  reply: string | null;
  confidence: number | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  duration_ms: number;
  error: string | null;
}

/**
 * Map intent → which agent should handle it. Mirrors what the chat route does
 * but kept here so eval grading is self-contained and doesn't import from the
 * route handler.
 */
function intentToAgent(intent: IntentCategory): string {
  const map: Record<string, string> = {
    order_status: 'order_status',
    returns: 'returns',
    product: 'product',
    account: 'account',
    general: 'general',
    gibberish: 'general',
    continuation: 'general', // chat route would override based on current_agent
    unknown: 'general',
  };
  return map[intent] ?? 'general';
}

/**
 * Run a single eval case. In triage_only mode, only the triage classifier
 * runs - no specialist, no tool calls, no DB writes. In full_suite mode,
 * the routing logic and (where applicable) the Order Status specialist run.
 *
 * Note: this is a HEADLESS execution. We don't write to conversations,
 * messages, or analytics_events tables - eval runs shouldn't pollute the
 * real conversation log.
 */
export async function runCase(
  ec: EvalCase,
  mode: EvalMode
): Promise<RunCaseResult> {
  const start = Date.now();
  let input_tokens = 0;
  let output_tokens = 0;
  let cost_cents = 0;

  try {
    // ========================================================================
    // 1. TRIAGE
    // ========================================================================
    const { result: parsedTriage, usage: triageUsage } = await triageWithUsage(
      ec.customer_message,
      ec.previous_assistant_message
    );
    input_tokens += triageUsage.input_tokens;
    output_tokens += triageUsage.output_tokens;
    cost_cents += computeCostCents(
      'haiku',
      triageUsage.input_tokens,
      triageUsage.output_tokens
    );

    const intent = parsedTriage.intent;
    const confidence = parsedTriage.confidence;

    // What agent SHOULD have been routed to, based on triage rules?
    let agent: string;
    let should_escalate: boolean;

    // Mirror chat route's escalation logic
    if (parsedTriage.auto_escalate) {
      agent = 'human';
      should_escalate = true;
    } else if (intent === 'gibberish') {
      agent = 'general';
      should_escalate = false;
    } else if (intent === 'continuation') {
      // In a real run, the chat route would route back to current_agent.
      // For eval grading, we treat it as "human" since most continuation
      // test cases are post-handoff. Eval cases that test mid-specialist
      // continuation should adjust expected_agent accordingly.
      agent = 'human';
      should_escalate = true;
    } else if (confidence < 0.5) {
      agent = 'human';
      should_escalate = true;
    } else {
      agent = intentToAgent(intent);
      // Phase 2: only order_status is built. Other intents fall through
      // to handoff in the actual chat route.
      if (agent !== 'order_status' && agent !== 'general') {
        agent = 'human';
        should_escalate = true;
      } else {
        should_escalate = false;
      }
    }

    // ========================================================================
    // 2. TRIAGE-ONLY: stop here, return what we have
    // ========================================================================
    if (mode === 'triage_only') {
      return {
        actual: {
          intent,
          agent,
          tools: [],
          should_escalate,
          severity: null,
        },
        reply: null,
        confidence,
        input_tokens,
        output_tokens,
        cost_cents,
        duration_ms: Date.now() - start,
        error: null,
      };
    }

    // ========================================================================
    // 3. FULL SUITE: run the specialist if applicable
    // ========================================================================
    let tools: string[] = [];
    let severity: string | null = null;
    let reply: string | null = null;

    if (agent === 'order_status') {
      const result = await runOrderStatusAgent({
        conversationId: '00000000-0000-0000-0000-000000000000', // placeholder, never written
        userMessage: ec.customer_message,
        conversationHistory: ec.previous_assistant_message
          ? [
              {
                role: 'assistant',
                content: ec.previous_assistant_message,
              },
            ]
          : [],
        skipLogging: true,
      });

      tools = result.tool_calls.map((tc) => tc.tool);
      reply = result.reply;
      should_escalate = result.should_escalate;

      // Pull severity out of the first lookup_order result if present
      const lookupCall = result.tool_calls.find(
        (tc) => tc.tool === 'lookup_order'
      );
      if (lookupCall && lookupCall.result && typeof lookupCall.result === 'object') {
        const r = lookupCall.result as Record<string, unknown>;
        if (typeof r.severity === 'string') {
          severity = r.severity;
        }
      }

      input_tokens += result.input_tokens;
      output_tokens += result.output_tokens;
      cost_cents += computeCostCents(
        'sonnet',
        result.input_tokens,
        result.output_tokens
      );
    }

    return {
      actual: {
        intent,
        agent,
        tools,
        should_escalate,
        severity,
      },
      reply,
      confidence,
      input_tokens,
      output_tokens,
      cost_cents,
      duration_ms: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      actual: {
        intent: null,
        agent: null,
        tools: [],
        should_escalate: null,
        severity: null,
      },
      reply: null,
      confidence: null,
      input_tokens,
      output_tokens,
      cost_cents,
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ============================================================================
// (Triage with usage tracking lives in lib/agents/triage.ts as triageWithUsage)
// ============================================================================
