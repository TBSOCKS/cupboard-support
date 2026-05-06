'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// ============================================================================
// Types matching the API response
// ============================================================================
interface DashboardData {
  headline: {
    total_conversations: number;
    total_deflected: number;
    total_escalated: number;
    overall_deflection_rate: number;
    days_window: number;
  };
  volume: Array<{
    date: string;
    order_status: number;
    returns: number;
    product: number;
    general: number;
    account: number;
    gibberish: number;
    unknown: number;
  }>;
  deflection: Array<{
    agent: string;
    total: number;
    deflected: number;
    rate: number;
  }>;
  escalation: Array<{
    reason: string;
    count: number;
    percent: number;
  }>;
  duration: Array<{
    agent: string;
    deflected_avg_minutes: number | null;
    escalated_avg_minutes: number | null;
    deflected_count: number;
    escalated_count: number;
  }>;
  tools: Array<{
    tool: string;
    succeeded: number;
    failed: number;
    total: number;
    failure_rate: number;
  }>;
  opportunities: Array<{
    intent: string;
    volume: number;
    handoff_rate: number;
    opportunity_score: number;
    deflected_count: number;
    escalated_count: number;
  }>;
}

// Color palette for charts - aligned with Cupboard's warm/refined aesthetic
const INTENT_COLORS: Record<string, string> = {
  order_status: '#7B6549', // accent
  returns: '#A8957A',      // warm
  product: '#3D3528',      // deep
  general: '#C2B6A0',      // lighter warm
  account: '#5A4D3A',      // darker accent
  gibberish: '#D8CFBC',    // very light
  unknown: '#9C9586',      // muted
};

const FRIENDLY_INTENT: Record<string, string> = {
  order_status: 'Order Status',
  returns: 'Returns',
  product: 'Product',
  general: 'General',
  account: 'Account',
  gibberish: 'Unintelligible',
  unknown: 'Unclear',
};

const FRIENDLY_AGENT: Record<string, string> = {
  order_status: 'Order Status',
  returns: 'Returns',
  product: 'Product',
  general: 'General',
  account: 'Account',
  triage: 'Triage',
  human: 'Human',
};

const FRIENDLY_REASON: Record<string, string> = {
  auto_escalate_explicit_human: 'Customer asked for a human',
  auto_escalate_profanity: 'Profanity / abuse',
  auto_escalate_legal: 'Legal threats',
  auto_escalate_continuation: 'Customer continuation post-handoff',
  low_confidence: 'Low triage confidence',
  agent_decision_problem_order: 'Problem order (delayed/lost)',
  agent_decision_outside_policy: 'Outside return policy',
  agent_decision_damage_claim: 'Damage claim',
  agent_decision_no_specialist: 'Specialist not built',
  max_turns_reached: 'Hit conversation turn limit',
};

