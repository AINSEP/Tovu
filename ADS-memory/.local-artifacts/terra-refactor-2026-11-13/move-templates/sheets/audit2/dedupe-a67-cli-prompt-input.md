# DEDUPE-A67: CLI stdin/quiet-line readers -> `@jini-ai/cli` prompt (templates T-DEDUPE, T-HARDEN)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A67`. Precondition "untangle R13 (cli host-preset)": R13 may reshuffle `packages/cli/src/index.ts` exports; this sheet edits `index.ts` by one line, so **execute after wave B merge, re-take the `index.ts` and `prompt.ts` blobs, and apply the one export line with `rg`-located anchor text if the blob moved**.

Tier: S1 Sonnet + review (new bounded reader = a behaviour change), S2 Sonnet. est. executor tokens ≈ 31k (S1 19k, S2 12k). No Chrome look.

## Findings that change the audit row
1. **The audit says "use `readPromptFromFlags` where its bounded-EOF contract fits". It does not fit either Tovu call site**: `readPromptFromFlags` resolves `--prompt`/`--prompt-file` flags; Tovu's two readers have no flags (`readAllStdin` is the `--create-input-stdin` / `--agent-plugin-tokens-stdin` JSON payload; `readConnectionStringFromUser` is a first-line/secret read). The reusable part is the BOUNDED stdin reader behind it, `defaultReadStdin` (`prompt.ts:153`, non-exported, hardcoded to `process.stdin`). So the Jini change is: (a) export a stream reader that takes the stream as a parameter, (b) add a quiet-line reader. `readPromptFromFlags` stays untouched.
2. **Behaviour change (hardening): Tovu's `readAllStdin` is UNBOUNDED** (`agent-plugin-tokens.ts:36-40`, `Buffer.concat` of every chunk). Credentials ride that payload (create-input with `adminPassword`, token maps). Jini's reader caps at 10 MiB and rejects with `PayloadTooLargeError`. Failing test first in Jini. Tovu consequence: `PayloadTooLargeError` must map to a clean CLI outcome: check `apps/website/src/cli/errors.ts` `mapErrorToCliOutcome` (does not mention `PayloadTooLargeError`: `rg -n PayloadTooLarge apps/website/src` printed nothing at integ/wave-b) so S2 wraps: the init flow converts it to `ValidationError({ message: "init: stdin payload is too large" })` (NEW Tovu test).
3. **The Tovu `readAllStdin` test passes an injected stream** (`agent-plugin-tokens-command.unit.test.ts:26-35`, a `PassThrough` with a split multibyte `é`): the Jini reader must take `input`. Jini's default reader uses `setEncoding('utf8')` which handles a character split across chunks (a StringDecoder); parity test included.
4. **`readConnectionStringFromUser`'s semantics** (first line only for piped input, CR/LF tolerant; terminal: muted prompt, one `line` event, prompt line closed, `"\n"` written after) move whole into a generic `readQuietLine`. The prompt TEXT `"Postgres connection string (not shown): "` is Tovu copy and stays: passed as `prompt`. The label "secret" must not live in Jini copy: the Jini function takes `prompt: string`.
5. Two other `createInterface` users in `apps/website` (`plugin/install.ts:34` confirm prompt, `site-backup/import-database.ts:82` stderr lines) are different shapes: untouched, listed so nobody widens the sheet.

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/website/src/cli/commands/agent-plugin-tokens.ts | blob e5500680e32cd8292b9a3f715484cf0387318790 | keep-edited (delete readAllStdin; `readNewSiteAgentPluginTokensFromStdin` default reader rebinds)
  - apps/website/src/cli/commands/init.ts | blob 8a741ac853f3bcf016911acb4f237ec50bed6db9 | keep-edited
