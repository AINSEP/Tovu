# Provider wave 2 — FIX 2 run report (BRIEF-FIX2.md)

> Jini pushes: `cloud/prov-wave2-jini`. Tovu pushes (code + this report): `cloud/prov-wave2-tovu`. Every fix was red first (shown below), then green.

## Per item

| # | Finding | Status | Commit |
|---|---|---|---|
| 1 | HIGH Jini `fanout.ts:24-30` exactly-once app callback | **DONE** | Jini `51eddca1` |
| 2 | HIGH Tovu `provider-config-source.ts:61-71` atomic settings + secrets | **DONE** | Tovu `4cda7be1` |
| 3 | MED Tovu `project-store.ts:58-63` key publication + LOW key-file policy + LOW WAL | **DONE** | Tovu `f6502def` |
| 4 | MED Jini `posthog.ts:58` identify attribution | **DONE** | Jini `843e889d` |
| 5 | MED Jini `core-boundary.test.ts:71` raw-text prefilter | **DONE** | Jini `bcbfbea5` |
| 6 | MED Tovu `provider-plugins.ts:125-131` legacy `plugin:<id>` credentials | **DONE** (re-entry notice) | Tovu `8a59eb36` |

### 1. Fan-out: app callback runs exactly once, and its recorded outcome wins (Jini 51eddca1)
- **Fix:** `containedScope` records the callback's outcome (`{ok, value} | {ok:false, error}`) the first time the tracker calls it. A second call replays the recorded outcome and does not run app work again. After `run()` returns or throws, the caller always gets `once()`: the recorded outcome, or the work run unscoped if the tracker never called it. So a tracker that swallows the error, or returns a different value, cannot hide or change what the caller gets. A promise the tracker returned in place of the recorded one gets a no-op rejection handler, so dropping it can't cause an unhandled rejection (the Sentry-style wrapper case).
- **Test:** `observability-operations.test.ts` › "app work runs exactly once and its recorded outcome wins…": `run(fn){fn(); return fn()}` → 1 execution, value `ok:1`; a catch-and-return tracker → the app error still reaches the caller; a replacing tracker → the real value; a wrapper promise that rejects → no `unhandledRejection`.
- **Red first:** `calls` was 2 ("the second call replays the recorded outcome").
- **Mutation proof (all killed):** no rejection handler on the dropped promise → 1 test fails (unhandled rejection); always re-run inner → 3 fail; return the tracker's value instead of the recorded one → 2 fail.
- Coverage `fanout.ts` 100/100 lines/branches; diagnostics suite **789/789**; tsc clean.

### 2. Settings + secrets: one row, one atomic write, one snapshot read (Tovu 4cda7be1)
- **Fix:** the provider config is a single plugin-state row, `provider.config` = `{settings, secrets}`, in the same sealed `secrets_vault` row shape. One revision-checked vault `put` is a single atomic write, so a save lands whole or not at all. One `get` is one snapshot, so a reader can never pair the old endpoint with the new secret. I used one row rather than a multi-row `applyBatch` plus a re-checked read: it is the smallest change that makes both properties hold by construction.
- **Trade-off (documented in the file header):** the admin card's public read (`readSettings`) now opens the envelope that also holds the secrets. It returns secret **names** only; no value leaves the function.
- **Tests (`provider-config-source.unit.test.ts`):** "a save that fails part-way leaves the previous settings + secrets pair whole": every store write after the first one of the next save fails, and the read is still a whole pair. "a read racing a rotation never pairs the old endpoint with the new secret": a full rotation commits between the reader's store reads.
- **Red first:** partial save → `never the new secret with the old endpoint`; race → `read a mixed pair: {"settings":{"endpoint":"https://old.example"},"secrets":{"headers":"new=2"}}`. The old two-row code is the mutant, and both tests kill it.
- Coverage `provider-config-source.ts` 100/100. Boot integration test (real composition, project.db across two sites) still 3/3.
- **Note:** rows saved in the two-row format by the previous fix lane (`provider.settings` / `provider.secrets`) are not read. That format existed only on this unmerged branch for about a day. Re-saving on the card fixes it.

### 3. Project key published like the site key; key-file policy; WAL (Tovu f6502def)
- **Fix (MED):** `atomicCreateSiteKeyFile` in `features/webhooks/site-key-ensure.ts` is now exported and reused, not copied. It writes a private 0600 temp file, fsyncs it, then `link(2)`s it onto the final path, and every caller reads back the winning file. The final path never exists without its bytes, so a concurrent opener never reads an empty file and a crash never leaves a damaged key. A damaged key is still refused and never overwritten.
- **Fix (LOW, policy):** `checkKeyFile` runs `lstat` on the existing key. It refuses a non-regular file (symlink or directory) and a file owned by another user (`process.getuid`; there is no owner check where that is absent, i.e. Windows). It narrows a mode broader than 0600 to 0600 instead of refusing it, since narrowing loses nothing.
- **Fix (LOW, WAL):** `project.db` gets `journal_mode = WAL` + `busy_timeout = 5000`, the same pragmas `chat-db.ts`/`content-db.ts` set. NOTE: there is no single shared SQLite init function in Tovu; each opener sets these pragmas itself, and project-store now does the same.
- **Tests (`project-store.unit.test.ts`):** "minting never exposes the final key file before its bytes are in": `fs.writeSync` is wrapped (with `syncBuiltinESMExports`) to look at the final path at the moment key bytes are written, and must see nothing; no temp file is left. "an existing key file must be a regular file owned by this user; modes broader than 0600 are narrowed": a 0644 key → 0600; a symlink → refused; an injected foreign uid → refused. "a fresh project.db runs in WAL mode". The existing damaged-key test now expects a key path that is a directory to be refused as "not a regular file", and checks that a mint write failure surfaces (`ENOTDIR`).
- **Red first:** the writer saw an empty final file while writing (`the final path appeared before the key was written`); 0644 was not narrowed; `journal_mode` was `delete`.
- **Mutation proof:** removing the chmod → 1 failure; removing the owner check → 1 failure.
- Coverage `project-store.ts` 100 lines / 96 branches. Exceptions: default-parameter branches and `process.getuid` being absent (Windows). Site-key suites 89/89 plus boot integration 3/3.

