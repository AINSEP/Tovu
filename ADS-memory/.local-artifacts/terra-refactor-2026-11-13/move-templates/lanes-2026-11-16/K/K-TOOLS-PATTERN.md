# K-TOOLS-PATTERN (revision 2): one domain's agent-tool catalog + handlers -> the Jini package that owns the domain
Assembly: `cat K/K-TOOLS-PATTERN.md K/<sheet>.md COMMON-KT.md`. Used by K-01, K-02, K-03, K-04, K-05, K-07, K-09, K-10a/b.
Verified on Tovu `integ/merge-a-2026-11-16` e801e9ae + Jini `integ/merge-a-2026-11-16` dde69a6d (planning read only; nothing executed).

## Existing owners (do not invent a second one)
- Shape: Jini `packages/cms/src/navigation/tool-registrations.ts` (`MenusToolDeps`, `menusDerivedRisk`, `buildMenusRegistrations`) and Tovu's binding `apps/website/src/features/navigation/tool-registrations.ts` (`contributeMenusTools`).
- Host metadata binding: `withToolMetadata({ registrations, metadata })` from `@jini-ai/core` (`packages/core/src/tool-metadata.ts:18`). Every K file passes the HOST's `toolMetadata` (`contracts/core/tool-metadata/<domain>.ts`: search keywords, approval/confirmation policy) to `buildDomainRegistrations({ metadata })` today. That metadata STAYS in Tovu and is bound by the wrapper, exactly as `contributeMenusTools` does. `buildDomainRegistrations` uses `catalogEntry.metadata ?? metadata` and the wrapper skips a registration that already has metadata, so the resulting descriptors are value-equal (key order may differ: compare with `deepStrictEqual`, never by string).
- Approval: `@jini-ai/core` owns `createApprovalHandler`, `ApprovalSteps<TPrepared, TDescription>`, `HumanConfirmer`. Tovu's `approvalToolHandler({ surfaces, prepare, describe, run }, { flag, ask, rememberKey, remembered, declined, batch } = {})` and `humanConfirmedToolHandler(surfaces, { flag, prepare, dialog, run })` (`contracts/core/human-confirm.ts:194,217`) are host bindings over it (dialog wording, i18n, chat-delete grant).

## Inputs per sheet (generated from the AST by `scripts/symbols.cjs`; never hand-edit)
- `<id>.tools.tsv`: the REAL tool registrations = keys of the `handlers` object literal, each cross-checked against the catalog (`name:` + `sideEffects:` fields; the catalog key is `name`, the effect field is `sideEffects`) and the `<x>DerivedRisk` map. Columns: tool_id, lines, code_lines, wrapper (`inline` | `approvalToolHandler` | `humanConfirmedToolHandler`), in_catalog, risk, sideEffects. Nested `prepare`/`describe`/`run` callbacks are part of their tool's row, not rows.
- `<id>.importers.tsv`, `<id>.fnsize.tsv`, `<id>.decls.tsv`, `<id>.files.tsv`, `<id>.census.txt`.

## Split
- catalog file -> MOVE whole. `<X>ToolDeps`, `<x>DerivedRisk`, view mappers, handlers, the model-facing rule list -> MOVE.
- `contribute<X>Tools` + the metadata import + every host port value -> STAY in Tovu `<feature>/tool-registrations.ts` (a binding of about 30-60 lines; it exports only `contribute<X>Tools` and, where the sheet says, the host deps type).
- Every import of the Tovu file is classified in the sheet's BINDINGS table as one of: `own` (already this Jini package: rewrite to the leaf file), `core` (allowed as is), `port` (becomes a typed field of `<X>ToolDeps`; the sheet gives the type and the value Tovu passes), `structural` (type-only import of another package: a local interface with ONLY the members the handlers call, same member names/argument objects/returns, Tovu passes the real object unchanged), `host` (stays in the binding), `delete` (the private default-surfaces builder). An import with no row = STOP.
- Approval-wrapped tools: Jini takes `deps.approvalHandler` typed as a local generic interface copied from the real signature above, with `describe` returning a local `<X>ApprovalDescription` holding only the fields the handler sets. If a `describe`/`dialog` body reads host wording (`approvalText`, locale, a Tovu import), that callback is NOT moved: it becomes `deps.describe<Tool>` and its body stays byte for byte in the Tovu binding. Tovu's `HumanConfirmSpec` must accept the local description type; the S4 typecheck proves it (mismatch = STOP, do not cast).