tovu_tests:
  - apps/website/src/cli/__tests__/unit/agent-plugin-tokens-command.unit.test.ts | blob c6af0695215e90ef275569992e689510333674c3 | edit: readAllStdin test (:26-35) moves to Jini; keep the others
  - apps/website/src/cli/__tests__/unit/init-connection-string-reader.unit.test.ts | blob 37bf8bff83e0cee7f2d2ab37c6c715f3babeeb23 | keep (3 tests pin the binding output byte-for-byte, incl. the prompt text)
jini_guards:
  - packages/cli/src/prompt.ts | blob cf6c2a8f2c534d7c7adf5d96e11bf89177de0102
  - packages/cli/src/index.ts | blob be766abb51e94c25f798ccdb98d469d38933fa84
  - packages/cli/package.json | blob b5a0382d89bf47b54e9caf1799d064dbbdaf3a6b (no new subpath: exported through the root barrel like `prompt.js`)
  - `rg -n "readStreamText|readQuietLine" packages/cli/src` prints nothing
```
Importer census (Tovu): `readAllStdin`: `commands/init.ts:10,141` (default for `readCreateInput`), `commands/agent-plugin-tokens.ts:46` (default for `read`), the test above. `readConnectionStringFromUser`: `init.ts:80,122`, `storage-move.ts:4,35`, its unit test. Any other = STOP.

## Contracts (Jini)
```ts
// prompt.ts (edit): defaultReadStdin(limits) -> defaultReadStream({ input }, limits); readPromptFromFlags keeps process.stdin as its input.
/** All of `input` as UTF-8, bounded. Rejects with PayloadTooLargeError past `maxBytes` (default 10 MiB); cancellable. */
export function readStreamText(
  required: { input: NodeJS.ReadableStream },
  optional: { maxBytes?: number; signal?: AbortSignal } = {},
): Promise<string>;

