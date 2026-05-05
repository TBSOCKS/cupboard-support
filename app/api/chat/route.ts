import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';

interface ChatRequest {
  conversationId: string | null;
  message: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequest;
    const { message } = body;
    let { conversationId } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Missing message' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Create conversation if this is the first message
    if (!conversationId) {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          status: 'active',
          current_agent: 'triage',
        })
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

    // Log user message
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: message,
    });

    // ====================================================================
    // PHASE 1: Echo placeholder. Phase 2 will replace this with the triage
    // agent + specialist routing.
    // ====================================================================
    const reply = `Got it — I received your message: "${message}". Real agent routing comes online in Phase 2 of this build. For now, this is just confirming the chat plumbing works end-to-end.`;
    const agent = 'general';

    // Log assistant message
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      agent,
      content: reply,
    });

    return NextResponse.json({
      conversationId,
      reply,
      agent,
    });
  } catch (err) {
    console.error('Chat API error', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
