# 11-21 executor handoff

Tovu base is `0973a5fdc8`. Jini base is `de4e555b9`. Both are `integ/merge-10-2026-11-21`. `W` means `apps/website/src`, and `A` means `apps/admin/src`. Anchors refer to those bases.

The dispatched clone lacks `AI-Dev-Shop/AGENTS.md`, the named architecture chapters, and the two plan refs. I proceeded under the dispatch bootstrap and used the supplied prior handoffs and pinned source. I stopped at the lookup cap. No files or refs changed, and no verification commands ran.

## Disposition

| ID | Disposition | Evidence |
|---|---|---|
| A10/A18/A19 gateway | **READY-FOR-CODEX** | Jini `gateway.ts:177,218` owns the two admission points. Tovu's gateway already spreads its first argument into Jini. |
| A10 database migration | **READY-FOR-CODEX** | `W/features/database/tool-registrations.ts:197–219` owns both calls from the confirmed tool. |
| A18 publish-content import | **READY-FOR-CODEX** | `W/features/publish-content/tool-registrations.ts:319–327` owns both calls. The existing permission and restore-capability checks stay in sequence. |
| A19 recovery restore | **READY-FOR-CODEX** | `W/features/recovery/tool-registrations.ts:276–332` owns the two callbacks around the existing recovery orchestration. |
| T46 saved-key picker | **READY-FOR-CODEX** | The owner credential-copy GET projects the bounded source rows to `useCopyKeys` and `CopyKeysDialog` without a kind filter. The source SQL already limits the combined `vendor` and `source-control` inventory to 50 per site. |
| Q2 private Git backup restore | **PARTIAL** | The existing upload and owner-setup flow is pinned. The producer's v1 repository paths and optional scopes still need a complete mapping into the v2 verifier's database, media and plugin policy. |
| Q4 import history and replay | **OPUS-CLOUD** | Replay, expiry, staging budget, interrupted-import recovery and listing share a filesystem registry. The cloud sheet defines one atomic cutover with acceptance tests. |
| TV-AG1 / AP-T | **PARTIAL · predecessor status** | The supplied TV-AG1 brief identifies `codex/tv-ag1`. The prior plan requires AP-T and TV-AG1 before visitor cutover. I did not verify either pushed result. |
| `deps/lockfile-1121` | **OPUS-CLOUD · prerequisite** | Owns the `apps/site-chat` dependency and lockfile change. The ref was unavailable in the inspected Git objects. |
| AG2-T, AG3-T, AG4-T | **PARTIAL** | The prior handoff pins the cutover order. The visitor replacement flow, live approval handoff and browser effect tests still need executable sheets. |
| AG-UI admin parity | **PARTIAL** | `agui:` reattach currently returns an empty completion and status returns `null`. The existing BYOK branch precedes AG-UI. The checklist below is the release gate. |
| AG-UI admin default flip | **READY-FOR-CODEX · held behind parity** | The flip itself is confined to the existing host predicate and tests. I scoped it to Local CLI turns, the path the predicate controls today. Full BYOK coverage needs a separate AG-UI binding. |

## Rules for every executor brief

Include this block in each Codex job. The behavior changes are limited to those explicitly named in its sheets.

```text
Behaviour identical; API args (required, optional = {}) for NEW functions only; no re-export shells; no new deps; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines and complexity <= 10 (HARD). A file going over 500 lines is NOT a stop reason (owner correction 11-20: note it in COMMIT-PLAN.md and continue). STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (git grep -n -F '<symbol>' -- apps/ development/ packages/; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or the function/complexity limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters; no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root. Hooks are injected as props. No vendor code in Jini domain packages (vendors live in provider packages); no specific server framework in Jini domain code ({ app: Server } style). Anything needing a lockfile change, a new npm dependency or a new Jini package = OPUS-CLOUD.
```

