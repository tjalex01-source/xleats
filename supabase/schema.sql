-- =============================================================================
-- XLeats — Phase 1 database schema
-- Run this once in a fresh Supabase project (SQL Editor → paste → Run).
--
-- Design notes:
--   * Customers and owners both live in `profiles` (1:1 with auth.users).
--   * An `account` sits above `trucks` so one owner can run many trucks.
--   * The four live states (live / scheduled / catering / off) live on
--     `live_sessions`, one row per truck per day.
--   * PRIVACY MODEL: trucks can NEVER read individual customer rows
--     (birthdays, zips, follow lists). They get aggregate counts and a
--     redeem-by-code flow through SECURITY DEFINER functions only.
-- =============================================================================

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type account_plan  as enum ('free', 'pro', 'fleet');
create type member_role   as enum ('owner', 'manager', 'worker');
create type live_status   as enum ('live', 'scheduled', 'catering', 'off', 'closed');
create type discount_type as enum ('percent', 'amount', 'free_item');
create type contest_type  as enum ('count', 'prediction');

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- Customer-only fields (birth_month/day, zip, home_lat/lng) are sensitive and
-- are never exposed to trucks — see RLS below.
-- ----------------------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'customer',   -- 'customer' | 'owner'
  display_name text,
  avatar_url   text,
  birth_month  int check (birth_month between 1 and 12),
  birth_day    int check (birth_day   between 1 and 31),
  zip          text,
  home_lat     double precision,
  home_lng     double precision,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'customer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- accounts  (the billing + multi-truck parent)
