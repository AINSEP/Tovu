# REPORT-B — Stage B FIX (Opus)

## 2026-10-25T09:21:11Z — STARTED
Host vm, 4 cores/15 GB. Tovu HEAD 9ef8916b (overnight = origin/cloud/overnight-1024-tovu). REPORT-A.md present with "STAGE A DONE 08:51Z". Starting SETUP (node24, Jini clone, installs), then fixing NEW test failures in Stage A order.

## 2026-10-25T09:32:48Z — PROGRESS
Setup OK (all installs exit 0). 7 fixes pushed so far: 02859f7b f07e9e58 1247b928 e4a5280e 431b1af3 445019ab 69199ef3. Continuing.

## Fixes (12 of 12 cap): all on cloud/overnight-1024-tovu, Tovu only, no Jini edits
"Before" = the failure I reproduced on this host before the change, unless marked "(Stage A only)". "After" = the touched files re-run with node:test (`--test-concurrency=1 --experimental-test-module-mocks`) or admin vitest (`--maxWorkers=2`), plus root `tsc -p tsconfig.json` (0 errors after every website change) / apps/admin tsc (0) where source was touched.

| # | commit | what was wrong (file:line) | change | before → after |
|---|---|---|---|---|
| 1 | 02859f7b | `features/member-login/oidc-login.ts:210` sealed the email continuation through the codec wrapper's `.seal({ plaintext })`. check:seal-aad can't see the aad there, so the REGRESSION test and the CLI check went red | extracted `sealState({ deps, plaintext, aad })` and call it with the same `continuationAad(...)`. Same bytes, same aad | seal-aad-invariant 2 fail → 20/20; member-login 67/67 |
| 2 | f07e9e58 | `cli/__tests__/integration/owner-store.integration.test.ts:190` spawned the CLI with `{...process.env}` (the test was wrong; this breaks the coverage-env wiring contract) | env goes through `childProcessCoverageEnv(path.join(home,"child-coverage"))` with the same HOME overrides | wiring 1 fail → 30/30 (wiring + owner-store) |
| 3 | 1247b928 | `features/mail/attempts.repo.ts:8` imported a type from `server/runtime/boot/mail-delivery-policy.ts` (features-no-server-imports boundary) | `MailAttemptObserver` type now lives in features/mail; the server policy imports it from there | boundary 1 fail → pass; mail + boot mail tests 123/123 |
| 4 | e4a5280e | `features/trash/__tests__/tool-registrations.test.ts:370`: the hand-written `supported` list predates email-template going to Trash (14d6d258). Test was wrong | added `"email-template"` | 1 fail → 21/21 |
| 5 | 431b1af3 | `features/member-login/link-service.ts:147,150` used `deps.transaction(() => …)`, which the no-raw-sqlite ratchet reads as better-sqlite3's sync transaction (0 → 2) | `async () =>` (same promise) | ratchet fail → pass; member-login 73/73 incl. ratchet |
| 6 | 445019ab | `assistant/__tests__/credential-guidance.unit.test.ts:12` pinned vendor names that the deliberate vendor extraction 16b45b86 removed from core copy. Test was wrong | expects the shipped category wording | 1 fail → 1/1 |
| 7 | 69199ef3 | `assistant/__tests__/tool-registrations.members.test.ts:146`: the test parsed the retired `/auth/magic?token=` link. The shipped link is `/signin#magic=…` (`features/members/write-service.ts:268`, other tests aligned in 4b70eb53). Test was wrong | parse the fragment form (`linkParams`) | 2 fail → 21/21 |
| 8 | 7a1088c5 | `platform/db/migrations/__tests__/search-index-retired-step.test.ts:29` asserted 0028 is the head, but 0029–0035 shipped since. Test was wrong | asserts 0028 is directly followed by 0029, same as 0029's own test | (Stage A only: 2 fail) → 4/4 |
| 9 | 5e6e103a | Jini chat bebeec5a (10-23) deliberately stopped stripping stop words and title-casing derived titles. 4 admin tests and 2 website tests (`assistant-chats-routes.test.ts:53,152,202`, `assistant-chats-skill-title.unit.test.ts:42`) still pinned the old output. Tests were wrong | expectations updated to the readable titles Jini now emits | admin 4 fail → 98/98 (8 files); website 4 fail → 14/14 |
| 10 | a1256de8 | `features/site-inspection/admin-screens.generated.ts` still listed `/notifications`, which no longer exists in ADMIN_PANELS (it's `/email` now) | regenerated with `UPDATE_ADMIN_SCREENS_MANIFEST=1`, as the drift test says to | admin manifest 1 fail → 2/2; site-inspection 31/32 (the 1 fail is Stage A's `fetch_published_page`, unchanged) |
| 11 | 8bf1f8ed | `apps/admin/src/features/email/EmailSenderTab.tsx:136`: 16923551 (10-24) replaced the localized DNS state line with the raw server message, regressing ef2f820c. no_sender showed untranslated server English and requirements_failed lost its line | restored `LINE_SAYS_IT_ALL` and the line + detail join. The shared SenderDomain verdict from 16923551 is kept | EmailTabs 4 fail → email 140/140 (13 files) |
| 12 | 52ac82e5 | `cli/__tests__/integration/init-storage.integration.test.ts:82` expected a blank PGlite site to have no posts. 4889f880 (10-24) deliberately seeds `page-blog`. Test was wrong | expects `["blog"]` | (Stage A only: 1 fail) → 6/6 |

