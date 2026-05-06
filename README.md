# Cupboard Support

A multi-agent customer support system for a fictional e-commerce home goods store. Built to demonstrate how AI can handle high-volume support tickets, route intelligently between specialist agents, and hand off cleanly to humans when needed — with a built-in analytics layer that surfaces deflection opportunities and escalation patterns.

**Stack:** Next.js 14 · Supabase · Claude API · Vercel · TypeScript · Tailwind

**Status:** Phase 2.5 complete (eval tool with 15 seed cases). Phase 3 next (remaining specialists).

---

## Why this exists

Every CX team in 2026 is trying to figure out the same thing: where does AI help, where does it hurt, and how do we measure the difference? Most "AI support" demos hand-wave past the hard parts — when does the bot give up, what categories should it never touch, how do you know if it's actually working.

This project models the real architecture: a triage agent that classifies intent, five specialist agents with scoped tools and knowledge, explicit escalation rules, and an analytics dashboard that shows where AI is working and where it isn't.

## Architecture

```
                    ┌──────────────────┐
   Customer ───────▶│   Triage Agent   │
                    │ (intent + entity │
                    │   extraction)    │
                    └────────┬─────────┘
                             │ routes by intent
        ┌────────────────────┼────────────────────┐
        ▼          ▼         ▼         ▼          ▼
   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │ Order  │ │Returns │ │Product │ │Account │ │General │
   │ Status │ │Refunds │ │Sizing  │ │Billing │ │  FAQ   │
   └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘ └────┬───┘
        │         │           │          │          │
        │   tool calls (lookup_order, check_return,│
        │   search_products, etc.) + RAG against   │
        │              policy KB                    │
        │                                           │
        └─────── Escalation Layer ─────────────────┘
                         │
                  ┌──────▼──────┐
                  │ Live Agent  │
                  │  Handoff    │
                  └─────────────┘

         All routing decisions, tool calls, and
         escalation triggers logged to analytics_events
                         │
                         ▼
                  ┌─────────────┐
                  │  Dashboard  │
                  └─────────────┘
```

### Escalation triggers

A conversation hands off to a human when **any** of these fire:

- Triage classification confidence below 0.7
- Customer explicitly asks for a human
- Negative sentiment for two consecutive turns
- Same agent fails to resolve after three turns
- Auto-escalate categories: charge disputes, damage claims over $X, legal/BBB mentions
- VIP-tier customer (handled by tier lookup)

## Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| 1. Data layer + chat shell | ✅ Done | Schema, seed data, chat UI, conversation logging |
| 2. Triage + Order Status | ✅ Done | First specialist agent, tool use, RAG plumbing |
| 2.5. Eval tool | ✅ Done | Admin page for labeled test cases + accuracy metrics |
| 3. Remaining specialists | 🔜 Next | Returns, Product, Account, General + handoff logic |
| 4. Analytics dashboard | | Volume, deflection, escalation reasons, opportunity finder |
| 5. Polish + writeup | | Demo video, blog post, portfolio polish |

## Setup

### 1. Supabase

Create a new Supabase project at [supabase.com](https://supabase.com).

In the SQL Editor, run these in order:

1. `supabase/01_schema.sql` — creates all tables
2. `supabase/02_seed.sql` — populates with realistic demo data (39 products, 50 customers, 200 orders, 6 policy docs)

### 2. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` from the same page (keep this secret)
- `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com) (only needed for Phase 2+)

### 3. Deploy

This project is built for the github.dev → Vercel auto-deploy workflow:

1. Push the repo to GitHub
2. Import it in Vercel
3. Add the env vars in the Vercel dashboard
4. Deploy

Phase 1 doesn't require the Anthropic key — you can deploy and test the chat plumbing end-to-end before wiring up the AI.

## Demo data

The seed script creates realistic edge cases on purpose. The demo will be much more impressive if you stress-test it against:

- An order that's been **delayed** past its ETA (`status = 'delayed'`)
- An order marked **lost** by the carrier
- An order **delivered** but customer claims they didn't receive it
- A return outside the 30-day window
- A VIP customer asking a routine question (should still escalate fast)
- An out-of-stock product inquiry
- A multi-intent message ("where's my order AND can I return it?")

These are the cases where naive bots fall apart. A good multi-agent system handles them gracefully — either by resolving correctly or by escalating with full context.

## Deliberate scope choices

A few things this system does NOT do, by design. Calling them out so a reader can see what was considered and chosen against, vs. simply missed:

### Identity verification

In a real production support bot, you can't let anyone who knows or guesses an order number initiate returns, change addresses, or cancel orders. Every real CX system has identity verification — usually email-on-account match, sometimes order number + zip code, sometimes a magic link. This demo skips that layer. Why: implementing real auth turns the project from "AI agent system" into "AI agent system + auth layer," which doubles the surface area without adding much to the architectural story. In a real deployment, the chat would require a logged-in session OR a verification step before any write action (initiate_return, address change, etc.).

### Real returns workflow

The schema represents returns as a few fields on the `orders` table. A real returns workflow has its own table with line items (which products are being returned), inspection states (received → inspected → approved/denied), restocking fees, exchange routing, etc. Cupboard models the customer-visible state only; everything else is out of scope.

### Real attachments / image handling

When the agent asks the customer to share a photo of damage, our chat UI doesn't actually accept attachments. The customer asking is still useful behavior (they can describe the damage, screenshot it for the human teammate, etc.), but a production system would handle file uploads with virus scanning, size limits, and storage.

### Real auth on the admin page

The `/admin` route is gated by a sessionStorage acknowledgment ("Are you sure?"). A token-burning visitor could click through it. Real auth was scoped out for the same reason as customer identity verification — different project.

## What this is not

- A production support system. The seed data is fake, the policies are fictional.
- A wrapper around an off-the-shelf agent framework. Everything is built directly against the Claude API to keep the architecture transparent.
- A solo Claude prompt with a fancy name.

---

Built by [Blake](https://www.linkedin.com/in/) — CX leader exploring the intersection of customer experience and AI tooling.
