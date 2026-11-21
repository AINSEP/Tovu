# r62t-rsy-7 · Merge-10 executor sheets

Tovu base is `integ/merge-10-2026-11-21` at `0973a5fdc8`. Jini base is the same branch name at `de4e555b9`. The sheets below use those bases in place of the older merge-6 template.

| ID | Disposition | Reason |
|---|---|---|
| **CRED-LABELS** | **READY-FOR-CODEX** | Jini already declares `Search — Meilisearch` and `Mail — Resend API`. Tovu’s search resolver, default mail label, mail cache fingerprint and provider status need to agree with those declarations. Read compatibility preserves credential IDs and attachments. |
| **GITHUB-MANIFEST** | **READY-FOR-CODEX** | The GitHub committer already scopes ownership by folder, checks recorded blob SHAs before deleting files, and publishes with a fast-forward ref update. Add a neutral predecessor manifest input in Jini and supply the Tovu path from the host. |
| **PLUGIN-ID-UPGRADE** | **OPUS-CLOUD · PARTIAL** | The identity check rejects a different qualified ID in the same slot before the host admission callback runs. The seeded digest ledger identifies what a previous boot published, while the installer explicitly documents that installed bytes can have changed since then. A verified predecessor and a restored-install rehearsal are required before an executor can move the revision. |
| **FED-RELOAD** | **RETIRE** | No live production mount or caller of `POST /api/federation/reload` surfaced on either pinned base. The serving app registers an in-process federation listener. Its integration test already proves that a newly saved connection appears in the daemon-call catalog. |

`W` below means `apps/website/src`. `JP` means `packages/agent-plugins` in Jini. Existing import lines stay in place except where explicitly listed. No sheet moves declarations between modules.

## Common brief to copy into both Codex jobs

```text
Behaviour identical except for the named owner decisions. API args (required, optional = {}) for NEW functions only. Never remove, rename, or change existing _optional = {} pads or the args rule. No re-export shells. No new deps. No new eslint-disable, @ts-ignore, as any, or as never. Functions <= 50 lines and complexity <= 10 (HARD). A file going over 500 lines is NOT a stop reason. Note it in COMMIT-PLAN.md and continue.

STOP the affected sheet and continue the others if a named declaration is missing, an unlisted PRODUCTION importer appears (git grep -n -F '<symbol>' -- apps/ development/ packages/), a cast is needed, or a function exceeds either hard limit. Unlisted TEST importers needing only the same repoint are fine. Record these in REFRESH.md.

MACHINE RULE: no other repo-wide scans. NO tests, builds, installs, type-checks, or linters. No codebase-memory-mcp. .git read-only. COMMIT-PLAN.md at repo root. Hooks are injected as props. No vendor code in Jini domain packages. Vendors live in provider packages. No specific server framework in Jini domain code. Anything needing a lockfile change, a new npm dependency, or a new Jini package = OPUS-CLOUD.

Read NO OVER-ENGINEERING before every edit. Make only the named edits. Add only the named declarations, input fields, and test cases. Add no empty optional pads, speculative guards, fallback paths, retries, or scaffolding. Move any named code and its why-comments verbatim. Add no comments except the named neutral note. Write the failing regression case first for each bug. Actual test and mutation execution belongs to combine. Re-read the diff, delete anything outside the sheet, and record any deletions in COMMIT-PLAN.md.

Composition-deps gap 1 and the Jini API deprecation gate are dropped. Jini uses jini-* names and carries no Tovu compatibility literals. Put breaking changes on a BREAKS: line. @tovu/sdk stays in Tovu.
```

## Jini

### GH-J1 · Accept a predecessor ownership record · `de4e555b9` · 2.3k tokens

**Tests first.** Extend `JP/github/source-control/__tests__/commit-site.test.mjs` after `:79`. Keep `import { createSiteCommitter } from "../commit-site.mjs";` at `:6` and reuse `kitFrom`, `manifestOf` and `INPUT` at `:16–37`.