Read the sheet before every edit. Write only the named tests, mutations and production changes. New declarations, options and comments require explicit naming in the sheet. Preserve existing `_optional = {}` pads. Move statements and why-comments verbatim. Use existing dependency bags and seams. Keep single-route coercion and host copy in Tovu. Re-read the diff, remove incidental changes, and list deletions in root `COMMIT-PLAN.md`. Record why each test is red before its fix and name the mutation the combine must run. Jini public names use Jini vocabulary, with any actual incompatibility recorded on a `BREAKS:` line. Composition-deps and the Jini API deprecation gate are dropped. `@tovu/sdk` stays in Tovu.

## READY sheets

### GATE-ABORT-J · Jini · `de4e555b9` · 1.2k edit tokens

**Tests first.** Add the following cases to `packages/core/src/gated-mutations/__tests__/gateway.test.ts`, using its existing imports at `:1–13`, `makeHooks`, `makeDeps`, and `mintValidToken`.

1. **Abort during confirm authorization skips token save.** Have the injected authorization callback abort and return allowed. Assert rejection with the exact abort reason and zero tokens in the memory store. Mutation: remove the confirm check.
2. **Abort during final plan verification leaves the token minted.** Mint a valid token and abort inside `computePlan` while returning its matching hash. Assert rejection with the exact abort reason, status `minted`, and zero mutation calls. Mutation: move the execute check above `computePlan`.
3. **Abort after redemption still applies the verified plan.** Wrap the existing memory-store `tryRedeem`, call the original, then abort before returning its successful result. Assert the token is redeemed and the mutation completes once. Mutation: insert a signal check between successful redemption and `executeMutation`.

**Source.** In `packages/core/src/gated-mutations/gateway.ts`, add `signal?: AbortSignal` to the existing first-argument objects of `confirm:149` and `execute:187`. At `:177` put `required.signal?.throwIfAborted()` directly before `deps.tokens.save`. At `:218` compute the existing redemption timestamp in a local `now`, check `required.signal?.throwIfAborted()`, then call `tryRedeem` with that timestamp. Preserve fresh authorization, token validity, identity and scope, plan verification, atomic redemption, and mutation order. The token store and mutation hooks receive their existing arguments. A saved token abandoned before redemption expires under its existing TTL.

**Imports and debt.** In-place declarations. `packages/core/src/gated-mutations.ts:1` and `packages/core/package.json:140` already expose the gateway at `@jini-ai/core/gated-mutations`. The test continues using `../gateway.js`. Tovu's existing adapter import is `W/contracts/core/gated-mutations/gateway.ts:94–102`. Zero repoints, manifest or injection-debt edits. Record the additive signature delta in `COMMIT-PLAN.md`, with zero API-baseline gate edits. No standalone browser look.

**STOP** if either boundary requires a token-store contract change, an async gap after the signal check, or a change to existing gateway refusal precedence.

### A10-ABORT-T · Tovu · `0973a5fdc8` after GATE-ABORT-J · 1.3k edit tokens

**Tests first.** In `W/assistant/__tests__/tool-registrations.database-recovery.test.ts`, extend `startExecute:696–709` to create an `AbortController`, pass its signal through the existing `executionContext(input)` spread to `tool.handler`, and return the controller. Use `fakeRouteDeps:76`, `startExecute:696`, and `executeEffects:763` for two named migration cases. Install each witness after the real confirmation card is visible and before answering it.

1. **Stopped migration during confirm authorization saves no token.** Wrap the fixture's existing gateway `authorizeInstance` to abort after the allowed decision. Observe `tokens.save`. Assert rejection, zero saves, and unchanged migration effects. Mutation: omit the signal from `gatewayConfirm`.
2. **Stopped migration after token save leaves approval unused.** Observe the saved record and abort during `tokens.findByToken`, after letting the real read complete. Assert rejection, the record still `minted` when re-read via the original store method, and unchanged migration effects. Mutation: omit the signal from `gatewayExecute`.

