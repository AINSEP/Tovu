# Round 3 w3c-w1a — Tovu working-tree delivery

Dispatch: Tovu only, no agents, `.git` read-only. Initial HEAD: `35367ac24959b089f73cec50bbbcc1b7a8b63c7d` (`codex/tv-r3-w1a`). The checked sheets, literal FIX text and approved owner answers are the spec. No tests, builds, installs, typechecks or linters may run. Package intake, versions, locks and Jini changes are outside this delivery.

Programmer persona and governing bootstrap read from `/Users/la/Programming/Tovu/AI-Dev-Shop/`. The clone intentionally has no AI-Dev-Shop or ADS-memory architecture/memory files; dispatch supplies the approved design. Pattern: named host bindings over the exact new Jini subpaths, no new generic abstractions. Tests are authored before production changes; mutation names are intended kill targets, not verified mutation results.

Jini counterpart: `origin/codex/r3-w1aj`, report `../o-r3-w1aj/r3-w1aj.md`; detailed plan read from `../c-r3-w1aj/COMMIT-PLAN.md`. Its named portable tests precede implementation. The host-only vault ordering witness was added before its corresponding cut; purge stopped before its required host witnesses could be written.

## Completed design commits, in check order

1. **W1-10 — Plugin widget partials**
   - Delete `apps/website/src/features/plugin-runtime/widget-partials.ts`.
   - Change `apps/website/src/server/inbound/public-http/routes/site/pages/response.ts` and `apps/website/src/features/plugin-runtime/__tests__/integration/contribution-runtime.integration.test.ts` to consume `@jini-ai/plugins/runtime/widget-partials`, binding the current marker parser, validator, slots and expansion.
   - Tests first: Jini's `runtime/__tests__/widget-partials.test.ts` was authored before implementation (3 named cases), inspected before this cut. Keep the Tovu integration lifecycle/reload/disable witnesses.
   - Mutations: `PLUGIN-PARTIAL-ASSUME-ENABLED`, `PLUGIN-PARTIAL-SKIP-VALIDATION`. No mutation or test execution claimed.


2. **W1-02 — API connection vault records/attempts/archive**
   - Create `apps/website/src/features/api-connections/vault-store-binding.ts`, keeping the real vault constructor and exact authorization, metadata formats, labels, SHA-256 and owner-reference prefixes. Bind the three existing host-signature wrappers to `@jini-ai/integrations/api-connections/vault-stores`.
   - Delete `apps/website/src/features/api-connections/vault-stores.ts`; repoint the named host callers and saved-keys source assertion. Remove its obsolete catch-debt entry.
   - Tests first: add `vault: scope is checked before metadata parsing` in the existing `vault-stores.unit.test.ts` BEFORE production edits. It sends invalid metadata under wrong workspace/kind/owner and expects the `context` refusal. Mutation: `API-VAULT-SCOPE-CHECK-AFTER-PARSE`.
   - Jini's seven `api-connections/__tests__/vault-stores.cutover.test.ts` cases were inspected: consume-once, copied-key refusal, archive exclusions/count-only notices, receiver generation/owner, invalid pair proof, sweep revisions and record CAS. Mutations: `API-ATTEMPT-DELETE-WITHOUT-REVISION`, `API-ARCHIVE-CARRY-SOURCE-OWNER`, `API-ARCHIVE-CARRY-STAGED-STATE`, `API-RECORD-SKIP-KEY-BINDING`, `API-ARCHIVE-SKIP-GENERATION-CHECK`, `API-ARCHIVE-SKIP-DERIVED-KEY-CHECK`, `API-SWEEP-DELETE-WITHOUT-REVISION`, `API-RECORD-CAS-IGNORE-REVISION`.
   - Preserve Tovu's pre-existing plugin-state metadata-byte fixture; uncapped sweep remains in Jini. No new cap, codec alias, vault kind or migration.

