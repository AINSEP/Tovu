PARTIAL: B176 (issue side), B186, B135/B136, C002, C095, C097, A303 left unfixed; 11 rows skipped for overlap with open codex/* branches (listed below)

# bugs-medium — MED rows of `plans/P8-triaged-backlog.md` (Tier 2), 2026-11-23

Bases: Tovu `origin/integ/merge-13-2026-11-22` (`f7185f153`), Jini `origin/integ/merge-14-2026-11-22` (`4902a6a1`).
Branches: Tovu `codex/bugs-medium-tovu`, Jini `codex/bugs-medium-jini`. HIGH rows (Tier 1) and the visitor-chat
rows (B168 cookie banner, B192 site-chat) were left to the other runs, as the dispatch said.

Method for every fixed row: a regression test written first and seen failing, the smallest fix, then a named
mutation that turns the test red again before the fix is put back. Each fix is its own commit and push.

## Fixed

| bug | status | test | mutation | commit |
|---|---|---|---|---|
| B146 (Jini) webhook update overwrites a concurrent pause/delete | FIXED | `packages/integrations/src/webhooks/__tests__/subscription.lost-update.test.ts` "webhook update without expectedVersion rejects a pause committed between its read and save" | update-without-cas | Jini `5dd726068` |
| B166 (Jini) plan-store cap is global | FIXED | `packages/db/src/__tests__/tools/plan-store.test.ts` "caps plans per principal: another user's saves never evict yours" | evict-across-principals | Jini `c6547eb10` |
| B060 (Jini) sharp enlarges small sources | FIXED | `packages/cms/src/media/__tests__/image-transformer.sharp.test.ts` "a narrow source is never enlarged past its own size" | enlarge | Jini `48a535c04` |
| B016 (Jini) Resend send uses the flat request shape | FIXED (plugin 0.2.4, catalog re-pinned) | `packages/agent-plugins/resend/__tests__/resend.test.mjs` "send also works on a client that reads the request object (Jini shape)" | flat-send | Jini `784296411` |
| B176 newsletter confirm link always 500 while consent is unbound | PARTIAL: the link now shows a plain 503 page and keeps the token unused | `server/inbound/public-http/routes/site/__tests__/unit/h4-newsletter.unit.test.ts` "/newsletter/confirm with consent unbound shows a plain page and keeps the token usable" | drop-503-branch | Tovu `d2a68e69a` |
| B177 archived lists still targeted | FIXED | `features/newsletter/__tests__/subscriptions.test.ts` "saveSubscription and importSubscriptions refuse an archived list…" + `campaign-write-service.test.ts` "saveCampaign: an archived list is refused in plain words" | archived-allowed | Tovu `d0c0bac22` |
| B201 External MCP reauth link points at a removed route | FIXED | `features/external-mcp/__tests__/external-mcp-oauth.test.ts` (deep link + invalid_grant) and `h3/moved-shims.test.ts`, repointed | old-literal | Tovu `e61566d58` |
| B237 capital İ shifts WebMCP injection | FIXED | `features/webmcp/__tests__/published-html.pins.test.ts` "a capital İ before </body> does not shift where the script is injected" | lowercase-index | Tovu `cb2be08fa` |
| B165 import fails for names ending "." or a space | FIXED | `features/site-backup/__tests__/import-site-slug.unit.test.ts` | raw-name-check | Tovu `b0af498e9` |

Changesets added in Jini for integrations, db, cms, agent-plugins and plugin-catalog (all patch).

## Not reproduced (no change)

| bug | status | evidence |
|---|---|---|
| C084 in-process daemon parks into 503 | NOT REPRODUCED | the in-process scope's own idle park (`agent-daemon-scope.ts:188`) is never started; `start()` is called only by `agent-daemon-server.ts:235` for the separate daemon process, so no idle monitor exists and it cannot park |
| A011 (Jini) static export drops data-* / manifest files | NOT REPRODUCED | `packages/devops/src/static-export/html-url-locations.ts:38` maps `data-*-src/href/srcset/poster` to URL positions and JSON manifests are crawled by link key; pinned by `__tests__/transforms.test.ts:163-178`. Files referenced only from script text stay inert on purpose |

## Skipped — the fix touches a file an open codex/* branch changes

| bug | file | open branch(es) |
|---|---|---|
| B178 preheader null not cleared | `features/newsletter/tool-registrations.ts` | `codex/ex5-fnd-inject-tovu` |
| B203, B204 redirect publish | `features/redirects/publish-content.ts` | `codex/ex4-deploy-tovu`, `codex/ex5-fnd-inject-tovu` |
| B164 credential setup for env/disabled hosts | `features/deployments/publish-agent-tools.ts` | `codex/ex4-integrations-tovu`, `codex/ex5-fnd-inject-tovu`, `codex/ex5-fnd-seams-tovu` |
| B121 source-control key vanishes | `features/source-control/store.ts` | `codex/ex4-deploy-tovu` |
| B200 External MCP input errors | `features/external-mcp/tool-registrations.ts` | `codex/ex5-fnd-inject-tovu` |
| B141 BYOK Stop before close listener | `server/runtime/composition/modules/assistant-byok.ts` | `codex/ex5-fnd-inject-tovu` |
| B206 media generation ignores Stop | `features/media-generation/tool-registrations.ts` | `codex/ex4-media-tovu`, `codex/ex5-fnd-inject-tovu`, `codex/ex5-fnd-seams-tovu` |
| C057 empty patch bumps version | `server/inbound/admin-http/routes/forms/*` | `codex/ex5-small-tovu` |
| B183 Secrets tab blank | `admin/features/security/AccessTokensTab.tsx` | `codex/ex5-fnd-kit-tovu`, `codex/th-2` |
| B137 dialog padding click closes | `admin/features/pages/ThemePageDetailsModal.tsx` | `codex/ex5-fnd-kit-tovu` |
| B245 View Template disabled | `admin/features/pages/PageEditor.tsx` | `codex/ex5-fnd-kit-tovu` |
| C063 run-finalizer duplicate | `server/runtime/composition/modules/run-finalizer/*` | `codex/ex5-fnd-inject-tovu`, `codex/ex5-fnd-seams-tovu` |
| B109 (Jini) Soon plugins offered | `packages/agent-plugins/src/lifecycle/host-tools/search-tool.ts` | Jini `codex/ex5-fnd-seams-jini` |
| A007 (Jini) composio boot lock | `packages/agent-plugins/src/lifecycle/update.ts` | Jini `codex/ex5-fnd-seams-jini` |

## Left open (not attempted in this run)

- B176, issuing side: tokens and confirmation emails are still sent while consent is unbound. Stopping them
  changes every subscribe path and their tests; needs a design call.
- B186: the daemon path already uses the live chart snapshot (`agent-daemon-site-tools.ts:152`); only the
  registry/BYOK path (`component-catalog-tool.ts:125`) is static and needs a snapshot port through composition.
- B135/B136 media providers per-provider save/delete (~2 h, admin + server), C002 revert transaction (Jini,
  DR-006 question), C095 (owner question 2), C097 (Jini admin placement), A303 (shares lease work with P3-T3),
  C017 (needs a Chrome look).

## Verification

See the "Verify" section appended below.
