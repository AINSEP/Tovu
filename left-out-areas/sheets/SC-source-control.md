# SC: source control (contract + GitHub provider plugin) — revision 2

Re-verified 2026-11-17 on `origin/refactor/terra` = `integ/merge-final-2026-11-16` (Tovu 232764af5, Jini 65d73b0d5): every guard in this file's `*.files.tsv` and `JINI.blobs.txt` matches and `scripts/sidecars.py` regenerates the sidecars byte-identical. Revision-2 reading: Tovu `integ/merge-a-2026-11-16` e801e9ae (cross-checked with `integ/merge-b` 450ac748: the only difference in this folder is that merge-a deleted `repository-target.ts` and repointed `commit-site.ts` to Jini `repositoryTargetError`) and Jini `integ/merge-final-2026-11-16` af33fcdb.
Inventory `../inventory/source-control.tsv` (+ `.decls.tsv`). Guards `SC-*.files.tsv`, `JINI.blobs.txt`. Importer sites `SC-*.importers.tsv`. Run contract: `../COMMON-LO.md`.

## What exists today (verified)
- Website `features/source-control`: 14 files, 2,760 lines; 19 test files, 4,786. Admin `features/source-control`: 12 files, 1,825 (not sheeted; needs a Chrome check).
- Jini `packages/devops/src/source-control/`: `contracts.ts` 108, `commit.ts` 92, `registry.ts` 203, `kit.ts` 27, `repository-path.ts`, `repository-target.ts`, `entry.ts`. Blobs unchanged from round 1 (`JINI.blobs.txt`).
- GitHub is a plugin in Jini: `packages/agent-plugins/github/` (`tovu-source-control.json` + four `.mjs`, 1,262 lines). It imports no `@jini-ai/*` in production code (`rg -n "from ['\"]@jini-ai" packages/agent-plugins/github -g '!**/__tests__/**'` prints nothing; one test imports `@jini-ai/devops/source-control`).
- Tovu already consumes Jini pieces: `provider-kit.ts` wraps Jini `createSourceControlProviderKit`; `provider-registry.ts` uses Jini `registry.ts` generics (`import * as sourceControl`); `commit-site.ts` imports `normalizeRepositoryFolder`, `prefixRepositoryPath`, `repositoryTargetError`.