3. **W1-03 — Credential DELETE review and file validation**
   - Create `apps/website/src/features/custom-credentials/repository-target.ts`, binding the existing devops validator to Jini. Delete `delete-request-confirmation-ui.ts` and `write-files-validation.ts` in that feature.
   - Import portable validation directly from Jini. Keep `MAKE_CREDENTIALED_REQUEST_TOOL_ID` and the exact branded irreversible sentence in the existing host registrar. Repoint target validation importers, split the backup import, and rewrite all observed positional validator calls to the optional object (nine test calls plus the backup and source-control write-port calls). The write-port callback type changes with its invocation; late reads and effect order stay intact.
   - Tests first: inspect Jini's five named tests in `custom-credentials/__tests__/{delete-request-confirmation-ui,write-files-validation}.test.ts` before the host cut. Mutations: `CRED-DELETE-REVIEW-DROP-PATH`, `CRED-DELETE-REVIEW-DANGER-OFF`, `CRED-WRITE-DUP-CHECK-BEFORE-NORMALIZE`, `CRED-WRITE-OMIT-TOTAL-LIMIT`, `CRED-WRITE-ALLOW-GIT-DIR`, `CRED-WRITE-ALLOW-DOTDOT`, `CRED-BRANCH-ALLOW-DOTDOT-SEGMENT`.
   - Keep existing host approval/cancel, validation-before-resolution, network-failure and model-facing assertions; only import/ABI edits. Remove the named obsolete architecture edge. No integrations→devops edge or exchange added.

## Stopped, dependent and rejected sheets

Source-verified stops:

- **W1-06 and W1-07:** `origin/codex/r3-w1aj:packages/cms/src/publish/content/repo-handler.ts` has no `applyRunActor` export (ends at 437; line 372 still uses `deps.mutationActor ?? { id: input.principalId, kind: "user" }`). W1-06's Tovu source already calls the missing function; W1-07 still guesses `user`. Required Jini contributors and refusal prerequisite were not built. No Tovu edit.
- **W1-08:** stopped before production changes because mandatory SQL witness `PURGE-DELETE-ISSUER-KEYS` requires an `api_keys` issuer-principal column that does not exist. `content-database.generated.ts:140–153` and `schema.sqlite.ts:1203–1222` contain only `principal_id` and `issued_policy_id` (the latter is a permission snapshot, not an issuer). Cannot seed the sheet's row whose issuer names the purged principal without a forbidden schema change or inventing a different witness. The Jini purge implementation exists, but no host extraction was attempted after this prerequisite mismatch.
- **W1-01:** round-2 R03 identity-read edits are absent in this tree: `exports/source.ts:35` still calls `parseAgentPluginManifest({ value: JSON.parse(raw) })` without `identityRead`; `install-upload.ts:137` does likewise, and `:234` reads identity without the required descriptor. The Jini handoff also stopped because upload ports omit the bound installer required at Tovu `install-upload.ts:207,312`. No partial cut.
- **W1-04A:** catalog reads `registry.list().filter(p => typeof p.module.listSecrets === "function")` at `deploy-ops/agent-tools.ts:26`, but the approved factory receives descriptors/copy/maxWaitSeconds only. Descriptors cannot preserve executable secret-capability filtering. Jini A was not built. No invented input or partial cut.
- **W1-04B/C/D:** dependent on stopped A; left untouched.
- **W1-11:** dependent on absent actor prerequisite (round-2 33/34) and missing Jini W1-11 implementation; left untouched. Tovu `post-retire.ts:4` still imports the host removal contract and publish retire still guesses `user` at `:521`, so its round-2 cutover prerequisite is also visibly incomplete. No `post-removal` added.
- **Appendix A1 / W1b-09c:** stopped on final source/contract review; its attempted host cut and pure-table test-import edit were fully withdrawn. The original `ensureSiteKey` reads the per-site file at `:229` and then resolves metadata at `:236`. The literal Appendix A1 binding supplies `readPerSite: () => readRawSiteKeyMaterial(...)` but eagerly evaluates `stampedFingerprint: resolveSiteKeyFingerprint(...)` before calling `reconcileRootKey`; Jini calls `ports.readPerSite({})` inside that later call. This reverses the two reads, conflicting with the dispatch's mandatory effect/deferred-read order. Preserving order needs a lazy getter or a revised port contract, neither is specified; did not invent either. The counterpart's nine tests do not observe the host's eager field evaluation. No root-key change remains in this tree.
- **Appendix A2 / W1-01B:** dependent on stopped W1-01; no Jini implementation; left untouched.