- **Canonical absent, predecessor present.** Configure branch `main`, folder `nested/site` and a test-only predecessor `.previous/managed-files.json`. Return a canonical 404 and a predecessor v2 record with one unchanged stale file and one edited stale file. Assert that both manifest requests and the stale-file verifications use the pinned parent SHA, only the unchanged stale file gets a deletion entry, and the tree writes `nested/site/.jini/managed-files.json`. Assert that the predecessor gets no tree entry and the ref update remains non-forced. **Mutation:** skip the predecessor read and return the canonical 404.
- **Canonical present.** Supply the same predecessor path and return a canonical record with an empty `files` array. Assert that the predecessor URL is never requested. **Mutation:** treat a successful empty canonical record as absence.
- **Canonical lookup rejected.** Return 500 on the canonical lookup. Assert a provider refusal with no predecessor request or write. **Mutation:** broaden the predecessor condition from canonical 404 to any unsuccessful response.

**Source.** Edit `JP/github/source-control/commit-site.mjs`:

- Extend the existing input JSDoc at `:375` with `previousManagedManifestPath?: string`. In `prepareCommitScope` at `:352–362`, prefix it with the normalized folder through the existing `kit.repositoryPaths.prefixPath` when supplied. Carry it on the existing scope. Reserve both manifest paths against export payloads and exclude both from stale-file deletion in `buildTree` at `:286–291`.
- Add the one private helper `fetchManagedManifestResponse` inside `createSiteCommitter` at `:184`, taking one required object. Use the existing `githubFetch`, encoded contents URL and headers. Fetch the canonical path first. Issue the same GET for the predecessor only if the canonical result is a response with status 404 and the scope supplies a predecessor. Use the existing response handling, parser and containment check in `fetchManagedManifest` at `:186–214` for whichever response was selected. A predecessor 404 follows the existing empty-manifest path.
- In `resolveCommitPrerequisites` at `:338–346`, choose the captured `parentSha` as the contents read ref when a predecessor is supplied. Return that read ref on the existing success value and pass it to `buildTree` at `:396` for stale-file verification. Existing callers without a predecessor keep the branch read ref. New branches retain the existing early return with no manifest reads. Keep the branch name for the ref update at `:411`.
- Feed the parsed predecessor record into the existing ownership comparison before building the first publish tree. The same fast-forward publish creates the canonical manifest with the new ownership record. This sheet uses one branch update for the cutover and the publish.

**Importers and export.** `JP/github/source-control/github.mjs:3,63` keeps `import { createSiteCommitter } from "./commit-site.mjs";` and its existing binding. The direct importer test is listed above. `JP/github/__tests__/bundled-package.test.mjs:67` continues to pin the canonical constant. Existing package entry `JP/package.json:205`, `"./github/*": "./github/*"`, already ships the provider. No API-baseline or package-manifest edit.

**STOP.** Stop if the predecessor can’t use the current decoder and path checks, a second ref write is required, or the source or test edits hit a hard function limit. Combine with the Tovu sheet against packed Jini. GitHub sandbox publish proof is listed under GH-T1.

## Tovu

### CRED-T1 · Search reads old labels · `0973a5fdc8` · 1.3k tokens

**Tests first.** Extend the vendor case in `W/server/runtime/composition/modules/__tests__/site-search.unit.test.ts:225–244`. Make its fake vault label-aware. Query with only `Tovu Search — Vendor Search` saved, then with only `Jini Search — Vendor Search` saved, then with a canonical row and an old row. Assert the selected token and lookup order. Preserve the existing no-credential and declared-key assertions. **Mutations:** remove each historical candidate independently, then put either historical candidate before canonical. Update the fixed-prefix assertion at `:119–122`, the error message assertion at `:296–301`, and the canonical direct port case at `:533–535`. The existing module import at `:20` stays.

**Source.** Set `SEARCH_CREDENTIAL_LABEL_PREFIX` at `W/server/runtime/composition/modules/site-search.ts:60` to `Search — `. Keep `searchCredentialLabel` at `:69` and its pad. In `searchCredentialsFor` at `:438–456`, do the exact existing vault lookup in this order, `Search — <provider.label>`, `Jini Search — <provider.label>`, `Tovu Search — <provider.label>`. Advance on `null` inside the existing `try`. Preserve the decrypt/repo failure behavior and the credential-key projection. The vault binding `W/server/runtime/composition/site-deps/after-assembly-forms-search.ts:118` stays in place. Update its existing label example at `:112` and the label examples in `site-search.ts:41–42,66`.

