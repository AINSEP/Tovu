BUGS TRIAGE PARTIAL: all 1658 lines classified, but 228 rows are NOT-CHECKED best guesses (A 64, B 163, C 1) and 76 UNVERIFIABLE (need packaged app/live/Chrome); duplicates were removed within each part, while cross-part dedupe only rests on each helper's "possible duplicates" lists

Bases: Tovu origin/integ/merge-11-2026-11-21 (311d26dfa6), Jini origin/integ/merge-12-2026-11-22 (6b8e0d48a). Read-only, git objects only. Parts: A = lines 264-973 (helper triage-part-a), B = lines 974-1467 (helper triage-part-b), C = lines 1-263 + 1468-1658 (coordinator). Full per-part files: part-A.md, part-B.md, part-C.md in this folder.

## Summary

| status | A | B | C | total |
|---|---:|---:|---:|---:|
| FIXED | 282 | 40 | 73 | 395 |
| FIXED-PENDING | 1 | 0 | 9 | 10 |
| OPEN — HIGH | 0 | 8 | 0 | 8 |
| OPEN — MED | 5 | 23 | 8 | 36 |
| OPEN — LOW (incl. LOW–MED) | 12 | 11 | 26 | 49 |
| OPEN — security (no other grade) | 1 | 0 | 1 | 2 |
| OBSOLETE | 27 | 28 | 13 | 68 |
| UNVERIFIABLE | 62 | 14 | 0 | 76 |
| NOT-CHECKED | 64 | 163 | 1 | 228 |

Security-tagged OPEN rows (spread across the grades above): C043, A450, B140, B151, B152, B213, B216.
Two HIGH bugs from part C are FIXED-PENDING, not OPEN: C024 (plugin-ID upgrade / dev boot, codex/tv-seed-upgrade) and C127 (post editor empty-body data loss, codex/tv-bugs3b).