- W1-05: REJECT, email-template host binding stays.
- W1-09: REJECT duplicate, round-1 J08/T08 owns newsletter mapper.
- All w3c-w2: REJECT duplicate; no work.

## Verification and review

Verification UNRUN by explicit dispatch. No green baseline or runtime verification is claimed. Read-only `git diff --check` passed. Inspected all changed hunks, the two new binders, the named Jini contracts and tests, and targeted references in the named feature/composition areas. A literal scan of changed files found no stale imports of the deleted implementations. No repo-wide code search or codebase-memory tool was used.

Architecture review: host policy/FS/SQL remain host-owned, portable behavior calls the new Jini entries, no new package dependency or process owner. No extra public type, generic port, helper, re-export shell, validation/fallback or suppression added. The archive wrapper retains its existing `VaultArchiveEntry[]` return by a narrow structural assertion: Jini declares `kind: string`, while platform declares the core `VaultKind` union; the inspected algorithm never changes an entry’s kind and receives only host `VaultArchiveEntry` rows. No runtime coercion or new type was added. Runtime/SQL/filesystem verification and mutation kills remain **UNRUN**; architectural blockers for stopped sheets are above.

Function review (reading only, no numerical metrics claimed): `createApiConnectionVault` keeps its exact scope-before-parser authorization; the three vault wrappers and repository-target binder only bind specified policy; widget render callbacks keep parser/validator/theme owners. Direct evidence is the retained/added tests named per sheet. Variable names and optional-field construction were re-read; no new behavior or retained speculative abstraction was found. Existing approval/cancel, SQL rollback/dialect, metadata fixture and real-filesystem tests remain the witnesses.

| Assessed unit | Disposition by reading | Evidence / limitation |
|---|---|---|
| `createApiConnectionVault` and policy | NO_RECORDED_FINDINGS | Constructor body preserved; real-service scope-before-parser test added; execution unrun. |
| Three vault wrappers | NO_RECORDED_FINDINGS | Existing signatures, exact policy binding; archive assertion narrows only unchanged kind values. |
| `validateRepositoryTarget` and write-port callback | NO_RECORDED_FINDINGS | Provider validator bound once, optional callback omitted when absent; existing provider refusal tests retained. |
| DELETE approval callback | NO_RECORDED_FINDINGS | Exact existing tool ID and branded sentence passed to Jini; held-open host witnesses retained. |
| Widget render callbacks | NO_RECORDED_FINDINGS | Same marker parse, validator and theme expander; Jini activation/ordering tests plus existing host lifecycle witnesses. |

Zero-findings skepticism: compared statements and output shapes against the original owners, inspected callback/error identities and argument presence, and audited new variable names against computed values. The archive type narrowing and Appendix A1 read reversal were specifically investigated; the former preserves the inspected contract and the latter caused withdrawal. No numeric quality, coverage or complexity result is claimed.

## Diff cleanup deletions

- Removed an unnecessary conditional indexed type from the widget test binding before delivery; the exact Jini render port provides contextual types.
- Removed all attempted Appendix A1 host and test-import edits after the eager-stamp/read-order conflict was found. The original files were restored byte-for-byte from this tree’s HEAD; no other changes were reverted.

## Pre-completion handoff

- Re-read the sheet/FIX and diff for each completed cut; retained only specified host bindings/import edits/test witness/baseline removals.
- Fresh read-only evidence: `git diff --check` clean; current diff and named import inventories inspected. No execution/coverage/mutation evidence claimed.
- Direct test seams: vault scope uses the real service; repository rules use the existing provider validation tests; widget rendering uses the real integration lifecycle.
- Function review: the new vault/target bindings and rendering callbacks only bind named inputs. No new algorithm, retention, cache, loop, background effect or network path was introduced. Existing file-size debt was not repaired outside the design.
- Open items: stopped-sheet prerequisites/design gaps; Opus package intake, test/build/typecheck/API and mutation verification after integration. Do not claim this whole set complete.

## Exact file inventory for coordinator commits

### W1-10

