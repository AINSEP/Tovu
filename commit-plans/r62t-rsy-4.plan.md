# Tovu owner decisions · execution handoff

Tovu base is `integ/merge-10-2026-11-21` at `0973a5fdc8`. Jini base is `origin/integ/merge-10-2026-11-21` at `de4e555b9`. The executor anchors below use those bases. I exceeded the 90-lookup cap while recovering missing references and reading truncated results. I stopped lookup work and left Q2 and Q4 partial. No files changed and no verification commands ran.

## Disposition

| ID | Disposition | Evidence and reason |
|---|---|---|
| SHARE-ZIP | READY-FOR-CODEX | Combine-9 recorded three regressions from the unconditional refusal. On the current base, the owner download returns 409 and acknowledgement makes a warned ZIP eligible for token delivery. Both need to change to implement the owner decision. |
| Q3 · Private Git backup | READY-FOR-CODEX | `backup-service.ts:637–655` collects warnings before push. `:696` starts the upload. The round-trip test currently expects the warned file in the repository. |
| Q2 · Private Git restore | NEEDS-DECISION · PARTIAL | **Should the first restore accept an owner-uploaded archive of the backup folder, or fetch directly from the connected private repository?** Recommend owner upload first. The provider contract at `source-control/provider-module.ts:158–163` has inspect, upload, and commit operations. The verified importer consumes the separate v2 share format. |
| Q4 · Import history and replay | OPUS-CLOUD · PARTIAL | Replay, visible listing, interrupted-import recovery, and staging maintenance all scan the registry today. Backfill, expiry, and rollback require a coordinated storage and caller change. The acceptance contract is below. |
| WORKER-JINI | READY-FOR-CODEX | All three render declarations already exist as CMS leaves at `de4e555b9`. The Jini change adds direct package entries. |
| WORKER-TOVU | READY-FOR-CODEX | Combine-10 traced the seven red graph cases to the named imports. Dispatch after a packed Jini candidate supplies the three new exports. |
| ARCH-CYCLE | READY-FOR-CODEX | Combine-10 B3 proved the emitted `custom-credentials <-> source-control` pair gone. The baseline still lists it at `:306`. |
| ENGAPS-T2-PREP | READY-FOR-CODEX | The provider-span test callback is 80 lines. The identity re-seed callback is 73. T2 touches both, so the hard 50-line limit requires splitting both. |
| ENGAPS-T2 | READY-FOR-CODEX | The executor report confirms T2 made zero edits. All 16 synchronous fixture calls are still present on the base. |
| PERFOBS-T7 | READY-FOR-CODEX | T7 is outstanding. The `tv-po` report lists T2 and T4–T6, and the merged backup job still calls `pushPlannedBackup` directly at `:780`. |

Evidence for the share regressions, graph traces, and cycle ratchet comes from [combine-9](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-r62t-rsy-4/cloud-results/combine-9-tovu.md) and [combine-10](/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/c-r62t-rsy-4/cloud-results/combine-10-tovu.md).

## READY executor sheets

`W` means `apps/website/src`. Before every edit, apply the job’s hard rules and the named scope of its sheet. Add only named declarations, cases, comments, and mutations. Move statements and their comments verbatim. Keep existing pads and callback signatures unless the sheet explicitly changes a callback to `async`. Reread the diff, delete anything outside the sheet, and record those deletions in root `COMMIT-PLAN.md`. The combine runner executes tests, mutations, and packaging checks.

### WORKER-JINI · Jini · `de4e555b9` · 0.9k edit tokens

**Tests first.** In `packages/cms/src/__tests__/integration-package.contract.test.ts`, beside the export-source check at `:94`, add one case asserting that the three subpaths below have the exact `types`, `import`, and `default` targets shown. Use its existing parsed manifest at `:7`. Removing any one export entry must turn the case red. Combine also imports each named symbol from the packed CMS candidate.

