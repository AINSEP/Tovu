PLAN PARTIAL: areas 2, 4 (in progress)

# P13 — plans for the areas the P12 ledger says have no plan (2026-11-23)

Bases: Tovu `origin/integ/merge-13-2026-11-22` (`f7185f153a`), Jini `origin/integ/merge-14-2026-11-22` (`4902a6a1a`). Ledger: `plans/P12-ledger.md` rows "CLI and other areas without a full sweep", "Site chat and SDK coverage", "Desktop renderer and public site coverage".
Planner loaded `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2) before any work. No production code was written; no builds or tests were run.

**Exclusion check.** Every file below was checked against the deletions on the 14 unmerged Tovu heads `origin/codex/ex4-{addons,deploy,desktop,integrations,media,security,settings}-tovu` and `origin/codex/ex5-{collections,fnd-inject,fnd-kit,fnd-routes,fnd-seams,posts,small}-tovu` (`git diff --name-status $(git merge-base <base> <head>)..<head>`, 345 deleted paths). Excluded hits in scope: `apps/admin/src/lib/playground-render-target-bus.ts` (+ its test) — deleted on `ex5-fnd-kit-tovu`, which moves it to `@jini-ai/admin/shell/lib/playground-render-target-bus`. The in-flight `codex/visitor-chat-tovu` touches 9 modified + 4 added paths (listed in §2); no P13 step edits them.

**Owner rules applied to every step** (not repeated per step): inject everything; hooks as props; keep `_optional = {}` pads and the args rule (`(required, optional = {})`); functions ≤ 80 lines, complexity ≤ 10; UI functions over 50 lines are NOT split (tabled 11-18); no re-export shells; Jini vendor- and server-framework-neutral (routes = `defineJsonRoute` specs; no `commander`, Express or Electron import in Jini source); no package above domains; CSS classes `jini-*`; why-comments move with the code they explain. Tests are written first, in the destination package, and must fail before the move lands.

## 0. Summary

| Area | Files in scope | Moving to Jini (whole or slice) | Staying | Steps | Est. hours |
|---|---:|---:|---:|---|---:|
| 1 · Tovu website CLI | 28 | 0 whole files deleted-and-moved except 2 (`help.ts`, `commands/introspect.ts`); generic slices of 5 more | 26 (5 thinned) | P13-C1..C3 | 6.5 |
| 2 · Site (visitor) chat remainder | _pending_ | | | | |
| 3 · Generic Admin UI + Playground | 7 | 0 | 7 | P13-A1 | 0.75 |
| 4 · Desktop renderer residual | _pending_ | | | | |

---

## 1. Tovu website CLI (`apps/website/src/cli/`, 28 production files)

### 1.0 Findings

- **P10-C1 is not this area.** It moves `J/agent-runtime/src/defs/<cli>.ts` files (agent CLIs such as claude/gemini) into folders. Nothing below touches `packages/agent-runtime`. **P11 ST-16 / ST-7b** add a new Tovu `tovu storage report|clean|compact` command (and `program.ts` registrations); P13 does not plan that command, and `commands/storage-move.ts` stays (see table). Schedule note: P13-C2 and ST-16 both edit `apps/website/src/cli/program.ts` — run them in different batches (§6).
- **Existing steps already repoint CLI imports but never move CLI files:** `K5-agent-plugins-8` (`agent-plugin-tokens.ts:12,13`), `K5-api-connections-1` (`owner-store.ts:2`), `K5-project-keys-1` (`owner-store.ts:1,3,4`, `owner-store-import.ts:5`), `K5-contracts-core-1` (`owner-store.ts:22`), `K5-contracts-core-2` (`export.ts:5`), `K5-deployments-4` (`deploy-config.ts:14`), `K5-plugin-runtime-2` (`plugin/install.ts:1`), `K5-site-backup-1/2` (`import-local.ts:7`, `serve`-path import cleanup), `D-source-control-1` (`owner-store-mapping.ts:3`). P13 steps do not touch those import lines.
- **`@jini-ai/cli` already owns the generic transport:** `readStreamText`/`PayloadTooLargeError` (`prompt.ts`), `readStdinRequestLine` (`stdin-line.ts`), `introspectProgram`/`toMcpTools` (`introspection.ts`, structural `IntrospectionCommand` — no `commander` import), `DEFAULT_CLI_EXIT_CODES`/`exitWithStructuredError` (`errors.ts`). Tovu already consumes the first three. What is still generic and still in Tovu is (a) the commander-error→exit-code outcome mapping and the bin run loop, (b) the `--format commander|mcp` introspect printer, (c) strict stdin-JSON request field validators and the port parser. Everything else is Tovu site-directory product wiring.
- **The bin path is pinned.** `package.json:15` `"tovu": "dist/src/cli/main.js"`, plus `apps/desktop/src/tovu-server.ts`, `smoke-packaged-chat.ts`, `electron-builder-files.test.ts` and `stage-payload-*` name `src/cli/main.(ts|js)`. `main.ts` therefore stays at its path as the composition root; only its body moves.

### 1.1 Per-file decision (28 files, LOC = `wc -l` on base)

| File | LOC | Decision | Reason / step |
|---|---:|---|---|
| `cli/main.ts` | 45 | STAYS (thinned) | bin entry pinned by `package.json:15` and desktop staging; run loop → Jini in **P13-C1** |
| `cli/help.ts` | 35 | **→ Jini, deleted** | generic usage printers over any `helpInformation()` program → **P13-C1** |
| `cli/errors.ts` | 221 | STAYS (thinned) | Tovu exit-code registry, site-dir classes, adopt refusal table, `PortInUseError`/`Export*` classes stay; generic outcome mapper + commander code sets → **P13-C1** |
| `cli/program.ts` | 313 | STAYS | Tovu command tree (names, descriptions, flags) = composition root; one action rewired in **P13-C2** |
| `cli/introspect.ts` | 36 | STAYS | already Tovu policy over `@jini-ai/cli/introspection` (excluded commands, `tovu_` prefix) |
| `commands/introspect.ts` | 47 | **→ Jini, deleted** | generic manifest printer → **P13-C2** |
| `commands/stdin-input.ts` | 14 | STAYS | Tovu wording adapter; the generic reader is already `@jini-ai/cli` `readStreamText` |
| `commands/owner-store.ts` | 382 | STAYS (thinned) | Tovu owner-vault actions/kinds; 6 generic field validators (`:271–320`) → **P13-C3** |
| `commands/import-local.ts` | 171 | STAYS (thinned) | `.tovu.zip` import policy and wording; `parseRequestObject` (`:111–118`) → **P13-C3** |
| `commands/serve.ts` | 373 | STAYS (thinned) | Tovu site boot/serve lifecycle; `parsePort` (`:88–100`) → **P13-C3** |
| `commands/serve-listen.ts` | 195 | STAYS | binds the Tovu serving app, workers, theme watcher, assistant daemon, admin dev proxy (product composition) |
| `commands/init.ts` | 156 | STAYS | Tovu site-dir creation, owner password, agent-plugin tokens |
| `commands/adopt.ts` | 200 | STAYS | Tovu site-dir repair/adoption policy |
| `commands/export.ts` | 205 | STAYS | Tovu static export composition (imports repointed by K5-contracts-core-2) |
| `commands/import-site.ts` | 53 | STAYS | Tovu site import over `site-backup` backend |
| `commands/storage-move.ts` | 62 | STAYS | Tovu site-dir storage move; P11 ST-16 owns new storage commands |
| `commands/site-rename.ts` | 16 | STAYS | one call into Tovu `site-dir/moves` |
| `commands/reset-owner.ts` | 29 | STAYS | Tovu owner reset composition |
| `commands/deploy-config.ts` | 180 | STAYS | Tovu deploy-config generator wiring (imports repointed by K5-deployments-4) |
| `commands/agent-plugin-tokens.ts` | 104 | STAYS | Tovu site composition (imports repointed by K5-agent-plugins-8) |
| `commands/owner-store-import.ts` | 99 | STAYS | Tovu legacy-owner import mapping (repointed by K5-project-keys-1) |
| `commands/owner-store-mapping.ts` | 19 | STAYS | Tovu source-control key bindings (repointed by D-source-control-1) |
| `commands/plugin/install.ts` | 64 | STAYS | Tovu terminal consent + site binding; engine is already `@jini-ai/plugins/host/node` |
| `commands/theme/{generate-index,migrate,normalize-build,sync-originals,validate}.ts` | 43+81+76+48+95 | STAYS | themes stay in Tovu (owner) |

Counts: 28 production files; 2 deleted from Tovu (`help.ts`, `commands/introspect.ts`); 5 thinned (`main.ts`, `errors.ts`, `owner-store.ts`, `import-local.ts`, `serve.ts`); 21 unchanged STAYS. **OWNER-Q-1** in §5 asks whether "stays" is the right call for the command bodies.

### P13-C1 · Jini then Tovu · CLI outcome mapper and bin run loop (~3 h: J 2 h, T 1 h)

**Files (source):** `apps/website/src/cli/errors.ts` (221; the generic part is `CliOutcome` `:66–72`, `stderrLine` `:113–115`, `COMMANDER_VALIDATION_CODES` `:118–126`, `COMMANDER_SUCCESS_CODES` `:129`, `mapCodedError` `:202–207`, `mapCommanderError` `:209–221`, the INTERNAL fallback `:188–190`), `apps/website/src/cli/help.ts` (35, whole), `apps/website/src/cli/main.ts` (45; body `:23–43`).

**Destination (Jini, new):**
- `packages/cli/src/cli-outcome.ts` (~110 LOC): `CliOutcome`; `CodedErrorRule { type: abstract new (...args: never[]) => Error; code: string }`; `formatStderrLine({ binName, code, message })`; `PARSER_VALIDATION_CODES` and `PARSER_SUCCESS_CODES` (the seven `commander.*` usage codes and three success codes, kept as strings — no `commander` import; the why-comments at `errors.ts:117`, `:128` and the "any other commander-internal error" comment inside `mapCommanderError` move with them); `mapParserError({ err }, { binName, exitCodes })` over a structural `ParserErrorLike { code: string; message: string }` (strips the leading `error: `, sets `printUsage` only for `commander.unknownCommand`); `mapCodedError({ err }, { rules, binName, exitCodes })`; `createCliOutcomeMapper({ binName, exitCodes, isParserError, classifiers, codedErrors })` returning `({ err }, _optional = {}) => CliOutcome`, order: `classifiers[]` first (each `(err) => CliOutcome | undefined`), then parser, then coded rules, then `INTERNAL`. `exitCodes` must contain `VALIDATION` and `INTERNAL` (throw at construction otherwise — fail fast).
- `packages/cli/src/program-run.ts` (~60 LOC): structural `RunnableProgram { helpInformation(): string; parseAsync(argv: string[], opts: { from: 'user' }): Promise<unknown> }`; `printBareUsage({ program }, { stdout, exit })` and `printUsage({ program }, { stderr })` (from `help.ts`; its header comment about bare `tovu` → stdout + exit 0 moves, worded for "the bin"); `runCliProgram({ createProgram, mapError, argv }, { stdout = process.stdout, stderr = process.stderr, exit = process.exit })` — bare argv → `printBareUsage`; otherwise `parseAsync`, catch → `mapError` → write `stderrLine`, optional usage, `exit(outcome.exitCode)`.
- Both exported from `packages/cli/src/index.ts` (the package barrel, `export *`), entry `"."` (runtime `node`). No new `package.json` export key. API baseline (`api-extractor` report if present) gains the new names; record that in the Jini commit.

**Tovu after the step:**
- `errors.ts` keeps `EXIT_CODE_BY_ERROR_CODE`, `OUTCOME_BY_REPAIR_REFUSAL`, `mapSiteDirError`, the `PortInUseError`/`ExportIncompleteError`/`ExportBlockedPendingRecoveryError` classes, `CODED_ERRORS`, and exports `mapErrorToCliOutcome = createCliOutcomeMapper({ binName: 'tovu', exitCodes: EXIT_CODE_BY_ERROR_CODE, isParserError: err => err instanceof CommanderError, classifiers: [pluginInstallOutcome, mapSiteDirError], codedErrors: CODED_ERRORS })`, where `pluginInstallOutcome` is the existing `PluginInstallError → exit 2` line (first line of `mapErrorToCliOutcome`, `:179`). The exported name and signature `({ err }, _options = {}) => CliOutcome` are unchanged, so its 7 importers need **no** edits (`git grep -n -F 'errors.js"' -- apps/website/src/cli` → 7: `main.ts:2`, `commands/export.ts:14`, `commands/serve-listen.ts:9`, 4 tests).
- `main.ts` body becomes `void runCliProgram({ createProgram, mapError: mapErrorToCliOutcome, argv: process.argv.slice(2) })`; the file header stays (it documents the bin contract).
- `help.ts` deleted. Importers to repoint: `git grep -n -F './help.js"' -- apps` → 1 (`main.ts:3`, removed by the rewrite).

**Injected ports/types:** `RunnableProgram`, `ParserErrorLike`, `CodedErrorRule`, `CliOutcome` are CLI-package-owned structural types (not `@jini-ai/core`: only `@jini-ai/cli` uses them). Tovu-specific codes stay in Tovu; nothing goes to `@tovu/contracts`.

**Tests first (Jini, vitest, `packages/cli/src/__tests__/`):**
- `cli-outcome.test.ts`: `parser help/version codes map to exit 0 with no stderr line`; `each of the seven parser usage codes maps to VALIDATION exit with "<bin>: VALIDATION: <msg>" and the leading "error: " stripped`; `only unknownCommand sets printUsage`; `an unrecognised parser code still maps to VALIDATION`; `classifiers run before parser and coded rules (first match wins)`; `coded rules match by instanceof, never by .name` (a plain object with the same `name` falls to INTERNAL); `non-Error throwables map to INTERNAL with String(err)`; `construction without VALIDATION or INTERNAL exit codes throws`.
- `program-run.test.ts`: `bare argv writes help to stdout and exits 0 without calling parseAsync`; `a rejected parseAsync writes exactly one stderr line then exits with the mapped code`; `printUsage outcome appends help to stderr`; `success outcome writes nothing to stderr`.
- **Named mutation:** in `mapParserError`, change the `printUsage` condition to `true` → `only unknownCommand sets printUsage` must go red; revert.

**Tovu tests that must stay green (unchanged):** `cli/__tests__/unit/errors-l149.unit.test.ts`, `unit/help-streams.unit.test.ts`, `integration/help-and-unknown-command.integration.test.ts`, `unit/export-command-boot-work.unit.test.ts`, `unit/plugin-command.unit.test.ts`, `integration/serve-export-teardown.integration.test.ts`. No behaviour change, so no Tovu mutation.

**Wiring text** — add to `packages/cli/README.md` under "What you get":
> **Outcome mapping and bin loop** — `createCliOutcomeMapper` turns any thrown value into `{ exitCode, stderrLine?, printUsage? }`: host classifiers first, then parser errors (structural `{ code, message }`, commander's code names), then `instanceof` coded rules, then `INTERNAL`. `runCliProgram({ createProgram, mapError, argv }, { stdout, stderr, exit })` is the whole bin: bare invocation prints usage to stdout and exits 0. The host owns its exit-code table and error classes.

and to the header comment of Tovu `apps/website/src/cli/errors.ts`: "Tovu's exit-code registry and domain classifiers; the mapping engine is `@jini-ai/cli` `createCliOutcomeMapper`."

**Prerequisites:** none (independent of all P9/P12 steps). **Files removed from Tovu:** `apps/website/src/cli/help.ts`.

### P13-C2 · Jini then Tovu · introspect printer (~1.5 h: J 1 h, T 0.5 h)

**Files (source):** `apps/website/src/cli/commands/introspect.ts` (47, whole).
**Destination:** `packages/cli/src/introspection.ts` (109 → ~150): add `INTROSPECTION_FORMATS = ['commander', 'mcp']` and `printIntrospection({ manifest, format = 'commander', toolNamePrefix }, { output, invalid })`. `introspection.ts` is the `"./introspection"` entry with runtime `universal`, so `output` (`({ message }) => void`) and `invalid` (`({ message }) => Error`) are **required** ports — no `process.stdout` default in Jini. The "never maps errors to exit codes itself" note moves as a why-comment.
**Tovu after the step:** `introspect.ts` gains `export const TOVU_TOOL_PREFIX = 'tovu_'` (used by its existing `toMcpTools`). `program.ts`'s introspect action (import `program.ts:15`, call `program.ts:296`) calls `printIntrospection({ manifest: introspectProgram(program), format, toolNamePrefix: TOVU_TOOL_PREFIX }, { output: ({ message }) => process.stdout.write(message), invalid: ({ message }) => new ValidationError({ message }) })`. Message text must stay `--format must be one of: commander, mcp (got "<x>")` (Jini builds it; Tovu tests assert it).
**Importers to repoint:** `git grep -n -F 'commands/introspect.js"' -- apps` → 2: `program.ts:15` (rewired above) and `cli/__tests__/unit/introspect-command.unit.test.ts:4` (repoint to `@jini-ai/cli/introspection` `printIntrospection` with the two ports; assertions unchanged).
**Tests first (Jini):** `introspection-print.test.ts`: `commander format prints the manifest as 2-space JSON plus newline`; `mcp format prints toMcpTools(manifest, prefix)`; `format defaults to commander`; `unknown format calls invalid with the exact message and prints nothing`.
**Named mutation:** drop `'mcp'` from `INTROSPECTION_FORMATS` → `mcp format …` red; revert.
**Tovu green:** `unit/introspect-command.unit.test.ts` (repointed), `unit/introspect.unit.test.ts`, `integration/introspect-command.integration.test.ts`.
**Wiring text** (`packages/cli/README.md`, introspection paragraph): "`printIntrospection` is the `introspect` command body: the host passes its live manifest, its MCP tool prefix, an output port and its validation-error factory."
**Prerequisites:** none; **not in the same batch as P11 ST-16** (both edit `program.ts`). **Files removed from Tovu:** `apps/website/src/cli/commands/introspect.ts`.

### P13-C3 · Jini then Tovu · strict stdin-JSON request fields and port parsing (~2 h: J 1.25 h, T 0.75 h)

**Files (source slices):** `commands/owner-store.ts` (382): `requestObject` `:271–276`, `assertFields` `:289–291`, `objectValue` `:293–296`, `stringValue` `:298–301`, `absolutePath` `:306–310` (with its Windows/`..` why-comment `:303–305`), `revision` `:312–315`. `commands/import-local.ts` (171): `parseRequestObject` `:111–118`. `commands/serve.ts` (373): `parsePort` `:88–100`.
**Destination (Jini):** new `packages/cli/src/request-fields.ts` (~80 LOC): `parseRequestObject({ text }, { maxBytes?, invalid })` (null or over-cap text, bad JSON, array or non-object → `invalid()`); `assertKnownFields({ record, fields }, { invalid })`; `requireObject`, `requireString` (non-empty after trim, no NUL), `requireAbsolutePath` (absolute and no `..` segment on `/` or `\`), `requirePositiveInt` — each `({ value }, { invalid })`. Add `parsePortValue({ raw }, { invalid })` to `packages/cli/src/flags.ts` (146 → ~165), where `invalid` receives `{ reason: 'not-integer' | 'out-of-range', raw, value? }` so the host keeps its two exact messages. Export through the barrel (entry `"."`). `invalid` is always injected; Jini mints no error class.
**Tovu after the step:** `owner-store.ts` replaces the six local helpers with the Jini ones bound once to `invalid: () => new OwnerStoreInputError()` (the class stays at `:71`; it is the owner-store wire code); `assertRequestFields` and the 64 KiB cap value stay in Tovu. `import-local.ts` calls `parseRequestObject({ text }, { invalid: () => new ValidationError({ message: 'import-local: stdin must contain one JSON request object.' }) })`; `parseRequest` stays. `serve.ts` `resolveServePort` calls `parsePortValue` with a factory that reproduces both existing `--port` messages verbatim.
**Importers to repoint:** none outside the three files (the helpers are module-private: `git grep -n -E 'function (requestObject|objectValue|stringValue|absolutePath|revision|parseRequestObject|parsePort)\b' -- apps/website/src/cli` → 7 definitions, 0 imports).
**Tests first (Jini):** `request-fields.test.ts`: `rejects text over maxBytes before parsing`; `rejects arrays, null and primitives`; `assertKnownFields rejects one unknown key and accepts a subset`; `requireString rejects blank and NUL-containing strings`; `requireAbsolutePath rejects relative paths and ".." on either separator`; `requireAbsolutePath accepts a Windows drive root`; `requirePositiveInt rejects 0, 1.5 and unsafe integers`. `flags.test.ts` additions: `parsePortValue rejects "08a" as not-integer`, `rejects 0 and 65536 as out-of-range`, `accepts " 3000 "`.
**Named mutation:** in `requireAbsolutePath`, split on `/` only → the `".." on either separator` case red; revert.
**Tovu green (unchanged):** `integration/owner-store.integration.test.ts`, `unit/owner-store-import.unit.test.ts`, `integration/import-local.integration.test.ts`, `integration/serve-command.integration.test.ts`, `unit/serve-command-wiring.unit.test.ts`.
**Wiring text** (`packages/cli/README.md`): "**Strict request fields** — for a host command that reads one JSON request on stdin: `parseRequestObject`, `assertKnownFields`, `require*`. Every refusal comes from the host's `invalid()` factory, so wire codes and wording stay the host's."
**Prerequisites:** must land **after** `K5-api-connections-1`, `K5-project-keys-1`, `K5-contracts-core-1` if those are in flight on `owner-store.ts` (same file, different lines — rebase only), and after `K5-site-backup-1` for `import-local.ts`. **Files removed from Tovu:** none (≈ 60 lines leave three files).

---

## 2. Site (visitor) chat remainder

_In progress._

---

## 3. Generic Admin UI and Playground (7 production files)

### 3.0 What is already covered

| File | LOC | Coverage | Result |
|---|---:|---|---|
| `apps/admin/src/features/admin-ui/AdminUi.tsx` | 45 | `P9U-untangle-v2` **R3.T** cuts all three sibling edges (`:5`, `:6` admin-themes → `themesTab` + `themesTitle` slot; `:7` integrations → host-passed redirect element; `:8` settings → `appearanceTab` slot). `A-K2-admin-themes-1` and `A-K2-integrations-1` repoint the same lines if they land first. | STAYS — after R3.T it is a Tovu composition (Tovu's Theme screen + Settings appearance in two URL tabs); no second consumer exists for a generic version. |
| `apps/admin/src/features/admin-ui/index.ts` | 2 | feature public surface used by `apps/admin/src/panel-pages.ts:18` (lazy import) | STAYS with the screen |
| `apps/admin/src/features/playground/Playground.tsx` | 71 | owner: stays (`plans/P9-data/stays-in-tovu.md:58`) | STAYS — confirmed |
| `apps/admin/src/features/playground/Playground.hooks.ts` | 7 | stays list `:57` | STAYS |
| `apps/admin/src/features/playground/hooks/use-playground-canvas.hooks.ts` | 50 | stays list `:54`; its bus import is repointed to `@jini-ai/admin/shell/lib/playground-render-target-bus` on `origin/codex/ex5-fnd-kit-tovu` | STAYS |
| `apps/admin/src/features/playground/index.ts` | 8 | stays list `:55`; `panel-pages.ts:59` | STAYS |
| `apps/admin/src/features/playground/playground-i18n.ts` | 30 | stays list `:56` | STAYS |
| `admin-ui/admin-ui.css` (not code) | 4 | hides the nested Theme panel's own heading — styles host-rendered Tovu content | STAYS |
| `apps/admin/src/lib/playground-render-target-bus.ts` | — | **excluded**: deleted on `ex5-fnd-kit-tovu` | not planned |

**Playground confirmed as STAYS.** Observation for the owner (no step planned): Jini already ships a port of the same screen — `packages/admin/src/playground/` (`react/pages/PlaygroundPage.tsx`, `react/components/Canvas.tsx`, `PORT.md` dated 2026-10-03, exports `./playground`, `./playground/react`, `./playground/adapters/{http,memory}`, `./playground/conformance`). Tovu does not mount it. See **OWNER-Q-3**.

**Correction to the STAYS ledger.** `stays-in-tovu.md:7–9` gives `admin-ui` the reason "Tovu product screen (assistant dock / dashboard / sites switcher)". That reason is wrong for this folder: it is the Theme + Appearance tabs page.

### P13-A1 · Tovu · lock the Admin UI / Playground STAYS after R3.T (~0.75 h)

- **Repo:** Tovu only. **Files:** `plans/P9-data/stays-in-tovu.md` (reasons for rows `:7–9`), the admin rank ratchet `development/boundaries/admin-feature-ranks.json` that `P9U-untangle-v2.md:474` creates (base has only `development/boundaries/feature-ranks.json`; if the admin file does not exist yet, this step is blocked on it).
- **Do:** (1) set the reason for the three `admin-ui` rows to "Tovu composition: URL tabs binding the Tovu Theme screen and the Settings Appearance slot (after R3.T)"; (2) confirm the `admin-ui` and `playground` rows in `admin-feature-ranks.json` are at the lowest rank R3.T leaves (no sibling-feature import). If R3.T has not landed, STOP and list this step as blocked on it.
- **Tests first:** none new — the existing rank ratchet (`P9U-untangle-v2` §R) is the gate; `apps/admin/src/features/admin-ui/__tests__/AdminUi.unit.test.tsx` and `redirects.unit.test.tsx`, and the three `playground/__tests__` files must stay green. No behaviour change, no mutation.
- **Wiring text:** create `apps/admin/src/features/admin-ui/INFO.md` and `apps/admin/src/features/playground/INFO.md` (no admin features INFO.md exists on base), each with: "`admin-ui` and `playground` are Tovu compositions and stay. Admin UI renders host-passed Theme and Appearance slots; Playground publishes its canvas to `@jini-ai/admin`'s render-target bus."
- **Prerequisites:** R3.T (`P9U-untangle-v2`), and `ex5-fnd-kit-tovu` merged for the bus import. **Files removed from Tovu:** none.

---

## 4. Desktop renderer residual

_In progress._

---

## 5. Owner questions

- **OWNER-Q-1 (Area 1):** Should the Tovu command bodies (`init`, `adopt`, `export`, `serve`, `import-*`, `storage-move`, `owner-store*`, `deploy-config`) stay in Tovu as product wiring, with only the generic slices in P13-C1..C3 moving? **Recommended: yes.** Every body opens a Tovu site directory, Tovu composition or Tovu feature; their feature imports are already repointed by K5/D steps, so they shrink to wiring without P13 moving them.
- **OWNER-Q-2 (Area 1):** `@jini-ai/cli` is "a CLI transport shell for driving a Jini daemon over HTTP". P13-C1 adds a host-bin run loop with commander-compatible error codes (as strings, no `commander` dependency). Accept that scope widening? **Recommended: yes** — the package already exports commander-shaped introspection (`introspection.ts`) and Tovu-Runner-style hosts need the same exit-code contract.
- **OWNER-Q-3 (Area 3):** Jini already has `@jini-ai/admin/playground` (a port of this Playground). Keep Tovu's own Playground screen (current owner decision) or later replace it by mounting the Jini page? **Recommended: keep the owner decision now; revisit after `ex5-fnd-kit-tovu` merges**, when both use the same `@jini-ai/admin` bus and a swap is a mount change with no move.

## 6. Step order for builders

_Filled in when areas 2 and 4 are complete._