## Steps (each ends with commit + V2 + push; never a red commit fixed forward)
S0 Tovu, tests only: `features/<feature>/__tests__/tool-contract.characterization.test.ts`, built THROUGH THE HOST CONTRIBUTOR: `contribute<X>Tools().build(fakeDeps, fakeSurfaces)` with in-memory fakes of the deps ports. It pins:
 (a) registration ids, in order == the literal list copied from `<id>.tools.tsv` (ids are saved in permissions and audit rows);
 (b) per tool `deepStrictEqual(registration.descriptor, golden)` against a committed JSON golden: id, description, inputSchema, the read-only/risk flags AND `metadata` (approval/confirmation policy and search vocabulary). This is the test that fails if the metadata binding is lost;
 (c) `<x>DerivedRisk` entries == literal list;
 (d) per tool, a principal without the permission gets the same error class, code and message;
 (e) per tool, one success call returns the same view object; per approval-wrapped tool, three paths with a fake surface store: confirmed -> runs once, declined -> the same not-confirmed result and NO write on the fake repo, expired -> same;
 (f)+ the sheet's own cases.
 V3 mutations (all three, each shown RED then restored): comment out one handler's permission check -> (d); drop `metadata: toolMetadata` from the `buildDomainRegistrations` call -> (b); change one catalog description -> (b).
S1 Tovu seam: each handler leaves `build<X>Registrations` as `const <toolId>Handler = ({ deps, surfaces }): ToolHandler => ...` in the same file, in `<id>.tools.tsv` order; the builder becomes the id -> handler table. Handlers and catalog functions over 50 code lines are split as the sheet says. S0 green, unedited.
S2 Tovu seam: apply the BINDINGS table. `build<X>Registrations` no longer passes `metadata` (the contributor wraps with `withToolMetadata`); the default value of `surfaces` is deleted; signature becomes `build<X>Registrations({ deps, surfaces }, optional = {})` (`surfaces` omitted when the sheet says the handlers never read it); every caller in `<id>.importers.tsv` is converted in this commit, tests that relied on the default surfaces use the sheet's test helper. `contribute<X>Tools` now reads: `build: (deps, surfaces) => withToolMetadata({ registrations: build<X>Registrations({ deps: { ...deps, <host port values> }, surfaces }), metadata: toolMetadata })`. S0 green, unedited.
S3 Jini: NEW `packages/<pkg>/src/<domain>/{agent-tools,tool-registrations}.ts` (+ the split files the sheet names) = the seamed code minus `contribute<X>Tools`. `surfaces` type: `{ readonly surfaceExchanges: SurfaceExchangeStore }` with `SurfaceExchangeStore` from `@jini-ai/core`. Export-chain guard (the type is exported through `export *`, so grep the chain, not the name in `index.ts`): `rg -n "surface-exchanges" packages/core/src/index.ts` hits AND `rg -n "export interface SurfaceExchangeStore" packages/core/src/surface-exchanges.ts` hits; the S3 typecheck is the proof. Index line(s) + changeset `minor`. Tests that use only port fakes are copied as vitest files. STOP matrix.
S4 Tovu: the binding imports from the Jini subpath; `git rm` the catalog file; delete the moved declarations from `tool-registrations.ts`; repoint `<id>.importers.tsv`; the S0 test stays in Tovu UNEDITED (it goes through the contributor) and must be green: that is the proof the move changed nothing. STOP matrix.

## STOP (in addition to COMMON-KT)
- A handler reads a Tovu settings key, table name, route or env name that is not a BINDINGS row.
- The S0 golden would need regenerating after S2, S3 or S4.
- `installFirstPartyToolContributors()` or the host deps bag would need any edit.
- `<id>.tools.tsv` has a `NOT-IN-CATALOG`, `NO-RISK-ROW` or `NOT-WIRED-HERE` row the sheet does not explain.

## Owner decision used
D-K1: `ToolContributor.build` in `@jini-ai/core` is positional `(deps, surfaces)` (core's own contract). Jini builders are `({ deps, surfaces }, optional = {})`; the one-line adapter lives in the Tovu binding.