## Two ABIs exist, and the shipped plugin speaks the Tovu one (judge finding 4: ACCEPTED)
Jini `contracts.ts:33-41` ("New module ABI") and Tovu `provider-module.ts:160-175` are NOT the same contract, and the GitHub plugin implements the Tovu one. No module implements the Jini object ABI today. Complete member matrix:
| Member | Tovu `provider-module.ts` = what `github/source-control/*.mjs` implements | Jini `contracts.ts` | Disposition |
|---|---|---|---|
| runtime value `sourceControlSavedApiKeyLabels` (:22) | `Map([["github","github"]])`; readers: `server/runtime/composition/source-control-key-binding.ts:2,18,23`, `tool-registrations.ts:38,132,159`, `cli/commands/owner-store-mapping.ts:3,11` | absent | STAYS in Tovu (which saved custom API key may stand in for which provider is host policy). SC-3a moves it to its own file so `provider-module.ts` is types only |
| `commitSite` | `(input: CommitSiteInput)`; `branch` inside `input` | `(required, optional?: { branch })` | differs: the SC-2b binding adapts (does not spread `branch` into the first object) |
| `readAccountLabel` | `(token: string)` positional (`github.mjs:70`) | `(required: { token })` | differs: plugin ABI of record is positional |
| `commitFiles` | `(input, plan)` two positional arguments | one object with `plan` inside | differs |
| `inspectBackupRepository` | `(input)` with `branch?` inside | `(required, optional?: { branch })` | differs |
| `uploadBackupBlob` | `(target, file)` two positional arguments | `(required: { target, file })` | differs |
| `commitBackupTree` input | `entries`: a readonly array whose items are either `UploadedBackupBlob` or `InlineBackupText` (`backup-push.mjs:200-205`) | `blobs: readonly UploadedBackupBlob[]` | differs in NAME and in CONTENT: Jini has no inline text entry |
| `backupInlineTextMaxBytes` | optional number (`github.mjs:87`) | absent | Tovu-only; backup inline behaviour must be kept |
| kit `fetch` | `(url, init)` | `(required: { url, init })` | differs |
| kit `redirectGuardInit` / `assertNotRedirected` / `isRedirectRefusal` / `describeTransportError` | positional | one object each | differs (Tovu `provider-kit.ts:39-47` adapts positional -> object today) |
| kit `sleep` | present (`write-files.mjs:161` reads `kit.sleep ?? timer`) | absent | Tovu-only |
| kit `httpClient` | Tovu `HttpClientPort` (`send(request)`) | core `HttpClientPort` (`send({ request })`) | differs in argument shape (`provider-kit.ts:36` adapts) |
| `CommitFile.data` | a `string` or a `Buffer` | a `string` or a `Buffer` | same; names a Node type, so the type cannot live in `@jini-ai/core` |
| `SourceControlHostFacts`, `WriteFile`, `FileWritePlan`, `FileWriteState`, result unions, `BackupRepositoryState`, `UploadedBackupBlob`, `RepositoryTarget`, `DescribedTransportError` | same members | same members | identical shape: DEDUPE is safe for these only |
| `RepositoryTargetValidator` | `(target)` returning a `string` or `null` | `(required)` returning a `string` or `null` | same call shape (one object) |
Consequences: (1) the round-1 "types READY, differing members = STOP" classification is withdrawn; (2) the contract of record for a provider PLUGIN is the positional ABI installed plugins already implement (plugins are plain `.mjs`: a structural type check cannot catch a mismatch, lesson 12); (3) provider ABI and orchestration ports are separate contracts: the orchestration ports (`CommitOrchestrationArgs`, `CredentialResolverPort`, `FileSourcePort`, `CommitLayoutPort`) stay where they are in `devops`; (4) Jini's unimplemented object ABI is owner decision D-SC3 (retire, or schedule a plugin ABI v2 with an adapter); no sheet here depends on it.

## Target shape
| Layer | Home | Content |
|---|---|---|
| Plugin ABI v1 (types) | `@jini-ai/devops/source-control/plugin-abi` (NEW `node` subpath; SC-3b). Not `@jini-ai/core`: `CommitFile.data` is a `string` or a `Buffer`, and no plugin imports the types (plugins import nothing). D-SC1 is therefore NOT a prerequisite; a later move to core is a repoint | the positional operations, kit, module, backup entry types, exactly as shipped |
| Mechanism | `@jini-ai/devops/source-control` (exists) | registry generics, commit orchestration, repository path / target rules |
| Provider plugin | `packages/agent-plugins/github` (exists) | every GitHub endpoint, header and limit |
| Host (Tovu) | `features/source-control` | credential store over the Tovu vault, saved-key bindings, tool wording and registration, static-download layout, descriptor file name (D-SC2), trusted-plugin gate binding, kit binding (which transport is guarded), error wording |

