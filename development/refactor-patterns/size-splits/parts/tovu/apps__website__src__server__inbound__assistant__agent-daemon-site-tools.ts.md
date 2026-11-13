### tovu:apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts
- **Over:** `createDaemonSiteTools` 111 (file 134, under)
- **Phase:** after-move (MIXED) · **Batch:** size-55
- **Tests:** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-site-tools.unit.test.ts`, `.../__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts`, `.../__tests__/agent-daemon-server.attachment-binding.unit.test.ts`, `.../__tests__/agent-daemon-remote-tools.integration.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `componentResponse`, `toolResponse`, `preflightResponse`, `SiteCatalog`, `LiveRun` | response schemas + types (stay) |
| B | inner `async function read({ path, query, maxResponseBytes }` | one timed, byte-bounded, no-redirect read of the site RPC |
| C | inner `async function preflight({ runId, signal }` fetch part | (stays — reads `live`/`runs`) |
| D | rest of `createDaemonSiteTools` (scope, run maps, registry, start/finish, catalogs) | per-run catalog state (stays) |

- **Splits:**
  1. HELPER `readSiteRpc({ baseUrl, token, path, query, maxResponseBytes }: ReadSiteRpcInput, { fetch }: ReadSiteRpcOptions = {}): Promise<unknown>` (module level, directly above `createDaemonSiteTools`; `ReadSiteRpcOptions = { fetch?: typeof fetch }`) ← body of inner `async function read({ path, query, maxResponseBytes }` (~L58-71) with its 3-line "One timed, byte-bounded read…" doc. Only change inside: `optional.fetch` → `fetch` (the destructured option), i.e. `{ ...(fetch ? { fetch } : {}), maxResponseBytes, strictUtf8: true }`.
  2. In `createDaemonSiteTools` delete inner `read` and rewrite its two call sites: in `start` (`await read({ path: "/internal/tool-catalog", …})`) and in `refreshComponents` (`await read({ path: "/internal/component-catalog", …})`) → `await readSiteRpc({ baseUrl, token, path: …, query: …, maxResponseBytes: … }, { fetch: optional.fetch })`.
- **Importers to update:** none.
- **After:** file ~136; `createDaemonSiteTools` ~97; `readSiteRpc` ~15.
- **Risks / notes:** Barely over (111): this one lift suffices; do not split further. Naming the option `fetch` shadows the global inside the helper only — the body never calls the global `fetch` directly (it goes through `fetchTextWithTimeout`), so behaviour is identical.
