'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { EvalCase } from '@/lib/evals/types';

export default function EvalCasesPage() {
  const [cases, setCases] = useState<EvalCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    fetch('/api/admin/evals/cases')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setCases(d.cases);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const allTags = cases
    ? Array.from(new Set(cases.flatMap((c) => c.tags))).sort()
    : [];
  const filtered =
    cases && filter
      ? cases.filter((c) => c.tags.includes(filter))
      : cases;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl text-cupboard-deep mb-1">
            Eval cases
          </h1>
          <p className="text-sm text-cupboard-warm">
            Test cases used to grade the system across prompt iterations.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/evals/run"
            className="rounded-md bg-cupboard-accent px-4 py-2 text-sm font-medium text-cupboard-cream hover:bg-cupboard-deep transition-colors"
          >
            Run suite
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs uppercase tracking-wider text-cupboard-warm mr-2">
            Filter by tag:
          </span>
          <button
            onClick={() => setFilter('')}
            className={cn(
              'text-xs px-2 py-1 rounded border',
              filter === ''
                ? 'bg-cupboard-deep text-cupboard-cream border-cupboard-deep'
                : 'border-cupboard-stone text-cupboard-deep hover:bg-cupboard-stone/30'
            )}
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setFilter(tag)}
              className={cn(
                'text-xs px-2 py-1 rounded border',
                filter === tag
                  ? 'bg-cupboard-deep text-cupboard-cream border-cupboard-deep'
                  : 'border-cupboard-stone text-cupboard-deep hover:bg-cupboard-stone/30'
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {!cases ? (
        <div className="text-sm text-cupboard-warm">Loading…</div>
      ) : filtered && filtered.length === 0 ? (
        <div className="text-sm text-cupboard-warm">No cases match.</div>
      ) : (
        <div className="bg-white border border-cupboard-stone rounded-lg divide-y divide-cupboard-stone">
          {filtered!.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseRow({ c }: { c: EvalCase }) {
  return (
    <div className="px-4 py-3 hover:bg-cupboard-stone/10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-cupboard-deep">{c.name}</div>
          <div className="text-sm text-cupboard-deep/70 mt-1 italic">
            "{c.customer_message}"
          </div>
          {c.previous_assistant_message && (
            <div className="text-xs text-cupboard-warm mt-1">
              after: "{c.previous_assistant_message.slice(0, 80)}…"
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-cupboard-warm">
            {c.expected_intent && (
              <span>
                intent: <strong>{c.expected_intent}</strong>
              </span>
            )}
            {c.expected_agent && (
              <span>
                agent: <strong>{c.expected_agent}</strong>
              </span>
            )}
            {c.expected_tools.length > 0 && (
              <span>
                tools: <strong>{c.expected_tools.join(', ')}</strong>
              </span>
            )}
            {c.expected_should_escalate !== null && (
              <span>
                escalate:{' '}
                <strong>{c.expected_should_escalate ? 'yes' : 'no'}</strong>
              </span>
            )}
            {c.expected_severity && (
              <span>
                severity: <strong>{c.expected_severity}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 max-w-[200px] justify-end">
          {c.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] uppercase tracking-wider bg-cupboard-stone/50 text-cupboard-deep px-1.5 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
