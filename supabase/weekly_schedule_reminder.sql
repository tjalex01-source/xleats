-- =============================================================================
-- XLeats — weekly "set your schedule" reminder
--
-- Called once a week by /api/cron/weekly-reminder. Broadcasts an in-app
-- announcement to every vendor. Guards against double-sending (retry, a
-- manual re-trigger) by skipping if the same reminder already went out in
-- the last 6 days.
-- =============================================================================

create or replace function send_weekly_schedule_reminder()
returns void language plpgsql security definer set search_path = public as $$
declare
  reminder_title text := 'Set your schedule for the week';
begin
  if exists (
    select 1 from announcements
    where title = reminder_title and created_at > now() - interval '6 days'
  ) then
    return;
  end if;

  insert into announcements (target_all, title, body)
  values (
    true,
    reminder_title,
    'A new week just started — take a minute to fill in your schedule so followers know exactly where to find you (or when you''re closed). A complete week keeps your regulars coming back.'
  );
end;
$$;
