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
create type contest_type  as enum ('count', 'prediction', 'first_n', 'raffle', 'manual', 'milestone');
create type offer_type    as enum ('birthday', 'holiday', 'new_follower', 'custom');

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
  facebook            text,
  website_url         text,
  phone               text,
  email               text,
  show_phone          boolean not null default false,
  show_email          boolean not null default false,
  order_url           text,  -- link-out to the vendor's own ordering system (Square, etc.)
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

-- truck_photos: customer photos, rendered as a carousel on the public page
create table truck_photos (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references trucks(id) on delete cascade,
  image_url  text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index truck_photos_truck_idx on truck_photos(truck_id);

-- A day (recurring weekday or a specific one-off date) can have MULTIPLE rows
-- — a morning spot and a different afternoon spot, or a spot plus a catering
-- block later. Ordering within a day comes from start_time, not uniqueness.
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
  is_closed     boolean not null default false,             -- explicit "not operating" for this slot
  is_catering   boolean not null default false,             -- private event — public view shows "Closed"
  created_at    timestamptz not null default now()
);
create index schedules_truck_idx on schedules(truck_id);

-- Frequently-used spots a vendor can pick from a dropdown instead of
-- retyping. Truck-scoped, not shared across a Fleet account's trucks.
create table saved_locations (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references trucks(id) on delete cascade,
  name       text not null,
  address    text,
  lat        double precision,
  lng        double precision,
  created_at timestamptz not null default now()
);
create index saved_locations_truck_idx on saved_locations(truck_id);

create table posts (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references trucks(id) on delete cascade,
  body       text not null,
  image_url  text,
  created_at timestamptz not null default now()
);
create index posts_truck_idx on posts(truck_id, created_at desc);

-- ----------------------------------------------------------------------------
-- catering_requests  (public marketing CTA submissions — no login required)
-- ----------------------------------------------------------------------------
create table catering_requests (
  id             uuid primary key default gen_random_uuid(),
  truck_id       uuid not null references trucks(id) on delete cascade,
  requester_name text not null,
  email          text not null,
  phone          text,
  event_date     date not null,
  headcount      int,
  location       text,
  note           text,
  created_at     timestamptz not null default now()
);
create index catering_requests_truck_idx on catering_requests(truck_id);

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
  id               uuid primary key default gen_random_uuid(),
  truck_id         uuid not null references trucks(id) on delete cascade,
  type             contest_type not null,
  title            text not null,
  description      text,
  prize            text,
  status           text not null default 'open',   -- 'open' | 'closed'
  closes_at        timestamptz,
  answer           text,                            -- e.g. final score for a prediction
  winner_limit     int,                             -- # of winners for first_n / raffle
  winner_note      text,                            -- freeform winner for 'manual'/'milestone' contests
  winner_entry_ids uuid[] not null default '{}',     -- resolved winners for first_n/raffle/prediction
  target_count     int,                              -- milestone: which customer # wins (e.g. 100)
  tap_count        int not null default 0,           -- milestone: live counter, vendor taps after each sale
  winner_user_id   uuid references profiles(id),      -- nullable; reserved for a future customer-app self-claim flow
  created_at       timestamptz not null default now()
);

create table contest_entries (
  id               uuid primary key default gen_random_uuid(),
  contest_id       uuid not null references contests(id) on delete cascade,
  user_id          uuid not null references profiles(id) on delete cascade,
  entry_value      text,
  redemption_code  text,       -- stamped on winning entries so they can claim a prize at the window later
  redeemed_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (contest_id, user_id)
);

