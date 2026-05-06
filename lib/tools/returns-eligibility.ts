/**
 * Determine whether an order is eligible for return under Cupboard's standard
 * 30-day policy, AND whether the agent can authorize the return without human
 * approval.
 *
 * Cupboard policy (mirrors the policy doc in seed):
 * - Standard returns: within 30 days of delivery, item unused, original packaging
 * - Outside 30 days: not eligible (escalate)
 * - Damaged on arrival: eligible regardless of timing, but agent CANNOT
 *   authorize (escalate to teammate who can verify damage)
 * - Already initiated/received/refunded: not re-eligible (status check, not new return)
 * - Cancelled orders: nothing to return
 * - Orders that haven't been delivered: nothing to return yet
 */

export type EligibilityVerdict =
  | 'eligible_self_serve'
  | 'eligible_needs_human'
  | 'not_eligible_outside_window'
  | 'not_eligible_already_returned'
  | 'not_eligible_not_delivered'
  | 'not_eligible_other';

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  reason: string;
  days_since_delivery: number | null;
  within_policy_window: boolean;
}

interface OrderForEligibility {
  status: string;
  delivered_at: string | null;
  return_status: string | null;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const POLICY_WINDOW_DAYS = 30;

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

export function checkEligibility(
  order: OrderForEligibility,
  reason: string | null,
  now: Date = new Date()
): EligibilityResult {
  // ==========================================================================
  // Already has a return in progress
  // ==========================================================================
  if (order.return_status) {
    return {
      verdict: 'not_eligible_already_returned',
      reason: `A return is already ${order.return_status} for this order`,
      days_since_delivery: null,
      within_policy_window: false,
    };
  }

  // ==========================================================================
  // Order needs to actually be delivered to be returnable
  // ==========================================================================
  const status = order.status.toLowerCase();
  if (status === 'cancelled') {
    return {
      verdict: 'not_eligible_other',
      reason: 'Order was cancelled and never shipped',
      days_since_delivery: null,
      within_policy_window: false,
    };
  }
  if (status !== 'delivered' || !order.delivered_at) {
    return {
      verdict: 'not_eligible_not_delivered',
      reason: 'Order has not been delivered yet',
      days_since_delivery: null,
      within_policy_window: false,
    };
  }

  // ==========================================================================
  // Damage claims always need a human regardless of timing
  // ==========================================================================
  if (reason && /damag|broken|defect|crack|tear|stain/i.test(reason)) {
    const daysSince = daysBetween(now, new Date(order.delivered_at));
    return {
      verdict: 'eligible_needs_human',
      reason: 'Damage claims require teammate review (photos, replacement options)',
      days_since_delivery: daysSince,
      within_policy_window: daysSince <= POLICY_WINDOW_DAYS,
    };
  }

  // ==========================================================================
  // Standard 30-day policy
  // ==========================================================================
  const delivered = new Date(order.delivered_at);
  const daysSince = daysBetween(now, delivered);

  if (daysSince > POLICY_WINDOW_DAYS) {
    return {
      verdict: 'not_eligible_outside_window',
      reason: `${daysSince} days since delivery, outside our 30-day return window`,
      days_since_delivery: daysSince,
      within_policy_window: false,
    };
  }

  return {
    verdict: 'eligible_self_serve',
    reason: `${daysSince} days since delivery, within 30-day return window`,
    days_since_delivery: daysSince,
    within_policy_window: true,
  };
}
