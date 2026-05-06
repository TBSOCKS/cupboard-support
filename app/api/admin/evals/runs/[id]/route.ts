import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();

  const { data: suiteRun, error: srErr } = await supabase
    .from('eval_suite_runs')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (srErr) {
    return NextResponse.json({ error: srErr.message }, { status: 500 });
  }
  if (!suiteRun) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: runs, error: rErr } = await supabase
    .from('eval_runs')
    .select(
      `
      *,
      case:eval_cases (id, name, description, customer_message, previous_assistant_message, expected_intent, expected_agent, expected_tools, expected_should_escalate, expected_severity, tags)
      `
    )
    .eq('suite_run_id', params.id)
    .order('created_at', { ascending: true });

  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  return NextResponse.json({ suite_run: suiteRun, runs: runs ?? [] });
}
