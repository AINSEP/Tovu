# Desktop assistant runs get zero Tovu tools: the jini bridge is spawned as a GUI Electron app

- Date: 2026-10-01
- Author: CodeBase Analyzer subagent (read-only diagnosis; no repo files changed, no git writes, no AI probe sent)
- Severity: HIGH. Every Claude Local-CLI run from the packaged desktop app (0.1.7 DMG) has had no Tovu tools at all, and the run still reports `succeeded`.

## 1. The conversations

Both apps share one chat store: `sites/tovu-dev/chat.db`. I read a copy of the DB, its WAL included, from the scratchpad.

| | Desktop, failing | Web dev admin, working |
|---|---|---|
| Conversation | `5925a0f5-7c98-4740-8635-98ece11d0314` "Can You See When Account" | `ebe61422-b779-41f0-86e2-d550d96c3b18` "Can You See Higgsfield Plugin" |
| Time (local) | 09:03:28 and 09:06:33 | 09:08:32 |
| Run ids | `e52afb36-bf7c-45db-ba7f-4a8b5394efd2`, `fd3e2c9d-b419-4814-9cfe-33051cdb3452` | `e7d24778-04a5-4b3b-b20d-ca8b3a6fd6e0` |
| Daemon | DMG daemon PID 15904 (`/Volumes/Tovu 0.1.7/…/agent-daemon-server.js`, up since 09-29 21:42) | dev daemon PID 94224 (tsx, up since 09-30 23:13) |
| CLI | Claude Code 2.1.286, `claude-opus-5-5`, session `ad315341-…` | Claude Code 2.1.286, `claude-opus-5-5` |
| Agent cwd | `/Users/la/Programming/Tovu/sites/tovu-dev` | `/Users/la/Programming/Tovu` |
| Bridge command | `/Volumes/Tovu 0.1.7/Tovu.app/Contents/MacOS/Tovu` + `…/Resources/tovu/node_modules/@jini-ai/mcp/dist/bin/serve.js` | `/usr/local/Cellar/node/24.2.0/bin/node` + `/Users/la/Programming/Jini/packages/mcp/dist/bin/serve.js` |
| Bridge env | `JINI_RUN_ID`, `JINI_DAEMON_URL`, `JINI_DAEMON_TOKEN` only | same three |
| `system/init` `mcp_servers` | `[{"name":"jini","status":"failed"}]` | `[{"name":"jini","status":"connected"}]` |
| Tools in init | 13, all Claude Code built-ins, no `mcp__jini__*` | 27, including all 11 `mcp__jini__*` |
| Higgsfield | never reachable | `search_tools` → `describe_tool mcp__higgsfield__models_explore` → `execute_delegated_tool` → ran |
| `TOVU_AGENT_DAEMON_TOKEN` in daemon env | present | present |
| `TOVU_INTEGRATIONS_ROOT_KEY` in daemon env | **absent**, and there is no key file at `~/.tovu/` or `sites/.tovu/` | present |

Every Claude run stored between 09-23 and 09-30 19:48 shows `jini: connected`, on CLI 2.1.281, .283 and .286. The CLI version is therefore not the variable.

## 2. What the assistant actually got

The jini MCP server was dead, so the assistant had zero Tovu tools. This was not a partial set and not a tool-search miss.

Claude Code's own MCP log for the run (`~/Library/Caches/claude-cli-nodejs/-Users-la-Programming-Tovu-sites-tovu-dev/mcp-logs-jini/2026-10-01T16-03-32-624Z.jsonl`) shows:

```
Starting connection with timeout of 30000ms
Server stderr: [86617:1001/090346.834276:ERROR:net/cert/internal/trust_store_mac.cc:807] Error parsing certificate: ERROR: Failed parsing extensions
Connection failed after 28057ms (CONNECT_TIMEOUT): Request timed out
```

The 09:06 run (`…2026-10-01T16-06-34-517Z.jsonl`) shows the same 28 s `CONNECT_TIMEOUT`.

The stderr line is Chromium's log format. Node running `serve.js` cannot produce it. What started was the Tovu Electron app in browser mode, not a Node process. It never speaks MCP on stdio, so Claude times out and carries on with its built-in tools only.

