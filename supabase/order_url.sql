-- =============================================================================
-- XLeats — "Order Online" link-out
--
-- A single URL field pointing at whatever ordering system the vendor already
-- uses (Square Online Ordering, DoorDash, their own site — provider agnostic).
-- Available on every plan, free included: it's just a link, no payment
-- processing or liability touches XLeats. The public page only shows the
-- button when this is actually set.
-- =============================================================================

alter table trucks add column if not exists order_url text;
