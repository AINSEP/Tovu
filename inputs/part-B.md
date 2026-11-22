PART B PARTIAL: rows marked NOT-CHECKED were not looked up on the bases (each carries a best guess); all HIGH/security/judge-verified items in lines 974–1467 were checked.

Bases: Tovu `origin/integ/merge-11-2026-11-21` (311d26dfa6), Jini `origin/integ/merge-12-2026-11-22` (6b8e0d48a). Path prefixes: `W/` = Tovu apps/website/src, `A/` = Tovu apps/admin/src, `D/` = Tovu apps/desktop/src, `J:` = Jini packages/. The two prior triage files cover other entries (1315+ of the live list); only their 1460 (redirect wildcard bound) row was reused.

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
