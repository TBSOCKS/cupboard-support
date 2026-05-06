'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { MarkdownText } from '@/app/components/MarkdownText';
import type { EvalRunResult, EvalSuiteRun, EvalCase } from '@/lib/evals/types';

interface RunWithCase extends EvalRunResult {
  case: EvalCase;
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{
    suite_run: EvalSuiteRun;
    runs: RunWithCase[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'failed' | 'passed'>('all');

  useEffect(() => {
    fetch(`/api/admin/evals/runs/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(String(e)));
  }, [params.id]);

  if (error)
    return <div className="text-sm text-red-700">Error: {error}</div>;
  if (!data) return <div className="text-sm text-cupboard-warm">Loading…</div>;

  const { suite_run, runs } = data;
  const filtered = runs.filter((r) =>
    filter === 'all'
      ? true
      : filter === 'passed'
      ? r.overall_passed
      : !r.overall_passed
  );

  return (
    <div>
      <Link
        href="/admin/evals/run"
        className="text-xs uppercase tracking-wider text-cupboard-warm hover:underline"
      >
        ← Back to run page
      </Link>

      <div className="mt-2 mb-6">
        <h1 className="font-serif text-3xl text-cupboard-deep mb-1">
          Suite run results
        </h1>
        <div className="text-sm text-cupboard-warm">
          {suite_run.prompt_version || '(no version)'} ·{' '}
          {new Date(suite_run.started_at).toLocaleString()} ·{' '}
          <span className="font-mono">{suite_run.mode}</span>
          {suite_run.tag_filter && (
            <>
              {' '}
              · tag:{' '}
              <span className="font-mono">{suite_run.tag_filter}</span>
            </>
          )}
        </div>
        {suite_run.notes && (
          <div className="text-sm text-cupboard-deep mt-2 italic">
            {suite_run.notes}
          </div>
        )}
      </div>

      {/* Aggregate scorecard */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat
          label="Overall"
          value={`${suite_run.passed_cases}/${suite_run.total_cases}`}
          big
        />
        <Stat label="Intent" value={pct(suite_run.intent_accuracy)} />
        <Stat label="Agent" value={pct(suite_run.agent_accuracy)} />
        <Stat label="Tools" value={pct(suite_run.tools_accuracy)} />
        <Stat label="Escalation" value={pct(suite_run.escalation_accuracy)} />
        <Stat label="Severity" value={pct(suite_run.severity_accuracy)} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-2">
          <FilterChip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            All ({runs.length})
          </FilterChip>
          <FilterChip
            active={filter === 'failed'}
            onClick={() => setFilter('failed')}
          >
            Failed ({runs.filter((r) => !r.overall_passed).length})
          </FilterChip>
          <FilterChip
            active={filter === 'passed'}
            onClick={() => setFilter('passed')}
          >
            Passed ({runs.filter((r) => r.overall_passed).length})
          </FilterChip>
        </div>
        <div className="text-xs text-cupboard-warm">
          Total cost:{' '}
          <strong>
            ${(Number(suite_run.total_cost_cents) / 100).toFixed(4)}
          </strong>{' '}
          · {suite_run.duration_ms ? formatDuration(suite_run.duration_ms) : '-'}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((r) => (
          <CaseResultCard key={r.id} run={r} />
        ))}
      </div>
    </div>
  );
}

function pct(n: number | null): string {
  if (n === null) return '—';
  return `${Math.round(n * 100)}%`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function Stat({
  label,
  value,
  big,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className="bg-white border border-cupboard-stone rounded-lg px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-cupboard-warm">
        {label}
      </div>
      <div
        className={cn(
          'font-mono font-semibold text-cupboard-deep',
          big ? 'text-2xl' : 'text-lg'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-xs px-3 py-1.5 rounded-md border',
        active
          ? 'bg-cupboard-deep text-cupboard-cream border-cupboard-deep'
          : 'border-cupboard-stone text-cupboard-deep hover:bg-cupboard-stone/30'
      )}
    >
      {children}
    </button>
  );
}

function CaseResultCard({ run }: { run: RunWithCase }) {
  const [expanded, setExpanded] = useState(!run.overall_passed);

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden bg-white',
        run.overall_passed
          ? 'border-cupboard-stone'
          : 'border-red-200'
      )}
    >
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cupboard-stone/10 text-left"
      >
        <div
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            run.overall_passed ? 'bg-emerald-500' : 'bg-red-500'
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-cupboard-deep">
            {run.case.name}
          </div>
          <div className="text-xs text-cupboard-warm italic truncate">
            "{run.case.customer_message}"
          </div>
        </div>
        <div className="flex gap-1.5 text-[10px] uppercase tracking-wider">
          <Pill ok={run.intent_passed} label="intent" />
          <Pill ok={run.agent_passed} label="agent" />
          <Pill ok={run.tools_passed} label="tools" />
          <Pill ok={run.escalation_passed} label="esc" />
          <Pill ok={run.severity_passed} label="sev" />
        </div>
        <div className="text-cupboard-warm">{expanded ? '▾' : '▸'}</div>
      </button>

      {expanded && (
        <div className="border-t border-cupboard-stone bg-cupboard-cream/30 px-4 py-4">
          {run.error_message && (
            <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-xs mb-3 font-mono">
              {run.error_message}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <DiffRow
              label="Intent"
              expected={run.case.expected_intent}
              actual={run.actual_intent}
              passed={run.intent_passed}
            />
            <DiffRow
              label="Agent"
              expected={run.case.expected_agent}
              actual={run.actual_agent}
              passed={run.agent_passed}
            />
            <DiffRow
              label="Tools"
              expected={run.case.expected_tools.join(', ') || '(none)'}
              actual={run.actual_tools.join(', ') || '(none)'}
              passed={run.tools_passed}
            />
            <DiffRow
              label="Escalate"
              expected={
                run.case.expected_should_escalate === null
                  ? null
                  : String(run.case.expected_should_escalate)
              }
              actual={
                run.actual_should_escalate === null
                  ? null
                  : String(run.actual_should_escalate)
              }
              passed={run.escalation_passed}
            />
            <DiffRow
              label="Severity"
              expected={run.case.expected_severity}
              actual={run.actual_severity}
              passed={run.severity_passed}
            />
            <DiffRow
              label="Confidence"
              expected={null}
              actual={
                run.actual_confidence !== null
                  ? run.actual_confidence.toFixed(2)
                  : null
              }
              passed={null}
            />
          </div>

          {run.actual_reply && (
            <div>
              <div className="text-xs uppercase tracking-wider text-cupboard-warm mb-1">
                Agent reply
              </div>
              <div className="bg-white border border-cupboard-stone rounded-md px-3 py-2 text-sm text-cupboard-deep">
                <MarkdownText text={run.actual_reply} />
              </div>
            </div>
          )}

          <div className="text-[10px] text-cupboard-warm mt-3 flex gap-3 font-mono">
            <span>{run.duration_ms}ms</span>
            <span>
              {run.input_tokens} in / {run.output_tokens} out
            </span>
            <span>${(Number(run.cost_cents) / 100).toFixed(5)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({
  ok,
  label,
}: {
  ok: boolean | null;
  label: string;
}) {
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 rounded',
        ok === true && 'bg-emerald-100 text-emerald-800',
        ok === false && 'bg-red-100 text-red-800',
        ok === null && 'bg-cupboard-stone/50 text-cupboard-warm'
      )}
    >
      {label}
    </span>
  );
}

function DiffRow({
  label,
  expected,
  actual,
  passed,
}: {
  label: string;
  expected: string | null;
  actual: string | null;
  passed: boolean | null;
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 bg-white',
        passed === true && 'border-emerald-200',
        passed === false && 'border-red-200',
        passed === null && 'border-cupboard-stone'
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-cupboard-warm mb-1">
        {label}
      </div>
      <div className="text-xs space-y-0.5">
        <div>
          <span className="text-cupboard-warm">expected:</span>{' '}
          <span className="font-mono text-cupboard-deep">
            {expected ?? '—'}
          </span>
        </div>
        <div>
          <span className="text-cupboard-warm">actual:</span>{' '}
          <span
            className={cn(
              'font-mono',
              passed === false ? 'text-red-700' : 'text-cupboard-deep'
            )}
          >
            {actual ?? '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