**Edit.** In `packages/cms/package.json`, add these keys in `jini.entries` beside their parent entries at `:38`, `:72`, and `:98`. Classify taxonomy and forms as `universal`. Classify media HTML as `node`, matching its current public parent. In `exports`, after the corresponding blocks starting at `:337`, `:507`, and `:637`, set `types` to the listed `.d.ts` and both executable conditions to the listed `.js`.

| Key | Existing declaration under `packages/cms/src` | Targets under `./dist` |
|---|---|---|
| `./taxonomy/render-entry` | `taxonomy/render-entry.ts:10` `renderHtmlTaxonomy` | `taxonomy/render-entry.d.ts`, `taxonomy/render-entry.js` |
| `./forms/field-length-caps` | `forms/field-length-caps.ts:23` `fieldMaxChars` | `forms/field-length-caps.d.ts`, `forms/field-length-caps.js` |
| `./widgets/html/media-html` | `widgets/html/media-html.ts:162` `renderMediaRawHtml` | `widgets/html/media-html.d.ts`, `widgets/html/media-html.js` |

These are additive manifest entries. Existing source and test imports keep their lines. The consumer changes are all in WORKER-TOVU. Debt rows and browser look are none. Record the three API additions in `COMMIT-PLAN.md`. STOP if an entry needs a new build entry point, wrapper source file, or dependency.

### SHARE-ZIP · Tovu · `0973a5fdc8` after merged `tv-sharezip` · 2.3k edit tokens

**Tests first.**

- `W/features/site-backup/__tests__/credential-warnings.integration.test.ts:54`, “export keeps database values and complete plugin packages; download requires a durable acknowledgement.” Extract `:55–71` verbatim into private `prepareWarnedShareFixture({ t }: { t: TestContext })`, returning `{ directory, plan }`. Add `type TestContext` to the existing `node:test` import. Configure the backend at `:79` with `delivery: async () => undefined`. Remove the former provider fake and upload assertions. Assert the owner GET at `:101` returns **403** with the existing `ACKNOWLEDGE_CREDENTIALS` payload. Keep the durable acknowledgement, repeated POST, byte-equal authenticated download, authorization, and revocation assertions. Require the token lookup to stay null after acknowledgement. Restoring the unconditional full-ZIP guard or the 409 response must turn this case red.
- `W/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts:87`, both `inSite` and `appData` variants of “exports and imports contain no saved keys or inherited grants.” Use the existing cases as written. Restoring the unconditional full-ZIP guard must turn both red.
- `W/features/site-backup/__tests__/share-backend.unit.test.ts:75`, change the existing full-share refusal case to return a concrete `ShareDelivery` from its mock. Assert one delivery lookup, zero uploads, `UNSAFE_FILE` with the existing message, and an empty registry. Removing the provider-only refusal must turn it red. At `:164`, change the existing static fixture case to require a saved ZIP with `needsAcknowledgement: true`, a credential warning, and `url: null`. Restoring the static guard must turn it red.
- `W/server/inbound/public-http/routes/__tests__/site-share.unit.test.ts`, add “an acknowledged credential-warned ZIP is refused by the public token route.” Reuse `shareDir`, `serve`, `DOWNLOAD`, and the existing `receiveSiteShareArtifact` import. Seed a real registry with the matching token and filename, ZIP bytes, and a warning. Persist the row with `needsAcknowledgement: false`. Require HTTP 404 and no attachment header. Removing the warning predicate from `servesToken` must turn this case red.
- In `apps/admin/src/features/sites/__tests__/site-transfer-credential-warnings.unit.test.tsx:132,228,230`, align the mocked and expected acknowledgement status with 403. The server status mutation is covered by the integration case.

**Edit.**