**How I identified the binary.** The leftover per-run config `sites/tovu-dev/.mcp.jini-fd3e2c9d….json` was 482 bytes, against 433 for a dev-daemon config. The difference is exactly +49 bytes:
- the binary path is +10 chars (`/Volumes/Tovu 0.1.7/Tovu.app/Contents/MacOS/Tovu` vs `/usr/local/Cellar/node/24.2.0/bin/node`);
- the `serve.js` path is +39 (96 vs 57 chars).

**Control check.** Run by hand with plain Node, the same `serve.js` answers `initialize` and lists 11 tools in about 2 s.

## 3. Root cause, hop by hop

1. `apps/desktop/src/tovu-server.ts:283` sets `env.ELECTRON_RUN_AS_NODE = "1"` on the `tovu serve` child, and the agent daemon inherits it. Confirmed: PID 15904's env has `ELECTRON_RUN_AS_NODE=1`. Inside the desktop app, `process.execPath` is therefore the Tovu Electron binary.
2. `apps/website/src/assistant/mcp-injection.ts:42` sets `command: process.execPath`, with `args: [serve.js]` at :43. This is wired at `apps/website/src/server/inbound/assistant/agent-daemon-server.ts:619`.
3. `Jini/packages/daemon/src/agent-executor.ts:1065` (`buildMcpJsonServerEntry`) gives the entry only the `JINI_*` env vars. `McpJsonInjectionOptions` (around :971) has no `env` field, so a host cannot add `ELECTRON_RUN_AS_NODE`.
4. `Jini/packages/daemon/src/agent-executor.ts:680-709` (`BASELINE_AGENT_ENV_KEYS` / `buildAgentEnv`, used via `resolveRunEnv` at :2981 and :3945) passes the `claude` child a deny-by-default allowlist. `ELECTRON_RUN_AS_NODE` is not on it, so the variable cannot reach the bridge through inheritance either.
5. Claude spawns `Tovu <serve.js>` without `ELECTRON_RUN_AS_NODE`. The packaged app boots as a GUI app, which logs the Chromium certificate error and never answers MCP, and the connection times out after 28 s.
6. `Jini/packages/agent-runtime/src/claude-stream.ts:350-358` (`handleSystemMessage`) reads `subtype: "init"` but ignores `mcp_servers`. Nothing notices the failed bridge, and the run ends `succeeded`. That silent failure is the second defect.

The web dev admin is unaffected only because its `process.execPath` is a real Node binary.

### Ruled out
- **Daemon or bridge outage:** neither daemon restarted around 09:03, and the bridge never reached its first HTTP call.
- **Missing daemon token:** both daemons have `TOVU_AGENT_DAEMON_TOKEN`. The failure happens before any authentication.
- **`<<SUBAGENT_DISPATCH>>`:** prepended on purpose at `agent-daemon-server.ts:768-778` to skip the AI-Dev-Shop bootstrap. The working web run had it too. The model's "subagent dispatch" guess was its own guess about why it had no tools.
- **The jini failure in the owner's own Claude Code session:** unrelated. That comes from the repo-root `.mcp.json`, which runs plain Node, and another session connected through it at 16:08 and called tools.

## 4. Second desktop-only gap (strong hypothesis): no root key, so Higgsfield is not available

The DMG daemon (15904) has no `TOVU_INTEGRATIONS_ROOT_KEY`, and no key file exists at `~/.tovu/integrations-root-key.hex` or `sites/.tovu/integrations-root-key.hex`.

The owner's memory note `desktop_must_launch_via_npm_run_desktop_for_root_key.md` records that in this state sealed credentials cannot be decrypted and the stored Higgsfield OAuth MCP server is skipped at boot. Only `npm run desktop` (`development/scripts/dev-desktop.mjs:101`) supplies the key. The DMG has no such path.

**Not confirmed:** the desktop daemon's stderr is lost, and reading its run or catalog API was denied by the permission classifier. To confirm after fix 1, check that the desktop catalog contains no `mcp__higgsfield__*` ids.

**Consequence:** fixing the bridge alone gives desktop runs Tovu's own tools, but probably still no Higgsfield.

## 5. Still reproducible?

Yes, on every Claude Local-CLI run sent from the desktop app:
- the DMG daemon (15904) is still running;
- the bug is in current source (`mcp-injection.ts` was last changed 09-03; Jini `buildMcpJsonServerEntry` is unchanged);
- the two runs three minutes apart are independent reproductions.

I sent no extra AI probe. The web dev admin works and would only show the working path. Run `fd3e2c9d` was still `running` with no end time in my first snapshot, and it reads `succeeded` in the later copy.

