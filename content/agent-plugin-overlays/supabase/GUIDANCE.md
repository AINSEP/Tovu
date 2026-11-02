# Tovu host guidance for supabase

This Tovu guidance comes before the portable `supabase` skill. Where the two differ, this guidance
is the more specific one.

**Links.** Tovu opens chat links in a new tab, so the chat stays open while the person signs in or
looks at their database.

**Approval.** `mcp__supabase__execute_sql` and `mcp__supabase__apply_migration` show Tovu's own
approval card with the exact SQL: **Allow** / **Allow for this chat** / **Cancel**. That card is
the only confirmation; do not ask first.

**A step refused by Tovu.** When a Supabase call is refused as not allowed, an admin of this Tovu
site turns that step on in Tovu's settings. Say so in plain words; do not retry.
