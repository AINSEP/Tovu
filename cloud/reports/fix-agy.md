# FIX-AGY — Antigravity chat dead-ended by an older install's `jini` MCP entry

Branch `cloud/integ-1110` in both repos (Jini base `85377c74`, Tovu base `d01e3dee`, the FIX-1110 report commit on top of `bea5a152`).

## Cause

Personal MCP servers are on by default (MCP-DEFAULT), so the first Antigravity (`agy`) chat runs the env-passthrough connector install: Tovu → `installOwnedJsonAgent` → Jini `applyJsonInstall` (`packages/mcp/src/agent-install/install.ts`). That function refused **any** entry under the server key that was not deep-equal to the new one. An older Tovu/Jini install had already written `mcpServers.jini` to `~/.gemini/config/mcp_config.json`, pointing at that install's own `node_modules/@jini-ai/mcp/dist/bin/serve.js`. It differs only in path, Node binary or env, so every chat failed with "A different jini entry exists; choose another agent to keep these settings."

`owned-json-install.ts` gives no ownership marker to read. Its "owned" handling means three things: it asks for consent first, it refuses run credentials, and it backs the file up once. So the fix recognises our entries by shape.

## Rule implemented

In `applyJsonInstall`, for the entry already under the plan's server key:

1. **Identical:** no change, same as before.
2. **Ours:** the entry launches this package's own bridge script, so it is replaced. "Ours" means a string in `args`, or in a folded OpenCode `command: [bin, ...args]` array, whose path (with `\` treated as `/`, case-insensitive) ends in `@jini-ai/mcp/dist/bin/serve.js`, `@jini/mcp/dist/bin/serve.js` or `jini/packages/mcp/dist/bin/serve.js`. That covers the published package, the earlier scope name and a linked checkout. It does not matter which Node or Electron binary, env or `disabled`/`enabled` flag the entry has. `installOwnedJsonAgent` still backs the original file up first, unchanged (`backupOriginalOnce`, `<file>.jini-backup`, first original only). Every other key and entry keeps its value and its order. The file is still re-written as 2-space JSON, as it always was.
3. **Anything else** under that name (a user's own server that happens to be called `jini`, or a serve script from another package) is **still refused and not written; no backup is made**. The message is now plain and says what to do:
   `<config file> already has an MCP server named "jini" that this app did not add, so it was left as it is. Rename or remove that "jini" entry, then try again, or choose another agent.`
   I did not use an alternative key. The `jini` name is shared by `verifyJsonAgentInstall`, both Tovu hosts (`serverName: 'jini'` in `desktop-agent.ts` and `agent-daemon-scope.ts`) and the per-run bridge. A second name would need changes in all of them and in the verify path, so it is not the smallest change. The website host already turns any installer error into its own "choose another available agent" run failure. The desktop host shows the new message as it is.

## Sibling installers checked (step 3)

- **cursor, cline, opencode, openclaw, trae** (JSON): they go through the same `applyJsonInstall`, so the one change fixes them all. OpenCode's folded `command` array is covered and tested.
- **antigravity** is the only agent def with `externalMcpInjection: 'env-passthrough'` (`packages/agent-runtime/src/defs/antigravity/index.ts`), so it is the only one Tovu installs into personal settings on first use.
- **claude, codex, kimi** use CLI plans (`<bin> mcp add/remove/get`). Jini merges no JSON or TOML for them, and `installOwnedJsonAgent` refuses non-JSON plans. They do not have this dead-end.
- **Codex TOML:** Jini has no TOML writer, because Codex goes through `codex mcp add`. **vibe** (TOML), **pi** and **hermes** are print-only manual plans that are never written.
- `verifyJsonAgentInstall` already tells the user to run `mcp install <agent>`, and the install now succeeds for an older entry of ours.

## Commits

| repo | sha | what |
|---|---|---|
| Jini | `26a8b1b8` | red tests (install.test.ts, owned-json-install.test.ts) |
| Jini | `4ffe93fc` | fix in `install.ts`; one existing test's expected message updated |
| Tovu | `d056fb13` | `ensure-json-agent-install.unit.test.ts`: older-install replacement test; foreign-refusal regex updated to the new wording |
| Tovu | (this commit) | report + raw evidence |

## Red / green

- **Red** (`raw/fix-agy/red.txt`, run on `26a8b1b8` before the fix): 7 failed / 70 passed. The 7 failures:
  - `applyJsonInstall`: the foreign entry gives the old wording.
  - `applyJsonInstall`: an OpenCode-shape older entry is not replaced.
  - `applyJsonInstall`: another package's serve script gives the old wording.
  - The owned installer: the foreign entry message does not name the file and key.
  - The owned installer: an older entry is not replaced, for each of: node_modules install, linked checkout, Windows install with `disabled: true`. Each of these checks replacement, the one backup and that the other entries keep their values and order.
- **Green** (`raw/fix-agy/green.txt`): 77/77 in those two files.

## Gates

- **Jini `packages/mcp` full vitest** (`--maxWorkers=2 --minWorkers=1`): **92 files, 1571 tests, all pass, exit 0** (`jini-mcp-vitest.txt`). The stack traces in that log are output that tests print on purpose, not failures.
- **Jini `packages/mcp` typecheck** (`tsc --noEmit`): exit 0 (`jini-mcp-typecheck.txt`).
- **Jini build:**
  - The recursive `pnpm --no-bail -r build` on the integ tree exited 0 (`jini-build-full.txt`). It started before the fix was written.
  - `packages/mcp` was rebuilt after the fix: exit 0 (`jini-mcp-build.txt`). No other package was touched.
- **`pnpm check:cross-package`:** XP3_RESULT_PLACEHOLDER
- **Tovu, with Jini linked** (`JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini`; `@tovu/sdk` built first):
  - `ensure-json-agent-install.unit.test.ts`: **16/16** (`tovu-ensure-json-agent-install.txt`).
  - `apps/desktop/src/desktop-agent.test.ts`: **20/20** (`tovu-desktop-agent-test.txt`). It is the other importer of `installOwnedJsonAgent`.
  - `npm run build:preload` failed in this container: `electron` types are missing because npm install scripts are blocked here (`tovu-desktop-preload.txt`). The desktop-agent test does not need it.
  - **`npm run typecheck`** (root + e2e): exit 0, 0 `error TS` (`tovu-typecheck.txt`).

FIX-AGY DONE
