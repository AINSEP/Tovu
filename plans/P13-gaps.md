PLAN COMPLETE

# P13 — plans for the areas the P12 ledger says have no plan (2026-11-23)

Bases: Tovu `origin/integ/merge-13-2026-11-22` (`f7185f153a`), Jini `origin/integ/merge-14-2026-11-22` (`4902a6a1a`). Ledger: `plans/P12-ledger.md` rows "CLI and other areas without a full sweep", "Site chat and SDK coverage", "Desktop renderer and public site coverage".
Planner loaded `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.2) before any work. No production code was written; no builds or tests were run.

**Exclusion check.** Every file below was checked against the deletions on the 14 unmerged Tovu heads `origin/codex/ex4-{addons,deploy,desktop,integrations,media,security,settings}-tovu` and `origin/codex/ex5-{collections,fnd-inject,fnd-kit,fnd-routes,fnd-seams,posts,small}-tovu` (`git diff --name-status $(git merge-base <base> <head>)..<head>`, 345 deleted paths). Excluded hits in scope: `apps/admin/src/lib/playground-render-target-bus.ts` (+ its test) — deleted on `ex5-fnd-kit-tovu`, which moves it to `@jini-ai/admin/shell/lib/playground-render-target-bus`. The in-flight `codex/visitor-chat-tovu` touches 9 modified + 4 added paths (listed in §2); no P13 step edits them.

**Owner rules applied to every step** (not repeated per step): inject everything; hooks as props; keep `_optional = {}` pads and the args rule (`(required, optional = {})`); functions ≤ 80 lines, complexity ≤ 10; UI functions over 50 lines are NOT split (tabled 11-18); no re-export shells; Jini vendor- and server-framework-neutral (routes = `defineJsonRoute` specs; no `commander`, Express or Electron import in Jini source); no package above domains; CSS classes `jini-*`; why-comments move with the code they explain. Tests are written first, in the destination package, and must fail before the move lands.

## 0. Summary

| Area | Files in scope | Moving to Jini (whole or slice) | Staying | Steps | Est. hours |
|---|---:|---:|---:|---|---:|
| 1 · Tovu website CLI | 28 | 0 whole files deleted-and-moved except 2 (`help.ts`, `commands/introspect.ts`); generic slices of 5 more | 26 (5 thinned) | P13-C1..C3 | 6.5 |
| 2 · Site (visitor) chat remainder | 33 (30 site-chat + 3 SDK) | 0 whole files; generic slices of 5 | 33 (12 covered elsewhere, 4 deferred for `codex/visitor-chat-tovu`, 12 stay, 5 thinned) | P13-S1..S5 | 10.5 |
| 3 · Generic Admin UI + Playground | 7 | 0 | 7 | P13-A1 | 0.75 |
| 4 · Desktop renderer residual | 107 | 2 whole files (`WorkspaceChatPane` pair, P13-D2); 1 dedupe slice (P13-D1) | 105 (47 covered by AX rows, 58 stay) | P13-D1, D2 | 7.0 |
| **Total** | **175** | | | **11 steps** | **≈ 24.75** |

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

`SC/` = `apps/site-chat/src/`, `J/` = Jini `packages/`. LOC from `wc -l` on base. Importer counts from `git grep -n -F` on base: "all" = every tracked hit, "code" = hits in `apps packages development package.json .github`. None of the 33 paths is deleted on an ex4/ex5 head.

### 2.0 Counts

33 files in scope (30 site-chat incl. `vite-env.d.ts` — the ledger's 29 excludes it — plus 3 SDK) | 12 already covered | 4 deferred for `codex/visitor-chat-tovu` | 5 uncovered with a generic slice → Jini (partial extractions; no Tovu file deleted) | 12 uncovered STAY | 5 steps (P13-S1..S5) | ≈ 10.5 h.

### 2.1 Coverage table

| File | LOC | Covered by / P13 step / STAYS reason |
|---|---:|---|
| `apps/site-chat/scripts/measure-bundles.mjs` | 53 | `BX-17/18` (P9K B07 → `devops/build/bundle-size`) |
| `apps/site-chat/scripts/check-bundle-mounts.mjs` | 353 | **P13-S5** — generic harness → Jini; scenarios, storage keys, mount id stay |
| `SC/SiteAssistantActivation.hooks.ts` | 67 | `BX-7/8`; importer edited in **P13-S3** |
| `SC/SiteAssistantHeader.hooks.ts` | 20 | **P13-S1** — Escape-key port → Jini; copy binding stays |
| `SC/SiteAssistantHeader.tsx` | 19 | STAYS — host header-slot adapter; whether it survives is decided in `BX-8` (OWNER-Q-4), since Jini `EmbedChatWidget` already renders `EmbedChatHeader` (`J/chat/src/embed-widget/react/embed.tsx:51`) |
| `SC/SiteAssistantWidget.hooks.ts` | 76 | `BX-7/8`; **deferred** (edited on `codex/visitor-chat-tovu`) |
| `SC/SiteAssistantWidget.tsx` | 92 | `BX-7/8`; **deferred** (edited on `codex/visitor-chat-tovu`) |
| `SC/SiteToolConfirmation.hooks.ts` | 35 | `BX-13` |
| `SC/jini-kits.ts` | 9 | STAYS — host kit composition (precedent `stays-in-tovu.md:248`) |
| `SC/jini-surfaces.ts` | 13 | STAYS — host surface composition (precedent `stays-in-tovu.md:249`) |
| `SC/loader-entry.ts` | 5 | STAYS — build entry binding Jini `installLazyChatLoader` |
| `SC/loader-host.ts` | 62 | `BX-7/8` |
| `SC/main.tsx` | 50 | STAYS — self-mounting IIFE; `MOUNT_ID` `tovu-site-assistant-root` must match server markup |
| `SC/remixicon-override.ts` | 66 | STAYS — binds the host URL `/site-chat/remixicon.css`; the work is already Jini `installRemixIconStylesheet` (`J/ui/src/react/components/RemixIcon.stylesheet.ts:86`) |
| `SC/session-store.ts` | 164 | `BX-4/5` |
| `SC/site-assistant-errors.ts` | 33 | `P6-T1`; **deferred** (edited on `codex/visitor-chat-tovu`) |
| `SC/site-assistant-transport.ts` | 355 | `BX-1/2/3`, `P6-J1/T1`; **deferred** (edited on `codex/visitor-chat-tovu`) |
| `SC/site-chat-comparison.ts` | 68 | **P13-S3** — send bridge → Jini; variant detection and product event names stay |
| `SC/site-chat-i18n.ts` | 46 | **P13-S4** — repoint onto core `createDictionaryTranslator`/`interpolate`; dictionary (product copy) stays |
| `SC/tool-confirmation.ts` | 33 | `BX-13`; `P6-T2` deletes it |
| `SC/vanilla-entry.ts` | 7 | STAYS — build entry |
| `SC/vanilla-host.ts` | 75 | **P13-S2** — safe markdown-to-DOM renderer → Jini; the rest is host composition |
| `SC/vanilla-tool-confirmation.ts` | 101 | `BX-13` |
| `SC/visitor-page-control.ts` | 133 | `BX-14/15`, `P6-T3` |
| `SC/visitor-site-path.ts` | 14 | `BX-16` |
| `SC/vite-env.d.ts` | 1 | STAYS — Vite ambient types |
| `apps/site-chat/vite-public-guard.ts` | 28 | STAYS — Vite plugin enforcing Tovu's `apps/admin` boundary (ADR-054); Jini stays vendor-neutral |
| `apps/site-chat/vite.config.ts` | 96 | STAYS — product build config |
| `apps/site-chat/vite.lazy.config.ts` | 11 | STAYS — build config |
| `apps/site-chat/vite.vanilla.config.ts` | 18 | STAYS — build config plus no-React guard |
| `packages/sdk/src/content-contracts.ts` | 25 | `BX-24` |
| `packages/sdk/src/hooks.ts` | 79 | `BX-25` |
| `packages/sdk/src/index.ts` | 209 | `BX-24`, `BX-26` (public SDK entry stays) |

**Deferred until `codex/visitor-chat-tovu` merges:** `SiteAssistantWidget.hooks.ts`, `SiteAssistantWidget.tsx`, `site-assistant-errors.ts`, `site-assistant-transport.ts` — the branch rewrites visitor turn-end, status and error handling in exactly these files. The branch touches none of the five files P13 edits.

### 2.2 Step sheets

#### P13-S1 · Jini then Tovu · Escape-key port for the embed header (~1.5 h)

- **File:** `SC/SiteAssistantHeader.hooks.ts` (20). Only the inline `keyboard.subscribe` (`:8–17`: capture-phase `keydown` on `page.defaultView`, `preventDefault`, `onEscape`, disposer) moves.
- **Destination:** new `J/chat/src/embed-widget/react/escape-key-port.ts` exporting `createViewEscapeKeyPort({ view }, _optional = {}): EscapeKeyPort`; exported directly from the existing entry file `J/chat/src/embed-widget/react/embed.tsx` (`./react/embed`), which already exports `EscapeKeyPort`. `EscapeKeyPort` is declared at `J/chat/src/embed-widget/react/header.tsx:10`; Jini has no default implementation today.
- **Importers to repoint:** `git grep -n -F 'SiteAssistantHeader.hooks'` → all 2, code 1 (`SC/SiteAssistantHeader.tsx`); import unchanged (only the hook body changes).
- **Injected ports/types:** `view: Pick<Window, 'addEventListener' | 'removeEventListener'> | null` (chat-owned). Nothing to `@tovu/contracts`.
- **Why-comment that moves:** "consume confirmation Escape before the containing dialog closes" (capture phase + `preventDefault`).
- **Tests first** (`J/chat/src/embed-widget/react/__tests__/escape-key-port.test.ts`): `Escape calls onEscape and prevents default in the capture phase`; `non-Escape keys are ignored`; `the disposer removes the capture listener`; `a null view subscribes nothing and disposes safely`. Tovu green: `SC/__tests__/SiteAssistantHeader.test.ts`. No behaviour change → no mutation.
- **Tovu change:** `useSiteAssistantHeader` builds `keyboard` with `createViewEscapeKeyPort({ view: page.defaultView })`; the factory is injectable through the existing `_options` pad.
- **Wiring** (`J/chat/README.md`, embed section): "Hosts pass `keyboard: createViewEscapeKeyPort({ view: document.defaultView })` to `EmbedChatWidget`/`EmbedChatHeader`; the capture listener keeps a confirm-step Escape from also closing the host dialog." Tovu: line in `apps/site-chat/INFO.md` (OWNER-Q-7).
- **Prerequisites:** none; must land before `BX-8.T`. **Removed from Tovu:** no file (≈ 10 LOC).

#### P13-S2 · Jini then Tovu · safe visitor markdown renderer for the vanilla widget (~2 h)

- **File:** `SC/vanilla-host.ts` (75). Only the `renderMarkdown` body inside `createSiteVanillaArgs` (≈ `:39–56`: template parse, remove every `<img>` that is not same-origin http(s) or is unparsable, `replaceChildren`, `rel="noopener noreferrer"` on links) moves.
- **Destination:** new `J/chat/src/embed-widget/vanilla/safe-markdown.ts` exporting `createSafeMarkdownRenderer({ toHtml, document }, _optional = {})`, returning the existing `renderMarkdown` port shape (`J/chat/src/embed-widget/vanilla/index.ts:31`); exported from the existing `./vanilla` entry.
- **Vendor neutrality:** micromark is injected as `toHtml(content) => string`; chat does not depend on micromark. Tovu keeps the micromark call, GFM options and footnote-disable list (OWNER-Q-8).
- **Why-comments:** "Defaults escape raw HTML and reject unsafe protocols; never enable allowDangerousHtml…" becomes the `toHtml` contract doc; "Filter the detached fragment before insertion so an untrusted image never starts a request" moves with the code.
- **Importers:** `git grep -n -F 'vanilla-host'` → all 36, code 7 (`SC/vanilla-entry.ts`, 4 tests, `development/scripts/error-gate-debt.json`, `development/scripts/extraction-dossier.mjs`); none changes (`createSiteVanillaArgs` keeps its signature). If the moved `catch { image.remove(); }` is the `vanilla-host.ts` `catch-reads-error` entry in `error-gate-debt.json`, ratchet it down (NOT-CHECKED).
- **Tests first** (`J/chat/src/embed-widget/vanilla/__tests__/safe-markdown.test.ts`, jsdom is a chat devDependency): `a cross-origin, protocol-relative, data: or unparsable image never enters the DOM`; `same-origin relative and absolute images are kept`; `links get noopener noreferrer`; `the fragment is filtered before insertion`. **Named mutation:** keep images whose origin differs → cross-origin test red. Tovu green: `SC/__tests__/vanilla-host.test.ts`.
- **Wiring** (`J/chat/README.md`, vanilla section): "`renderMarkdown: createSafeMarkdownRenderer({ toHtml, document })`. `toHtml` must escape raw HTML and reject unsafe protocols; the renderer only removes off-origin images and hardens links."
- **Prerequisites:** none for J. T edits `vanilla-host.ts`, also edited by `BX-3.T`, `BX-13.T`, `BX-15.T`, `P6-T2` and P13-S3.T → serial with all of them. **Removed from Tovu:** no file (≈ 15 LOC).

#### P13-S3 · Jini then Tovu · embed remote-send bridge (generic half of the comparison channel) (~2.5 h)

- **File:** `SC/site-chat-comparison.ts` (68). Moves: the `installSiteChatComparisonSend` body (CustomEvent request/`done` validation, one in-flight request, `jini-chat-open` dispatch, `dataset.compareReady`, parent `postMessage` ready signal, disposer) and `createReactSiteComparisonControl` (adapter to `ChatPaneProps['agentControl'].bridgeAccess`, rejecting a pending send on unmount). Stays: `readSiteChatComparisonVariant`/`parseComparisonVariant` (the `/__compare/site-chat` path, mount id, `data-chat-compare`, cross-origin catch) and the host-supplied names `tovu-compare-send`, `tovu-site-chat-ready`, invocation id `site-chat-comparison`.
- **Destination:** new `J/chat/src/embed-widget/browser/embed-send-bridge.ts` exporting `installEmbedSendBridge({ root, send, requestEventName, readyMessageType, enabled }, _optional = {})` and `createEmbedSendAgentControl({ root, enabled, invocationId, ...names }, _optional = {})`; new subpath `./browser/embed-send-bridge` in `J/chat/package.json` (`jini.entries` → `"browser"`). The control type is a type-only import of `ChatPaneAgentControlOptions` (`J/chat/src/react/features/chat-pane/types.ts:147`).
- **Why-comments:** "never opens a parallel transport or edits its DOM"; "One in-flight … prevents a double-click from starting duplicate runs".
- **Importers:** `git grep -n -F 'site-chat-comparison'` → all 38, code 10. Repoint `SC/SiteAssistantActivation.hooks.ts:3` → `createEmbedSendAgentControl` with names; `SC/vanilla-host.ts:6` → `installEmbedSendBridge`. Unchanged: `SC/loader-host.ts:2`, `SC/session-store.ts:3` (variant reader only). Test `SC/__tests__/site-chat-comparison.test.ts` (4 hits) keeps its variant tests. Re-check the `error-gate-debt.json` `catch-reads-error` entry (NOT-CHECKED). The Tovu file must not re-export the Jini functions.
- **Injected ports:** `send`, `enabled` (host variant decision), event/message names, `invocationId`, `capabilityId` (default `chat.send_message`).
- **Tests first** (`J/chat/src/embed-widget/browser/__tests__/embed-send-bridge.test.ts`): `disabled installs no listener and returns a no-op disposer`; `a second request while one is in flight is refused with the busy sentence`; `malformed requests are ignored`; `a non-Error failure is reported as text`; `the disposer removes the listener and the ready flag`; `unmounting rejects a send still in flight`. **Named mutation:** drop the busy guard → duplicate-request test red. Tovu green: `SC/__tests__/site-chat-comparison.test.ts`, `SC/__tests__/loader-host.test.ts`.
- **Wiring** (`J/chat/README.md`): "An embedding page can drive a mounted widget through `installEmbedSendBridge`. The host decides `enabled` and names the events; ordinary visitors get no listener."
- **Prerequisites:** P13-S2.T (shares `vanilla-host.ts`); land before `BX-8.T` (`SiteAssistantActivation.hooks.ts`) or fold into it. OWNER-Q-5. **Removed from Tovu:** no file (≈ 45 LOC).

#### P13-S4 · Tovu (optional Jini) · visitor i18n onto core translators (~1.5 h)

- **File:** `SC/site-chat-i18n.ts` (46). `SITE_CHAT_DICTIONARY` (product copy) stays. `createSiteChatI18n`'s lookup and `{name}` fill are replaced by `createDictionaryTranslator({ featureDictionary: SITE_CHAT_DICTIONARY })` and `interpolate` from `@jini-ai/core/text` (`J/core/src/text/index.ts:10,12`).
- **Importers:** `git grep -n -F 'site-chat-i18n'` → all 11, code 4 (`SiteAssistantActivation.hooks.ts`, `SiteAssistantHeader.hooks.ts`, `vanilla-host.ts`, the test); none changes (`{ locale, t }` kept). No new ports.
- **Tests first** (add to `SC/__tests__/site-chat-i18n.test.ts`): `an unknown key falls back to the English source key`; `an inherited property name is not treated as a translation` (key `constructor`). Existing tests stay green. Behaviour note: core `interpolate` uses `key in vars`, Tovu uses `vars[name] === undefined`; they differ only for an explicit `undefined`, which the type forbids — no mutation.
- **If OWNER-Q-6 is accepted:** J adds a React-free subpath `@jini-ai/ui/i18n/locale` for the existing `J/ui/src/features/i18n/locale.ts` (`resolveSystemLocale`, `:33`; today reachable only via the `@jini-ai/ui` root, which also exports React context and trips the vanilla no-React guard), runtime universal, ≈ 0.5 h. T matches the locale with `resolveSystemLocale({ languages: [lang], supportedLocales })`. New tests: `pt resolves to pt-BR`, `zh-Hant resolves to zh-TW`. **Named mutation:** remove the base-language fallback → `pt` test red.
- **Wiring:** creates `apps/site-chat/INFO.md` (OWNER-Q-7) with "Visitor copy lives in `site-chat-i18n.ts`; lookup and placeholders are `@jini-ai/core/text`."
- **Prerequisites:** none. **Removed from Tovu:** no file (≈ 12 LOC).

#### P13-S5 · Jini then Tovu · built-bundle mount smoke harness (~3 h)

- **File:** `apps/site-chat/scripts/check-bundle-mounts.mjs` (353) + `check-bundle-mounts.d.mts`. Moves: `BundleCheckError`/`fail` (`:63–68`), `isNavigationError` (`:87–90`), `failOnErrors` (`:92–96`), `stubBrowserGaps` (`:98–110`), `runScenario` (`:117–186`), `checkBundleMounts` (`:312–316`), `readBundle` (`:319–325`), `main` (`:332–345`), `isEntryPoint` (`:348–350`). Stays: `scenarios` (`:188–311`), `PAGE_CONTENT_HTML`, `MOUNT_ID`, storage keys, `BUNDLE_PATH`.
- **Destination:** new `J/devops/src/build/bundle-mount-smoke.ts` (directory does not exist on merge-14), subpath `./build/bundle-mount-smoke` (`jini.entries` → `"node"`): `runBundleScenario({ scenario, bundleSource, createDom, mountId, pageHtml, url }, { settleMs = 150, log } = {})`, `checkBundleMounts`, `runBundleCheckCli`, `isEntryPoint`. `BX-18` should reuse this `isEntryPoint` (duplicate at `measure-bundles.mjs:48`).
- **Vendor neutrality:** jsdom injected as `createDom(html, { url }) => { window, onConsoleError }`; devops gets no jsdom dependency — Jini tests use a hand-built fake DOM. Neutrality rename: stub markers `__tovuScrollIntoViewCalls`/`__tovuLastScrollIntoViewOptions` → `__jiniScrollIntoView*` (read at `check-bundle-mounts.mjs:251` and `SC/__tests__/check-bundle-mounts.test.ts:41,83,84`, updated in T).
- **Why-comments that move:** why execute instead of grep; fresh DOM per scenario (self-mounting IIFE); jsdom navigation as the signal; the rAF/`scrollIntoView`/`matchMedia` stubs; the 150 ms settle (React 19 scheduler). SPEC-046 sections stay with the Tovu scenarios.
- **Importers:** `git grep -n -F 'check-bundle-mounts'` → all 30, code 14: `apps/site-chat/package.json` (2, unchanged — script path kept), the `.d.mts` (shrinks), the script itself (3), `SC/__tests__/check-bundle-mounts.test.ts` (7 — split: harness tests move to Jini, scenario tests stay), `development/e2e/journeys/site-chat.pins.journey.ts` (comment only).
- **Injected ports:** `createDom`, `mountId`, `pageHtml`, `url`, CLI `readText`/`error`/`exit` (devops-owned).
- **Tests first** (`J/devops/src/build/__tests__/bundle-mount-smoke.test.ts`): `a throw while evaluating fails before the mount check`; `an error after evaluation is a post-mount failure`; `a removed or empty mount point fails`; `scenarios run in order and stop at the first failure`; `the CLI reports an unreadable bundle with exit 1`; `isEntryPoint is true only for the started script`. **Named mutation:** skip the post-settle `failOnErrors` → post-mount test red. Tovu keeps its scenario tests.
- **Wiring:** `J/devops/README.md` and `J/devops/API.md`: "Post-build smoke: the host supplies `createDom` (e.g. jsdom), the mount id, page HTML and scenarios; Jini executes the built bundle per scenario in a fresh DOM and fails on any load or post-mount error." Row in `J/devops/source-map.md`.
- **Prerequisites:** none; J half serial with `BX-17.J` (same devops manifest/API files). **Removed from Tovu:** no file (≈ 150 LOC).

### 2.3 Area 2 owner questions — listed in §5 as OWNER-Q-4 … OWNER-Q-8.

### 2.4 Parallelism

- Jini: S1.J → S2.J → S3.J serial (all touch `J/chat/package.json`/API baseline) or one Jini PR. S5.J disjoint from them; serial with `BX-17.J`. Optional S4.J (`J/ui/package.json`) disjoint.
- Tovu: S1.T, S4.T, S5.T mutually disjoint. S2.T then S3.T serial (`vanilla-host.ts`), and both before or folded into `BX-3.T`/`BX-13.T`/`BX-15.T`/`P6-T2`; S1.T and S3.T before `BX-8.T`.
- No P13-S step needs `codex/visitor-chat-tovu` merged.

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

## 4. Desktop renderer residual (`apps/desktop/src/renderer/`, 107 production files)

`R/` = `apps/desktop/src/renderer/`. Scope: tracked `.ts`/`.tsx` minus `*.test.*`, `*.spec.*`, `__tests__`, `.d.ts`, stories (ledger says 106; the extra file is `app-hooks.test-support.ts`).

### 4.0 Counts

107 files (12,311 LOC) | 47 covered by existing AX rows (4,169 LOC) — the ex4 desktop lane moved **0** renderer files | 58 STAY (7,813 LOC) | 2 generic and uncovered → Jini (329 LOC) | 2 steps (P13-D1, P13-D2) | ≈ 7 h.

Findings:
- **The ex4 desktop lane changed no renderer file** (`git diff --name-status <merge-base>..origin/codex/ex4-desktop-tovu` → 0 `renderer/` paths; `deleted.txt` → 0). Its SKIP list is almost entirely main-process (§4.2).
- **DT-desktop-1, K5-desktop-1 and P11-storage-budget-v2 list no renderer file.** AX coverage exists only as rows in `P9K-combined.md`; `plans/P9-steps/` has no AX sheets.
- **18 of the 47 covered files (1,629 LOC) are covered only on paper.** Their AX rows (AX-48, 49, 51, 53, 55, 64, 78, 118, 120 hook half, 126) target React hooks inside `desktop-host`, but Jini `desktop-host/package.json` has no React dependency or peer and 0 files under `desktop-host/src` import `react` (checked). This is the ex4 report's owner decision 5 → **OWNER-Q-9**.
- `stays-in-tovu.md` lists 106 of the 107 files; the missing one is `R/app-hooks.test-support.ts` (**OWNER-Q-14**). AX rows override the blanket STAYS entry for the 47 covered files.

### 4.1 Per-folder / cluster table

| Cluster | Files | LOC | Status | Reason |
|---|---:|---:|---|---|
| `R/` find bar (`find-bar-state`, `find-focus-clock`, `use-find-bar-state`, `find-target`, `use-find-in-page`, `use-find-bar-effects`, `find-input-focus`, `use-find-focus-reclaim`, `use-find-input-binding`) | 9 | 822 | AX-48/49/51 | target `desktop-host/electron/usability/react`; blocked on OWNER-Q-9 |
| `R/use-zoom.hooks` | 1 | 257 | AX-53 | React hook in `desktop-host`; OWNER-Q-9 |
| `R/use-app-version`, `use-update-check` | 2 | 51 | AX-55 | `desktop-host/react/app-version`; OWNER-Q-9 |
| `R/use-live-views`, `use-webview-load-failure` | 2 | 263 | AX-64 | `desktop-host/react/guests`; OWNER-Q-9 |
| `R/use-resources.hooks` | 1 | 101 | AX-78 | `desktop-host/resources`; OWNER-Q-9 |
| `R/use-site-view-preference`, `use-import-handoff`, `site-theme-preview.hooks` | 3 | 135 | AX-118/120/126 | `desktop-host/electron/*`; OWNER-Q-9 (AX-120's IPC half landed on ex4-jini; AX-126 is also a theme exclusion) |
| `R/folder-drop.ts` | 1 | 94 | AX-57 (dedupe) | dead duplicate of `@jini-ai/ui/core` `folderPathsFromDataTransfer`; 0 importers |
| `R/use-dropdown-menu` | 1 | 76 | AX-58 | → `ui` |
| `R/expanded-mode`, `theme`, `use-delete-confirmation`, `use-expanded-mode` | 4 | 254 | AX-60 | → `ui` |
| `R/use-loaded-sites` | 1 | 62 | AX-62 | → `ui` |
| `R/use-site-list-prefs` | 1 | 67 | AX-66 (dedupe) | → `ui/site-card` |
| `R/chat-attachments`, `workspace-chat-transport`, `use-workspace-chat-transport` | 3 | 606 | AX-69 | → `chat` |
| `R/runner-conversation-controller`, `use-runner-conversations` | 2 | 519 | AX-71 | → `chat/conversations` |
| `R/ResourcesPanel.tsx`, `ResourcesPanel.hooks` | 2 | 218 | AX-79 | → `ui/resource-monitor` |
| `R/use-site-preview` | 1 | 112 | AX-87 | → `ui/site-card` |
| `R/import-error-details`, `mount-renderer`, `nav-availability` | 3 | 65 | AX-105 | → `ui` |
| `R/product-telemetry` | 1 | 30 | AX-106 | → `diagnostics` |
| `R/use-site-toast`, `SiteToast.tsx` | 2 | 72 | AX-107 | → `ui` |
| `R/icon-frame.tsx`, `use-import-drop` | 2 | 65 | AX-110 | → `ui` |
| `R/use-create-site-plugin-tokens` | 1 | 118 | AX-41 | repointed to `agent-plugins/connect` |
| `R/app/FindBar.tsx` | 1 | 71 | AX-50 | → `ui/find` |
| `R/app/Spinner.tsx` | 1 | 10 | AX-57 (dedupe) | → `ui` `Spinner` (markup/accessible-name change, OWNER-Q-15) |
| `R/app/LoadedSitesStepper.tsx`, `.hooks` | 2 | 101 | AX-62 | → `ui` |
| **`R/WorkspaceChatPane.tsx`, `R/use-workspace-chat-pane.hooks.ts`** | 2 | 329 | **P13-D1, P13-D2** | generic `ConversationList` + `ChatPane` composition with folder-drop capture; no AX row; not rendered in production |
| `R/` composition root (`main.tsx`, `App.tsx`, `App.hooks.ts`, `jini-kits`, `jini-surfaces`, `app-shell-source`, `runner-api`) | 7 | 725 | STAYS | host composition, kit/surface bindings, Tovu bridge lookup over Tovu IPC contracts |
| `R/` test support (`app-hooks.test-support`, `app-render-harness`, `dom-hook-harness`, `source-test-harness`) | 4 | 349 | STAYS | `node:test`/jsdom harnesses for Tovu's runner (Jini uses vitest); typed on Tovu `SiteRecord`/`SiteFolders` |
| `R/` site management (`SiteGrid.tsx`/`.hooks`, `SitesFolders`, `site-port.rules`, `site-shell-policy`, `site-status`, `sites-home-view`, `use-add-site`, `use-new-site-dir`, `use-project-mutations`, `use-project-tabs`, `use-site-actions`, `use-site-folders`, `use-site-locate`, `use-site-power`, `use-site-rename`, `use-site-start`, `use-site-storage-settings`, `use-sites-folders-dialog`, `use-sites-inventory`, `use-tab-close-ask`, `use-site-workspace`) | 22 | 3,389 | STAYS | typed on `SiteRecord`/`SiteLifecycleStatus`/`SiteFolders` from `../contracts/project` or `desktopCopy`: Tovu site lifecycle and folder policy (tiny helpers `codeSpans`, `tabAfterClose` not worth a step) |
| `R/` create/import website (`CreateWebsiteOnboarding`, `ImportWebsite`, `create-website-onboarding-policy`, `import-drop`, `import-site-entry`, `use-create-website-form`, `use-import-website`, `use-start-imported`) | 8 | 1,146 | STAYS | product onboarding and `.tovu.zip` copy |
| `R/SharedKeys.tsx`, `SharedKeys.hooks` | 2 | 309 | STAYS | credential identities and vault bindings (S13) |
| `R/` nav, icons, screen telemetry (`icons.tsx`, `tool-icons.tsx`, `use-section-nav`, `use-product-screen`) | 4 | 471 | STAYS | glyphs keyed by `RunnerSectionId` and product tool kinds; Runner `desktop.navigate`; product telemetry vocabulary |
| `R/app/` shell (`CreateWebsiteHost`, `MainArea`, `MainContent`, `MainHeader`, `SettingsControl`, `SiteStartPanel`, `SiteWorkspace`, `TabCloseAsk`, `TabStrip`, `TopNav`, `component-harness`) | 11 | 1,424 | STAYS | product shell over `RunnerSectionId`, `SiteRecord`, product telemetry; `TabStrip` already uses `@jini-ai/ui/tab-strip`; `component-harness` is test support |

### 4.2 ex4-desktop SKIP list reconciled (`origin/codex/ex4-desktop-tovu:cloud-results/ex4-desktop.md`)

| Skipped item | Path (LOC) | Decision |
|---|---|---|
| DT-desktop-1 `find-menu` | `src/find-menu.ts` (49) | STAYS — defines the deployed `runner:find:toggle` channel (K01/D1 rejects moving deployed Find channels); reusable half already `desktop-host/electron/usability` `findMenu`. Not renderer. |
| DT-desktop-1 `node-toolchain` | `src/node-toolchain.ts` (72) | STAYS pending ex4 owner decision 1 (`TOVU_NODE_TOOLCHAIN_DIR`/`TOVU_BUNDLED_NPM_ROOT` contract). Not renderer. |
| DT-desktop-1 speech | `src/speech/{speech-ipc,transcription-port,mac-on-device-transcriber}.ts` (66/26/92) | STAYS pending ex4 owner decision 1 (`tovu:speech` ABI); reusable halves already in `desktop-host/speech`. Not renderer. |
| DT-desktop-1 `shell-staleness` | `src/shell-staleness.ts` (77) | DEDUPE pending ex4 owner decision 2 (which message wins). Not renderer. |
| AX-121 T | `import-handoff-ipc.test.ts:105` regex | stays on AX-121 (ex4 owner decision 3); renderer `use-import-handoff.hooks.ts` waits on OWNER-Q-9 |
| K5-desktop-1 (5 main-process files) | `app-version-ipc`, `asar-verify`, `desktop-memory-sampler`, `durable-json-file`, `find-in-page-ipc` | stays on K5-desktop-1 (blocked on K4-seam-17/18) |
| AX-57 | `R/folder-drop.ts` (94), `R/app/Spinner.tsx` (10) | stays on AX-57 (OWNER-Q-15); P13-D1 uses the same Jini helper but does not touch `folder-drop.ts` |
| Renderer hooks of AX-53–56, 58–68, 79, 87, 105, 107, 109–111, 118–121 | §4.1 rows | stay on their AX rows; only the 18 `desktop-host`-React targets are blocked (OWNER-Q-9); the rest wait only on their own prerequisites (AX-81 → AX-87; AX-68 → AX-69/71; AX-77 → AX-79) |
| AX-81/82 → 86–88, BX-19/20 → 114/115/128/129, durable-json → 93–96, 101/102, 118/119 | main process (+ `R/use-site-preview`, `R/use-site-view-preference`) | stay on their AX rows |
| `boot-failure.ts` (105), `admin-dev-proxy.ts` (157), `app-window.ts` (113), `dock-icon.ts` (34) | main process | STAYS — host failure decision, `TOVU_*` env contract, K3 product copy |
| `move-to-applications.ts` (240) | main process | stays on AX-101/102 (waits on durable-json) |

### P13-D1 · Tovu · workspace pane folder drop → `@jini-ai/ui/core` `captureFolderPathDrop` (dedupe, ~1.5 h)

- **Jini already has it:** `packages/ui/src/features/folder-path-drop/rules.ts` exports `captureFolderPathDrop`, `formatDroppedFolderPaths`, `folderPathsFromDataTransfer` and types `FolderPathDropEvent`, `CaptureFolderPathDropInput`, all exported from `@jini-ai/ui/core` (`ui/src/core.ts:161–163`).
- **Code removed:** `R/use-workspace-chat-pane.hooks.ts` (186) `:49–93` — the `FolderDropEvent` interface and `captureFolderDrop` with its doc block (45 lines). **Destination:** none (dedupe).
- **Replacement:** inside the existing `useCallback`, call `captureFolderPathDrop({ event, port: getPathForFile === undefined ? undefined : { getPathForFile }, composer: composerHandle })`. Keep `useCallback` (not `useFolderPathDropCapture`) so hook order is unchanged.
- **Importers** (`git grep -n -F captureFolderDrop` → 20 lines / 6 files): the hook file (7), `use-workspace-chat-pane.hooks.test.ts` (9), `use-workspace-chat-pane.hooks.render.test.ts` (1), `WorkspaceChatPane.tsx` (1, comment), `WorkspaceChatPane.render.test.ts` (1), `folder-drop.ts` (1, comment — leave for AX-57). `FolderDropEvent`: 2 lines, both in the hook file.
- **Ports/types:** `FolderPathDropPort` (`{ getPathForFile }`) is `ui`-owned. Nothing new in `@jini-ai/core` or `@tovu/contracts`.
- **Tests first** (`use-workspace-chat-pane.hooks.test.ts`, 12 → 13 tests): new `a dropped folder whose path contains a space is inserted quoted` (drop `/Users/x/My Site`, expect `insertText:"/Users/x/My Site"` with quotes) — red on base. Repoint the 6 existing drop tests to the Jini call shape; assertions unchanged (no whitespace paths). The render test's drop case stays as is.
- **Named mutation (behaviour changes):** make `formatDroppedFolderPaths` return the path unquoted in the linked Jini `dist` copy → the new test red; restore and confirm with `cmp`.
- **Wiring:** neither the Jini folder nor `apps/desktop` has an INFO/README, so a why-comment at the `onDropCapture` call site: "Folder drop: `@jini-ai/ui/core` `captureFolderPathDrop`, port = preload `getPathForFile`, composer = `ChatPane` `composerHandle`; quoted when a path has whitespace." Keep the existing "folder drop should yield a path, not an upload" why-comment. Record the removed doc block in `development/why-comments-debt.json`.
- **Prerequisites:** none. **Removed from Tovu:** 0 files (45 lines). OWNER-Q-11 (quoting).

### P13-D2 · Jini then Tovu · `WorkspaceChatPane` → `@jini-ai/chat/react/conversation-chat-pane` (J 4 h, T 1.5 h)

- **Files:** `R/WorkspaceChatPane.tsx` (143), `R/use-workspace-chat-pane.hooks.ts` (186; 141 after D1). Not rendered in production: `one-chat-fab-wiring.test.ts:75–77` asserts `App.tsx` does not reference it; `App.tsx:253` and `development/e2e/desktop/global-chat.desktop.ts:10` say it has zero call sites. Jini has no `ConversationList` + `ChatPane` composition (`git grep '<ConversationList'` over `chat/src`, `ui/src`, `admin/src` → only its own files). OWNER-Q-10 (move vs delete).
- **Destination:** `packages/chat/src/react/features/conversation-chat-pane/`: `components/ConversationChatPane.tsx`, `hooks/useConversationChatPane.hooks.ts`, `rules.ts` (`selectionRunContext` ← `WORKSPACE_RUN_CONTEXT`; `conversationListView` ← `workspaceConversationView`), `types.ts`, `index.ts`; new export `./react/conversation-chat-pane` (dist triple, `jini.entries` key, changeset, `pnpm api:update`).
- **Importers** (`git grep -n -F` on base): `useWorkspaceChatPane` 16 lines / 5 files, `WORKSPACE_RUN_CONTEXT` 14 / 4, `workspaceConversationView` 11 / 4 — all inside the moving/deleted set. `WorkspaceChatPane` 54 / 15; outside the moving set: `App.tsx` 2 (comments), `app.css` 1 (comment, `:1983`), `coverage-floors.json` 1, `one-chat-fab-wiring.test.ts` 4, `development/e2e/desktop/global-chat.desktop.ts` 1, `development/scripts/size-debt.json` 2 (row `WorkspaceChatPane#1`, value 92), `folder-drop.ts` 1 (AX-57 deletes), `use-runner-conversations.hooks.ts` 2 (AX-71), `use-workspace-chat-transport.hooks.ts` 1 and `workspace-chat-transport.ts` 1 (AX-69) — leave AX-owned citations to those steps.
- **Injected ports/types (chat-owned; nothing to `@tovu/contracts`):** required hook props with no Tovu defaults — `useTransport`, `useConversations`, `useDeleteConfirmation` (return types from AX-69.J's transport entry and AX-71.J's `chat/conversations`); `labels: ConversationChatPaneLabels` replacing all product copy ("Runner operator", "Workspace chat", aria "Runner chat"/"Close Runner chat"/"Confirm delete", the delete prompt, "Cancel", "Delete", the agent-CLI scan hint, the composer placeholder); `variant`, optional `className`, `components` (`ConversationList`, `ChatPane`). Keep `_optional = {}` pads. No Electron import — `getPathForFile` comes from `useTransport`'s return.
- **CSS:** Jini markup uses only `jini-conversation-chat-pane` and its `__head`, `__head-actions`, `__confirm`, `__confirm-actions`, `__confirm-delete`, `__status` elements, replacing the 7 `runner-chat-pane*` class uses. Tovu's `.runner-chat-pane` rules in `app.css` (`:1986–2210`) stay as host skin (OWNER-Q-13).
- **Tests first** (Jini vitest, green on a verbatim copy before labels are injected): port the 5 `WorkspaceChatPane.render.test.ts` tests, the 2 hook render tests and the 5 non-drop plain-function tests (named in the Tovu files); port the D1 drop tests only for cases `packages/ui/src/__tests__/features/folder-path-drop/rules.test.ts` does not cover (NOT-CHECKED). New: `every visible string comes from labels; the pane renders no built-in product copy`. **Test count:** Tovu −13 tests in 3 files (400 LOC), Jini ≥ +13. The BASE-RED source test "WorkspaceChatPane uses no raw React primitives" is replaced by Jini's `check:hooks` gate (whether it scans `.tsx` bodies is NOT-CHECKED; OWNER-Q-13).
- **Named mutation:** swap `confirmed: false`/`true` between the Cancel and Delete buttons → "a pending delete renders an inline confirmation whose buttons answer it" red; restore.
- **Wiring:** `packages/chat/src/react/README.md`, "What's swappable": "`ConversationChatPane` composes `ConversationList` + `ChatPane` + inline delete confirm + capture-phase folder drop; the host passes `useTransport`/`useConversations`/`useDeleteConfirmation` hooks and `labels`; no default copy." Tovu: the comment at `App.tsx:253–263` cites `@jini-ai/chat/react/conversation-chat-pane`.
- **Tovu T edits:** delete 2 sources + 3 tests; `one-chat-fab-wiring.test.ts:75–77` asserts `App.tsx` does not import `conversation-chat-pane`; update comments in `App.tsx`, `app.css:1983`, `global-chat.desktop.ts:10`, `coverage-floors.json:37`; move the `size-debt.json` row to Jini `scripts/size-debt.json` (OWNER-Q-12 — the 92-line component is not split); one `why-comments-debt.json` row per moved block.
- **Prerequisites:** J after AX-69.J and AX-71.J (transport and conversation types; serial on `packages/chat/package.json`); T after D2.J and P13-D1.T. **Removed from Tovu:** 2 production files (329 LOC) + 3 test files (400 LOC).

### 4.3 Disjointness

- P13-D1 touches only `R/use-workspace-chat-pane.hooks.ts` and its 2 tests — no AX row lists them; parallel with everything.
- P13-D2.J edits `packages/chat/package.json` (also AX-69.J, AX-71.J, P13-S1..S3.J) and `packages/chat/src/react/README.md` → serial on chat. P13-D2.T touches shared ledgers (`coverage-floors.json`, `size-debt.json`, `why-comments-debt.json`) — rebase, never overwrite; `app.css` comment line (AX-50 edits the same file, merge in sequence).
- NOT-CHECKED: `ui` folder-path-drop test coverage; `check:hooks` on `.tsx`; `useStableHandler` hook slots; `chat-user-bubbles.test.ts` DOM independence; exact AX-69/71 Jini entry names.

---

## 5. Owner questions

- **OWNER-Q-1 (Area 1):** Should the Tovu command bodies (`init`, `adopt`, `export`, `serve`, `import-*`, `storage-move`, `owner-store*`, `deploy-config`) stay in Tovu as product wiring, with only the generic slices in P13-C1..C3 moving? **Recommended: yes.** Every body opens a Tovu site directory, Tovu composition or Tovu feature; their feature imports are already repointed by K5/D steps, so they shrink to wiring without P13 moving them.
- **OWNER-Q-2 (Area 1):** `@jini-ai/cli` is "a CLI transport shell for driving a Jini daemon over HTTP". P13-C1 adds a host-bin run loop with commander-compatible error codes (as strings, no `commander` dependency). Accept that scope widening? **Recommended: yes** — the package already exports commander-shaped introspection (`introspection.ts`) and Tovu-Runner-style hosts need the same exit-code contract.
- **OWNER-Q-3 (Area 3):** Jini already has `@jini-ai/admin/playground` (a port of this Playground). Keep Tovu's own Playground screen (current owner decision) or later replace it by mounting the Jini page? **Recommended: keep the owner decision now; revisit after `ex5-fnd-kit-tovu` merges**, when both use the same `@jini-ai/admin` bus and a swap is a mount change with no move.

- **OWNER-Q-4 (Area 2):** Should `SC/SiteAssistantHeader.tsx` survive `BX-8`? Jini `EmbedChatWidget` already renders `EmbedChatHeader` with injected copy and keyboard but has no `closeAction`. **Recommended:** `BX-8` adds an optional `closeAction` slot to `EmbedChatWidgetArgs` and Tovu deletes `SiteAssistantHeader.tsx` there, not in P13.
- **OWNER-Q-5 (Area 2):** Is the React-vs-vanilla comparison channel product diagnostics or a generic embed capability? **Recommended: generic** — it already speaks Jini's `jini-chat-open` and `chat.send_message`; only variant detection and names are product-specific, so P13-S3 proceeds.
- **OWNER-Q-6 (Area 2):** Use Jini `resolveSystemLocale` for visitor locale matching via a new React-free `@jini-ai/ui/i18n/locale` subpath? Visible change: `pt` shows pt-BR copy and `zh-Hant` shows zh-TW instead of English. **Recommended: yes** (dedupe that fixes real misses).
- **OWNER-Q-7 (Area 2):** `apps/site-chat` has no README/INFO.md. **Recommended:** the first P13 Tovu step to land creates `apps/site-chat/INFO.md`; each later step appends its binding line.
- **OWNER-Q-8 (Area 2):** Give P13-S2 a default `toHtml` from `@jini-ai/ui/renderers` (`renderMarkdownToSafeHtml`)? **Recommended: no** — that renderer does not disable GFM footnotes (the duplicate-id case `vanilla-host.test.ts` covers) and chat would gain a micromark coupling.

- **OWNER-Q-9 (Area 4):** 18 renderer files (1,629 LOC) on AX-48/49/51/53/55/64/78/118/120 (hook half)/126 target React hooks inside `desktop-host`, which has no React dependency and is `runtime: desktop`. **Recommended:** retarget those AX rows to `@jini-ai/ui` feature folders (React already a peer; bridge ports feature-owned and injected), keeping `desktop-host` framework-free. Alternative: a `desktop-host/react` entry with a React peer.
- **OWNER-Q-10 (Area 4, P13-D2):** move the unreferenced `WorkspaceChatPane`, delete it, or leave it parked? **Recommended: move** — generic composition Jini lacks, wanted by the parked global desktop chat (triage item 370). Fallback: delete from Tovu as dead code.
- **OWNER-Q-11 (Area 4, P13-D1):** dropped folder paths with whitespace become quoted (Jini `formatDroppedFolderPaths`) instead of joined raw. **Recommended: accept.**
- **OWNER-Q-12 (Area 4, P13-D2):** the 92-line component. **Recommended:** carry the size-debt row into Jini `scripts/size-debt.json` unchanged; no split (UI splits tabled).
- **OWNER-Q-13 (Area 4, P13-D2):** approve together: the `one-chat-fab-wiring.test.ts:75–77` assertion edit; not porting the BASE-RED raw-primitives source test (Jini `check:hooks` replaces it); keeping `.runner-chat-pane` rules in Tovu `app.css` while Jini emits only `jini-*`. **Recommended: approve all three.**
- **OWNER-Q-14 (Area 4):** add `R/app-hooks.test-support.ts` (78) to `P9-data/stays-in-tovu.md` as Tovu `node:test` support. **Recommended: yes.**
- **OWNER-Q-15 (Area 4, AX-57 from ex4):** approve the `folder-drop` call-shape test edit and the `Spinner` markup/accessible-name change. **Recommended: approve** (`folder-drop.ts` has 0 importers).

## 6. Step order for builders

Each batch's steps touch disjoint files in both repos and can run in parallel (one builder per step; each builder does the Jini half, then the Tovu half). A later batch starts when the steps it names have merged.

| Batch | Steps (parallel) | Jini files | Tovu files | Waits on |
|---|---|---|---|---|
| **B1** | P13-C1 · P13-S1 · P13-S4 (T; S4.J only if OWNER-Q-6 = yes) · P13-S5 · P13-D1 | `cli` (new `cli-outcome.ts`, `program-run.ts`, barrel, README) · `chat` embed react · `ui` locale subpath · `devops` (new `build/`) | `cli/{errors,main,help}.ts` · `SC/SiteAssistantHeader.hooks.ts` · `SC/site-chat-i18n.ts` · `apps/site-chat/scripts/check-bundle-mounts.*` · `R/use-workspace-chat-pane.hooks.ts` | S5.J not in the same window as `BX-17.J`; S1.T before `BX-8.T` |
| **B2** | P13-C2 · P13-S2 | `cli/introspection.ts` · `chat` vanilla | `cli/program.ts`, `cli/commands/introspect.ts` · `SC/vanilla-host.ts` | C1 (same `cli` barrel/README), S1.J (`chat/package.json`); C2 not with P11 ST-16 (`program.ts`); S2.T not with `BX-3.T`/`BX-13.T`/`BX-15.T`/`P6-T2` |
| **B3** | P13-C3 · P13-S3 | `cli/request-fields.ts`, `cli/flags.ts` · `chat` browser bridge (new export) | `owner-store.ts`, `import-local.ts`, `serve.ts` · `SC/site-chat-comparison.ts`, `SC/vanilla-host.ts`, `SC/SiteAssistantActivation.hooks.ts` | C2; S2; C3 after `K5-api-connections-1`/`K5-project-keys-1`/`K5-contracts-core-1`/`K5-site-backup-1` if in flight; S3.T before `BX-8.T` |
| **B4** | P13-D2 · P13-A1 | `chat` conversation-chat-pane (new export) · — | `R/WorkspaceChatPane*` (delete), ledgers · `stays-in-tovu.md`, admin INFO.md files | D2: AX-69.J, AX-71.J, P13-D1, S3.J (`chat/package.json`), OWNER-Q-10. A1: `P9U-untangle-v2` R3.T and `ex5-fnd-kit-tovu` merged |

Deferred, not scheduled: the four site-chat files on `codex/visitor-chat-tovu` (plan after it merges), and the 18 renderer files blocked on OWNER-Q-9.