## 6. Smallest fix

### 6a. Jini: let a host add env to the bridge entry

```diff
--- a/Jini/packages/daemon/src/agent-executor.ts
+++ b/Jini/packages/daemon/src/agent-executor.ts
@@ export interface McpJsonInjectionOptions {
   /** Extra argv for `command`. @default [] */
   readonly args?: readonly string[];
+  /**
+   * Extra env for the bridge child, merged UNDER the `JINI_*` keys (those always win). Exists for
+   * hosts whose `command` is not a plain Node binary: an Electron host passes
+   * `{ ELECTRON_RUN_AS_NODE: '1' }`, because `buildAgentEnv`'s allowlist strips it from the CLI, so
+   * it can never reach the bridge by inheritance. @default {}
+   */
+  readonly env?: Readonly<Record<string, string>>;
   /** The daemon's own loopback base URL … */
   readonly daemonUrl: string;
@@ export function buildMcpJsonServerEntry(
   runId: string,
-  options: Pick<McpJsonInjectionOptions, 'command' | 'args' | 'daemonUrl'>,
+  options: Pick<McpJsonInjectionOptions, 'command' | 'args' | 'daemonUrl' | 'env'>,
   credential?: string,
 ): McpJsonServerEntry {
   return {
     command: options.command,
     args: options.args !== undefined ? [...options.args] : [],
     env: {
+      ...(options.env ?? {}),
       JINI_RUN_ID: runId,
       JINI_DAEMON_URL: options.daemonUrl,
       ...(credential !== undefined ? { JINI_DAEMON_TOKEN: credential } : {}),
     },
   };
 }
```

The ACP, env-content, env-passthrough and codex-toml mechanisms all derive from this same `serverEntry`, so they pick the change up with no further edits.

### 6b. Tovu: pass the flag when running inside Electron

```diff
--- a/apps/website/src/assistant/mcp-injection.ts
+++ b/apps/website/src/assistant/mcp-injection.ts
@@
-export function resolveMcpJsonInjection(daemonUrl: string): McpJsonInjectionOptions {
+export function resolveMcpJsonInjection(
+  daemonUrl: string,
+  runtime: { readonly execPath: string; readonly electronVersion: string | undefined } = {
+    execPath: process.execPath,
+    electronVersion: process.versions.electron,
+  },
+): McpJsonInjectionOptions {
   const entryPoint = require.resolve("@jini-ai/mcp");
   const script = join(dirname(entryPoint), "bin", "serve.js");
   return {
-    command: process.execPath,
+    command: runtime.execPath,
     args: [script],
+    // Inside the desktop app `execPath` is the Tovu Electron binary. Without this flag it boots as a
+    // GUI app, never speaks MCP, and Claude times out the bridge after 30 s with zero Tovu tools
+    // (2026-10-01). Jini's agent env allowlist strips the daemon's own copy, so it must be explicit.
+    ...(runtime.electronVersion !== undefined ? { env: { ELECTRON_RUN_AS_NODE: "1" } } : {}),
     daemonUrl,
```

Then bump `@jini-ai/daemon` in Tovu and rebuild the DMG. The running 0.1.7 app cannot be patched in place.

### 6c. Guard: a run whose jini bridge failed stops loudly

A run whose bridge is not `connected` must not proceed. The point is to fail fast and clearly, not after a costly, confusing answer.

```diff
--- a/Jini/packages/agent-runtime/src/claude-stream.ts
+++ b/Jini/packages/agent-runtime/src/claude-stream.ts
@@
+/** The MCP server key every Jini host injects (`agent-executor.ts`'s `JINI_MCP_SERVER_KEY`). */
+const JINI_MCP_SERVER_NAME = 'jini';
+export const MCP_BRIDGE_UNAVAILABLE = 'MCP_BRIDGE_UNAVAILABLE';
+
+/** `undefined` when the init frame lists no jini server (host injected none), else its status. */
+export function jiniBridgeStatus(obj: Record<string, unknown>): string | undefined {
+  if (!Array.isArray(obj.mcp_servers)) return undefined;
+  const entry = obj.mcp_servers.find((s) => isRecord(s) && s.name === JINI_MCP_SERVER_NAME);
+  return isRecord(entry) && typeof entry.status === 'string' ? entry.status : undefined;
+}
+
 export function handleSystemMessage(obj: Record<string, unknown>, onEvent: EventSink): void {
   if (obj.subtype === 'init') {
     onEvent({
       type: 'status',
       label: 'initializing',
       model: obj.model ?? null,
       sessionId: obj.session_id ?? null,
     });
+    const bridge = jiniBridgeStatus(obj);
+    if (bridge !== undefined && bridge !== 'connected') {
+      onEvent({
+        type: 'error',
+        code: MCP_BRIDGE_UNAVAILABLE,
+        message: `Tovu's tools failed to load (jini MCP bridge status: ${bridge}). The run was stopped instead of continuing without them.`,
+      });
+    }
     return;
   }
