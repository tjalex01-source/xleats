-- =============================================================================
-- XLeats — fix "function gen_random_bytes(integer) does not exist" (42883)
--
-- pgcrypto is installed in the `extensions` schema on this Supabase project,
-- not `public`. Any SECURITY DEFINER function that does `set search_path =
-- public` (without extensions) can't see gen_random_bytes() at all — this
-- was a latent bug in generate_scheduled_offers, handle_new_follow, and
-- resolve_contest_winners, only surfaced now that resolve_contest_winners
-- actually calls it (to stamp contest winner codes). Re-creating all three
-- with `extensions` added to search_path.
-- =============================================================================

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

  if v_ids is not null and array_length(v_ids, 1) > 0 then
    update contest_entries
       set redemption_code = 'WIN-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))
     where id = any(v_ids) and redemption_code is null;
  end if;

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

notify pgrst, 'reload schema';