const FRIENDLY_TOOL: Record<string, string> = {
  lookup_order: 'lookup_order',
  get_tracking: 'get_tracking',
  check_return_eligibility: 'check_return_eligibility',
  initiate_return: 'initiate_return',
  check_refund_status: 'check_refund_status',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error)
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-sm text-red-700">Error loading dashboard: {error}</div>
      </main>
    );

  if (!data)
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-sm text-cupboard-warm">Loading dashboard…</div>
      </main>
    );

  return (
    <main className="min-h-screen pb-12">
      {/* Header */}
      <header className="border-b border-cupboard-stone bg-cupboard-cream">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-sm bg-cupboard-accent flex items-center justify-center text-cupboard-cream font-serif text-lg">
                C
              </div>
              <div>
                <div className="font-serif text-xl text-cupboard-deep tracking-tight">
                  Cupboard
                </div>
                <div className="text-xs text-cupboard-warm">Support insights</div>
              </div>
            </Link>
          </div>
          <span className="text-[10px] uppercase tracking-widest bg-cupboard-stone/60 text-cupboard-deep px-2 py-1 rounded">
            Demo data
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Title */}
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-cupboard-deep tracking-tight mb-2">
            Cupboard support, last {data.headline.days_window} days
          </h1>
          <p className="text-sm text-cupboard-warm leading-relaxed max-w-2xl">
            What customers are asking, how the AI is handling it, and where
            opportunities to deflect more volume sit. Numbers reflect simulated
            conversation traffic to make patterns visible at portfolio scale.
          </p>
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <Headline
            label="Total conversations"
            value={data.headline.total_conversations.toLocaleString()}
          />
          <Headline
            label="Resolved by AI"
            value={data.headline.total_deflected.toLocaleString()}
            sub={`${(data.headline.overall_deflection_rate * 100).toFixed(
              0
            )}% deflection`}
          />
          <Headline
            label="Escalated to human"
            value={data.headline.total_escalated.toLocaleString()}
            sub={`${(
              (data.headline.total_escalated /
                Math.max(1, data.headline.total_conversations)) *
              100
            ).toFixed(0)}% handoff`}
          />
          <Headline
            label="Avg cost per conversation"
            value="$0.04"
            sub="Triage + specialist"
          />
        </div>

        {/* Section divider */}
        <SectionDivider title="Where the volume is" />

        {/* Volume chart */}
        <Card>
          <CardHeader
            title="Volume by intent over time"
            subtitle="Daily conversation count, broken out by what the customer was asking about."
          />
          <div className="h-64">
            <VolumeChart data={data.volume} />
          </div>
          <Legend
            items={[
              'order_status',
              'returns',
              'product',
              'general',
              'account',
              'gibberish',
              'unknown',
            ].map((k) => ({
              label: FRIENDLY_INTENT[k] ?? k,
              color: INTENT_COLORS[k],
            }))}
          />
        </Card>

        {/* Section divider */}
        <SectionDivider title="How the AI is performing" />

        {/* Two-up: deflection + duration */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader
              title="Deflection rate by agent"
              subtitle="Share of conversations resolved without a human handoff."
            />
            <DeflectionChart rows={data.deflection} />
          </Card>

          <Card>
            <CardHeader
              title="Average resolution time"
              subtitle="Minutes per conversation, by agent and outcome."
            />
            <DurationTable rows={data.duration} />
          </Card>
        </div>

        {/* Two-up: escalations + tools */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader
              title="Why we escalate"
              subtitle="Reasons conversations get handed off to a teammate."
            />
            <EscalationChart rows={data.escalation} />
          </Card>

          <Card>
            <CardHeader
              title="Tool reliability"
              subtitle="Success rate of each backend tool the agents call."
            />
            <ToolsTable rows={data.tools} />
          </Card>
        </div>

        {/* Section divider */}
        <SectionDivider title="Where to focus next" />

        {/* Opportunity ranking - the headline widget */}
        <Card emphasis>
          <CardHeader
            title="Deflection opportunities, ranked"
            subtitle="Volume × handoff rate. The intents at the top of this list have the most volume that's still going to humans — improving them is the highest-ROI prompt or specialist work."
          />
          <OpportunityTable rows={data.opportunities} />
        </Card>

        {/* Footer */}
        <div className="mt-12 text-xs text-cupboard-warm border-t border-cupboard-stone pt-6 max-w-2xl">
          <p className="mb-2">
            <strong className="text-cupboard-deep">About this data:</strong>{' '}
            Cupboard is a fictional store. The numbers above reflect simulated
            customer support traffic to make the dashboard visually meaningful at
            portfolio scale. Distributions are tuned to mirror typical e-commerce
            patterns: order status dominates volume, account questions always
            escalate (sensitive data), product questions currently fall through
            because that specialist is not yet built.
          </p>
          <p>
            <strong className="text-cupboard-deep">About this build:</strong>{' '}
            Multi-agent customer support system built on Claude API + Next.js +
            Supabase. Triage classifier (Haiku) routes to specialist agents
            (Sonnet) with tool use. Eval suite of 23 cases catches regressions on
            every prompt change. Two specialists shipped: Order Status (read-only
            tool use) and Returns (write actions with eligibility guardrails).
          </p>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// LAYOUT PIECES
// ============================================================================

function Headline({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-cupboard-stone rounded-lg px-5 py-4">
      <div className="text-[10px] uppercase tracking-widest text-cupboard-warm mb-1">
        {label}
      </div>
      <div className="font-serif text-3xl text-cupboard-deep tracking-tight">
        {value}
      </div>
      {sub && (
        <div className="text-xs text-cupboard-warm mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mt-10 mb-4">
      <h2 className="font-serif text-lg text-cupboard-deep">{title}</h2>
      <div className="flex-1 h-px bg-cupboard-stone" />
    </div>
  );
}

function Card({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-5 mb-4',
        emphasis ? 'border-cupboard-accent/40 shadow-sm' : 'border-cupboard-stone'
      )}
    >
      {children}
    </div>
  );
}

function CardHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-4">
      <h3 className="font-serif text-lg text-cupboard-deep tracking-tight">
        {title}
      </h3>
      {subtitle && (
        <p className="text-sm text-cupboard-warm leading-relaxed mt-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Legend({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-cupboard-stone">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: it.color }}
          />
          <span className="text-xs text-cupboard-deep">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// CHARTS - hand-rolled SVG, no chart library dependencies
// ============================================================================

function VolumeChart({ data }: { data: DashboardData['volume'] }) {
  const intents = ['order_status', 'returns', 'product', 'general', 'account', 'gibberish', 'unknown'] as const;

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-cupboard-warm">
        No data in this window.
      </div>
    );
  }

  // Compute max y for scaling
  const maxY = Math.max(
    ...data.map((d) => intents.reduce((sum, i) => sum + d[i], 0)),
    1
  );

  const width = 700;
  const height = 200;
  const padX = 30;
  const padY = 20;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const barW = chartW / data.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full"
      preserveAspectRatio="none"
    >
      {/* Y axis tick lines */}
      {[0, 0.5, 1].map((p) => {
        const y = padY + chartH * (1 - p);
        return (
          <line
            key={p}
            x1={padX}
            y1={y}
            x2={width - padX}
            y2={y}
            stroke="#E8E2D6"
            strokeDasharray={p === 0 ? '0' : '2 3'}
          />
        );
      })}

      {/* Stacked bars */}
      {data.map((d, i) => {
        let yOffset = 0;
        return intents.map((intent) => {
          const value = d[intent];
          if (value === 0) return null;
          const barH = (value / maxY) * chartH;
          const y = padY + chartH - yOffset - barH;
          yOffset += barH;
          return (
            <rect
              key={intent}
              x={padX + i * barW + 1}
              y={y}
              width={Math.max(barW - 2, 1)}
              height={barH}
              fill={INTENT_COLORS[intent]}
            />
          );
        });
      })}

      {/* X axis labels (every ~5 days) */}
      {data
        .filter((_, i) => i % Math.max(1, Math.floor(data.length / 6)) === 0)
        .map((d) => {
          const idx = data.findIndex((x) => x.date === d.date);
          const x = padX + idx * barW + barW / 2;
          return (
            <text
              key={d.date}
              x={x}
              y={height - 4}
              fontSize="10"
              fill="#A8957A"
              textAnchor="middle"
            >
              {new Date(d.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </text>
          );
        })}

      {/* Y axis labels */}
      {[0, Math.round(maxY / 2), maxY].map((v, i) => {
        const y = padY + chartH * (1 - v / maxY);
        return (
          <text
            key={i}
            x={padX - 6}
            y={y + 3}
            fontSize="10"
            fill="#A8957A"
            textAnchor="end"
          >
            {v}
          </text>
        );
      })}
    </svg>
  );
}

function DeflectionChart({
  rows,
}: {
  rows: DashboardData['deflection'];
}) {
  if (rows.length === 0)
    return <Empty />;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.agent}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm text-cupboard-deep">
              {FRIENDLY_AGENT[r.agent] ?? r.agent}
            </span>
            <span className="text-sm font-mono text-cupboard-deep">
              {(r.rate * 100).toFixed(0)}%
              <span className="text-xs text-cupboard-warm ml-1.5">
                ({r.deflected}/{r.total})
              </span>
            </span>
          </div>
          <div className="h-2 bg-cupboard-stone/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-cupboard-accent rounded-full"
              style={{ width: `${r.rate * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DurationTable({
  rows,
}: {
  rows: DashboardData['duration'];
}) {
  if (rows.length === 0) return <Empty />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-cupboard-warm border-b border-cupboard-stone">
          <th className="text-left py-2 font-normal">Agent</th>
          <th className="text-right py-2 font-normal">Deflected</th>
          <th className="text-right py-2 font-normal">Escalated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.agent} className="border-b border-cupboard-stone/50 last:border-0">
            <td className="py-2 text-cupboard-deep">
              {FRIENDLY_AGENT[r.agent] ?? r.agent}
            </td>
            <td className="py-2 text-right font-mono text-cupboard-deep">
              {r.deflected_avg_minutes !== null
                ? `${r.deflected_avg_minutes.toFixed(1)} min`
                : '—'}
              <div className="text-[10px] text-cupboard-warm font-sans">
                n={r.deflected_count}
              </div>
            </td>
            <td className="py-2 text-right font-mono text-cupboard-deep">
              {r.escalated_avg_minutes !== null
                ? `${r.escalated_avg_minutes.toFixed(1)} min`
                : '—'}
              <div className="text-[10px] text-cupboard-warm font-sans">
                n={r.escalated_count}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EscalationChart({
  rows,
}: {
  rows: DashboardData['escalation'];
}) {
  if (rows.length === 0) return <Empty />;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.reason}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm text-cupboard-deep">
              {FRIENDLY_REASON[r.reason] ?? r.reason}
            </span>
            <span className="text-xs font-mono text-cupboard-deep">
              {r.count}
              <span className="text-cupboard-warm ml-1.5">
                {(r.percent * 100).toFixed(0)}%
              </span>
            </span>
          </div>
          <div className="h-1.5 bg-cupboard-stone/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-cupboard-warm rounded-full"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolsTable({
  rows,
}: {
  rows: DashboardData['tools'];
}) {
  if (rows.length === 0) return <Empty />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-cupboard-warm border-b border-cupboard-stone">
          <th className="text-left py-2 font-normal">Tool</th>
          <th className="text-right py-2 font-normal">Calls</th>
          <th className="text-right py-2 font-normal">Failure rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.tool}
            className="border-b border-cupboard-stone/50 last:border-0"
          >
            <td className="py-2 font-mono text-xs text-cupboard-deep">
              {FRIENDLY_TOOL[r.tool] ?? r.tool}
            </td>
            <td className="py-2 text-right font-mono text-cupboard-deep">
              {r.total.toLocaleString()}
            </td>
            <td className="py-2 text-right font-mono">
              <span
                className={cn(
                  r.failure_rate > 0.05
                    ? 'text-red-700'
                    : 'text-cupboard-deep'
                )}
              >
                {(r.failure_rate * 100).toFixed(1)}%
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OpportunityTable({
  rows,
}: {
  rows: DashboardData['opportunities'];
}) {
  if (rows.length === 0) return <Empty />;
  const maxScore = Math.max(...rows.map((r) => r.opportunity_score), 1);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-cupboard-warm border-b border-cupboard-stone">
          <th className="text-left py-2 font-normal">Intent</th>
          <th className="text-right py-2 font-normal">Volume</th>
          <th className="text-right py-2 font-normal">Handoff rate</th>
          <th className="text-left pl-6 py-2 font-normal">
            Opportunity (volume × handoff rate)
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.intent}
            className="border-b border-cupboard-stone/50 last:border-0"
          >
            <td className="py-2.5 text-cupboard-deep">
              <span className="text-cupboard-warm mr-2">{i + 1}.</span>
              {FRIENDLY_INTENT[r.intent] ?? r.intent}
            </td>
            <td className="py-2.5 text-right font-mono text-cupboard-deep">
              {r.volume.toLocaleString()}
            </td>
            <td className="py-2.5 text-right font-mono text-cupboard-deep">
              {(r.handoff_rate * 100).toFixed(0)}%
            </td>
            <td className="py-2.5 pl-6">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-cupboard-stone/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cupboard-accent rounded-full"
                    style={{
                      width: `${(r.opportunity_score / maxScore) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-mono text-cupboard-warm w-12 text-right">
                  {r.opportunity_score.toFixed(0)}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty() {
  return (
    <div className="text-sm text-cupboard-warm py-6 text-center">
      No data yet.
    </div>
  );
}
