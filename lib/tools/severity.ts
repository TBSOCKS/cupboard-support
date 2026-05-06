/**
 * Compute the severity of an order's situation from objective data.
 *
 * Severity drives the empathy register the agent uses:
 *   - 'low'      → no empathy beat, friendly facts
 *   - 'moderate' → light acknowledgment
 *   - 'high'     → firm validation
 *   - 'critical' → ownership posture
 *
 * The agent can override based on customer message tone (legal threats bump up,
 * "no rush" can bump down), but this gives a deterministic baseline.
 *
 * Same function will be reused in the Phase 4 dashboard for "% of critical
 * tickets escalated correctly" type analyses.
 */

export type SeverityTier = 'low' | 'moderate' | 'high' | 'critical';

export interface SeverityResult {
  tier: SeverityTier;
  reason: string;
}

interface OrderForSeverity {
  status: string;
  ordered_at: string;
  estimated_delivery_at: string | null;
  delivered_at: string | null;
  notes: string | null;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

export function computeSeverity(
  order: OrderForSeverity,
  now: Date = new Date()
): SeverityResult {
  const status = order.status.toLowerCase();

  // ==========================================================================
  // CRITICAL: ownership posture required
  // ==========================================================================
  if (status === 'lost') {
    return {
      tier: 'critical',
      reason: 'Order marked lost in transit',
    };
  }

  // Delivered but customer is contacting support about it = likely a non-receipt
  // dispute. Severity is determined by the conversation, not the data alone, but
  // we flag it so the agent knows to take ownership posture if the customer
  // says they didn't receive it.
  if (status === 'delivered' && order.delivered_at) {
    const delivered = new Date(order.delivered_at);
    const daysSince = daysBetween(now, delivered);
    if (daysSince <= 14) {
      // Recent delivery - if customer is asking about it, likely a dispute
      return {
        tier: 'low',
        reason: `Delivered ${daysSince} day(s) ago. If customer disputes receipt, treat as critical.`,
      };
    }
    return { tier: 'low', reason: 'Order delivered, no apparent issue' };
  }

  // ==========================================================================
  // HIGH: firm validation required
  // ==========================================================================
  if (status === 'delayed' && order.estimated_delivery_at) {
    const eta = new Date(order.estimated_delivery_at);
    const daysOverdue = daysBetween(now, eta);

    if (daysOverdue >= 4) {
      return {
        tier: 'high',
        reason: `${daysOverdue} day(s) past original ETA, status: delayed`,
      };
    }
  }

  // Address verification holds tend to drag - flag as high
  if (
    order.notes &&
    /address verification|address correction/i.test(order.notes)
  ) {
    return {
      tier: 'high',
      reason: 'Carrier hold for address verification - tends to take days to resolve',
    };
  }

  // ==========================================================================
  // MODERATE: light acknowledgment
  // ==========================================================================
  if (status === 'delayed') {
    return {
      tier: 'moderate',
      reason: 'Status: delayed, but within reasonable window',
    };
  }

  // Shipped but past ETA by a small amount
  if (
    (status === 'shipped' || status === 'in_transit') &&
    order.estimated_delivery_at
  ) {
    const eta = new Date(order.estimated_delivery_at);
    const daysOverdue = daysBetween(now, eta);
    if (daysOverdue >= 4) {
      return {
        tier: 'high',
        reason: `${daysOverdue} day(s) past ETA, still in transit`,
      };
    }
    if (daysOverdue >= 1) {
      return {
        tier: 'moderate',
        reason: `${daysOverdue} day(s) past ETA, still in transit`,
      };
    }
  }

  // ==========================================================================
  // LOW: no empathy beat
  // ==========================================================================
  if (status === 'shipped' || status === 'in_transit') {
    return { tier: 'low', reason: 'On track, in transit' };
  }
  if (status === 'processing' || status === 'pending') {
    return { tier: 'low', reason: 'Order being processed normally' };
  }

  // Cancelled, returned, refunded - typically not problem cases at this stage
  if (status === 'cancelled' || status === 'returned' || status === 'refunded') {
    return { tier: 'low', reason: `Order is ${status}` };
  }

  // Fallthrough
  return { tier: 'low', reason: 'No issues detected' };
}
