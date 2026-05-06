import { createServerClient } from '@/lib/supabase';
import type Anthropic from '@anthropic-ai/sdk';
import { checkEligibility, type EligibilityVerdict } from '@/lib/tools/returns-eligibility';

// ============================================================================
// TOOL SCHEMAS
// ============================================================================

export const RETURNS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'check_return_eligibility',
    description:
      'Check whether an order is eligible for return under the 30-day policy. Returns a verdict, the days since delivery, and whether the agent can self-serve the return or needs to bring in a teammate. Pass the customer\'s reason for the return if they\'ve given one - "damaged", "broken", or similar will route through teammate review even within the window. Use this BEFORE initiate_return.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: {
          type: 'string',
          description: 'Order number, format CB-NNNNNN',
        },
        reason: {
          type: 'string',
          description:
            'The customer\'s reason for wanting to return, if stated. Pass null if no reason given.',
        },
      },
      required: ['order_number'],
    },
  },
  {
    name: 'initiate_return',
    description:
      'Initiate a return for an order that has been confirmed eligible for self-serve via check_return_eligibility. ONLY call this when verdict was "eligible_self_serve" - never call for "eligible_needs_human" or any other verdict. Records the return in the system and generates a return shipping label URL.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: {
          type: 'string',
          description: 'Order number, format CB-NNNNNN',
        },
        reason: {
          type: 'string',
          description: 'Brief description of why the customer is returning',
        },
      },
      required: ['order_number', 'reason'],
    },
  },
  {
    name: 'check_refund_status',
    description:
      'Look up the status of an existing return/refund. Use when a customer asks "where is my refund" or "did my return go through". Returns the return status (initiated/received/refunded), expected refund date, and refund amount.',
    input_schema: {
      type: 'object',
      properties: {
        order_number: {
          type: 'string',
          description: 'Order number, format CB-NNNNNN',
        },
      },
      required: ['order_number'],
    },
  },
];

// ============================================================================
// TOOL EXECUTORS
// ============================================================================

function normalizeOrderNumber(input: string): string {
  const stripped = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return stripped.startsWith('CB') ? `CB-${stripped.slice(2)}` : `CB-${stripped}`;
}

interface CheckEligibilityResult {
  found: boolean;
  order_number?: string;
  verdict?: EligibilityVerdict;
  reason?: string;
  days_since_delivery?: number | null;
  within_policy_window?: boolean;
  delivered_at?: string | null;
  total_dollars?: string;
  error?: string;
}

export async function check_return_eligibility(
  order_number: string,
  reason: string | null
): Promise<CheckEligibilityResult> {
  const supabase = createServerClient();
  const formatted = normalizeOrderNumber(order_number);

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'order_number, status, delivered_at, return_status, total_cents'
    )
    .eq('order_number', formatted)
    .maybeSingle();

  if (error) {
    return { found: false, error: 'Database error during eligibility check' };
  }
  if (!order) {
    return { found: false, error: `No order found with number ${formatted}` };
  }

  const result = checkEligibility(
    {
      status: order.status,
      delivered_at: order.delivered_at,
      return_status: order.return_status,
    },
    reason
  );

  return {
    found: true,
    order_number: order.order_number,
    verdict: result.verdict,
    reason: result.reason,
    days_since_delivery: result.days_since_delivery,
    within_policy_window: result.within_policy_window,
    delivered_at: order.delivered_at,
    total_dollars: `$${(order.total_cents / 100).toFixed(2)}`,
  };
}

interface InitiateReturnResult {
  success: boolean;
  order_number?: string;
  return_initiated_at?: string;
  return_label_url?: string;
  refund_expected_by?: string;
  refund_amount_dollars?: string;
  error?: string;
}

export async function initiate_return(
  order_number: string,
  reason: string
): Promise<InitiateReturnResult> {
  const supabase = createServerClient();
  const formatted = normalizeOrderNumber(order_number);

  // Re-check eligibility server-side as a safety net. The agent prompt tells
  // it to only call this on eligible_self_serve, but we don't trust prompts
  // for write operations.
  const { data: order } = await supabase
    .from('orders')
    .select('status, delivered_at, return_status, total_cents')
    .eq('order_number', formatted)
    .maybeSingle();

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  const eligibility = checkEligibility(
    {
      status: order.status,
      delivered_at: order.delivered_at,
      return_status: order.return_status,
    },
    reason
  );

  if (eligibility.verdict !== 'eligible_self_serve') {
    return {
      success: false,
      error: `Cannot self-serve initiate this return: ${eligibility.reason}`,
    };
  }

  // Set up the return
  const now = new Date();
  const refundExpectedBy = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const labelUrl = `https://example.com/returns/label/${formatted}`;

  const { error: updateErr } = await supabase
    .from('orders')
    .update({
      return_initiated_at: now.toISOString(),
      return_status: 'initiated',
      return_reason: reason,
      return_refund_expected_by: refundExpectedBy.toISOString().slice(0, 10),
      return_label_url: labelUrl,
    })
    .eq('order_number', formatted);

  if (updateErr) {
    return { success: false, error: 'Failed to record return' };
  }

  return {
    success: true,
    order_number: formatted,
    return_initiated_at: now.toISOString(),
    return_label_url: labelUrl,
    refund_expected_by: refundExpectedBy.toISOString().slice(0, 10),
    refund_amount_dollars: `$${(order.total_cents / 100).toFixed(2)}`,
  };
}

interface CheckRefundStatusResult {
  found: boolean;
  order_number?: string;
  has_return?: boolean;
  return_status?: string | null;
  return_initiated_at?: string | null;
  return_reason?: string | null;
  refund_expected_by?: string | null;
  return_label_url?: string | null;
  refund_amount_dollars?: string;
  error?: string;
}

export async function check_refund_status(
  order_number: string
): Promise<CheckRefundStatusResult> {
  const supabase = createServerClient();
  const formatted = normalizeOrderNumber(order_number);

  const { data: order, error } = await supabase
    .from('orders')
    .select(
      'order_number, return_status, return_initiated_at, return_reason, return_refund_expected_by, return_label_url, total_cents'
    )
    .eq('order_number', formatted)
    .maybeSingle();

  if (error) {
    return { found: false, error: 'Database error during refund lookup' };
  }
  if (!order) {
    return { found: false, error: `No order found with number ${formatted}` };
  }

  if (!order.return_status) {
    return {
      found: true,
      order_number: order.order_number,
      has_return: false,
    };
  }

  return {
    found: true,
    order_number: order.order_number,
    has_return: true,
    return_status: order.return_status,
    return_initiated_at: order.return_initiated_at,
    return_reason: order.return_reason,
    refund_expected_by: order.return_refund_expected_by,
    return_label_url: order.return_label_url,
    refund_amount_dollars: `$${(order.total_cents / 100).toFixed(2)}`,
  };
}

// ============================================================================
// DISPATCHER
// ============================================================================

export async function executeReturnsTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  if (name === 'check_return_eligibility') {
    return await check_return_eligibility(
      input.order_number as string,
      (input.reason as string) ?? null
    );
  }
  if (name === 'initiate_return') {
    return await initiate_return(
      input.order_number as string,
      input.reason as string
    );
  }
  if (name === 'check_refund_status') {
    return await check_refund_status(input.order_number as string);
  }
  throw new Error(`Unknown returns tool: ${name}`);
}