**Fix 12, desktop half: NOT PUSHED.** The same stale expectation is at `apps/desktop/src/site-dir-store.test.ts:563`. Patch: expect `[{ id: "page-blog" }]` after spreading the null-prototype sqlite rows, which makes the file 49/49 locally and desktop tsc ×4 = 0. The patch is in this run's local stash and is reproduced here. The push was refused by the desktop pre-push gate, and bypassing it is forbidden: the full desktop suite also fails on (a) 2 renderer tests needing a Playwright Chromium build absent from this image (`chromium_headless_shell-1228`; ENV) and (b) `src/nested-sites-migration.test.ts`, which crashes at load: `apps/website/src/platform/site-dir/local-site-supervisor.ts:13` uses a TypeScript **parameter property** (`constructor(readonly code: string)`), and Node strip-only mode rejects it (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). The same class of bug was fixed in e91ab310. This is a real NEW bug, not fixed because of the 12-fix cap: make it an explicit field. Stage A's desktop gate summary did not report (a) or (b).
```
-    assert.deepEqual(db.prepare("SELECT id FROM posts").all(), []);
+    assert.deepEqual(db.prepare("SELECT id FROM posts").all().map((row) => ({ ...(row as object) })), [{ id: "page-blog" }]); // 4889f880: blank sites keep the Blog listing page
```

## Not fixed (needs owner, or out of scope)
**Security / product decisions**
- **`features/database-transfer` exclusions:** `members (password_hash)` is a core table with a secret-shaped column that the database transfer still copies. Decide: exclude it, or reviewed-allow it (member password hashes moving with the site).
- **Owner policy rows contradict each other:** `features/identity/__tests__/wiring.test.ts` (×2) says the owner policy holds only `*`. `features/settings/visitor-tools-permissions.ts:12` (review F12) registers `visitor-tools.manage` for owner AND admin, and its own unit test pins `["owner","admin"]`. One of the two rules has to change.
- **mcp-ui allowlist** (SECURITY-CRITICAL exact-set test) has widened, and the completeness scan flags `assistant/site/visitor-confirmations.ts:42` (an exchange opened with a dynamic `binding.executionId` toolId), plus two non-exchange `.open(` calls in `oidc-login.ts` (`stateless.open`, continuation codec `open`). The exemption map is security gate config.
- **cross-site-read-catalog:** visitor-tools tools (`visitor_tools_list`, `visitor_tool_save`, `visitor_tool_delete`) are unclassified (cross-site vs EXCLUDED).
- **no-vendor-in-core:** `anthropic` (alias `claude`) count went 20 → 23 in the assistant/settings scope. The exception totals are "reviewed, no automatic approval".
- **worker-import-graph:** handlebars 155/150 and liquid 113/110 modules. The extra modules come from Jini cms `widgets/html/plugin-export.ts` (T1 embeds, 10-25), which pulls `consent/types` + `html-embeds` + `markers/*`. This is the same root as the known cms subpath-isolation item. Either raise the budget or slim the Jini import.

