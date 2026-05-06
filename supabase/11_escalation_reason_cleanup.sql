-- Cupboard Support: clean up escalation reason values (Phase 4)
-- Run this in the Supabase SQL Editor.
--
-- Earlier phases recorded escalation reasons as free-form sentences (e.g.,
-- "Agent recommended bringing in a human in its response", "returns agent
-- not yet implemented (Phase 3)"), which clutters the dashboard with low-
-- volume noise. Phase 4 simulation data uses clean keys
-- (auto_escalate_explicit_human, agent_decision_problem_order, etc.) that
-- map to friendly names in the UI.
--
-- This migration normalizes the legacy free-form reasons into the same key
-- space so the dashboard can render them under the right buckets.

update analytics_events
set reason = 'agent_decision_problem_order'
where reason ilike '%bringing in a human in its response%'
   or reason ilike '%recommended escalation%';

update analytics_events
set reason = 'auto_escalate_explicit_human'
where reason ilike '%explicit request for a%human%'
   or reason ilike '%explicit request for a real person%';

update analytics_events
set reason = 'low_confidence'
where reason ilike 'Low triage confidence:%';

update analytics_events
set reason = 'agent_decision_no_specialist'
where reason ilike '%not yet implemented%'
   or reason ilike '%agent not yet built%';

update analytics_events
set reason = 'auto_escalate_continuation'
where reason ilike '%continuation after handoff%';

-- Verify
select reason, count(*)
from analytics_events
where event_type in ('escalation_triggered', 'handoff_to_human')
  and reason is not null
group by reason
order by count(*) desc;