-- ----------------------------------------------------------------------------
-- OFFERS  (the privacy-critical feature)
-- A truck defines a standing offer of one of several types (birthday,
-- holiday/seasonal on a date, welcome-new-follower, or a custom date). The
-- platform (service role) matches eligible customers and writes
-- offer_redemptions rows with a code — birthday/holiday/custom via the daily
-- generate_scheduled_offers() cron, new_follower immediately via a trigger
-- on follows. The truck only ever sees aggregate counts + can redeem a
-- presented code.
-- ----------------------------------------------------------------------------
create table offers (
  id            uuid primary key default gen_random_uuid(),
  truck_id      uuid not null references trucks(id) on delete cascade,
  offer_type    offer_type not null default 'birthday',
  title         text not null,
  description   text,
  radius_miles  int,                 -- overrides truck.service_radius_miles when set
  trigger_month int check (trigger_month between 1 and 12),  -- holiday/custom: recurring annual date
  trigger_day   int check (trigger_day between 1 and 31),
  trigger_date  date,                                        -- holiday/custom: one-time date
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table offer_redemptions (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid not null references offers(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  code         text not null,
  delivered_on date not null default current_date,
  redeemed_at  timestamptz,
  unique (offer_id, user_id, delivered_on)
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

-- One row PER OFFER — a truck can run several offers (birthday, holiday,
-- welcome) at once.
create or replace function offer_stats(p_truck uuid)
returns table (offer_id uuid, delivered int, redeemed int)
language sql security definer stable set search_path = public as $$
  select o.id,
         count(r.id)::int,
         count(r.id) filter (where r.redeemed_at is not null)::int
    from offers o
    left join offer_redemptions r on r.offer_id = o.id
   where o.truck_id = p_truck
     and owns_or_manages_truck(p_truck)
   group by o.id;
$$;

-- Worker scans/enters a customer's offer code at the window.
-- Returns true if a valid, unredeemed code for this truck was just redeemed.
-- Never returns the customer's identity.
create or replace function redeem_offer_code(p_code text, p_truck uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare hit int;
begin
  if not owns_or_manages_truck(p_truck) then
    return false;
  end if;
  update offer_redemptions r
     set redeemed_at = now()
    from offers o
   where o.id = r.offer_id
     and o.truck_id = p_truck
     and r.code = p_code
     and r.redeemed_at is null;
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

-- Daily matcher: birthday offers match per-customer birthdays. holiday/custom
-- offers match on a trigger date (recurring annual trigger_month/day, or a
-- specific one-time trigger_date) and go to EVERY follower + nearby
-- customer, not just people with a birthday today. new_follower offers are
-- NOT handled here — see handle_new_follow() below.
create or replace function generate_scheduled_offers(p_date date default current_date)
returns int
language plpgsql security definer set search_path = public, postgis, extensions as $$
declare
  v_month int := extract(month from p_date)::int;
  v_day   int := extract(day   from p_date)::int;
  v_count int := 0;
  o       record;
  p       record;
  v_radius int;
  v_truck_lat double precision;
  v_truck_lng double precision;
begin
  for o in
    select ofr.*, t.service_radius_miles
      from offers ofr
      join trucks t on t.id = ofr.truck_id
     where ofr.active
       and ofr.offer_type in ('birthday', 'holiday', 'custom')
  loop
    if o.offer_type in ('holiday', 'custom') then
      if not (
        (o.trigger_date is not null and o.trigger_date = p_date)
        or (o.trigger_date is null and o.trigger_month = v_month and o.trigger_day = v_day)
      ) then
        continue; -- not today, skip
      end if;
    end if;

    v_radius := coalesce(o.radius_miles, o.service_radius_miles, 10);

    select s.lat, s.lng into v_truck_lat, v_truck_lng
      from schedules s
     where s.truck_id = o.truck_id
       and (s.date = p_date
            or (s.recurring and s.day_of_week = extract(dow from p_date)::int))
       and s.lat is not null
     order by s.date nulls last
     limit 1;

    for p in
      select pr.id
        from profiles pr
       where pr.role = 'customer'
         and (
           o.offer_type != 'birthday'
           or (pr.birth_month = v_month and pr.birth_day = v_day)
         )
         and (
              exists (select 1 from follows f where f.user_id = pr.id and f.truck_id = o.truck_id)
              or (
                v_truck_lat is not null and pr.home_lat is not null
                and st_distancesphere(
                      st_makepoint(pr.home_lng, pr.home_lat),
                      st_makepoint(v_truck_lng, v_truck_lat)
                    ) <= v_radius * 1609.34
              )
         )
    loop
      insert into offer_redemptions (offer_id, user_id, code, delivered_on)
      values (
        o.id, p.id,
        upper(o.offer_type::text) || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
        p_date
      )
      on conflict (offer_id, user_id, delivered_on) do nothing;

      if found then
        v_count := v_count + 1;
        insert into notifications (user_id, truck_id, kind, title, body)
        values (p.id, o.truck_id, o.offer_type::text,
                case o.offer_type when 'birthday' then 'Happy birthday! 🎉' else o.title end,
                o.title || ' — show your code at the window.');
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;

-- new_follower offers fire the instant someone follows — can't wait a day.
create or replace function handle_new_follow()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare o record;
begin
  for o in
    select * from offers
     where truck_id = new.truck_id
       and offer_type = 'new_follower'
       and active
  loop
    insert into offer_redemptions (offer_id, user_id, code, delivered_on)
    values (o.id, new.user_id,
            'WELCOME-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
            current_date)
    on conflict (offer_id, user_id, delivered_on) do nothing;
    if found then
      insert into notifications (user_id, truck_id, kind, title, body)
      values (new.user_id, new.truck_id, 'new_follower', o.title,
              o.title || ' — show your code at the window.');
    end if;
  end loop;
  return new;
end;
$$;

-- Resolves winners for a contest based on its type. Returns winner count.
create or replace function resolve_contest_winners(p_contest uuid)
returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  c record;
  v_ids uuid[];
begin
  select * into c from contests where id = p_contest;
  if c is null or not owns_or_manages_truck(c.truck_id) then
    return 0;
  end if;

  if c.type = 'first_n' then
    select array_agg(id) into v_ids from (
      select id from contest_entries where contest_id = p_contest
       order by created_at asc limit coalesce(c.winner_limit, 1)
    ) x;
  elsif c.type = 'raffle' then
    select array_agg(id) into v_ids from (
      select id from contest_entries where contest_id = p_contest
       order by random() limit coalesce(c.winner_limit, 1)
    ) x;
  elsif c.type = 'prediction' then
    if c.answer is not null and c.answer ~ '^-?\d+(\.\d+)?$' then
      select array_agg(id) into v_ids from (
        select id from contest_entries
         where contest_id = p_contest and entry_value ~ '^-?\d+(\.\d+)?$'
         order by abs(entry_value::numeric - c.answer::numeric) asc
         limit coalesce(c.winner_limit, 1)
      ) x;
    else
      select array_agg(id) into v_ids
        from contest_entries where contest_id = p_contest and entry_value = c.answer;
    end if;
  else
    v_ids := '{}';
  end if;

  update contests set winner_entry_ids = coalesce(v_ids, '{}'), status = 'closed' where id = p_contest;

  -- Stamp a claim code on winning entries so they can be verified at the
  -- window later, same pattern as offer codes.
  if v_ids is not null and array_length(v_ids, 1) > 0 then
    update contest_entries
       set redemption_code = 'WIN-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))
     where id = any(v_ids) and redemption_code is null;
  end if;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

-- Vendor taps this after every sale while a milestone ("Nth customer")
-- contest is running. Auto-closes the contest the instant the target is
-- hit — the vendor then separately records the winner's name/photo as a
-- normal post + truck_photos write (no entries exist for this type; there's
-- no way to know in advance who the physical Nth customer will be).
create or replace function bump_contest_tap_count(p_contest uuid)
returns table (tap_count int, target_count int, reached boolean)
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_new_count int;
begin
  select * into c from contests where id = p_contest and type = 'milestone';
  if c is null or not owns_or_manages_truck(c.truck_id) then
    raise exception 'not found';
  end if;

  update contests set tap_count = contests.tap_count + 1
   where id = p_contest
   returning contests.tap_count into v_new_count;

  tap_count := v_new_count;
  target_count := c.target_count;
  reached := v_new_count >= coalesce(c.target_count, 999999999);

  if reached then
    update contests set status = 'closed' where id = p_contest and status = 'open';
  end if;
  return next;
end;
$$;

-- Worker verifies a prediction/first_n/raffle winner's claim code at the window.
create or replace function redeem_contest_code(p_code text, p_truck uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare hit int;
begin
  if not owns_or_manages_truck(p_truck) then
    return false;
  end if;
  update contest_entries e
     set redeemed_at = now()
    from contests c
   where c.id = e.contest_id
     and c.truck_id = p_truck
     and e.redemption_code = p_code
     and e.redeemed_at is null;
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

-- Public, first-name-ONLY winner readout for the public truck page — never
-- exposes anything else from the winning customer's profile. Only returns
-- rows for CLOSED contests.
create or replace function contest_winner_first_names(p_contest uuid)
returns table (entry_id uuid, first_name text)
language sql security definer stable set search_path = public as $$
  select ce.id, split_part(pr.display_name, ' ', 1)
    from contest_entries ce
    join profiles pr on pr.id = ce.user_id
    join contests c on c.id = ce.contest_id
   where c.id = p_contest
     and c.status = 'closed'
     and ce.id = any(c.winner_entry_ids);
$$;

-- discount_codes had max_redemptions/redemptions/expires_at columns from the
-- start, but nothing ever checked or incremented them. Still an honor-system
-- tap by the vendor at the window (XLeats never touches payment), but now
-- it's tracked and enforced against expiry/max-uses.
create or replace function redeem_discount_code(p_code text, p_truck uuid)
returns text -- 'ok' | 'not_found' | 'expired' | 'inactive' | 'maxed'
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if not owns_or_manages_truck(p_truck) then
    return 'not_found';
  end if;
  select * into d from discount_codes where truck_id = p_truck and code = upper(p_code) for update;
  if d is null then return 'not_found'; end if;
  if not d.active then return 'inactive'; end if;
  if d.expires_at is not null and d.expires_at < now() then return 'expired'; end if;
  if d.max_redemptions is not null and d.redemptions >= d.max_redemptions then return 'maxed'; end if;
  update discount_codes set redemptions = redemptions + 1 where id = d.id;
  return 'ok';
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
alter table truck_photos         enable row level security;
alter table schedules            enable row level security;
alter table saved_locations       enable row level security;
alter table posts                enable row level security;
alter table catering_requests    enable row level security;
alter table follows              enable row level security;
alter table live_sessions        enable row level security;
alter table discount_codes       enable row level security;
alter table contests             enable row level security;
alter table contest_entries      enable row level security;
alter table offers               enable row level security;
alter table offer_redemptions    enable row level security;
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
create policy truck_photos_read  on truck_photos for select using (true);
create policy truck_photos_write on truck_photos for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));
create policy sched_read  on schedules  for select using (true);
create policy sched_write on schedules  for all using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));
create policy saved_locations_manage on saved_locations for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));
create policy posts_read  on posts      for select using (true);
create policy posts_write on posts      for all using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