1. In `W/features/site-backup/share-backend.ts`, delete the call at `:165` inside `exportStaticShare`. In `exportBackupShare`, move the call at `:185` to after the existing `bounded.throwIfAborted()` at `:188` and before `createSiteShare`, guarded by `if (delivery)`. Keep `requireNoShareCredentialWarnings:135` and its refusal message. This uses the existing destination selection. Static and full ZIPs with no selected provider are owner downloads. A full ZIP with a selected provider is a delivery request.
2. At `share-backend.ts:241`, resolve stored delivery during `acknowledgeShare` only when the pending row has storage and no credential warnings. In `W/features/site-backup/share-service.ts:132`, compute `const deliveryStorage = row.storage && !row.credentialWarnings?.length;` after creating `acknowledged`. Run `assertOriginalDelivery` only when `deliveryStorage` is present. Persist acknowledgement as today, then return the acknowledged row unless both `deliveryStorage` and `delivery` are present. Use `deliveryStorage.key` on the remaining delivery call. This covers pending warned rows created before the new guard. Replace the stale acknowledgement summary with the one-line note `/** Acknowledge the owner download; warned exports stay private. */` and retain the existing revocation rationale.
3. In `W/features/site-backup/share-registry.ts:139`, preserve the current token conditions and also require `!row.credentialWarnings?.length`. In `W/server/inbound/admin-http/routes/system/site-shares.ts:131`, change only the acknowledgement response status to 403. In `W/features/site-backup/tool-registrations.ts:112`, describe warnings as paths and match kinds, require acknowledgement for owner downloads, and say provider delivery refuses warned exports.
   
**Imports and records.** No production importer repoints, package entries, or debt rows. `registerPublicShareRoutes` consumes the existing `findToken` contract at `W/server/inbound/public-http/routes/site-share.ts:15`. Chrome owes warned owner GET → acknowledge → download, warned provider refusal, and a clean public download. STOP if a new selector is required, a warned row can enter provider upload after the named changes, or the owner test still exceeds 50 lines after the extraction.

### Q3 · Tovu · `0973a5fdc8` · 0.9k edit tokens

**Tests first.** In `W/features/site-backup/__tests__/integration/archive-round-trip.integration.test.ts:106`, use the existing test body for clean and warned source cases. In the clean case, remove `themes/static/site/credential.js` from `f.siteDir` before planning. Keep the existing inventory, portable scope, and saved-key assertions. Delete the old warned-byte and warning-on-success assertions at `:119–121`. For the warned case, retain the file, require a successful plan, then assert the exact refusal result from the push. Require `f.github.writeRoutes()` and `f.github.blobContents` to be empty and the branch tip unchanged. Return from that case before the clean file assertions. Removing the guard must turn the warned case red.

**Edit.** In `W/features/site-backup/backup-service.ts`, insert the guard in `pushPlannedBackup` at `:695` after the repository and parent checks and before `uploadBackupPlan`. If `plan.credentialWarnings?.length`, return `pushRefusal({ ok: false, code: "UNSAFE_FILE", message: "The export contains files with possible credentials. Remove the credentials and export again." })`. Keep the existing push result type and planning warnings. The existing deferred-file freshness checks still apply.

`pushSiteBackup` imports remain at `W/features/site-backup/tool-registrations.ts:22` and `W/server/inbound/admin-http/routes/system/site-backups.ts:8`, and in the tests at `archive-round-trip.integration.test.ts:13` and `push-cancellation.unit.test.ts:10`. No package entry, debt row, or browser look. STOP if a provider write precedes this guard or the clean fixture has a second warning source requiring unrelated fixture edits.

### WORKER-TOVU · Tovu · `0973a5fdc8`, after Jini narrow exports · 1.1k edit tokens

**Tests first.** Use the existing `W/server/inbound/public-http/http/site/__tests__/worker-import-graph.test.ts` cases at `:140,145,241,257`. Combine runs the Handlebars and Liquid source/runtime cases, public pages, products, and member pages against the packed candidate. Target is 26/26. Mutate each of the first three imports back separately to recover a worker failure. Restore the SEO barrel to recover the pages failure. Restore the post barrel to recover the pages, products, and member-pages failures.

**Edit.** Replace the imports at these exact locations.

| File under `W` | New line |
|---|---|
| `server/inbound/public-http/http/site/render/content-html.ts:11` | `import { renderHtmlTaxonomy } from "@jini-ai/cms/taxonomy/render-entry";` |
| `server/inbound/public-http/http/site/render/contact-form-widget.ts:4` | `import { fieldMaxChars } from "@jini-ai/cms/forms/field-length-caps";` |
| `server/inbound/public-http/http/site/render/widgets/media.ts:13` | `import { renderMediaRawHtml } from "@jini-ai/cms/widgets/html/media-html";` |
| `server/inbound/public-http/routes/site/pages/extra-head.ts:1` | `import { createSeoPageHeadHook } from "#src/features/seo/page-head-contributor";` |

