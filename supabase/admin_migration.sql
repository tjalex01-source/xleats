-- =============================================================================
-- XLeats — Admin panel migration
-- Run this once in the Supabase SQL Editor, AFTER schema.sql + functions.sql.
--
-- Adds:
--   * 'fleet' as a real, assignable plan tier (was free/pro only).
--   * accounts.suspended / plan_expires_at / comp_note — lets the platform
--     admin suspend a vendor or comp them Pro/Fleet for a limited time or
--     for life, without Stripe being wired up yet.
--   * Locks down which columns a vendor can update on their OWN account row.
--     Today's `accounts_owner_all` policy grants full row access, which
--     (combined with Supabase's default table-level GRANTs) means a vendor
--     could currently call the API directly and set their own plan/suspended
--     state. This revokes that and only allows self-service on `name`.
--   * announcements table — in-app messages from the admin to one vendor
--     or broadcast to all, read-only for vendors (writes go through the
--     service-role admin client only).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fleet tier
-- Run this statement by itself — Postgres won't allow a new enum value to be
-- used in the same transaction it was added in. If you're pasting this whole
-- file into one SQL Editor query, that's fine here since nothing below
-- inserts/updates a row to 'fleet'; only run it standalone if you ever see
-- "unsafe use of new value" errors.
-- ----------------------------------------------------------------------------
alter type account_plan add value if not exists 'fleet';

-- ----------------------------------------------------------------------------
-- 2. Suspension + comp tracking
-- ----------------------------------------------------------------------------
alter table accounts add column if not exists suspended boolean not null default false;
alter table accounts add column if not exists plan_expires_at timestamptz;
alter table accounts add column if not exists comp_note text;

-- ----------------------------------------------------------------------------
-- 3. Lock down self-service writes on accounts
-- Vendors can still read their own full account row (the dashboard needs to
-- show plan/suspended state) and create their account at signup, but plan/
-- suspended/expiry/comp fields are now admin-only — the admin panel writes
-- through the service-role client, which bypasses RLS and column grants
-- entirely. Without this, today's "owner can do anything to their own row"
-- policy plus Supabase's default grants would let a vendor call the API
-- directly and set their own plan to 'pro'/'fleet' or un-suspend themselves.
-- ----------------------------------------------------------------------------
revoke insert, update on accounts from authenticated;
grant insert (owner_id, name) on accounts to authenticated;
grant update (name) on accounts to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Announcements (admin -> vendor in-app messages)
-- ----------------------------------------------------------------------------
create table if not exists announcements (
  id                 uuid primary key default gen_random_uuid(),
  target_account_id  uuid references accounts(id) on delete cascade, -- null = broadcast to all
  title              text not null,
  body               text not null,
  created_at         timestamptz not null default now()
);
alter table announcements enable row level security;

-- Vendors can read announcements aimed at them or broadcast to everyone.
-- No insert/update/delete policy for the authenticated role on purpose —
-- only the admin panel (service-role client) writes announcements.
create policy announcements_read on announcements for select
  using (
    target_account_id is null
    or exists (
      select 1 from accounts a where a.id = target_account_id and a.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Cron helper: revert expired comps back to free
-- ----------------------------------------------------------------------------
create or replace function expire_comped_plans()
returns void language plpgsql security definer set search_path = public as $$
begin
  update accounts
  set plan = 'free', plan_expires_at = null
  where plan_expires_at is not null and plan_expires_at < now();
end;
$$;