**Writer proof.** Jini’s `meilisearch/plugin.json:20–21` already supplies the label and owned API label used by the save card. Pin both to `Search — Meilisearch` in Tovu’s real card loader case at `W/server/runtime/composition/__tests__/plugin-credential-cards.unit.test.ts:120–129`. The mutation restores the stale label in the disposable Jini manifest. Update the same literal in `content/agent-plugin-overlays/meilisearch/GUIDANCE.md:8` and the required guidance token in `W/features/agent-plugins/__tests__/unit/portable-host-guidance.unit.test.ts:23`.

**Imports, debt and STOP.** No import or export edits. No manifest or baseline row. Preserve the existing search error-debt row at `development/scripts/error-gate-debt.json:1498`. Stop if the lookup would need to open a row outside the vault’s existing scopes. After combine, use Chrome to query an upgraded site with an old saved key and check the fresh save card.

### CRED-T2 · Mail sends and reports status with old keys · `0973a5fdc8` · 2.4k tokens

**Tests first.** Extend the lifecycle fixtures in `W/server/runtime/boot/__tests__/resolve-mailer-lifecycle.unit.test.ts:30,56–89`. Keep the `createResolvedMailer` import at `:20`. Give the fake adapter the canonical `Mail — Fake Mail API` label for the upgrade case. Seed each historical label in turn using the existing vault fixture. Assert that the original saved key sends, `describeProviders()` reports it as saved with its original `credentialId` and canonical display label, and an in-place token rotation is used on the next send. Add a canonical row and assert that it takes precedence. Use the existing send and status cases at `:91–102,243–256` for the fixture pattern. **Mutations:** remove each historical candidate, restore exact-only matching in `readCredentialFact`, and bind the original describe callback directly. Each must fail the corresponding send, rotation or status assertion.

**Source.**

- In `W/server/runtime/boot/resolve-mailer.ts`, add the private `mailCredentialLabels({ label })`. An undefined catalog label yields an empty list. A canonical `Mail — <label> API` yields exact candidates in order **canonical, `Jini Mail — <label> API`, `Tovu Mail — <label> API`**. An explicit label outside that shape yields itself. `Tovu Mail — Resend API` is in Jini’s pre-rename descriptor at `d9c625e6d^`. Tovu’s Resend save guidance and upgrade expectations also named the `Jini Mail —` form, so the sheet covers it.
- In `readCredentialFact` at `:136–143`, select the first candidate present in the existing workspace metadata list. Return the selected row’s actual identity, label, timestamp and vault revision to Jini’s cache. Keep one list read and zero opens in this path.
- In `createResolvedMailer` at `:159–168`, compute the ordered label list from `catalog.credentialLabelFor({ id })` for the existing `resolve` callback. Pass it as `labels` in place of `catalog` to `resolveMailCredential` in `W/server/runtime/boot/mail-provider-catalog.ts:90–102`. That function iterates the exact existing vault lookup and stops at the first saved result. Preserve its optional pad, error propagation, SMTP username requirement and returned connection shape.
- Add private `describeMailProvidersWithLegacyLabels` in `resolve-mailer.ts`, using `Parameters<typeof describeMailProviders>[0]` for its input. For each catalog label with no exact row, append a projection of the first matching legacy metadata row with the canonical label and original ID, timestamp and username presence. Pass those records to the existing `describeMailProviders`. Bind this function at `:168`. This keeps the configuration DTO and cache in agreement with send and leaves stored rows intact.

**Importers, debt and STOP.** `resolve-mailer.ts:22` is the sole production importer of `resolveMailCredential` and retains its named import from `./mail-provider-catalog.js`. It also retains `import { describeMailProviders } from "./mail-provider-configuration.js";` at `:15`. No new import, export, debt or manifest rows. Keep the canonical credential lookup cost pinned by `W/server/runtime/composition/__tests__/cost-counters.baseline.test.ts:129–151`. Stop if selection needs a different vault scope, or if implementing the projection requires altering a Jini contract. After combine, confirm in Chrome that an upgraded site shows the original sending credential as saved and sends through it.

### CRED-T3 · New mail saves use canonical labels · after CRED-T2 · 1.1k tokens

