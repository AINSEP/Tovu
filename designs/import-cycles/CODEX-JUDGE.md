Software Architect(Review): **Verdict: needs rework.**

Reviewed design ref `a5c861ed`, Tovu `65302ee5`, and Jini `02edbb68`, using Git reads without editing or checking out files. Below, Tovu paths are relative to `apps/website/src/`; Jini paths begin with `packages/`.

Independent TypeScript emission analysis reproduces Tovu’s 2,133 files, 8,615 internal import statements, 6,355 runtime statements, 15 dynamic imports, 127 runtime feature edges, 24-feature SCC, and zero runtime file SCCs. No dynamic import crosses feature boundaries. Removing the chosen five edges reproduces `24 → 7 → 5 → 3+2 → 2 → 0`.

Five cuts are minimal: the three mutual pairs, the credentials triangle, and `publish-content → publish-trust → deployments → theme → publish-content` form five edge-disjoint cycles. The chosen cut removes all cycles. Jini’s three file SCCs and 83 runtime package edges also reproduce, with no package SCC.

I checked all 241 feature inventory rows against extracted imports and directly sampled 17 TSV rows: **2, 4, 23, 24, 28, 29, 138, 139, 154, 212, 243, 244, 246, 247, 248, 249, 259**, counting the header as line 1.

1. **Blocker — S5’s packager dependency cannot reach the preview path.**

   **Evidence:** `DESIGN.md:196–198` adds `packager` to `CommitSiteDeps` and instructs updating its builders. However, `source-control/commit-site.ts:369` runs packaging in `exportForCommit({ input, providerId })`, which receives no `CommitSiteDeps`. Preview calls that function at `:433`; commit calls it at `:476`. `previewCommitExport` accepts `CommitSiteInput`, not commit dependencies (`:429`). The tool’s dry run calls preview at `source-control/tool-registrations.ts:435`.

   Following the proposed dependency placement leaves preview without a packager. Constructing the implementation inside source-control to repair this would restore the runtime edge being cut.

   **Fix:** Define the packager’s complete path through both preview and commit before dispatch: either put it in their shared export inputs or explicitly pass a narrow dependency object to both. Update `SourceControlToolDeps`, `commitInput`, host bindings, and preview fixtures. Verify that preview and commit package identical files while preview performs no credential resolution or provider write.

2. **Major — S2 explicitly omits tests that import the exports it removes.**

   **Evidence:** `DESIGN.md:123` moves `apiConnectionVaultScope` and `API_CONNECTION_VAULT_KIND`, deletes the `PLUGIN_STATE_FORMAT` re-export, and lists four production importers. Its migration row (`:305`) says tests should need no edits.

   Existing imports from `vault-stores.js` include:

   - `api-connections/__tests__/plugin-state-format.pin.unit.test.ts:8` — all three removed exports.
   - `api-connections/__tests__/vault-stores.unit.test.ts:19` — scope and kind.
   - `api-connections/__tests__/shared-owner.integration.test.ts:21` — scope.
   - `api-connections/__tests__/shared-bindings.postgres.test.ts:12` — scope.

   The proposed new exact-object test also duplicates assertions already present in `plugin-state-format.pin.unit.test.ts:12–14`.

   **Fix:** Repoint those imports in S2 and retain the existing compatibility assertions. Keeping forwarding exports would contradict the stated no-forwarder constraint.

3. **Major — S3b and S4 lack required dependency-fixture migrations.**

   **Evidence:** S3b adds required `sourceControlWrite` but names a nonexistent `CustomCredentialToolRouteDeps` (`DESIGN.md:136`). The actual interface is `CustomCredentialsToolDeps` at `custom-credentials/tool-registrations.ts:62`. The migration table (`DESIGN.md:307`) only schedules splitting two binder test files.

   Many other fixtures construct that interface without the new required field, including:

   - `custom-credentials/__tests__/list-agent-tool.unit.test.ts:76`.
   - `custom-credentials/__tests__/create-agent-tool.unit.test.ts:78`.
   - `assistant/__tests__/moved-tools.credential-cards.golden.test.ts:84`.
   - `server/runtime/boot/__tests__/mail-credential-cards.unit.test.ts:97`.

   S4 also changes the invalidation seam without scheduling updates to `custom-credentials/__tests__/extract-s8-x-host-operations.test.ts:309–321`, which supplies the old registry/cache fields and asserts invalidation.

   **Fix:** Inventory dependency-object constructors and fixture builders, not just binder imports. Add fake `SourceControlWritePort` values in S3b. In S4, migrate existing invalidation tests through the new port and retain their assertions about cache identity, ordering, and registry-load count.

4. **Major — J2’s first commit omits consumers outside its SCC.**

   **Evidence:** `DESIGN.md:341` moves five exports into `mcp-json-file.ts` and repoints the three cyclic agent files plus `mcp-bridge.ts`. Other consumers still require those exports from the old file:

   - `packages/daemon/src/agent-executor/claude/mcp-config.ts:5` — read and merge helpers.
   - `…/codex/home-staging.ts:20` — read/write helpers.
   - `…/codex/home-config.ts:2` and `…/codex/isolation.ts:2` — server key.
   - `…/launch.ts:102` — removal helper.
   - `…/index.ts:156` — public re-export of the merge helper.
   - `…/__tests__/mcp-bridge-staging.test.ts:12` — removal helper.

   These updates cannot wait for the second commit, which addresses four different forwarded exports.

   **Fix:** Include every consumer of the five moved symbols in J2’s first commit, including export declarations and tests. Enumerate the second commit’s four forwarded-symbol consumers separately.

