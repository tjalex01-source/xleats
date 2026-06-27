# XLeats — owner dashboard (Phase 1)

The food-truck owner web app: accounts, multi-truck management, menu, schedule,
posts, one-tap live status, and Pro-tier promos (discounts + privacy-safe
birthday offers). Next.js 14 (App Router) + Supabase + Tailwind, deployed on
Vercel. The customer mobile app (Expo) is a separate Phase 1 workstream — this
repo is the owner/web side, which also serves the public truck pages.

---

## What's in this repo

```
supabase/
  schema.sql        ← run FIRST. Tables, enums, PostGIS, RLS, helper functions.
  functions.sql     ← run SECOND. The daily birthday-matching job.
src/
  app/
    page.tsx                          landing
    login/ signup/                    auth (Supabase email/password)
    dashboard/                        owner area (auth-guarded by middleware)
      page.tsx                        multi-truck home, live status per truck
      new-truck/                      create account + truck (free = 1 truck)
      trucks/[truckId]/
        page.tsx                      truck hub + StatusControl (the live dot)
        menu/ schedule/ posts/ promos/
    api/
      live/                           upserts today's live_sessions row
      cron/expire/                    flips stale live sessions to off (*/15 min)
      cron/birthdays/                 runs the birthday matcher (daily)
  components/StatusControl.tsx        signature 4-state go-live control + GPS
  lib/supabase/                       browser / server / admin / middleware clients
```

## Setup (when you get home)

1. **Create the Supabase project.** In the SQL Editor, run `supabase/schema.sql`,
   then `supabase/functions.sql`. This enables PostGIS, builds every table, turns
   on Row Level Security, and creates the storage buckets (`logos`, `menu`, `posts`).

2. **New GitHub repo** → push this project.

3. **New Vercel project** → import the repo. Add env vars (from `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → API)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; powers the cron jobs)
   - `CRON_SECRET` (any long random string)
   - `NEXT_PUBLIC_SITE_URL` = `https://xleats.com`

4. **Crons** are declared in `vercel.json` (expire every 15 min, birthdays daily
   at 13:00 UTC). Vercel sends them with the `CRON_SECRET` bearer token, which the
   routes check. No extra setup needed beyond the env var.

5. `npm install && npm run dev` to run locally.

## The privacy model (important)

Trucks can **never** read individual customer rows. This is enforced at the
database level, not just the UI:

- `profiles` RLS: a user can only select their own row. Birthdays, zips, and home
  coordinates are never visible to a truck.
- `follows` RLS: private to the customer. Trucks get a number via
  `truck_follower_count()`, never the list.
- `birthday_redemptions` RLS: a customer sees only their own delivered code. The
  daily matcher runs as the service role and writes codes; the truck sees only
  `birthday_offer_stats()` (delivered / redeemed counts) and redeems a presented
  code via `redeem_birthday_code()` — which returns true/false, never an identity.

If you ever loosen these policies, that's the thing to be careful about.

## What's built vs. stubbed

**Working:** auth, account + multi-truck creation with free-tier gating, the
four-state live control with browser GPS capture and auto-expiry windows, menu
CRUD, schedule builder, posts, discount codes, birthday-offer setup with
aggregate stats, and both cron endpoints.

**Marked `TODO(phase1)` in the code, wires in next:**
- Photo upload to the Storage buckets (menu/logo/post images).
- Push fan-out to followers when a truck goes live or posts (reads `devices` +
  Expo push). The notification rows are already being written.
- Map pin picker for schedule lat/lng (the columns exist; the birthday radius
  match already uses them).
- Stripe checkout to flip an account `free → pro`.
- Public truck page at `/[slug]` (data + RLS are ready; it's a read-only render).
- Contests UI (tables ready).

## Stack notes

- Single Vercel project with route handlers for the API (no separate backend).
- `claude-sonnet-4-6` is the model string to use if/when AI features get added.
- Stripe, when added, uses live mode with `STRIPE_SECRET_API_KEY` per your convention.
