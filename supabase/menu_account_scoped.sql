-- =============================================================================
-- XLeats — menu items become account-scoped, applied to some or all trucks
--
-- Previously menu_items.truck_id tied an item to exactly one truck. Fleet
-- accounts need a real synced template: edit an item once, it updates
-- everywhere it's applied (not a copy per truck). menu_items table has zero
-- rows in production as of this migration, so no backfill is needed — this
-- replaces truck_id outright rather than layering around it.
--
-- New model:
--   - menu_items belongs to an account_id, not a truck_id.
--   - applies_to_all_trucks = true (the default — matches "90% of the time
--     every truck has the same menu") means it shows on every truck under
--     that account, including ones added later.
--   - applies_to_all_trucks = false means only the trucks listed in
--     menu_item_trucks show it — an explicit, smaller subset.
--   - is_new: vendor-controlled "NEW ITEM" badge on the public page.
--   - is_catering: item belongs to the separate catering menu (Pro/Fleet
--     only — gated in application code, not RLS, same as other plan gates).
-- =============================================================================

drop policy if exists menu_write on menu_items;

alter table menu_items add column if not exists account_id uuid references accounts(id) on delete cascade;
alter table menu_items add column if not exists applies_to_all_trucks boolean not null default true;
alter table menu_items add column if not exists is_new boolean not null default false;
alter table menu_items add column if not exists is_catering boolean not null default false;
alter table menu_items alter column account_id set not null;
alter table menu_items drop column if exists truck_id;

create table if not exists menu_item_trucks (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  truck_id     uuid not null references trucks(id) on delete cascade,
  primary key (menu_item_id, truck_id)
);
alter table menu_item_trucks enable row level security;

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

create policy menu_write on menu_items for all
  using (owns_or_manages_account(account_id))
  with check (owns_or_manages_account(account_id));

create policy menu_item_trucks_read on menu_item_trucks for select using (true);
create policy menu_item_trucks_write on menu_item_trucks for all
  using (owns_or_manages_account((select account_id from menu_items where id = menu_item_id)))
  with check (owns_or_manages_account((select account_id from menu_items where id = menu_item_id)));
