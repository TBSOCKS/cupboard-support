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
  const orderedAt = new Date(order.ordered_at);
  const totalWaitDays = daysBetween(now, orderedAt);

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

  // Order is meaningfully past its ETA (regardless of total wait time).
  if (status === 'delayed' && order.estimated_delivery_at) {
    const eta = new Date(order.estimated_delivery_at);
    const daysOverdue = daysBetween(now, eta);

    if (daysOverdue >= 4) {
      return {
        tier: 'high',
        reason: `${daysOverdue} day(s) past ETA, status: delayed`,
      };
    }
  }

  // Shipped/in-transit but well past ETA = stuck somewhere
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
  }

  // The customer has been waiting a long time since they ordered, regardless
  // of where the ETA currently sits. A 3-week+ wait is high-severity even if
  // the latest ETA was recently pushed.
  if (totalWaitDays >= 21 && status !== 'delivered' && status !== 'cancelled' &&
      status !== 'returned' && status !== 'refunded') {
    return {
      tier: 'high',
      reason: `Customer has been waiting ${totalWaitDays} days since ordering`,
    };
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

  // Shipped but past ETA by a small amount (1-3 days)
  if (
    (status === 'shipped' || status === 'in_transit') &&
    order.estimated_delivery_at
  ) {
    const eta = new Date(order.estimated_delivery_at);
    const daysOverdue = daysBetween(now, eta);
    if (daysOverdue >= 1) {
      return {
        tier: 'moderate',
        reason: `${daysOverdue} day(s) past ETA, still in transit`,
      };
    }
  }

  // 14-20 day wait, still in flight - moderate (would have been caught above
  // if past ETA; this is the case where ETA is still in the future but the
  // wait has gotten long)
  if (totalWaitDays >= 14 && status !== 'delivered' && status !== 'cancelled' &&
      status !== 'returned' && status !== 'refunded') {
    return {
      tier: 'moderate',
      reason: `Customer has been waiting ${totalWaitDays} days since ordering`,
    };
  }

  if (status === 'delayed') {
    return {
      tier: 'moderate',
      reason: 'Status: delayed, but within reasonable window',
    };
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