```

The daemon side is a **sketch**: I did not locate the exact consumer, so the placement needs confirming. In `Jini/packages/daemon/src/agent-executor.ts`, the observer of parsed child events must, on `error` with `code === 'MCP_BRIDGE_UNAVAILABLE'`, SIGTERM the child and finish the run `failed` with that code and message. A non-null `signal` keeps it distinct from pre-spawn failures. The init frame arrives before the first model request, so this costs almost nothing.

For a timeout or `pending`, the guard deliberately does not wait or retry. A bridge that is not connected at init will never be attached to that session.

Optional extra, also recommended: run a one-time bridge self-test at daemon `start()`. Spawn the generated entry with `buildAgentEnv`'s baseline env, require an `initialize` reply within 5 s, and surface the result in assistant health. Then the admin shows "Assistant tools: broken" before anyone chats.

### 6d. Root key for the DMG (section 4)

The packaged app needs a key source that is not `npm run desktop`, for example a key file in userData, or the keychain, created once on first run and passed to `tovu serve`. This is an owner product decision, because it changes the "this instance does not auto-generate one" behaviour.

## 7. Regression tests

1. **`apps/website/src/assistant/__tests__/mcp-injection.unit.test.ts`** (new):
   - with `resolveMcpJsonInjection(url, { execPath: '/x/Tovu', electronVersion: '33.0.0' })`, expect `command === '/x/Tovu'` and `env` to equal `{ ELECTRON_RUN_AS_NODE: '1' }`;
   - with `electronVersion: undefined`, expect `env` to be undefined.
2. **`Jini/packages/daemon/src/__tests__/agent-executor.test.ts`**, `describe('buildMcpJsonServerEntry')` (exists at :4366): `env: { ELECTRON_RUN_AS_NODE: '1', JINI_RUN_ID: 'evil' }` produces `ELECTRON_RUN_AS_NODE: '1'`, and the real `JINI_RUN_ID` wins.
3. **`Jini/packages/agent-runtime/src/__tests__/claude-stream.test.ts`**, `describe('handleSystemMessage')` (exists at :1721):
   - an init frame with `mcp_servers: [{name:'jini',status:'failed'}]` emits `{type:'error', code:'MCP_BRIDGE_UNAVAILABLE'}`;
   - `connected` emits no error;
   - no `mcp_servers`, or no jini entry, emits no error.
   - Use the exact init frame from run `e52afb36` as a fixture.
4. **Daemon guard:** an executor test with a fake child whose stdout yields that init frame. Expect the child to be killed and the run to end `failed` with code `MCP_BRIDGE_UNAVAILABLE`, with no `succeeded`.
5. **Packaged smoke, next to `apps/desktop/src/smoke-native.ts`, the test that would have caught this:**
   - read `resolveMcpJsonInjection(…)` inside the packaged binary;
   - spawn `command`/`args` with only `buildAgentEnv`'s baseline env plus the entry's `env`;
   - send MCP `initialize` and assert a `jini-mcp` reply within 5 s.
   - Today this fails with no reply and Chromium stderr.

## 8. Side findings (not fixed, not in scope)
- Desktop runs use the owner's personal `~/.claude` config: `memory_paths.auto` is `/Users/la/.claude/projects/-Users-la-Programming-Tovu/memory/` in both runs. The `CLAUDE_CONFIG_DIR` isolation described at `agent-executor.ts:3128-3133` is not taking effect for these runs. Separately, the agent cwd is inside the Tovu repo, so the repo's CLAUDE.md loads.
- Runs `e52afb36`/`fd3e2c9d` cost about $0.28 and $0.30 for an answer that was impossible from the start. The fail-fast guard avoids that.
- No restart is needed for diagnosis. Applying the fix needs a new DMG. The dev web path keeps working throughout.
