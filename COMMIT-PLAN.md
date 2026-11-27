# m26-tsc — Tovu working-tree handoff

No commits: `.git` is read-only. No installs, builds, tests, typechecks or linters run, as dispatched. Assertions are written before the corresponding fixture repairs; RED/GREEN and mutation execution remain for Opus.

## Intended commit order

1. `fix(admin): retain core MCP envelope types in test fixtures`
   - `apps/admin/src/features/security/hooks/__tests__/use-other-credentials.unit.test.tsx`
   - Tests first: strengthen the existing external-MCP removal case to assert the returned envelope flags.
   - Named mutations: return `restartRequired: false` (or omit it) from the delete fixture; the new assertion fails and the core return contract rejects the mutation. Remove the fixture's `ExternalMcpDeleteEnvelope` return annotation; its inferred boolean fields no longer satisfy the core literal-true delete contract.
   - Delete root cause: an uncontextualized mock callback widens the envelope's literal booleans. Use the named core contract at the fixture boundary.
   - Production behavior and fixture values unchanged. One existing test strengthened; no test declarations added, removed, skipped or weakened.

## Row dispositions

Inspected Tovu branch: `codex/tv-m26-tsc`. Jini contract source: `origin/codex/m26-tscj`, SHA `906b73a9e798c322ca90880a4b8a3016f4316af4` (already available; no fetch required). The supplied Jini handoff was also read.

“Implemented” means a source repair is present, not a passing compiler or test result. Missing original diagnostics prevent asserting that an entire row is clear.

| Dispatched row | Disposition and exact evidence |
| --- | --- |
| Website peer-transport x2 | Skipped: both `incident` callbacks already pass a reporter to `adminFailureResponse`: `failureReporterOf({ res })` in `respondWithError`, `errors.reporter` in push-route mounting. The named missing-reporter anchor does not match. |
| Website system/publish-site | Skipped: both trigger and destination failure writers already pass `reporter: errors.reporter` to `sendAdminFailure`. Missing-reporter anchor does not match. |
| Website plugins/install | Skipped: JSON and raw failure writers both already pass `reporter: errors.reporter` to `sendAdminFailure`. Missing-reporter anchor does not match. |
| Website mount-admin-system | Skipped: the site-update status callback already passes `{ reporter }` to `reportServerFailure`; site-import failure handling already passes `reporter: errors.reporter` to `sendAdminFailure`. Missing-reporter anchor does not match. |
| Website import-database repo.sqlite | Blocked: located `apps/website/src/server/runtime/composition/import-database/repo.sqlite.ts` and read it. It contains no failure-reporting call. Also read `features/site-backup/import-database.ts` candidates from discovery and the share projection binding/contracts. No demonstrated remaining mismatch at a named symbol; original compiler diagnostic is needed. No speculative binding/cast added. |
| Website purchase x3 | Skipped pending diagnostics: inspected `server/inbound/public-http/routes/commerce/purchase.ts`, the Jini purchase specs, rate-limit and member/clock dependencies. Jini source already repairs the path-input/explicit-undefined issues described by its handoff. No demonstrated remaining Tovu mismatch; need exact compiler messages for further changes. |
| Website post x2 | Skipped: handled by Jini's reported absent-HTML-embeds and explicit-undefined render contract repairs. Read the Tovu post binding; no additional wiring required for those repairs. |
| Website publish-agent-tools x2 | Blocked: inspected the binding, `publish-tool-deps.ts`, Jini contracts and existing optional-port repair. No compiler diagnostic/symbol supplied to identify a further failing contract; no speculative gateway or approval rewrite. |
| Website project-store | Blocked: read the full composition file and inspected its vault, kernel, attachment, provider-config and clock contracts. No demonstrated remaining mismatch; the current core `Clock` requires only `nowMs()`, so adding `nowIso()` would be unnecessary. Original diagnostic needed. |
| Website virtual-page | Blocked: the Jini handoff stopped this row on opaque `object` theme typing. Read the current host callbacks and their casts plus Jini's theme contract; no further demonstrated host mismatch. Themes are explicitly out of scope and introducing a generic is forbidden. Exact diagnostic or upstream contract repair needed. |
| Website template-preview-render | Skipped: Jini reports the absent-embed forwarding/contract repair. Read the host binding; existing subpath and callbacks need no additional wiring for that repair. Any separate theme error still needs its exact diagnostic. |
| Website protect-existing-files | Blocked upstream: Jini's `cms/forms/site/protect-existing-files` requires a Kysely dynamic table schema with all submission/media/blob fields in every row; Tovu supplies `ContentKernel` through `db.withTables()`. The fixed combined schema is the ownership mismatch. No new row type/generic, schema cast or logic in Tovu bindings under the hard rules. |
| Website domain-publish-tool | Blocked: read the host binding and Jini tool/dependency contract, including injected gateways. Jini already applies its optional-port fix; no additional demonstrated failing expression without compiler output. |
| Website mail-status | Skipped pending diagnostics: inspected tool bindings and `runtime/composition/modules/system-mail.ts`; route binding already spreads the optional status report into a DTO object. No named failing symbol/diagnostic identifies another required Tovu change. |
| Admin AssistantDock | Skipped: Jini reports synchronous/asynchronous MCP result contract repair; no new subpath or Tovu wiring needed. |
| Admin AccessTokensTab | Blocked upstream with concrete mismatch: host `deps.fieldHelpText` passes Jini devops `fieldHelpText`, returning `string | undefined`; Jini admin `AccessTokensTabBindings.deps.fieldHelpText` requires `string`. The optional help contract belongs to Jini. No empty-string fallback or wrapper added in Tovu. The dispatched “label” description is not the failing contract found in source. |
| Admin SettingsUi | Skipped: host `deps` already uses `SettingsUiProps["deps"]`; Jini reports its `KitDictionaries` repair. No Tovu dictionary adapter needed. |
| Admin use-other-credentials | Implemented the literal-widening repair using core `ExternalMcpDeleteEnvelope`. Existing remove case now asserts both `removed` and `restartRequired`; mutations above. |
| Admin use-external-mcp | Blocked upstream: at line 866 the fake already contains `restartRequired: true`, contrary to the reported symptom. Jini's `ExternalMcpPort.saveExternalMcpServer` declares `Promise<{ server: AdminExternalMcpServer }>`; the fresh response literal therefore has an excess `restartRequired` property. Core's `ExternalMcpPutEnvelope` requires that flag and a server with required `builtIn`; this fixture's `AdminExternalMcpServer` only has optional `builtIn`. A truthful upstream save-port contract must precede fixture adoption; no cast, value indirection or flag deletion used to hide the check. |
| Admin credential-input-autocomplete | Skipped: direct `MediaProvidersTab` fixture already passes `useMediaProvidersTabHook: useMediaProvidersTab` (line 371). The cited External Providers slot near line 350 delegates to host `BoundMediaProvidersTab`, which also injects the real hook. Anchor does not match a missing hook on this tree. |