-- catering_requests: public can submit (no login), only the truck's manager can read them.
create policy catering_requests_insert on catering_requests for insert with check (true);
create policy catering_requests_read   on catering_requests for select using (owns_or_manages_truck(truck_id));

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

-- offers: public read (customer sees what's available), manager write
create policy offer_read  on offers for select using (active);
create policy offer_write on offers for all using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

-- offer_redemptions: ONLY the customer can read their own. No truck row access.
-- Inserts happen via the service-role daily job or the new_follow trigger
-- (both bypass RLS). Redemption is via redeem_offer_code(). So no policy
-- grants trucks row-level visibility.
create policy offer_redeem_self on offer_redemptions for select using (user_id = auth.uid());

-- new_follower offers fire immediately on follow, not on the daily cron.
create trigger on_new_follow after insert on follows
  for each row execute function handle_new_follow();

-- devices / notifications: private to the user
create policy devices_self on devices for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_self_read   on notifications for select using (user_id = auth.uid());
create policy notif_self_update on notifications for update using (user_id = auth.uid());

-- =============================================================================
-- Storage buckets
-- =============================================================================
insert into storage.buckets (id, name, public) values
  ('logos',          'logos',          true),
  ('menu',           'menu',           true),  -- item photos, path: {account_id}/...
  ('menu-photos',    'menu-photos',    true),  -- whole-menu photos, path: {truck_id}/...
  ('posts',          'posts',          true),
  ('truck-photos',   'truck-photos',   true),  -- customer photo carousel, path: {truck_id}/...
  ('truck-branding', 'truck-branding', true)   -- logo/banner uploads, path: {truck_id}/...
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

create policy truck_photos_bucket_read on storage.objects for select
  using (bucket_id = 'truck-photos');
create policy truck_photos_bucket_write on storage.objects for all
  using (bucket_id = 'truck-photos' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'truck-photos' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid));

create policy truck_branding_bucket_read on storage.objects for select
  using (bucket_id = 'truck-branding');
create policy truck_branding_bucket_write on storage.objects for all
  using (bucket_id = 'truck-branding' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'truck-branding' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid));

-- path: {truck_id}/...
create policy posts_bucket_read on storage.objects for select
  using (bucket_id = 'posts');
create policy posts_bucket_write on storage.objects for all
  using (bucket_id = 'posts' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'posts' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid));
