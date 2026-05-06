import { createServerClient } from '@/lib/supabase';

/**
 * Each function here returns the data shape for one dashboard widget.
 * Queries are run server-side via the service role key so we don't worry
 * about RLS. The dashboard API route fans out to all of these in parallel.
 *
 * Note on cost: every dashboard load runs ~6 queries against Supabase.
 * Free tier handles this fine. If we ever scaled this, we'd materialize
 * the aggregates into a daily-rollup table.
 */

// ============================================================================
// Widget 1: Volume by intent over time
// ============================================================================
export interface VolumeByIntentRow {
  date: string; // YYYY-MM-DD
  order_status: number;
  returns: number;
  product: number;
  general: number;
  account: number;
  gibberish: number;
  unknown: number;
}

export async function getVolumeByIntent(
  daysBack = 30
): Promise<VolumeByIntentRow[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  const { data, error } = await supabase
    .from('analytics_events')
    .select('intent_category, created_at')
    .eq('event_type', 'triage_classification')
    .gte('created_at', since)
    .limit(10000);

  if (error || !data) return [];

  // Bucket by date + intent
  const buckets: Record<string, Record<string, number>> = {};
  for (const ev of data) {
    const date = ev.created_at.slice(0, 10);
    const intent = ev.intent_category ?? 'unknown';
    if (!buckets[date]) buckets[date] = {};
    buckets[date][intent] = (buckets[date][intent] ?? 0) + 1;
  }

  // Fill in every day in the window so the chart isn't gappy
  const rows: VolumeByIntentRow[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const b = buckets[d] ?? {};
    rows.push({
      date: d,
      order_status: b['order_status'] ?? 0,
      returns: b['returns'] ?? 0,
      product: b['product'] ?? 0,
      general: b['general'] ?? 0,
      account: b['account'] ?? 0,
      gibberish: b['gibberish'] ?? 0,
      unknown: b['unknown'] ?? 0,
    });
  }
  return rows;
}

// ============================================================================
// Widget 2: Deflection rate by agent
// ============================================================================
export interface DeflectionRow {
  agent: string;
  total: number;
  deflected: number;
  rate: number; // 0.0 to 1.0
}

