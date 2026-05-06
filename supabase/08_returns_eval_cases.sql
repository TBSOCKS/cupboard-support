-- Cupboard Support: Returns eval cases (Phase 3)
-- Run AFTER 07_returns_schema.sql.
--
-- Adds 8 new eval cases that exercise the Returns agent across the eligibility
-- verdicts and conversational patterns.
--
-- IMPORTANT: Some cases reference specific order numbers. The intent is to use:
--   - A delivered order within the 30-day window (for self-serve eligible)
--   - A delivered order > 30 days ago (for outside-window)
--   - An order already with return_status set (for "already returned")
--   - An in-transit order (for not-yet-delivered)
--
-- Find them with:
--   select order_number, status, delivered_at, return_status from orders
--     where status = 'delivered' and delivered_at > now() - interval '30 days' limit 1;
--   select order_number, status, delivered_at, return_status from orders
--     where status = 'delivered' and delivered_at < now() - interval '40 days' limit 1;
--   select order_number, return_status from orders where return_status is not null limit 1;
--
-- Update the order numbers below before running if needed. The cases are
-- inserted with placeholder order numbers (CB-RETURN-XX) which you'll need to
-- replace via the admin UI or these update statements after running.

insert into eval_cases (name, description, customer_message, previous_assistant_message, expected_intent, expected_agent, expected_tools, expected_should_escalate, expected_severity, tags) values

(
  'Return - eligible self-serve (within window)',
  'Customer wants to return an order delivered within 30 days. No damage. Agent should check eligibility and self-serve initiate the return.',
  'i want to return CB-RETURN-WITHIN, it just isnt working in our space',
  null,
  'returns',
  'returns',
  array['check_return_eligibility', 'initiate_return'],
  false,
  null,
  array['returns', 'happy-path', 'eligible-self-serve']
),
(
  'Return - outside 30-day window',
  'Customer wants to return an order delivered 40+ days ago. Agent should explain the policy directly without false-apologizing, offer to bring in a teammate if they have a special circumstance.',
  'can i return CB-RETURN-OLD i bought it months ago',
  null,
  'returns',
  'returns',
  array['check_return_eligibility'],
  true,
  null,
  array['returns', 'outside-window', 'escalation']
),
(
  'Return - damaged on arrival',
  'Customer reports a damaged item. Even within window, this should escalate (damage claims need teammate review).',
  'CB-RETURN-WITHIN arrived broken, theres a crack in the side',
  null,
  'returns',
  'returns',
  array['check_return_eligibility'],
  true,
  null,
  array['returns', 'damage', 'eligible-needs-human', 'escalation']
),
(
  'Return - already initiated',
  'Customer asks to return an order that already has a return in progress. Agent should pivot to giving them the existing return status.',
  'i want to return CB-RETURN-EXISTING',
  null,
  'returns',
  'returns',
  array['check_return_eligibility'],
  null,
  null,
  array['returns', 'already-returned']
),
(
  'Refund status check',
  'Customer asks where their refund is. Agent should look up status and share refund timeline.',
  'where is my refund for CB-RETURN-EXISTING',
  null,
  'returns',
  'returns',
  array['check_refund_status'],
  false,
  null,
  array['returns', 'refund-status']
),
(
  'Return - not yet delivered',
  'Customer wants to return an order that hasnt arrived yet. Agent should explain why this isnt a return and route them appropriately.',
  'i changed my mind about CB-RETURN-INTRANSIT, can i send it back when it gets here',
  null,
  'returns',
  'returns',
  array['check_return_eligibility'],
  null,
  null,
  array['returns', 'not-delivered', 'edge-case']
),
(
  'Return - confirmation continuation',
  'After agent describes a return setup, customer confirms with a short reply. Should be continuation, not a new returns request.',
  'yes please',
  'I can get that return started for you - youll get a label emailed and your refund of $48.00 should land within 14 days. Want me to go ahead?',
  'continuation',
  'returns',
  array[]::text[],
  null,
  null,
  array['returns', 'continuation', 'triage']
),
(
  'Return - missing order number',
  'Customer wants to return something but doesnt provide an order number. Agent should ask for it before any tool calls.',
  'i need to return something',
  null,
  'returns',
  'returns',
  array[]::text[],
  null,
  null,
  array['returns', 'incomplete-info']
);

-- Verify - should be 23 total cases now (15 from before + 8 new)
select count(*) as total_cases from eval_cases;