**Tests first.** In `W/features/agent-plugins/__tests__/unit/mail-provider-contribution.unit.test.ts:55–63`, expect `Mail — Postal API` and `Mail — Resend API` for defaults. Keep the `Postal key` control for an explicit label. In `W/features/agent-plugins/__tests__/unit/mail-provider-setup.unit.test.ts:94–99`, update only the default descriptor expectation to `Mail — Acme API`. **Mutation:** restore the old `defaultCredentialLabel` return value. Keep the existing card-submit proof in `W/server/runtime/boot/__tests__/mail-credential-cards.unit.test.ts:187–194`, setting its `RESEND_LABEL` fixture at `:36` to `Mail — Resend API`. Repoint the bundled Resend descriptor expectation in `content/agent-plugin-overlays/resend/__tests__/bundled-mail.test.mjs:58–64`. **Mutation:** restore the old bundled descriptor label on the packed candidate.

**Source.** In `W/features/agent-plugins/mail-adapter-registry.ts:9–10`, set `defaultCredentialLabel` to return ``Mail — ${label} API``. Update the existing comment’s label example and keep the signature and pad. Both consumers are in the same file at `:11–12,21–22`. In `content/agent-plugin-overlays/resend/GUIDANCE.md:47,60`, update the sending key label. Update the Resend assertion at `W/features/agent-plugins/__tests__/unit/portable-host-guidance.unit.test.ts:76`. The SMTP and webhook signing-secret labels are separate contracts.

**Imports, debt and STOP.** No import changes. `development/scripts/persisted-names.json:10` already pins `resend.credential.label` to the canonical value. Keep the value and the existing comparison. Stop if the packed source presents a different canonical descriptor or a write path would require changing the plugin authorization contract. After combine, inspect the Connect Resend card and its saved row in Chrome. A one-time relabel adds duplicate-resolution and rollout work here. The read path already preserves the original row, so leave existing credentials where they are.

### GH-T1 · Supply Tovu’s predecessor path · after pushed GH-J1 · 1.9k tokens

**Tests first.** In `W/features/source-control/__tests__/commit-site.unit.test.ts`, add a case beside `:340` through the existing `commitSiteToSourceControl` import at `:18`. Use `testRouteDeps`, the existing packager/export inputs and an injected `resolveSavedApiKey` returning a fake token. Have a typed adapter assert that the GitHub call receives `previousManagedManifestPath: ".tovu/managed-files.json"`, the selected folder and the selected branch. Add an absence assertion inside the existing Example Git adapter case at `:340–374`. **Mutations:** omit the field for GitHub, then supply it unconditionally. Each assertion must fail under its respective mutation.

Refresh the canonical provider fixture in `W/features/agent-plugins/__tests__/unit/bundled-github-commit-site.unit.test.ts:87–1698`. Replace `.tovu` with `.jini` only in existing manifest URL regexes, reserved-path fixtures and expected tree paths. These direct provider calls use no predecessor option, so their existing branch refs and request order still apply. The provider helper at `:17–21` and imports at `:7–11` stay. The migration-specific remote ownership proof lives in GH-J1. Record this test file’s size in `COMMIT-PLAN.md`.

**Source.** Add `readonly previousManagedManifestPath?: string;` to the existing provider `CommitSiteInput` at `W/features/source-control/provider-module.ts:44–53`. In the existing adapter call in `commitArgs` at `W/features/source-control/commit-site.ts:122–137`, supply `.tovu/managed-files.json` only when `providerId === "github"`. Preserve the folder, branch, credential and confirmation flow. The production bindings at `W/features/source-control/tool-registrations.ts:101–104,443–452` keep their imports and still call through `commitSiteToSourceControl`. Update the ownership path in `content/agent-plugin-overlays/github/GUIDANCE.md:78` to `<folder>/.jini/managed-files.json`.

**Debt and STOP.** No new package export, injection-debt or API-baseline row. GitHub’s path has no existing persisted-name registry row. Record the cutover witness in `COMMIT-PLAN.md`. Stop if the candidate package lacks GH-J1 or the dependency must change in either lockfile. Route package release and installation to OPUS-CLOUD. With the exact Jini candidate packed, publish from the confirmed Tovu flow into a sandbox branch with a nested legacy manifest. Verify a stale unchanged managed file is deleted, an edited file and an unmanaged file survive, and a second publish reads canonical ownership. The export preview is local and cannot prove remote deletions.

