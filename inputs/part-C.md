PART C COMPLETE (lines 1-263 and 1468-1658; coordinator's own range)

Bases: Tovu origin/integ/merge-11-2026-11-21 (311d26dfa6, "T:"), Jini origin/integ/merge-12-2026-11-22 (6b8e0d48a, "J:"). W = apps/website/src, A = apps/admin/src.

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
