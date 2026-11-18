# kt-K-02: widgets agent tools -> `@jini-ai/cms/widgets`

Run date: 2026-11-17/18. Status: **DONE** (sheet K-02, steps S0-S4). Branch `wave2/kt-K-02` in both repos. No force-push, no `--no-verify` (the Tovu pre-push hook did not block), no subagents, no process left running.
Bases: Tovu `origin/integ/ratchets-green-2026-11-17` (`ac284a04`), Jini `origin/refactor/terra` (`65d73b0d`); `git merge-base --is-ancestor 232764af5 / 65d73b0d5` exit 0. K-01 was **not** merged: K-02 names no prerequisite (INDEX "-"). Sheet blobs matched (`git hash-object`: `165a6258`, `8ad0cc87`). Census: every real importer is a row of `K-02.importers.tsv`; the 5 extra rg hits are other files named `agent-tools.ts`/`tool-registrations.ts` (admin routes, post/assistant) or the unrelated `post/agent-tools` import on the line after a row.

## Commits

| Repo | SHA | Step | What |
|---|---|---|---|
| Tovu | `b3ae346b2` | S0 | `features/widgets/__tests__/tool-contract.characterization.{test.ts,golden.json}` (19 tests, tests only) |
| Tovu | `82113c061` | S1 | handler factories in `tool-handlers.instances.ts` (5), `tool-handlers.areas.ts` (7), shared types in `tool-handlers.types.ts`; `tool-registrations.ts` 518 -> 248; `size-debt.json` entry `buildWidgetsRegistrations#1` deleted |
| Tovu | `b9613547d` | S2 | `buildWidgetsToolRegistrations({ deps }, _optional = {})` + `buildWidgetsRegistrations` (same name/params/default) = one `withToolMetadata` call |
| Jini | `d150e2a70` | S3 | `packages/cms/src/widgets/{agent-tools,tool-registrations,tool-handlers.instances,tool-handlers.areas,tool-handlers.types}.ts`, 3 index lines, 21 vitest cases, changeset `cms-widgets-agent-tools.md` (minor) |
| Tovu | `07c849e39` | S4 | binding imports from `@jini-ai/cms/widgets` (63 lines); `agent-tools.ts` + 3 handler files deleted; 5 importers repointed |

Tovu tip `07c849e39`, Jini tip `d150e2a70`, both on `origin/wave2/kt-K-02`. S0-S2 name Jini base `65d73b0d`; S4 names `d150e2a70`.

## V1 baseline (unmodified trees, BASE-RED rule)

