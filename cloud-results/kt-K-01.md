# kt-K-01: redirects agent tools -> `@jini-ai/cms/redirects`

Run date: 2026-11-17. Status: **DONE** (sheet K-01, steps S0-S4; one extra test-only commit, see "Differences").
Branch `wave2/kt-K-01` in both repos. No force-push, no `--no-verify`, no subagents, no process left running.
Bases: Tovu `origin/integ/ratchets-green-2026-11-17` (`ac284a04`), Jini `origin/refactor/terra` (`65d73b0d`). Both checked with `git merge-base --is-ancestor` (232764af5 / 65d73b0d5): exit 0.

## Commits

| Repo | SHA | Step | What |
|---|---|---|---|
| Tovu | `33ac17e4` | S0 | `features/redirects/__tests__/tool-contract.characterization.{test.ts,golden.json}` (tests only) |
| Tovu | `dcd1d1ba` | S1 | one `redirects<Tool>Handler({ deps })` factory per tool, one `REDIRECTS_*_TOOL` const per catalog entry; `size-exceptions.json` row for `buildRedirectsRegistrations` deleted |
| Tovu | `723ed0c7` | S2 | `buildRedirectsToolRegistrations({ deps }, _optional = {})` over `RedirectsPackageToolDeps`; `buildRedirectsRegistrations` keeps its name, positional parameters and default surface store, body = one `withToolMetadata` call |
| Jini | `d23deabc` | S3 | `packages/cms/src/redirects/{agent-tools,tool-registrations}.ts`, 2 index lines, vitest copy (23 tests), `entries.test.ts` owner list, changeset `cms-redirects-agent-tools.md` (minor) |
| Tovu | `2a88e145` | extra | S0 test reads the risk map from `contributeRedirectsTools().risk` instead of importing it from the module S4 stops exporting from (so S0 stays unedited in S4) |
| Tovu | `d8ebe9de` | S4 | binding imports from `@jini-ai/cms/redirects`; `features/redirects/agent-tools.ts` deleted; 5 importers repointed |

All pushed to `origin/wave2/kt-K-01` (Tovu tip `d8ebe9de`, Jini tip `d23deabc`). Tovu commits S0-S2 name Jini base `65d73b0d`; S4 names `d23deabc`.

## V1 baseline on the unmodified trees (BASE-RED rule)

| Gate | Command | Result on base |
|---|---|---|
| Tovu tsc | `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| Tovu tsc tests | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit` | exit 0 |
| size | `npm run check:size` | exit 0 (203 violations, 10 accepted exceptions) |
| complexity | `npm run check:complexity` | exit 0 (43 entries) |
| architecture | `npm run check:architecture` | exit 1: 3 metrics regressed (propagation cost runtime-only 3.06 -> 3.18, module API surface 821 -> 853, bidirectional hub count 335 -> 363) plus ~120 `NEW cross-feature edge` lines; saved as base output |
| errors | `npm run check:errors` | exit 0, "Error gate passed: 817 findings", no `New:`/`Worse:` line |
| Jini cms typecheck | `pnpm --filter @jini-ai/cms run typecheck` | exit 0 |
| Jini cms tests | `npm --prefix packages/cms run test` | exit 0, 338 files / 4085 tests |
| Jini guard | `pnpm guard` | exit 0 ("1 stale debt occurrences" hardwiring note is on the base too) |

Setup: Node 24.22.3 (`~/.local/node24`), Jini `pnpm install --frozen-lockfile` + `pnpm --no-bail -r build` (exit 0), Tovu `npm ci`, `link-jini.mjs` with `JINI_PACKAGES_DIR=/home/user/Jini/packages`, `packages/contracts` + `packages/sdk` built.

## Gates after every Tovu commit (S0, S1, S2, extra, S4)

- `tsc -p tsconfig.json` exit 0; `tsc -p tsconfig.tests.json` exit 0.
- Tests with the single-file runner: `features/redirects/__tests__/*.test.ts` + `assistant/__tests__/tool-registrations.redirects.test.ts`: S0 107/107 (13 new), S1 107/107, S2 107/107, extra 107/107. S4 also ran the other importers (`tool-registrations.contracts`, `tool-registrations.trash-item`, `byok-provider-turn`, `merged-readers-batch`, `mcp-ui-tool-calls-route.delete-confirmation-family.integration`): 251/251.
- `npx eslint <touched files>`: 0 errors; the only warnings are in the five existing test files where only an import line changed (pre-existing).
- S-FN50 on the files whose function bodies changed (`tool-registrations.ts`, the characterization test): prints nothing. The two hits printed for S4 are in existing test files that changed only an import line (`837:109` 59 lines, `200:96` cognitive 18); the same command on the parent has them too.
- `check:size` exit 0 (S0: 203 violations; S1 onward: 202 violations / 9 accepted exceptions, the deleted row). `check:complexity` exit 0 (43 entries, unchanged).
- `check:architecture`: S0, S1, S2, extra: output byte-identical to the base output. S4: identical except two lines that carry the file count, `2245 files` -> `2244 files` (agent-tools.ts deleted) and `bidirectional hub count 16.17% (363/2245)` -> `16.18% (363/2244)`; the hub count (363), the three regressed-metric lines and every `NEW cross-feature edge` line are unchanged. No new line beyond the base output.
- `check:errors | rg "^(New|Worse):"`: prints nothing, every commit.
- S-SUPPRESS, S-MOCK (Tovu and Jini), S-FORWARD: print nothing.
- Also run on S4: `check:inventory` ok, `check:error-rule-copies` ok, `check:route-tool-parity` exit 0. `check:boundaries` exits 16 with 16 errors none mentioning redirects (base-red, not touched); `check:jini-registry-drift` fails only because `apps/admin/node_modules/.bin/tsc` is absent (no `npm ci` in apps/admin; not touched).

