-- =============================================================================
-- XLeats — schedule: closed days + one-recurring-entry-per-weekday
--
-- Lets a vendor mark a recurring weekday (or a specific one-off date) as
-- "closed," not just leave it blank. Also adds a uniqueness rule so each
-- weekday can only have one recurring schedule row — otherwise the daily
-- status-seeding cron (and the public weekly view) would have no reliable
-- way to know which of several conflicting rows for the same day is current.
-- =============================================================================

alter table schedules add column if not exists is_closed boolean not null default false;

-- One recurring entry per weekday per truck. One-off dated entries (recurring
-- = false) aren't restricted this way — a vendor can have any number of
-- specific-date overrides.
create unique index if not exists schedules_one_recurring_per_day
  on schedules (truck_id, day_of_week)
  where recurring = true;
