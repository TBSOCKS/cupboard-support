-- Cupboard Support: seed eval cases (Phase 2.5)
-- Run AFTER 04_eval_schema.sql
--
-- These cases are drawn from the actual testing journey of this build:
-- the original 6 manual tests, the bugs we discovered, and a few new edge
-- cases that exercise the system in ways we haven't tested yet.

-- IMPORTANT: Some cases reference specific order numbers from the seed data.
-- If your seed data uses different order numbers, update the messages here
-- to match a real order_number from your `orders` table with the right status.
--
-- Find a delivered order: select order_number from orders where status = 'delivered' limit 1;
-- Find a delayed order: select order_number from orders where status = 'delayed' limit 1;
-- Find a lost order: select order_number from orders where status = 'lost' limit 1;

insert into eval_cases (name, description, customer_message, previous_assistant_message, expected_intent, expected_agent, expected_tools, expected_should_escalate, expected_severity, tags) values

-- ============================================================================
-- ORIGINAL 6 MANUAL TESTS
-- ============================================================================
(
  'Delivered order - simple lookup',
  'Customer asks where their order is, no problem indicated. Should route to Order Status, look up the order, and respond with delivery info.',
  'where is my order CB-100002',
  null,
  'order_status',
  'order_status',
  array['lookup_order'],
  false,
  'low',
  array['triage', 'order-status', 'happy-path']
),
(
  'Delayed order - typed casually',
  'Customer is casually frustrated about a delayed order. Should route to Order Status, look up, escalate.',
  'hey my order CB-106165 hasnt come yet whats going on',
  null,
  'order_status',
  'order_status',
  array['lookup_order'],
  true,
  'high',
  array['triage', 'order-status', 'delayed', 'escalation']
),
(
  'Missing order number',
  'Customer asks about an order without providing the number. Agent should ask for it before doing anything.',
  'where is my order',
  null,
  'order_status',
  'order_status',
  array[]::text[],
  false,
  null,
  array['triage', 'order-status', 'incomplete-info']
),
(
  'Explicit human request',
  'Customer wants a real person. Should auto-escalate via triage without running any specialist.',
  'can i talk to a real person',
  null,
  null,
  'human',
  array[]::text[],
  true,
  null,
  array['triage', 'auto-escalate', 'explicit-human']
),
(
  'Out-of-scope routing - returns',
  'Customer asks a returns question. Triage should classify as returns. (Specialist not built yet, will fall through to handoff in Phase 2.)',
  'can i return something i bought last week',
  null,
  'returns',
  'human',
  array[]::text[],
  true,
  null,
  array['triage', 'returns-routing']
),
(
  'Gibberish input',
  'Keyboard mash. Should classify as gibberish and get a playful reply, not an escalation.',
  'sdkjfh',
  null,
  'gibberish',
  'general',
  array[]::text[],
  false,
  null,
  array['triage', 'gibberish']
),

-- ============================================================================
-- BUGS WE FIXED ALONG THE WAY
-- ============================================================================
(
  'Continuation - "refund" reply mid-handoff',
  'After agent asks "replacement or refund," customer replies "refund". Triage must NOT classify as returns - that is a continuation of the existing flow.',
  'refund',
  'I''m going to bring in a teammate who can authorize a replacement or refund - they''ll be with you shortly. If you have a preference between the two, feel free to mention it and I''ll pass that along.',
  'continuation',
  'human',
  array[]::text[],
  true,
  null,
  array['triage', 'continuation', 'bug-regression']
),
(
  'Continuation - "yes" reply',
  'Short affirmative reply to a question. Should be continuation, not unknown or general.',
  'yes',
  'Does this address look correct: 1225 E Pike St, Seattle, WA 98122?',
  'continuation',
  null,
  array[]::text[],
  null,
  null,
  array['triage', 'continuation']
),
(
  'Lost order',
  'Customer reports lost order. Should compute critical severity, take ownership posture, escalate.',
  'where is CB-126167',
  null,
  'order_status',
  'order_status',
  array['lookup_order'],
  true,
  'critical',
  array['order-status', 'critical', 'lost', 'escalation']
),
(
  'Long total wait time',
  'Customer ordered weeks ago, status still in flight. Severity should be high based on total wait, even if latest ETA is recent.',
  'i ordered CB-104137 like two months ago and its still not here',
  null,
  'order_status',
  'order_status',
  array['lookup_order'],
  true,
  'high',
  array['order-status', 'severity-bug-regression', 'long-wait']
),

-- ============================================================================
-- NEW EDGE CASES NOT YET TESTED
-- ============================================================================
(
  'Multi-intent message',
  'Customer asks two things at once - where is the order AND can they return it. Triage should pick the more urgent intent (order status) and the agent should mention it can route the other concern after.',
  'where is my order CB-100002 and also i want to return one of the items',
  null,
  'order_status',
  'order_status',
  array['lookup_order'],
  null,
  null,
  array['triage', 'multi-intent', 'edge-case']
),
(
  'Very short ambiguous message',
  'One word, ambiguous. Could be a real attempt, could be a misclick. Triage should not auto-escalate but should likely route to general or unknown.',
  'help',
  null,
  null,
  null,
  array[]::text[],
  null,
  null,
  array['triage', 'ambiguous', 'edge-case']
),
(
  'Rude/profane message',
  'Customer is angry and using profanity. Should auto-escalate per the abuse rule.',
  'this is fucking ridiculous where is my order',
  null,
  null,
  'human',
  array[]::text[],
  true,
  null,
  array['triage', 'auto-escalate', 'abuse']
),
(
  'Legal threat',
  'Customer mentions a lawsuit. Should auto-escalate immediately regardless of other intent signals.',
  'if my order isnt here by friday im calling my lawyer',
  null,
  null,
  'human',
  array[]::text[],
  true,
  null,
  array['triage', 'auto-escalate', 'legal']
),
(
  'Product question - sizing',
  'Customer asks about product sizing before purchase. Routes to product specialist (not yet built, falls through to handoff in Phase 2).',
  'do you have the cotton percale duvet cover in king size?',
  null,
  'product',
  'human',
  array[]::text[],
  true,
  null,
  array['triage', 'product-routing']
);

-- Verify: should be 15 cases
select count(*) as total_cases from eval_cases;