## Credential and outbound-call trace (judge finding 5: ACCEPTED; class and location only)
Two transports and two loaders exist; round 1 merged them. Each row names the gate that really applies.
| Path | Where | Gate that applies today | Gate that does NOT apply |
|---|---|---|---|
| Credential CRUD over HTTP | `server/inbound/admin-http/routes/system/source-control-credentials.ts:106-112` (`rejectUnlessAuthorized`) | foreign-workspace refusal (`rejectForeignWorkspace`), authenticated principal, direct authorization for the credentials-write permission; then `store.ts` field checks (`assertCredentialFreeField`, `normalizeCredentialToken`), sealing through `SecretSealerPort`, label uniqueness | - |
| Token read for a commit | `commit-site.ts` `resolveCommitCredential` (:321) -> `store.ts` default lookup; fallback `resolveSavedApiKey` only for providers in `sourceControlSavedApiKeyLabels` | provider-id match before use; storage errors collapse to one fixed sentence | - |
| Outbound A: site commit | `github/source-control/commit-site.mjs:88-89` -> `kit.fetch` | NATIVE `fetch` (`provider-kit.ts:33`, `options.fetchFn ?? fetch`) wrapped in `trackFetch` (host/status span). Redirects: the kit is built with `fetchRedirectPolicy: "caller"` (`provider-kit.ts:42`), so the PLUGIN applies `kit.redirectGuardInit` + `kit.assertNotRedirected` itself | the egress guard of `HttpClientPort` does not see this call |
| Outbound B: account-label probe | `github/source-control/github.mjs:70-75` -> `kit.fetch` with the bearer token | native `fetch`, 1 timeout signal, failure = `null` | no egress guard; no `redirectGuardInit` at this call site (class: credentialed request that follows redirects). Recorded as hardening item SC-H1; not changed by a move sheet |
| Outbound C: custom file writes, backup inspect / upload / tree | `github/source-control/write-files.mjs:186` -> `kit.httpClient.send` (`backup-push.mjs` goes through the same request helper: confirm with check SC-T1 in the fenced block under this table) | guarded `HttpClientPort` (egress refusal -> `EgressRefusedError.callerSafeMessage` via `describeTransportError`) | - |
| Missing guarded client | `provider-kit.ts:16-18` `NO_HTTP_CLIENT` | every `httpClient.send` rejects with a transport error (the admin credential form path builds the kit without one and only probes the account name) | - |
| Plugin load, INSTALLED | `provider-registry.ts:90-100` `loadSourceControlProviderRegistry` -> `loadContributions` of the plugin lifecycle (composition `deps.ts:2800,2815`) | trusted-plugin gate: active + recorded digest + path inside the plugin root; a switched-off plugin's JSON is read as data, no module imported | - |
| Plugin load, BUNDLED | `provider-registry.ts:120-152` `loadBundledSourceControlProviderRegistry` -> `loadSourceControlProviderRegistryFromSource` (`:109-112`); callers `server/runtime/composition/app.ts:851`, `cli/commands/owner-store-mapping.ts:13` | location only: the root is the product payload (`bundledAgentPluginsDir()`), "never an operator-writable installation directory" (`:116`); duplicate ids refused; a bad package refuses only itself | NO install, activation or digest check (`:103-105` says so) |
| Provider failure text returned to the model | `commit-site.ts` `commitOutcome` (:517) | message redacted with the exact token; unknown failure code -> `PROVIDER_ERROR` | - |
| Thrown provider error | `commit-site.ts` `commitSiteToSourceControl` (:472) | fixed sentence to the caller; detail only to the log | - |

Check SC-T1 (Jini clone; copy from here, never from the table): the backup helper sends only through the git-data client, and that client sends only through `kit.httpClient`. Pass = command 1 prints at least one `git.postJson` line, commands 2 and 4 print nothing, command 3 prints the `kit.httpClient.send` line (`write-files.mjs:186` on Jini 65d73b0d5). Run 2026-11-17 on 65d73b0d5: 1 printed `:185,209,219`; 2 and 4 empty; 3 printed `:186`.
```bash
cd packages/agent-plugins/github/source-control
rg -n 'git\.postJson' backup-push.mjs                                      # 1: >= 1 line
rg -n -e 'kit\.fetch' -e '[^.]fetch\(' backup-push.mjs                     # 2: prints nothing
rg -n 'kit\.httpClient\.send' write-files.mjs                              # 3: >= 1 line
rg -n -e 'kit\.fetch' -e '[^.]fetch\(' write-files.mjs                     # 4: prints nothing
```