**Source.** In `W/contracts/core/gated-mutations/gateway.ts:183,211`, add `signal?: AbortSignal` to the existing first arguments of `confirm` and `execute`. Keep the spread forwarding at `:184,212`. In `W/features/database/tool-registrations.ts`, add `signal: ctx.signal` to `gatewayConfirm:198–205` and `gatewayExecute:212–218` in `createMigrateForwardHandler:176`. Keep operation-lock ownership and cleanup. This sheet owns the Tovu adapter change used by A18 and A19.

**Imports and debt.** Zero repoints. The database import remains `W/features/database/tool-registrations.ts:31–37`, from `"../../contracts/core/gated-mutations/gateway.js"`. The shared test continues using its existing registration and gateway composition imports at `:27,35–36`. Existing adapter consumers can omit the additive field. Zero injection-debt, API-baseline, manifest or lockfile edits. Chrome/Electron look after combine: confirm **Update database**, exercise Stop while approval is in flight, and verify no migrate-forward restore point was captured before admission.

**STOP** if the selected Jini build lacks the additive fields or the real confirmation fixture requires a new production test seam.

### A18-ABORT-T · Tovu · after A10-ABORT-T · 1.0k edit tokens

**Tests first.** In `W/features/publish-content/__tests__/execute-pull-tool.test.ts`, use `planned:14` and `start:20–37`, including its existing returned controller and real confirmation exchange. Use the token-store observation pattern at `:40–46`.

1. **Stopped pull during confirm authorization saves no token.** After the card opens, wrap gateway `authorize` to abort on its allowed confirm decision. Confirm, then assert rejection, zero token saves, zero restore points, and unchanged destination. Mutation: omit the confirm signal.
2. **Stopped pull after token save leaves approval unused.** Wrap the gateway token read to abort after returning the saved record. Confirm, then assert rejection, the saved token still `minted`, zero restore points, and unchanged destination. Mutation: omit the execute signal.

**Source.** Add `signal: ctx.signal` inline to the existing `gatewayConfirm` and `gatewayExecute` objects at `W/features/publish-content/tool-registrations.ts:320,326`, inside `createExecutePullHandler:286`. Retain the intervening permission and capability checks, the existing error boundary, and apply-report handling.

**Imports and debt.** Zero repoints. The production import remains at `:18` from `"../../contracts/core/gated-mutations/gateway.js"`. The test uses its existing fixture and token imports at `:4–11`. Zero injection-debt, API-baseline, manifest or lockfile edits. Chrome look after combine: check the **Apply pull** approval and stopped pull. S13 owns cross-run baseline ordering. Refresh these call sites if S13 has already landed.

**STOP** if the abort is observed before the card settles or the fixture needs a substitute for the real import gateway.

### A19-ABORT-T · Tovu · after A10-ABORT-T · 1.1k edit tokens

**Tests first.** In `W/assistant/__tests__/tool-registrations.database-recovery.test.ts`, use the controller from A10's `startExecute`, a real seeded restore point and the artifact spy pattern from `:714–741`.

1. **Stopped restore during confirm authorization saves no token.** Abort from the allowed `authorizeInstance` decision after the card opens. Assert an unsuccessful call, zero token saves, and zero artifact applications. Mutation: omit the confirmation signal.
2. **Stopped restore after token save leaves approval unused.** Abort from the real token read after a saved record is obtained. Assert an unsuccessful call, a still-minted token, and zero artifact applications. Mutation: omit the execute signal.

**Source.** Add `signal: AbortSignal` to the existing confirmer object type of `createRecoveryConfirmationGateway` at `W/features/recovery/tool-registrations.ts:276`. At `:298` pass `{ ...confirmer, signal: ctx.signal }`. Add `signal: confirmer.signal` to `gatewayConfirm:280–287` and `signal: ctx.signal` to `gatewayExecute:310–316`. Keep `toRecoveryResult`, restore orchestration and operation-lock cleanup.

**Imports and debt.** Zero repoints. The two gateway imports remain at `:28–29` from `"../../contracts/core/gated-mutations/gateway.js"`. The test uses the existing imports from A10. Zero injection-debt, API-baseline, manifest or lockfile edits. Chrome/Electron look after combine: exercise Stop during the confirmed restore and verify the current site data stays in place when redemption is skipped.