At `W/features/widgets/deps.ts:1`, replace the post barrel import with:

```ts
import { updatePost } from "../post/post-update.js";
import { restorePostForward } from "../post/post-trash.js";
import { findPublishedPostBySlug, createPublicPostReader, findPublishedPostById } from "../post/post-read.js";
import { PostVersionConflictError, PostNotFoundError } from "../post/post.js";
import type { ForgetRemovedPostFn, BeforeSaveHookPort, PostRecord, PostRepoPort } from "../post/contracts.js";
```

In `.dependency-cruiser.mjs:690` append `post-update` and `post-trash` to `PUBLIC_ENTRIES["features/post"]`, alongside the existing `post`, `post-read`, and `contracts` entries. Those are the value owners behind `post/index.ts:5,8`. The graph tests exercise entry loading and need no import changes. Other uses of these symbols keep their existing imports. The only boundary manifest delta is those two public entries. Chrome owes a rendered page with SEO head and a widget, plus the existing static form look. STOP if either post leaf still loads the forbidden graph, another import must move, or the package pin or lockfile must change inside this executor.

### ARCH-CYCLE · Tovu · `0973a5fdc8` · 0.3k edit tokens

Use Combine-10 B3’s runtime comparison as the baseline witness. In `development/scripts/check-architecture.baseline.json:302–306`, remove `features/custom-credentials <-> features/source-control` from `moduleCycles.pairs` and change `mutualCycleCount` from `2` to `1`. Keep `largestScc: 2` and `assistant <-> features/external-mcp`. The combine acceptance check is one live pair and zero removed baseline pairs. Temporarily restore the row and count to confirm the removed-pair check fails. The existing runtime propagation ratchet is a separate result.

This is the only debt row for the sheet. No production or test import changes and no look. STOP if the emitted graph shows the pair again or another baseline field needs a change.

### ENGAPS-T2-PREP · Tovu · `0973a5fdc8` after merged `tv-engaps2` · 1.3k edit tokens

**Tests first.** Use the existing identity re-seed and “Constitution Article VIII proof” cases in `W/cli/__tests__/integration/serve-command.integration.test.ts`. The combine mutation omits the provider installation/settings helper call. The existing span assertion must fail. There is no new test case.

**Edit only that test file.** Extract these blocks as private async functions, immediately before the corresponding test. Preserve the blocks verbatim apart from indentation required by the move. Replace each block with one awaited call at the original location.

| Base lines | Function and input |
|---|---|
| `:600–632` | `seedAndConflictOwnerRole({ dir, dbPath, identityEnv })`. `dir` and `dbPath` are strings. `identityEnv` has the existing string fields `TOVU_ADMIN_USER` and `TOVU_ADMIN_PASSWORD`. |
| `:687–709` | `installOtlpProvider({ port, collector })`. `port` is a number and `collector` is `Awaited<ReturnType<typeof startFakeOtlpCollector>>`. |
| `:718–740` | `assertExportedRequestSpan({ collector, requestId })`. Use the same collector type and `requestId: string`, narrowed by the existing assertion at `:716`. |

Keep first and second boot order, the outer `finally` blocks, restart, and collector lifetime in their existing locations. No imports, package entry, or debt rows. Combine owes the real CLI/provider witness. STOP if a move requires a cast, breaks a capture, or leaves a changed function over either limit.

### ENGAPS-T2 · Tovu · after ENGAPS-T2-PREP · 0.8k edit tokens

**Tests first.** Use the existing foreign-CWD and `AC-08` seeded-route cases, originally at `:512` and `:534`, and rerun the provider witness during combine. Mutation removes `withSampleContent: true`. The seeded-route case must fail.

