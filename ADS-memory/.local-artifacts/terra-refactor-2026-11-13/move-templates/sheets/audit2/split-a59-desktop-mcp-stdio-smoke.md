# SPLIT-A59: MCP stdio smoke handshake -> `@jini-ai/mcp/testing` (templates T-SPLIT, T-MOVE)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A59`. No blockers.

Tier: one slice per repo, Sonnet + Opus review of the port. est. executor tokens ≈ 36k (S1 24k, S2 12k). No Chrome look.

## Findings that change the audit row
1. **Only about 45% of `smoke-bridge.ts` (259 lines) is generic.** The file mixes three things: (a) the stdio handshake `smokeBridge` + `parseBridgeReply` + `assertBridgeReplies` + `buildBridgeEnv` (lines 133-259: generic MCP client smoke), (b) packaged-app layout and entry-resolution (`resolveBridgeSmokeTargets` :16-35 hardcodes `Contents/MacOS/Tovu`, `Resources/tovu/node_modules`; `buildJiniEntryScript` :60-103 is a Tovu-specific script template; `parseJiniEntries`/`parseJiniEntryEnv` :105-150 hardcode `release-smoke`, `site jini-mcp`/`desktop jini-mcp` labels, `tovu-desktop` roster). (b) STAYS in Tovu whole. Only (a) moves.
2. **Two imports block a literal move**: `redactLocalText` is `../../website/src/platform/server-logs/redact-local-text.ts` (a Tovu website module, also a cross-app import from `apps/desktop`: rule 5 forbids it in Jini) -> injected `redact` port; `spawn` from `node:child_process` -> injected `spawnBridge` port (a typed structural `BridgeChild`, not `ChildProcess`). `sanitizeUntrustedText` is `@jini-ai/core/text` (allowed: rule 5(b)); `NodeJS.ProcessEnv` -> `Readonly<Record<string, string | undefined>>`.
3. **The in-code comment "Temporary local handshake until @jini-ai/daemon publishes probeMcpBridge"** is a tracking pointer (rule 12: deleted, not moved). `rg -n "probeMcpBridge" packages --glob '!**/dist/**'` finds only the daemon changelog/agent-executor text, no such export today; do not reference it.
4. **`CLI_BASELINE_KEYS`** (`PATH HOME TMPDIR SHELL LANG USER`) is a credential-isolation baseline; moves as a default `baselineEnvKeys` option (optional) so a consumer can widen it.
5. The `-dev`/`desktop` packaged scripts `scripts/smoke-bridge.ts` import `smokeBridge` and `buildBridgeEnv` (lines 12,24,72): repointed in S2.

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/desktop/src/smoke-bridge.ts | blob f0a5e081669d9b252a83b86aa3c53fc11525ab35 | keep-reduced (lines 1-150 stay; lines 111-259 -> Jini)
  - apps/desktop/scripts/smoke-bridge.ts | blob 2fdbcfcb84b50335d3e7d3908ddf5178f430169f | keep-edited (imports)
tovu_tests:
  - apps/desktop/src/smoke-bridge.test.ts | blob d52968b96f1fdc749ae558f6df029458dd820eab | split (253 lines, 14 tests: tests 14-98 stay; tests 108-253 move)
  - apps/desktop/src/smoke-bridge-gate.test.ts | blob de097e885577dba855ed0d5f03febd2039fcdb49 | keep-edited (type import of BridgeCommand only if it moves; see S2-2)
jini_guards:
  - packages/mcp/package.json | blob a8f562ae3a4006b2451771e6ad49ccf2784e2fca
  - packages/mcp/src/testing/ must not exist; `rg -n "smokeStdioServer|buildSmokeEnv" packages --glob '!**/dist/**'` prints nothing
  - packages/core/src/text/sanitize-untrusted-text.ts exports sanitizeUntrustedText with `{ maxLength, diagnosticToolIds }` options: `rg -n "diagnosticToolIds" packages/core/src/text/sanitize-untrusted-text.ts` shows it (else STOP)