**STOP** if the fix requires changing recovery result mapping or the operation-lock API.

### T46 · Tovu · `0973a5fdc8` · 1.7k edit tokens

**Tests first.**

- `W/server/runtime/composition/__tests__/other-site-keys.integration.test.ts`, beside the known-ID case at `:102`. Name the case **picker keeps fifty per source and reports each omitted count**. Use `fixture:29` and `f.save` for 51 rows on A and 52 on B. Assert 50 choices per source and one positive omission field per source, with counts 1 and 2. Keep the existing test that a known ID remains usable after falling out of the list. Mutations: remove the listing limit, or suppress `omittedCount`.
- `W/server/inbound/admin-http/routes/system/__tests__/credential-copy.tw4.pins.test.ts:18,49–59`. Give the listed fixture row a `siteName` and `omittedCount: 2`. Assert both are projected by GET. Keep the POST assertions. Mutation: remove the count from the route projection.
- `A/features/security/__tests__/CopyKeysDialog.unit.test.tsx:7–10,25–30`. Add **shows omitted saved keys for each source**. Use the existing `fakeCopyKeysPort` with two source-marked rows in the Shared Keys response, counts 1 and 2, and a row without a count. Assert the two site-labeled notices and that the three real keys are the only radios. Mutation: omit the notice rendering.

**Source.**

1. `W/server/runtime/composition/other-site-keys.ts:42,135–152` — add `sourceCount: number` to `MetaRow`. Select `count(*) OVER () AS sourceCount` for listing and `1 AS sourceCount` for known-ID lookup using the existing `rowId` condition. Keep the same predicates, `ORDER BY kind, id`, listing limit of 50 and known-ID limit of one. The query counts eligible metadata rows in the same read.
2. `createKeyList:206–224` — iterate `rows.entries()`. Only the first actual row gains `omittedCount: row.sourceCount - MAX_ROWS_PER_SITE`, when positive. `W/features/project-keys/service.ts:15,23` adds `omittedCount?: number` to `ProjectKeyRow` and `SiteKeyChoice`. The spread at `:151` already forwards it.
3. `W/server/inbound/admin-http/routes/system/credential-copy.ts:54–60` — add `omittedCount` to the GET row projection when defined. Add `omittedCount?: number` to `AdminCredentialCopySource.keys` at `A/features/security/api/security-api.types.ts:150–155`.
4. `A/features/security/hooks/use-copy-keys.hooks.ts:65–71` — add `omissions` to the existing controller result. Project each key carrying both `siteName` and `omittedCount` into `{ id, siteName, count }`. `A/features/security/CopyKeysDialog.tsx:20–22` renders each as a plain line after the radios with the site name and **N more not shown**, using the existing translator for the text. The HTTP envelope, hook injection and selection path keep their existing shapes.

**Imports and debt.** Zero repoints or new imports. The production path is `site-deps/project-keys.ts:8` → `other-site-keys.ts:27,106` → `service.ts:151` → `credential-copy.ts:55` → `security-api.ts:55–58` → `use-copy-keys.hooks.ts:3–4,38–40` → `CopyKeysDialog.tsx:3,9` and `AccessTokensTab.tsx:104,114,128`. The composition test keeps the two imports at `:20,22`, the route test keeps `:5`, and the dialog test keeps `:3–5`. Other consumers of the existing additive types and controller keep their imports. Check the affected declarations against the line and complexity caps. Zero debt, package export or manifest edits. Chrome/Electron look: open **Use a saved key** with two overflowing sources, confirm the counts and grant one visible key.

**STOP** if a production consumer discovered at refresh filters out the metadata-bearing first row or interprets the omission as an additional selectable key.

### AG-ADMIN-DEFAULT · Tovu · after AG3-T and the admin parity combine · 0.7k edit tokens

**Dispatch gate.** All six checks below pass on the candidate. AG4-T is also a predecessor if it supplies admin page approvals or effects required for parity.