5. **Major — The Jini runtime classifier does not model its compiler settings.**

   **Evidence:** `DESIGN.md:24–26` classifies all-inline-type imports as erased and unused value imports as `erased`. Jini sets `verbatimModuleSyntax: true` in `tsconfig.base.json:16`; packages inherit that configuration and build with `tsc`.

   For example, `packages/admin/src/react/shell/use-admin-theme.ts:3` contains:

   ```ts
   import { type AdminTheme, type ColorSchemePreference } from '../kit.js';
   ```

   Actual TypeScript emission retains:

   ```js
   import {} from '../kit.js';
   ```

   That remains a runtime module load. On the design’s own scanned file set, compiler emission retains **24 additional internal import statements** that its extractor drops. The three SCCs remain unchanged, but the runtime classification is incorrect.

   The stated production scope is also inaccurate: the 3,735-file traversal includes files such as `packages/admin/vitest.config.ts` and `packages/oauth/tests/args-convention.types.ts`, despite §5 claiming `packages/*/src`, tests excluded.

   **Fix:** Make classification compiler-configuration aware, define production roots explicitly, and regenerate the measurements. J4 must demonstrate that its dependency-cruiser configuration handles preserved empty imports and unused value imports consistently with package builds.

6. **Major — B2’s consumer inventory misses startup-secret users, including desktop boot.**

   **Evidence:** `DESIGN.md:322` bases its inventory on nine files mentioning `startupSecretEnvironment`. Moving the whole module also removes exports consumed by:

   - `cli/commands/serve.ts:30`.
   - `index.ts:33`.
   - `server/runtime/lifecycle/daemon-supervisor.ts:22`.
   - `apps/desktop/src/main/index.ts:115`.
   - `apps/desktop/src/tovu-server.ts:31`.

   Path-sensitive tests also use the old module location: `cli/__tests__/unit/serve-import-cleanup.unit.test.ts:13–14`, `serve-command-wiring.unit.test.ts:238`, and `server/runtime/boot/__tests__/startup-secrets.unit.test.ts:3,78`.

   **Fix:** Inventory every export and old-path reference. Include desktop callers and test/mock paths in B2. Preserve one module instance for initialization and credential reads; leaving a copied compatibility implementation would split its module-level credential state.

7. **Major — The owner-practice check does not establish a compliant target.**

   **Evidence:** `DESIGN.md:361` claims all new port methods follow `(required, optional)`, but B1 proposes the single-object `rosterChanged(optional?)` contract at `:321`.

   The size check at `:362` substitutes “no function grows” for the required limits and explicitly leaves function measurements undone. For example, the touched `commitSiteToSourceControl` spans `source-control/commit-site.ts:466–541`; `source-control/tool-registrations.ts` remains 511 lines. S5 only removes the packaging block from another function.

   **Fix:** Correct B1’s signature and make the relevant size-design work an explicit prerequisite where needed. Specify compliant resulting units, or obtain and record exceptions. Serializing with another split is not the same as requiring that split before claiming compliance.

8. **Minor — The unranked-feature rule does not enforce its stated invariant.**

   **Evidence:** `DESIGN.md:257–263` says every production feature needs a rank, but the rule only matches an outgoing feature-to-feature dependency. A new leaf feature importing only platform code passes; an existing ranked feature can import that unranked leaf and also pass.

   I reproduced both cases with dependency-cruiser’s rule matcher. Its `from.path` also contains no capture group, so the `$1` exclusion does not identify the importing feature.

   **Fix:** Check rank membership as a module-level property or compare production feature directories with the rank table. Add fixtures for an unranked leaf, an import into it, and same-feature imports.

9. **Minor — J1 invents an existing public helper surface and an initialization hazard.**

   **Evidence:** `DESIGN.md:334` says `src/index.ts:58` exports helper names that must be repointed without changing public names. That location is a comment. `packages/agent-runtime/src/index.ts:61` exports only `createJsonEventStreamHandler` from the module.

   The preceding hazard claim (`DESIGN.md:333`) also treats handler bindings as potentially uninitialized. The referenced handlers are function declarations—for example, `defs/opencode/event-stream.ts:7,117` and `defs/codex/event-stream.ts:375`—which are initialized during ESM instantiation.

   **Fix:** Keep the helper move internal unless a public API expansion is separately required. Remove the unsupported TDZ explanation; distinguish cycle removal from a demonstrated evaluation-order defect.

10. **Minor — The chosen-cut file count is wrong.**

    **Evidence:** `DESIGN.md:9` and `INDEX.md` report 11 import statements in eight files. The cut rows identify **seven** importing files: `publish-trust/connect.ts`, `project-keys/site-references.ts`, three custom-credentials files, and two source-control files. The migration table also lists nine S-series commits, while the estimate says eight.

    **Fix:** Derive these totals from the inventory and update both documents.

Full compilation, test suites, and dependency-cruiser CLI execution against the snapshots were not run. Runtime measurements used in-memory TypeScript emission; rule fixtures used the installed dependency-cruiser matcher.

## Recurring mistake classes

- **Runtime classification depends on compiler settings.** Inline `type` specifiers and unused bindings do not universally mean an import statement disappears.
- **Node-registration invariants require node checks.** An edge rule cannot prove every module belongs to a declared layer; isolated and sink nodes need explicit coverage.
