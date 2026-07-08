-- =============================================================================
-- XLeats — discount code redemption tracking
--
-- discount_codes already had max_redemptions/redemptions/expires_at columns,
-- but nothing ever incremented redemptions or checked the limits — the
-- vendor had no way to track usage at all. Since XLeats never touches
-- payment, redemption is still an honor-system tap by the vendor at the
-- window (same as the offer codes), but now it's actually tracked and
-- enforced against expiry/max-uses.
-- =============================================================================

create or replace function redeem_discount_code(p_code text, p_truck uuid)
returns text -- 'ok' | 'not_found' | 'expired' | 'inactive' | 'maxed'
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  if not owns_or_manages_truck(p_truck) then
    return 'not_found';
  end if;
  select * into d from discount_codes where truck_id = p_truck and code = upper(p_code) for update;
  if d is null then return 'not_found'; end if;
  if not d.active then return 'inactive'; end if;
  if d.expires_at is not null and d.expires_at < now() then return 'expired'; end if;
  if d.max_redemptions is not null and d.redemptions >= d.max_redemptions then return 'maxed'; end if;
  update discount_codes set redemptions = redemptions + 1 where id = d.id;
  return 'ok';
end;
$$;

notify pgrst, 'reload schema';
