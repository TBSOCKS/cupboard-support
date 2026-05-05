-- Cupboard Support System Schema
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New Query)

-- ============================================================================
-- CUSTOMERS
-- ============================================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  first_name text not null,
  last_name text not null,
  phone text,
  tier text not null default 'standard' check (tier in ('standard', 'plus', 'vip')),
  created_at timestamptz not null default now(),
  notes text -- e.g. "Repeat customer", "Previously escalated"
);

create index if not exists idx_customers_email on customers(email);

-- ============================================================================
-- PRODUCTS
-- ============================================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  category text not null, -- 'kitchen', 'bath', 'bedding', 'storage', 'decor'
  description text not null,
  price_cents integer not null,
  materials text,
  dimensions text,
  care_instructions text,
  in_stock boolean not null default true,
  inventory_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_sku on products(sku);
create index if not exists idx_products_category on products(category);

-- ============================================================================
-- ORDERS
-- ============================================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null, -- human-readable, e.g. "CB-104829"
  customer_id uuid not null references customers(id) on delete cascade,
  status text not null check (status in (
    'pending', 'processing', 'shipped', 'in_transit', 'delivered',
    'delayed', 'lost', 'returned', 'refunded', 'cancelled'
  )),
  subtotal_cents integer not null,
  shipping_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null,
  shipping_address text not null,
  carrier text, -- 'UPS', 'FedEx', 'USPS'
  tracking_number text,
  ordered_at timestamptz not null default now(),
  shipped_at timestamptz,
  delivered_at timestamptz,
  estimated_delivery_at timestamptz,
  notes text -- e.g. "Address correction needed", "Damaged in transit"
);

create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_number on orders(order_number);
create index if not exists idx_orders_status on orders(status);

-- ============================================================================
-- ORDER ITEMS
-- ============================================================================
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity integer not null default 1,
  unit_price_cents integer not null
);

create index if not exists idx_order_items_order on order_items(order_id);

-- ============================================================================
-- POLICIES (knowledge base for RAG later)
-- ============================================================================
create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  topic text not null, -- 'returns', 'shipping', 'warranty', etc.
  title text not null,
  content text not null,
  effective_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists idx_policies_topic on policies(topic);

-- ============================================================================
-- CONVERSATIONS
-- ============================================================================
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null, -- null = unauthenticated
  customer_email text, -- captured from chat if not logged in
  status text not null default 'active' check (status in (
    'active', 'resolved', 'escalated_to_human', 'abandoned'
  )),
  current_agent text, -- 'triage', 'order_status', 'returns', 'product', 'account', 'general', 'human'
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  resolution_summary text
);

create index if not exists idx_conversations_status on conversations(status);
create index if not exists idx_conversations_started on conversations(started_at desc);

-- ============================================================================
-- MESSAGES
-- ============================================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  agent text, -- which agent generated this (null for user messages)
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

-- ============================================================================
-- ANALYTICS EVENTS
-- ============================================================================
-- This is the table that powers the dashboard. Every routing decision,
-- tool call, and escalation gets logged here with reason codes.
create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  event_type text not null check (event_type in (
    'conversation_started',
    'triage_classification',
    'agent_routed',
    'tool_called',
    'tool_succeeded',
    'tool_failed',
    'escalation_triggered',
    'handoff_to_human',
    'conversation_resolved',
    'conversation_abandoned'
  )),
  agent text,
  intent_category text, -- the classified intent
  confidence numeric(3,2), -- 0.00 to 1.00
  reason text, -- why escalation was triggered, why a tool failed, etc.
  metadata jsonb, -- flexible blob for tool inputs/outputs etc.
  created_at timestamptz not null default now()
);

create index if not exists idx_events_conversation on analytics_events(conversation_id);
create index if not exists idx_events_type on analytics_events(event_type);
create index if not exists idx_events_created on analytics_events(created_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- For Phase 1, we'll keep RLS off and use the service role key from server-side
-- API routes. We can lock this down properly in a later phase.
alter table customers disable row level security;
alter table products disable row level security;
alter table orders disable row level security;
alter table order_items disable row level security;
alter table policies disable row level security;
alter table conversations disable row level security;
alter table messages disable row level security;
alter table analytics_events disable row level security;