export async function getDeflectionByAgent(
  daysBack = 30
): Promise<DeflectionRow[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  // Get every conversation that was routed to a specialist.
  // Set limit explicitly - Supabase defaults to 1000.
  const { data: routed } = await supabase
    .from('analytics_events')
    .select('conversation_id, agent')
    .eq('event_type', 'agent_routed')
    .gte('created_at', since)
    .limit(10000);

  if (!routed) return [];

  // Fetch ALL conversations in the time window directly. Avoids the URL
  // length issue that comes from passing many IDs in an .in() clause.
  const { data: convos } = await supabase
    .from('conversations')
    .select('id, status')
    .gte('started_at', since)
    .limit(10000);

  if (!convos) return [];

  const convoStatus: Record<string, string> = {};
  for (const c of convos) convoStatus[c.id] = c.status;

  const buckets: Record<string, { total: number; deflected: number }> = {};
  for (const r of routed) {
    if (!buckets[r.agent!]) buckets[r.agent!] = { total: 0, deflected: 0 };
    buckets[r.agent!].total++;
    const status = convoStatus[r.conversation_id];
    if (status === 'resolved') buckets[r.agent!].deflected++;
  }

  return Object.entries(buckets)
    .map(([agent, b]) => ({
      agent,
      total: b.total,
      deflected: b.deflected,
      rate: b.total > 0 ? b.deflected / b.total : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// ============================================================================
// Widget 3: Escalation reason breakdown
// ============================================================================
export interface EscalationReasonRow {
  reason: string;
  count: number;
  percent: number;
}

export async function getEscalationReasons(
  daysBack = 30
): Promise<EscalationReasonRow[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  const { data } = await supabase
    .from('analytics_events')
    .select('reason')
    .in('event_type', ['escalation_triggered', 'handoff_to_human'])
    .gte('created_at', since)
    .not('reason', 'is', null)
    .limit(10000);

  if (!data) return [];

  const counts: Record<string, number> = {};
  for (const r of data) {
    const reason = r.reason ?? 'unknown';
    counts[reason] = (counts[reason] ?? 0) + 1;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .map(([reason, count]) => ({
      reason,
      count,
      percent: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// ============================================================================
// Widget 4: Average duration by agent (deflected vs escalated)
// ============================================================================
export interface DurationRow {
  agent: string;
  deflected_avg_minutes: number | null;
  escalated_avg_minutes: number | null;
  deflected_count: number;
  escalated_count: number;
}

export async function getDurationByAgent(
  daysBack = 30
): Promise<DurationRow[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  const { data: convos } = await supabase
    .from('conversations')
    .select('id, current_agent, status, started_at, ended_at')
    .gte('started_at', since)
    .not('ended_at', 'is', null)
    .limit(10000);

  if (!convos) return [];

  // Get the routed agent for each (final agent in conversations might be 'human'
  // even when it was originally routed elsewhere)
  const { data: routed } = await supabase
    .from('analytics_events')
    .select('conversation_id, agent')
    .eq('event_type', 'agent_routed')
    .gte('created_at', since)
    .limit(10000);

  const routedAgent: Record<string, string> = {};
  for (const r of routed ?? []) routedAgent[r.conversation_id] = r.agent!;

  const buckets: Record<
    string,
    { deflected: number[]; escalated: number[] }
  > = {};

  for (const c of convos) {
    const agent = routedAgent[c.id] ?? c.current_agent ?? 'unknown';
    if (!buckets[agent]) buckets[agent] = { deflected: [], escalated: [] };
    const durMs =
      new Date(c.ended_at!).getTime() - new Date(c.started_at).getTime();
    const durMin = durMs / 60_000;
    if (c.status === 'resolved') {
      buckets[agent].deflected.push(durMin);
    } else if (c.status === 'escalated_to_human') {
      buckets[agent].escalated.push(durMin);
    }
  }

  const avg = (a: number[]) => (a.length === 0 ? null : a.reduce((x, y) => x + y, 0) / a.length);

  return Object.entries(buckets)
    .map(([agent, b]) => ({
      agent,
      deflected_avg_minutes: avg(b.deflected),
      escalated_avg_minutes: avg(b.escalated),
      deflected_count: b.deflected.length,
      escalated_count: b.escalated.length,
    }))
    .filter((r) => r.deflected_count + r.escalated_count > 0)
    .sort((a, b) => b.deflected_count + b.escalated_count - (a.deflected_count + a.escalated_count));
}

// ============================================================================
// Widget 5: Tool call success rate
// ============================================================================
export interface ToolCallRow {
  tool: string;
  succeeded: number;
  failed: number;
  total: number;
  failure_rate: number;
}

export async function getToolCallStats(
  daysBack = 30
): Promise<ToolCallRow[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  const { data } = await supabase
    .from('analytics_events')
    .select('event_type, metadata')
    .in('event_type', ['tool_succeeded', 'tool_failed'])
    .gte('created_at', since)
    .limit(10000);

  if (!data) return [];

  const buckets: Record<string, { succeeded: number; failed: number }> = {};
  for (const r of data) {
    const meta = r.metadata as Record<string, unknown> | null;
    const tool = (meta?.tool as string) ?? 'unknown';
    if (!buckets[tool]) buckets[tool] = { succeeded: 0, failed: 0 };
    if (r.event_type === 'tool_succeeded') buckets[tool].succeeded++;
    else buckets[tool].failed++;
  }

  return Object.entries(buckets)
    .map(([tool, b]) => ({
      tool,
      succeeded: b.succeeded,
      failed: b.failed,
      total: b.succeeded + b.failed,
      failure_rate:
        b.succeeded + b.failed > 0 ? b.failed / (b.succeeded + b.failed) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// ============================================================================
// Widget 6: Deflection opportunity ranking
// ============================================================================
// volume × handoff_rate, ranked. The CX leadership memo widget.
export interface DeflectionOpportunityRow {
  intent: string;
  volume: number;
  handoff_rate: number;
  opportunity_score: number; // volume * handoff_rate
  deflected_count: number;
  escalated_count: number;
}

export async function getDeflectionOpportunities(
  daysBack = 30
): Promise<DeflectionOpportunityRow[]> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  // Get every triage classification with conversation_id
  const { data: classifications } = await supabase
    .from('analytics_events')
    .select('conversation_id, intent_category')
    .eq('event_type', 'triage_classification')
    .gte('created_at', since)
    .limit(10000);

  if (!classifications) return [];

  // Fetch ALL conversations in the time window. Avoids URL length truncation
  // when there are many IDs.
  const { data: convos } = await supabase
    .from('conversations')
    .select('id, status')
    .gte('started_at', since)
    .limit(10000);

  const convoStatus: Record<string, string> = {};
  for (const c of convos ?? []) convoStatus[c.id] = c.status;

  const buckets: Record<
    string,
    { total: number; deflected: number; escalated: number }
  > = {};
  for (const cls of classifications) {
    const intent = cls.intent_category ?? 'unknown';
    if (!buckets[intent]) buckets[intent] = { total: 0, deflected: 0, escalated: 0 };
    buckets[intent].total++;
    const status = convoStatus[cls.conversation_id];
    if (status === 'resolved') buckets[intent].deflected++;
    else if (status === 'escalated_to_human') buckets[intent].escalated++;
  }

  return Object.entries(buckets)
    .map(([intent, b]) => {
      const handoff_rate = b.total > 0 ? b.escalated / b.total : 0;
      return {
        intent,
        volume: b.total,
        handoff_rate,
        opportunity_score: b.total * handoff_rate,
        deflected_count: b.deflected,
        escalated_count: b.escalated,
      };
    })
    .filter((r) => r.volume > 0)
    .sort((a, b) => b.opportunity_score - a.opportunity_score);
}

// ============================================================================
// Headline numbers (top of dashboard)
// ============================================================================
export interface HeadlineNumbers {
  total_conversations: number;
  total_deflected: number;
  total_escalated: number;
  overall_deflection_rate: number;
  days_window: number;
}

export async function getHeadlineNumbers(
  daysBack = 30
): Promise<HeadlineNumbers> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  const { data: convos } = await supabase
    .from('conversations')
    .select('status')
    .gte('started_at', since)
    .limit(10000);

  if (!convos) {
    return {
      total_conversations: 0,
      total_deflected: 0,
      total_escalated: 0,
      overall_deflection_rate: 0,
      days_window: daysBack,
    };
  }

  const total = convos.length;
  const deflected = convos.filter((c) => c.status === 'resolved').length;
  const escalated = convos.filter(
    (c) => c.status === 'escalated_to_human'
  ).length;

  return {
    total_conversations: total,
    total_deflected: deflected,
    total_escalated: escalated,
    overall_deflection_rate: total > 0 ? deflected / total : 0,
    days_window: daysBack,
  };
}