### FED-T1 · Delete the obsolete listener test · `0973a5fdc8` · 0.3k tokens · RETIRE companion

Delete only `W/server/runtime/composition/__tests__/app-federation-reload.observability.test.ts:1–60`. Combine-9 records the case as base-red. The obsolete assertion at `:53` expects a daemon HTTP POST from plain `createApp`.

The production refresh chain is `serving-app.ts:81` → `http-app/mount-assistant.ts:39` → `modules/assistant-byok.ts:574–580` → `modules/assistant-server-federation.ts:35–51`. The latter reads admissions and calls `toolSurface.federation.reload()` directly. The public OAuth callback sends the roster notification at `W/server/inbound/public-http/routes/external-mcp/oauth-callback.ts:169`. The daemon ownership boundary is pinned in `W/server/inbound/assistant/__tests__/agent-daemon-server.federation-runtime-wiring.unit.test.ts:8–15`.

**Proof and STOP.** Keep `new admissions appear in daemon-call catalogs` at `W/server/runtime/composition/modules/__tests__/assistant-server-federation.integration.test.ts:174–190` as the combine witness. **Mutation:** skip the normal roster listener’s `await reload({}, {})` at `assistant-server-federation.ts:50`. The second admission assertion must fail. No importer repoints, new case, debt row or browser look. Stop if a refreshed check finds a production mount or a caller that depends on the old route. Keep the standalone route and run-scoped authorization tests outside this deletion.

## Codex job batches

| Order | Job | Repo and base | Sheets and estimated executor tokens |
|---|---|---|---|
| 1 | **Jini provider batch** | Jini `de4e555b9`. `rs3-jini` is already in the base. | GH-J1, **2.3k** from this dispatch. Queue as one slot in the next 4–8-sheet Jini provider batch. This scope supplies one verified Jini sheet. |
| 2 | **Tovu upgrade compatibility batch** | Tovu `0973a5fdc8`, paired with the pushed GH-J1 branch. `tv-c7a/b` and combine-9/10 changes are already in the base. | CRED-T1 → CRED-T2 → CRED-T3 → GH-T1 → FED-T1, **7.0k** across five sheets. CRED-T1 and CRED-T3 both touch the guidance test. If GH-J1 is pending, the other four sheets can proceed. |

## PARTIAL · Installed plugin ID upgrade

Use a **Tovu-owned, journaled maintenance step** on a quiesced restored installation. Keep the exact bundled ID map in Tovu. Release the canonical bundle through normal Jini seeding. `W/server/runtime/boot/bootstrap.ts:325–350` anchors the boot handoff. In Jini, `JP/src/lifecycle/install.ts:182–206,345–350` anchors the conflict and lock order, and `JP/src/lifecycle/seed-bundled.ts:270–294` anchors the verified pack/install and preserve-existing-activation behavior.

- **Provenance owed.** Obtain the trusted pre-rename bundle and establish that each candidate’s current installed tree matches that release. The ledger and `origin: "bundled"` are inventory evidence. Use the installed qualified ID, local name and verified bytes together to select the predecessor. A third-party revision or a locally edited revision goes into the publisher-update report with its workspace, ID and reason.
- **Journal and recovery owed.** Pin the maintenance entry, ordered step ID, backup location and interruption recovery before dispatch. Move the verified blocking revision out of the live package root and seed normally. Preserve the short-name activation record, settings, data and memory. The ADR-066 content ledger at `W/platform/db/migrations/index.ts:122` has `0042` at its head. The separate B1 repair for SQL activations and saved embeds has its own persisted-reference inventory and test obligations.
- **Failing upgrade proof first.** Install a real pre-rename bundled fixture and set non-default activation and settings. Show that canonical seeding hits the same-slot conflict. Run the proposed maintenance step, then assert the original short-name state, the new qualified ID and its expected bundle digest, and a stable second run. Include an unrelated same-slot revision that stays in place and appears in the publisher list. Mutations skip the verified predecessor move and admit an unrelated predecessor. Rehearse recovery from interruption between backup and reseed before running against live installations.

The local `commit-plans-1120` and `culls-1120` refs were absent. I used the named scratchpad reports, merge-9/10 combine reports and pinned source to refresh the sheets. No files were changed and no tests, builds, installs, or type-checks were run.