- `apps/website/src/features/plugin-runtime/__tests__/integration/contribution-runtime.integration.test.ts` (change)
- `apps/website/src/features/plugin-runtime/widget-partials.ts` (delete)
- `apps/website/src/server/inbound/public-http/routes/site/pages/response.ts` (change)

### W1-02

- `apps/website/src/features/api-connections/__tests__/host.unit.test.ts` (change)
- `apps/website/src/features/api-connections/__tests__/plugin-state-format.pin.unit.test.ts` (change)
- `apps/website/src/features/api-connections/__tests__/plugin-state.unit.test.ts` (change)
- `apps/website/src/features/api-connections/__tests__/shared-api.unit.test.ts` (change)
- `apps/website/src/features/api-connections/__tests__/shared-bindings.postgres.test.ts` (change)
- `apps/website/src/features/api-connections/__tests__/shared-owner.integration.test.ts` (change)
- `apps/website/src/features/api-connections/__tests__/vault-stores.unit.test.ts` (change)
- `apps/website/src/features/api-connections/host-bindings.ts` (change)
- `apps/website/src/features/api-connections/shared-owner.ts` (change)
- `apps/website/src/features/api-connections/vault-stores.ts` (delete)
- `apps/website/src/features/external-mcp/__tests__/external-mcp-shared-oauth.test.ts` (change)
- `apps/website/src/features/project-keys/__tests__/site-reference.unit.test.ts` (change)
- `apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts` (change)
- `apps/website/src/features/site-backup/__tests__/saved-keys-api.test.ts` (change)
- `apps/website/src/features/site-backup/__tests__/saved-keys-quality.test.ts` (change)
- `apps/website/src/server/inbound/public-http/routes/api-connections/__tests__/oauth-callback.unit.test.ts` (change)
- `apps/website/src/server/runtime/composition/__tests__/commerce.integration.test.ts` (change)
- `apps/website/src/server/runtime/composition/deps.ts` (change)
- `apps/website/src/server/runtime/composition/project-store.ts` (change)
- `apps/website/src/server/runtime/composition/site-deps/assistant-credentials.ts` (change)
- `apps/website/src/server/runtime/composition/site-deps/outbound-connections.ts` (change)
- `apps/website/src/server/runtime/composition/site-deps/shared-oauth-commerce.ts` (change)
- `development/scripts/error-gate-debt.json` (change)
- `apps/website/src/features/api-connections/vault-store-binding.ts` (create)

### W1-03

- `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-write-files.unit.test.ts` (change)
- `apps/website/src/features/custom-credentials/__tests__/tool-registrations.model-facing-errors.test.ts` (change)
- `apps/website/src/features/custom-credentials/__tests__/write-files-confirmation.test.ts` (change)
- `apps/website/src/features/custom-credentials/__tests__/write-files-network-failure.model-facing.test.ts` (change)
- `apps/website/src/features/custom-credentials/__tests__/write-files-validation.unit.test.ts` (change)
- `apps/website/src/features/custom-credentials/agent-tools.ts` (change)
- `apps/website/src/features/custom-credentials/delete-request-confirmation-ui.ts` (delete)
- `apps/website/src/features/custom-credentials/tool-registrations.ts` (change)
- `apps/website/src/features/custom-credentials/write-files-validation.ts` (delete)
- `apps/website/src/features/site-backup/backup-service.ts` (change)
- `apps/website/src/features/source-control/__tests__/credential-binding.pin.unit.test.ts` (change)
- `apps/website/src/features/source-control/__tests__/write-port.unit.test.ts` (change)
- `apps/website/src/features/source-control/write-port.ts` (change)
- `apps/website/src/server/runtime/composition/credentials-host-ports.ts` (change)
- `development/scripts/check-architecture.baseline.json` (change)
- `apps/website/src/features/custom-credentials/repository-target.ts` (create)

`COMMIT-PLAN.md` is uncommitted coordinator scratch; do not commit it. The intended source/test/config inventory is 43 paths: 2 creates, 37 changes, 4 deletions. Existing tests deleted: 0. New Tovu tests: 1. Portable Jini tests inspected for completed cuts: 15 (3 widgets, 7 vault, 5 credentials). No source change remains for stopped/dependent/rejected sheets.
