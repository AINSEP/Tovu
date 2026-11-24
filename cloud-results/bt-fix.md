PARTIAL 3779350b65 dab29b0103 2d19ff604 4a3da28854 4825bd02f0: left = fix 7 mount in site-assistant.ts, fix 12 desktop-path pin, fix 9 Tovu host column `created_by_kind`, fixes 15/17 (themes)

# bt-fix — Codex review fixes for rv1123n/rv1123o (fixes 6–14)

Run on 2026-11-24 by an unattended cloud agent. Programmer skill read and followed:
`AI-Dev-Shop/agents/programmer/skills.md` v1.7.5 (RED → fix → GREEN, named mutations, function
boundaries and why-comments).

Branch heads on the first line are, in order: `codex/bt-dec-a-tovu` (code head, before this report
commit), `codex/bt-dec-b-tovu`, `codex/bt-themes-quarantine-tovu`, `codex/bt-dec-a-jini`,
`codex/bt-dec-b-jini`. Before its final push, each branch merged the latest
`origin/integ/merge-16-2026-11-23` (Tovu `3a9332247`, Jini `7490405a`). Every merge was clean.

| fix # | branch | status | commit | test |
|---|---|---|---|---|
| 6 | codex/bt-dec-a-tovu | FIXED | 538bebc42 | `site-trash.integration.test.ts`: "B229: deleting one of two Trash entries that share a siteId keeps the shared app-data databases for the other's restore", redirected `databases/` parent refused, sibling `databases/<otherId>` refused, missing checkbox / missing confirmation each delete nothing, lock pins (delete/restore/boot). 42→49 tests, 49/49. Mutations remove-trash-claim-check, drop-siteId-canonical-child, drop-parent-symlink-check, restore-outside-lock: each red |
| 7 | codex/bt-dec-a-tovu | FIXED (port) / LEFT (mount) | 1a648124d | `visitor-turn-dedupe.unit.test.ts`: "once provider work has begun, an undelivered finish keeps the turn: the replay is refused and the provider ran once" (disconnect before headers) and "a provider failure after invocation also keeps the turn". Retry after a failure before the provider ran is still admitted. 14/14. Mutation release-on-any-undelivered: 2 red. LEFT: mounting in `server/runtime/composition/modules/site-assistant.ts` (no production caller yet) |
| 8 | codex/bt-dec-a-jini | FIXED | d559fd2d | `run-site-update.test.ts` "rollback outlives the caller cancellation": cancel during apply, cancel during verify, host `rollbackSignal`. RED 3 failed → 24/24. Mutation forward-cancelled-signal: 3 red |
| 9 | codex/bt-dec-a-jini | FIXED (Jini) / LEFT (Tovu host column) | 5b0c2b55 | `delivery.agent-pause.test.ts`: "a pause policy over a repo that cannot release claims is refused before any row is claimed or charged", plus a pin that attempts stay 0 across 3 paused ticks. `webhook-repo.dialects.test.ts` "creator attribution persists" (sqlite + postgres). Mutations drop-release-guard: 1 red; drop-creator-write: 2 red |
| 10 | codex/bt-dec-b-tovu | FIXED | f39884dcb | new `pre-consent-vary.route.test.ts` (real `sendPublicPage` on Express): cookie-free first, cookie first, malformed cookie (→ `private, no-store`), no gated scripts (no Vary). RED "Vary was null". Mutation drop-vary-cookie: 2 red |
| 11 | codex/bt-dec-b-tovu | FIXED | 735beed3a | `export-preflight.unit.test.ts` "third-party hosts: mixed-case <ScRiPt> markup still reaches the parser". RED `[]` vs 2 hosts; revert: red |
| 12 | codex/bt-dec-b-tovu | FIXED (bindings) / LEFT (desktop pin) | 13708449b | `product-telemetry.unit.test.ts` "B258: a Tovu application key ... production scrub binding". Reverting the binding leaks the key. All 5 sites bound to `redactTovuLocalText`; desktop paths are not yet pinned by a test that tells the two redactors apart |
| 13 | codex/bt-dec-b-jini | FIXED | e9f853f6 | `caption-track.test.ts` "encoded and normalised traversal that a browser resolves out of /m/ is refused" (RED `/m/%2e%2e/admin/x.vtt true !== false`) + "a percent-encoded but non-traversing name stays accepted". 9/9. Mutation restore-raw-segment-check: red |
| 14 | codex/bt-themes-quarantine-tovu | FIXED | 6f559c7c9 | `held-back-route.test.ts`: "restore refused with digest only after successful check" (RED 201≠400), "refused after the approval card is declined", "approval is bound to actor, theme and digest". Each asserts the quarantine tree and live themes are byte-identical. Route 8/8; admin themes 24 files / 843 tests. Mutations accept-digest-only: route red; client-restores-without-approval: 4 red |
| 15 | codex/bt-themes-quarantine-tovu | LEFT | — | `defineJsonRoute` conversion + Core owner for payloads: not started (large) |
| 16 | codex/bt-themes-quarantine-tovu | FIXED | 2d19ff604 | `held-back-themes.unit.test.ts`: "list reads the manifest name without following a link and within a size bound" (RED actual 'Read Through A Link'), "restore refuses a live themes parent that is redirected by a link, and moves nothing" (new `LIVE_FOLDER_UNSAFE`, 409). Unit + route 15/15. Mutations skip-live-parent-check, follow-manifest-link, unbounded-manifest: each red. Admin copy for `LIVE_FOLDER_UNSAFE` not added; the server's plain-words message shows instead |
| 17 | codex/bt-themes-quarantine-tovu | LEFT | — | split `use-held-back-themes.hooks.ts` controller (~76 lines now, under the 80 cap; still over the 50-line warning) |

## Gates (on the merged trees)

- Jini dec-a: `@jini-ai/integrations` + `@jini-ai/devops` build and typecheck pass. webhooks 161/161, site-update 74/74.
- Jini dec-b: `@jini-ai/cms` build and typecheck pass. widgets 58 files / 886 tests.
- Jini `pnpm guard`: one violation on both branches, `HW3-module-state packages/admin/src/shell/lib/shell-failure-log.ts`. It comes from integ; neither lane touches that file. No new red.
- Tovu typecheck (`tsc -p tsconfig.json --noEmit`) exits 0 on all three Tovu branches (themes re-checked after fix 16). Each was linked to its paired local Jini (dec-a/themes → merged Jini dec-a, dec-b → merged Jini dec-b), because the registry `@jini-ai/*@0.7.3-next.2` lacks the subpaths these branches import.
- Tovu changed tests: dec-a 63/63 (site-trash + dedupe); dec-b 32/32 (vary route, pre-consent unit, export preflight, product telemetry); themes route 8/8 and admin themes 843/843.

## Notes for the merge train

- **Fix 9 host follow-up (important).** The Jini SQL adapter now writes `webhook_subscriptions.created_by_kind` (nullable). Tovu needs a migration adding that nullable column, plus the generated types, in the same bump that adopts this Jini. Without it, subscription inserts fail. It must also land before the host wires the agent switch.
- Fix 14: the approval token is spent before the move. If the move is then refused (files changed, check failed, name taken), the owner has to check and approve again. Workspace binding is enforced by the gateway scope and the plan hash, but no test covers it, because the route's foreign-workspace guard refuses first.
- Fix 6 adds `<appData>/.site-identity.lock`, a cross-process file lock. `classifySiteDatabaseDir` now requires `siteId`; its only caller is `site-trash.ts`.
- Fix 10 uses `parseStored` from `@jini-ai/cookie-consent/policy`, which the published 0.7.3-next.2 already exports.
