-- =============================================================================
-- XLeats — Admin panel migration 2: multi-recipient announcements
-- Run this once in the Supabase SQL Editor, AFTER admin_migration.sql.
--
-- The original announcements design only supported "one specific vendor" or
-- "everyone" (a nullable target_account_id). At scale, the admin needs to
-- search and pick an arbitrary subset of vendors for a message, so this
-- replaces the single FK with a proper many-to-many join table plus an
-- explicit target_all flag.
-- =============================================================================

alter table announcements add column if not exists target_all boolean not null default false;

-- Preserve existing semantics: a null target_account_id used to mean
-- "everyone" before target_all existed.
update announcements set target_all = true where target_account_id is null;

create table if not exists announcement_recipients (
  announcement_id uuid not null references announcements(id) on delete cascade,
  account_id      uuid not null references accounts(id) on delete cascade,
  primary key (announcement_id, account_id)
);
alter table announcement_recipients enable row level security;

-- Carry forward any existing single-target announcements into the join table.
insert into announcement_recipients (announcement_id, account_id)
select id, target_account_id from announcements
where target_account_id is not null
on conflict do nothing;

-- Vendors can see which announcements were sent to their own account.
create policy announcement_recipients_read on announcement_recipients for select
  using (exists (select 1 from accounts a where a.id = account_id and a.owner_id = auth.uid()));

-- Replace the old read policy: broadcast announcements are visible to
-- everyone; targeted ones only to accounts listed in announcement_recipients.
drop policy if exists announcements_read on announcements;
create policy announcements_read on announcements for select
  using (
    target_all
    or exists (
      select 1 from announcement_recipients ar
      join accounts a on a.id = ar.account_id
      where ar.announcement_id = announcements.id and a.owner_id = auth.uid()
    )
  );

-- No insert/update/delete policy on announcement_recipients for the
-- authenticated role, on purpose — only the admin panel's service-role
-- client writes recipients.

alter table announcements drop column if exists target_account_id;
