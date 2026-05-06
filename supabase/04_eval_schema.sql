-- Cupboard Support: eval tool schema (Phase 2.5)
-- Run this in the Supabase SQL Editor AFTER 01_schema.sql.

-- ============================================================================
-- EVAL_CASES
-- ============================================================================
-- Each row is a test case: an input customer message + ground truth about
-- what should happen when that message is processed by the system.
create table if not exists eval_cases (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- human-readable label, e.g. "Delayed order with address verification hold"
  description text, -- optional longer context about what this case is testing
  customer_message text not null, -- the input we'll send through the system
  previous_assistant_message text, -- nullable; for testing continuation cases

  -- Ground truth assertions. Any field set to null = no assertion on that dimension.
  expected_intent text check (expected_intent in (
    'order_status', 'returns', 'product', 'account', 'general',
    'gibberish', 'continuation', 'unknown'
  )),
  expected_agent text check (expected_agent in (
    'triage', 'order_status', 'returns', 'product', 'account', 'general', 'human'
  )),
  expected_tools text[] default array[]::text[], -- tool names that should be called
  expected_should_escalate boolean,
  expected_severity text check (expected_severity in ('low', 'moderate', 'high', 'critical')),

  -- For cases that need a specific order/customer context to be testable.
  -- Eval runner will look these up and may inject them into the seed data
  -- if needed. For now, just metadata - the actual order is referenced by
  -- order_number in the customer_message itself.
  context_order_number text,

  tags text[] default array[]::text[], -- e.g. ['delayed', 'edge-case', 'triage-bug']
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_eval_cases_tags on eval_cases using gin(tags);

-- ============================================================================
-- EVAL_RUNS
-- ============================================================================
-- Each row is one execution of one case during one suite run.
-- A "suite run" creates many eval_runs rows (one per case).
create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references eval_cases(id) on delete cascade,
  suite_run_id uuid not null, -- groups all rows from the same suite run together
  mode text not null check (mode in ('triage_only', 'full_suite')),

  -- What we observed
  actual_intent text,
  actual_agent text,
  actual_tools text[] default array[]::text[],
  actual_should_escalate boolean,
  actual_severity text,
  actual_reply text, -- the final agent response (for full_suite mode)
  actual_confidence numeric(3,2),

  -- Per-dimension pass/fail (null = not asserted)
  intent_passed boolean,
  agent_passed boolean,
  tools_passed boolean,
  escalation_passed boolean,
  severity_passed boolean,

  -- Aggregate
  overall_passed boolean not null default false,

  -- Cost / debug data
  input_tokens int default 0,
  output_tokens int default 0,
  cost_cents numeric(10, 4) default 0, -- four decimals = supports fractions of a cent
  duration_ms int,
  error_message text, -- if the run errored, what happened

  created_at timestamptz not null default now()
);

create index if not exists idx_eval_runs_case on eval_runs(case_id);
create index if not exists idx_eval_runs_suite on eval_runs(suite_run_id);
create index if not exists idx_eval_runs_created on eval_runs(created_at desc);

-- ============================================================================
-- EVAL_SUITE_RUNS (aggregate metadata about each run)
-- ============================================================================
create table if not exists eval_suite_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('triage_only', 'full_suite')),
  tag_filter text, -- nullable; if set, only cases with this tag were run
  prompt_version text, -- free-form label e.g. "v1-locked", "v2-empathy-tweak"
  notes text, -- free-form notes about what changed in this version

  -- Aggregate scores (computed when run completes)
  total_cases int not null default 0,
  passed_cases int not null default 0,
  intent_accuracy numeric(5,4), -- 0.0000 to 1.0000
  agent_accuracy numeric(5,4),
  tools_accuracy numeric(5,4),
  escalation_accuracy numeric(5,4),
  severity_accuracy numeric(5,4),

  total_input_tokens int default 0,
  total_output_tokens int default 0,
  total_cost_cents numeric(10, 4) default 0,
  duration_ms int,

  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_eval_suite_runs_started on eval_suite_runs(started_at desc);

-- ============================================================================
-- RLS off (we'll guard via the admin gate in the API routes)
-- ============================================================================
alter table eval_cases disable row level security;
alter table eval_runs disable row level security;
alter table eval_suite_runs disable row level security;