## Scope and final review

- No production code, configuration, themes, dependencies, Jini files or git metadata changed.
- Existing core envelope is reused; no new helper, wrapper, adapter, interface, type definition, generic declaration or hook default added.
- Architecture review: PASS for the retained fixture-only change; core remains the contract owner. Upstream blockers remain disclosed above.
- Function review: the retained mock returns the same Promise and values; only its return annotation changes. No production logic or new branch; existing direct hook test covers removal. Time/space unchanged.
- Documentation: no new comments; existing why-comments retained.
- Test integrity: all original cases and assertions preserved; one envelope assertion added before the type annotation.
- Diff-cleanup deletions: removed the draft save-envelope import/value/assertion from `use-external-mcp.unit.test.ts` after inspecting the required ownership field and upstream port mismatch. That file is identical to HEAD; no unsupported workaround remains.
- Follow-up: coordinator/Opus runs the admin compiler and focused regression case, then checks remaining rows with exact diagnostics. No RED/GREEN, mutation, runtime, coverage or typecheck result is claimed here.

## Verification

Unexecuted by instruction; no passing-test or compiler claim. Source review and final read-only diff review only.

Final evidence: `git diff --stat`, `git diff --numstat`, `git diff -- <changed test paths>`, and `git status --short` show one tracked test file changed (three inserted/two removed lines) and this untracked handoff. `use-external-mcp.unit.test.ts` has no diff. No git writes performed.

| Unit | Disposition | Findings | Local fix |
| --- | --- | --- | --- |
| External-MCP delete mock and its existing removal test | INCONCLUSIVE pending Opus execution | No new logic or branch; runtime/type evidence intentionally unavailable | Core return annotation and direct envelope assertion; fixture contents unchanged |

Self-validation/coverage/mutation execution not run because the dispatch prohibits executing checks. No application behavior changed. Requirements, test preservation, ownership and retained diff re-read before handoff.
