-- =============================================================================
-- XLeats — promo blasts, fleet-wide apply, and customer consent columns
--
-- Adds the "growth" side of Promos: a vendor can now blast a new discount
-- code / offer / contest to their followers AND nearby non-followers who
-- opted in, with a review step and optional scheduling, and (for Fleet
-- accounts) apply the same promo to every truck in one action.
--
-- Also fixes a real, previously-live privacy gap: generate_scheduled_offers()
-- has been matching "nearby" customers by radius alone, with NO consent
-- check at all, because the consent columns never existed on `profiles`.
-- Adding them now and wiring both the offers matcher and the new blast
-- sender to respect them.
-- =============================================================================

alter table profiles add column if not exists allow_offers_from_followed boolean not null default true;
alter table profiles add column if not exists allow_offers_from_nearby   boolean not null default false;

-- One row per "campaign" — created alongside a discount code / offer /
-- contest (or a group of them, for a Fleet-wide apply), sent at most once.
create table if not exists promo_blasts (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  kind          text not null check (kind in ('discount_code', 'offer', 'contest')),
  message       text,               -- customer-facing wording; editable until sent
  scheduled_at  timestamptz,        -- null = send immediately when triggered
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);
alter table promo_blasts enable row level security;
create policy promo_blasts_manage on promo_blasts for all
  using (owns_or_manages_account(account_id)) with check (owns_or_manages_account(account_id));

alter table discount_codes add column if not exists starts_at timestamptz;
alter table discount_codes add column if not exists blast_id uuid references promo_blasts(id) on delete set null;
alter table offers         add column if not exists blast_id uuid references promo_blasts(id) on delete set null;
alter table contests       add column if not exists blast_id uuid references promo_blasts(id) on delete set null;

-- Internal: does the actual matching + notification insert + marks sent.
-- No owner-auth check here — only called from send_promo_blast() (vendor,
-- checked) or process_due_blasts() (service-role cron, trusted context).
create or replace function _deliver_promo_blast(p_blast uuid)
returns int
language plpgsql security definer set search_path = public, postgis as $$
declare
  b record;
  v_truck_ids uuid[];
  v_count int := 0;
  v_user record;
begin
  select * into b from promo_blasts where id = p_blast;
  if b is null or b.sent_at is not null then
    return 0;
  end if;

  if b.kind = 'discount_code' then
    select array_agg(distinct truck_id) into v_truck_ids from discount_codes where blast_id = p_blast;
  elsif b.kind = 'offer' then
    select array_agg(distinct truck_id) into v_truck_ids from offers where blast_id = p_blast;
  else
    select array_agg(distinct truck_id) into v_truck_ids from contests where blast_id = p_blast;
  end if;

  if v_truck_ids is null or array_length(v_truck_ids, 1) = 0 then
    update promo_blasts set sent_at = now() where id = p_blast;
    return 0;
  end if;

  for v_user in
    select distinct pr.id
      from profiles pr
     where pr.role = 'customer'
       and (
            (pr.allow_offers_from_followed and exists (
               select 1 from follows f where f.user_id = pr.id and f.truck_id = any(v_truck_ids)
             ))
         or (pr.allow_offers_from_nearby and pr.home_lat is not null and exists (
               select 1
                 from trucks t
                 join schedules s on s.truck_id = t.id
                where t.id = any(v_truck_ids)
                  and s.lat is not null
                  and st_distancesphere(
                        st_makepoint(pr.home_lng, pr.home_lat),
                        st_makepoint(s.lng, s.lat)
                      ) <= coalesce(t.service_radius_miles, 10) * 1609.34
             ))
       )
  loop
    insert into notifications (user_id, truck_id, kind, title, body)
    values (v_user.id, v_truck_ids[1], 'promo_blast', 'New promo!',
            coalesce(b.message, 'Check out a new promo from a truck you follow.'));
    v_count := v_count + 1;
  end loop;

  update promo_blasts set sent_at = now() where id = p_blast;
  return v_count;
end;
$$;

-- Vendor-triggered "send now" (or "send" after a schedule is confirmed
-- client-side) — owner-checked entry point.
create or replace function send_promo_blast(p_blast uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select * into b from promo_blasts where id = p_blast;
  if b is null or not owns_or_manages_account(b.account_id) then
    return 0;
  end if;
  return _deliver_promo_blast(p_blast);
end;
$$;

-- Cron entry point: fires any blast whose scheduled time has arrived.
create or replace function process_due_blasts()
returns int
language plpgsql security definer set search_path = public as $$
declare v_count int := 0; b record;
begin
  for b in
    select id from promo_blasts
     where sent_at is null and scheduled_at is not null and scheduled_at <= now()
  loop
    perform _deliver_promo_blast(b.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Fix: generate_scheduled_offers was matching "nearby" customers by radius
-- alone, with no consent check (the columns didn't exist until now).
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
        continue;
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
              (pr.allow_offers_from_followed and exists (
                 select 1 from follows f where f.user_id = pr.id and f.truck_id = o.truck_id
               ))
           or (pr.allow_offers_from_nearby and v_truck_lat is not null and pr.home_lat is not null
               and st_distancesphere(
                     st_makepoint(pr.home_lng, pr.home_lat),
                     st_makepoint(v_truck_lng, v_truck_lat)
                   ) <= v_radius * 1609.34)
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

notify pgrst, 'reload schema';