**Edit.** In the same test file, add `import { initSite } from "#src/server/runtime/composition/site-dir";`. At `initFixture`, originally `:218–224`, add `async`, annotate `Promise<{ parent: string; dir: string }>`, and replace only the fixture init subprocess and its status assertion with `await initSite({ dir, name }, { withSampleContent: true });`. Await all 16 fixture calls, originally `:227,240,299,316,332,352,374,395,419,468,502,513,535,596,670,751`. Make the formerly synchronous callbacks at original `:226,298,315,501` async. The two calls at `:596,670` are located by their test names after the split. Keep the `initFixture("Dir Wins")` argument and all actual serve subprocess assertions.

No other imports, package entries, or debt rows. Combine owes paired fixture subprocess counts and elapsed time on the same linked build, plus the completed serve integration run. STOP if persisted fixture shape or foreign-CWD behavior changes.

### PERFOBS-T7 · Tovu · `0973a5fdc8` after merged `tv-xd5-publish`, ordered after Q3 · 1.7k edit tokens

**Tests first.** Extend `W/features/site-backup/__tests__/push-cancellation.unit.test.ts` using `fixture:41`, `serviceDeps:65`, and `gate:25`. Add `import { createNoopObservabilityPort } from "@jini-ai/core/contracts/observability";`. Use private test helper `recordBackupOperations({ log })` to spread the existing no-op port and record operation start and end. Follow the existing fake port in `W/features/deployments/static-publish/__tests__/publish-operation.unit.test.ts:13`.

- Hold the first blob with the existing gate, poll the same job before releasing it, then finish successfully. Require one `site.backup` start and one `completed` settlement with `failed: false`. Instrument the wait instead of the job as the mutation.
- Add the operation assertion to the existing cancellation cases at `push-cancellation.unit.test.ts:87`. Cancellation settles `cancelled` with `failed: false`. Mutate the cancellation classification to `not_pushed`.
- Use the same fixture for a moved-branch refusal and for an injected rejection. The refusal settles `not_pushed` with `failed: true` and preserves its result. For rejection, a throwing getter for `loadSourceControlProviders` on the injected deps supplies a sentinel before provider loading. Require the same rejection object and one `failed` settlement with `failed: true`. Bypass the respective settlement as the mutation.

**Edit.** In `W/features/site-backup/backup-service.ts`, add private `runObservedBackupPush(required: Parameters<typeof pushPlannedBackup>[0]): Promise<PushResult>` beside `pushPlannedBackup:681`. When `required.deps.observability` is absent, return `pushPlannedBackup(required)` directly. Otherwise create `trackOperation({ name: "site.backup" })`, call `run(() => pushPlannedBackup(required))`, and settle once through the returned promise’s fulfillment or rejection handler. Success maps to `completed`. A result with `cancelled: true` or `reason: "abandoned"` maps to `cancelled`. Other unsuccessful results map to `not_pushed`. A rejection maps to `failed` and is rethrown unchanged. At `:780`, change only the `jobs.start` callback’s callee to `runObservedBackupPush`.

Existing imports and entry points match Q3. No package entry, attributes, debt row, or browser look. STOP if the implementation needs job admission, wait, cancellation, cleanup, or archive changes.

## Batched Codex jobs

### 1. Jini · proposed `codex/jini-worker-exports`

Base `de4e555b9`. WORKER-JINI contributes one sheet and 0.9k edit tokens. Queue it first in the next Jini batch with three to seven other reviewed Jini sheets. This scope supplies only one Jini sheet, so the batch is held below the four-sheet minimum. Pack and publish the candidate through the combine owner. Record the actual ref and candidate before releasing the Tovu job.

> Behaviour identical; API args (required, optional = {}) for NEW functions only; no re-export shells; no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines and complexity <= 10 (HARD). A file going over 500 lines is NOT a stop reason (owner correction 11-20: note it in COMMIT-PLAN.md and continue). STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or the function/complexity limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters; no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root. Hooks are injected as props. No vendor code in Jini domain packages (vendors live in provider packages); no specific server framework in Jini domain code (`{ app: Server }` style). Anything needing a lockfile change, a new npm dependency or a new Jini package = OPUS-CLOUD.

