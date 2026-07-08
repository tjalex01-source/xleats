-- =============================================================================
-- XLeats — milestone (Nth customer) contests + public winner announcements
--
-- Adds:
--   - contest_type 'milestone' — a live tap-counter contest ("100th customer
--     today"). No in-app entries; the vendor taps a big button after each
--     sale, and the count itself resolves the contest when it hits the
--     target. Reuses the existing posts + truck_photos infrastructure to
--     announce the winner and add their photo to the carousel, instead of
--     inventing new public-display plumbing.
--   - redemption codes on contest_entries, so a prediction/first_n/raffle
--     winner can claim their prize at the window later (same pattern as
--     offer codes) instead of the vendor having no way to verify them.
--   - contest_winner_first_names(): a SECURITY DEFINER, first-name-ONLY
--     readout for the public page — never exposes anything else about the
--     winning customer's profile.
--   - winner_user_id: nullable now, present so a future customer-app
--     self-claim ("That's me!") flow can attach real identity + trigger a
--     push notification without another schema change later.
-- =============================================================================

alter type contest_type add value if not exists 'milestone';

alter table contests add column if not exists target_count int;          -- milestone: the Nth customer
alter table contests add column if not exists tap_count int not null default 0;
alter table contests add column if not exists winner_user_id uuid references profiles(id);

alter table contest_entries add column if not exists redemption_code text;
alter table contest_entries add column if not exists redeemed_at timestamptz;

-- Vendor taps this after every sale while a milestone contest is running.
-- Auto-closes the contest the moment the target is hit; the vendor then
-- separately records the winner's name/photo via a normal posts + truck_photos write.
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

-- Public, first-name-only winner readout. Only returns anything for CLOSED
-- contests, and only ever a first name — never the full profile.
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

-- resolve_contest_winners now also stamps a redemption code on each winner.
create or replace function resolve_contest_winners(p_contest uuid)
returns int
language plpgsql security definer set search_path = public as $$
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
