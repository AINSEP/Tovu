# r62t-dg-a · executor handoff

Nine Tovu sheets are ready. The linked-package tests cover every requested integration category. The packed-candidate gate and blocking CI comparison need OPUS-CLOUD. Webhook replay already preserves the delivery ID and fences stale settlement, so its sheet adds the crash-window test and documents the delivery contract.

Tovu anchors use `8d1a4c2742` unless a sheet names a successor. The trial clone lacked the pushed refs, so I read those branch objects in the owner’s Tovu checkout. Jini anchors come from Git objects at merge-8 `3ad0c5671` and merge-9 `fb41117be`. No files changed and no checks ran.

## Disposition

| ID | Disposition | Reason |
|---|---|---|
| 3A · Contribution filename | READY-FOR-CODEX | `tv-c7a` supplies `jini-deploy-targets.json`. The existing shipped-host case can exercise the production bundle root and require the actual Cloudflare Workers target. |
| 3B · Qualified plugin ID | READY-FOR-CODEX | Jini ships `jini/cloudflare`. Tovu’s lifecycle can seed and discover it while reading activation state under the short name `cloudflare`. |
| 3C · Package subpath | READY-FOR-CODEX | `render-site.ts:14,226` imports and calls `@jini-ai/cms/presentation/html`. An existing static-tier case reaches the call. |
| 3D · Emitted CSS | READY-FOR-CODEX | The browser test already proves success feedback is styled. Jini’s shipped Cloudflare Worker supplies the selector to test against that real page. |
| 3E · Native IPC payload | READY-FOR-CODEX | Desktop’s owned-site handler already runs through Jini’s native IPC channel. The current test fixture can connect a real Jini requester to that handler. |
| 3F · HTTP and SSE payload | READY-FOR-CODEX | The existing wire harness mounts Tovu’s real AG-UI route. `jm7-a` supplies the shipped schema-validating stream reader. |
| 3G · Packed-candidate gate | OPUS-CLOUD | Requires building, `pnpm pack`, isolated install and bundle staging, and CI wiring. The current registry-drift check targets published types and does not supply this evidence. |
| 8A · Rule and initial registry | READY-FOR-CODEX | Production declarations and installed package payloads supply exact values in all six requested categories. |
| 8B · Target-branch comparison | READY-FOR-CODEX | The comparison can reuse the existing `SEMGREP_BASE` convention and validate migration evidence against ADR-066 `CONTENT_MIGRATIONS`. |
| 8C · Blocking CI comparison | OPUS-CLOUD | Requires passing the reviewed target SHA into an installed-dependency CI job and bootstrapping the first reviewed registry revision. |
| 8D · November 20 migrations and cutovers | RETIRE | Duplicate executor work. B1–B3 and O1–O9 already have an owner. [r62t-breaks](</Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/81ca64ac-0873-42b8-9895-c3d908fa6d80/scratchpad/codex-trial/o-r62t-breaks/r62t-breaks.md>) |
| 10A · Replay after HTTP acceptance | READY-FOR-CODEX | Jini sends `row.id` and settles with `row.attempts`. Tovu’s SQL claim preserves the ID while incrementing the attempt fence. |
| 10B · New delivery ID or sender deduplication store | RETIRE | The persisted delivery ID already supplies the retry identity. The crash-window test can prove the receiver contract with a fake receiver. |

## Brief text for both Codex jobs

