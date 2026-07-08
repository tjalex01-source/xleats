-- =============================================================================
-- XLeats — contest type expansion + winner resolution
--
-- contests already existed (type: count | prediction) but nothing built on
-- top of it yet. 'count' ("100th customer today") can't actually be detected
-- without a POS — see the known gotcha in CLAUDE.md — so it's replaced with
-- types that ARE resolvable from in-app entries alone:
--   - prediction: unchanged (guess a number/text; vendor sets the correct
--     answer after close; winner = exact match, or closest numeric guess).
--   - first_n: first N people to enter win — auto-resolved by entry order.
--   - raffle: anyone who enters during the window is eligible; vendor
--     triggers a random draw for N winners.
--   - manual: a purely descriptive contest (e.g. an Instagram photo contest)
--     with no in-app entries — the vendor just records who won.
-- =============================================================================

alter type contest_type add value if not exists 'first_n';
alter type contest_type add value if not exists 'raffle';
alter type contest_type add value if not exists 'manual';

alter table contests add column if not exists winner_limit int;
alter table contests add column if not exists winner_note text;
alter table contests add column if not exists winner_entry_ids uuid[] not null default '{}';

-- Resolves winners for a contest based on its type. Returns winner count.
-- SECURITY DEFINER + owns_or_manages_truck check so a vendor can only
-- resolve their own contests; entries/winners never expose customer PII
-- beyond the entry_value they submitted.
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
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

notify pgrst, 'reload schema';