## Sheets
### SC-0 (TESTS, Tovu): gate tests on the real gates and production bindings
tests: new `features/source-control/__tests__/gates.characterization.unit.test.ts`, and added cases in the existing `server/inbound/admin-http/routes/system/__tests__/source-control-credentials.unit.test.ts`. precondition: none.
Each test fails when its gate is removed (mutation named in a comment, V3):
1. Installed loader: an inactive plugin contributes no provider and appears in `switchedOff`; a digest mismatch, a module path escaping the plugin root, and a non-`.mjs` module each drop only that provider (fake `loadContributions` built from the real `providerContribution` definition; one clause per test).
2. Bundled loader: with a fake `sources` that returns a package, the loader imports it with NO activation or digest input (assert the fake `load` receives the package unchanged); a throwing `sources` yields zero providers and the fixed refusal text; duplicate provider ids are refused. This pins that the bundled path's only gate is its root: a comment in the test says so.
3. Kit transports: build the production kit with a recording `fetchFn` and a recording `httpClient`; `kit.fetch(url, init)` reaches `fetchFn` only, with `init` UNCHANGED (caller redirect policy); `kit.httpClient.send` reaches the client only; without `httpClient`, `send` rejects with a transport error. Mutation: change `"caller"` to `"guard"` -> the unchanged-`init` assertion is RED.
4. `describeTransportError`: an `EgressRefusedError` yields its caller-safe message as `refusal`; any other error yields `refusal: undefined` and never the error text in `refusal`.
5. Route: a request for another workspace is refused before `authorize` is asked (recording fake: zero calls); a principal without the credentials-write permission is refused and the store fake records zero calls; both for every verb the route registers (enumerate them from the router, do not hard-code).
6. Saved-key fallback: used only for a provider id present in `sourceControlSavedApiKeyLabels`; never when the store throws.
STOP: a test needs the real network (S-NET); a gate cannot be reached without `mock.module` (report the missing seam, do not add one). Estimate: 120k.

### SC-1 (HARDEN, Jini): close five gaps in `commitSiteToSourceControl`
Files: `packages/devops/src/source-control/{commit.ts,contracts.ts}` + tests. precondition: `test "$(git hash-object packages/devops/src/source-control/commit.ts)" = 3fcf3201b62d4a2beee565b859dcabc4e915dfcb && echo ok`. Opus review of the diff before the wave is released (security). THIRD_PARTY_ALLOWED: none.
| # | Tovu (`commit-site.ts`) | Jini (`commit.ts`) | Change |
|---|---|---|---|
| G1 | provider failure message passes `redactSecrets(..., { exactSecrets: [token] })` | returns `result.message` unchanged | redact with the resolved token (`redactSecrets` from `@jini-ai/core`); also the caught-error text |
| G2 | `Object.hasOwn(codeMap, result.code) ? ... : "PROVIDER_ERROR"` | direct index | own-property check + fallback |
| G3 | three stages, three texts | one `describeError({ error })` | add an optional `stage` (one of `'export'`, `'arrange'`, `'credential'`, `'commit'`) to the argument (additive) |
| G4 | commit files come from the static-download layout after `claimArchivePaths` | `report.routes.succeeded + report.assets.succeeded` only | optional `CommitLayoutPort.arrangeFiles(required: { report }): readonly CommitFile[]`; absent = today's mapping; a throw -> `EXPORT_FAILED` with `describeError({ stage: 'arrange' })` |
| G5 | missing-credential text ends with a host sentence | generic sentence | optional `describeMissingCredential(required: { providerId }): string` |
Tests (vitest, fakes of the ports), each RED on the parent by V4, in the same commit as its fix; one commit per gap (G1+G1b, G2, G3, G4+order, G5), each green alone:
1. G1: adapter returns `{ ok:false, code:'provider-error', message:'x <TOKEN> y' }`; the outcome message has no token and still has `x` and `y`. G1b: adapter throws an Error holding the token, `describeError` echoes it; no token in the outcome.
2. G2: `code: 'made-up'`, `'constructor'`, `'__proto__'` each give `PROVIDER_ERROR`.
3. G3: recording `describeError`; stages `['export']`, `['credential']`, `['commit']` for the three injections, exactly once each.
4. G4: with `arrangeFiles` the adapter receives exactly the arranged files; `prefixRepositoryPath` still refuses an escaping arranged path (deny test first); without it, today's list; `cleanup` runs once after arrange, also when arrange throws (order `export, arrange, cleanup`).
5. G5: both branches.
Changesets: one per commit (`patch` G1, G2; `minor` G3-G5). STOP: a changed function over 50 lines / complexity 10 (S-SIZE): extract a helper, never exempt. Estimate: 110k.

