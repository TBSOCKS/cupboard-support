import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { triage } from '@/lib/agents/triage';
import { runOrderStatusAgent } from '@/lib/agents/order-status';
import type { AgentName } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30; // give tool loops time to run

interface ChatRequest {
  conversationId: string | null;
  message: string;
}

const HUMAN_HANDOFF_REPLY =
  "I'm connecting you with one of our human specialists. They'll have full context on this conversation and can help you from here. You may see a brief delay while they pick up.";

const NOT_YET_BUILT_REPLY = (agent: AgentName) =>
  `Got it — based on your message, this looks like a ${agent.replace(
    '_',
    ' '
  )} question. That specialist agent isn't online yet (Phase 3 of this build). For now, I'll route you to a human who can help.`;

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

    // Pull conversation history for the specialist (last ~10 messages)
    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    // Exclude the message we just inserted (we'll pass it separately)
    // and only include user/assistant turns
    const conversationHistory = (history ?? [])
      .slice(0, -1) // drop the just-inserted user message
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
    // 4. Check escalation triggers
    // ========================================================================

    // Auto-escalate (explicit human request, legal threats, etc.)
    if (triageResult.auto_escalate) {
      return await handoffToHuman({
        conversationId,
        reason: triageResult.escalate_reason ?? 'Auto-escalation triggered by triage',
        eventType: 'escalation_triggered',
      });
    }

    // Low-confidence escalation
    if (triageResult.confidence < 0.5) {
      return await handoffToHuman({
        conversationId,
        reason: `Low triage confidence: ${triageResult.confidence}`,
        eventType: 'escalation_triggered',
      });
    }

    // ========================================================================
    // 5. Route to specialist
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

    // Phase 2: only Order Status is built. Other intents get the
    // "not yet built, escalating" treatment.
    if (targetAgent !== 'order_status') {
      return await handoffToHuman({
        conversationId,
        reason: `${targetAgent} agent not yet implemented (Phase 3)`,
        eventType: 'handoff_to_human',
        customReply: NOT_YET_BUILT_REPLY(targetAgent),
      });
    }

    // ========================================================================
    // 6. Run the Order Status agent
    // ========================================================================
    const result = await runOrderStatusAgent({
      conversationId,
      userMessage: message,
      conversationHistory,
    });

    // Log the agent's final reply
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      agent: 'order_status',
      content: result.reply,
    });

    // If the agent decided to escalate, hand off
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

  return NextResponse.json({
    conversationId,
    reply,
    agent: 'human',
    meta: { escalated: true, reason },
  });
}