### 2. Tovu · proposed `codex/tovu-owner-1121`

Base `0973a5fdc8`. Seven sheets, about 8.4k edit tokens. Order **SHARE-ZIP → Q3 → ARCH-CYCLE → ENGAPS-T2-PREP → ENGAPS-T2 → PERFOBS-T7 → WORKER-TOVU**. The base already carries `tv-sharezip`, `tv-engaps2`, `tv-xd5-publish`, and the combine-10 B3 baseline. WORKER-TOVU follows the packed candidate from job 1. If that candidate is delayed, the first six sheets form a valid independent batch and WORKER-TOVU can join the next qualifying Tovu batch.

> Behaviour identical; API args (required, optional = {}) for NEW functions only; no re-export shells; no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines and complexity <= 10 (HARD). A file going over 500 lines is NOT a stop reason (owner correction 11-20: note it in COMMIT-PLAN.md and continue). STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or the function/complexity limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters; no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root. Hooks are injected as props. No vendor code in Jini domain packages (vendors live in provider packages); no specific server framework in Jini domain code (`{ app: Server }` style). Anything needing a lockfile change, a new npm dependency or a new Jini package = OPUS-CLOUD.

## PARTIAL items

**Q2 · Private repository restore.** The producer is `W/features/site-backup/sources.ts:706` and the verified entry is `import-verifier.ts:31`, called by `import-backend.ts:88`. For the recommended owner upload, the adapter reads the selected backup folder from a bounded archive, validates the v1 manifest and exact path/length/SHA-256 inventory, then maps it into the existing verified import and owner-setup flow. Check the original manifest before deriving a v2 inventory. Otherwise a changed byte could acquire a valid new digest during conversion. The restore test starts with the clean fake-provider push from Q3, imports the resulting backup, completes owner setup, and checks restored database rows, media, and plugin quarantine. The negative case changes one payload byte while retaining the original manifest and requires refusal before staging or site allocation. Removing the v1 inventory verification must turn that case red. Still to pin are the input transport and the mappings for repository media paths, plugin package selection, and backups created without a database scope.

**Q4 · Import replay and history.** Use one indexed private store under the existing import registry owner and retain its exclusive lane. Key replay by principal and request ID. Record the normalized request digest and import ID before verification begins, then update the compact outcome with the lifecycle transition. Retain the fence for 365 days from first acceptance. A same-digest retry returns the current or stored outcome, and a different digest returns `REQUEST_CONFLICT`. Replays never extend retention. Retain terminal history details for 30 days from settlement, using `createdAt` when backfilling a legacy row with no settlement time. Page by descending `(createdAt, importId)` with an opaque cursor and principal filter. Leave active owner-setup and interrupted-creation records under their existing lifecycle deadlines.

Backfill once under the import lock, before serving indexed reads. Preserve existing digests, derive a digest from upload IDs or an intact legacy URL, and preserve an origin-only legacy key as a conflict fence when its original request cannot be reconstructed. Import active rows regardless of age, keep eligible visible rows and replay records independently, and mark cutover complete only after the indexed writes commit. A repeated backfill after interruption must preserve the same rows and fences. Expire visible details and replay keys independently. Serve expiry from indexed deadlines. Move payload housekeeping to the upload/stage namespace so `expire`, `requireStagingBudget`, and `reconcileInterruptedImports` cannot reintroduce a history scan. Preserve indexed active-state recovery for `verifying` and `creating`.

Tests first for replay after restart at day 31, conflict on changed input, replay expiry at day 365, tied-timestamp paging with another principal present, and interrupted backfill with a legacy origin-only key. Mutations remove the replay lookup, inclusive expiry boundary, cursor tie-breaker, or backfill completion fence. The implementation still needs the storage adapter and atomic migration pinned, plus cursor plumbing through `site-imports.ts:91`, `tool-registrations.ts:243`, and the admin transfer UI. The two architecture chapters named in the workspace instructions were absent at the supplied paths, so this storage design is an acceptance contract for the migration review.