### SC-2a (TESTS, Tovu): characterize `commit-site.ts` before it becomes a binding
tests: new `features/source-control/__tests__/commit-site.characterization.unit.test.ts`. precondition: none (does not need SC-1).
Through `commitSiteToSourceControl` (:472) and `previewCommitExport` (:435) with fakes of every dep, GREEN on the parent, each with a one-line V3 mutation:
- every refusal message byte for byte (invalid target, folder unsupported, credential storage failure, no credential, wrong provider, export throw, export failures summary, packaging collision, packaging generic, provider throw);
- the success object including `folder` and `entryPath`;
- token never in a returned message; unknown provider code -> `PROVIDER_ERROR`;
- call order validate -> credential -> export -> adapter; adapter NOT called when export fails; export NOT called when the credential is missing;
- `resolveSavedApiKey` used only when the default credential is absent, and not when the store throws;
- the run directory is gone after success and after a throw (temp dir).
Estimate: 110k.

### SC-2b (SEAM, Tovu): `commit-site.ts` becomes a binding over Jini's orchestration
precondition (S-PRE): `rg -n "arrangeFiles" node_modules/@jini-ai/devops/dist/source-control/contracts.d.ts` (the linked Jini clone is at an SC-1 SHA) and `ls apps/website/src/features/source-control/__tests__/commit-site.characterization.unit.test.ts`.
One commit: `commit-site.ts` (547) becomes at most 150 lines. It builds `CommitOrchestrationArgs`: `files` = closure over the static-site context and export; `layout.arrangeFiles` = static-download layout + `claimArchivePaths`; `credentials.resolve` = default credential then saved-key fallback; `describeError` by stage; `describeMissingCredential`; `adapter.commitSite = (required, optional) => provider.commitSite({ ...required, ...(optional?.branch ? { branch: optional.branch } : {}) })` (the plugin ABI takes `branch` inside the one input object: matrix above). It calls the Jini function and adds `folder` + `entryPath` to a success.
The SC-2a tests stay green UNEDITED; a test that needs editing = STOP. Export accounting: `rg -n "^export" apps/website/src/features/source-control/commit-site.ts` before and after; every name is reported as kept | now imported from Jini by each caller in `SC-2b.importers.tsv` | deleted with zero importers (S-CENSUS).
STOP: `rg -n "process\.env" apps/website/src/features/source-control/commit-site.ts` prints a line; S-MOCK; S-BLOB (guard re-pinned: `commit-site.ts` 547 lines, faa002ba, matches refactor/terra 232764af5). Estimate: 150k.

### SC-3a (SEAM, Tovu only): `provider-module.ts` becomes types only
One commit. New `features/source-control/saved-key-bindings.ts` holds `sourceControlSavedApiKeyLabels` with its comment (`provider-module.ts:20-22`); the three readers are repointed in the same commit: `server/runtime/composition/source-control-key-binding.ts:2`, `features/source-control/tool-registrations.ts:38` (keep `RepositoryTargetValidator` on the old import line), `cli/commands/owner-store-mapping.ts:3`. No test file imports the map today (`rg -l sourceControlSavedApiKeyLabels apps -g '**/__tests__/**'` prints nothing): add one unit test pinning the map's single entry.
End check: `rg -n "^export (const|function|class|let|enum)" apps/website/src/features/source-control/provider-module.ts` prints nothing. Estimate: 40k.

