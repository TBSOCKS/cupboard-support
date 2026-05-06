'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { EvalSuiteRun } from '@/lib/evals/types';

export default function PastRunsPage() {
  const [runs, setRuns] = useState<EvalSuiteRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/evals/run')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setRuns(d.runs);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error)
    return <div className="text-sm text-red-700">Error: {error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl text-cupboard-deep mb-1">
            Past runs
          </h1>
          <p className="text-sm text-cupboard-warm">
            Every suite run is archived here so you can compare prompt
            iterations over time.
          </p>
        </div>
        <Link
          href="/admin/evals/run"
          className="rounded-md bg-cupboard-accent px-4 py-2 text-sm font-medium text-cupboard-cream hover:bg-cupboard-deep transition-colors"
        >
          New run
        </Link>
      </div>

      {!runs ? (
        <div className="text-sm text-cupboard-warm">Loading…</div>
      ) : runs.length === 0 ? (
        <div className="text-sm text-cupboard-warm">No runs yet.</div>
      ) : (
        <div className="bg-white border border-cupboard-stone rounded-lg divide-y divide-cupboard-stone">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/admin/evals/runs/${run.id}`}
              className="block px-4 py-3 hover:bg-cupboard-stone/10"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-cupboard-deep">
                    {run.prompt_version || '(no version)'}
                    <span className="text-cupboard-warm font-normal text-xs ml-2">
                      {run.mode === 'triage_only' ? 'triage-only' : 'full suite'}
                      {run.tag_filter && ` · ${run.tag_filter}`}
                    </span>
                  </div>
                  {run.notes && (
                    <div className="text-xs text-cupboard-deep/70 mt-0.5 italic truncate">
                      {run.notes}
                    </div>
                  )}
                  <div className="text-xs text-cupboard-warm mt-0.5">
                    {new Date(run.started_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="text-right">
                    <div
                      className={cn(
                        'font-mono font-semibold text-base',
                        run.completed_at &&
                          run.passed_cases === run.total_cases
                          ? 'text-emerald-700'
                          : run.completed_at
                          ? 'text-cupboard-deep'
                          : 'text-cupboard-warm'
                      )}
                    >
                      {run.passed_cases}/{run.total_cases}
                    </div>
                    <div className="text-cupboard-warm">
                      ${(Number(run.total_cost_cents) / 100).toFixed(4)}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
