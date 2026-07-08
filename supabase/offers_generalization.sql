-- =============================================================================
-- XLeats — generalize birthday_offers into a multi-type "offers" system
--
-- birthday_offers was hardcoded to birthday matching. T.J. wants one offers
-- box with a type dropdown (birthday / holiday / new_follower / custom) so a
-- vendor can also run a Father's Day discount, a "follow us and get 10% off"
-- welcome offer, etc. Renames birthday_offers -> offers, birthday_redemptions
-- -> offer_redemptions, generalizes the daily matcher to handle date-triggered
-- offers, and adds an immediate follow-trigger path for new_follower offers
-- (those can't wait for the daily cron — a new follower should get their
-- welcome code right away).
-- =============================================================================

create type offer_type as enum ('birthday', 'holiday', 'new_follower', 'custom');

alter table birthday_offers rename to offers;
alter table offers add column if not exists offer_type offer_type not null default 'birthday';
alter table offers add column if not exists trigger_month int check (trigger_month between 1 and 12);
alter table offers add column if not exists trigger_day   int check (trigger_day between 1 and 31);
alter table offers add column if not exists trigger_date  date;

alter table birthday_redemptions rename to offer_redemptions;
alter table offer_redemptions rename column birthday_offer_id to offer_id;

drop policy if exists bday_offer_read  on offers;
drop policy if exists bday_offer_write on offers;
create policy offer_read  on offers for select using (active);
create policy offer_write on offers for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

drop policy if exists bday_redeem_self on offer_redemptions;
create policy offer_redeem_self on offer_redemptions for select using (user_id = auth.uid());

-- One row PER OFFER now (a truck can run several offers at once), not a
-- single truck-wide aggregate.
drop function if exists birthday_offer_stats(uuid);
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

drop function if exists redeem_birthday_code(text, uuid);
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

-- Daily matcher: birthday offers match per-customer birthdays (unchanged
-- logic). holiday/custom offers match on a trigger date (recurring annual
-- trigger_month/day, or a specific one-time trigger_date) and go to EVERY
-- follower + nearby customer, not just people with a birthday today.
-- new_follower offers are NOT handled here — see the follow trigger below.
drop function if exists generate_birthday_offers(date);
create or replace function generate_scheduled_offers(p_date date default current_date)
returns int
language plpgsql security definer set search_path = public, postgis as $$
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
returns trigger language plpgsql security definer set search_path = public as $$
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

drop trigger if exists on_new_follow on follows;
create trigger on_new_follow after insert on follows
  for each row execute function handle_new_follow();

notify pgrst, 'reload schema';
