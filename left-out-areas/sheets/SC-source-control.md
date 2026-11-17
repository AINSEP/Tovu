# SC: source control (contract + GitHub provider plugin)

Measured on Tovu `integ/merge-b-2026-11-16` dd70b057, Jini `integ/merge-b-2026-11-16` 674a19ea.
Inventory: `../inventory/source-control.tsv` (+ `.decls.tsv`). Guards: `SC-*.files.tsv`, `JINI.blobs.txt`. Importer sites: `SC-*.importers.tsv`.
Assemble a run: `cat <move-templates>/T-<KIND>.md SC-source-control.md(the one sheet section) <move-templates>/COMMON.md`.

## What exists today (verified)
- Website `features/source-control`: 15 files, 2,774 lines; 19 test files, 4,786 lines. Admin `features/source-control`: 10 files, 1,729 lines (labels exist in CLASSIFY-files; not sheeted here, needs a Chrome check).
- **The contract already exists in Jini**: `packages/devops/src/source-control/contracts.ts` (108 lines): provider operations (`commitSite`, `readAccountLabel`, `planFileWrite`, `commitFiles`, `inspectBackupRepository`, `uploadBackupBlob`, `commitBackupTree`), host facts, provider kit, registry, catalog port, commit orchestration ports.
- **GitHub is already a plugin in Jini**: `packages/agent-plugins/github/` with `tovu-source-control.json` (descriptor, 117 lines) and `source-control/{github,commit-site,write-files,backup-push}.mjs` (1,262 lines). No GitHub API origin string is left in `apps/website/src/features/source-control` production code (`rg -n "api.github.com" apps/website/src/features/source-control -g '!__tests__'` prints nothing on merge-b).
- **Tovu still carries legacy twins** of code Jini owns: `commit-site.ts` 541 vs Jini `commit.ts` 92; `provider-module.ts` 228 (types) vs Jini `contracts.ts`; `provider-registry.ts` 318 vs Jini `registry.ts` 203. `provider-kit.ts` (50) already delegates to Jini `createSourceControlProviderKit`.
- No other plan claims any file of this folder (checked: lanes K/T/S/U, xpkg, publish-engine, env-schema, lost-updates). Other features import it: `site-backup`, `custom-credentials`, `vendor-credentials`, `cli/commands`, `server/routes`, `server/runtime/composition`, `assistant`.

## Target shape
| Layer | Home | Content |
|---|---|---|
| Contract (types only) | `@jini-ai/core/contracts/source-control` (NEW, owner decision D-SC1) | provider operations ABI, host facts, result unions, `SourceControlProviderModule`, kit shape. No Node, no library types. |
| Mechanism | `@jini-ai/devops/source-control` (exists) | registry loader, commit orchestration, repository path/target rules. Imports core only. |
| Provider plugin | `packages/agent-plugins/github` (exists) | every GitHub endpoint, header and limit. One default provider: `github`. |
| Host (Tovu) | `features/source-control` | credential store over the Tovu vault, tool wording and registration, static-download file layout, descriptor file name, trusted-plugin gate binding, error wording. |

## Credential and outbound-call trace (security; class and location only)
| Step | Where | Gate that must survive |
|---|---|---|
| Token entered | admin form -> `routes/system/source-control-credentials.ts` -> `store.ts:createSourceControlCredential` (375-395) | `assertCredentialFreeField`, `normalizeCredentialToken`, sealed by `SecretSealerPort`; label uniqueness per site |
| Token read for a commit | `commit-site.ts:resolveCommitCredential` (315-359) -> `store.ts:resolveDefaultForSourceControl` (544-559); fallback `resolveSavedApiKey` | provider-id match check before use; storage errors collapse to one fixed sentence |
| Outbound call | plugin `.mjs` -> kit `fetch` -> Tovu `platform/http` `HttpClientPort` (`provider-kit.ts`) | egress guard (`EgressRefusedError`), redirect refusal (`assertNotRedirected`), `trackFetch` telemetry; plugin code never gets a raw `fetch` |
| Plugin code load | `provider-registry.ts:loadBundledSourceControlProviderRegistry` (120-152) | trusted-plugin gate: active + recorded digest + path inside plugin root + `.mjs` |
| Provider failure text returned to the model | `commit-site.ts:commitOutcome` (511-541) | message redacted with the exact token; unknown failure code falls back to `PROVIDER_ERROR` |
| Thrown provider error | `commit-site.ts:commitSiteToSourceControl` (466-506) | fixed sentence to the caller; detail only to the log through `describeErrorForLog` |