**Behaviour / schema questions, not mechanical**
- **postgres-baseline (PGlite):** `schema.postgres.ts` has no definitions for tables that migrations create (domain_binding, mail_activity_attempts, mail_capture, mail_feedback_inbox, mail_send_ledger, mail_suppression, mail_suppression_removals, search_index_*, site_consent_*). Also `publish_history.config_fields_json` is `text` in step 0016 but `jsonb` (`jsonText`) in the schema file. vault-boundary-parity and commerce-strip-parity catalogs fail the same way, from tables added since.
- **content_read schemas** (`content_post` lacks `fields`, `menu` canonical id) and the **tool-input gate order** (`pages_write_region` with `{slug}` now reports "regionId is required" before "Unknown input 'slug'"). These look like Tovu ↔ linked-Jini-branch behaviour drift. Not traced.
- **external-mcp-oauth:** `provider 'connection-higgs' declares no supported grants` is thrown by Jini `oauth/registry.ts:18`. Probably skew.
- **durable-runs recover** (`waiting` vs `finalized`), the assistant-chat-recovery-bounds timeouts, site-consent / theme-page-preview / pages route status mismatches, and agent-daemon outbox: behavioural, not traced in this stage.
- **`*.unrun.integration.test.ts`** (member-magic-link ×10, credentials ×2): files marked "NEVER EXECUTED; expectations unverified". They still parse the retired `/auth/magic?token=` link. These are authoring debt, not regressions.
- **AssistantDock chat-settings** (owner default grant switch not checked), the **consent-i18n** untranslated "About dynamic code" string, the **trash-i18n** key list, the remaining **i18n-parity** `has no untranslated copy` tests, **AG-UI stream translator**, **bubble-theme**, and **404-run-terminalize** were not looked at (cap). Translations need copy decisions.
- **Jini db/platform/sdk peer ranges** (`^0.6.10` vs the pinned `^0.4.0 || ^0.5.0` / `^0.5.6`): version-pin decision.

**ENV / pre-existing (listed, not chased)**
- **dead-path-sweep:** missing gitignored `development/coverage/` and `ADS-memory/.local-artifacts/` in a fresh clone. It also reads `sonarjs/cognitive-complexity` rule names as paths. That last part is a scanner false positive; it may need its own small fix.
- `pg-fixture`/psql and all `*.postgres.test.ts` (no Postgres), desktop renderer Playwright (no matching Chromium), s3-compatible plugin `Unknown TOVU_MEDIA_BLOB_STORE 's3'` (not checked; likely needs the plugin activated or linked).

**Not reached because of the 12-fix cap:** item (2) type errors (`tsconfig.tests.json`, 344 errors; prod tsconfigs are clean) and item (3) the complexity refactors. Coverage gaps are not addressed (out of scope).

## Limits
- Only the touched test files were re-run, not full shards. A fix could still break an untouched test elsewhere; the CI/next verify stage is the check. The prod `tsc -p tsconfig.json` was re-run after each website source change (0 errors). tsconfig.tests.json was not re-run.
- Fixes 8 and 12: the "before" failure comes from Stage A's run, not my own reproduction.

STAGE B DONE 2026-10-25T09:48:11Z — wall ≈ 27 min (start 09:20:56Z); tokens ≈ 0.25M of 1.8M cap (no subagents). Stopped at the 12-fix cap.
