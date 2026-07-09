-- =============================================================================
-- XLeats — push delivery marker
--
-- notifications rows are written by blasts / offers / contest & milestone
-- winners / (future) go-live & new-post. A frequent cron drains any row with
-- pushed_at = null: looks up the recipient's Expo push tokens in `devices`
-- and delivers via Expo's push API, then stamps pushed_at so it isn't
-- reprocessed. read_at stays separate (in-app read state).
-- =============================================================================

alter table notifications add column if not exists pushed_at timestamptz;

-- Partial index so the drain query stays cheap as the table grows.
create index if not exists notifications_unpushed_idx on notifications(created_at) where pushed_at is null;

notify pgrst, 'reload schema';
