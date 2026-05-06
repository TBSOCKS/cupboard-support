import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { runCase } from '@/lib/evals/runner';
import { gradeCase } from '@/lib/evals/grading';
import type { EvalCase, EvalMode } from '@/lib/evals/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // up to 5 min for full suites

interface RunRequest {
  mode: EvalMode;
  tag_filter?: string | null;
  prompt_version?: string | null;
  notes?: string | null;
  case_ids?: string[]; // optional - run only specific cases
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as RunRequest;
  const { mode, tag_filter, prompt_version, notes, case_ids } = body;
  const supabase = createServerClient();

  // ==========================================================================
  // 1. Fetch cases to run
  // ==========================================================================
  let query = supabase.from('eval_cases').select('*');
  if (case_ids && case_ids.length > 0) {
    query = query.in('id', case_ids);
  } else if (tag_filter) {
    query = query.contains('tags', [tag_filter]);
  }
  const { data: cases, error: casesErr } = await query;
  if (casesErr || !cases) {
    return NextResponse.json(
      { error: casesErr?.message ?? 'Failed to fetch cases' },
      { status: 500 }
    );
  }
  if (cases.length === 0) {
    return NextResponse.json(
      { error: 'No matching cases found' },
      { status: 400 }
    );
  }

  // ==========================================================================
  // 2. Create the suite_run row
  // ==========================================================================
  const startedAt = new Date();
  const { data: suiteRun, error: srErr } = await supabase
    .from('eval_suite_runs')
    .insert({
      mode,
      tag_filter: tag_filter ?? null,
      prompt_version: prompt_version ?? null,
      notes: notes ?? null,
      total_cases: cases.length,
      started_at: startedAt.toISOString(),
    })
    .select('id')
    .single();
  if (srErr || !suiteRun) {
    return NextResponse.json(
      { error: srErr?.message ?? 'Failed to create suite run' },
      { status: 500 }
    );
  }

  const suiteRunId = suiteRun.id;

  // ==========================================================================
  // 3. Run each case sequentially
  // ==========================================================================
  // Sequential is fine for 15 cases; parallel would be faster but harder to
  // reason about for cost reporting and rate-limiting.
  let passed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostCents = 0;
  const dimensionStats = {
    intent: { applicable: 0, passed: 0 },
    agent: { applicable: 0, passed: 0 },
    tools: { applicable: 0, passed: 0 },
    escalation: { applicable: 0, passed: 0 },
    severity: { applicable: 0, passed: 0 },
  };

  for (const c of cases as EvalCase[]) {
    const runResult = await runCase(c, mode);
    const grade = gradeCase(c, runResult.actual, mode);

    if (grade.overall_passed) passed++;
    totalInputTokens += runResult.input_tokens;
    totalOutputTokens += runResult.output_tokens;
    totalCostCents += runResult.cost_cents;

    // Track per-dimension accuracy
    for (const [dim, key] of [
      ['intent', 'intent_passed'],
      ['agent', 'agent_passed'],
      ['tools', 'tools_passed'],
      ['escalation', 'escalation_passed'],
      ['severity', 'severity_passed'],
    ] as const) {
      const v = grade[key];
      if (v !== null) {
        dimensionStats[dim].applicable++;
        if (v) dimensionStats[dim].passed++;
      }
    }

    await supabase.from('eval_runs').insert({
      case_id: c.id,
      suite_run_id: suiteRunId,
      mode,
      actual_intent: runResult.actual.intent,
      actual_agent: runResult.actual.agent,
      actual_tools: runResult.actual.tools,
      actual_should_escalate: runResult.actual.should_escalate,
      actual_severity: runResult.actual.severity,
      actual_reply: runResult.reply,
      actual_confidence: runResult.confidence,
      intent_passed: grade.intent_passed,
      agent_passed: grade.agent_passed,
      tools_passed: grade.tools_passed,
      escalation_passed: grade.escalation_passed,
      severity_passed: grade.severity_passed,
      overall_passed: grade.overall_passed,
      input_tokens: runResult.input_tokens,
      output_tokens: runResult.output_tokens,
      cost_cents: runResult.cost_cents,
      duration_ms: runResult.duration_ms,
      error_message: runResult.error,
    });
  }

  // ==========================================================================
  // 4. Update suite_run row with aggregates
  // ==========================================================================
  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const acc = (s: { applicable: number; passed: number }) =>
    s.applicable > 0 ? s.passed / s.applicable : null;

  await supabase
    .from('eval_suite_runs')
    .update({
      passed_cases: passed,
      intent_accuracy: acc(dimensionStats.intent),
      agent_accuracy: acc(dimensionStats.agent),
      tools_accuracy: acc(dimensionStats.tools),
      escalation_accuracy: acc(dimensionStats.escalation),
      severity_accuracy: acc(dimensionStats.severity),
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cost_cents: totalCostCents,
      duration_ms: durationMs,
      completed_at: completedAt.toISOString(),
    })
    .eq('id', suiteRunId);

  return NextResponse.json({
    suite_run_id: suiteRunId,
    total_cases: cases.length,
    passed_cases: passed,
    intent_accuracy: acc(dimensionStats.intent),
    agent_accuracy: acc(dimensionStats.agent),
    tools_accuracy: acc(dimensionStats.tools),
    escalation_accuracy: acc(dimensionStats.escalation),
    severity_accuracy: acc(dimensionStats.severity),
    total_cost_cents: totalCostCents,
    duration_ms: durationMs,
  });
}

export async function GET() {
  // List all past suite runs
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('eval_suite_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(50);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ runs: data ?? [] });
}