## SC-1 (Jini, behaviour change, failing tests FIRST): close four gaps in `commitSiteToSourceControl`
kind HARDEN. Files: `packages/devops/src/source-control/{commit.ts,contracts.ts}` + tests. Prerequisite: none. Opus review of the diff before it merges (security).
Verified gaps (Tovu behaviour that Jini's twin does not have; each is a regression if Tovu adopts Jini as is):
| # | Tovu (`commit-site.ts`) | Jini (`commit.ts`) | Change |
|---|---|---|---|
| G1 | provider failure message passes `redactSecrets(..., { exactSecrets: [token] })` | `commitExportedFiles` returns `result.message` unchanged | redact with the resolved token (import `redactSecrets` from `@jini-ai/core`); also redact the caught-error text |
| G2 | `Object.hasOwn(codeMap, result.code) ? ... : "PROVIDER_ERROR"` | direct index: an unknown code from a plain-JS module yields `code: undefined` | own-property check + fallback |
| G3 | three stages have three texts: export throw -> `export failed before committing could start: <message>`; credential store throw -> one fixed sentence; provider throw -> one fixed sentence + log | one `describeError({ error })` for all three | add `stage: 'export' \| 'arrange' \| 'credential' \| 'commit'` to the `describeError` argument (additive; old hosts ignore it) |
| G4 | commit files come from the static-download layout (readme, landing file, metadata, redirects) after `claimArchivePaths` | files are `report.routes.succeeded + report.assets.succeeded` only | add optional `CommitLayoutPort.arrangeFiles(required: { report }): readonly CommitFile[]`; absent = today's mapping; a throw maps to `EXPORT_FAILED` with `describeError({ stage: 'arrange' })` as the whole message |
| G5 | missing credential text ends with a host sentence (admin screen pointer) | generic sentence | add optional `describeMissingCredential(required: { providerId }): string` |
Tests (vitest, fakes of the ports; each must be RED on the parent):
1. G1: fake adapter returns `{ ok:false, code:'provider-error', message:'x <TOKEN> y' }`; assert the outcome message does not contain the token and still contains `x` and `y`. Mutation: delete the redact call -> RED.
2. G1b: fake adapter throws an Error whose message holds the token, host `describeError` echoes it; assert no token in the outcome.
3. G2: adapter returns `code: 'made-up'`; assert `code === 'PROVIDER_ERROR'`. Also `code: 'constructor'` and `'__proto__'` (prototype keys).
4. G3: `describeError` fake records stages; assert `['export']`, `['credential']`, `['commit']` for the three failure injections, in that order of calls, exactly once each.
5. G4: with `arrangeFiles`, assert the adapter receives exactly the arranged files (paths and bytes) and that `prefixRepositoryPath` still rejects an escaping path from the arranged list (deny test first); without it, assert today's list.
6. G4 order: `cleanup` runs once after arrange, also when arrange throws (recording fake; assert order `export, arrange, cleanup`).
7. G5: both branches (with and without the port).
STOP: `git hash-object packages/devops/src/source-control/commit.ts` is not `3fcf3201b62d4a2beee565b859dcabc4e915dfcb` -> re-diff the table first. STOP if any changed function exceeds 50 lines / complexity 10 (`node_modules/.bin/eslint -f json packages/devops/src/source-control/commit.ts`): extract a helper, never exempt. Changeset `patch` (G1, G2) + `minor` (new optional ports) in one file.
Estimate: 110k tokens.

## SC-2 (Tovu): adopt Jini commit orchestration, delete the twin `commit-site.ts`
kind DEDUPE (DELETE-AFTER-PARITY). Prerequisite: SC-1 published and installed (`rg -n "arrangeFiles" node_modules/@jini-ai/devops/dist/source-control/contracts.d.ts` prints a line; else SKIPPED).
Commit T0 (tests only, on unmoved code; `features/source-control/__tests__/commit-site.characterization.unit.test.ts`): pin, through `commitSiteToSourceControl` and `previewCommitExport` with fakes of every dep:
- the seven refusal messages byte for byte (invalid target, folder unsupported, credential storage failure, no credential, wrong provider, export throw, export failures summary, packaging collision, packaging generic, provider throw);
- the success object including `folder` and `entryPath` (landing file under the folder);
- G1/G2 behaviour (token never in the message; unknown code);
- call order: validate -> credential -> export -> adapter; adapter is NOT called when export fails; export is NOT called when the credential is missing;
- `resolveSavedApiKey` fallback is used only when the default credential is absent, and is not called when the store throws;
- the run directory is removed on success and on throw (temp dir, assert it is gone).
Each test names its one-line mutation in a comment (the cloud run applies it, expects RED, reverts).
Commit T1: `commit-site.ts` becomes a binding of at most 150 lines: builds `CommitOrchestrationArgs` (`files` = closure over `staticSiteContext` + `exportSiteBound`; `layout.arrangeFiles` = `prepareStaticReport` + `staticDownloadLayout` + `claimArchivePaths`; `credentials.resolve` = default credential then saved-key fallback; `describeError` by stage; `describeMissingCredential`), calls the Jini function, adds `folder` + `entryPath` to a success. Port compatibility is checked member by member, not by `implements`: `commitSite(required, optional)` takes `branch` in the SECOND argument in Jini but Tovu's `gitAdapter.commit` takes it in the first (`commit-site.ts` 486-494): the binding must not spread `branch` into the first object. T0 must stay green unchanged; a T0 test that needs editing = STOP.
Importers to keep working: `server/routes` (1 prod), 3 test files (`SC-2.importers.tsv`). Keep `validateCommitTarget`, `toCommitFile`, `commitExportDir`, `previewCommitExport`, `commitSiteToSourceControl` export names (14 export statements today; list them with `rg -n "^export" apps/website/src/features/source-control/commit-site.ts` and account for every one in the report: kept | now imported from Jini by each caller | deleted with zero importers).
STOP: `process.env` appears in the binding; a `vi.mock` of `@jini-ai/devops` internals is needed; the file `commit-site.ts` differs from blob in `SC-2.files.tsv` (merge-a changed this file: regenerate sidecars on the merged tree first).
Estimate: 170k tokens.

## SC-3 (both repos): provider types and registry
kind DEDUPE + MOVE. Files: `SC-3.files.tsv` (5 files, 724 lines). Prerequisite: D-SC1 decided; SC-2 landed (it removes the last local user of `SourceControlCommitResult`).
- `provider-module.ts` (26 export statements, 11 prod / 13 test importers): diff each exported type against Jini `contracts.ts` (`diff <(rg -o "export (interface|type) \w+" -r '$0' apps/website/src/features/source-control/provider-module.ts | sort) <(rg -o "export (interface|type) \w+" -r '$0' <jini>/packages/devops/src/source-control/contracts.ts | sort)`). Identical-shape types: repoint every importer to Jini and delete. Any type whose members differ: list the member, STOP (do not pick a side).
- `provider-registry.ts`: 19 export statements. Generic (already or to Jini): descriptor parse, reserved/workflow path checks (`findReservedPath`, `isUnderWorkflowPath`), provider build. STAY (Tovu): `SOURCE_CONTROL_PROVIDERS_FILENAME` (D-SC2), bundled sources, trusted-plugin gate binding, `noSourceControlProviderMessage` / `switchedOffPluginSentence` / `AGENT_PLUGINS_SCREEN` (product wording), module-level `sharedRegistry` (state cell: one registry per process; its owner stays the composition root).
- `credential-form.ts` (108): descriptor form parser; generic -> `@jini-ai/devops/source-control` next to the descriptor reader (Jini already has `DescriptorExtensionReader`: check whether the parser duplicates it before moving).
Characterization first: registry loads only trusted entries (deny tests per clause: inactive plugin, digest mismatch, path escaping the root, non-`.mjs` extension, bad module drops only itself); refusal sentences contain no file-system path outside the plugin root.
State: READY for the type DEDUPE; the registry split needs a short Opus pass (dependency graph of the 19 exports; late-bound `sharedRegistry` read). Estimate: 160k + 60k Opus.

## SC-4 (design needed): credential store (`store.ts` 559, `types.ts` 107, repos, `credential-setup.ts` 226)
CLASSIFY says `integrations` / `ui`; neither was diffed. Jini has `packages/platform/src/secrets/credential-sets/` (the deployments store targets it too). Outline only:
1. Diff `store.ts` against `features/deployments/publish-credentials/store.ts` (714) and Jini `platform/secrets/credential-sets`: three credential-set stores with shared invariants (label rules, default selection, account-label probe, sealed token, unique-label race). The reuse rule applies: one shared mechanism, or a written reason for three.
2. Never change a saved credential automatically: the account-label probe (`probeAccountLabel` 64-92, `probeSavedConnection` 411-423) writes a label; pin that it never rewrites the token or connection fields.
3. `proposeSourceControlCredential` is 106 lines (limit 50): split in Tovu before any move.
Not runnable. Estimate for the design: 150k Opus; execution 300k-450k.

## SC-5 (outline): tools -> `@jini-ai/devops/source-control/tools`
`tool-registrations.ts` 511 (`buildSourceControlRegistrations` 120 lines, `source_control_execute_commit` handler 83 lines: both over 50) + `commit-schema.ts` 31. Pattern: `K/K-TOOLS-PATTERN.md` (lane K). After SC-2 and SC-3. The approval gate of `source_control_execute_commit` (`sourceControlDerivedRisk` 204-212) and `contracts/core/tool-metadata/source-control.ts` must be traced end to end before the handler moves: a test must fail when the approval requirement is removed. Estimate: 220k.

## Could not verify
- That the plugin `.mjs` modules import nothing from `@jini-ai/*` (`rg -n "from ['\"]@jini-ai" <jini>/packages/agent-plugins/github` at execution).
- Whether `credential-form.ts` duplicates a Jini parser. Whether admin `ProvidersTab.tsx` (464) already has a Jini twin (CLASSIFY says DEDUPE-AFTER-HARDENING).
- No test was run; message strings above were read, not executed.
