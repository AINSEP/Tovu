PLANS COMPLETE

# What's left after combine-12 · plan index (P1–P8, P10)

Bases: Tovu `origin/integ/merge-12-2026-11-22` `41e948ee4` (content `748c032db`), Jini `origin/integ/merge-12-2026-11-22` `6b8e0d48a`. P9 (extraction) is planned by a separate run (`INDEX-EXTRACTION.md`, `plans/P9-*`).
Flow (owner 11-21 ~7:30 PM): these plans → Codex 6.2 read-only review → Opus implementers (local, max 2 at once, tests first). Release/publish/notarization steps are owner-gated and only listed.

## Corrections to the input leads, found while verifying on the bases (for the Codex reviewer)
- P1: `openapi/010-forms.yaml` ordinary PUT is at `:58` (lead said `:45`). Assistant HTML page writes record **no** change set (`features/pages/tool-registrations.ts:713–720`), and the post reverter restores `bodyJson` only (`features/post/reverters.ts:146–201`) — undo needs a new `page-html` reverter, not wording.
- P2: Tovu has **no** `companions` reference at all (lead L4-T1 said `tool-registrations.ts:104–110` preserves it). `publish_content_publish` **does** open a card via the approval policy (`contracts/core/tool-metadata/publish-content.ts:51–58`, `class: 'publish', confirmation: 'policy'`); lead L2's owner question 1 is moot. `seed-bundled.ts` has two catches (`:187`, `:300`).
- P3: `ADMIN_PANELS` is at `apps/admin/src/panels.tsx:1307` (lead `:125`). A SQLite routine store needs a new node-only subpath in `@jini-ai/daemon`.
- P4: Tovu admin replies already mint `ERR-` ids (`shared/admin-failure.ts:56–60`, tv-err1); T3's composition point is `server/runtime/composition/app.ts:419`. Jini fetch route catch is `core/src/contracts/server/json-route.ts:191`. Non-test `onInternalError` refs: 92 (lead 110).
- P7: the last two failed `Desktop Release` runs (#73 `44870881753`, #72 `44854399881`, `release/lockfile-1120`) failed at `npm` install ERESOLVE in `assistant-gate` (site-chat `@jini-ai/agentic`/`protocol` prerelease peers), **before** build/notarization; last real release #65 (v0.1.31) succeeded; B278 (Apple agreement 403) is an owner action.
- P8: B255 not reproducible (options forwarded) → OBSOLETE; A430 likely FIXED; B115's `sandbox:false` is deliberate.

## Step table
| step id | plan | repo | depends on | parallel batch | est | owner question |
|---|---|---|---|---|---|---|
| P1-J1 | P1 form versions + editor refresh | Jini | — | J-A | 2 h | |
| P1-J2 | P1 plain failed-choice row | Jini | — | J-A | 1.5 h | |
| P1-J3 | P1 ResourceBoard menu focus | Jini | — | J-A | 1 h | |
| P1-T1 | P1 version-checked form PUT | Tovu | P1-J1 contract (rollout needs P7-J2) | T-B | 1.5 h | |
| P1-T2 | P1 undo for assistant HTML edits | Tovu | — | T-B | 2 h | |
| P1-T3 | P1 YouTube link for template/widget embeds | Tovu | — | T-B | 1.5 h | |
| P1-T4 | P1 Load latest agent handles | Tovu | after P1-T3 (same file) | T-B | 0.5 h | |
| P2-J1 | P2 plain install-refusal reasons | Jini | — | J-A | 1 h | |
| P2-J2 | P2 guidance offer/commit | Jini | — | J-A | 2 h | |
| P2-T1 | P2 honour allowInactiveGuidance | Tovu | merge-12 Jini artifact | T-B | 1.5 h | combine-12 T dec. 4 (rec: `?? false`) |
| P2-T2 | P2 import guidance survey + versioned writes | Tovu | P2-T1 | T-C | 1.5 h | |
| P2-T3 | P2 scoped publish guidance | Tovu | — | T-B | 1 h | |
| P2-T4 | P2 fit guidance at final assembly | Tovu | P2-J2 + P7-J2 | T-D | 2 h | |
| P2-T5 | P2 durable bundled-ID upgrade journal | Tovu | — | T-B | 2 h | publisher-update list retention (rec: keep history) |
| P3-J1 | P3 durable due slot + catch-up | Jini | — | J-A | 2 h | |
| P3-J2 | P3 SQLite routine store + CRUD | Jini | P3-J1 | J-B | 2 h | |
| P3-T1 | P3 per-site service + desktop lifecycle | Tovu | P3-J2 + P7-J2, P8-T5 | T-D | 2 h | which sites start on open (rec: those with enabled routines) |
| P3-T2 | P3 real owner chat run + result | Tovu | P3-T1 | T-E | 2 h | BYOK routines (rec: not in v1) |
| P3-T3 | P3 waiting for approval | Tovu | P3-T2 | T-F | 1.5 h | approval across quit (rec: Interrupted) |
| P3-T4 | P3 assistant routine tools | Tovu | P3-T1 | T-E | 1.5 h | |
| P3-T5 | P3 Routines admin screen | Tovu | P3-T1 (link after P3-T3) | T-E | 2 h | |
| P4-J1 | P4 core changeset + refusalError fold | Jini | — | J-A | 0.5 h | |
| P4-J2 | P4 HTTP route boundary + http.route span | Jini | P4-J1 | J-B | 2 h | |
| P4-J3 | P4 delete http-kit/core onInternalError | Jini | P4-J2 | J-C | 1.5 h | |
| P4-J4 | P4 daemon routes + tool boundary | Jini | P4-J2 | J-C | 2 h | |
| P4-J5 | P4 sidecar boundary | Jini | P4-J1 | J-C | 1 h | |
| P4-T1 | P4 T391 shutdown idiom | Tovu | — | T-B | 0.5 h | |
| P4-T2 | P4 reporter behind reportServerFailure (T3) | Tovu | P7-J2 (P4-J1…J4) | T-D | 2 h | |
| P4-T3 | P4 tool failures via reporter | Tovu | P4-T2 | T-E | 1 h | |
| P4-T4-R | P4 err-tovu ledger reconciliation | Tovu | — | T-B | 0.5 h | |
| P4-T4-1 | P4 err-tovu sheets A, S, B | Tovu | P4-T4-R | T-C | 2 h | |
| P4-T4-2 | P4 err-tovu sheets D, C, O, I | Tovu | P4-T4-R | T-C | 2 h | |
| P4-T4-3 | P4 err-tovu sheets T, H, P | Tovu | P4-T4-R | T-C | 2 h | |
| P4-T5 | P4 delete Tovu duplicate sinks | Tovu | P4-T2 | T-E | 0.5 h | |
| P5-T1 | P5 payload namespace (case 4a) | Tovu | — | T-B | 1.5 h | |
| P5-T2 | P5 indexed store + paging (cases 2, 4b) | Tovu | P5-T1 | T-C | 2 h | Q4 design pins (rec: as written) |
| P5-T3 | P5 backfill + interruption (case 3) | Tovu | P5-T2 | T-D | 2 h | |
| P5-T4 | P5 rollback (case 5) | Tovu | P5-T3 | T-E | 1.5 h | old-build rollback (rec: accept, no freeze) |
| P6-J1 | P6 AG-UI run client for visitor surface | Jini | — | J-A | 2 h | |
| P6-T1 | P6 AG2-T visitor /chat → AG-UI | Tovu | P6-J1 + P7-J2, P4-T4-2 (sheet C) | T-D | 2 h | cached old loaders (rec: one release both formats) |
| P6-T2 | P6 AG3-T approval resume, /confirm removed | Tovu | P6-T1 | T-E | 2 h | |
| P6-T3 | P6 AG4-T authorized browser delivery (+B192) | Tovu | P6-T2 | T-F | 1.5 h | client_directive as CUSTOM (rec: yes) |
| P6-T4 | P6 admin parity checklist | Tovu | P6-T2 (P6-T3 if needed) | T-G | 1.5 h+ | |
| P6-T5 | P6 AG-ADMIN-DEFAULT flip | Tovu | P6-T4 all green | T-H | 0.5 h | |
| P6-J2 | P6 OpenCode ACP stays off (no code) | Jini | owner parity check | — | 0 | |
| P7-T1 | P7 editor size + error-gate rows | Tovu | P1-T4 | T-C | 2 h | combine-12 T dec. 1 (rec: refactor) |
| P7-T2 | P7 backup cycle + cross-feature edge | Tovu | — | T-B | 1 h | |
| P7-T3 | P7 why-comments + stale script test | Tovu | — | T-B | 0.5 h | combine-12 T dec. 5 (rec: repoint) |
| P7-J1 | P7 Jini why-comment rows | Jini | — | J-A | 0.5 h | |
| P7-J2 | P7 Jini release candidate (owner-gated) | Jini | Jini steps of P1–P4, P6 | release | owner | release go/no-go |
| P7-R | P7 notarization re-run + packaged checks (owner-gated) | Tovu | P7-J2 pin bump; Apple agreement (B278) | release | owner | Apple agreement accepted? |
| P7-L | P7 OWED-LOCAL Chrome/Electron checks | both | combine | local | ~2 h | combine-12 T dec. 2, 3 (rec: keep / confirm) |
| P7-C | P7 coverage last (per package) | both | everything else | last | ~2 h/pkg | |
| P8-J1 | P8 B216 BYOK URL probe | Jini | — | J-A | 1 h | |
| P8-T1 | P8 B151, B152, B236, B140 | Tovu | — | T-B | 1.5 h | scrub old titles (rec: yes) |
| P8-T2 | P8 B211, B190, C058 | Tovu | — | T-B | 2 h | |
| P8-T3 | P8 B217, B218, B233 | Tovu | — | T-B | 1.5 h | |
| P8-T4 | P8 C043 tier-2 import allowlist | Tovu | — | T-B | 1.5 h | SDK-only (rec: yes) |
| P8-T5 | P8 C084 in-process park | Tovu | — | T-B | 1 h | |
| P8-J2 | P8 B146, B166, B060, B016 | Jini | — | J-A | 1.5 h | |
| P8-J3 | P8 B109 Soon plugins (Jini then Tovu half) | Jini→Tovu | — | J-B / T-C | 1.5 h | |
| P8-T6 | P8 newsletter B176–B178 | Tovu | — | T-C | 1.5 h | |
| P8-T7 | P8 publishing B203, B204, B164 | Tovu | — | T-C | 1 h | |
| P8-T8 | P8 keys B121, B135, B136 | Tovu | — | T-C | 2 h | |
| P8-T9 | P8 External MCP B200, B201, A303 | Tovu | A303 lease with P3-T3 | T-C | 1.5 h | |
| P8-T10 | P8 runtime B141, B206, B186, C095 | Tovu | — | T-C | 1.5 h | dispatch prefix (rec: only with AGENTS.md) |
| P8-T11 | P8 content C057, C002, B237, B165, B168 | Tovu | — | T-C | 2 h | |
| P8-T12 | P8 admin UI B183, B137, B245, C017 | Tovu | — | T-C | 1.5 h | |
| P8-J4 | P8 A007 composio lock, A011 static export | Jini | — | J-B | 2 h | |
| P8-T13 | P8 C063 run-finalizer, C097 reload control | Tovu (+Jini) | — | T-D | 1.5 h | |
| P8-L1 | P8 LOW batch Tovu | Tovu | — | T-E | 2 h | |
| P8-L2 | P8 LOW batch Jini + test contracts | Jini | — | J-C | 2 h | |
| P8-V1 | P8 verify-first NOT-CHECKED (security/data) | both | — | T-B | 2 h | |
| P8-V2 | P8 verify-first NOT-CHECKED (UX/assistant) | both | — | T-C | 2 h | |
| — | P8 policy items C026, A308, A310, A348, A450 | — | owner | — | — | listed in P8 (recs given) |
| P10-O1 | P10 operations at publish/deploy/import | Tovu | P7-J2 (P4 Jini) | T-D | 1.5 h | |
| P10-O2 | P10 tool-failure counter, queue depth, gen_ai | Jini | P4-J4 | J-C | 1.5 h | |
| P10-O3 | P10 browser adapter off by default | Jini | — | J-A | 1.5 h | G7-14 (rec: off) |
| P10-O4 | P10 outbox worker trace (test-only) | Tovu | — | T-B | 0.5 h | |
| P10-S1 | P10 list-cursor truncation sweep | Tovu | — | T-B | 2 h | |
| P10-S2 | P10 lost-update stages | Tovu | P8-T2 | T-D | 2 h | |
| P10-S3 | P10 abort-before-write sweep | Tovu | — | T-B | 1.5 h | |
| P10-S4 | P10 `$`-replace codemod + audit fix | Tovu | — | T-B | 1 h | |
| P10-S5 | P10 translations sweep | Tovu | — | T-B | 1.5 h | |
| P10-S6 | P10 Jini source-map + ui a11y menus | Jini | — | J-B | 2 h | |
| P10-S7 | P10 Knip + duplication re-measure | both | after P9 lands | late | 2 h | |
| P10-E1 | P10 Jini env schema helper + guard | Jini | — | J-A | 1.5 h | |
| P10-E2 | P10 Tovu env schema + check | Tovu | P10-E1, coordinate P9 renames | T-D | 2 h | |
| P10-M1 | P10 .mov/.m4v + one limit (Jini) | Jini | — | J-A | 1 h | |
| P10-M2 | P10 one limit + HEVC note (Tovu) | Tovu | P10-M1 + P7-J2 | T-D | 1.5 h | G7-5 |
| P10-M3 | P10 transcode over 50 MB (port + plugin + tool) | Jini→Tovu | P10-M1 | J-B / T-E | 4 h | G7-14 ffmpeg bundling (rec: no) |
| P10-M4 | P10 media grid cursor paging | Tovu | — | T-C | 1.5 h | |
| P10-M5 | P10 media description for search | Tovu | — | T-C | 1.5 h | |
| P10-V | P10 group 8 verification passes | local | — | local | ~2 h | |
| P10-U1 | P10 site-update contract | Jini | — | J-B | 1.5 h | |
| P10-U2 | P10 update-available check | Tovu | P10-U1 + P7-J2 | T-E | 1.5 h | |
| P10-U3 | P10 update flow with backup/gate/rollback | Tovu | P10-U2 | T-F | 2 h | |
| P10-U4 | P10 desktop + self-hosted update path | Tovu | P10-U3 | T-G | 2 h | |
| P10-H1 | P10 output-schema validation | Jini | — | J-A | 1.5 h | |
| P10-H2 | P10 actor kind on mutations/events | Jini→Tovu | — | J-B / T-D | 2 h | |
| P10-H3 | P10 read-only two-sided conformance | Tovu | — | T-B | 1 h | |
| P10-H4 | P10 kill-switch completeness | Tovu | P3 | T-G | 1 h | |
| P10-H5 | P10 per-principal discriminator | Jini | — | J-B | 1.5 h | |
| P10-H6 | P10 event-handler idempotency policy | Jini | — | J-B | 1 h | |
| P10-C1 | P10 per-CLI def folders | Jini | — | J-A | 2 h | |
| P10-C2 | P10 xAI media provider → plugin | Jini→Tovu | — | J-B | 2 h | scope: media only or also chat? |
| P10-Q | P10 group 7 owner decision batch (14 questions) | — | owner | — | — | all listed in P10 with recs |

Batch key: **J-A…J-C** Jini waves (J-A first, all independent); **T-B…T-H** Tovu waves in dependency order (every step in one wave can run in parallel, max 2 implementers at once per owner rule); **release** = owner-gated; **local** = owner's machine with Opus + Chrome/Electron.

## Owner questions (collected; each plan has the reasoning)
P1: none. P2: publisher-update list retention; multi-revision fixtures from real 0.7.2 sites. P3: sites started on open; approval across quit; BYOK routines. P4: none (all decided 11-21). P5: Q4 design pins; old-build rollback. P6: cached old visitor loaders; `client_directive` as a CUSTOM event. P7: release go; Apple agreement; combine-12 Tovu decisions 1–3, 5. P8: C043 SDK-only; dispatch prefix; title scrub; C026, A308, A310, A348, A450. P10: group 7 (14 items) and xAI scope.