// quiet-line.ts (new)
/** One line from `input`: piped (not a TTY) = the first line of the whole stream (CRLF or LF); a terminal = `prompt`, then a no-echo line, closed with a newline on `output`. */
export function readQuietLine(
  required: { input: NodeJS.ReadableStream & { isTTY?: boolean }; output: Pick<NodeJS.WritableStream, 'write'>; prompt: string },
  optional: { maxBytes?: number } = {},
): Promise<string>;
```
`readQuietLine`'s piped branch reads through `readStreamText` (so it is bounded too; today it is unbounded). Types: `NodeJS.ReadableStream` is the same type the Tovu code used, so no `@types/node` change.

```
id: DEDUPE-A67-1 .. DEDUPE-A67-2
feature: cli stdin/quiet-line input
jini_target: cli src/prompt.ts (edit), src/quiet-line.ts (new), src/index.ts (+1 export line)
changeset: @jini-ai/cli: minor | "readStreamText (bounded, cancellable stream reader) and readQuietLine"
```

## DEDUPE-A67-1 — Jini (commit 1, Opus reviews the bounded-read behaviour)
0. Branch rule; blobs; guard `rg` prints nothing; note existing prompt tests: `prompt.test.ts`, `prompt.limits.test.ts`, `prompt.pins.test.ts`, `prompt-read-file-settled.test.ts` (they pin `readPromptFromFlags`; all must keep passing unchanged: the refactor of `defaultReadStdin` is behaviour-preserving for `process.stdin`).
1. Tests first (`src/__tests__/stream-text.test.ts`, `quiet-line.test.ts`): `readStreamText`: chunks concatenate; `é` split across two chunks round-trips; `maxBytes: 10` with 11 bytes rejects `PayloadTooLargeError` and pauses the stream (RED on the parent: function absent); aborted signal rejects with the reason; listeners are removed after end (`input.listenerCount('data') === 0`); default cap is 10 MiB (assert via the constant, not a 10 MiB buffer). `readQuietLine`: the three cases of Tovu's `init-connection-string-reader.unit.test.ts` (CRLF first line + nothing printed; no newline and empty input; terminal: prompt once, typed value not echoed, output equals `"<prompt>\n"`), plus NEW: piped over-cap input rejects `PayloadTooLargeError`; terminal EOF before a line settles (resolve `""`: today the Tovu promise would hang on EOF; pin the decision here: the `close` event resolves with `""`).
2. Code: in `prompt.ts` change `defaultReadStdin(limits)` to `defaultReadStream({ input }, limits)` and have `readFlagSource`'s stdin path pass `{ input: process.stdin }` (the ONLY `process.stdin` reference stays at that edge); export `readStreamText` as a thin public wrapper that applies defaults. `quiet-line.ts`: static `import { createInterface } from 'node:readline'` and `import { Writable } from 'node:stream'` (node built-ins; the package runtime is node). Every function ≤ 50 lines, complexity ≤ 10, `(required, optional = {})`. The long "why" comment blocks in `prompt.ts` (CR-004/SEC-RB-009) stay where they are.
3. Export line `export * from './quiet-line.js';` after `./prompt.js` in `index.ts`; changeset; commit `feat(cli): readStreamText and readQuietLine`.
4. Checks COMMON 2-9: `rg -n -i "tovu|postgres|connection string|website" packages/cli/src/quiet-line.ts packages/cli/src/__tests__/quiet-line.test.ts` prints nothing (use `secret` placeholders in tests).

## DEDUPE-A67-2 — Tovu (commit 2, Sonnet; after S1)
1. `agent-plugin-tokens.ts` (edit): delete `readAllStdin` (:35-40); `readNewSiteAgentPluginTokensFromStdin`'s default `read` becomes a local `const readStdinOrRefuse` defined in `commands/stdin-input.ts` (NEW Tovu file, 18 lines): `readStdinOrRefuse({ input = process.stdin }, { flag }) { try { return await readStreamText({ input }); } catch (e) { if (e instanceof PayloadTooLargeError) throw new ValidationError({ message: `init: ${flag} payload is too large` }); throw e; } }`, with the `PayloadTooLargeError`, `readStreamText` imports from `@jini-ai/cli`. Both init flows use it (the `flag` string keeps messages specific).
2. `init.ts` (edit): `import { readAllStdin } from "./agent-plugin-tokens.js"` -> `import { readStdinOrRefuse } from "./stdin-input.js"`; `:141` default `readInput` = `() => readStdinOrRefuse({}, { flag: "--create-input-stdin" })`. `readConnectionStringFromUser` keeps its exported signature `(_required = {}, { input, output })` but its body becomes `return readQuietLine({ input, output, prompt: "Postgres connection string (not shown): " }, {})`; `.trim()` stays at the call site (:122 already trims). Remove the now-unused `Writable`/`createInterface` imports (`init.ts:1` and the `Writable` import; check with eslint).
3. Tests: delete the `readAllStdin` test from `agent-plugin-tokens-command.unit.test.ts` (it moved to Jini: record counts before/after in the commit body); ADD `commands/__tests__/stdin-input.unit.test.ts`: an over-cap stream yields `ValidationError` whose message names the flag and contains no stream text; non-cap errors pass through. `init-connection-string-reader.unit.test.ts` unchanged and must still pass byte-for-byte (the binding is the regression guard).
4. Census: `rg -n "readAllStdin" apps` prints nothing; eslint on the touched files; commit `refactor(cli): stdin and quiet-line input from @jini-ai/cli`.

## untangle overlap
- R13 (cli host-preset) execute-after: see top. `main.ts` in `packages/cli` is untouched.
- `apps/website/src/cli/commands/init.ts` is also in CLASSIFY rows for `site-init`; this sheet edits only two import lines and the body of one function.

## STOP specific to this sheet
- `mapErrorToCliOutcome` already maps `PayloadTooLargeError` differently than the sheet assumes (re-run the rg; then adapt step 1 to it, do not double-wrap).
- Any `prompt*.test.ts` in Jini changes outcome after the `defaultReadStream` refactor.
- A third `readAllStdin`-shaped copy appears in the census.