| Gate | Result on base |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` / `tsconfig.tests.json` | exit 0 / exit 0 |
| `npm run check:size` | exit 0 (203 violations, 193 debt entries, 10 accepted) |
| `npm run check:complexity` | exit 0 (43 entries) |
| `npm run check:architecture` | exit 1: 3 regressed metrics (propagation cost 3.06 -> 3.18, API surface 821 -> 853, hub count 335 -> 363) + `NEW cross-feature edge` lines; saved as base output |
| `npm run check:errors` | exit 0, 817 findings, no `New:`/`Worse:` line |
| widgets + importer + source-reading tests (63 files, single-file runner, `--test-concurrency=2`) | 622 tests, 619 pass, **2 fail on base**: `assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts` (external-mcp-probe value import) and `features/media-import/__tests__/import-local-file-search.test.ts` |
| Jini `pnpm --filter @jini-ai/cms run typecheck` / `npm --prefix packages/cms run test` / `pnpm guard` | exit 0 / 338 files, 4085 tests / exit 0 |

After S0, S1 (final), S2, S4: tsc x2 exit 0; the same 63 test files give the same 2 failures (identical names) and nothing else; eslint 0 errors (6 warnings, all in the five existing test files where only an import line changed); `check:size` exit 0 (S1 onward 202 violations / 192 debt entries); `check:complexity` exit 0; `check:errors | rg "^(New|Worse):"` prints nothing; S-SUPPRESS, S-MOCK, S-FORWARD print nothing; S-FN50 on created/changed files prints nothing.
`check:architecture` vs the base output: S0 identical; S1 (final): only file count, hub-count percent and propagation cost 3.18 -> 3.17 (better); S2 same; S4: only `2245 files` -> `2244 files` and hub percent denominator (hub count stays 363). No new line beyond base. S4 also: `check:inventory`, `check:error-rule-copies`, `check:route-tool-parity` exit 0.
Jini S3: typecheck exit 0, cms tests 339 files / 4106 tests (base 4085 + 21), `pnpm guard` exit 0, build exit 0. STOP matrix: S-IMPORT prints only a regex false hit on the comment text "the server broke"; S-BARREL, S-TEXT, S-RUNTIME, S-ARGS, S-FN50 (Jini form), S-SIZE print nothing. S-SCHEMA and S-DELETE (both repos, base..HEAD) print nothing.

## V3 mutations (on the S0 parent, RED shown, restored by `git show HEAD:<path> > <path>` + `git diff --quiet`)

| Mutation | Failing test |
|---|---|
| comment out the `widgets_list_regions` `requireWidgetPermission` line | `(d) widgets_list_regions: a principal without the permission is refused ...` |
| drop `metadata: toolMetadata` from `buildDomainRegistrations` | `(b) every descriptor equals the committed golden, metadata included` |
| `Lists widget instances in the workspace` -> `... workspace!` in the catalog | `(b)` |
| `withPluginHookRefusals(handlers)` -> `handlers` | `(f) a plugin save-hook refusal thrown inside an embed handler reaches the model as the same fixed refusal` |

## Differences from the sheet (each forced by a gate or an existing test)

1. **Package deps carry composers, not built objects.** The sheet has the contributor pass the BUILT `buildWidgetsDeps`/`buildWidgetsRegionDeps` results as `deps.widgets`/`deps.regions`. Eager building threw (`Invalid value used as weak map key`, 20 existing assistant contract tests) because those tests build the registrations over route deps without `entryRepo`. So the fields are `composeWriteDeps: () => ...` and `composeRegionDeps: () => ...`, called per handler run exactly as before. No test edited.
2. **A fifth file, `tool-handlers.types.ts`** (types only), instead of the deps type living in `tool-registrations.ts`. A handler module importing from the table is a runtime cycle (Jini `checkRuntimeCycles`) and, even type-only, a back edge that raised the Tovu `bidirectional hub count` 363 -> 365 (first S1 attempt, discarded). The schema guard is passed in as `withSchema` for the same reason. Handler files import no in-repo Tovu module.
3. `wrapHookRefusals` is typed from the real signature `(handlers: Record<string, ToolHandler>) => Record<string, ToolHandler>` (as the sheet said).
4. Under Jini's `exactOptionalPropertyTypes`, `widgetType`/`slug` are now conditional spreads instead of explicit `undefined` (same behavior: the callees test truthiness / `??`).
5. Dropped the dead constant `WIDGETS_TRASH_TOOL_ID`. Reworded the trash-handler comment in Jini: the Tovu text still described a confirmation dialog that no longer exists (the trash runs unconfirmed since 6eac86229); the facts that remain true moved, the dialog claims did not.
6. Jini `widgetsDerivedRisk` is `ReadonlyMap` (guard HW3 module-state rule, as in K-01); `AgentToolSideEffect`/`AgentToolDefinition` are module-local, the re-export of `AgentToolActorClassRule` was not moved (no importer).
7. Host-name coupling kept verbatim because it is model-facing text pinned by the golden: the catalog/error strings mention `content_read.widget_region`, `content_read.widget_instance`, `content_post_create`. A later sheet should make those host-supplied. `ASSISTANT_ACTOR_PLUGIN_ID = "assistant"` also moved as a literal (no BINDINGS row; it is a plugin-id value, not a key, table, route or env name).

Test edits to existing files (COMMON-KT rule 7(a), specifier only, `widgetsAgentToolCatalog` -> `@jini-ai/cms/widgets`): `assistant/__tests__/tool-registrations.{contracts,widgets-authorization,widgets-contracts}.test.ts`, `features/widgets/__tests__/integration/{gallery-widget,mediawidget}.integration.test.ts` (the latter is a dynamic `import()` line; specifier only).

## Overlaps with other live runs

- `assistant/__tests__/tool-registrations.contracts.test.ts`: one import line (shared with K-01/K-03/K-04/K-07/K-09/K-10b); a rebase conflicts only on that line.
- `features/widgets/__tests__/integration/mediawidget.integration.test.ts` is also named by K-02b/S8; I changed one specifier line (151).
- `development/scripts/size-debt.json`: one entry deleted (shared with K-03/K-04/K-05/K-09/K-10a).
- Jini `packages/cms/src/widgets/index.ts` (+3 lines) and `package.json` untouched; K-02b writes `widgets/html/*`, T-PO-01 writes `widgets/{duplicate-embeds,index,host-ports}.ts`: `widgets/index.ts` is shared with T-PO-01, expect a trivial merge.

## Left / not done

- Docs only: `development/assistant-prompts/capability-prompts.md:760-765` and any `INFO.md` still cite `features/widgets/agent-tools.ts` line numbers.
- Coordinated Jini publish and the Tovu `package.json` range bump are not part of a sheet; Tovu is green against the linked Jini `d150e2a70`.

## Next step

Merge Jini `wave2/kt-K-02` (`d150e2a70`) before or with Tovu `wave2/kt-K-02` (`07c849e39`); then K-03 (comments tools) follows in chain K.