## Part C rows (lines 1-263, 1468-1658)
| id | short title | status | evidence (commit or file:line) | severity | fix direction | source line(s) |
|---|---|---|---|---|---|---|
| C001 | L079 force revert without principalKind skips stale check | FIXED | J a0413c6ae; cms/src/core/commands/revert.ts:207 FORCE_NEEDS_PRINCIPAL_KIND | — | — | 12-18 |
| C002 | L079 revert not all-or-nothing (later inverse fails, earlier stay) | OPEN | still pinned: T W/contracts/core/commands/__tests__/revert.unit.test.ts:608 "(reported, not fixed)" | MED | apply inverses in one transaction (or compensate), flip the pin red-first | 20-24 |
| C003 | snapshot.ts comment says failed migration "non-terminal" | OPEN | J db/src/data-modules/snapshot.ts:92-94 | LOW | doc only: say ROLLED_BACK (terminal), snapshot kept | 28-32 |
| C004 | plugin-host bundled identity test reads namespace tovu | FIXED | T plugin-host.integration.test.ts:184,201 reads namespace 'jini' | — | — | 36-42 |
| C005 | A1 explicit-undefined credential metadata | FIXED | resolved in extract s2 (entry's own record, mutation red) | — | — | 46-55 |
| C006 | A2 Resend positional httpClient.send ABI | FIXED | toPluginHttpClient adapter; T W/features/agent-plugins/mail-adapter-registry.ts:12 abi | — | — | 59-74 |
| C007 | C7 plugin contribution filenames tovu-*.json vs jini-*.json | FIXED | T 7801b3d883/14ef4ba26; tests read jini-*.json (bundled-mail-credential-cards.unit.test.ts:56) | — | — | 78-92 |
| C008 | Trash EXDEV error loses its cause (+ error-gate row) | FIXED | J cms/src/trash/adapters/directory.node.ts:82 `{ cause: error }` (0696ae1e7) | — | — | 94-99, 1607 |
| C009 | theme-preview-refresh imports feature-wide theme barrel | FIXED | T 28f777f83; no features/theme/index import; worker-import-graph 26/26 (combine-11) | — | — | 101-106 |
| C010 | Search/Mail credential label prefix drift (saved labels) | FIXED | T 1e77909965 + 6056cf9216 (CRED-T1..3): site-search.ts:446 reads legacy `Tovu Search — …` | — | — | 108-115 |
| C011 | desktop renderer rest syntax / positional calls | FIXED | T 8ec117a4a; desktop tsc 0/0/0/0 (combine-11) | — | — | 119-122 |
| C012 | @tovu/contracts imported agent-runtime undeclared | FIXED | T 196e536c8 | — | — | 123-124 |
| C013 | build-time check scripts ship in server build | FIXED | T f57b409e0 (ancestor of merge-11) | — | — | 132-138 |
| C014 | Jini optional-peer contract stale pins | OPEN | J scripts/__tests__/optional-peer-contract.test.ts:79 pins ui→lexical; packages/ui/package.json has no lexical (daemon→express now declared) | LOW (test) | drop stale pin; recheck the 4 optionalPeers texts | 140-144 |
| C015 | GitHub managed-files manifest moved .tovu→.jini, no migration | FIXED | T 6056cf9216 passes previousManagedManifestPath `.tovu/…` (commit-site.unit.test.ts:340-344); J commit-site.test.mjs:90 | — | — | 151-160 |
| C016 | dev.mjs selectNodeRuntime without env | FIXED | T development/scripts/dev.mjs:861 `env: process.env` | — | — | 162-167 |
| C017 | admin CSS targets .jini-* classes Jini never emits | OPEN | T A/integrations/jini-admin/jini-media.css:601,605,613,781; J TabBar.tsx:108,116 emits tab-bar-dot/tag, RowMenu.tsx:106 row-menu-popup-above | LOW (visual) | repoint the 26 audited selectors to emitted classes; Chrome check | 169-174 |
| C018 | Share ZIP: hard refusal vs acknowledgement; warned files in shares | FIXED | bugs1 SHARE-ZIP (m6 743644fb5): W/features/site-backup/share-backend.ts:187 refuses warned delivery; owner download keeps ack (routes/system/site-shares.ts:90,131) per coordinator ruling (combine-11 decision 8) | — | — | 181-197, 213, 1570, 1641 |
| C019 | site-chat lockfile stale | FIXED | T 47dd8b157 | — | — | 199-204, 211 |
| C020 | real-Postgres dialect tests truncate each other | FIXED | T 1baf41c6f9 (advisory lock) | — | — | 216-219, 254 |
| C021 | AG-UI RUN_ERROR carries raw transport text ('aborted') | FIXED-PENDING | J merge-12 jx-b5 641ddcbba: chat/src/core/ag-ui/event-projection.ts:258,284 fixed interruption copy; needs Jini publish + Tovu bump; golden repoint in codex/tv-bugs3a 5eb72847cd. Tovu still passes no approved sentence (W/server/runtime/composition/modules/assistant-ag-ui.ts:285) | MED | after publish, pass Tovu's approved sentence as interruptionMessage | 226-235, 1640 |
| C022 | admin share-ack opened only on 409 | FIXED | T c3ac7bd03 | — | — | 237-241 |
| C023 | stage-payload empty refusal | FIXED | T 623bbbab7 | — | — | 243-246 |
| C024 | installed tovu/<x> plugins never upgrade to jini/<x>; dev boot stops (23 "could not be seeded: Error"; readyz never probed) | FIXED-PENDING | codex/tv-seed-upgrade 2ddce9e825 (W/features/agent-plugins/bundled-id-upgrade.ts) + b7d21b4679 (dev.mjs waitForHttpOk({url})) | HIGH (release blocker) | merge tv-seed-upgrade before any desktop release; journal/interruption recovery still owed | 248-251, 1655-1656 |
| C025 | Jini seed-bundled logs bare "Error" for install refusals | OPEN | J agent-plugins/src/lifecycle/seed-bundled.ts:187 describeErrorForLog with built-in vocabulary (no AgentPluginInstallError codes) | LOW | package describer that names AgentPluginInstallError codes | 1656 |
| C026 | vendor names in generic seam files | OPEN | combine-11: bundled-catalog.ts:47,48,57 + shared-owner.ts:81 (BASE-RED, T-VENDOR STOP) | LOW (policy) | owner: allow-list host inventory or move names to plugins; keep guard | 255-256, 1508, 1524 |
| C027 | new complexity violations (pushPlannedBackup, useCopyKeys, reconcilePluginActivationsOnce) + backup-service size 547 | FIXED-PENDING | codex/tv-bugs3a 5eb72847cd (B8a-c: push-content.ts split, use-copy-keys, plugin-activation-polling) | — | — | 257-260 |
| C028 | why-comments gate 77→79 open blocks | OPEN | combine-11: + share-service.ts:126-131, site-search.ts:64-67 | LOW | close or baseline the 2 new blocks | 261, 1614 |
| C029 | refactor applier ignores unknown syntax (tooling) | OPEN | ADS-memory apply-repoint.mjs (not product; not re-verified) | LOW | refuse unknown action syntax | 1470 |
| C030 | census/templates tooling fixes | FIXED | sheets-fix2 / tovu-db (entry's own record) | — | — | 1469, 1471 |
| C031 | email-templates index forwards Jini renders | FIXED | T W/features/email-templates/index.ts:11-12 export local modules only | — | — | 1474 |
| C032 | Tovu tests left positional after args batch | OBSOLETE | refactor/terra clone era; typecheck:tests 0 on merge-11 | — | — | 1475 |
| C033 | Jini provenance source.url outside try; needless casts | FIXED | J cms/src/media/provenance.ts:40-42 | — | — | 1476 |
| C034 | Jini injection gate defects (debt vs base, aliases, template/createRequire imports) | FIXED | J 3e41809a8, 65c42167e; scripts/lib/import-sites.ts:4. Parse-diagnostic fail-closed not re-verified | — | — | 1477, 1483 |
| C035 | leaf-import-closures needs deleted ui/i18n; formatTimestamp ambient TZ | FIXED | J leaf-import-closures.test.ts has no ui/i18n; core/src/text/format-timestamp.ts:10 explicit viewerTimeZone | — | — | 1478 |
| C036 | re-export shells (no-shells rule) | OPEN | T A/lib/standing-draft-recovery-message.ts:8 (pure re-export, no admin importers found); W/server/inbound/assistant/plugin-prompt-prefix.ts:73 | LOW | repoint importers, delete shell / forwarding line | 1480 |
| C037 | stale Jini docs (ui api.spec.md:149, user-management README:31) | NOT-CHECKED | — | LOW | update formatTimestamp docs | 1480 |
| C038 | wave-b r3 compile/barrel/lockfile/clock issues (C2,C3,C5/C7,C9/C11) | OBSOLETE | branch-era; merge-11 typecheck 0, desktop tsc 0 (combine-11) | — | — | 1483-1487 |
| C039 | Jini core server: SSE ignores aborted signal, 204 body throws, non-JSON bypasses body limit, HEAD cancel | FIXED | J core/src/contracts/server/sse.ts:103; json-route.ts:96,138 (null-body statuses, ceiling for every method). HEAD cancel not re-verified | — | — | 1485 |
| C040 | desktop tests positional resolver / openSiteServer fakes | FIXED | 42deed5cd, 3289005b7; desktop tsc 0 | — | — | 1488-1489 |
| C041 | sheet catalog.test pin (MV-media-generation-1) | OBSOLETE | sheet era | — | — | 1490 |
| C042 | C10 landing type mismatches / missing hook imports | OBSOLETE | merge-11 typecheck 0 | — | — | 1491 |
| C043 | Tier-2 plugin worker has no import allowlist | OPEN | T W/server/runtime/plugin-tier2/worker.ts:36 `import(entryPath)`; only SDK specifiers registered | security (MED) | owner confirms intent; resolve hook refusing non-SDK bare specifiers + test | 1492 |
| C044 | plugin upload ZIP lets FIFO/device entries through | FIXED | J agent-plugins/src/lifecycle/yauzl-archive-reader.ts:18 refuses symlinks, FIFOs, special types | — | — | 1493 |
| C045 | B07 vault rotate re-seal verify broke key-switch recovery | FIXED | J afe6152a6, platform/src/secrets/credential-sets/vault.service.ts:67; T site-key-recovery.ts:162-173 | — | — | 1494, 1511, 1526 |
| C046 | admin imports website source across apps | OPEN | T A/features/menus/hooks/use-menu-editor.hooks.ts:16 `../../../../../website/src/platform/html/slug` | LOW | use a shared/Jini slug helper | 1495 |
| C047 | mcpIsolation claim false when capability unset | FIXED | 10605caf reverted (a619ab3b); J mcp-isolation-claim.unit.test.ts 5/5 (r62t-bugs) | — | — | 1496, 1513, 1526 |
| C048 | class-only error logs drop detail ("Error", "check failed: Error") | OPEN | J core/src/model-facing-tool-errors.ts:409-418 describes by vocabulary only; callers without a package vocabulary log the class (seed-bundled.ts:187, json-ipc, sign-in log 1612) | MED (owner rule) | finish err-design: every package registers its codes + redacted message detail (jx-err1/2 started it) | 1497, 1510, 1525, 1591, 1612 |
| C049 | `tovu init` imports removed agentic/a2ui | FIXED | merge-11 typecheck 0 | — | — | 1498 |
| C050 | form delivery status codes lost in outbox | FIXED | J infra/src/events/outbox/worker.ts:50-63 allowlisted codes (r62t-bugs) | — | — | 1501 |
| C051 | SEO PUT 400 instead of 409 ENTITY_IN_TRASH | FIXED | d11aa414 | — | — | 1502 |
| C052 | agent-daemon-core-rpc memory fixture split stores | FIXED | T agent-daemon-core-rpc.integration.test.ts:16-27 one chatKernel | — | — | 1503 |
| C053 | federation reload listener / stale test | OBSOLETE | T 1e77909965 retired the stale test (FED-T1) | — | — | 1504 |
| C054 | charts-recharts integrity pin vs published bytes | FIXED | T a9bcf2a9f9 approves published 0.7.3-next.2 payload; packaged Chrome/Electron look still owed | — | — | 1505 |
| C055 | federation logger adapters dropped {error} | FIXED | fix/wave-b-r2-web-a (entry) | — | — | 1506 |
| C056 | BM25 tie media_update_metadata vs media_generate_asset | OPEN | J cms/src/media/agent-tools.ts descriptor; rank unverified (r62t-bugs2) | LOW | reproduce with tool-search-operator-requests.json:36, adjust description | 1507 |
| C057 | L244 no-op patch bumps record version | OPEN | l244-characterization 17/4 still red (combine-11, same as base) | MED | skip the bump on empty patch; repoint 4 witnesses | 1509 |
| C058 | member lost update: save guards `version <=` | OPEN | T W/features/members/repo.ts:209 `.where("members.version","<=",record.version)` — same-basis writers both pass | MED (data) | compare-and-set on expected version like tiers (repo.ts:268-270); audit other 0042 tables | 1512 |
| C059 | A06 visitor-tool sheet unsafe as written | OBSOLETE | sheet retired | — | — | 1514 |
| C060 | raw bidi characters in visitor-confirmation filter | FIXED | T W/assistant/site/visitor-confirmation-gate.ts:38-42 + test :114-127 | — | — | 1515 |
| C061 | A37 pinned-capability returns raw token | FIXED | J mcp/src/federation/hosted/pinned-capability.ts:8-9,30 endpoint-bound supplier only | — | — | 1516 |
| C062 | A50 same-origin compares host+port, not scheme | FIXED | J core/src/contracts/server/same-origin-write.ts:16 `url.origin === origin` | — | — | 1517, 1519 |
| C063 | run-finalizer duplicate in Jini + F1-F3 suspects | OPEN | J chat/src/server/run-finalizer exported (package.json:153), unused by Tovu; T W/server/runtime/composition/modules/run-finalizer/* own copy | MED | adopt Jini copy or delete it; re-witness F1-F3 | 1518 |
| C064 | bound-confirmations falsy owner skips check | FIXED | J daemon bound-confirmations.ts:71 + test :129 | — | — | 1520 |
| C065 | ACP client gaps (capabilities, resume, set_model fallback, usage_update, unknown requests, vendor quirks) | OPEN | J agent-runtime ACP; cancel/id-less fixed (c52c3bae3); rest needs installed-CLI matrix (O2) | MED | run O2 matrix, fix per finding | 1521 |
| C066 | r3 web: SQLite-only SQL, render worker root import, ADR-070 import, /products hang | FIXED | 519a7b4b0, e0860bec7, 02681286b, eb265a4ab | — | — | 1522 |
| C067 | site-share-errors.ts re-export shell | FIXED | sendSiteShareFailure at routes/system/site-share-password.ts:53 (r62t-bugs) | — | — | 1522, 1549 |
| C068 | render.ts merge order vs size-03 | OBSOLETE | — | — | — | 1523 |
| C069 | electron-updater lazy import | FIXED | 3a2075d10; apps/desktop/src/main/index.ts static import | — | — | 1527, 1531, 1550 |
| C070 | custom hooks called directly in components | OPEN | gate exists (development/scripts/check-hook-injection.mjs); Tovu debt 41 rows in development/hook-injection-debt.json; Jini count not refreshed | LOW (rule debt) | burn down debt with inject-as-props sheets | 1528 |
| C071 | session save upsert can resurrect a revoked session | FIXED | T W/features/identity/repo.authentication.ts:73, members/repo.ts:402 keepStoredRevocation | — | — | 1530, 1553 |
| C072 | SC-H1 credentialed account probe follows redirects | FIXED | J agent-plugins/github/source-control/github.mjs:74-85 redirect:"error"; github.test.mjs:71-76 | — | — | 1533, 1554 |
| C073 | merge-final ratchets red (size/complexity/errors) | OBSOLETE | superseded: combine-11 complexity base 0, check:errors passes | — | — | 1535-1541 |
| C074 | check:architecture fails a hard metric (cycles, API surface) | OPEN | combine-11: exit 1 on base and final, "1 metric regressed"; propagation 3.26 | LOW | name the metric; fix cycle or owner re-baseline | 1539, 1547, 1593 |
| C075 | daemon error disclosure (run-store 400 "valid JSON", model-proxy upstream text, memory routes) | OPEN | unverified on base (r62t-bugs2 PARTIAL); no current response assertions | MED | pin each route; 5xx + plain copy, no dependency text | 1544 |
| C076 | 4 red integrations/plugins tests (Invalid URL in connect-tool.api-connections) | OPEN | unverified (r62t-bugs2) | LOW | match fixture URL to provider route | 1545 |
| C077 | settings/effective returns 400 | OBSOLETE | not a bug: json-route-fallbacks.unit.test.ts:53,64 pins 400 for missing namespace | — | — | 1546 |
| C078 | link-jini omits apps/desktop | FIXED | 9132a6300; development/scripts/jini-links.mjs:22-28 | — | — | 1551 |
| C079 | isAllowedHref accepts protocol-relative own host; throws on non-string | FIXED | J cms/src/navigation/href.test.ts:47-58 | — | — | 1552 |
| C080 | chat redaction regression + 9 gaps | FIXED | J diagnostics/src/core/secrets-only.ts:44 (passwd/pwd/id_token/auth_token/signing_secret/webhook_secret), :50 Bearer/Basic/Token/Digest/ApiKey; custom header names + false positives not re-verified | — | — | 1557, 1561 |
| C081 | chat embed widget missing surfaces provider | FIXED | J dc58acc1b (merged 3a7e7fa4d) | — | — | 1558 |
| C082 | desktop D0c plan: commit gate exit 0, stage script, closure flag | FIXED | stage in desktop manifest; verify-package.ts:49 (r62t-bugs) | — | — | 1559-1560 |
| C083 | args-sweep branch compile/caller drift | OBSOLETE | merged after fixes; merge-11 typecheck 0 | — | — | 1564-1566 |
| C084 | Agent Plugins generic toast; in-process daemon parked → 503 forever | OPEN | toast copy FIXED (404192478 in merge-11); T W/server/inbound/assistant/agent-daemon-scope.ts:188 in-process idle park still `exit: () => {}` → stays AGENT_DAEMON_PARKED (idle-park.ts:60) | MED (unverified live) | in-process: no idle park, or wake on request | 1567-1569 |
| C085 | refresh-bk tests expect AbortError, code throws InternalError | OPEN | unverified | LOW | decide abort-wrapping; pin | 1577 |
| C086 | batch-tool-inputs refused-item contract; import-local-file-search; typed-tools harness | OPEN | unverified (test/contract) | LOW | decide per-item failure vs reject; repoint | 1578, 1594, 1597 |
| C087 | method-typed ports accept args-shaped functions (bivariance) | OBSOLETE | risk note; sweep queued | — | — | 1579 |
| C088 | sidecar child-entries onExit bare listener | FIXED | J sidecar/src/supervision/child-entries.ts:126 onExit({ listener }) | — | — | 1580 |
| C089 | combine-4/5 fixed items (readEffective, operator locale, 409 labels, consent safeHref, console mail, reportInternalError) | FIXED | 1e4afe5f5, 784447d3f, a19070a6c, e2e2c83e0, f561995bd, 5a72fae00 | — | — | 1573-1576, 1583-1587 |
| C090 | merge-5 Jini/Tovu mismatch, ex-log skipped, 104 type errors, 9 test reds, generic ex-log text | OBSOLETE | resolved by combine-6 (ex-log merged, ~75 failures fixed) and later combines | — | — | 1588-1592, 1598 |
| C091 | lockfile http-kit workspace:^ vs workspace:* | OBSOLETE | not re-verified; later combines install | — | — | 1595 |
| C092 | user-management positional hook helpers | FIXED | J user-management use-users-password.hooks.ts:40, use-users-state.hooks.ts:8 object args | — | — | 1596 |
| C093 | taxonomy purge/trash hooks scalar repo calls | FIXED | J cms/src/taxonomy/taxonomy-trash-follow-ups.ts:65,72,108,157; trash-term.ts:50,55 | — | — | 1599 |
| C094 | design plugin not surfaced on turn 1; oversized guidance deferred; site_guide pointer | FIXED | J 96381bc48 (jx-route2 J1-J3, merge-12 a22566230) companions with top match; T content/agent-plugins/how-tovu-works/tovu-site-guide.json:151; more in tv-howto2 | — | — | 1602, 1603, 1605, 1606 |
| C095 | `<<SUBAGENT_DISPATCH>>` sent in every in-app prompt | OPEN | T W/server/inbound/assistant/agent-daemon-run-start.ts:378 prepends this repo's dev marker to client-site runs | LOW | send only when the site dir carries AI-Dev-Shop AGENTS.md, else omit | 1604 |
| C096 | cms submit-service host-options flake under load | OPEN | unverified (flaky) | LOW | make timing deterministic | 1607 |
| C097 | ThemePreviewReloadControl dropped (cms forbids react) | OPEN | unverified; needs a home in admin/ui | LOW | place in ui or admin | 1607 |
| C098 | xd5-render/publish unmerged (missing Jini exports) | FIXED | merged at combine-7 (C7 entries cite tv-xd5-publish) | — | — | 1611 |
| C099 | moved-tools catalog byte drift | OPEN | unverified | LOW | regenerate golden after explaining drift | 1613 |
| C100 | error-gate WARN rows (tovu-server.ts catch-reads-error, stdin-input.ts) | OPEN | unverified; check:errors passes 590/326 (in ledger) | LOW | fix the two catches | 1615 |
| C101 | wave-a3 splits of dev-auth.ts / assistant-byok lost | OPEN | T W/server/inbound/admin-http/dev-auth.ts 876 lines | LOW (owner: 500 not a blocker) | re-apply split when touched | 1616 |
| C102 | outbound/identity-settings characterization drift | FIXED | tests check boot-phases.ts:91,221 (r62t-bugs) | — | — | 1619, 1638 |
| C103 | site-chat visitor approval fails silently | FIXED | f064021231; SiteToolConfirmation.hooks.ts:24-32 | — | — | 1620 |
| C104 | merge-6 core lock downgrade / idioms export | FIXED | 0740ca85a | — | — | 1621 |
| C105 | ACP session/cancel sent with id; id-less error taken as model reply | FIXED | J c52c3bae3; session-run.ts:570, session-results.ts:57-58 | — | — | 1622, 1623 |
| C106 | resource card menu: no arrow keys, Escape swallowed | FIXED | J ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:33-40 | — | — | 1624 |
| C107 | resource card menu focus on open / restore on Escape | OPEN | unverified; ResourceCardParts.tsx:59-103, useResourceBoard.ts:177-204 (not mounted in Tovu) | LOW (a11y) | focus first item on open, restore trigger on Escape | 1657 |
| C108 | silent list caps (newsletter tool 100, send log 100, visitor search 20, saved keys 50) | FIXED | ceea7e24f0; T routes/newsletter/list-send-log.ts:25-29 cursor; assistant/site/tools.ts:210 truncated; tv-gate fa805fdab4 omitted counts; 45f44c2d9a | — | — | 1625-1628, 1645 |
| C109 | picker Cancel English; image model ignored | FIXED | ceea7e24f0 | — | — | 1629, 1630 |
| C110 | hygiene-audit false missing-translation rows | FIXED | T development/scripts/hygiene-audit.mjs:153-160 readLocaleSpread (T-I18N) | — | — | 1631 |
| C111 | json-ipc malformed frame echoes input | FIXED | J c52c3bae3 BAD_FRAME | — | — | 1632 |
| C112 | json-ipc handler builds its own console logger | OPEN | J sidecar/src/json-ipc.ts:14,379 | LOW | inject host reporter; keep code + traceId | 1633 |
| C113 | signed-out screens show full Copy-details | FIXED | 764cbc04a8 disclosure="id-only" | — | — | 1634 |
| C114 | admin incident ID raw UUID | FIXED | T W/server/inbound/shared/admin-failure.ts:10,56,75 mintToolErrorId (bugs1 T3) | — | — | 1635 |
| C115 | disk-space 507 refusal still reported as an incident | OPEN | T admin-failure.ts:76-78 reportServerFailure runs before the DatabaseDiskSpaceError branch | LOW (owner decision) | classify disk refusal first; no incident | 1635 |
| C116 | check-error-gate --update lets debt grow | FIXED | J scripts/check-error-gate.mjs:107-115 | — | — | 1636 |
| C117 | media byte-size N+1 | FIXED | b53b3595cc | — | — | 1637 |
| C118 | Jini agent-plugins expand test flake | FIXED | engaps J6 findByRole | — | — | 1639 |
| C119 | private repo backup commits warned files | FIXED | T W/features/site-backup/backup-service.ts:696 UNSAFE_FILE (tv-own Q3); stale test repoint in codex/tv-bugs3a (B7) | — | — | 1642 |
| C120 | assistant tools registered with always-allow policy | FIXED | J 246854498 + T 4692bc9a1 | — | — | 1643 |
| C121 | cancelled runs still write (CMS updates, theme import) | FIXED | J 246854498, 31d6ce265; T 35723a55ee | — | — | 1644 |
| C122 | redirect wildcard rules sliced at 500 | FIXED | J af6ff0339 + T d5a60ee1e | — | — | 1646 |
| C123 | page built from an image lands in widgets | FIXED | T tovu-site-guide.json:151 ("create a page and put its layout in the page's HTML"); tv-howto2 adds more | — | — | 1647 |
| C124 | YouTube embeds blank in page Preview | FIXED-PENDING | codex/tv-bugs3b e73e946464 (A/features/pages/lib/page-preview-youtube.ts) | — | — | 1648 |
| C125 | "Someone else saved this" loop after assistant edits | FIXED-PENDING | codex/tv-bugs3b e73e946464 (A/hooks/use-external-entry-refresh.hooks.ts, editor recheck) | — | — | 1649 |
| C126 | AI guidance gotchas G01-G18 (import moves homepage, scoped publish, rich text, retries…) | FIXED-PENDING | codex/tv-howto2 c0f70b84c2 (W1-W12); G13-G18 mapping not checked | — | — | 1650 |
| C127 | post editor "reading 'commands'" + Publish writes empty body | FIXED-PENDING | codex/tv-bugs3b (contains post-editor-null 3e0eb2a34d) | HIGH (data loss) | merge with combine-12 | 1651-1652 |
| C128 | quick post switch shows the older post | FIXED-PENDING | codex/tv-bugs3b e73e946464 (post load race) | — | — | 1653 |
| C129 | pages editor load failure shows raw e.message | FIXED-PENDING | codex/tv-bugs3b e73e946464 (plain page-load errors) | — | — | 1654 |
| C130 | failed assistant_ask_choice shows raw JSON-schema error | OPEN | unverified on base | LOW | plain copy in tool row; schema text to details | 1658 |
| C131 | NEW: AG-UI fallback copy generic; error frames forward daemon text | OPEN | T assistant-ag-ui.ts:303 "assistant failed"; J event-projection.ts:239 writes outcome.error.message from daemon frame | LOW | plain sentence + error ID; daemon text only in details | (new, near 226) |


## Part A rows (lines 264-973)

id | short title | status | evidence (commit or file:line) | severity | fix direction | source line(s)
---|---|---|---|---|---|---
A001 | Chat first message 503 AGENT_DAEMON_UNAVAILABLE under load; error card shows App/Jini version/Error ID "Unavailable" | UNVERIFIABLE | load-only; readiness recovery 760b05dd6 in J; "Unavailable" fields re-seen 11-06 | — | — | 282, 409, 933, 953
A002 | kUInetic tilt-parallax: no warning when no data-depth children | UNVERIFIABLE | kUInetic source not in T/J | — | — | 283
A003 | leon-editorial Selected work timeline:view overrides data-kui-timeline | UNVERIFIABLE | owner site theme, not in repo | — | — | 284
A004 | leon-editorial no skip link | UNVERIFIABLE | owner site theme | — | — | 285
A005 | leon-editorial nav buttons 4px apart at 360-375px | UNVERIFIABLE | owner site theme | — | — | 286
A006 | kUInetic lightbox close button 40x40 (<44px) | UNVERIFIABLE | kUInetic default, library not in repo | — | — | 287
A007 | composio plugin "interrupted update could not be recovered / exclusive file lock timed out 15s" at boot, plugin kept off | OPEN | J packages/agent-plugins/src/lifecycle/update.ts:310 (message still the outcome); seen 11-02..11-06 under load | MED | lock wait at boot should not disable plugin; retry recovery in background, name the holder | 288, 339, 853, 931, 933, 969
A008 | Shared Keys picker returns only {cancelled}; can't name source site | FIXED | 0b05623ba (in T) | — | — | 289
A009 | No way to reuse/copy a key from one site to another; Shared Keys only | FIXED | 0b05623ba (in T); also covers 11-04 card never offering Shared Keys | — | — | 290, 872
A010 | /m/<slug>/original returns 404 "video rendition not found" for raster images | OPEN | T apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:652 (raster stays on re-encode path by design) | LOW | serve raster original bytes or document the public URL forms | 291
A011 | Static export drops files referenced only by scripts/data-* (hero videos, manifests) | OPEN | J packages/devops/src/static-export/transforms.ts:147-159 (script contents inert; no data-*/script crawl) | MED | crawl data-* / JSON manifests or let themes declare extra export files; warn on unresolved | 292
A012 | Theme file listing stops at 2,000 files silently | FIXED | T features/theme/__tests__/build-conformance.test.ts:384-391 ("2000-file inventory cap" issue reported) | — | — | 293
A013 | Media page Extra large same as Large at some widths | FIXED | (log) fixed in code before 11-09; not re-verified | — | — | 294
A014 | kUInetic lightbox caption overlaps counter | UNVERIFIABLE | kUInetic library | — | — | 295
A015 | kUInetic staggered groups ~100ms per chunk first-scroll stutter | UNVERIFIABLE | kUInetic library | — | — | 296
A016 | kUInetic cursor-trail builds layer under reduced motion | UNVERIFIABLE | kUInetic library | — | — | 297
A017 | ui-ux-design kuinetic-reference.md documents v0.2.4 | NOT-CHECKED | plugin moved to J packages/agent-plugins; guess still stale | — | — | 298
A018 | kUInetic lightbox overwrites authored data-kui-lightbox-src | UNVERIFIABLE | kUInetic library | — | — | 299
A019 | kUInetic wipe-up/mask-reveal with threshold never fires (clipped ratio 0) | UNVERIFIABLE | kUInetic library | — | — | 300, 303
A020 | orvellea live site shows "Calendar goes here" | UNVERIFIABLE | client site content; check live | — | — | 301
A021 | jared-floyd Bold About shows placeholder image | UNVERIFIABLE | client site content | — | — | 302
A022 | Old cookie banner Accept doesn't release YouTube; preview sandbox blocks YouTube | FIXED-PENDING | banner e54566312+9a873fd97 (J) and preview 5b7db91e9 (T) in base; "Watch on YouTube in Preview" e73e946464 on codex/tv-bugs3b | — | — | 304, 434, 592
A023 | Importing a 0.1.24 export refused | OBSOLETE | owner 10-31 won't fix old-zip compat | — | — | 305
A024 | Older zips refused with wrong advice | FIXED | 9081f631e (advice); compat won't-fix | — | — | 306
A025 | Codex chat "Cannot find module smol-toml" (packaged) | FIXED | c19aede4d (T) + 93f7ff888 (J) | — | — | 277, 590
A026 | Word/PDF reading fails (mammoth, unpdf missing) | FIXED | c19aede4d + 93f7ff888 | — | — | 278
A027 | Import refuses "credential-shaped content" on own plugin files | FIXED | bd2f0f99f + 2933fbb3f | — | — | 279, 591
A028 | Aider/Qwen model list fails @jini-ai/integrations | FIXED | 2a819ef06 + 93f7ff888 | — | — | 307
A029 | Copilot model list fails; saved "copilot" AGENT_NOT_FOUND | FIXED | 5e48b4fb5 (J), 2db8332cb, b385c64a2 + 84a87bcd1 | — | — | 308, 454
A030 | Edited built-in plugin blocks sharing | FIXED | 2933fbb3f | — | — | 309
A031 | Post with "Authorization: Bearer" refuses whole share | FIXED | 2933fbb3f (blank + notice) | — | — | 310
A032 | Plugin on/off choices dropped on import | FIXED | 9081f631e | — | — | 311
A033 | Export omission notices thrown away (use-site-transfer.hooks.ts:81) | FIXED | 2933fbb3f | — | — | 313
A034 | Import with theme "none" gets starter | FIXED | 2933fbb3f | — | — | 314
A035 | Import warnings vanish after refresh | FIXED | 2933fbb3f | — | — | 315
A036 | kUInetic on:hover binds to moved target, flicker | UNVERIFIABLE | kUInetic library | — | — | 318
A037 | kUInetic marquee timeline:view silently runs on time | UNVERIFIABLE | kUInetic library | — | — | 319
A038 | kUInetic highlight-sweep color:var() ignored | UNVERIFIABLE | kUInetic library | — | — | 320
A039 | leon-editorial theme.css :has footer selector fragile | UNVERIFIABLE | owner site theme | — | — | 321
A040 | kUInetic formatted counters slow (Intl.NumberFormat per tick?) | UNVERIFIABLE | kUInetic library | — | — | 322
A041 | kUInetic masked-label-swap shows both labels on padded buttons | UNVERIFIABLE | kUInetic library | — | — | 323
A042 | kUInetic pin-section stuck without own parent | UNVERIFIABLE | kUInetic library (docs) | — | — | 324
A043 | leon-editorial reduced motion grid fallback never applies | UNVERIFIABLE | owner site theme | — | — | 325
A044 | leon-editorial --card-w dead variable | UNVERIFIABLE | owner site theme | — | — | 326
A045 | leon-editorial dark .btn:hover unreadable | UNVERIFIABLE | owner site theme | — | — | 327
A046 | tovu-starter theme-toggle uses shared key tovu-starter:mode, copied themes share light/dark | OPEN | T content/themes/static/tovu-starter/scripts/theme-toggle.js:2 (+ __original-themes__ copy) | LOW | derive storage key from theme id/folder at render, or tell theme_duplicate to rewrite it | 328
A047 | kUInetic carousel-stack no per-breakpoint shift/rise | UNVERIFIABLE | kUInetic library | — | — | 329
A048 | leon-editorial stale screenshot/description | UNVERIFIABLE | owner site theme | — | — | 330
A049 | Every direct Jini MCP tool call renders twice (mcp__jini__X + X); ask-choice two rows | FIXED | da8a138b2 (J); Gemini bcca849ed (J) | — | — | 331, 356, 357, 573
A050 | search_tools "unknown argument max_results" wastes a turn | FIXED | 209434d6e (J) + 2f1fc8bde | — | — | 332, 496
A051 | Local test site cookie banner never closes (consent 403 loopback) | FIXED | da5ebc7c9 | — | — | 333, 435
A052 | Theme thumbnails include cookie banner | FIXED | 92247090c | — | — | 334
A053 | "Make my site look like this picture" layers override CSS on starter | FIXED | e958237f9 (guidance) | — | — | 335
A054 | "Done · 42s" timer understates (skips startup wait) | UNVERIFIABLE | J chat/core/turn-usage.ts:180 now prefers server durationMs; needs a timed live run | — | — | 336
A055 | Dashboard Appearance card stale after chat activates theme | FIXED | 3dc161838 | — | — | 337
A056 | Model picker shows raw ids under "Offline fallback"; Escape doesn't close | FIXED | J packages/chat/CHANGELOG.md:61; model-options.ts:44 | — | — | 338
A057 | Dev boot dies "More than one registered directory has this name", names no path/IDs | FIXED | J packages/platform/src/fs/workspace-directory.ts:47,51 (picks one, lists others with labels) | — | — | 340
A058 | Chat rebuilt existing theme in place and activated with no card/undo | OBSOLETE | owner rule "only perma-deletes confirm"; edits revisioned (T contracts/core/tool-metadata/theme.ts:8-9) | — | — | 341
A059 | Final summary misdescribes header menu | OBSOLETE | model wording, no code defect | — | — | 342
A060 | Publish disk-full surfaces as bare 500, errorId dropped; no warning before volume fills | FIXED | T features/publish-content/peer-transport.ts:159 keeps errorId; retention 87887c4fa + 2375af6b2 (J); pre-full warning not verified | — | — | 343, 645, 647
A061 | Just-published media shows "Skipped — Different version already on live" | UNVERIFIABLE | never investigated; needs live publish repro | — | — | 344
A062 | Static export "Duplicate file or file/directory collision" (f8) | FIXED | 315c5ab12 + d14a57ddb (J) | — | — | 345, 420
A063 | Tool-made images not shown inline; media_generate_asset/upload/replace no preview | FIXED | a3d40301a (J), 79b857d17, 96fa7bd39 | — | — | 346, 437, 463
A064 | Export picker shows folder names; button narrows | FIXED | T apps/admin/src/features/sites/StaticExportPicker.tsx:59-61 (keyed by themeId, shows name) | — | — | 347
A065 | Approval-card field titles untranslated | FIXED | 692206e72 | — | — | 348
A066 | Model name truncates "Son…" with folder attached (desktop only) | UNVERIFIABLE | not reproduced in browser; needs desktop check | — | — | 349, 504
A067 | Desktop CSP inline-style error; "Memory unavailable" 2 min | FIXED | 79b857d17 + 0c70a9eb2 | — | — | 350
A068 | Pre-existing test failures (archive progress; original.svg basePath) | FIXED | 2933fbb3f + 315c5ab12 | — | — | 351, 458
A069 | Post opens dirty when stored title differs from body title | FIXED | 129b55683 | — | — | 353
A070 | Integer bar chart gets fractional y ticks | FIXED | 6ca90820a | — | — | 354
A071 | Tool row target shows raw UUID; long names squeeze target | FIXED | 4274aa175 + 119b19480 (J) | — | — | 355
A072 | Folder-path button opens native dialog on server Mac with no note | FIXED | 74106f626 | — | — | 358
A073 | Trash tip contradicts theme-file trash wording | FIXED | 019b3f7da | — | — | 359
A074 | Trashed page shows Kind "Post" | FIXED | 8a19e3b48 + 019b3f7da | — | — | 360
A075 | Theme file restore leaves empty batch folder | FIXED | 019b3f7da | — | — | 361
A076 | Cleanup reply says seven items, moved six | OBSOLETE | model wording | — | — | 362
A077 | Tool row names cut to "Tool…" by prefix | FIXED | 984b71750 (J) | — | — | 364
A078 | Small whole-count charts pad axis to 4 | FIXED | 194095b1a | — | — | 365
A079 | Jump to latest button white in dark dock | FIXED | de24b8dae | — | — | 366
A080 | Folder-window note covers composer text | FIXED | 45a5a47ef | — | — | 367
A081 | Edit post header gear wraps at 375px | FIXED | 514685651 | — | — | 368
A082 | Slug input fixed 16rem | FIXED | dcc9d4a06 | — | — | 369
A083 | Appearance accent swatch names are hex codes (Tovu + Jini AppearanceTab) | FIXED | 7612cd1bc, d1247f318 (J) + 1e3237b8a | — | — | 370, 371
A084 | Jini swatch names untranslated in Jini dictionaries | FIXED | e044ce043 (J) | — | — | 372
A085 | ToolCard re-formats JSON every rerender | FIXED | 6ed2b12a0 (J) | — | — | 373
A086 | Page preview expand control misplaced at 375px (46px, then 4px) | FIXED | 7583cae01 + 1982c6acf | — | — | 374, 376
A087 | Charcoal swatch invisible on dark | FIXED | 39b95cefe | — | — | 375
A088 | Edit page header 6 rows at 375px | FIXED | 7b4d14afe | — | — | 377
A089 | Jump to latest covers tool-row chevron | FIXED | 91725a92d | — | — | 378
A090 | tmp admin builds never removed on :3000 restart | FIXED | 4766c3bde (legacy PID-less dirs not auto-reclaimed) | — | — | 379
A091 | Zoran site email button clipped / video preview blank / reduced-motion carousel | UNVERIFIABLE | client site; 79b857d17 may cover preview | — | — | 383
A092 | Site URL saved as https://localhost:3000 -> canonical/social point at localhost | FIXED | 315c5ab12 (request origin) + c6be8d214 | — | — | 384, 540
A093 | Media grid tiles cropped to landscape | FIXED | (log) verified in Chrome 10-31 | — | — | 385
A094 | Confirm card / tool rows show raw tool id + JSON (B3) | FIXED | 1ecd43ed9 + 613c6eaad (J); checked 11-01 s12 | — | — | 386, 495
A095 | Posts editor ignores assistant edits; old slug in URL | FIXED | (log) verified 10-31 | — | — | 387
A096 | Assistant says "deployment is running" while card waits (B1) | FIXED | (log) verified 10-31 | — | — | 388
A097 | Assistant re-asks for saved Vercel token (B2) | UNVERIFIABLE | related cross-site key fix bfdbf1be7 in T; needs a real chat | — | — | 389
A098 | Picked folder "outside allowed root" (B7) | FIXED | (log) verified 10-31 | — | — | 390
A099 | Bundled tovu-theme plugin edits fail EACCES (B12) | FIXED | 77a36d47b | — | — | 391
A100 | "Add my Calendly" fails; public CSP lacks Calendly | FIXED | 77a36d47b + 96fa7bd39 | — | — | 392, 445
A101 | Failed chat run saved as succeeded | FIXED | 096d76c89 + 054245afd (J) | — | — | 393
A102 | Desktop site with external DB shares data with copy | FIXED | 0c70a9eb2 | — | — | 394
A103 | Publish sync refused forever after content-hash bump | FIXED | 54cfd4566 | — | — | 395
A104 | Theme Explore misses agent add/remove | FIXED | (log) verified 10-31 | — | — | 397
A105 | Dock open flips Gemini key to "API key not valid" | UNVERIFIABLE | not reproduced; needs Chrome + Network tab | — | — | 398
A106 | Many admin screens show untranslated text | OPEN | broad; many screens since localized (e.g. 6e3fa94f2, Skills.tsx:1) | LOW | run hygiene-audit missing-keys report and fix per screen | 399
A107 | Sign-in password has no eye | FIXED | bc27fd73f + 31873ac5d | — | — | 400
A108 | ~35 Bash failures per session in Full CLI access (B9) | UNVERIFIABLE | needs Full-CLI chat that forces Bash | — | — | 401
A109 | check_messages via execute_delegated_tool "no tool registered" | FIXED | 054245afd (J) | — | — | 402
A110 | Antigravity can't apply per-tool limits | OBSOLETE | J agent-runtime/src/native-tool-policy.ts:74-84 refuses with a clear message; capability gap by design | — | — | 403
A111 | Desktop memory pill over-counts | UNVERIFIABLE | needs desktop | — | — | 404
A112 | node-pty not shipped; ABI-mismatch message; spawn-helper 0644 | FIXED | 66fae2eaf + 253682e3e, 8ff9f6a57 (J), 6269bc845, 99adab63f | — | — | 405, 425, 473, 711, 739
A113 | Stale "tovu-dev" desktop card; desktop sites no local sign-in | UNVERIFIABLE | needs live desktop | — | — | 406
A114 | e2e:desktop:app breaks on Node 24.2.0 | FIXED | 66fae2eaf | — | — | 407
A115 | Duplicate fake-test-site registry row | FIXED | cf793a766 + 9baaba3e8 (J); owner row cleanup is env | — | — | 408, 464
A116 | r24 leftover tests never ran | OBSOLETE | "unclear", no defect named | — | — | 410
A117 | template-render canary missing platform/net export | FIXED | dead68f76 (J) | — | — | 412
A118 | tiptap vocabulary test ajv import | FIXED | 1238a70f6 | — | — | 413
A119 | tovu-theme theme.json no templateFor | FIXED | 315c5ab12 | — | — | 414
A120 | Windows local-site env case allowlist; preload rm; dev-desktop spawns npm | FIXED | 2a819ef06 | — | — | 416, 419, 427
A121 | Desktop .js imports of .ts-only files; @jini-ai/db undeclared | FIXED | 66fae2eaf | — | — | 417, 462
A122 | smoke-native swallows load errors -> false PASS | FIXED | 2a819ef06 | — | — | 418
A123 | Staged dependency version collisions; nested gaps | FIXED | fc4f0e45e + d14a57ddb (J) | — | — | 421
A124 | AGENTS.md links missing in clone | OBSOLETE | won't fix | — | — | 422
A125 | "Retried" matches by tool name only | FIXED | b8aee6e79 (J) | — | — | 424
A126 | Test fixtures hold private keys before public push | FIXED | 9a7451e1b (J) | — | — | 426
A127 | Transfer-history keys omit user; AdminIdentityUser canRename | FIXED | 2933fbb3f | — | — | 429, 430
A128 | SEO contributor shared state; GH Pages prefix; sitemap URLs | FIXED | 315c5ab12 + b8aee6e79 (J) | — | — | 432
A129 | No deep link to a media item | FIXED | c93565260 | — | — | 436
A130 | jsdom scrollIntoView missing in agent-drive tests | FIXED | 664d06fd8 (J) | — | — | 439
A131 | Member sign-in no eye; Posts editor no external-change banner | FIXED | (log) verified 10-31 | — | — | 440, 441
A132 | tool-metadata baseline fails on new tools | FIXED | a04706e1b | — | — | 443
A133 | Undeclared hoisted ajv | OBSOLETE | tests only; guard 66fae2eaf | — | — | 444
A134 | Jini guard:drift violations; assemble test ENOENT; undici dead branch | FIXED | 5e48b4fb5, cf793a766 (J) | — | — | 447, 448, 449
A135 | Plugin BLOB column not scanned for keys | FIXED | 9081f631e | — | — | 451
A136 | Consent client over gzip budget (38 B, then 4609 B) | FIXED | 9a873fd97, 101ba56b2 (J) | — | — | 453, 545
A137 | Forced-sounding approval translations (de/it/id) | UNVERIFIABLE | needs native-speaker review | — | — | 455
A138 | wip(visitor) red tests; AC5 timeout hang | FIXED | 0690c8c07, a04706e1b, 9e75e9e47 | — | — | 456, 475
A139 | Late chunk after end re-arms idle timer; late frames mutate reply | FIXED | 84da66298 | — | — | 459, 536
A140 | Guest-token signature length compare can throw | FIXED | eee7be7c9 (J) | — | — | 460
A141 | patch-canary / guard-drift entrypoint compare no-op via /var | FIXED | da96ce4da (J) | — | — | 461
A142 | Malformed Host header broke live renders | FIXED | 315c5ab12 | — | — | 466
A143 | Theme catalog order dependent tests; ~45 publish tests broke | FIXED | 315c5ab12 | — | — | 467, 469, 478
A144 | tovu export can't pass public URL | FIXED | 8e9940e65 | — | — | 468
A145 | Import warning says plugin kept off when on | FIXED | 8e9940e65 | — | — | 471
A146 | Admin imports undeclared deps (tiptap, plugins, devtools) | FIXED | 306acf285 | — | — | 472
A147 | Message-less assert.ok can pin CPU | FIXED | c37ddbf8d | — | — | 477
A148 | exportSite silently ignores base path; CLI wording in notice | FIXED | 5c15ff7e6 + f634c9aea | — | — | 479, 571
A149 | DeployTarget doc wording | FIXED | 4a1c9bac2 (J) | — | — | 480
A150 | Throwing after hook skips later hooks (teardown) | FIXED | c7b9393c7 | — | — | 482
A151 | Mac Maintenance Sleep freezes runs | OBSOLETE | environment, mitigated with caffeinate | — | — | 483
A152 | Picked absolute path redacted as "[token removed]" | FIXED | 9d2396ee1 (J) | — | — | 485
A153 | Export "Include saved keys" fails generic; WAL CANTOPEN | FIXED | 59eb25cb0 + 3d0fbb60c (J) | — | — | 486, 506
A154 | Site theme copies never get pages-blank.html | FIXED | a4810760e | — | — | 487
A155 | Journey admin build 120s timeout under load | FIXED | d27c6c9c3 + db1de2ae5 (J) | — | — | 488
A156 | :3000 restart kills a site mid-start; site stops after restart | FIXED | cdbddddae (resume) | — | — | 489, 512, 520
A157 | Two stacked banners after assistant edit; status "version 2" stale | FIXED | f7ad44fd1, 42384d9c5 | — | — | 490, 491
A158 | Assistant says "reload it" after editor followed | FIXED | 2f1fc8bde | — | — | 492
A159 | Theme Explore Copy URL stale; Delete wording vs trash | FIXED | c1f1d2f14, 683e759e2 | — | — | 493, 494
A160 | Redaction notice stays pinned unstyled | FIXED | bc8e256af (J) | — | — | 497
A161 | Chart x-axis labels truncated; stray "·" line | FIXED | bd018de69, 47b4199e0 | — | — | 498, 519
A162 | mingjie open-heart skip link always visible; CTA unstyled | UNVERIFIABLE | client theme not in repo | — | — | 499
A163 | server.log "[consent] read failed" every second | FIXED | 209434d6e (J) | — | — | 500
A164 | New Post routes to /posts/untitled before save | FIXED | d1fd7e1eb | — | — | 501
A165 | Preview note unpadded; SOON badges on Import/Export | FIXED | 5c7d5c4b5, 329d1e157 | — | — | 502, 503
A166 | site-imports / recovery raw errors swallowed or leaked | FIXED | 88f429c25 | — | — | 507, 508
A167 | Folder formatter space-joins unquoted paths; secret after path not redacted | FIXED | b2c3f637e (J) | — | — | 509, 514
A168 | View Template 404 for inherited template | FIXED | 83d03bb8d | — | — | 510
A169 | Jini tool catalog advertises "98% retrieval" | FIXED | 11e787849 (J) | — | — | 511
A170 | shipped-theme drift canary; build.lock probe | FIXED | 83d03bb8d | — | — | 515, 516
A171 | Jini real-catalog test duplicate "Revenue" | FIXED | b2ea75b9d (J) | — | — | 518
A172 | detect-agents test finds host Claude | FIXED | 9c3945119 | — | — | 522
A173 | Duplicate skill name ~150s | OBSOLETE | test-only cost; typed refusal 88f429c25 | — | — | 523
A174 | Secrets glued to paths / hand-typed spaced path redaction gaps | FIXED | cf5571045 (J) | — | — | 525, 544, 552
A175 | Accepted residual ~0.5% glued keys escape | OBSOLETE | accepted residual | — | — | 641
A176 | Backstop send/undo raw messages, raw-row errors, case-sensitive undo, generic 500 | FIXED | 3f96988fe | — | — | 526, 532, 533, 537, 539
A177 | Sites settings raw 400 messages | FIXED | d491262b7 + eee7be7c9 (J) | — | — | 527
A178 | plugin-hook-error logs unredacted | FIXED | d491262b7 | — | — | 528
A179 | Newsletter create-campaign test flaky (wildcard listen) | FIXED | 9c3945119 | — | — | 529
A180 | Static-asset middleware reads themes once | FIXED | ae9fe327c | — | — | 530
A181 | Newsletter campaign bodyJson validated then dropped | FIXED | T features/newsletter/repo.rows.ts:102-116 (editorial_state_json) + campaign-write-service.ts:118 | — | — | 534
A182 | ~107-120 bare listen(0) test call sites | OPEN | guard c7b9477c3 baselines existing calls; migration not done | LOW | migrate baselined calls to startTestServer | 541
A183 | optional-peer-contract message drift | FIXED | c6fc0b90d (J) | — | — | 546
A184 | Specific import refusals masked by generic version advice | FIXED | 0c41ef0e5 | — | — | 547
A185 | commit-site relocation test drift | FIXED | c6be8d214 | — | — | 548
A186 | pages-blank loads kUInetic itself; chromeless canary | OBSOLETE | coordinator decision; 24ee23c39 | — | — | 549, 550
A187 | Theme test loader reads all partials vs manifest | FIXED | c7b9477c3 | — | — | 553
A188 | cookie-consent isFlags accepts inherited booleans | FIXED | 3785cb992 (J) | — | — | 555
A189 | /llms.txt used stored origin | FIXED | fbd28d4d1 | — | — | 556
A190 | Import refusals echo hostile names / raw kernel errors / whole schema; worker stderr lost then unredacted | FIXED | fbd28d4d1, 85afed951 | — | — | 557, 558, 559, 560, 563
A191 | Stale share/robots/feed tests | FIXED | fbd28d4d1, 9c7a0afdb | — | — | 561, 562
A192 | Website test helpers leak DBs / teardown races / wildcard stub | FIXED | 8b314843a | — | — | 564, 565, 566, 567
A193 | Tool row target shows nested error name; JSON reparsed per render | FIXED | 7ff16cd1f + f5373f58a (J) | — | — | 569, 570
A194 | Gemini CLI reads show "Read · (unnamed)" | FIXED | bcca849ed (J) | — | — | 575
A195 | Batched calls show no target | FIXED | bcca849ed (J) | — | — | 576
A196 | Two reads of one file at different offsets look identical | OPEN | residual noted after bcca849ed | LOW | show offset/line range in row target | 576
A197 | First call to a found tool goes out with {} args (batch wrapper drops required) | FIXED | 6cead3c98, 22cd93a7a, 7a2b4f7f9 (J) | — | — | 577, 580, 585, 586
A198 | Accessible name repeats "Tool call" | FIXED | 6ccffc6dd (J) | — | — | 578
A199 | fs_list_files root returns 144k chars | FIXED | 6f82b37de (J) + 5d264abf3 | — | — | 579
A200 | Order-free pairing can hide refused receipt | FIXED | ab7c3b92e + 1148c3bfc (J) | — | — | 581
A201 | describe_tool NOT_FOUND for renamed card ids | FIXED | 1f6312d12 | — | — | 583
A202 | BYOK search_tools description omits signature | FIXED | 1f6312d12 | — | — | 584
A203 | Read-only describe hides guidance entries | FIXED | c0f133709 (J) + 7ab029266 | — | — | 587
A204 | f2/f3/f4/f5/f6/f7 fixes "not checked in UI" list | FIXED | (log, not re-verified) e1c151a88, 471943363+dead68f76, c5b4d94f6, ef1ae2ea7, 83f78f457, f9aaf8698 all in base | — | — | 593, 594, 595, 596, 597, 598
A205 | untranslated-copy test red on real words; use-posts tests broke | FIXED | (log, spot-checked ancestry) 575210942, 86068b89d | — | — | 622, 623
A206 | Jini release build order luck (plugin-* undeclared deps) | FIXED | d61ebc363 (J) | — | — | 624
A207 | publish.yml npm@latest pack-JSON crashes; npm 12 helpers | FIXED | 2cda47532, 88e8f9fcb, 5701267ae (J) | — | — | 625, 632
A208 | Demo reel desktop clip shows other sites' names | UNVERIFIABLE | video asset; owner must check reel before public use | — | — | 626
A209 | Demo reel nimbus/higgsfield clip content issues | UNVERIFIABLE | video asset | — | — | 627
A210 | :3000 API restarts every 2 min under Codex edits | OBSOLETE | dev by design | — | — | 628
A211 | In-app Claude CLI drove Claude in Chrome, closed another tab group | UNVERIFIABLE | environment/tooling; needs owner policy | — | — | 629
A212 | No agent upload route for video >10 MB | OPEN | Chrome upload tool cap; local import 50 MiB only | LOW | accept agent upload via local file import path or chunked upload | 630
A213 | Media Upload/Import icon buttons no tooltip | NOT-CHECKED | "fixing" 11-01; guess fixed | — | — | 631
A214 | Main CI red: 6 TS errors; secrets false positives | FIXED | 46293346b + d441070a5 | — | — | 633
A215 | Site import ReferenceError savedKeys | FIXED | 46293346b | — | — | 634
A216 | local-site-supervisor TS18048 stored | FIXED | cdbddddae | — | — | 635
A217 | PROD down: boot refusal on default owner password | FIXED | b0bd02480 (refusal removed) | — | — | 636, 643
A218 | SECURITY tovu.dev owner password still the DEFAULT (owner to change manually) | UNVERIFIABLE | live-site state; owner check owed | — | — | 643
A219 | Owner's npm run dev died after reviewer rebuilt Jini | OBSOLETE | one-off environment | — | — | 637
A220 | AssistantDock "Stop during wake" test stale | FIXED | 348f83130 | — | — | 638
A221 | Symbol metadata lost on structuredClone; plan-mode overwrites description; stale eslint-disable | FIXED | ab7c3b92e (J) | — | — | 639, 640, 642
A222 | Stale running-lease lock: "Timed out waiting for file lock (holder undefined)" | UNVERIFIABLE | J platform/src/fs/directory-workspace.ts:36 same message; needs stale-lock repro | — | — | 644
A223 | Codex migration jobs in tree :3000 serves | OBSOLETE | process lesson | — | — | 646
A224 | Jini chat loads-without-driver string_decoder skip; plugin package.test devDeps | OBSOLETE | test file no longer in J base (only listed in dbpkg-chat json) | — | — | 648
A225 | Jini scripts typecheck possibly-undefined entryPath | FIXED | tsc -p scripts exit 0 after 88e8f9fcb (J) per 632 | — | — | 649
A226 | Seed-hash temp DB copy; restore-point name collisions; reset password every boot | FIXED | ae9fe327c + 1ee8b8074 (J) | — | — | 650
A227 | Folder chips: no inset, no copy tooltip, single folder repeated | FIXED | J packages/chat/src/react/components/FolderChips.tsx:23,36 | — | — | 651
A228 | Skill-drop error fills half the dock | FIXED | 47b4199e0 | — | — | 652
A229 | Folder drop notice names only last folder | FIXED | 47b4199e0 + acfe358b7 | — | — | 653
A230 | npm trusted publishing (OIDC) rejected | UNVERIFIABLE | owner's npm settings | — | — | 654
A231 | Visitor proposal strip activates navigation (fixture drift) | FIXED | a7b98c63c | — | — | 656
A232 | Site-assistant confirm refused from preview/desktop hosts; frontend-control ignores Fetch Metadata (SECURITY) | FIXED | (log, not re-verified) tovu-7b 11-01 shared origin policy allowsVisitorRequestOrigin | — | — | 657, 671
A233 | site-title AC-12 hang on title pin | FIXED | (log, not re-verified) tovu-7b | — | — | 658
A234 | Render workers load @jini-ai/agentic root barrel | FIXED | 71e70dbdc + ee923aa27 (J) | — | — | 659
A235 | Batched media_view_video returns no frames | FIXED | 771a35f48 | — | — | 660
A236 | analytics recent-hits 500 lost envelope | FIXED | cdb1e8fac | — | — | 661
A237 | Jini embed-widget globalThis.fetch; sqlite shim version; ENOENT statfs text | FIXED | c3af12b32, 33a173aec, c1b1b0594 (J) | — | — | 662, 663, 664
A238 | Visitor page.* tool translations missing | FIXED | (log) 168 strings tovu-7b | — | — | 665
A239 | Desktop main coverage 94% < 96%; observability forwarding untested | FIXED | c9dc2cb38, e288e1bfc | — | — | 666
A240 | 46 website failures untriaged; entries-routes raw boom | FIXED | (log) RT 11-01 | — | — | 667, 669
A241 | Raw exceptions logged unredacted (daemon, http-kit, core sinks) | FIXED | 7a2309dc7 + 2c40727b1 (J) | — | — | 668, 672
A242 | packed-fixture skips builtin-named deps; count-vs-identity test | FIXED | 324c837ad (J) + 8653ec06c | — | — | 670
A243 | Comments limiter not reconfigured; menu rel allowlist + _blank noopener | FIXED | ae9fe327c; ffd693690 (J) + 694a95d4e | — | — | 673, 704
A244 | auth/admin/assistant graphs load heavy roots | OPEN | perf debt per 673 | LOW | narrow imports to leaf modules | 673
A245 | redactSecrets misses x-api-key header style, quoted multi-word, JSON apiKey | FIXED | J packages/core/src/redaction-patterns.ts:133 | — | — | 674
A246 | worker-import-graph guard only sees CJS Module._load | FIXED | T .../http/site/__tests__/worker-import-graph.test.ts:49,174-205 (static source graph incl. dynamic import) | — | — | 675
A247 | HOME page legacy title pin ignored | FIXED | 4ea35f13d | — | — | 676
A248 | Visitor mode-help omits "click Allow" | FIXED | 708b06118 | — | — | 677
A249 | Jini identity reader hard-codes `tovu` namespace | FIXED | b6764eb77 (J): identityNamespace generic, legacy extensions.tovu read | — | — | 678, 763
A250 | ~20 generic agent plugins live only in Tovu | FIXED | T content/agent-plugins now only how-tovu-works, tovu-theme | — | — | 679
A251 | Vendor plugin-* packages re-created in Jini | FIXED | J packages/ has only plugin-catalog, plugin-fixture-provider | — | — | 680
A252 | Tovu commits 629 KB minified Recharts bundle, no source | FIXED | T content/plugins/ gone; charts-recharts-source.ts resolves Jini provider package | — | — | 681
A253 | Desktop coverage excludes main.ts/renderer/preloads; misleading % | UNVERIFIABLE | needs a coverage run | — | — | 682
A254 | Other-copies dialog "N other copys" | FIXED | 3d1a6281d | — | — | 683
A255 | tsconfig.main.json misses src/main/** | FIXED | bb0946f2a | — | — | 684
A256 | Coverage blind spots (route-only floors, admin not in CI, etc.) | UNVERIFIABLE | needs coverage/CI run; admin floors exist per 957 | — | — | 685
A257 | Agent-plugins reseed prunes operator copies | FIXED | 73b0f79c8 (J) | — | — | 686
A258 | site-import references through refused `repo` root (also tovu-theme B2) | FIXED | f9e056177 (J) + 7314f809f, f831c54e6 | — | — | 687, 694
A259 | Render deploy ignores options.env; Railway notes unescaped / control chars | FIXED | fc1ff4ad7, f5f1d0780, 77bdd6ee9 (J) | — | — | 688, 705, 722, 740
A260 | plugin-catalog merges face + provider sharing id | FIXED | 144b65862 (J) | — | — | 689
A261 | check-idle-motion ROOTS names moved main.ts | FIXED | bb8250e8a | — | — | 690
A262 | Desktop coverage double image (NODE_V8_COVERAGE child, tsx register) | FIXED | e288e1bfc, d8a35e0a6 | — | — | 691, 692, 700
A263 | Desktop coverage merge keeps better copy, not union | FIXED | dc9991acf | — | — | 693
A264 | Vendor-scan loadVendorRules reads only content/agent-plugins | FIXED | T features/deployments/deploy-targets/__tests__/vendor-scan.ts:96-108 reads SELECTED_AGENT_PLUGIN_PACKAGES | — | — | 695
A265 | bundled-upgrade digest supersession test | FIXED | 62faf0036 | — | — | 696
A266 | Root pinned @jini-ai/infra ^0.5.4 | FIXED | 91333e8a8 (landed twin of 6eb05b2e6) | — | — | 697
A267 | verify-package-cli redirects to linked-only Jini path | FIXED | 32dd50b44 | — | — | 698
A268 | check-gates bounded failure tail reverted; still wanted | NOT-CHECKED | f15aba574 reverted on release branch only | — | — | 699
A269 | Skill confirmation dialog hard-coded English | FIXED | 6e3fa94f2 | — | — | 701
A270 | Folder-drop success timer wipes newer error | FIXED | 5f1c6fbb0 | — | — | 702
A271 | Theme Explore copyFile skips confirmLeave (dirty buffer lost) | FIXED | 3f4bef989 | — | — | 703
A272 | Stage-payload flattens nested express/debug of non-root packages | FIXED | 785e39cdb (J) + 0ef92c015 | — | — | 706, 724
A273 | vitest-compat after hook skips cleanup | FIXED | 6d7659b0b | — | — | 707
A274 | Permanent-delete gate judges guidance by own id | FIXED | 1b4ed4f40 | — | — | 708
A275 | Root asks unpublished @jini-ai/agentic ^0.6.18 | OBSOLETE | resolved at publish | — | — | 709
A276 | Jini devops mergeCoverage keeps better copy | FIXED | J packages/devops/src/checks/coverage/lcov.ts:116-121 (union) | — | — | 710, 741
A277 | Recharts "·" glued to next word (Tovu bundle) | OBSOLETE | Tovu bundle removed; uses Jini provider (885c7adcf fix) | — | — | 712
A278 | Skills page hard-coded English | FIXED | T apps/admin/src/features/skills/Skills.tsx:1,22 (useSkillsTranslator) | — | — | 713
A279 | Menu schema text says only "rel (string)" | FIXED | 399343c1b (J) | — | — | 714
A280 | Six server callers ignore TOVU_BUNDLED_AGENT_PLUGINS_DIR | FIXED | aef024808 | — | — | 715
A281 | Desktop release dist-import guard flags tsx (daemon-supervisor, tovu-server) | FIXED | 8cee04e97, 2011e229c | — | — | 717, 730
A282 | Chart manifests lack provides capability | FIXED | f25b96633 (J) | — | — | 718, 726
A283 | plugin-host identity test scans only content/agent-plugins | FIXED | b0d9a85aa | — | — | 719
A284 | Fly host-signals Docker staging test | FIXED | (log, not re-verified) moved overlay copy | — | — | 720
A285 | No Jini test pins fly template safety settings | FIXED | J packages/agent-plugins/fly/__tests__/template-safety.test.mjs | — | — | 721
A286 | `tovu deploy config` outside root drops Chromium note | FIXED | be282de25 | — | — | 723
A287 | Staging conflict on caller-supplied root edge still refuses | NOT-CHECKED | full fix = pass each root's staged destination; Tovu sidesteps 0ef92c015 | — | — | 725
A288 | tool-catalog-query test fails on stale linked Jini dist | OBSOLETE | local stale build | — | — | 727
A289 | vitest-compat throwing afterEach skips later afterEach | NOT-CHECKED | low; guess open | — | — | 728
A290 | Shopify draft calls retired collections_entry_list | FIXED | (log) overlay uses content_read.collection_entry | — | — | 729
A291 | Staged-closure audit 41 false positives (db kernel requires, e2b CJS, shadcn tests, seal-aad, tsx) | FIXED | 93223b567, 6d2f352ed (J); 63fe0ab53, 865e4cd80, 2011e229c | — | — | 731, 732, 733, 734, 735, 736, 737
A292 | Build-time check scripts (seal-aad-invariant, secret-scan-guard) ship in payload | FIXED | 865e4cd80 (seal-aad out of dist + server-build dep guard); secret-scan-guard not re-verified | — | — | 738
A293 | pty-helpers Windows reject; new-post editor key collision; stale docs | FIXED | 28e0689db, 386631b14, 4787d55f5, 69cbea5ee | — | — | 742, 745
A294 | SECURITY same-build reseed trusts edited bundled copy; Sheets compound replay; chart provider; CI suites; as any | FIXED | 7385542c0, fefae364b, d3064f359, 3bb368176, 706790fef, 6ce15df5d (J) | — | — | 743, 746, 748
A295 | Post-publish: lockfile, fly-deploy.yml deleted path, recharts pins sha256-PENDING | FIXED | T charts-recharts-source.ts:20 (pins real); .github/workflows/fly-deploy.yml:3 uses @jini-ai/agent-plugins/fly | — | — | 744
A296 | agent-plugins node:test can't resolve @jini-ai/devops | OBSOLETE | devops is a root devDependency (J package.json:45, 16d19782d) | — | — | 747, 749
A297 | Integration clone dev server migrated owner's live DB; admin "Server restarting…" | OBSOLETE | process/environment incident | — | — | 750, 799
A298 | Theme-from-reference headlines overflow; dead hero gap | FIXED | 9063ea4f6d (ui-ux overlay fails on clipped text/overflow) | — | — | 751
A299 | Connect <plugin> sign-in card has no Skip/Cancel | FIXED | 9063ea4f6d + b6764eb77 (J) connect-card cancellation | — | — | 752
A300 | Stop/Send buttons covered by effort selector | FIXED | b6764eb77 (J) "effort selector no longer overlaps Send/Stop" | — | — | 753, 772
A301 | Agent Plugins page no signed-in status; mcp__jini__ connect red row | FIXED | 9063ea4f6d; b6764eb77 (mcp__jini__ names route) | — | — | 754
A302 | Plugin sign-in doesn't grant its own declared tools | FIXED | 09a36d561 (J) + 094813ae7 | — | — | 755, 871
A303 | external_mcp_save approval cards expire before owner answers | OPEN | 20871ad239 message: "Open: external_mcp_save card expiry (needs durable approval)" | MED | persist the pending approval so the card survives; re-issue on answer | 756
A304 | Second-tab New chat snaps back to running chat, attachment lost | UNVERIFIABLE | needs two-tab Chrome repro | — | — | 757
A305 | charts-recharts zero-value bar draws no rectangle (jsdom) | NOT-CHECKED | cloud test report | — | — | 758
A306 | Newsletter keyword ranking; supporting-files fixture overlay | FIXED | 9063ea4f6d | — | — | 759, 760
A307 | durable-json lock takeover times out; source-boundaries flag | NOT-CHECKED | cloud test report | — | — | 761
A308 | exclusive-file-lock U6 contradicts never-evict-live-owner | OPEN | owner decision pending (no record of decision) | LOW | owner picks rule; align test | 762
A309 | Theme edit/import tools replace with no card; .trash revisions no retention | OBSOLETE | owner rule: edits direct (T contracts/core/tool-metadata/theme.ts:8,225); retention not checked | — | — | 764
A310 | Consent off -> vendor analytics never forwarded (PostHog sends nothing) | OPEN | owner analytics decision still pending per 922 | LOW | owner decides; then forward anonymous events or document | 765, 910, 922
A311 | Gemini/OpenCode calls not folded; Codex special-cases server==='jini' | FIXED | no server==='jini' in J chat/agent-runtime; batch2 tests 7f36e818b (J) | — | — | 766
A312 | Tovu tests write consent receipts into real sites/tovu-dev | NOT-CHECKED | guess open | — | — | 767
A313 | npm test with TOVU_BUNDLED_AGENT_PLUGINS_DIR unset | NOT-CHECKED | — | — | — | 768
A314 | check-hardwiring 25 violations, tests tsc 37 errors, stale knownUnmeasured | NOT-CHECKED | later reports still cite hardwiring/tsc debt (897, 949) | — | — | 769, 897
A315 | Plugin row on at boot with empty lists needs restart; plugin turned on mid-session needs restart | NOT-CHECKED | 20871ad239 does not list it; guess open | — | — | 770
A316 | dev.mjs prints "API is up" after boot failure | NOT-CHECKED | — | — | — | 771
A317 | Auto chat title from mid-prompt | FIXED | 9063ea4f6d (title from subject) | — | — | 773
A318 | Wrong-arg first calls (theme_set_active, content_post_* kind, plugins_set_enabled id) | FIXED | 9063ea4f6d exact-keys errors + b6764eb77 declared aliases | — | — | 774, 778, 791
A319 | Folder chip squeezed to one letter at dock width | NOT-CHECKED | FolderChips reworked (A227); guess fixed | — | — | 775
A320 | Cookie banner still opens on fresh browser though owner chose OFF | UNVERIFIABLE | a428f27afc was WIP; needs fresh-browser check | — | — | 776
A321 | Assistant reads attachments / saved results / waits with Bash, sandbox red rows | FIXED | b6764eb77 (J) + 9063ea4f6d (tools-first) | — | — | 777, 780, 788
A322 | web_fetch_page refuses site's own localhost | FIXED | 9063ea4f6d + b6764eb77 (own origin only) | — | — | 779
A323 | {{media:slug}} unresolved in pages_write_html | FIXED | 9063ea4f6d | — | — | 781
A324 | Desktop ~3.2 GB with 2 sites (per-site daemon etc.) | UNVERIFIABLE | shared daemon + idle park landed (20871ad239); needs packaged measurement | — | — | 782
A325 | redact.ts quoted empty password= leak; nested cause leak | FIXED | b6764eb77 (J) | — | — | 783, 784
A326 | Federation connectFailureReason raw | FIXED | b6764eb77 (J) | — | — | 785
A327 | Desktop theme-preview IPC trusts window, webview passes | FIXED | 9063ea4f6d | — | — | 786
A328 | charts-recharts-source installRoot may be wrong packaged | UNVERIFIABLE | T composition/charts-recharts-source.ts:125-127 unchanged; packaged boot check owed | — | — | 787
A329 | Cover photo set as featured AND inserted in body | FIXED | 9063ea4f6d | — | — | 789
A330 | Cross-site Vercel key lookup misses disabled-host keys | FIXED | b901bc8a0 + bfdbf1be7 | — | — | 790, 792
A331 | Local site https readiness probe rejects mkcert leaf as ca -> killed at 2.5 min | FIXED | J packages/platform/src/net/local-http-probe.ts:24 (allowPartialTrustChain) | — | — | 793
A332 | Plain file path with dashes redacted as key; follow-up credential card | OPEN | no change to J chat/core/user-text-redaction.ts after cf5571045 (11-01); not re-run | MED | treat path-shaped tokens with extension as non-secret; add the 11-02 path as a table case | 794
A333 | media_replace_file keeps old provenance path | FIXED | J packages/cms/src/media/replace-media-file.ts:28 (provenance required on replace) | — | — | 795
A334 | /m/<slug>/original.mp4 404 locally | FIXED | T routes/site/media-rendition.ts:670 ("/m/:assetId/original.:ext") | — | — | 796
A335 | SECURITY /internal/tool-executions trusts wire principal | FIXED | 20871ad239 (run must be live, principal matches); env-token exposure part not verified | — | — | 797
A336 | shared-sites "repair its lease" manual instruction | FIXED | message gone from T apps/desktop/src/shared-sites.ts; shared-sites-stale-lease.test.ts | — | — | 798
A337 | No browser way to start another site with switcher off | NOT-CHECKED | maybe by design | — | — | 800
A338 | xander-estin theme screenshot generic; preview bar on public site; pinned cards cut; 320px overflow; film-strip counter | UNVERIFIABLE | client site themes not in repo | — | — | 801, 804, 806, 807, 811
A339 | Consent-gated publish refusal hides the two choices | UNVERIFIABLE | T contracts/core/consent-refusal.ts:6 carries blockingProblems; UI check owed | — | — | 802
A340 | Static publish project name blank though history has it | NOT-CHECKED | — | — | — | 803
A341 | Claude in Chrome resize_window doesn't resize | OBSOLETE | external tooling | — | — | 805
A342 | Boot refusal when site already runs on another port | FIXED | T apps/website/src/platform/site-dir/site-running.ts:24-29 (attaches instead of refusing) | — | — | 808
A343 | ui-ux-design plugin gates pinned effects above md; no 100svh/scrollWidth rules | NOT-CHECKED | 9063ea4f6d added overflow checks; mobile pin rule guess open | — | — | 809
A344 | kUInetic distance:var()/offset var() fallback rejected | UNVERIFIABLE | kUInetic library | — | — | 810, 869
A345 | Tooltip never shows on touch tap | FIXED | J packages/ui/src/react/components/TooltipLayer.tsx:218-222 | — | — | 812
A346 | Share create fails generic, nothing logged (site-shares fail()) | NOT-CHECKED | share failures now via sendSiteShareFailure (site-share-password.ts:53 per prior triage); logging not verified | — | — | 814, 815, 816
A347 | Fresh-content bootstrap behind 0036/0037 | FIXED | (log) reconcile landed with integration | — | — | 818
A348 | Export refuses/warns on first-party plugin docs (SECRET_IN_CONTENT); 60-file warning noise; plugin tests shipped | OPEN | prior triage C9-1: warned-file refusal vs acknowledgement still an owner decision | MED | owner decision: skip signed first-party plugin files from scan and stop shipping plugin __tests__ | 819, 820, 838
A349 | Static export front page is a bare "Open website" link | FIXED | T features/site-backup/static-download-landing.ts (landing with cards) | — | — | 823
A350 | Daemon toolRegistry contract wider than use; plugin isolation name collision; RAF teardown; stale pins; LICENSE | FIXED | 65aff68ca, c87d6dead, 3ab4a4070, 27aef5955, 21114234f (J) | — | — | 827, 828, 829, 830, 831
A351 | desktopMcpHttp stale VM fixture | OBSOLETE | test-only | — | — | 832
A352 | 28 more changed test files fail (Recharts INTEGRITY_FAILED etc.) | NOT-CHECKED | later reports: stale recharts pin fixed (936) | — | — | 833, 897
A353 | serve-command boot timeouts at load 29 | UNVERIFIABLE | load; rerun quiet | — | — | 834
A354 | Static export landing takes <title> from HTML comment | FIXED | T static-download-landing.ts:13 (comments stripped first) | — | — | 837
A355 | Export "Show files" crammed; Type column; Revoke/activate layout shift; same thumbnails; <44px targets | NOT-CHECKED | UI items, Chrome check owed | — | — | 839, 840, 841, 842, 844
A356 | Site start ~2.5 min at load 27; import/Quick Look not checked | UNVERIFIABLE | load / manual checks | — | — | 843, 845
A357 | POST /api/frontend-sessions/activate 503 ~9x per session, silent | UNVERIFIABLE | cause unknown; needs live chat network capture | — | — | 848
A358 | theme_list_files {} arrives as {"input":"{}"}; schema "the the" | NOT-CHECKED | arg-recovery b6764eb77 may cover | — | — | 849
A359 | Antigravity cards out of order, no progress 59s, repeated full-access notice | NOT-CHECKED | — | — | — | 850
A360 | OpenCode block message squeezed, wrong settings path | NOT-CHECKED | J 6f507852d mentions "OpenCode message"; guess fixed | — | — | 851
A361 | "Loading Tovu…" 8-20s per route; /admin/assistant shows Dashboard | NOT-CHECKED | load; route alias not found | — | — | 852, 969
A362 | site-plugin-directories.test.mjs explicit overrides fails at HEAD | NOT-CHECKED | — | — | — | 854
A363 | Packaged server reaches require('electron'); devDep tsx/cli in shipped graph | FIXED | 9c3425a37 (J) + c9e781260; 2cfddd85d | — | — | 855, 856
A364 | 2:56 demo reel never published to tovu.dev | UNVERIFIABLE | live site content | — | — | 857
A365 | Replaced media keeps old ?v= cache-buster | FIXED | inferred: T features/media/public-path.ts:62 (v = sha prefix) + replace updates sha256 | — | — | 858
A366 | Replaced media can't reach live (sha256 write-once); "Published 0 changes" | FIXED | T features/media/import-media-entity.ts:8-9,55-57 (replace-on-import path) | — | — | 859, 861
A367 | Gemini rejects site_guide schema, every visitor chat fails | FIXED | e86271780 | — | — | 860
A368 | Desktop second site's assistant can't start (workspace-local scope) | FIXED | (log, not re-verified) fixed in 0.1.28 | — | — | 862
A369 | 3 agent-daemon-server tests fail at HEAD | NOT-CHECKED | — | — | — | 863
A370 | Running site card "Memory unavailable" | UNVERIFIABLE | desktop | — | — | 864
A371 | Run ends with generic "could not start this execution attempt" | FIXED | T inbound/assistant/agent-daemon-run-start.ts:178 passes startup stage + error | — | — | 865
A372 | Built-in theme preview bar in page flow, left-aligned | FIXED | 2c0439a31 | — | — | 866
A373 | Higgsfield OFF: assistant offers API-key card for OAuth plugin | NOT-CHECKED | — | — | — | 867
A374 | kUInetic scroll-progress-ring timeline:scroll acts as clock | UNVERIFIABLE | kUInetic library | — | — | 868
A375 | Interrupted chat recovery after quit: generic failure | UNVERIFIABLE | needs desktop quit-mid-run repro | — | — | 870
A376 | theme_write_file overwrite opens approve card every call | FIXED | T contracts/core/tool-metadata/theme.ts:213-225 (confirmation 'direct') | — | — | 873
A377 | Message sent during a run shows twice; "Sending…" sticks | UNVERIFIABLE | needs live chat | — | — | 874
A378 | Restarted site refused: scope belongs to another server boot | FIXED | T apps/desktop/src/desktop-agent-service.ts:205 (register allows newer boot); :70 plain text | — | — | 875
A379 | Finalizer checkpoint retry CPU spin | FIXED | (log) Codex fix-4 | — | — | 876
A380 | Static publish (Vercel) tool timeout; no landed? status | NOT-CHECKED | guess open (MED) | — | — | 877
A381 | SiteStartPanel shows details only for 'error' | FIXED | T apps/desktop/src/renderer/app/SiteStartPanel.tsx:107 ('failed') | — | — | 878
A382 | Vite prebundled deps cache keeps old @jini-ai/chat after install | OPEN | no .vite/deps invalidation in T development/scripts | LOW | dev.mjs: force optimizeDeps when @jini-ai versions change | 879
A383 | Forms audit: 12 High findings (notify failures swallowed, export not disabling forms, import classification, Cloudflare receiver) | NOT-CHECKED | sample fixed: J cms/src/forms/notify-subscriber.ts:157-158 durable rethrow; other 11 not verified | — | — | 880
A384 | Item 25 phase 1 would remove site keys at boot | OBSOLETE | uncommitted plan, redesigned | — | — | 881
A385 | Antigravity fullCliAccessOnly silently turns on all capabilities | FIXED | J agent-runtime/src/native-tool-policy.ts:46-50 (policy returned unchanged), :74-84 refusal | — | — | 882
A386 | Agent config repaired before consent; no backup | FIXED | code moved to J (cb609baa0b); T .../ensure-json-agent-install.unit.test.ts:22-71 pins consent, backup, foreign entry | — | — | 883
A387 | SECURITY typed-answer path skips exchange id for secret cards | FIXED | T apps/website/src/assistant/mcp-ui-tool-calls.ts:70-82 (typed answers only for ask_choice) | — | — | 884, 888
A388 | SECURITY MCP OAuth sign-in has no browser binding | FIXED | 2480627b2d browser-binding regression test in T (sec job 11-05) | — | — | 885
A389 | Secret field named freeText shows as answer | FIXED | J packages/ui/src/features/mcp-ui/secret-card.ts:74 (reserved) | — | — | 886
A390 | Federated results don't scrub connection's own token | FIXED | J packages/mcp/src/federation/adapter.http.ts:368 | — | — | 887
A391 | SECURITY WebMCP agent can approve its own protected page actions | FIXED | 13984638e0 (protected page actions via human chat cards); respond_page_approval gone | — | — | 889
A392 | SECURITY region handle adopts first untagged control (Reveal) | FIXED | J packages/agentic/src/core/dom/dom-page-driver.ts:357-378 (label-associated fields only) | — | — | 890
A393 | OAuth refresher loads token before lease | FIXED | J packages/oauth/src/refresh.ts:135-146 (reload under lease) | — | — | 891
A394 | Release bumping catalog without provider-plugins mismatches digests | NOT-CHECKED | guess open (release guard) | — | — | 892
A395 | Cloudflare/Vercel manifest versions unchanged while payloads changed | NOT-CHECKED | — | — | — | 893, 943
A396 | Public GET posts/:slug drops bodyHtml | FIXED | T inbound/public-http/http/shared/post.ts:47 | — | — | 894
A397 | Direct {"type":"form"} markers may not be tracked by safe-delete | NOT-CHECKED | — | — | — | 894
A398 | Whole-posts read per uncached rendition; every image no-cache rehash | FIXED | T routes/site/media-rendition.ts:278,585 (media access evidence cache) | — | — | 894, 916
A399 | AssistantMessageRow complexity 15 | NOT-CHECKED | complexity gate 10 since 11-13; guess fixed | — | — | 895
A400 | Consent new banner path doesn't make authored optional scripts inert | NOT-CHECKED | — | — | — | 896
A401 | Restricted Codex chats refuse bridge tools (approval policy never) | NOT-CHECKED | — | — | — | 898
A402 | Client timestamps overwrite server durationMs | FIXED | J packages/chat/src/core/turn-usage.ts:180 | — | — | 899
A403 | Packaged chat refused "site catalog refused (403)" | OBSOLETE | not an app bug (release check), b9827ffb1 | — | — | 900
A404 | commerce_resolve_unknown has no approval card | FIXED | T contracts/core/tool-metadata/commerce.ts:12 (publish/plan) | — | — | 901
A405 | Clean-checkout builds fail (contracts prepare; commerce before ui) | NOT-CHECKED | — | — | — | 902
A406 | In-memory rendition 500s; secret-sentinel guard fails | NOT-CHECKED | — | — | — | 903, 940
A407 | provider-plugins catalog omits formspree; complexity | NOT-CHECKED | — | — | — | 904
A408 | agent_plugin_connect reruns grants w/o approval; HumanConfirmer kind 'user' from delegating ID | NOT-CHECKED | — | — | — | 905, 914
A409 | Forms delivery copies answers per destination; tokenless submissions collapse; duplicate DOM IDs | NOT-CHECKED | — | — | — | 906
A410 | commerce_get_status no approval class stops app boot | FIXED | (log) full-tests 936 | — | — | 907
A411 | tovu-theme skill says data-consent-category; trackers run before consent | FIXED | no data-consent-category in T content/agent-plugins; J cookie-consent client/dom.ts:51 gates text/plain | — | — | 908
A412 | One failed/slow policy read removes banner (boot, refresh, extra app builds) | FIXED | T inbound/public-http/middleware/site-cookie-consent.ts:248,259,378-413 (last good policy kept) | — | — | 909, 924, 927
A413 | Consent medium/low items (theme-override renders, ungated scripts, cookie link, reload loop, plugin embeds, publish reports failure) | NOT-CHECKED | combine-review items; not traced | — | — | 910, 911, 928
A414 | Declined access card undone at restart (boot grant) | FIXED | T features/agent-plugins/apply-connect-defaults.ts:16,76 (decline recorded) | — | — | 912, 925, 926
A415 | agent_plugin_connect operator row; external_mcp_save form path; re-enable refused | NOT-CHECKED | — | — | — | 913
A416 | Consent-capture / form-file-cleanup / recharts integrity test reds | NOT-CHECKED | — | — | — | 915
A417 | /products commerce scans; json-line large frame; custom model effort; forms_list full HTML; 50 MiB doc read | NOT-CHECKED | — | — | — | 917
A418 | Forms/commerce 10 Low (double submit, commerce routes shadow pages) | NOT-CHECKED | — | — | — | 918
A419 | Google Forms iframe 300x150 | FIXED | J packages/cms/src/forms/html-render.ts:229-232 | — | — | 919
A420 | Google Forms medium items (catalog test, invalid link saves, regex, restart, headers) | NOT-CHECKED | 922 says invalid provider link still saves as success | — | — | 920, 922
A421 | jared-floyd static export: llms.txt "# Tovu", stray date, "ADD YOUR CONTACT EMAIL" | NOT-CHECKED | client-facing; check llms.ts header source + privacy template | — | — | 921
A422 | Review-fixes leftovers (host provider pin, raster fixtures, admission budget, launch fixtures) | NOT-CHECKED | — | — | — | 923
A423 | Static themes get no cookie banner/loader; member pages lack loader | NOT-CHECKED | consent work later (361718ac0b etc.); guess fixed | — | — | 924, 951, 952
A424 | Secret scanner quadratic on long dashed text | FIXED | (log) full-tests 936 | — | — | 929, 936
A425 | Every CLI stops at prelaunch "Settings Set Value" consent card even with no tools | NOT-CHECKED | 3d19ca0322 discloses prelaunch access; card still expected by design? | — | — | 930
A426 | Dev boot generic composio error; 390px buttons cover row actions; stale "Include saved keys" copy | NOT-CHECKED | composio part = A007 | — | — | 931
A427 | UI batch a2/b/b2/b3/c items (expired card text, Pi raw JSON, cred counts differ, composio/shopify not recognised, posts.body_html flagged, import no cancel, <44px, jump button overlap, duplicate tab label, queued message vanishes, model auto-switch, consent card IDs, $& title) | NOT-CHECKED | many; some later fixed (fixes-small, 953) | — | — | 932, 933, 934, 937, 939
A428 | full-tests cap hit, not green | OBSOLETE | run status, superseded by later runs | — | — | 935
A429 | /commerce/return/ trailing slash; buyer after commerce off; settlement/site-exporter reds | NOT-CHECKED | — | — | — | 938, 939
A430 | Startup secrets (TOVU_ADMIN_PASSWORD, desktop MCP token) stay in server env | NOT-CHECKED | security-adjacent; STARTUP_SECRET_KEYS names three keys | — | — | 914, 941
A431 | Open Marketing public history holds security notes/client screenshots | UNVERIFIABLE | other repo; owner decision | — | — | 942
A432 | tovu-starter render/pages differ from __original-themes__ copy | NOT-CHECKED | — | — | — | 944, 947
A433 | SiteExportTab test fails; fake-test-site no config.json; stale ADR text | NOT-CHECKED | — | — | — | 945
A434 | Codex ui-review: renderer loader Node 24; tab lifecycle; payment-return fallback; tab-close race | NOT-CHECKED | — | — | — | 946, 967
A435 | open-fixes/one-card-rest/ci-errors/fix-round/older-fixes leftovers (cached media URLs, confirmation hashes, mail 500, __proto__, 320px width, Cloudflare forms resolve, batching strips previews) | NOT-CHECKED | — | — | — | 947, 948, 949, 950
A436 | Deployment Overview says admin password not set after secrets leave env | FIXED | T deployment-overview.ts:71,147 (reads stored hash) | — | — | 951
A437 | Final-review-2 items (loader 503 export ok:true, coverage floors, Stop/Keep running loses memory cap, stale plugin card, mailer lane) | NOT-CHECKED | — | — | — | 952
A438 | Old bundled plugin copies make every export refuse ("multiple installed digests") | FIXED | T features/site-backup/archive-extensions.ts:33 (superseded bundled revisions filtered first) | — | — | 953
A439 | Approval cards show person UUID/site id/Revision 0; cancel shows red error; second queued label unboxed; export columns jump | NOT-CHECKED | UI, Chrome check owed | — | — | 953, 934, 969
A440 | last-fixes leftovers (baseline drift, CLI export exit 0, v1 mail hyphen IDs) | FIXED | (log) 962 lists CLI export + v1 mail IDs fixed (64774ab69); baseline drift not verified | — | — | 954, 963
A441 | Desktop Import button opens random site's Import page | FIXED | c4c6c4d48, 015941acb, bf68d6758 (Import page) | — | — | 955
A442 | tests-jini / tests-tovu-apps / tests-tovu-site OPEN lists (coverage 97.78%, Gitleaks 347, worker graph, etc.) | NOT-CHECKED | run reports; individual items not traced | — | — | 956, 957, 962
A443 | Desktop Import: no share link/zip path; App.render hang; shared labels | NOT-CHECKED | — | — | — | 958
A444 | Open Marketing seed loop / restore digest order | UNVERIFIABLE | Open Marketing repo, out of scope | — | — | 959, 960
A445 | Imported site owner password random, never shown; sign-in path unproven | NOT-CHECKED | 964 FIXED Reset owner password 17f636a9f | — | — | 961, 964
A446 | Recovery code new-password autocomplete may save code as password | UNVERIFIABLE | needs real Chrome save-password check | — | — | 963
A447 | Reset owner password 403; import page hangs on bad child; quit mid-import orphan; imported site opens stopped | FIXED | 17f636a9f, 8cde227f1, bf68d6758 | — | — | 964, 965
A448 | Tampered zip message only "size or SHA-256 mismatch"; Import page centred; export-run.ts:149 tsc error | NOT-CHECKED | — | — | — | 964
A449 | SECURITY imported theme scripts run on admin origin with no review (F1) | FIXED | 77c28cfa2 + 73fa8a730 (non-identical themes stay off, script pages land as drafts) | — | — | 968, 970
A450 | Separate origin for themes (real F1 class fix) not built | OPEN | 970: "Real fix = separate origin for themes (not built)" | security | serve theme/page HTML from a separate origin from admin | 970
A451 | Import F2-F11 (auto-start migrates folders, Windows cleanup, SIGKILL, Cancel, tokens in history) | FIXED | 75231e82c + 73fa8a730 (F3-F11); Windows/packaged unproven | — | — | 968, 971, 972
A452 | .import-quarantine has no turn-on path; edited starter lands on no theme | OPEN | 970 open list; not re-checked | LOW | add an Activate/restore path for quarantined themes | 970
A453 | Starter theme and admin load Google Fonts (third-party request vs consent) | OPEN | T content/themes/static/tovu-starter/css/theme.css and apps/admin/src/admin-themes/classic/admin.css reference fonts.googleapis | LOW | self-host the fonts | 971, 972
A454 | ui-look-2 items (save banner says post, raw "boom", cancelled cards "Answered", plugin card noise, raw row names, dark swatch, 390px clipping) | NOT-CHECKED | UI, Chrome check owed | — | — | 969

## Possible duplicates of later sections
- composio "interrupted update / exclusive file lock" boot error (A007) — likely recurs in later dated sections.
- Error card "Error ID / App version Unavailable" (A001) — recurs in later UI batches.
- external_mcp_save card expiry (A303).
- Path-with-dashes redaction false positive / "[token removed]" (A332).
- Separate origin for themes / imported theme scripts F1 (A449, A450).
- Google Fonts third-party request (A453).
- Cookie banner off by default / static themes no banner / consent loader (A320, A423).
- Vite prebundled deps cache stale after Jini install (A382).
- tovu-starter `tovu-starter:mode` storage key (A046).
- Static export misses script/data-* referenced files (A011).
- Recharts integrity pin / charts-recharts (A252, A295, A328).
- Two-tab chat / queued message duplicates (A304, A377).
- jared-floyd static export llms.txt "# Tovu" (A421).
- Desktop memory ~3.2 GB / Memory unavailable (A324, A370).
- Antigravity full-CLI-only (A110, A385).

## Part B rows (lines 974-1467)

| id | short title | status | evidence (commit or file:line) | severity | fix direction | source line(s) |
|---|---|---|---|---|---|---|
| B001 | Jini plugin-release-consistency test: no export preparePluginRelease | NOT-CHECKED | guess OBSOLETE (11-06 branch-state test red) | — | — | 975 |
| B002 | Higgsfield SKILL.md 3 reds on cloud/portable-r1 ("dropped Do not invent" claim) | OBSOLETE | 1002 correction: text present, 2 stale tests; owner 11-09 guides stay host-neutral (1097) | — | — | 976, 999, 1002 |
| B003 | vitest 2.x refuses --maxWorkers alone | OBSOLETE | Jini moved to vitest 3 (1100c0137 deps-1121); OM repo out of scope | — | — | 977, 982 |
| B004 | Open Marketing baseline red + 38 lint errors | UNVERIFIABLE | other repo (OM), not in either base; recheck in OM | — | — | 978 |
| B005 | Messages from shared posts route (delete) may say "post" on a page | NOT-CHECKED | guess OPEN LOW | — | — | 981 |
| B006 | 390 px admin dock jump button half-covers tool-row chevron | OBSOLETE | owner call, floats by design (985); 1447 says admin dock unchanged | — | — | 985 |
| B007 | admin-failure-notice.css not committed | FIXED | Tovu 56471d2dd (ancestor of base) | — | — | 986 |
| B008 | API answers 503 "Server is starting" ~1 min after Jini rebuild / first admin load | NOT-CHECKED | dev-env behaviour; guess OPEN LOW | — | — | 987, 1157 |
| B009 | Composer attached image thumbnail scrunched | UNVERIFIABLE | ui-fix-3 worked on it; needs owner-browser look at 390 px+ | — | — | 990 |
| B010 | Upload-in-flight text beside folder button; owner wants spinner + toast | UNVERIFIABLE | needs browser look in admin chat | — | — | 991 |
| B011 | Stale attachment error stays after remove | FIXED | Jini 32e9c9c21 (ancestor of Jini base) | — | — | 994, 1005 |
| B012 | Uploader ignores patched window.fetch (test seam) | NOT-CHECKED | test infra; guess OPEN LOW | — | — | 995 |
| B013 | Footer Send-off reasons used developer wording | FIXED | Jini 3b6f5ed81 (ancestor) | — | — | 996 |
| B014 | 4+ chips: tray capped 88 px, new Uploading chip out of view | NOT-CHECKED | guess OPEN LOW | — | — | 1006 |
| B015 | Rejected file never gets a chip ("Remove it" copy off) | NOT-CHECKED | guess OPEN LOW | — | — | 1007 |
| B016 | Resend adapter calls send({method,url}) not Jini's send({request}) → no mail on Jini client | OPEN | J:agent-plugins/resend/adapters/resend.mjs:100 flat shape; lib/domains.mjs:68 already sends {request,...request} | MED | same dual shape as domains.mjs; failing test on Jini HTTP client first | 1010 |
| B017 | Plugin JSON frozen label "Tovu Mail — Resend API" | FIXED | no "Tovu Mail" string in J:agent-plugins/resend | — | — | 1011 |
| B018 | keyring.env.ts "remove on/after 2026-11-01" aliases overdue | OPEN | W/features/webhooks/keyring.env.ts:2-6 still site-key-legacy aliases | LOW | import released SiteKey exports, drop aliases | 1013 |
| B019 | Jini cms comments ship no turnkey table DDL (corrected dataModule claim) | NOT-CHECKED | guess OPEN LOW (design gap) | — | — | 1014, 1016 |
| B020 | Jini boot-lifecycle stops only completed starts after critical failure | NOT-CHECKED | latent, unused copy; guess OPEN LOW | — | — | 1017 |
| B021 | Jini guard R2-deep-path + R10 ChatPane Icon not in public barrel | NOT-CHECKED | owner [752] smallest fix; guess fixed by later guard work | — | — | 1019, 1078, 1093 |
| B022 | no-vendor-in-core test: 60 unreviewed counts | NOT-CHECKED | guess superseded by later vendor work | — | — | 1020 |
| B023 | Revert: force w/o principalKind bypasses version guard; partial inverse writes | NOT-CHECKED | pinned by L079; guess OPEN LOW | — | — | 1022 |
| B024 | snapshot.ts comment says non-terminal, code ROLLED_BACK | NOT-CHECKED | guess OPEN LOW (doc) | — | — | 1023 |
| B025 | Import keep-off skipped HTML menus/forms, trashed menus, disabled normal forms | FIXED | W/features/site-backup/import-keep-off.ts:156 all menus (no status filter), :179 forms, :57 formBodyMayRunScript | — | — | 1025, 1036 |
| B026 | Live-site import opens tab but never starts the site | FIXED | D/renderer/App.tsx:166 openSite calls startImported | — | — | 1026 |
| B027 | Share archives 100–300 MiB fail (transport clamps explicit limit) | FIXED | J:platform/src/http/guarded/transport.fetch.ts:73 cap = req.maxResponseBytes ?? default | — | — | 1027 |
| B028 | Share download timeout puts full token URL in error | FIXED | J:platform/src/fetch-with-timeout.ts:66 message names origin only | — | — | 1028 |
| B029 | Import history keeps share token in path | FIXED | W/features/site-backup/import-registry.ts:37-42 withoutQuery keeps url.origin only | — | — | 1029 |
| B030 | tovu-import-db-* temp folders stranded after forced kill | FIXED | W/features/site-backup/import-database.ts:133 startup sweep matches tovu-import-db- | — | — | 1030 |
| B031 | @jini-ai/admin holds domain screens (cross-domain imports) | NOT-CHECKED | refactor to-do; J4 domain-module work (0b20fed52) partly addresses | — | — | 1032 |
| B032 | Import expiry TypeError on JSON null metadata / record | NOT-CHECKED | guess OPEN LOW | — | — | 1034 |
| B033 | import-fix review: 2 GiB peak, corrupt row fails import, unremovable folder stops sweep, server-only no sweep, deploy timeout prints URL | NOT-CHECKED | reported fixed on cloud/import-fix (1036); not re-checked | — | — | 1036 |
| B034 | Request-ID replay hashed link without query → wrong import | FIXED | W/features/site-backup/import-registry.ts:44-47 sha256(url.href) | — | — | 1036, 1043 |
| B035 | Data module dbPath to wrong file → snapshot/headroom on wrong file | NOT-CHECKED | guess OPEN LOW | — | — | 1038 |
| B036 | Jini sign-in-card AbortSignal.any under jsdom; Tovu tsconfig.tests 12 errors | OBSOLETE | 11-07 test-env snapshot, superseded by later integ gates | — | — | 1039 |
| B037 | Cost notes: skill overview opens every file; token lookup 4 opens | NOT-CHECKED | not bugs (cost) | — | — | 1040 |
| B038 | Desktop tidy treats any import-history .json as leftover | NOT-CHECKED | fix was pending on cloud/import-fix; guess FIXED | — | — | 1042 |
| B039 | 295 s share download eats 5-min import budget | NOT-CHECKED | guess FIXED on import-fix | — | — | 1044 |
| B040 | parse5 vs browser `<select>` parsing → keep-off bypass | UNVERIFIABLE | needs browser repro (entry says so); keep-off still parse5-based, import-keep-off.ts:57-74 | — | — | 1045 |
| B041 | cms forms/sql imports parse5 but only optional peer | FIXED | J:cms/package.json:750 parse5 in dependencies | — | — | 1047 |
| B042 | forms repo.rows.ts:77 null source_ip read back as "" | NOT-CHECKED | guess OPEN LOW | — | — | 1048 |
| B043 | Higgsfield sign-in card stuck: absolute link silently dropped | FIXED | 05ab227c relative hosted sign-in links (ancestor); desktop in-app sign-in window still owes a packaged check | — | — | 1050, 1051 |
| B044 | Subagents don't get plugin guidance like the main agent | NOT-CHECKED | parity work 11-08/09; guess partly fixed | — | — | 1053, 1054 |
| B045 | Batch tool items return raw internal failure text | FIXED | J:daemon/src/tool-executor-handler.ts:82-95 nested failure uses host redaction or withholds | — | — | 1056, 1059 |
| B046 | guarded-reader appends native error text (absolute path) to model-visible refusal | NOT-CHECKED | guess OPEN LOW | — | — | 1057 |
| B047 | chat-preview.ts stale doc (batches stay plain JSON) | NOT-CHECKED | file now J:cms/src/media/chat-preview.ts; doc LOW | — | — | 1058 |
| B048 | key-sharing: hot-path scan, revoke copies key, token label shown, raw driver error | FIXED | 8beb8b937 (ancestor) with tests named in entry | — | — | 1063, 1064, 1065, 1066 |
| B049 | Stale duplicate signin-lab registry entry | UNVERIFIABLE | owner machine registry data | — | — | 1067 |
| B050 | /admin/access-tokens rewrote to /admin/security Dashboard (once) | UNVERIFIABLE | needs live repro after restart | — | — | 1068 |
| B051 | Personal MCP consent card before first tool (Codex/agy blocked, static export, navigate) | OBSOLETE | owner call 11-10: Personal MCP default ON (MCP-DEFAULT) | — | — | 1069, 1086, 1100, 1142 |
| B052 | Argv budget: DeepSeek/Aider no guidance; compact fallback records delivery; POSIX E2BIG after overlay | NOT-CHECKED | stopped for design decision (1081); guess OPEN MED | — | — | 1071, 1080, 1081 |
| B053 | Jini notes-app Server contract issues | OBSOLETE | unmerged branch; contract redone ({app: Server}) | — | — | 1072 |
| B054 | MCP OAuth sign-in browser binding | FIXED | e327c07c (ancestor) per SIGNIN-GAP | — | — | 1074 |
| B055 | cms check:packaging fails: video-frames.ffmpeg.ts reads process.env | NOT-CHECKED | guess OPEN LOW | — | — | 1076 |
| B056 | Read-only "Open site" opens duplicate windows on repeat clicks | NOT-CHECKED | guess OPEN LOW | — | — | 1076 |
| B057 | link-jini.mjs defaults to /root/Programming/Jini | NOT-CHECKED | LOW dev script | — | — | 1076 |
| B058 | CI snapshots: release-check fails, extraction +58/+16, S7/S9 baselines, hardwiring row, allowlist scan | OBSOLETE | point-in-time states superseded by integ merge-11/12 gates | — | — | 1078, 1084, 1091, 1106, 1109, 1128 |
| B059 | agent-daemon-site-tools preflight test ZodError pluginIds; withdraw test flaky | NOT-CHECKED | test drift; guess OPEN LOW | — | — | 1080, 1415 |
| B060 | Sharp transforms upscale narrow sources (no withoutEnlargement) | OPEN | J:cms/src/media/image-transformer.sharp.ts:205-207 resize w/o withoutEnlargement | LOW | add withoutEnlargement: true + test | 1082 |
| B061 | pages_read_html empty for doc-format pages | FIXED | reported fixed 11-09 (plugin-embeds finish); not re-verified | — | — | 1085 |
| B062 | Railway/Render/Composio/Higgsfield guide tests vs neutral wording | OBSOLETE | owner 11-09: guides stay host-neutral, tests updated | — | — | 1088, 1090, 1097 |
| B063 | Serve original photos at /m/<id>/original (owner yes, not built) | NOT-CHECKED | feature not built per entry | — | — | 1093 |
| B064 | kUInetic Images grid (Compare height, short effects) | FIXED | per entry (theme-side fix) | — | — | 1095 |
| B065 | safeRevision drops summary for OFF plugins; /host/tools pulls platform+semver | NOT-CHECKED | was fixed before S7 merge per entry | — | — | 1099 |
| B066 | Redaction false positive: long image filename → [token removed] + rotate warning | NOT-CHECKED | guess OPEN MED | — | — | 1102 |
| B067 | Chat Image component: "no renderer" / catalog rejects src, alt | NOT-CHECKED | guess OPEN MED | — | — | 1104, 1118 |
| B068 | Attached .avif reference can't be opened by assistant | NOT-CHECKED | guess OPEN LOW | — | — | 1104 |
| B069 | Google Workspace card text "or the application creates" | OBSOLETE | owner decision (neutral wording) | — | — | 1107 |
| B070 | user-management imports @jini-ai/oauth; plugin entries need undeclared semver/json-schema | NOT-CHECKED | was in EXTRACT-S10-F | — | — | 1111 |
| B071 | Jini release + lock refresh before merge; dependency floors | OBSOLETE | process note | — | — | 1112 |
| B072 | Gemini tool turns end empty (site_guide topic schema) | FIXED | 9e7b27bc6 (ancestor) + Jini a1a12c24b (ancestor) | — | — | 1113, 1119 |
| B073 | Streamed replies split mid-sentence, breaks markdown/meaning | NOT-CHECKED | repeated 11-09/11-10; guess OPEN MED | — | — | 1114, 1140, 1156 |
| B074 | "Used N tools" reply rendered above its own user message | UNVERIFIABLE | needs live chat | — | — | 1115 |
| B075 | frontend-sessions/stream 503 on every hosted admin load | UNVERIFIABLE | hosted (Fly) only | — | — | 1116 |
| B076 | fs-files/folder-picker 404 on hosted | UNVERIFIABLE | hosted only | — | — | 1117 |
| B077 | Two "Chat with this site" buttons in a11y tree on reload | UNVERIFIABLE | browser | — | — | 1120 |
| B078 | Media page freezes with ~1,139 items during upload | UNVERIFIABLE | needs large library in browser | — | — | 1121 |
| B079 | Theme tools can't delete a script file | NOT-CHECKED | guess OPEN LOW | — | — | 1122 |
| B080 | tovu-theme guidance deferred (over automatic byte limit) | NOT-CHECKED | guess OPEN MED | — | — | 1123 |
| B081 | read_tool_result 8000 cap not stated where model picks limit | NOT-CHECKED | guess OPEN LOW | — | — | 1124, 1170 |
| B082 | Theme Explore preview: menu Home/Contact only; localStorage throws in sandbox | NOT-CHECKED | guess OPEN LOW | — | — | 1125 |
| B083 | Assistant copies media into theme assets instead of Media | NOT-CHECKED | guidance gap; guess OPEN LOW | — | — | 1126 |
| B084 | Bundled plugins read as unknown/no provides (J-12) + other X2-F reds | FIXED | Tovu 3fca0eb4 + Jini 3f693fd2 (both ancestors) | — | — | 1128 |
| B085 | Google member-login pins dropped; GUIDANCE.md duplicated/broken | FIXED | d6985b9a, 9bf76a85 (ancestors) + f538e604 class guard | — | — | 1129, 1130 |
| B086 | Coverage: moved code tested only from Tovu | OBSOLETE | owner 11-20 coverage policy (runs last) | — | — | 1131 |
| B087 | 7 tests pin old absolute sign-in URL | OBSOLETE | test drift after 05ab227c | — | — | 1132 |
| B088 | Calendly iframe export fails fragment validator without url | NOT-CHECKED | guess OPEN LOW | — | — | 1133 |
| B089 | deployment_ops_list_targets says railway unknown (plugin off) | NOT-CHECKED | guess OPEN MED | — | — | 1135 |
| B090 | agent_plugin_connect railway repeated; failures and "Declined" shown twice | NOT-CHECKED | guess OPEN MED | — | — | 1136, 1156 |
| B091 | Raw "No such tool mcp__jini__…"; first credential_save rejected | NOT-CHECKED | guess OPEN MED | — | — | 1137, 1156, 1170 |
| B092 | Guessed tool names → 403 not "unknown tool"; callback URL with placeholders | NOT-CHECKED | guess OPEN MED; callback = plan Phase 0a | — | — | 1138, 1170, 1413 |
| B093 | Internal tool names leak into replies | NOT-CHECKED | codex/tv-howto2 c0f70b84c2 edits guidance "tool names"; may be FIXED-PENDING | — | — | 1139, 1156, 1157, 1170 |
| B094 | Enable card lists versions 0.1.0, 1.0.0, 1.0.1 | NOT-CHECKED | guess OPEN LOW | — | — | 1141 |
| B095 | Switching runtime back resets model to Opus | NOT-CHECKED | guess OPEN LOW | — | — | 1143, 1156 |
| B096 | kUInetic clip-path on:enter never fires | OBSOLETE | not reproduced by kUInetic (1146) | — | — | 1146 |
| B097 | kUInetic carousel-3d clicks land on stage plane; fine-hover no-ops on touch | NOT-CHECKED | external library (kUInetic) | — | — | 1147, 1148 |
| B098 | Broadcast theme: motion off on phones, --kui-step-position double writer, stale comment, header crowds ~560 px | UNVERIFIABLE | owner's site theme, not in repo bases; Chrome check at 360/560/768 | — | — | 1149, 1150, 1151, 1178 |
| B099 | Desktop complexity violations (App, TabStrip, project-ipc…) | OBSOLETE | superseded by 11-13 complexity gates (error ≤10) | — | — | 1152, 1180 |
| B100 | Old site-level MCP OFF now reads ON | OBSOLETE | accepted MCP-DEFAULT trade-off | — | — | 1153 |
| B101 | Jini core: express undeclared/imported, loadOptionalPeer lazy imports | FIXED | no `from 'express'` in J:core/src; express only devDependency; no loadOptionalPeer( in core/src | — | — | 1154, 1465 |
| B102 | Jini agent-plugins optional peers; .mjs JSDoc names @jini-ai/devops | NOT-CHECKED | guess OPEN LOW | — | — | 1154 |
| B103 | Antigravity dead-end "A different jini entry exists" | NOT-CHECKED | FIX-AGY verified 11-10 (1157) but 11-11 live check blocked again (1368 #3); needs live agy run | — | — | 1155, 1157, 1368 |
| B104 | Chat-check leftovers: skipped enable card, false "saved" claim, Cloudflare chip, run-failed copy, Codex no callback, agy retry no backoff | NOT-CHECKED | guess OPEN LOW–MED | — | — | 1156 |
| B105 | Pending tool call shown twice; "``html" fence; footer flips Done→Waiting | NOT-CHECKED | guess OPEN LOW | — | — | 1157 |
| B106 | Provider-plugin halves (google-forms, posthog, sentry, otel, stripe) never bundled | NOT-CHECKED | formspree parked; guess OPEN LOW | — | — | 1158, 1159 |
| B107 | identity.ts read only extensions.tovu → Soon flags lost | FIXED | W/features/agent-plugins/tool-registrations.ts:94-108 Soon handling via host list | — | — | 1160 |
| B108 | tool-registrations test: grantDeclaredToolsToSignedInRows [] for supabase | NOT-CHECKED | test | — | — | 1161 |
| B109 | search_agent_plugin_local doesn't mark host Soon plugins → offers refused enable | OPEN | W/features/agent-plugins/tool-registrations.ts:111-113 "KNOWN GAP" comment | MED | host-maturity port in Jini search tool | 1162, 1379 |
| B110 | Soon-lock test risk note | OBSOLETE | note, not a bug | — | — | 1163 |
| B111 | createPendingAuthorizationStore undefined (live tree vs ui-jini) | OBSOLETE | env mismatch; live tree moved to main | — | — | 1164, 1167 |
| B112 | gitleaks Secrets workflow red on test values | FIXED | .gitleaks.toml:18-31 exact-file fixture/report allowlists | — | — | 1165 |
| B113 | 6 fixwave fixes missing from main | FIXED | PORT-1025 Tovu fad66fb87, Jini 9d2437993 (ancestors) | — | — | 1166 |
| B114 | charts-recharts INTEGRITY_FAILED + activation poll log spam (pin 0.6.24) | FIXED | a721de877 (ancestor) pin + poll backoff | — | — | 1168, 1368, 1380, 1439, 1441 |
| B115 | Desktop IPC sender unchecked; sites-home sandbox off; lazy @jini-ai/core | NOT-CHECKED | guess OPEN (security hardening) | — | — | 1169 |
| B116 | Tool-failure audit: masking blanks names, bare HTTP 500, 300 s abort while card waits, Chrome tab collisions | NOT-CHECKED | guess OPEN MED | — | — | 1170 |
| B117 | Theme batch: two edits to one file → "changed during review" partial batch | NOT-CHECKED | judge-verified MED (1284); guess OPEN | — | — | 1170, 1284 |
| B118 | Jini devops source-control commit path weaker; branch form; ABI mismatch | NOT-CHECKED | latent until dedupe | — | — | 1171, 1172 |
| B119 | github vendor id hard-coded in core provider-module.ts | NOT-CHECKED | guess OPEN LOW | — | — | 1171 |
| B120 | credential-setup guard misses update/replaceRepo (S1) + S2–S11 | NOT-CHECKED | guess OPEN LOW | — | — | 1173, 1198 |
| B121 | Source Control saved GitHub key vanishes after reload | OPEN | W/features/source-control/store.ts:397-400 save→repo.canonical; only describe/resolve (:538,:570) read canonical, list/update/delete don't | MED | route list/update/delete through canonical; save→list→update→delete test | 1174, 1376 |
| B122 | Stop during commit export still pushes | NOT-CHECKED | guess OPEN LOW–MED | — | — | 1175 |
| B123 | >100 grants → shared project keys vanish from lists | NOT-CHECKED | guess OPEN MED (both judges) | — | — | 1176, 1198, 1223, 1237 |
| B124 | Source-control update rename race; dead exports; vault repo imports platform | NOT-CHECKED | LOW | — | — | 1177 |
| B125 | Desktop Import-tab test OOM (test bug) | NOT-CHECKED | fix 1d51b0ce was cloud-only | — | — | 1179 |
| B126 | port/wip-1110 desktop gates red (websites-width, typecheck) | OBSOLETE | branch state, superseded | — | — | 1180 |
| B127 | daemon-supervisor "could not bind" names boot port; refresh once per process | NOT-CHECKED | LOW | — | — | 1183 |
| B128 | relayResponse cancel hook after readiness wait | NOT-CHECKED | listener armed in relayResponse (W/server/runtime/composition/modules/assistant.ts:123); LOW | — | — | 1184 |
| B129 | Smells/dupes: AG-UI reducer copy, seal-aad scanner, Jini run-finalizer copy, release-check event name | NOT-CHECKED | not bugs; seal-aad-invariant.ts still in W/features/webhooks | — | — | 1185, 1194, 1207, 1212 |
| B130 | stopped-database: foreign_key_check blocks relocation, wrong message; WAL probe race | NOT-CHECKED | LOW | — | — | 1188, 1228 |
| B131 | Extraction dossier script bugs | OBSOLETE | survey tooling | — | — | 1189, 1195, 1201 |
| B132 | exports/runtime.ts catalog failure uncaught | OBSOLETE | NOT-A-BUG (judge): line 1236, CMS catches per embed | — | — | 1192, 1236 |
| B133 | EnvOrFileKeyring auto-create non-exclusive write | NOT-CHECKED | LOW | — | — | 1193 |
| B134 | attached-vault DB error → "key no longer exists"; protect() wrong reason | NOT-CHECKED | LOW | — | — | 1199, 1200 |
| B135 | Legacy Media providers whole-map PUT wipes built-in key saved elsewhere | OPEN | A/features/media/media-providers-port.ts:45; W/features/media/provider-credential-store.ts:308-310 tombstones absent built-ins | MED | revisioned/partial save; server refuses stale map | 1204, 1232, 1321, 1363 |
| B136 | Remove on a plugin-vendor media key does nothing | OPEN | W/features/media/provider-credential-store.ts:304-310 never tombstones non-built-in by omission | MED | explicit delete for one provider id | 1341 |
| B137 | Modal padding click closes and loses draft (edit-media, ThemePageDetails, MessageOverflow) | OPEN | A/features/media/hooks/use-edit-media-modal.hooks.ts:29-30; A/features/pages/ThemePageDetailsModal.hooks.tsx:24-25 target===dialog | MED | ui-kit Dialog backdrop logic | 1205, 1227, 1232, 1292 |
| B138 | Legacy Media page Jini twin parity gaps | NOT-CHECKED | owner parity task | — | — | 1206 |
| B139 | Chat auto-title from raw body (pasted key in ai_chats.title) | FIXED | 5ab0cd11a (ancestor); W/server/runtime/composition/modules/assistant-chats.ts:277 uses redacted message | — | — | 1210, 1214, 1231 |
| B140 | Old titles not scrubbed; rename PATCH stores title unredacted | OPEN | W/server/runtime/composition/modules/assistant-chats.ts:175-176 parseRenameTitle no redaction | LOW security | redactUserText in rename; one-off scrub of old titles | 1214 |
| B141 | BYOK: Stop before close listener → paid run continues | OPEN | W/server/runtime/composition/modules/assistant-byok.ts:763 listener armed after credential/federation awaits (~:727,:747) | MED | arm close listener first or check res.destroyed after waits | 1211, 1220, 1232, 1238 |
| B142 | Desktop Import handoff invisible off Projects/Appearance | FIXED | D/renderer/use-section-nav.hooks.ts:118-121 startImporting selects projects, closes Appearance | — | — | 1216, 1232 |
| B143 | AG-UI: no durable acceptance; failed run as "succeeded"; inventory latch | NOT-CHECKED | judge downgraded LOW (1233) | — | — | 1217, 1218, 1219, 1233 |
| B144 | Cancel-before-write class (consent, credential guard, restart, webhook tools) | NOT-CHECKED | judge LOW; guess OPEN | — | — | 1221, 1237 |
| B145 | Stale verification labels rotated token with old account | NOT-CHECKED | LOW | — | — | 1222, 1237 |
| B146 | Webhook update overwrites concurrent delete/pause (pause/delete M6 now CAS) | OPEN | J:integrations/src/webhooks/subscriptions.ts:126 no CAS when caller omits expectedVersion (pause :166, delete :199 fixed) | LOW–MED | default expectedVersion to existing.version | 1224, 1237, 1367, 1426, 1432 |
| B147 | deploy-split-activation migration overwrites later "off" | NOT-CHECKED | claimed MED | — | — | 1225 |
| B148 | site-key-ensure recovery race; no dir fsync; secret-scan blob skip | NOT-CHECKED | LOW | — | — | 1226, 1237 |
| B149 | Misc lows (consent bootstrap overwrite, delivery-log limit<1, desktop confirm, Copy details…) | NOT-CHECKED | LOW | — | — | 1229 |
| B150 | Trash list filters after paging (empty Trash for limited roles) | NOT-CHECKED | judged LOW (1299) | — | — | 1240, 1299, 1386 |
| B151 | users/enable re-enables owner-disabled admin (no owner guard) | OPEN | W/server/inbound/admin-http/routes/users/enable.ts:58-60 only assertCallerHasAnyPermission; disable.ts:84 uses assertUserAccountAction | MED security (owner may rate HIGH) | call assertUserAccountAction in enable | 1241, 1294 |
| B152 | reset-password: Trash checked before permission (409 vs 403 leak) | OPEN | W/server/inbound/admin-http/routes/users/reset-password.ts:65 isInTrash before :72 assert | LOW security | permission check first (as enable.ts:58) | 1242 |
| B153 | admin-http over-engineering (error mappers, hand-rolled 403s) | NOT-CHECKED | smell | — | — | 1243 |
| B154 | Desktop pt-PT/"pt" falls back to English | NOT-CHECKED | judge MED | — | — | 1245, 1290 |
| B155 | add-site-pointer uses default registry under profile override | NOT-CHECKED | LOW | — | — | 1246 |
| B156 | Desktop-chat cluster unreachable | OBSOLETE | parked by owner 10-06 | — | — | 1247 |
| B157 | findPublishCandidate wired to wrong deps → assistant never sees deploy address | FIXED | W/server/runtime/composition/tool-catalog-manifest.ts:544 passes findPublishCandidate into publish-content deps | — | — | 1249, 1296 |
| B158 | .publish-previous backups grow unbounded | NOT-CHECKED | LOW | — | — | 1250 |
| B159 | CLI plugin install hard-codes builtInIds ["word-count"] | OPEN | W/cli/commands/plugin/install.ts:23 | LOW | share server built-in id list | 1253 |
| B160 | Legacy Shared Keys import all-or-nothing; desktop↔CLI wire types drift | NOT-CHECKED | LOW | — | — | 1254, 1255 |
| B161 | Asset normalizer half-converted folder; publish row on stale basic theme | NOT-CHECKED | LOW | — | — | 1257, 1258, 1285 |
| B162 | Chat key save picks first host → duplicate key row | NOT-CHECKED | judge-verified MED; guess OPEN | — | — | 1261, 1297 |
| B163 | export-status tool description vs ok flag | NOT-CHECKED | MED claim | — | — | 1262 |
| B164 | credentialSetup offered for env-configured/disabled hosts | OPEN | W/features/deployments/publish-agent-tools.ts:976 hostsMissingSavedKey ignores enabled/env | MED | skip disabled and env-configured hosts | 1263, 1298 |
| B165 | Import fails for site names ending "." or space | OPEN | W/features/site-backup/import-backend-steps.ts:140 assertPortableSiteName on raw display name | MED | validate the derived slug, trim name | 1266, 1283 |
| B166 | Jini plan-store caps 2 plans globally (other user evicts yours) | OPEN | J:db/src/tools/plan-store.ts:59-62 evicts across principals | LOW–MED | cap per principal | 1267 |
| B167 | Backup list() BUSY during import; history read cost; push Stop race | NOT-CHECKED | LOW; codex/tv-bugs3a touches site-backup push-content | — | — | 1268, 1285, 1286 |
| B168 | Theme preview switcher hides cookie banner/consent for every visitor | OPEN | W/server/inbound/public-http/middleware/theme-preview-switcher.ts:51 stamps override; site-cookie-consent.ts:270,281 read it | MED | separate screenshot flag from preview choice | 1271, 1295 |
| B169 | site-chat-static checks bundle only at boot | NOT-CHECKED | LOW | — | — | 1272 |
| B170 | form-delivery secret check misses vendor token shapes | NOT-CHECKED | LOW security | — | — | 1275 |
| B171 | settings barrel extraction hazard | OBSOLETE | extraction note | — | — | 1276 |
| B172 | "Show in modal" never appears; sticky-optimistic pref hooks | NOT-CHECKED | LOW | — | — | 1279, 1280 |
| B173 | Dock BYOK model picker empty after reload | NOT-CHECKED | judge MED | — | — | 1289 |
| B174 | Retry reuses message id → stale tool results | NOT-CHECKED | judge MED | — | — | 1291 |
| B175 | bootToken printed into server.log (security) | FIXED | W/cli/commands/serve-listen.ts:60-61 stdout only; test serve-command-wiring.unit.test.ts:327; scrub of 21 existing logs unverifiable | — | — | 1288 |
| B176 | Newsletter confirm link always 500 (consent unbound) | OPEN | W/features/newsletter/confirmation.ts:159-161 throws when consentCapability null | MED | no tokens/emails while unbound, or plain visitor page | 1301, 1326, 1346, 1350 |
| B177 | Archived list still targeted by campaigns/subscriptions | OPEN | no "archived" read in W/features/newsletter/campaign-write-service.ts | MED | refuse archived lists | 1302 |
| B178 | preheader:null ignored on update | OPEN | W/features/newsletter/tool-registrations.ts:409 keeps existing.preheader | MED | null clears | 1303, 1351 |
| B179 | Newsletter list tools one page, filter after cap, no cursor | NOT-CHECKED | MED | — | — | 1351, 1379 |
| B180 | Campaign save reads revision history twice (cost) | NOT-CHECKED | cost | — | — | 1304 |
| B181 | user-purge leaves frozen api-key policy | NOT-CHECKED | judged LOW (1347) | — | — | 1306, 1347 |
| B182 | Identity/admin dedupe smells | NOT-CHECKED | smell | — | — | 1307, 1308, 1315, 1319, 1323, 1327, 1330 |
| B183 | Secrets tab blank when one store read fails | OPEN | A/features/security/AccessTokensTab.tsx:152-165 any loadError replaces whole body | MED | per-store inline errors | 1310, 1340 |
| B184 | Removing unused shared project key fails silently | NOT-CHECKED | LOW | — | — | 1311 |
| B185 | Jini security module parity decision | OBSOLETE | owner parity decision, not a bug | — | — | 1312 |
| B186 | search_components/describe_component use static ALL_MANIFESTS | OPEN | W/assistant/component-catalog-tool.ts:125 buildComponentCatalogQuery() default getManifests | MED | inject live chart snapshot | 1314, 1352 |
| B187 | Postgres initSite mid-fail leaves DB seeded; admin-build failed marker unread | NOT-CHECKED | LOW | — | — | 1317, 1318 |
| B188 | import-media-entity tombstoned blob race | NOT-CHECKED | LOW | — | — | 1322 |
| B189 | Magic-link bridge matches error strings | NOT-CHECKED | LOW | — | — | 1325 |
| B190 | widgetEmbed schema lacks widgetEntryId (strict MCP) → embed lost / edit refused | OPEN | W/features/post/tiptap-block-schema.ts:204-213 attrs additionalProperties:false, no widgetEntryId | HIGH data loss | add widgetEntryId (keep when present) + test | 1329, 1349 |
| B191 | Create/Activate reset race; Copy link no clipboard fallback; dormant UI | NOT-CHECKED | LOW | — | — | 1332, 1333, 1334 |
| B192 | Site-chat page-control failure breaks plain chat | OPEN | apps/site-chat/src/visitor-page-control.ts:79 rejects "Page attachment expired" after 10 s (path unchanged) | MED | send without page control when attach fails | 1336, 1353 |
| B193 | Site chat English strings on non-English sites | NOT-CHECKED | MED | — | — | 1337 |
| B194 | Removing External MCP drops restartRequired | NOT-CHECKED | judge MED | — | — | 1342 |
| B195 | dev API hang on :3000 | OBSOLETE | false alarm (https) per 1356 | — | — | 1356 |
| B196 | Post editor discard/preview/conflict strings English-only | NOT-CHECKED | codex/tv-bugs3b adds load-failure copy only; guess OPEN MED | — | — | 1358, 1370 |
| B197 | prettify-html adds whitespace on HTML-tab save | NOT-CHECKED | MED claim | — | — | 1359 |
| B198 | R4 lows (trash_item ignores Stop, sweeper, delete handler, gated-mutation-token save overwrite…) | NOT-CHECKED | LOW | — | — | 1360, 1361, 1366, 1367 |
| B199 | external_mcp_test_connection always live-probes; proposed card ID edits rejected; recovery card never opens | NOT-CHECKED | judge MED | — | — | 1362, 1371 |
| B200 | External-MCP save input errors all → "no longer current" | OPEN | W/features/external-mcp/tool-registrations.ts:627 maps every ToolInputError | MED | pass input error text through | 1362, 1371 |
| B201 | Reauth deep link to old /settings/external-mcp | OPEN | W/features/external-mcp/external-mcp-oauth.ts:79 | LOW | link /addons/integrations?tab=external-mcp | 1362, 1371 |
| B202 | admin api.ts: signal drops timeout, mediaContentType no timeout, raw SyntaxError | NOT-CHECKED | LOW | — | — | 1363 |
| B203 | Redirect in destination Trash aborts whole publish run | OPEN | W/features/redirects/publish-content.ts:156 blocked list lacks not-live/trash error | MED | treat not-live as blocked | 1364, 1370 |
| B204 | Redirect publish ignores checked version (M5) | OPEN | W/features/redirects/publish-content.ts:148-152 updateRedirect without expectedVersion | MED | pass existing.version | 1432 |
| B205 | Taxonomy tools hide refusals as INTERNAL_ERROR; merge non-atomic; merged term assignable | NOT-CHECKED | judge MED | — | — | 1364, 1370 |
| B206 | media_generate_asset ignores Stop | OPEN | W/features/media-generation/tool-registrations.ts:353 checks signal only before save; paid call unsignalled | LOW | pass ctx.signal into dispatch | 1365, 1369 |
| B207 | Live check: sites 503 banner, ask-choice drops ticks, picker menu stays open, composio lock waits | NOT-CHECKED | guess OPEN LOW–MED | — | — | 1368 |
| B208 | Owner Q: publish import copies HTML menus without pages.edit_html | NOT-CHECKED | owner question | — | — | 1369 |
| B209 | Members screen shows first 100 only | NOT-CHECKED | judge MED twice | — | — | 1370, 1382 |
| B210 | Post Preview ignores unsaved author/cover | NOT-CHECKED | judge MED | — | — | 1370, 1378 |
| B211 | Disabled search-provider plugin still gets writes/queries | OPEN | W/server/runtime/composition/site-deps/after-assembly-forms-search.ts:125 uses agentPluginLayout.root, not forWorkspace().root (cf. composition/app.ts:211) | HIGH | resolve activation at the workspace root + red test | 1371 |
| B212 | Dockerfile tab switch drops unsaved draft | NOT-CHECKED | judge C MED (confirmLeave unwired) | — | — | 1372, 1373, 1383 |
| B213 | Desktop-created sites get default owner password | OPEN | D/site-dir-store.ts:255-256 passes `--admin-password tovu-dev` when no custom password | HIGH security | random unseen password (as buildCliEnv), never the default | 1373, 1381 |
| B214 | peers.ts connect overwrites sealed key row | NOT-CHECKED | judge downgraded LOW (1376) | — | — | 1373, 1374, 1376 |
| B215 | Pages PUT undo drops ext metadata | NOT-CHECKED | judge LOW (1382) | — | — | 1374, 1382 |
| B216 | Typed provider key sent to half-typed custom Base URL | OPEN | J:ui/src/features/execution/react/components/ExecutionTab.hooks.ts:50-53 discovery effect keyed on byok.baseUrl, no debounce | HIGH security | probe only on committed endpoint (blur/debounce) | 1374, 1375 |
| B217 | Unsaved menu edits lost on sidebar navigation | OPEN | A/features/menus/MenuEditor.tsx:394-398 only Back link calls confirmLeave | HIGH | router-level leave guard | 1374, 1375 |
| B218 | Agent-plugin note text wiped when editing filename | OPEN | A/features/plugins/hooks/use-agent-plugin-memory.hooks.ts:66 setPath replaces text | HIGH | keep typed text on rename | 1374, 1375 |
| B219 | Nested user text in assistant_run_attempts.accepted_json | NOT-CHECKED | judge LOW (1386) | — | — | 1374, 1386 |
| B220 | Judge 9 mediums: visitor form drops maxTokens, integrations error replaces tab, delivery log 50 cap, caption placeholder | NOT-CHECKED | MED | — | — | 1375 |
| B221 | Republish earlier version fails; live URL cut to origin; theme-off export only /; restore undoes disconnect | NOT-CHECKED | judge MED | — | — | 1376 |
| B222 | Composition lows (reservation list, pending-token file, activation polling never recovers, 50-key cap) | NOT-CHECKED | codex/tv-bugs3a edits plugin-activation-polling.ts | — | — | 1377 |
| B223 | Admin UI 13 mediums (turn-off copy, keyboard-dead menus, MCP errors silent, MCP toggle stale PUT, pasted image dropped, i18n) | NOT-CHECKED | MCP toggle likely FIXED by 80e976642a (expectedVersion) | — | — | 1378 |
| B224 | Widgets by slug missing from whereUsed; plausible newsletter/media mediums | NOT-CHECKED | MED | — | — | 1379 |
| B225 | PostHog browser analytics 404 (surface segment) | NOT-CHECKED | judge MED | — | — | 1380 |
| B226 | New default publish key reuses old verification | NOT-CHECKED | judge MED | — | — | 1380, 1384 |
| B227 | Role/policy rename to existing name → 500 | NOT-CHECKED | judge MED | — | — | 1380 |
| B228 | Judge 3 mediums: Widgets nav permission, pasted embed same placementId, non-owner loses Local CLI, thumbnail, reauth prompt permission | NOT-CHECKED | MED | — | — | 1381 |
| B229 | Deleting trashed site leaves content+chat DBs | NOT-CHECKED | judge MED | — | — | 1382 |
| B230 | Judge C: /products skip finalize pipeline, post list unsorted, number field snaps back, 409 banner, i18n | NOT-CHECKED | MED | — | — | 1383 |
| B231 | Vercel/GitHub Pages key save 409 KEY_IN_USE though saved | NOT-CHECKED | judge MED; healAccountLabel at W/features/deployments/publish-credentials/store.ts:728 | — | — | 1384 |
| B232 | Judge 4 others: shared OAuth stop-using, DB-transfer mislabel, no time zone, readiness, mail DNS | NOT-CHECKED | MED | — | — | 1384 |
| B233 | Collection-list widget keeps stale sort after collection change | OPEN | A/components/WidgetConfigFields/WidgetConfigFields.hooks.tsx:206-214 setCollection drops fields/where, keeps sort | HIGH | drop field sort on collection change + test | 1385 |
| B234 | Judge 1 mediums: false "stopped without a cause" card, Embed menu no Escape, sort/layout options lie | NOT-CHECKED | MED | — | — | 1385 |
| B235 | Judge 10 mediums: BYOK max-tokens can't clear, visitor list cap 20, logout keeps cached Trash, etc. | NOT-CHECKED | MED | — | — | 1386 |
| B236 | Webhooks from admin UI stored as owner/createdBy "user-local" | OPEN | W/server/inbound/admin-http/routes/integrations/create.ts:52-53 | HIGH (wrong write) | use authed principal id | 1387 |
| B237 | Capital İ shifts WebMCP script injection | OPEN | W/features/webmcp/published-html.ts:15 index taken from html.toLowerCase() | MED | case-insensitive search on original string | 1387 |
| B238 | Agent detection drops supportsCustomModel etc.; Test agent claims auth | NOT-CHECKED | judge MED | — | — | 1387 |
| B239 | External-MCP picker re-ticks recommended tools; Skills list stale | NOT-CHECKED | judge MED | — | — | 1388 |
| B240 | Owner-rules audit: process.exit(1) at boot; purge tools reachable from chat | NOT-CHECKED | owner-rule audit | — | — | 1389 |
| B241 | Dependency vulnerabilities; semgrep ERROR hits | NOT-CHECKED | deps-1121 upgrades may cover | — | — | 1391, 1398 |
| B242 | i18n gaps (27 empty values, ChatFab hi/ur/bn) | NOT-CHECKED | LOW | — | — | 1392 |
| B243 | Bug-class audit counts | OBSOLETE | inventory queued for refactor | — | — | 1394 |
| B244 | storage-secret sealing test; personal MCP opt-in renders checked | NOT-CHECKED | regex-classified only | — | — | 1396 |
| B245 | "View Template" disabled when templateChoice null | OPEN | A/features/pages/PageEditor.tsx:639 disabled={!templateChoice}; tv-bugs3b doesn't touch it | MED | enable from displayed picker value | 1400 |
| B246 | QuestionForm label not tied to its control (a11y) | NOT-CHECKED | guess OPEN MED | — | — | 1402 |
| B247 | /auth/me and password-status hang on store failure | FIXED | W/server/inbound/admin-http/dev-auth.ts:814,858 wrapped in asyncRoute | — | — | 1404 |
| B248 | 37 routes await auth/rate-limit before try; Jini settings wrap | NOT-CHECKED | guess partly fixed by asyncRoute | — | — | 1405 |
| B249 | Settings change feed SSE silent on DB error | NOT-CHECKED | LOW | — | — | 1406 |
| B250 | Newsletter confirm awaits newsletterReady outside try | FIXED | W/server/inbound/public-http/routes/site/newsletter-confirm.ts:19-20 inside asyncRoute | — | — | 1407 |
| B251 | Post editor drag/paste failed upload silent | NOT-CHECKED | tv-bugs3b only adds live-editor check; guess OPEN LOW | — | — | 1408 |
| B252 | Recovered-draft Discard server failure silent | NOT-CHECKED | LOW | — | — | 1409 |
| B253 | Desktop quit chain: rejected shutdown skips drain | FIXED | D/main/index.ts:1134-1139 catch before drain | — | — | 1410 |
| B254 | Supabase TLS sslmode; pooler 6543 breaks session lock | UNVERIFIABLE | needs live Supabase (plan Phase 5) | — | — | 1411, 1412 |
| B255 | Recovery decorators drop requireConfirmation | OPEN | J:daemon/src/tool-recovery/analytics.ts:42-47 forwards only {principal,run,toolId,input} | MED | forward all execute args | 1417 |
| B256 | AG-UI Object.hasOwn; TOOL_CALL_OPEN_RE; dead Select hooks | NOT-CHECKED | LOW | — | — | 1418 |
| B257 | useRunStream reattach omits transport from deps | OPEN | J:chat/src/react/hooks/useRunStream.ts:~209 deps [makeHandlers, teardownSubscription] (likely) | LOW | add transport | 1419 |
| B258 | tovu_ak_ in exceptions: unredacted Jini sinks, Electron main, commerce warn, CLI one-shots, desktop-host log file | NOT-CHECKED | rated MED (1428); d5 lane | — | — | 1420, 1428, 1429, 1436 |
| B259 | Silent failures (composer history, run subscription); describeApiError shows any Error | NOT-CHECKED | MED | — | — | 1421, 1422 |
| B260 | http-kit dispatcher routes differently from gates | OBSOLETE | only in unmerged d2 design clone | — | — | 1423 |
| B261 | Newsletter send-pipeline reads ≤100k rows | NOT-CHECKED | LOW | — | — | 1425 |
| B262 | Identity login writes whole user row | NOT-CHECKED | lost-updates S3 not started (lu-s1 report); guess OPEN MED | — | — | 1426 |
| B263 | Jini list cursor lacks list marker | NOT-CHECKED | LOW | — | — | 1427 |
| B264 | Agent newsletter send omits unsubscribe bundle | NOT-CHECKED | LOW, owner Q O8 | — | — | 1430 |
| B265 | MCP background writers upsert stale whole records (B3) | FIXED | Jini ae6b1c236, 5d9ad00c3, 713790dc0; Tovu 06a421d356, 80e976642a (lu-s1) | — | — | 1431, 1432 |
| B266 | Jini media trash saves stale record (M7) | NOT-CHECKED | MED | — | — | 1432 |
| B267 | 501st redirect wildcard never matches (M8) | FIXED | Jini af6ff0339 (ancestor) rejects active wildcard past bound | — | — | 1432 |
| B268 | Forms own-read CAS; Forms publish drops version; partial combined save | NOT-CHECKED | MED | — | — | 1431, 1432, 1435 |
| B269 | Visitor search raw records, HTML basis swap, cap race, version rewind | OBSOLETE | prompt-only, not live (1432) | — | — | 1431, 1432 |
| B270 | Redirect validation before lock; pages_write_html stale convert | NOT-CHECKED | MED suspected | — | — | 1433 |
| B271 | attachment-lookup 64 KiB limit unenforced | NOT-CHECKED | LOW, owner Q4 | — | — | 1434 |
| B272 | Trash restore redirect skips capacity; MCP OAuth callback lands on new client | NOT-CHECKED | MED suspected | — | — | 1435 |
| B273 | Packaged desktop: no "Chat with this site" bubble | FIXED | d2edbcb43 (ancestor); .github/workflows/desktop-release.yml:82,159,403 npm run build | — | — | 1437, 1438, 1441 |
| B274 | recharts-package-pin red went unnoticed (process) | NOT-CHECKED | process | — | — | 1440 |
| B275 | Visitor navigate refuses slug (dfea76018 regression) | FIXED | W/assistant/site/visitor-page-tools.ts:39-43 accepts slug (752bdda52 itself not an ancestor) | — | — | 1442, 1444, 1446 |
| B276 | No visitor form-fill tool | NOT-CHECKED | feature gap | — | — | 1443 |
| B277 | Chat "Jump to latest" pill floats mid-transcript | FIXED | Jini fba829720 (ancestor), released 0.7.2 | — | — | 1445, 1447, 1448 |
| B278 | Mac notarization 403: Apple agreement expired | UNVERIFIABLE | owner action at developer.apple.com | — | — | 1449 |
| B279 | MCP-UI ui/request-teardown has no host handler | NOT-CHECKED | plausible LOW | — | — | 1450 |
| B280 | site-chat declares unused @mcp-ui/client | OPEN | apps/site-chat/package.json:25 | LOW | remove the dependency | 1451 |
| B281 | Claude def no mcpIsolation → consent asked despite --strict-mcp-config | NOT-CHECKED | prior triage row 1327 says FIXED (mcp-isolation-claim test) | — | — | 1453 |
| B282 | pnpm preferWorkspacePackages missing | FIXED | J pnpm-workspace.yaml:20 | — | — | 1455 |
| B283 | tool-execution-rpc 1 MB 401 ECONNRESET flake | NOT-CHECKED | test flake | — | — | 1457 |
| B284 | resolve-mailer double cast hides shape drift | NOT-CHECKED | LOW | — | — | 1459 |
| B285 | Jini check:complexity red (8 functions) | FIXED | d17eac936 (ancestor) + siblings | — | — | 1461 |
| B286 | Refactor clone args batch: 16 caller breaks | OBSOLETE | refactor-clone state 11-15, superseded by merges | — | — | 1463 |
| B287 | Jini pre-existing reds: ui→lexical peer, plugin-package-gates, coupling lists | NOT-CHECKED | test state | — | — | 1466 |

## Possible duplicates of other sections
- Personal MCP consent card / "can't hide its own tools" (B051)
- Streaming split paragraphs / broken markdown (B073)
- Raw `mcp__jini__` "No such tool", internal tool names in replies (B091, B093)
- charts-recharts INTEGRITY_FAILED / recharts pin (B114)
- Antigravity `jini` entry in ~/.gemini mcp_config (B103)
- >100 grants shared keys vanish; Source Control key vanishes (B121, B123)
- Legacy Media providers whole-map save / plugin-vendor key remove (B135, B136)
- Dialog padding-click closes modal (B137)
- Lost updates / CAS: webhooks, redirects, forms, media trash, identity (B146, B204, B262, B266, B268)
- Newsletter consent null / confirm 500 (B176)
- Desktop default owner password tovu-dev (B213, memory desktop_seeds_default_owner_password)
- "Server is starting" 503 after Jini rebuild (B008)
- Higgsfield sign-in card / hosted sign-in links (B043)
- Error redaction / tovu_ak_ in logs (B258); batch tool failure text (B045)
- Jump-to-latest arrow (B277); agent-plugin Soon maturity (B109)
- Google login callback placeholders (B092)

## OPEN, grouped for planning (all parts)
0. HIGH first (part B, verify each before fixing): B190 widgetEmbed schema drops widgetEntryId (data loss); B211 disabled search plugin still gets writes/queries; B213 desktop-created sites get default owner password `tovu-dev` (security); B216 typed provider key sent to a half-typed custom Base URL (security); B217 unsaved menu edits lost on sidebar navigation; B218 plugin note text wiped on filename edit; B233 collection-list widget keeps stale sort; B236 webhooks stored as owner "user-local".
1. Admin user/permission security: B151 users/enable re-enables an owner-disabled admin (MED, owner may rate HIGH); B152 Trash checked before permission; B140 rename title not redacted; C043 tier-2 plugin worker import allowlist; A450 themes on a separate origin.
2. Data integrity: C058 member save `version <=` lost update; C057 L244 no-op version bump; C002 revert not atomic.
3. Error words / logging (owner rule): C048 class-only describeErrorForLog, C025, C112, C131 (new), C130, C075, C115, C100.
4. Daemon lifecycle: C084 in-process idle park `exit: () => {}`.
5. Jini protocol/architecture: C065 ACP matrix, C063 run-finalizer duplicate.
6. Policy/gates: C026 vendor names, C074 architecture metric, C028 why-comments, C070 hook debt, C014 optional-peer pin, C036/C046/C095 boundaries.
7. UI/Chrome pass: C017 `.jini-*` selectors, C107 menu focus, C097, plus part A/B UI rows marked UNVERIFIABLE.
8. Tests/contracts to decide: C085, C086, C076, C096, C099, C056.
9. Follow-up triage run: the 228 NOT-CHECKED rows (B 163 is the bulk: ROUND 2/3 judged-low findings).
