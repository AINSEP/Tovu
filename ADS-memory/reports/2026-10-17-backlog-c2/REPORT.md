# backlog-c2 report (2026-10-17)

1. d2ec95dd3 desktop adopts @jini-ai/core 0.4.8 (dep + override; lockfile regenerated --package-lock-only in a scratch copy; only version/resolved/integrity changed; no new peers). No test (dependency bump).
2. ba5a8508a SQLite pending migrations from the ADR-066 ledger once adopted. tovu-dev was never behind: its 0067 drizzle row has a rewritten created_at (hash correct, ledger at 0012), so "Open once to upgrade" could never clear it. RED: 2 new tests fail on HEAD; GREEN 22/22 (node, with sites-route-restart). Auto-upgrading genuinely behind peers = owner decision, plan: peer-upgrade-plan.md (write-free contract, partial boot, older desktop instance may hold the site).
3. 4921b45a4 admin switch: restart delay 0 on the admin route (chat keeps 3 s), dev.mjs poll 100 ms (next owner restart), Sites list refreshes every 300 ms until currentSite matches (60 s bound). RED: route test + 4 hook tests fail on HEAD; GREEN route (node 22/22) + admin use-local-sites 11/11. 3c skipped: ledger digests come from packing the source, so no cheap "unchanged" check exists (needs a Jini source fingerprint).
4. Already done in aee6eede9 (10-16): boot drops the duplicate instead of a "(legacy copy)"; migration 0012 is untouched because its checksum is pinned (editing it breaks every site). Nothing left in code; the row is the owner's click.

Codex: one round (codex-r1/, 2 shards, both ok, no follow-ups). Home state unchanged (sites.json md5, 860 keys, 5 sites). RED via HEAD sibling copies + resolve hook, no live-source reverts; copies deleted.
