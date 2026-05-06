'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { MarkdownText } from '@/app/components/MarkdownText';
import type { AgentName } from '@/types';

type MessageKind = 'user' | 'agent' | 'system';

interface ChatMessage {
  id: string;
  kind: MessageKind;
  agent: AgentName | null;
  content: string;
}

const AGENT_LABELS: Record<AgentName, string> = {
  triage: 'Routing your message',
  order_status: 'Order Support',
  returns: 'Returns & Refunds',
  product: 'Product Specialist',
  account: 'Account & Billing',
  general: 'Cupboard Support',
  human: 'Cupboard Support',
};

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      kind: 'agent',
      agent: 'general',
      content:
        "Welcome to Cupboard. I'm here to help with orders, returns, products, or anything else. What can I help you with today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      kind: 'user',
      agent: null,
      content: trimmed,
    };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: trimmed,
        }),
      });

      if (!res.ok) throw new Error('Chat API failed');
      const data = await res.json();

      if (data.conversationId && !conversationId) {
        setConversationId(data.conversationId);
      }

      // The route may return either an agent reply or a handoff system message.
      // The 'kind' field on the response signals which is which.
      const messageKind: MessageKind =
        data.kind === 'system' ? 'system' : 'agent';

      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          kind: messageKind,
          agent: data.agent ?? 'general',
          content: data.reply,
        },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          kind: 'agent',
          agent: 'general',
          content:
            'Sorry, something went wrong on our end. Please try again in a moment.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-cupboard-stone bg-cupboard-cream">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-sm bg-cupboard-accent flex items-center justify-center text-cupboard-cream font-serif text-lg">
              C
            </div>
            <div>
              <div className="font-serif text-xl text-cupboard-deep tracking-tight">
                Cupboard
              </div>
              <div className="text-xs text-cupboard-warm">Support</div>
            </div>
          </div>
          <a
            href="/dashboard"
            className="text-xs text-cupboard-warm hover:text-cupboard-deep hover:underline"
          >
            View support insights →
          </a>
        </div>
      </header>

      {/* Chat area */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.map((msg) => (
            <MessageView key={msg.id} message={msg} />
          ))}
          {isSending && <TypingIndicator />}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-cupboard-stone pt-4"
        >
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder="Type your message…"
              rows={2}
              className="flex-1 resize-none rounded-md border border-cupboard-stone bg-white px-3 py-2 text-sm text-cupboard-deep placeholder:text-cupboard-warm/60 focus:outline-none focus:ring-2 focus:ring-cupboard-accent/30"
              disabled={isSending}
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className={cn(
                'rounded-md bg-cupboard-accent px-4 py-2 text-sm font-medium text-cupboard-cream',
                'hover:bg-cupboard-deep transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed'
              )}
            >
              Send
            </button>
          </div>
          <div className="text-[11px] text-cupboard-warm mt-2">
            Demo project. Cupboard is a fictional store.
          </div>
        </form>
      </div>
    </main>
  );
}

function MessageView({ message }: { message: ChatMessage }) {
  if (message.kind === 'system') {
    return <SystemNotice content={message.content} />;
  }

  const isUser = message.kind === 'user';
  const agentLabel =
    message.agent && !isUser ? AGENT_LABELS[message.agent] : null;

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] sm:max-w-[75%]')}>
        {agentLabel && (
          <div className="text-[11px] uppercase tracking-wider text-cupboard-warm mb-1 ml-1">
            {agentLabel}
          </div>
        )}
        <div
          className={cn(
            'rounded-lg px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-cupboard-deep text-cupboard-cream'
              : 'bg-white border border-cupboard-stone text-cupboard-deep'
          )}
        >
          {isUser ? (
            message.content
          ) : (
            <MarkdownText text={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * System notices render centered with a subtle background — used for
 * "transferring to a teammate", "agent picked up", and other state changes
 * that aren't messages from a person or an agent.
 */
function SystemNotice({ content }: { content: string }) {
  return (
    <div className="flex justify-center py-1">
      <div className="max-w-[85%] sm:max-w-[75%] rounded-md bg-cupboard-stone/50 px-4 py-2 text-center">
        <div className="text-[11px] uppercase tracking-wider text-cupboard-warm mb-0.5">
          Transferring
        </div>
        <div className="text-sm text-cupboard-deep leading-relaxed">
          <MarkdownText text={content} />
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-cupboard-stone rounded-lg px-4 py-3">
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cupboard-warm animate-pulse" />
          <span
            className="w-1.5 h-1.5 rounded-full bg-cupboard-warm animate-pulse"
            style={{ animationDelay: '0.15s' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-cupboard-warm animate-pulse"
            style={{ animationDelay: '0.3s' }}
          />
        </div>
      </div>
    </div>
  );
}