### 4. PostHog identify carries site attribution + `$groups` (Jini 843e889d)
- **Fix:** `identify` is sent as the `$identify` event itself (`client.capture`), with `properties = { $set: traits, ...attribution }` and `groups`. posthog-node's own `identify` puts traits under `$set` and puts nothing else on the event, so it could not carry attribution. Traits still set person properties, but any key the host attributes is dropped from `$set`, so traits cannot override or shadow `site_id`.
- **Test (`analytics-posthog.test.ts`):** "identify events carry the host's attribution and $groups; traits cannot override site_id". It uses the real SDK with a recording fetch: both identifies (with and without traits) carry `site_id/site_slug/environment/project_id` and `$groups.site`; `$set` = `{plan}`; "spoofed" appears nowhere.
- **Red first:** the `$identify` properties had no `site_id`.
- **Mutation proof:** removing the attribution-key filter → 1 failure; removing groups → 2 failures.
- Coverage `posthog.ts` 100/100; provider-plugins suite **163/163** (includes the packed-install `artifact.integration` and the core boundary test).

### 5. Boundary scan parses every file (Jini bcbfbea5)
- **Fix:** removed the `VENDOR_WORD` raw-text prefilter and its own test, so every source file goes through the TypeScript-parser scan.
- **Test:** "the complete scanner finds a vendor named through escaped literal text" runs `sourceOffenders` on a temp package with `import('langfuse')` and `require('\x6cangfuse')`. Both are found as `langfuse`.
- **Red first:** `[]` (both files skipped by the prefilter). Putting the prefilter back is the mutant.
- Cost: the full scan of every package now takes about 16 s, against the test's 60 s timeout.

### 6. Legacy `plugin:<id>` credentials: re-entry notice (Tovu 8a59eb36)
- **Choice:** the notice, not a migration. Mapping the old generic card (`baseUrl`/`token`/`username`) onto each plugin's declared fields would need the per-vendor mapping table that the manifest-driven boot deliberately removed from Tovu. So no mapping is "unambiguous" in neutral terms, and the notice is the smaller safe option.
- **Fix:** `legacyProviderCredentialCheck` (`provider-plugins.ts`) matches the exact label `plugin:<pluginId>` on the custom-credentials listing that never decrypts (`listCustomCredentials`). No value is read or logged. The composition wires it as `legacyProviderCredential` on the route deps. `GET/PUT …/provider-settings` adds `legacyCredential: true` only while nothing is saved the new way, and a failing check never breaks the card. The admin dialog shows a `role="note"` text: "A key for this plugin was saved in an older format that Tovu no longer reads. Enter it again here and save." (es translation added). It disappears after the first save.
- **Tests:** route unit tests ("shows a re-entry notice until new settings are saved"; "the retired-key check failing never breaks the card"); `provider-plugins.unit` (exact label only, a prefix is not a match); boot integration (the check runs over the real credential listing); admin dialog (notice shown, cleared by Save; absent otherwise).
- **Red first:** route test `legacyCredential` was undefined; admin test could not find the notice.
- Coverage `provider-settings.ts` 100 lines / 97.3 branches (the existing `req.params.* ?? ""` exceptions). Admin plugins folder **557/557**; admin `tsc --noEmit` clean.

## Measurements
- **CCN (lizard, `-C 10`):** no function in a touched file is over 10. Highest: `cardOf` 8, `nextConfig` 8, `resolveCard` 7, `ensureProjectKey` 6. `composeSiteRouteDeps` is still at its pre-existing **14** (this run added one property line, no branches).
- **Typecheck:** Tovu `tsc -p tsconfig.json --noEmit` 0; admin `tsc --noEmit` 0; Jini provider-plugins and diagnostics tsc 0.
- **Jini `pnpm guard`:** 3 violations, the same 3 pre-existing ones (daemon `tool-recovery/observability.ts` "Tovu" comment; mcp `stdio-hosting.ts` HW2 ×2).
- **Tovu wide regression:** see the run log below.

## NOT done / concerns
- Two-row provider settings saved by the previous fix lane (unmerged branch) are not read; re-save on the card.
- The admin card's public read now decrypts the config envelope (secret names returned only); that is the cost of item 2's single-row atomicity.
- No shared SQLite init function exists; WAL is set in project-store the same way chat/content openers do it.
- Legacy `plugin:<id>` rows are not migrated or deleted, only flagged; the owner re-enters the key.
- Setup notes for the next run: the Tovu `link:jini` script needs `JINI_PACKAGES_DIR=/home/user/Jini/packages`; better-sqlite3 needs `npm run build-release` (its install script is blocked by `allowScripts`); `packages/sdk` needs `tsc -p` while linked; `apps/admin` needs its own `npm ci`.

## Commits
Jini `cloud/prov-wave2-jini`: 51eddca1 · 843e889d · bcbfbea5.
Tovu `cloud/prov-wave2-tovu`: 4cda7be1 · f6502def · 8a59eb36 (+ this report).

## Run log
- 01:58Z STARTED. Tovu `w2fix2` @ origin/cloud/prov-wave2-tovu (35876719), Jini `w2fix2` @ origin/cloud/prov-wave2-jini (03cc91e0). Node 24.22.1; Jini install + build; Tovu `npm ci` + link.