```
Census (`rg -n "smoke-bridge|smokeBridge|buildBridgeEnv|parseBridgeReply|assertBridgeReplies" apps packages --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/reports/**' --glob '!ADS-memory/**'`): only the five files above plus `apps/desktop/package.json:26` (script name, untouched). Any other = STOP.

## Ports (Jini `packages/mcp/src/testing/stdio-smoke.ts`)
```ts
export interface BridgeChild {
  stdin: { write(chunk: string): unknown; on(event: 'error', l: (e: Error) => void): unknown };
  stdout: { setEncoding(enc: 'utf8'): unknown; on(event: 'data', l: (chunk: string) => void): unknown };
  stderr: { setEncoding(enc: 'utf8'): unknown; on(event: 'data', l: (chunk: string) => void): unknown };
  once(event: 'close', l: (code: number | null, signal: string | null) => void): unknown;
  once(event: 'error', l: (e: unknown) => void): unknown;
  kill(signal: 'SIGKILL'): unknown;
}
export type SpawnBridge = (required: { command: string; args: readonly string[]; env: Record<string, string>; cwd?: string }, optional?: Record<string, never>) => BridgeChild;
export interface SmokeEntry { label: string; command: string; args: readonly string[]; env: Readonly<Record<string, string>>; serverName: string; toolName: string }
export function smokeStdioServer(
  required: { entry: SmokeEntry; hostEnv: Readonly<Record<string, string | undefined>>; spawnBridge: SpawnBridge; redact: (required: { text: string }, optional?: Record<string, never>) => string },
  optional: { watchdogMs?: number; cwd?: string; baselineEnvKeys?: readonly string[]; clientName?: string } = {},
): Promise<void>;
export function buildSmokeEnv(required: { hostEnv: Readonly<Record<string, string | undefined>>; entryEnv?: Record<string, string> }, optional: { baselineEnvKeys?: readonly string[] } = {}): Record<string, string>;
export function parseSmokeReply(required: { line: string; id: number }, optional?: Record<string, never>): Record<string, unknown> | undefined;
export function assertSmokeReplies(required: { initialize: Record<string, unknown>; tools: Record<string, unknown>; serverName: string; toolName: string }, optional?: Record<string, never>): void;
```
Note the call-shape change: the Tovu `spawnBridge = spawn` took `(command, args, options)`; the Jini port takes ONE `required` object (rule 10). Tovu's binding adapts `spawn` (S2 step 2). `clientName` default `"stdio-smoke"` replaces `"release-smoke"`; Tovu passes `"release-smoke"` so wire bytes are unchanged.

```
id: SPLIT-A59-1 .. SPLIT-A59-2
feature: desktop MCP stdio smoke
jini_target: mcp src/testing/{stdio-smoke.ts,index.ts}; package.json exports "./testing" + jini.entries "./testing": "node"; README line (mcp README, testing section)
changeset: @jini-ai/mcp: minor | "testing: smokeStdioServer, a bounded initialize/tools-list handshake for any stdio MCP server"
```

## SPLIT-A59-1 — Jini (commit 1, Opus reviews the port shape)
0. Branch rule; blobs; guards.
1. Tests first (`packages/mcp/src/testing/__tests__/stdio-smoke.test.ts`, vitest, same fake child as `smoke-bridge.test.ts:130-178` rebuilt with `EventEmitter`+`PassThrough`; keep EVERY mode: ok, bad-tool, silent, close, error, malformed, notify-first, flood, error-string): handshake order (initialize, `notifications/initialized`, tools/list); SIGKILL + awaited close on success and on each failure; watchdog (`watchdogMs: 10`) message `MCP watchdog exceeded 10 ms`; stdout over 1,000,000 chars rejects; stderr over 65,536 replaced by `[oversized stderr omitted]` and never echoed; failure text passes through the INJECTED `redact` then `sanitizeUntrustedText({ maxLength: 2000, diagnosticToolIds: [toolName] })` (NEW test: a redact fake that uppercases proves the order, and that a missing-tool failure still names `toolName`); env: `buildSmokeEnv` keeps only the baseline + entry env (parity: `NODE_PATH` dropped); NEW: custom `baselineEnvKeys`. Parse tests: `parseSmokeReply` correlates ids, undefined for other ids, throws `invalid MCP JSON-RPC reply` / `MCP request 1 failed`.
2. Code: copy lines 133-259 of `smoke-bridge.ts` (+ `isRecord` helper, :122) into `stdio-smoke.ts`; split `smokeBridge` (72 lines, complexity > 10) into `createStderrBuffer`, `runHandshake`, `handleReplyLine`, `describeFailure` (each ≤ 50 lines, complexity ≤ 10); rename per the ports block; `console`/`process` not used; no `node:` import. The "Why" comments (30 s watchdog covers the entire exchange; stdout bounded, stderr kept only for failures; the tool-name exemption) move reworded neutral; the "Temporary ... probeMcpBridge" sentence is deleted.
3. `index.ts` barrel; package.json export (mirror `./federation/testing`, :56-60) + `jini.entries`; README; changeset.
4. Checks COMMON 2-9: `rg -n -i "tovu|release-smoke|jini-mcp|desktop-http|website/src|node:child_process" packages/mcp/src/testing` prints nothing outside test fixtures (use `server-a` names there). Commit `feat(mcp/testing): smokeStdioServer handshake`.

## SPLIT-A59-2 — Tovu (commit 2, Sonnet; after S1)
1. `apps/desktop/src/smoke-bridge.ts` (edit): delete `BridgeCommand` is KEPT (still needed by `parseJiniEntries`); delete `CLI_BASELINE_KEYS`, `buildBridgeEnv`, `isRecord` (keep a local copy: `parseJiniEntries`/`parseJiniEntryEnv` use it, :105-150), `parseBridgeReply`, `assertBridgeReplies`, `smokeBridge`. Add `import { smokeStdioServer, buildSmokeEnv } from '@jini-ai/mcp/testing'`.
2. New thin binding KEPT in this file (a real function, not a forwarder; it owns Tovu's redaction + spawn adaptation):
```ts
/** Tovu's packaged-bridge smoke: Tovu's local-text redaction and Node's spawn behind the generic handshake. */
export function smokeBridge(
  { entry, hostEnv }: { entry: BridgeCommand; hostEnv: NodeJS.ProcessEnv },
  { spawnBridge = spawn, watchdogMs = 30_000, cwd }: { spawnBridge?: typeof spawn; watchdogMs?: number; cwd?: string } = {},
): Promise<void> {
  return smokeStdioServer({
    entry, hostEnv, redact: redactLocalText,
    spawnBridge: ({ command, args, env, cwd: where }) => spawnBridge(command, [...args], { env, stdio: ['pipe', 'pipe', 'pipe'], ...(where ? { cwd: where } : {}) }),
  }, { watchdogMs, cwd, clientName: 'release-smoke' });
}
```
`buildBridgeEnv` is still imported by `scripts/smoke-bridge.ts:12,56` -> change that import to `buildSmokeEnv` from `@jini-ai/mcp/testing` and rename the call (1 occurrence at :56 plus the import). Test-seam `spawnBridge?: typeof spawn` is preserved so `smoke-bridge.test.ts`'s `fakeBridge` still works unchanged.
3. `smoke-bridge.test.ts` (edit): delete tests at lines 108-119 (reply parser, assertions) and the handshake-mode tests that duplicate Jini's (lines 180-253) EXCEPT keep two Tovu-owned assertions: (i) `smokeBridge` passes `release-smoke` as the clientInfo name and `cwd` through, (ii) failure text has the local path redacted by `redactLocalText` (Tovu's own redactor is the point). The `bridge env` test (:60) moves to Jini (already covered by NEW `buildSmokeEnv` tests). Record test counts before (14) and after in the commit body: honest-testing, no silent drops.
4. Census: `rg -n "parseBridgeReply|assertBridgeReplies|buildBridgeEnv" apps` prints nothing; eslint on the 3 touched files; commit `refactor(desktop): packaged-bridge smoke on @jini-ai/mcp/testing`.

## untangle overlap
- None on these files. `scripts/smoke-bridge.ts` also imports `redactLocalText` from `website/src/...` (cross-app, a Tovu debt line unrelated to A59; CLASSIFY owns it).

## STOP specific to this sheet
- `diagnosticToolIds` option is absent from `sanitizeUntrustedText`.
- `smoke-bridge-gate.test.ts` needs an assertion removed to pass (rule 20).
- The Jini function cannot be split under complexity 10 without changing the reject-ordering the flood/error tests pin.