-- ----------------------------------------------------------------------------
create table accounts (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references profiles(id) on delete cascade,
  name               text not null,
  plan               account_plan not null default 'free',
  stripe_customer_id text,
  created_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- trucks
-- ----------------------------------------------------------------------------
create table trucks (
  id                  uuid primary key default gen_random_uuid(),
  account_id          uuid not null references accounts(id) on delete cascade,
  name                text not null,
  slug                text not null unique,   -- powers xleats.com/<slug>
  cuisine             text,
  bio                 text,
  logo_url            text,
  banner_url          text,
  instagram           text,
  service_radius_miles int not null default 10,
  created_at          timestamptz not null default now()
);
create index trucks_account_idx on trucks(account_id);

-- ----------------------------------------------------------------------------
-- truck_members  (workers; can_go_live lets a worker flip the dot)
-- ----------------------------------------------------------------------------
create table truck_members (
  id          uuid primary key default gen_random_uuid(),
  truck_id    uuid not null references trucks(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  role        member_role not null default 'worker',
  can_go_live boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (truck_id, user_id)
);

-- ----------------------------------------------------------------------------
-- menu_items / schedules / posts
-- ----------------------------------------------------------------------------
-- menu_items belongs to an account, not a single truck — applies_to_all_trucks
-- (default) shows it on every truck under that account, including ones added
-- later; set it false and use menu_item_trucks to restrict to a subset. This
-- is what lets a Fleet vendor edit one item and have it sync everywhere,
-- since it's the same row rather than a copy per truck.
create table menu_items (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null references accounts(id) on delete cascade,
  name                   text not null,
  description            text,
  price                  numeric(8,2),
  photo_url              text,
  category               text,
  sort_order             int not null default 0,
  is_available           boolean not null default true,
  applies_to_all_trucks  boolean not null default true,
  is_new                 boolean not null default false,
  is_catering            boolean not null default false,  -- Pro/Fleet-only catering menu
  created_at             timestamptz not null default now()
);
create index menu_items_account_idx on menu_items(account_id);

create table menu_item_trucks (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  truck_id     uuid not null references trucks(id) on delete cascade,
  primary key (menu_item_id, truck_id)
);

-- Vendor-uploaded whole-menu photos, for trucks that prefer a photo of their
-- physical menu board over itemized entry. Truck-scoped (not account-synced).
create table menu_photos (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references trucks(id) on delete cascade,
  image_url  text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index menu_photos_truck_idx on menu_photos(truck_id);

create table schedules (
  id            uuid primary key default gen_random_uuid(),
  truck_id      uuid not null references trucks(id) on delete cascade,
  recurring     boolean not null default false,
  day_of_week   int check (day_of_week between 0 and 6),   -- when recurring (0=Sun)
  date          date,                                       -- when one-off
  start_time    time,
  end_time      time,
  location_name text,
  address       text,
  lat           double precision,
  lng           double precision,
  is_closed     boolean not null default false,             -- explicit "not operating" for this day
  created_at    timestamptz not null default now()
);
create index schedules_truck_idx on schedules(truck_id);
-- One recurring entry per weekday per truck (one-off dated entries are unrestricted).
create unique index schedules_one_recurring_per_day
  on schedules (truck_id, day_of_week)
  where recurring = true;

create table posts (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references trucks(id) on delete cascade,
  body       text not null,
  image_url  text,
  created_at timestamptz not null default now()
);
create index posts_truck_idx on posts(truck_id, created_at desc);

-- ----------------------------------------------------------------------------
-- follows  (customer → truck).  Rows are private to the customer.
-- Trucks read follower COUNTS via a function, never the rows.
-- ----------------------------------------------------------------------------
create table follows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  truck_id   uuid not null references trucks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, truck_id)
);
create index follows_truck_idx on follows(truck_id);

-- ----------------------------------------------------------------------------
-- live_sessions  (the green/amber/purple/gray dot — one row per truck per day)
-- ----------------------------------------------------------------------------
create table live_sessions (
  id                uuid primary key default gen_random_uuid(),
  truck_id          uuid not null references trucks(id) on delete cascade,
  date              date not null default current_date,
  status            live_status not null default 'off',
  started_at        timestamptz,
  expires_at        timestamptz,
  confirmed_lat     double precision,   -- null for 'catering' (never broadcast a private address)
  confirmed_lng     double precision,
  confirmed_address text,
  catering_note     text,
  updated_at        timestamptz not null default now(),
  unique (truck_id, date)
);

-- Auto-expire stale "live" sessions. Schedule via pg_cron or a Vercel cron
-- that calls this (see README). Flips anything past expires_at back to 'off'.
create or replace function expire_stale_live_sessions()
returns void language sql security definer set search_path = public as $$
  update live_sessions
     set status = 'off', updated_at = now()
   where status = 'live'
     and expires_at is not null
     and expires_at < now();
$$;

-- ----------------------------------------------------------------------------
-- discount_codes / contests / contest_entries   (Pro tier)
-- ----------------------------------------------------------------------------
create table discount_codes (
  id              uuid primary key default gen_random_uuid(),
  truck_id        uuid not null references trucks(id) on delete cascade,
  code            text not null,
  type            discount_type not null,
  value           numeric(8,2),
  description     text,
  max_redemptions int,
  redemptions     int not null default 0,
  expires_at      timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (truck_id, code)
);

create table contests (
  id          uuid primary key default gen_random_uuid(),
  truck_id    uuid not null references trucks(id) on delete cascade,
  type        contest_type not null,
  title       text not null,
  description text,
  prize       text,
  status      text not null default 'open',   -- 'open' | 'closed'
  closes_at   timestamptz,
  answer      text,                            -- e.g. final score for a prediction
  created_at  timestamptz not null default now()
);

create table contest_entries (
  id          uuid primary key default gen_random_uuid(),
  contest_id  uuid not null references contests(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  entry_value text,
  created_at  timestamptz not null default now(),
  unique (contest_id, user_id)
);

-- ----------------------------------------------------------------------------
-- BIRTHDAY OFFERS  (the privacy-critical feature)
-- A truck defines a standing offer. The platform (service role, daily job)
-- matches eligible customers and writes birthday_redemptions rows with a code.
-- The truck only ever sees aggregate counts + can redeem a presented code.
-- ----------------------------------------------------------------------------
create table birthday_offers (
  id          uuid primary key default gen_random_uuid(),
  truck_id    uuid not null references trucks(id) on delete cascade,
  title       text not null,
  description text,
  radius_miles int,                 -- overrides truck.service_radius_miles when set
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table birthday_redemptions (
  id                uuid primary key default gen_random_uuid(),
  birthday_offer_id uuid not null references birthday_offers(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  code              text not null,
  delivered_on      date not null default current_date,
  redeemed_at       timestamptz,
  unique (birthday_offer_id, user_id, delivered_on)
);

-- ----------------------------------------------------------------------------
-- devices (push tokens) / notifications
-- ----------------------------------------------------------------------------
create table devices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform        text,
  updated_at      timestamptz not null default now()
);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  truck_id   uuid references trucks(id) on delete set null,
  kind       text,
  title      text,
  body       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index notifications_user_idx on notifications(user_id, created_at desc);

-- =============================================================================
-- Permission helpers (SECURITY DEFINER to avoid recursive RLS checks)
-- =============================================================================
create or replace function owns_or_manages_truck(p_truck uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from trucks t
      join accounts a on a.id = t.account_id
     where t.id = p_truck and a.owner_id = auth.uid()
  ) or exists (
    select 1 from truck_members m
     where m.truck_id = p_truck and m.user_id = auth.uid()
       and m.role in ('owner','manager')
  );
$$;

-- Account-level equivalent, for account-scoped tables like menu_items —
-- managing any one truck in the account is enough to manage its shared menu.
create or replace function owns_or_manages_account(p_account uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from accounts a where a.id = p_account and a.owner_id = auth.uid()
  ) or exists (
    select 1 from truck_members m
    join trucks t on t.id = m.truck_id
    where t.account_id = p_account and m.user_id = auth.uid() and m.role in ('owner','manager')
  );
$$;

create or replace function can_post_live(p_truck uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select owns_or_manages_truck(p_truck) or exists (
    select 1 from truck_members m
     where m.truck_id = p_truck and m.user_id = auth.uid() and m.can_go_live
  );
$$;

-- Aggregate-only readouts a truck IS allowed to see -------------------------
create or replace function truck_follower_count(p_truck uuid)
returns int language sql security definer stable set search_path = public as $$
  select count(*)::int from follows where truck_id = p_truck;
$$;

create or replace function birthday_offer_stats(p_truck uuid)
returns table (delivered int, redeemed int)
language sql security definer stable set search_path = public as $$
  select count(*)::int,
         count(*) filter (where r.redeemed_at is not null)::int
    from birthday_redemptions r
    join birthday_offers o on o.id = r.birthday_offer_id
   where o.truck_id = p_truck
     and owns_or_manages_truck(p_truck);   -- caller must manage the truck
$$;

-- Worker scans/enters a customer's birthday code at the window.
-- Returns true if a valid, unredeemed code for this truck was just redeemed.
-- Never returns the customer's identity.
create or replace function redeem_birthday_code(p_code text, p_truck uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare hit int;
begin
  if not owns_or_manages_truck(p_truck) then
    return false;
  end if;
  update birthday_redemptions r
     set redeemed_at = now()
    from birthday_offers o
   where o.id = r.birthday_offer_id
     and o.truck_id = p_truck
     and r.code = p_code
     and r.redeemed_at is null;
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table profiles             enable row level security;
alter table accounts             enable row level security;
alter table trucks               enable row level security;
alter table truck_members        enable row level security;
alter table menu_items           enable row level security;
alter table menu_item_trucks     enable row level security;
alter table menu_photos          enable row level security;
alter table schedules            enable row level security;
alter table posts                enable row level security;
alter table follows              enable row level security;
alter table live_sessions        enable row level security;
alter table discount_codes       enable row level security;
alter table contests             enable row level security;
alter table contest_entries      enable row level security;
alter table birthday_offers      enable row level security;
alter table birthday_redemptions enable row level security;
alter table devices              enable row level security;
alter table notifications        enable row level security;

-- profiles: you can only see/edit YOUR OWN row. Trucks cannot read customers.
create policy profiles_self_select on profiles for select using (id = auth.uid());
create policy profiles_self_upsert on profiles for insert with check (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid());

-- accounts: owner-only
create policy accounts_owner_all on accounts for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- trucks: public read (powers public pages); managers write
create policy trucks_public_read on trucks for select using (true);
create policy trucks_manage_insert on trucks for insert
  with check (exists (select 1 from accounts a where a.id = account_id and a.owner_id = auth.uid()));
create policy trucks_manage_update on trucks for update using (owns_or_manages_truck(id));
create policy trucks_manage_delete on trucks for delete
  using (exists (select 1 from accounts a where a.id = account_id and a.owner_id = auth.uid()));

-- truck_members: managers manage; a member can see their own membership
create policy members_read on truck_members for select
  using (user_id = auth.uid() or owns_or_manages_truck(truck_id));
create policy members_write on truck_members for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

-- menu / schedules / posts: public read, manager write
create policy menu_read   on menu_items for select using (true);
create policy menu_write  on menu_items for all
  using (owns_or_manages_account(account_id)) with check (owns_or_manages_account(account_id));

create policy menu_item_trucks_read  on menu_item_trucks for select using (true);
create policy menu_item_trucks_write on menu_item_trucks for all
  using (owns_or_manages_account((select account_id from menu_items where id = menu_item_id)))
  with check (owns_or_manages_account((select account_id from menu_items where id = menu_item_id)));

create policy menu_photos_read  on menu_photos for select using (true);
create policy menu_photos_write on menu_photos for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));
create policy sched_read  on schedules  for select using (true);
create policy sched_write on schedules  for all using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));
create policy posts_read  on posts      for select using (true);
create policy posts_write on posts      for all using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

-- follows: private to the customer. Trucks use truck_follower_count().
create policy follows_self on follows for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- live_sessions: public read (customers see the dot), can_post_live writes
create policy live_read  on live_sessions for select using (true);
create policy live_write on live_sessions for all using (can_post_live(truck_id)) with check (can_post_live(truck_id));

-- discount_codes / contests: public read, manager write
create policy disc_read  on discount_codes for select using (active);
create policy disc_write on discount_codes for all using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));
create policy contest_read  on contests for select using (true);
create policy contest_write on contests for all using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

