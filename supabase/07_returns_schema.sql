-- Cupboard Support: Returns schema (Phase 3)
-- Run this in the Supabase SQL Editor.
--
-- Approach: Option A - minimal schema. Add return-tracking fields to the
-- existing orders table. Each order can have at most one return. The
-- return_status follows a simple lifecycle: null → 'initiated' → 'received'
-- → 'refunded'. Manual operations workflows (label generation, package
-- inspection, etc.) are out of scope - this is the customer-visible state.

alter table orders add column if not exists return_initiated_at timestamptz;
alter table orders add column if not exists return_status text check (
  return_status in ('initiated', 'received', 'refunded', 'denied')
);
alter table orders add column if not exists return_reason text;
alter table orders add column if not exists return_refund_expected_by date;
alter table orders add column if not exists return_label_url text;

-- Backfill: populate return data for orders that are already 'returned' or
-- 'refunded' so the agent has realistic data to query.
update orders
set
  return_initiated_at = delivered_at + interval '5 days',
  return_status = 'received',
  return_reason = 'Did not match expectations',
  return_refund_expected_by = (delivered_at + interval '15 days')::date,
  return_label_url = 'https://example.com/returns/label/' || order_number
where status = 'returned'
  and return_status is null
  and delivered_at is not null;

update orders
set
  return_initiated_at = delivered_at + interval '4 days',
  return_status = 'refunded',
  return_reason = 'Damaged in shipping',
  return_refund_expected_by = (delivered_at + interval '12 days')::date,
  return_label_url = 'https://example.com/returns/label/' || order_number
where status = 'refunded'
  and return_status is null
  and delivered_at is not null;

-- Verify
select
  count(*) filter (where return_status = 'received') as received_count,
  count(*) filter (where return_status = 'refunded') as refunded_count,
  count(*) filter (where return_status is null) as no_return
from orders;
