# P9-SEC owner decisions

- **OD-1 APPROVED (owner, 2026-11-22 ~1:45 PM PT):** move `/auth/me` and `/auth/me/password-status` to Jini with the other five auth routes. Regenerate the route-table pin with `UPDATE_ROUTE_TABLE_PIN=1`; the ONLY allowed fixture change is the 14 handler-name substitutions `[forwardRejection]` -> `[<anonymous>]` (snapshot lines 52-53 across the 7 variants). Any other diff in the pin = stop and report. U-AUTH-3's T half is unblocked.
