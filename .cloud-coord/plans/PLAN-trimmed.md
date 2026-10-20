# Multi-destination forms + auto pull + generic Google Sheets — trimmed v1 (tovu-80 review of PLAN-codex.md)

Keep (as Codex planned):
- Receiver vs delivery destinations stay distinct. One receiver (D1 Worker for static, Tovu for live); N delivery bindings per site (bindingId, adapterId, connectionRef, enabled, optional formIds, config). Owner-editable in Forms admin.
- Fan-out on form.submission.received: persist a delivery plan once per submission, one outbox child job per binding; independent retries; per-destination status. Reuse Jini outbox worker (+ optional per-event retry-policy resolver, defaults unchanged).
- Auto pull: at serving startup then every 5 min, shared lease with manual pull, backoff 5 min→1 h with jitter, status (last sync / next / errors) in Submissions. Desktop: runs while open, one due pass on wake. No Cloudflare cron/webhooks.
- Google Sheets = regular plugin content/agent-plugins/google-sheets, direct REST, Jini OAuth (PKCE, refresh, vault). Scope drive.file only.
- Form mapping: tab per form, header from fields, submission ID + time columns, checkbox-group joined ", ", RAW values, IP excluded.

Cut / simplify for v1:
1. Email stays as-is (no durable per-recipient jobs). Shown alongside bindings; migrate later. (-~150 lines, avoids touching Jini notify-subscriber.)
2. Sheets idempotency: NO generic row-reservation table / managed stable-row positions. v1 = outbox serializes jobs per binding; before (re)append after a timeout/uncertain result, read the tab's submission-ID column (bounded) and skip if present. Document the tiny residual race. (-~250 lines + a migration.)
3. Existing-sheet picker CUT: v1 creates the spreadsheet (drive.file covers app-created files). "Use existing sheet" = later with Google Picker.
4. Spreadsheet tools v1: spreadsheet_get, spreadsheet_create, spreadsheet_read, spreadsheet_append_rows. update_rows later.
5. Shared Jini loop-helper extraction only if the outbox drainer lifecycle is literally reusable; otherwise call Jini's scheduler port directly.
6. Service accounts, OAuth broker, backfill, scheduled imports, bidirectional sync: cut (as Codex said).

Recommended answers to Codex's owner questions (owner to confirm):
Q1 OAuth client: Tovu ships its own Google OAuth client (desktop loopback + hosted callback) so users just click "Connect Google"; drive.file is a non-sensitive scope (light Google verification). BYO client only as an advanced fallback.
Q2 Desktop closed: accept "delivers on reopen" (D1 keeps accepting while closed).
Q3 Managed tab: moot after cut 2 (users can sort/edit freely; dedupe by submission ID).
Q4 Purge: leave external copies; say so when enabling a destination.

Phases (build order): 1 fan-out (Codex) → 2 auto pull (Codex) → 3 OAuth plugin connection (Codex backend, Opus+Chrome flow) → 4 Sheets plugin + spreadsheet tools (Codex) → 5 admin bindings/status UI (Opus+Chrome). Est. ~1,100–1,800 prod lines after cuts.
