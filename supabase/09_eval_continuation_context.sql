-- Cupboard Support: eval_cases column for continuation context (Phase 3)
-- Run this in the Supabase SQL Editor.
--
-- Adds previous_agent to eval_cases. When testing continuation messages,
-- the runner needs to know which specialist the customer was last talking
-- to so it can route correctly. Without this, continuation cases that
-- expect a specific specialist always fail because the runner has no
-- way to know who they're continuing with.

alter table eval_cases add column if not exists previous_agent text check (
  previous_agent in (
    'triage', 'order_status', 'returns', 'product', 'account', 'general', 'human'
  )
);

-- Backfill: existing continuation cases that reference returns specialist
update eval_cases
set previous_agent = 'returns'
where name = 'Return - confirmation continuation';

-- Update the now-stale "Out-of-scope routing - returns" case. Returns is built;
-- this case should expect routing to returns, not human.
update eval_cases
set
  expected_agent = 'returns',
  expected_should_escalate = false,
  description = 'Customer asks a returns question. Triage should classify as returns and route to the Returns specialist.'
where name = 'Out-of-scope routing - returns';

-- Verify
select name, expected_agent, previous_agent
from eval_cases
where name in (
  'Return - confirmation continuation',
  'Out-of-scope routing - returns'
);