**Tests first.** In `A/lib/__tests__/assistant-transport.ag-ui.unit.test.ts:74–97`, change the unset-key case to expect `true`. Add a stored `"0"` case expecting `false`. Retain the `"1"`, `"true"` and no-`localStorage` cases. At the transport routing cases beginning `:694`, use the real predicate as `getAgUiEnabled` in the existing AG-UI and Local CLI fetch witnesses. Assert an unset key posts to `AG_UI_RUN_PATH` and setting `"0"` sends the next Local CLI turn through its existing endpoint. Keep the BYOK precedence test in Jini `transport.test.ts:426` as combine coverage. Mutations: restore the old equality predicate, or make `"0"` truthy.

**Source.** Edit `isAgUiTransportEnabled` at `A/lib/assistant-transport-ag-ui.ts:51–54`. Keep the existing no-storage guard. Read the existing key once and return `value === null || value === "1"`. The existing key with value `"0"` is the rollback override. Replace the stale toggle description at `:39–50` with one neutral line describing the default and override. `getAgUiEnabled` continues to be read for every turn.

**Imports and debt.** Zero repoints. The production import is `A/components/AssistantDock/hooks/assistant-transport.hooks.ts:9`, passed at `:113`. `A/lib/assistant-transport.ts:135–138` forwards the callback. Existing tests import it at `assistant-transport.ag-ui.unit.test.ts:13` and mock it at `AssistantDock.hooks.unit.test.tsx:62–64`. No manifest, debt, export or lockfile changes. Chrome and Electron look: fresh-profile Local CLI turn, `"0"` override on the next turn, explicit BYOK turn, and a pre-flip durable run still open.

**STOP** if any parity case is red or lacks a live-path witness. Keep the ready flip held while those prerequisites are open.

## Q4 · cloud combine sheet

**Repo and base.** Tovu `0973a5fdc8`, refreshed after any landed import-backend cancellation or Q2 work. One coordinated cloud sheet. Use the existing SQLite infrastructure and import lock. The cloud executor must pin the concrete SQLite binding and immediate consumers before editing.

**Scope.** `W/features/site-backup/import-registry.ts:10–47,58–161` owns the records, lock and expiry. `import-backend.ts:60–73,153–169,191–217` owns replay admission, state transitions, list and tidy. `import-backend-steps.ts` owns `requireStagingBudget` and `reconcileInterruptedImports`. Page the principal-filtered history through `W/server/inbound/admin-http/routes/system/site-imports.ts:89–103`, the list tool in `W/features/site-backup/tool-registrations.ts:243ff`, and the admin transfer port at `A/features/sites/hooks/site-transfer-dependencies.hooks.ts:93ff` and its history consumer.

- Use one private indexed store under `SiteImportRegistry`. Persist the replay key `(principalId, requestId)`, normalized request digest, import ID and compact outcome. Persist the fence before verification begins. Commit each lifecycle change and the associated replay outcome together. Same key and digest returns the current or stored outcome. Same key and different digest returns `REQUEST_CONFLICT` before consuming an upload or starting verification. Keep the original acceptance timestamp. I used 365 days from acceptance for the one-year replay boundary.
- Store terminal history details for 30 days from settlement. Use `createdAt` for legacy terminal rows without settlement time. Page by descending `(createdAt, importId)` with a bounded page size, opaque continuation and principal-scoped queries. Active work keeps its existing deadlines and recovery rules. Once visible details expire, replay returns the compact outcome without exposing the item in history.
- Retain the existing redaction for terminal source data. For new requests, digest the normalized source and supplied display name. For backfill, use a recoverable upload ID or intact URL and retain existing source digests with legacy source-only matching. An origin-only legacy record without a usable digest keeps a conflict fence for the remainder of its replay lifetime.
- Backfill once under `.import.lock`. Include eligible terminal detail and replay data independently and preserve all active rows and allocations. Commit the cutover marker with the backfill. Unreadable legacy records follow the current refusal behavior and block cutover with their files intact. Use indexed reads for active recovery, replay, paging and expiry. Point staging-budget and orphan checks at the upload/stage payload namespace so steady-state import operations avoid scanning the history directory.
- Preserve the legacy snapshot through the verification window. Before an indexed write, rollback can use the legacy snapshot. After any indexed write, retain the indexed registry and its reader/writer during application rollback. If that compatible rollback build is unavailable, freeze import writes until it is available. Reopening stale legacy files for writes would lose post-cutover outcomes and replay fences.

