import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { triage } from '@/lib/agents/triage';
import { runOrderStatusAgent } from '@/lib/agents/order-status';
import type { AgentName } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ChatRequest {
  conversationId: string | null;
  message: string;
}

const HUMAN_HANDOFF_REPLY =
  "Connecting you with one of our teammates now. They'll have full context on this conversation and can help you from here.";

const NOT_YET_BUILT_REPLY = (agent: AgentName) =>
  `Looks like this is a ${agent.replace(
    '_',
    ' '
  )} question. That specialist isn't online yet (Phase 3 of this build) — bringing in a teammate for you instead.`;

const GIBBERISH_REPLIES = [
  "If this was a cat walking on the keyboard — meow! 🐱 If not, let me know what's going on and I'll help.",
  "Looks like that didn't quite come through — could you give it another go? Happy to help with orders, returns, products, or anything else.",
  "Hmm, I'm not catching that. Try me again? I can help with order status, returns, product questions, or account stuff.",
];

function pickGibberishReply(): string {
  return GIBBERISH_REPLIES[Math.floor(Math.random() * GIBBERISH_REPLIES.length)];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequest;
    const { message } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }

    const supabase = createServerClient();

    // ========================================================================
    // 1. Get or create the conversation
    // ========================================================================
    let conversationId: string;
    if (body.conversationId) {
      conversationId = body.conversationId;
    } else {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ status: 'active', current_agent: 'triage' })
        .select('id')
        .single();
      if (convErr || !conv) {
        console.error('Failed to create conversation', convErr);
        return NextResponse.json(
          { error: 'Could not start conversation' },
          { status: 500 }
        );
      }
      conversationId = conv.id;
      await supabase.from('analytics_events').insert({
        conversation_id: conversationId,
        event_type: 'conversation_started',
      });
    }

    // ========================================================================
    // 2. Log user message
    // ========================================================================
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: message,
    });

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    const conversationHistory = (history ?? [])
      .slice(0, -1)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // ========================================================================
    // 3. Triage the incoming message
    // ========================================================================
    const triageResult = await triage(message);

    await supabase.from('analytics_events').insert({
      conversation_id: conversationId,
      event_type: 'triage_classification',
      agent: 'triage',
      intent_category: triageResult.intent,
      confidence: triageResult.confidence,
      reason: triageResult.reasoning,
      metadata: {
        entities: triageResult.entities,
        auto_escalate: triageResult.auto_escalate,
      },
    });

    // ========================================================================
    // 4. Special-case: gibberish gets a playful reply, not an escalation
    // ========================================================================
    if (triageResult.intent === 'gibberish') {
      const reply = pickGibberishReply();
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        role: 'assistant',
        agent: 'general',
        content: reply,
      });
      return NextResponse.json({
        conversationId,
        reply,
        agent: 'general',
        kind: 'agent',
        meta: { intent: 'gibberish' },
      });
    }

    // ========================================================================
    // 5. Auto-escalation triggers
    // ========================================================================
    if (triageResult.auto_escalate) {
      return await handoffToHuman({
        conversationId,
        reason: triageResult.escalate_reason ?? 'Auto-escalation triggered by triage',
        eventType: 'escalation_triggered',
      });
    }

    if (triageResult.confidence < 0.5) {
      return await handoffToHuman({
        conversationId,
        reason: `Low triage confidence: ${triageResult.confidence}`,
        eventType: 'escalation_triggered',
      });
    }

    // ========================================================================
    // 6. Route to specialist
    // ========================================================================
    const targetAgent = triageResult.routed_to;

    await supabase.from('analytics_events').insert({
      conversation_id: conversationId,
      event_type: 'agent_routed',
      agent: targetAgent,
      intent_category: triageResult.intent,
      confidence: triageResult.confidence,
    });

    await supabase
      .from('conversations')
      .update({ current_agent: targetAgent })
      .eq('id', conversationId);

    if (targetAgent !== 'order_status') {
      return await handoffToHuman({
        conversationId,
        reason: `${targetAgent} agent not yet implemented (Phase 3)`,
        eventType: 'handoff_to_human',
        customReply: NOT_YET_BUILT_REPLY(targetAgent),
      });
    }

    // ========================================================================
    // 7. Run the Order Status agent
    // ========================================================================
    const result = await runOrderStatusAgent({
      conversationId,
      userMessage: message,
      conversationHistory,
    });

    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      agent: 'order_status',
      content: result.reply,
    });

    if (result.should_escalate) {
      await supabase.from('analytics_events').insert({
        conversation_id: conversationId,
        event_type: 'escalation_triggered',
        agent: 'order_status',
        reason: result.escalate_reason,
      });
      await supabase
        .from('conversations')
        .update({ status: 'escalated_to_human', current_agent: 'human' })
        .eq('id', conversationId);
    }

    return NextResponse.json({
      conversationId,
      reply: result.reply,
      agent: 'order_status',
      kind: 'agent',
      meta: {
        intent: triageResult.intent,
        confidence: triageResult.confidence,
        tool_calls: result.tool_calls.length,
        escalated: result.should_escalate,
      },
    });
  } catch (err) {
    console.error('Chat API error', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: String(err) },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

async function handoffToHuman(args: {
  conversationId: string;
  reason: string;
  eventType: 'escalation_triggered' | 'handoff_to_human';
  customReply?: string;
}) {
  const { conversationId, reason, eventType, customReply } = args;
  const supabase = createServerClient();

  const reply = customReply ?? HUMAN_HANDOFF_REPLY;

  await supabase.from('analytics_events').insert({
    conversation_id: conversationId,
    event_type: eventType,
    reason,
  });

  await supabase
    .from('conversations')
    .update({ status: 'escalated_to_human', current_agent: 'human' })
    .eq('id', conversationId);

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    agent: 'human',
    content: reply,
  });

  // Return as a 'system' kind so the UI renders it as a centered transition
  // notice rather than under the "HUMAN SPECIALIST" label (which was
  // confusing — the human hasn't actually picked up yet).
  return NextResponse.json({
    conversationId,
    reply,
    agent: 'human',
    kind: 'system',
    meta: { escalated: true, reason },
  });
}
