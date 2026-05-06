'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { EvalMode, EvalCase } from '@/lib/evals/types';

export default function RunSuitePage() {
  const router = useRouter();
  const [cases, setCases] = useState<EvalCase[] | null>(null);
  const [mode, setMode] = useState<EvalMode>('triage_only');
  const [tagFilter, setTagFilter] = useState('');
  const [promptVersion, setPromptVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/evals/cases')
      .then((r) => r.json())
      .then((d) => setCases(d.cases ?? []));
  }, []);

  const allTags = cases
    ? Array.from(new Set(cases.flatMap((c) => c.tags))).sort()
    : [];
  const filteredCount =
    cases && tagFilter
      ? cases.filter((c) => c.tags.includes(tagFilter)).length
      : cases?.length ?? 0;

  // Rough cost estimate
  const costEstimate =
    mode === 'triage_only'
      ? `~$${((filteredCount * 0.001) / 1).toFixed(3)}–$${((filteredCount * 0.003) / 1).toFixed(3)}`
      : `~$${((filteredCount * 0.02) / 1).toFixed(2)}–$${((filteredCount * 0.05) / 1).toFixed(2)}`;

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/evals/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          tag_filter: tagFilter || null,
          prompt_version: promptVersion || null,
          notes: notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Run failed');
        setRunning(false);
        return;
      }
      router.push(`/admin/evals/runs/${data.suite_run_id}`);
    } catch (err) {
      setError(String(err));
      setRunning(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl text-cupboard-deep mb-1">
        Run eval suite
      </h1>
      <p className="text-sm text-cupboard-warm mb-6">
        Run all (or filtered) test cases against the live system and grade
        them.
      </p>

      <div className="space-y-5 bg-white border border-cupboard-stone rounded-lg p-6">
        <div>
          <label className="text-xs uppercase tracking-wider text-cupboard-warm mb-2 block">
            Mode
          </label>
          <div className="space-y-2">
            <ModeOption
              selected={mode === 'triage_only'}
              onClick={() => setMode('triage_only')}
              title="Triage only (cheap)"
              description="Run only the triage classifier. ~5 cents max for 15 cases. Use this for routing/intent prompt iteration."
            />
            <ModeOption
              selected={mode === 'full_suite'}
              onClick={() => setMode('full_suite')}
              title="Full suite (with specialists)"
              description="Run triage AND the relevant specialist (currently only Order Status). Includes tool calls. Costs more — use when iterating on specialist prompts."
            />
          </div>
        </div>

        {allTags.length > 0 && (
          <div>
            <label className="text-xs uppercase tracking-wider text-cupboard-warm mb-2 block">
              Tag filter (optional)
            </label>
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="w-full rounded-md border border-cupboard-stone bg-white px-3 py-2 text-sm text-cupboard-deep"
            >
              <option value="">All cases ({cases?.length ?? 0})</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs uppercase tracking-wider text-cupboard-warm mb-2 block">
            Prompt version (optional)
          </label>
          <input
            type="text"
            value={promptVersion}
            onChange={(e) => setPromptVersion(e.target.value)}
            placeholder="e.g. v1-locked, v2-empathy-tweak"
            className="w-full rounded-md border border-cupboard-stone bg-white px-3 py-2 text-sm text-cupboard-deep placeholder:text-cupboard-warm/60"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-cupboard-warm mb-2 block">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What changed in this version?"
            rows={2}
            className="w-full rounded-md border border-cupboard-stone bg-white px-3 py-2 text-sm text-cupboard-deep placeholder:text-cupboard-warm/60 resize-none"
          />
        </div>

        <div className="flex items-center justify-between border-t border-cupboard-stone pt-4">
          <div className="text-xs text-cupboard-warm">
            Will run <strong>{filteredCount}</strong> case
            {filteredCount === 1 ? '' : 's'} · est. cost{' '}
            <strong>{costEstimate}</strong>
          </div>
          <button
            onClick={handleRun}
            disabled={running || filteredCount === 0}
            className={cn(
              'rounded-md bg-cupboard-accent px-4 py-2 text-sm font-medium text-cupboard-cream',
              'hover:bg-cupboard-deep transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed'
            )}
          >
            {running ? 'Running…' : 'Start run'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {running && (
        <div className="mt-4 text-sm text-cupboard-warm">
          Running cases sequentially. This can take 30 seconds for triage-only,
          longer for full-suite. Hold tight…
        </div>
      )}
    </div>
  );
}

function ModeOption({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-md border px-3 py-2.5 transition-colors',
        selected
          ? 'border-cupboard-accent bg-cupboard-accent/5'
          : 'border-cupboard-stone hover:bg-cupboard-stone/30'
      )}
    >
      <div className="font-medium text-sm text-cupboard-deep">{title}</div>
      <div className="text-xs text-cupboard-deep/70 mt-0.5">{description}</div>
    </button>
  );
}
