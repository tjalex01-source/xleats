-- =============================================================================
-- XLeats — add a genuine 'closed' status, distinct from 'off'
--
-- 'off' stays the neutral default ("Currently Offline" — before opening,
-- after wrapping up, or just no info either way). 'closed' is a deliberate
-- vendor declaration: "we are not operating today," shown to customers
-- explicitly rather than inferred.
-- =============================================================================

alter type live_status add value if not exists 'closed';
