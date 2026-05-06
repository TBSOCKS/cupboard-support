import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('eval_cases')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ cases: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  const { data, error } = await supabase
    .from('eval_cases')
    .insert({
      name: body.name,
      description: body.description ?? null,
      customer_message: body.customer_message,
      previous_assistant_message: body.previous_assistant_message ?? null,
      previous_agent: body.previous_agent ?? null,
      expected_intent: body.expected_intent ?? null,
      expected_agent: body.expected_agent ?? null,
      expected_tools: body.expected_tools ?? [],
      expected_should_escalate: body.expected_should_escalate ?? null,
      expected_severity: body.expected_severity ?? null,
      context_order_number: body.context_order_number ?? null,
      tags: body.tags ?? [],
    })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ case: data });
}

export async function PUT(req: NextRequest) {
  const supabase = createServerClient();
  const body = await req.json();
  if (!body.id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('eval_cases')
    .update({
      name: body.name,
      description: body.description,
      customer_message: body.customer_message,
      previous_assistant_message: body.previous_assistant_message,
      previous_agent: body.previous_agent ?? null,
      expected_intent: body.expected_intent,
      expected_agent: body.expected_agent,
      expected_tools: body.expected_tools ?? [],
      expected_should_escalate: body.expected_should_escalate,
      expected_severity: body.expected_severity,
      context_order_number: body.context_order_number,
      tags: body.tags ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ case: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }
  const { error } = await supabase.from('eval_cases').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