## V3: each mutation applied on the S0 parent, RED shown, restored with `git show HEAD:<path> > <path>` + `git diff --quiet`

| Mutation | Failing test |
|---|---|
| comment out the `redirects_get` permission check | `(d) redirects_get: a principal without the permission is refused ...` |
| drop `metadata: toolMetadata` from `buildDomainRegistrations` | `(b) every descriptor equals the committed golden, metadata included` and `(g) redirects_tombstone carries the host confirmation policy ...` |
| change one catalog description (`...Read-only.` -> `...Read-only!`) | `(b)` |
| replace `redirects_list`'s `isInTrash` with `async () => false` | `(f) redirects_list leaves out a rule whose isInTrash is true` |

## Jini commit gates (`d23deabc`)

- `pnpm --filter @jini-ai/cms run build` and `typecheck` exit 0; `npm --prefix packages/cms run test`: 339 files / 4108 tests pass (first run failed `entries.test.ts` because the redirects entry test lists the barrel's owners; fixed in the same commit by adding the two modules as owners; not an assertion weakened, the barrel must equal the union of its owners).
- `pnpm guard` exit 0. First run flagged `HW3-module-state` on `redirectsDerivedRisk` (a module-level `new Map`); fixed by typing it `ReadonlyMap<...>` (the rule accepts that), no baseline edit.
- STOP matrix on the new/edited Jini files: S-IMPORT prints only the test file's `node:assert/strict` and `vitest` imports (and a regex false hit on the string `/a`); the two source files print nothing. S-BARREL, S-TEXT, S-RUNTIME, S-ARGS, S-FN50, S-SIZE: print nothing. S-SCHEMA, S-DELETE (both repos): print nothing.
- Package files import only own-package leaf files (`./redirects.js`, `./types.js`, `./ports.js`, `../core/tools/args.js`, `../core/commands/command.js`) and `@jini-ai/core` (+ `/contracts/events`, `/model-facing-tool-errors`).

## Test edits to existing files (COMMON-KT rule 7(a) only)

Only the specifier of `getRedirectsAgentToolCatalog` changed, to `@jini-ai/cms/redirects`, in: `assistant/__tests__/{byok-provider-turn,tool-registrations.contracts,tool-registrations.redirects,tool-registrations.trash-item}.test.ts` and `features/redirects/__tests__/agent-tools.tombstone-confirmation.test.ts`. No other existing test touched. Jini `entries.test.ts` (owner list) as described above.

## Differences from the sheet

- Extra commit `2a88e145`: my own S0 test imported `redirectsDerivedRisk` from `tool-registrations.js`; the binding must not re-export it, so the S0 test now reads `contributeRedirectsTools().risk` (same seven entries asserted; the identity assertion `contributor.risk === redirectsDerivedRisk` is dropped, `tool-registrations.redirects.test.ts` still covers the risk wiring).
- `_optional = {}` (no explicit type) on `buildRedirectsToolRegistrations`: S-ARGS bans `Record<string, never>`; the plugins package uses the same form. The builder has no real option.
- Jini `agent-tools.ts` keeps `AgentToolSideEffect`/`AgentToolDefinition` as module-local types (not exported, to avoid a second public name beside core's) and exports `MANAGE_REDIRECTS_PERMISSION` so the handlers and the catalog share one constant (the Tovu files had two copies).
- Tovu `RedirectsToolDeps` stays a field-for-field interface (sheet: keeps name and fields), beside Jini's `RedirectsPackageToolDeps`; TypeScript checks the assignment at the one call.
- The dead constant `REDIRECTS_TOMBSTONE_TOOL_ID` (never read) was dropped, not moved. Comments were reworded neutral in Jini (no ticket/ADR/host paths); the why text is preserved.
- Jini `redirectsDerivedRisk` is typed `ReadonlyMap` (see HW3 above); Tovu's `contributeRedirectsTools` still returns the same value.

## Left / not done (outside the sheet's write set)

- `apps/website/src/features/redirects/INFO.md:20` still says `agent-tools.ts` is a Tovu file; comments in `fs-files/agent-tools.ts`, `site-inspection/agent-tools.ts`, `sites/agent-tools.ts`, `theme/agent-tools.ts` name `redirects/agent-tools.ts` as a precedent. Doc/comment only.
- The coordinated Jini publish and the Tovu `package.json` range bump are not part of a sheet; Tovu is green against the linked Jini `d23deabc`.

## Overlaps with other live runs

None found. Shared one-line import edits in `tool-registrations.contracts.test.ts` and `tool-registrations.trash-item.test.ts` (the sheet lists them as shared with K-02/K-03/K-04/K-07/K-09); a rebase on those will conflict only on that one import line.

## Next step

Merge Jini `wave2/kt-K-01` (`d23deabc`) before or with Tovu `wave2/kt-K-01` (`d8ebe9de`); then K-02 (widgets tools) follows in chain K.