**Acceptance tests first.** Use `import-backend.unit.test.ts`, `import-registry.unit.test.ts`, the existing `import-interruption.integration.test.ts`, and the admin transfer tests. The cloud combine runs the named cases and mutations.

| Case | Required proof | Mutation |
|---|---|---|
| Durable replay | After restart at day 31, retrying success or failure returns the stored outcome. Changed input conflicts before a second effect. Verify principal isolation and a post-cutover retry of an already-consumed upload. | Bypass replay lookup. |
| Expiry and pages | At day 30, terminal detail disappears from list while replay still works. At day 365, the replay key is eligible for reuse. Replaying does not extend retention. Tied timestamps page without duplicates, skips or cross-principal rows. | Make an expiry comparison exclusive or drop the import ID tie-breaker. |
| Backfill and interruption | Interrupt migration, restart and get one copy of each eligible row and fence. Cover an origin-only key, an unreadable row, and active `verifying`/`creating` recovery with allocation preserved. | Commit the marker before the backfill writes. |
| No history scan | After cutover, make history-directory enumeration fail. List, retry, expiry/tidy, staging-budget checks and interrupted-import recovery still work. Stale payloads are removed and active payloads are retained. | Restore directory enumeration on replay or expiry. |
| Rollback | Before indexed writes, restore the legacy snapshot. After indexed writes, exercise the compatibility build or write freeze. Restart and show that a post-cutover replay cannot create a second site. | Allow post-cutover writes through the stale legacy registry. |

**STOP** the cutover on an unaccounted registry caller, an unproven atomic migration, or a rollback that loses a fence or active allocation. Chrome/Electron look after combine: page the history, finish owner setup, restart, and retry the same request.

## AG-UI parity and rollout

| Gate | Required live-path proof |
|---|---|
| Resume | Refresh or reopen an active Local CLI conversation and reattach to its actual run. Status, events and the final transcript survive without duplicate deltas or a second provider turn. Verify CLI/ACP session carryover and stateless follow-up context. Replace the behavior currently pinned at `A/lib/__tests__/assistant-transport.ag-ui.unit.test.ts:627–635` before dispatching the flip. |
| Approvals | A real admin approval interrupts and resumes the exact parked invocation once. Exercise accept, decline, expiry, wrong owner and replay. Ordinary non-approval cards still render. Enable the TV-AG1 production approval marker only with the working AG3-T resume path. |
| Stop | Stop before headers, during start/subscribe, during streaming, and while approval is parked. The targeted run cancels once, deliberate Stop settles cleanly, and Stop still reaches a run after reload. Existing in-memory abort coverage begins at `assistant-transport.ag-ui.unit.test.ts:638`. |
| Errors | Compare actionable pre-stream refusals, provider failures, disconnects, and no-reply terminal outcomes in the dock. Preserve safe copy, one terminal state and retry behavior. |
| Attachments | Send an attachment through the real dock and verify it reaches the selected agent and survives transcript reopen. Exercise cancellation and retry with an attachment. |
| Cost footer | One final usage and cost footer on the preserved transcript, including after resume or reattach. Verify usage is neither lost nor counted twice when the transport reconnects. Use the existing `tovu.usage` event and reducer coverage as the starting point. |