### SC-3b (SEAM+MOVE, both repos): plugin ABI v1 types to Jini
precondition: SC-3a landed (the `rg` above prints nothing) and SC-2b landed (`wc -l` of `commit-site.ts` <= 150).
- M1 (Jini TESTS, own commit): `packages/agent-plugins/github/source-control/__tests__/abi-shape.test.mjs`: `create(kit)` with a recording kit returns exactly the seven operations plus `backupInlineTextMaxBytes`; `readAccountLabel.length === 1`; `uploadBackupBlob.length === 2`; `commitFiles.length === 2`; calling `readAccountLabel("t")` reaches the kit's `fetch` as `(url, init)` (two positional arguments, recorded). This pins the positional ABI at runtime.
- M3 (Jini): `packages/devops/src/source-control/plugin-abi.ts` = the seamed `provider-module.ts` copied with its doc comments, neutral wording (the descriptor file name is described as "the host's descriptor file"); `repositoryPaths` typed from the local `repository-path.js` leaf. New subpath `./source-control/plugin-abi` (exports + `jini.entries: node` + README line + changeset `minor`) in this commit. The existing `contracts.ts` is not edited; names that exist in both are NOT re-exported from `entry.ts` (two different shapes share names: the subpath keeps them apart).
- M4 (Tovu): delete `provider-module.ts`; repoint every row of `SC-3b.importers.tsv` (11 prod / 13 test importers at round 1: recount with the sidecar) to `@jini-ai/devops/source-control/plugin-abi`; `provider-kit.ts` keeps its positional adaptation and its own why-comment.
THIRD_PARTY_ALLOWED: none (the `Buffer` type is global). STOP: an importer row uses `*` or a dynamic import; S-TEXT. Estimate: 150k.

## Design queue (not dispatchable; each needs an Opus pass that produces one-run sheets)
- SC-3d registry split: `provider-registry.ts` 318 (19 export statements; module-level `sharedRegistry` state cell, owner = composition root; product wording `noSourceControlProviderMessage`, `switchedOffPluginSentence`, `AGENT_PLUGINS_SCREEN`; `SOURCE_CONTROL_PROVIDERS_FILENAME` = D-SC2) and `credential-form.ts` 108 (check against Jini `DescriptorExtensionReader` first). Input: the SC-0 loader tests. Opus 60k.
- SC-4 credential store: `store.ts` 559, `types.ts` 107, repos, `credential-setup.ts` 226. Diff against `features/deployments/publish-credentials/store.ts` and Jini `platform/secrets/credential-sets` (one shared mechanism or a written reason for three). Constraint: a saved credential is never changed automatically: the account-label probe writes a label only; pin that it never rewrites the token or connection fields before any move. `proposeSourceControlCredential` is over 50 lines: split in Tovu first. Opus 150k; execution about three runs, 360k.
- SC-5 tools: `tool-registrations.ts` 511 (two units over 50 lines) + `commit-schema.ts` 31; lane K's tools pattern; the approval gate of `source_control_execute_commit` is traced end to end and a test fails when the approval requirement is removed, before the handler moves. After SC-3b and SC-3d. About two runs, 220k.
- SC-H1 (hardening item found by the trace, not scheduled): the account-label probe sends a bearer token through native `fetch` without the redirect guard. Owner decision D-SC4.

## Could not verify
- No test was run. Message strings were read, not executed.
- That `backup-push.mjs` reaches the network only through the guarded client (command given in the trace).
- The admin screens (`ProvidersTab.tsx` and others).