-- contest_entries: customer creates/sees own; manager sees entries to their contest
create policy entries_insert on contest_entries for insert with check (user_id = auth.uid());
create policy entries_select on contest_entries for select
  using (user_id = auth.uid()
         or exists (select 1 from contests c where c.id = contest_id and owns_or_manages_truck(c.truck_id)));

-- birthday_offers: public read (customer sees what's available), manager write
create policy bday_offer_read  on birthday_offers for select using (active);
create policy bday_offer_write on birthday_offers for all using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

-- birthday_redemptions: ONLY the customer can read their own. No truck row access.
-- Inserts happen via the service-role daily job (bypasses RLS). Redemption is
-- via redeem_birthday_code(). So no policy grants trucks row-level visibility.
create policy bday_redeem_self on birthday_redemptions for select using (user_id = auth.uid());

-- devices / notifications: private to the user
create policy devices_self on devices for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_self_read   on notifications for select using (user_id = auth.uid());
create policy notif_self_update on notifications for update using (user_id = auth.uid());

-- =============================================================================
-- Storage buckets
-- =============================================================================
insert into storage.buckets (id, name, public) values
  ('logos',       'logos',       true),
  ('menu',        'menu',        true),  -- item photos, path: {account_id}/...
  ('menu-photos', 'menu-photos', true),  -- whole-menu photos, path: {truck_id}/...
  ('posts',       'posts',       true)
on conflict (id) do nothing;

create policy menu_bucket_read on storage.objects for select
  using (bucket_id = 'menu');
create policy menu_bucket_write on storage.objects for all
  using (bucket_id = 'menu' and owns_or_manages_account(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'menu' and owns_or_manages_account(((storage.foldername(name))[1])::uuid));

create policy menu_photos_bucket_read on storage.objects for select
  using (bucket_id = 'menu-photos');
create policy menu_photos_bucket_write on storage.objects for all
  using (bucket_id = 'menu-photos' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'menu-photos' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid));