Land `deps/lockfile-1121`, AP-T and TV-AG1 before AG2-T. AG2-T replaces visitor `/chat` **in place**, with server and both browser renderers landing together. AG3-T follows with visitor and admin approval resume. Coordinate removal of `/confirm` with its replacement answer path. AG4-T follows with authorized browser delivery, `begin` immediately before effects, and invocation-bound results. Run the admin parity combine after AG3-T and after any AG4-T changes it relies on. The admin flip does not depend on unrelated visitor-only work once the required shared contracts and admin parity are green. Visitor Chrome looks cover both renderers. Admin looks cover Chrome and Electron.

## Batches

Branch names here are proposed dispatch names. The estimates cover edits.

| Order | Repo and job | Base and sheet order | Estimate and state |
|---|---|---|---|
| 1 | Jini `codex/gated-abort-jini` | `de4e555b9` → GATE-ABORT-J. No overlapping predecessor confirmed. | **1.2k.** One ready sheet from this dispatch. Fill three slots with independently ready Jini work before sending a four-to-eight-sheet job. |
| 2 | Tovu `codex/gated-abort-and-key-picker` | `0973a5fdc8` against the pushed GATE-ABORT-J candidate → A10 → A18 → A19 → T46. Refresh A18 if S13 lands first. | **5.1k**, four sheets. A10 supplies the adapter and the shared test controller. |
| 3 | Tovu cloud combine | `0973a5fdc8` plus any landed import-backend predecessors → Q4. Serialize with Q2 at `verifyAndStage` if Q2 lands first. | One cloud sheet. Keep it outside the local Codex batch. |
| 4 | Tovu AG-UI follow-up | `0973a5fdc8` plus `deps/lockfile-1121`, AP-T, TV-AG1 and required AG2–AG4 work → parity combine → AG-ADMIN-DEFAULT. | **0.7k** for the flip. Reserve a slot in a later four-to-eight-sheet job after parity. |

## PARTIAL handoffs

**Q2.** Use the existing `POST /site-imports/uploads` raw ZIP endpoint and the subsequent `uploadId` import and owner setup. Start from the fake Git push in `W/features/site-backup/__tests__/integration/archive-round-trip.integration.test.ts:106–135`, reusing Q3's clean fixture when it lands. ZIP the folder from `FakeGitHub.files`, using the installed `zipFolderFiles` as demonstrated in `W/features/source-control/__tests__/github-backup-restore-accounts.integration.test.ts:27–40`. Run the ordinary upload, verify and complete-owner flow. The two acceptance cases are:

- **Fake provider push → download folder → owner upload → verified restore.** Assert a new site, restored portable database rows and media bytes, plugin quarantine, and owner setup. Preserve the existing target-site account assertions in the account regression.
- **A changed payload byte with the original manifest refuses before staging or allocating.** Keep the original inventory and change one non-database payload byte. Require a plain refusal such as “This ZIP does not match its backup manifest. Download the backup folder again.” The named mutation skips checking the original SHA-256 and must allow the tampered case to advance.

The adapter belongs at `W/features/site-backup/import-backend.ts:92–95` on the uploaded-file path, before staging. It needs the existing bounded archive reader and the original `tovu-backup.json` path, length and digest checks before any remapping. The current metadata scan expects `manifest.json`, the v2 manifest requires all five scopes, and the verifier requires `content.db` plus database-backed media checks. Still to pin are the exact v1 inventory reader changes, repository uploads and plugin package mappings, and the plain refusal for backups without the database or a required scope. The malformed v1 manifest fixture at `github-backup-restore-accounts.integration.test.ts:59–62` must still refuse. Hold source edits until those cases fit a sheet. Chrome/Electron look owed on the actual upload and owner setup.

**AG2–AG4 and admin parity.** Confirm the pushed AP-T and TV-AG1 results and the cloud lockfile candidate. AG2 still needs coordinated visitor server/browser file and test anchors, including idle timeout, safe errors and no reply. AG3 still needs the exact pending-provider handoff, binding and `/confirm` repoints. AG4 still needs the authorized browser delivery and admin binding witnesses. Admin reattach/status, attachment and final-footer coverage remain open. BYOK keeps its explicit provider mode during the Local CLI default flip and still needs its own AG-UI proof for full coverage.