Copy this block into each job. Implement only the named edits, with tests first. Preserve behavior. For new APIs use `(required, optional = {})`, with no unused options or pads and with existing framework callback signatures. Preserve every existing `_optional = {}` and `_options = {}` pad and the existing args rule. No re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any`, `as never`, or new casts. Functions must stay at most 50 lines and complexity at most 10. Record any file exceeding 500 lines in root `COMMIT-PLAN.md` and continue. Inject hooks as props. Vendor code belongs in provider packages. Jini domain code stays free of vendor code and specific server-framework types.

Stop the affected sheet and continue independent sheets if a named declaration is missing, a cast is needed, a function exceeds either hard limit, or `git grep -n -F '<symbol>' -- apps/ development/ packages/` finds an unlisted production importer of a changed declaration. Same-repoint test importers may be updated and recorded in `REFRESH.md`. Use only targeted lookups and the named importer check. No other repository-wide scans, tests, builds, installs, type-checks, linters, or codebase-memory MCP. Keep `.git` read-only. CI wiring, lockfile changes, new npm dependencies and new Jini packages go to OPUS-CLOUD.

Use the smallest named diff. Add no helpers, wrappers, adapters, ports, interfaces, types, generics, options, flags, or layers except those named in a sheet. Add no speculative guards, fallbacks, catches, retries, defaults, exports, or validation. Move code and its why-comments verbatim if a sheet calls for a move. Write only the listed tests and prepare only the named mutations for combine. Add no comments except the one-line note in 10A. Reread the diff, remove anything outside the sheet and list deletions in `COMMIT-PLAN.md`. Composition changes are outside these sheets. If a sheet starts to need one, stop that step. The approved composition model uses one typed factory per feature and passes whole feature modules from the root.

`W` below means `apps/website/src`. All nine sheets use existing exports and have no injection-debt, API-baseline, or package-manifest rows. There are no production importer repoints. Each sheet lists its test import additions or deletion.

## READY sheets

### 3A · Cloudflare contribution filename

**Tovu · after `codex/tv-c7a` · 0.6k executor tokens.**

**Test first.** Edit only `W/features/deployments/deploy-targets/__tests__/registry.unit.test.ts:350–362`, the existing shipped-host case. Pass `bundledAgentPluginsDir()` to `loadBundledDeployTargetRegistry`. Keep the empty-refusal and complete-target assertions. Add `assert.equal(registry.get("cloudflare-workers")?.pluginId, "cloudflare")`. The suite preload already provides the linked-package bundle root. Cloud will point it at the production-staged candidate root.

**Imports and deletes.** Keep `bundledAgentPluginsDir` at `:1` and the registry imports at `:22`. Delete the sole `composedBundledSourceRoot` import at `:15` and this case’s private bundle creation and disposal. Keep surrounding parser and install cases. Production anchors are `deploy-targets/registry.ts:35,115–123` after `tv-c7a`, and Jini `packages/agent-plugins/cloudflare/jini-deploy-targets.json:5–7`.

**Mutation and STOP.** Rename `jini-deploy-targets.json` in the staged Cloudflare payload before starting a fresh test process. The missing `cloudflare-workers` entry must fail. Stop if the combined runtime resolves its bundle through a different entry. No separate browser look.

### 3B · Qualified plugin identity through lifecycle

**Tovu · after `codex/tv-c7a` and `codex/tv-rs3` · 1.0k.**

**Test first.** Add one case in `W/features/agent-plugins/__tests__/unit/lifecycle-binding.unit.test.ts` after the bundled-seed case at `:218–230`. Use `boundLifecycle(t)` at `:27–37` and `selectedPluginSourceRoot({ pluginIds: ["cloudflare"] })`, with its existing `dispose` registered on `t.after`. Seed that root through `lifecycle.seedBundledAgentPlugins`. Use `lifecycle.listInstalledPlugins` for the workspace root and require an installed entry with `pluginId === "cloudflare"` and `id === "jini/cloudflare"`. Use `explicitRootAgentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId: installed.pluginId })` and assert the seeded Cloudflare entry is inactive. Hosting plugins seed disabled. The manifest and storage identities are independently observable.

**Imports.** Add `import { selectedPluginSourceRoot } from "../fixtures/bundled-source-root.js";`. The lifecycle and activation imports already exist at `:9–17`. Producer anchors are Jini `packages/agent-plugins/cloudflare/plugin.json:3,13` and `packages/agent-plugins/src/lifecycle/installed-package-index.ts:108–121`. Tovu activation binding is `lifecycle.ts:294–305`.

**Mutation and STOP.** Change only `extensions.jini.id` to `tovu/cloudflare` in a disposable candidate payload. The installed-ID assertion must fail. Stop if Cloudflare seeding needs provider setup or if the combined lifecycle has a different activation binding. Installed-state upgrades stay with `r62t-breaks`. The saved-embed witness is partial below.

### 3C · CMS HTML subpath through static rendering

**Tovu · merge-7 source anchors, on the combined Tovu base · 0.6k.**

**Test first.** In `W/server/inbound/public-http/http/site/__tests__/render.test.ts:502–507`, extend the existing static-home case. Pass `extraHead: '<meta name="packed-cms-contract" content="present">'` to its real `renderSite` call. Assert the marker occurs once before `</head>`. Keep the existing disabled-chat assertions. `render-site.ts:219–226` takes this path and calls the public package entry. The Jini export is `packages/cms/package.json:347–350`, with separate `types` and `import` targets.

**Imports, mutation and STOP.** No import change. In cloud, remove the runtime export target from the disposable candidate and require runtime failure. Independently remove its declaration target and require the packed-candidate Tovu type-check to fail. Stop if the existing static fixture no longer takes the `renderStaticTierHomePage` path. No browser look.

### 3D · Cloudflare success selector against rendered HTML

**Tovu · after `codex/tv-c7a` · 0.8k.**

**Test first.** Extend the successful form case in `W/server/inbound/public-http/http/site/__tests__/render-form-layout.test.ts:39–54`. At the start of the case, load the existing shipped module with `await import(import.meta.resolve("@jini-ai/agent-plugins/cloudflare/worker/forms-receiver.mjs"))`. Use `sentNoticeHandlers({ slug: "contact" })` and its first selector tuple, the Worker’s class selector at Jini `packages/agent-plugins/cloudflare/worker/forms-receiver.mjs:52–65`. With the actual `formHtml()` loaded, assert that selector locates exactly one initially hidden slot. After the existing Tovu success render, require that same slot to be visible and retain the existing computed `display: none` check for the form. The adjacent `:56–78` case already checks actual success color from the stylesheet. Keep it.

**Imports, mutation and STOP.** The dynamic import is the only addition. It uses the existing `@jini-ai/agent-plugins` `./cloudflare/*` export. Mutate only the Worker’s class selector at `:62`, leaving its attribute selector intact. The new assertion must fail independently. Stop if the entry can be loaded only by using a Jini checkout path or changing its package manifest. Chrome after combine owes a static form submit and visible, styled success feedback.

### 3E · Native JSON-serializable IPC round trip

**Tovu Desktop · after `codex/tv-z3` · 1.6k.**

**Test first.** Add one case after `apps/desktop/src/desktop-agent-service.test.ts:256–268`, using `harness`, `ServerChild` and `serverBoot` at `:24,179–205`. Keep their definitions intact. Use `serverBoot` to bind an old boot and a contender. Use the existing `<old>.register()` to establish the occupied binding. For the contender, connect `createNodeIpcChannel` to an `EventEmitter` peer. The peer’s `send(message, callback)` passes the message to `contender.child.emit("message", message)` and completes the callback. Use the test mock facility to send the contender child’s replies back to the peer. Dispose the channel and shut down the existing harness in cleanup. Match the valid registration payload already used at `:203–204`.

- While the old boot still owns the binding, the real requester rejects with the existing explicit `refusalReason` at `:263–264`.
- After the old boot exits, the same requester receives the replacement’s scoped URL, numeric PID, and site token. The assertions must read those fields from the returned value by narrowing or deep equality.
- A register request missing `siteId` rejects with `IPC request refused` and adds no daemon operation. The real Desktop decoder runs at `desktop-agent-service.ts:283–288` after `tv-z3`.

**Import, mutations and STOP.** Add `import { createNodeIpcChannel } from "@jini-ai/sidecar/supervisor/node";`. The existing `EventEmitter` and `Serializable` imports suffice. Cloud mutations are to drop the success payload, drop the explicit refusal field in the Jini reply, and bypass the Desktop payload parser for the missing-field case, one at a time. The corresponding case must fail. Stop if the harness needs a new cast, a real child fixture, or changes to any error boundary. Electron after combine owes an owned-site register, refusal, and successful replacement. This covers the native child channel, which has a different envelope from the sidecar Unix-socket `BAD_FRAME` path.

### 3F · Tovu AG-UI writer against Jini’s shipped reader

**Tovu · after `codex/tv-c7a`, against Jini merge-9 with `jm7-a/b` and `codex/jx-engaps` landed · 1.8k.**

**Test first.** Add three cases in `W/server/__tests__/assistant-ag-ui-wire.golden.test.ts` after `boot(t)` at `:185–196`. Reuse `RUN_PATH`, `activeScript` and that harness. Keep the golden table, fixture and update path unchanged.

- Set `activeScript` to one `text_delta` and a successful `end`. Call `createAgUiFetchAgent` with its `request({ input, signal })` doing an authenticated real `fetch` to `RUN_PATH`. Use a normal `RunAgentInput` with fixed thread, run and user-message IDs, empty tools and context, and empty state and forwarded props. Require HTTP 200 and event-stream content type in the request callback. The reader must complete, preserve the run and thread IDs, and deliver the text delta followed by `RUN_FINISHED`.
- POST a valid request without a cookie and require HTTP 401.
- POST an authenticated request with `messages: "not an array"` and require HTTP 400.

**Import.** Add `import { createAgUiFetchAgent } from "@jini-ai/chat/transports/ag-ui";`. Jini’s export is `packages/chat/package.json:163–167` and its reader is `packages/chat/src/core/assistant-client/ag-ui-fetch-agent.ts:5–34`. Tovu’s real writer is `composition/modules/assistant-ag-ui.ts:134–135,208–221`. Those production files and `assistant-ag-ui-routes.test.ts` are outside this sheet’s edit set.

**Mutations and STOP.** In combine, drop a required field such as `runId` from the emitted `RUN_STARTED` frame, then separately bypass the route’s session check or malformed-body rejection for its named case. Each case must fail on its corresponding mutation. Stop if the reader is absent from the linked candidate, a failure needs an error-boundary change, or either repo would need a package edit. Chrome after combine owes one authenticated assistant turn. The packed run must prove the new reader resolves from the candidate tarball.

### 8A · Persisted-name rule and initial registry

**Tovu · after `codex/tv-c7a/b` and `codex/tv-engaps`, against Jini merge-9 · 1.9k.**

**Test first.** Add `development/scripts/__tests__/persisted-names.test.ts`, with one case named `registered persisted names match their production declarations`. Add `development/scripts/persisted-names.json` with `names` keyed by the stable keys below and an initially empty `changes` array. In the test, build the actual-value object from the listed declarations and compare it to `names` with `assert.deepEqual`. Use normal package resolution for package payloads.

| Registry key | Initial value | Source binding |
|---|---|---|
| `tovu.content.ledger` | `tovu_migrations` | `W/platform/db/migrations/runner.ts:13`, `LEDGER_TABLE` |
| `tovu.content.database` | `content.db` | `W/platform/site-dir/layout.ts:61`, `CONTENT_DB_FILENAME` |
| `tovu.deploy.descriptor` | `jini-deploy-targets.json` | `W/features/deployments/deploy-targets/registry.ts:35` after `tv-c7a`, `DEPLOY_TARGETS_FILENAME` |
| `cloudflare.plugin.id` | `jini/cloudflare` | Installed `@jini-ai/agent-plugins/cloudflare/plugin.json`, `extensions.jini.id`, Jini manifest `:13` |
| `cloudflare.forms.binding` | `JINI_FORMS` | Installed `@jini-ai/agent-plugins/cloudflare/lib/forms.mjs`, `FORMS_BINDING:8` |
| `cloudflare.forms.privateRoute` | `/_jini/*` | Same module, private entry of `FORMS_WORKER_ROUTES:11` |
| `sheets.submission.id` | `_jini_submission_id` | Installed `@jini-ai/agent-plugins/google-workspace/form-destinations/mapping.mjs`, `SUBMISSION_ID_HEADER:22` |
| `resend.credential.label` | `Mail — Resend API` | Installed `@jini-ai/agent-plugins/resend/jini-mail-adapters.json`, Resend descriptor `credentialLabel:8` |

**Imports.** Use these imports in the new test. Resolve the three JSON reads, including the registry, with `readFileSync` and `JSON.parse`. Resolve the two `.mjs` entries with `import.meta.resolve` and dynamic import.

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { DEPLOY_TARGETS_FILENAME } from "#src/features/deployments/deploy-targets/registry";
import { LEDGER_TABLE } from "#src/platform/db/migrations/runner";
import { CONTENT_DB_FILENAME } from "#src/platform/site-dir/layout";
```

**Rule.** Add a short `Persisted names` subsection to `development/scripts/README.md`. Register durable names by stable key at the production declaration or serialized reader. A rename or removal requires an exact old-to-new record, using `null` for removal, and either a newly registered ADR-066 content migration or an explicitly approved cutover. A cutover records its approval, owner, affected storage and users, and recovery. Put old-data and retry evidence with the migration or cutover. Link the rule to the existing migration runner and the November 20 repair ownership. Do not enter prospective approval records for the repairs.

**Mutation and STOP.** Change only the installed Sheets header constant and require a key-specific mismatch. Stop if any listed value differs on the required combined base. Reconcile against the owning branch or repair record before blessing baseline values. No browser look.

### 8B · Compare persisted names against the reviewed target

**Tovu · after 8A, on the same combined base · 2.1k.**

**Tests first.** Extend `development/scripts/__tests__/persisted-names.test.ts` with cases for an unchanged registry, a registry rename with no evidence, a registered new migration, and a removal with an approved cutover. Within the migration case assert that a historical or unregistered step fails. Within the cutover case assert that a record for the wrong old value fails. Use inline values for these cases.

**Source in the test file.** Add only private `findUnrecordedPersistedNameChanges` and a file-local `PersistedNameRegistry` type. Take `{ baseline, current, newContentMigrationIds }` as the private comparison input. Keep the historical `changes` prefix intact. Compare all baseline keys with current values, using `null` for removal. Accept a changed key only when a newly appended `{ key, from, to, migrationId }` exactly matches it and the ID belongs to `newContentMigrationIds`, or a newly appended `{ key, from, to, cutover }` exactly matches it and includes nonempty `approval`, `owner`, `affected`, and `recovery` fields. Report the changed key and both values on failure. A newly registered key needs no transition. Tests should exercise record matching without Git.

Add one target-branch test using the existing `SEMGREP_BASE` environment value. When supplied, read the baseline JSON with `git show <base>:development/scripts/persisted-names.json` and compare it with the current registry. Read added migration paths with `git diff --no-renames --diff-filter=A --name-only <base> HEAD -- apps/website/src/platform/db/migrations/`. Intersect the direct content migration file stems with `CONTENT_MIGRATIONS.map(step => step.id)`. Git or baseline-read failure fails the target case. The ordinary local suite can mark only the target case skipped when `SEMGREP_BASE` is absent. The cloud gate must explicitly supply the SHA.

**Imports and anchors.** Add `import { execFileSync } from "node:child_process";` and `import { CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";`. The existing model is `development/scripts/check-immutable-migrations.mjs:1–21`. ADR-066 anchors are `W/platform/db/migrations/index.ts:78,122–123,159–165`, `runner.ts:13,16–21`, and `0042_optimistic_concurrency_versions.ts:15–17,36–38`. B1 owns the planned `0043` step, registration, checksum and fresh-DB row. No migration files change here.

**Mutations and STOP.** On a post-bootstrap candidate, rename a registered source value and its registry value together with no record. The live-value test should pass and the target test should fail. Then relax migration matching to accept any historic ID and require the historical-step control to fail. Stop if this needs a second migration ledger, a CI edit in the executor branch, or an inferred cutover approval. No browser look.

### 10A · Accepted webhook POST, lost settlement, replay

**Tovu · merge-7 source anchors after the combined webhook ownership and fencing review · 2.3k.**

**Test first.** Add one case beside the restart simulation at `W/platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts:366–383`. Reuse `makeDelivery`, `makeEnvelope`, `openContentDb` and `SqliteWebhookDeliveryRepo`. Name one file-private fixture `prepareWebhookReplay` for the temporary DB, seeded subscriptions, mutable ISO clock and signer. Use the existing in-memory subscription repo and the fixed-secret signer for two subscriptions. Use the real SQL repo as both delivery storage and envelope storage, and the real host `processDueDeliveries`.

1. Seed a row and envelope, run at the fixture’s original time with `claimLeaseMs: 1_000`, and have the receiver fake return 204 after recording the request. Mock only the first repo instance’s `markDelivered` to reject before writing. Require the processing call to reject with that sentinel and the row to remain `delivering` at attempt 1.
2. Open a fresh repo on the same file and advance the clock to lease expiry. Let the real worker reclaim and send. During the retry’s fake HTTP response, try the attempt-1 settlement against the real repo and require the row to remain `delivering` at attempt 2. Return 204 and require the real attempt-2 settlement to set `delivered`.
3. Require two POSTs for that delivery, with identical `tovu-delivery-id` equal to the persisted row ID, and one receiver effect keyed by destination plus delivery ID. Enqueue a different delivery for the same event under the second subscription and require its distinct delivery ID, the same `tovu-event-id`, and a second effect.

**Imports.** Extend the existing `repo.memory` value import at `:8` with `InMemoryWebhookSubscriptionRepo`. Add:

```ts
import { processDueDeliveries } from "#src/features/webhooks/delivery";
import type { HttpClientPort } from "#src/features/webhooks/ports";
import { createFixedSecretSigner } from "#src/features/webhooks/signing";
import { createSubscription } from "#src/features/webhooks/subscriptions";
```

Merge `HttpClientPort` into the existing type import at `:13`. Use a typed receiver fake and the existing temp-file cleanup pattern. Keep the test and fixture functions within the hard limits.

**Source and mutations.** Add one sentence to the existing `processDueDeliveries` doc comment at `W/features/webhooks/delivery.ts:62`: “Delivery is at least once. Receivers can deduplicate by `tovu-delivery-id` within the subscription.” Production anchors are Jini `packages/integrations/src/webhooks/delivery.ts:224–243,308–313,366–377` and Tovu `W/platform/db/repos/webhook-repo.ts:234–263,286–306`. In combine, substitute an attempt-derived wire ID, remove the SQL attempt fence, and suppress expired-row reclaim as separate mutations. Each must fail at its named witness. Stop if the combined runtime changes settlement ownership, or if the test needs a new receiver store or port. No Chrome or Electron look.

## Batches and cloud handoff

| Job | Base and order | Executor estimate |
|---|---|---:|
| `codex/tv-dg-contract` | Tovu `8d1a4c2742` on the combined Tovu base. Run **3A → 3B → 3C → 3D → 3F**. Use Jini merge-9 after `codex/jx-engaps`. | 4.8k |
| `codex/tv-dg-durable` | Same combined Tovu and Jini bases. Run **8A → 8B → 3E → 10A**. May start alongside the first job. Start 10A after reviewing the combined webhook ownership and fencing anchors. | 7.9k |

Both jobs follow `fix/cloud-bugs-1120`, `codex/tv-c7a`, `tv-c7b`, `tv-z2`, `tv-z3`, `tv-z4`, `tv-z5`, `tv-rs3`, `tv-bg`, `tv-sharezip`, and in-flight `tv-engaps`. Keep the error work and current migrations with their assigned owners. There is no Jini source-edit job. Its changes are already on the candidate base, and the test imports use existing exports.

- **3G · OPUS-CLOUD.** Build the exact combined Jini revision once and `pnpm pack` the packages consumed by the cases and their Jini dependency closure. Install those artifacts into disposable Tovu website and Desktop installs through normal package resolution. Use the combined `composeBundledAgentPluginRoot` to stage the installed plugin payloads and point `TOVU_BUNDLED_AGENT_PLUGINS_DIR` at that result before the website test preload. Verify resolved runtime and declaration entries come from the candidate install, including transitive Jini packages. Run 3A–3F, the Tovu type-check against those same tarballs, and the listed mutations on disposable copies. Record Jini SHA, tarball digests, and Tovu SHA. Use the result as the pre-combine and pre-release check. The published-version drift check can keep its existing job.
- **8C · OPUS-CLOUD.** Land the reviewed initial registry as the comparison baseline. In the installed-dependency PR or combine job, pass the resolved merge-base SHA as `SEMGREP_BASE` and require the 8B target case to execute and pass. Keep `check-immutable-migrations.mjs` as the separate historical-file guard. Use the first target that contains the adopted registry, then require evidence prospectively. Reference the actual `r62t-breaks` migration and cutover records for the November 20 repair.

## Partial

- **3 · Additional paths.** The ID pilot covers shipped-manifest discovery and short-name activation. A shipped saved-embed lookup still needs a verified consumer fixture. The IPC pilot covers Desktop’s native child transport. Jini’s after-`jz2-a` Unix-socket `BAD_FRAME` is already covered by its own tests, and I did not verify a Tovu production consumer of that specific envelope.
- **8 · Registry breadth.** The first registry spans all six categories but is deliberately finite. Expand from the reviewed `r62t-breaks` inventory after the actual repair records land, including GitHub and S3 ownership manifests, the remaining Sheets metadata, private route endpoints, saved embed IDs, and credential labels. Preserve the existing migration and recovery ownership.
- **10 · Receiver ownership.** The crash-window witness uses a fake receiver. I did not verify a Tovu-owned durable receiver for this outbound route. A receiver-side atomic deduplication change needs that concrete receiver and store.
