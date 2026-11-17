# Tool-call structural fixes: design (2026-11-17, revision 2)

Design and plan only. No source file was edited, nothing was built, no test was run.

**Revision 2** answers `CODEX-JUDGE.md` (4 blockers, 15 majors, 1 minor). Every finding was checked in the code
first; all 20 were right and are accepted (table in `INDEX.md`, "Revision 2 - judge response"). Re-read against
`integ/merge-a-2026-11-16` at Tovu `e801e9ae` / Jini `dde69a6d`; every cited path was also checked on
`integ/merge-b-2026-11-16` (Tovu `450ac748`, Jini `9c982fd9`): all exist there except Jini
`core/src/errors/reporter.ts` (error-system E2 is on merge-a only). `integ/merge-final-2026-11-16` did not exist.
Sections changed in revision 2 are marked *(rev 2)*.
**Revision 3** answers the Opus review of revision 2 (table in `INDEX.md`, "Revision 3 - Opus review response"). The
base is now `integ/merge-final-2026-11-16` (Jini `65d73b0d`, Tovu `a28cb1bf`); of the 49 files in `sheets/BLOBS.tsv`
only `mcp/src/server/tool-server.ts` and `core/src/approval.ts` differ from merge-a. Changes are marked *(rev 3)*.
Input: `ADS-memory/.local-artifacts/codex/2026-11-10/tool-failure-audit.md` (1,324 failed tool calls of about 27,000, 10-20 to 11-10).
Code read: `integ/merge-a-2026-11-16`, Tovu `f354cfbd`, Jini `96aade8c`. Paths below are Jini `packages/…` or Tovu `apps/…`.
Line numbers are from those commits. Every sheet tells the executor to find the symbol by name first, because both
integration branches were still moving while this was written.

Repos are public. Security notes here name classes and locations only.

## 1. Verdict per class

| # | Class (audit count) | Today | Root cause (verified) | One mechanism | Sheets |
|---|---|---|---|---|---|
| C1a | Unknown tool id answered as "denied" (68 + part of 11) | **Live** | Four different answers for the same mistake (§2.1) | M1: one tool-target decision in the daemon route, `404 UNKNOWN_TOOL` | S1, S2a, S2b |
| C1b | Guides name tools the CLI cannot call directly (12) | **Live** | Direct set is the first 64 of one list; guides are free text; a full list silently skips promotion (§2.2) | M2: every answer says how to call the tool, plus a lint over every guide text | S3, S4a, S4b |
| C1c | Read-only gateway refuses a "get" tool (11) | **Live, as wording** *(rev 2)* | Risk and the read-only flag are already checked centrally; the refused tool is a real write whose description starts with "Reads" (§2.3) | M3: a wording gate plus the one unchecked field | S5 |
| C2 | Tool, input and slug names masked in errors (78) | **Live, narrower** | Shape guessing: any run of 20+ characters is a secret unless it looks like a lowercase slug (§2.4) | M4: a trusted vocabulary, complete before the MCP client's first lossy pass; the server sends trusted names in the envelope | S6, S7 |
| C3 | Bare `HTTP 500` (40) | **Live, cause found** | The MCP client reads one envelope shape; the daemon app has no last-resort JSON error answer (§2.5) | M5: client never prints a status alone; one terminal error boundary on the server | S8, S9 |
| C4 | Same-file batch edits (21) | **Live** | Plan-mode batches pin every item before the first one runs (§2.6) | M6: the batch owner chains pins for items with the same target | S10, S11 |
| C5 | Refuse where clamp or help is safe (about 35) | **Live** | Repairs are per tool; the one normalizer knows aliases and number strings only (§2.7) | M7: declared repairs in the schema (`aliases`, `clamp`, `obtainFrom`), one contract for typed and gateway calls | S12a, S12b, S13 |
| C6 | Screenshot 20 s deadline (20) | **Partly fixed** | A current-frame fallback exists; the deadline is still one constant for every request (§2.8) | M8: work deadline, fallback reserve and hard stop defined together; budget from the request | S14a, S14b |
| C7 | Calls silent for 300 s lose approvals (5 to 13) | **Live** | No progress notifications; a second 300 s wall is likely in the HTTP hop (§2.9) | M9: one progress pump in the MCP host, a long-wait fetch, per-CLI timeouts as adapter data | S15, S16a, S16b |
| C8 | Chrome tab collisions (192, rising) | **Changed** | Chrome is now a per-person switch, owner only, but it defaults to on and two runs can hold it at once (§2.10) | M10: one browser-integration lease per daemon process; default is an owner decision | S17 |

Audit items checked and **not planned** because they are fixed or expected: result too large (paged since 11-02),
FS root wording, plugin off / OAuth refusals, owner rejections, media limits, egress block.

## 2. Root causes, with evidence

### 2.1 C1a: one mistake, four answers

| Path | Where | Answer today |
|---|---|---|
| Read-only gateway | `daemon/src/http/delegated-tools.ts:152-162` builds `TOOL_OPERATION_DENIED` from `daemon/src/core/read-only-tools.ts:46-49` | `HTTP 403: TOOL_OPERATION_DENIED: no tool "x" is registered; use search_tools — did you mean …` |
| Unconstrained gateway | executor throws `ToolInputError` (`unknown tool "x"`), caught at `delegated-tools.ts:381-383` | `HTTP 400: BAD_REQUEST: …unknown tool "x"`, no suggestions from this route |
| Catalog describe | `daemon/src/http/tool-catalog.ts:89` | `404 NOT_FOUND` |
| MCP-local dispatch | `mcp/src/server/tool-protocol.ts:304-306` | `unknown tool: x` |

Status table: `core/src/contracts/server/api-error.ts:32-56` maps `TOOL_OPERATION_DENIED` to 403. There is no code for
"this tool does not exist". The 17 generic codes are in `protocol/src/errors.ts:9-27`.

Family ids: `content_read` is a group of tools, not a tool. Describe was taught this in Tovu
(`apps/website/src/assistant/tool-catalog-query.ts:68-82`, `targetToolIds`). Execute was not. The suggestion scorer in
Jini names that Tovu family by string (`daemon/src/core/tool-candidates.ts:26`), which also breaks the rule that the
engine holds no product names.

### 2.2 C1b: what "directly callable" means today

- The MCP host publishes: 5 run tools, `search_tools`, `describe_tool`, component catalog tools, the two gateways,
  `wait_for`, optionally `check_messages` and `read_tool_result` (`mcp/src/server/run-tool-host.ts:99-111`,
  `tool-server.ts:310`), **plus** typed tools for the ids in `startupToolIds`.
- Tovu passes every visible id, theme file tools first (`apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:511-518`).
  Jini keeps the first 64 that fit 256 KiB of schema (`core/src/tool-exposure.ts:210`, limit check `:162`).
  *(rev 2)* The limit counts **exposed registry descriptors** (`limitReason`: `snapshot.tools.length >= maxTools`);
  MCP-local tools are reserved names and are not in that count.
- *(rev 2)* A registry id is not the callable name. `tool-exposure.ts` (`nameBase`, `assignName`) publishes an id with
  dots, hyphens or too many characters as `tool_<readable>_<hash>`, with `_1`… on collision, and `tool-server.ts`
  indexes tools by that wire name. `content_read.*` and `page.*` ids are all published under transformed names.
- `describe_tool` promises that a described tool "also" appears in `tools/list`
  (`mcp/src/server/tools/tool-catalog-tools.ts`, `describeToolTool`). When the list is full, promotion is skipped with
  reason `tool-limit` or `schema-byte-limit` and nobody is told. The model then calls `mcp__jini__<id>` and the CLI answers "No such tool".
- Guide text is free text in many places. Found so far, by kind:

| Kind | Example site | Names tools as |
|---|---|---|
| System overlay | `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:55`, `agent-daemon-scope.ts:1127` | bare id in a sentence |
| Plugin guidance | `features/agent-plugins/bundled-catalog.ts:153`, `features/agent-plugins/host-tool-ports.ts:32`, `features/plugin-runtime/plugin-tool-messages.ts:36`, `features/plugin-runtime/agent-tools.ts:158` | call form `load_agent_plugin({…})` |
| Tool descriptions and schema descriptions | `features/theme/agent-tools.ts:138` ("Use theme_list_files…"), `features/theme/duplicate-theme-tool.ts:41` | bare id |
| Refusal and result messages | `daemon/src/core/read-only-tools.ts:45-49`, `mcp/src/server/tool-result-pages.ts:45,78` | bare id or call form |
| MCP server instructions and local tool descriptions | `mcp/src/server/run-tool-host.ts` (`INSTRUCTIONS`), `tools/wait.ts:8` | bare id |
| Runtime guidance | `apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts:87` (`fs_write_files`) | bare id |
| Capability cards, site guide resource | `features/plugin-runtime/capability-card.ts:8`, `createSiteGuideResource` | bare id |

A search for only four ids (`load_agent_plugin`, `agent_plugin_connect`, `plugins_set_enabled`, `credential_save`)
finds 65 non-test files. **I did not count every guide site or every registered tool**: that needs the booted registry.
Sheet S4a produces that inventory as a committed file before anything is changed, and S4b may not start until its
unclassified count is zero.

### 2.3 C1c: a correct refusal with misleading words *(rev 2)*

Revision 1 said nothing compares the "read" fields and named `external_mcp_get_admissions` as drift. Both were wrong.

- `core/src/registration-kit.ts` (`assertRiskIsCorroborated`, `:428-440`) refuses a registration whose declared
  `sideEffects` differs from the wiring layer's derived risk, and derives the flag every read-only gate reads in one
  place: `readOnly: catalogEntry.sideEffects === "none"` (`:533`).
- `external_mcp_get_admissions` is a real write: `approval.class: 'edit'` with the reason in a comment
  (`contracts/core/tool-metadata/external-mcp.ts:17-18`), `sideEffects: "mutates-durable-state"` and the same derived
  risk (`features/external-mcp/operations-tools.ts:33-44`): starting federation may store a refreshed OAuth grant.
  The read-only gateway refusing it is correct.
- What misleads the model is the description's first word, "Reads". And one field is still unchecked against the
  others: metadata `approval.class`. Registrations built outside the registration kit are the other gap.

### 2.4 C2: shape guessing

- `core/src/redact.ts:338`: any run of 20 or more `[A-Za-z0-9_-]` is an opaque token.
- It survives only if it is a correlation id, UPPER_SNAKE, or (model-facing paths) a lowercase slug of letter-only or
  digit-only segments up to 31 characters (`core/src/text/sanitize-untrusted-text.ts:107-110`, unchanged since the audit).
- So these are still masked: camelCase input names of 20+ characters (`dismissCookieBanners` is exactly 20), slugs with
  letter+digit segments, UUID execution and job ids, tool ids registered after launch.
- **Changed since the audit:** the full registry now reaches the MCP process at launch
  (`agent-daemon-scope.ts:504` → `daemon/src/agent-executor/mcp-bridge.ts:84`, `JINI_DIAGNOSTIC_TOOL_IDS`), and
  `handleToolCall` adds the local tool names (`tool-protocol.ts:301`). Tool ids known at launch are no longer masked on the MCP side.
- *(rev 2)* The daemon side does not mask names in Tovu. `redactFailedResult` (`daemon/src/tool-recovery/redaction.ts:171,204-214`)
  calls an **injected** `redactSecretShapes` port. Tovu binds `@tovu/contracts/secret-redaction`
  (`assistant/tool-recovery-preset.ts:19,72-76`), which is secrets-only and documents that tool ids and ordinary
  diagnostics must stay (`packages/contracts/src/secret-redaction.ts:30-46`).
- *(rev 2)* The masking happens in the MCP process, **twice**: `requestDaemonJson` formats a non-2xx answer through
  `safeDiagnostic` before it throws (`daemon-client.ts:168-174,244`), and `handleToolCall` sanitizes the thrown message
  again (`tool-protocol.ts:329-331`). What the first pass masks, the second cannot restore.
- *(rev 2)* A gateway call's MCP schema is `{ toolId, input: object }` (`tools/delegated-tool.ts:182-199`); the domain
  tool's property names are not in it. And `ctx.diagnosticToolIds` doubles as an "is registered" predicate
  (`delegated-tool.ts:223`), so it cannot carry other vocabulary.

### 2.5 C3: where a bare status comes from

Client: `formatDaemonHttpError` (`mcp/src/server/daemon-client.ts:168-174`) reads only `{ error: { code, message } }`.
`parseJsonLoose` (`:59-66`) turns any non-JSON body into `{}`. Result: the status alone.

Server responses on the delegated path that fall through that formatter today:

| Source | Where | Body | Model sees |
|---|---|---|---|
| A throw inside the run-scope middleware goes to `next(error)` | `agent-daemon-scope.ts:1424-1429` | Express default error page (HTML) | `HTTP 500` |
| Body parser refusals (over 6 MB, malformed JSON) | `agent-daemon-scope.ts:1407` | HTML | `HTTP 413` / `HTTP 400` |
| "a live run is required" | `:1426`, `:1558` | flat `{ error: "…" }` | `HTTP 404` |
| "site scope is closed" | `:1370` | flat `{ error: "…" }` | `HTTP 503` |

I found no terminal error handler in `agent-daemon-scope.ts` (searched for a four-argument middleware and for
`status(5`). **Not verified:** whether the parent app in `agent-daemon-server.ts` adds one, and which of these rows
caused the 11-09 storm (27 in one run). The audit found no server log line for it, which fits the first row: Express's
default handler logs to stderr only outside production mode.

A decoder for both envelope shapes already exists: `decodeApiError` (`protocol/src/errors.ts:111-121`).
`@jini-ai/mcp` already imports `@jini-ai/protocol`.

*(rev 2)* Verified: the parent app (`agent-daemon-server.ts:188-199`) forwards `next` into the scope app and adds no
error handler, so row 1 ends in Express's default HTML page. Reporter state on merge-a: `createErrorReporter` exists in
core (`core/src/errors/reporter.ts:219`, error-system E2) with one Jini caller; Tovu builds no reporter yet (E3/E4
open). Tovu's one incident sink today is `reportServerFailure` (`server/inbound/shared/admin-failure.ts:52`).
`mintToolErrorId` already lives in core (`core/src/errors/error-id.ts:22`).

### 2.6 C4: pins taken before the first write

- Theme content tools are batched in plan mode (`apps/website/src/assistant/batch-tool-inputs.ts:14`,
  `apps/website/src/assistant/tool-registrations.ts:522`), so the handler receives `{ items }` once.
- The handler is `createPreparedBatchHandler` (`apps/website/src/features/theme/file-mutation-tools.ts:32`), which is
  `createBatchApprovalHandler` without a question (`core/src/approval.ts:182-191`).
- `prepare` runs for **every** item first (`approval.ts:226`). Each `prepare` stores the file's digest
  (`file-mutation-tools.ts:50`, `theme-files.ts:684-690`).
- *(rev 2)* The persistence owner checks the pin again with no `await` before the rename
  (`theme-files.ts:625-629`, `assertReviewedThemeFileCurrent`). That is the property a fix must keep.
- `run` then goes item by item (`approval.ts:243-246`). Item 1 writes. Item 2 compares its stored digest with the file,
  sees item 1's bytes, and throws "The theme file changed during review…" (`file-mutation-tools.ts:55-58`, second copy `theme-files.ts:676`).
- The throw ends the loop. Earlier items stay applied, later items never run, and the message says nothing was replaced.
  **Not verified:** how this reaches the model as the audit's `partial_failure` shape; S10's first test records the real output.
- The wording is also wrong: theme writes have no review step (`file-mutation-tools.ts:51`).

`createPreparedBatchHandler` has one production caller (theme). `createBatchApprovalHandler` has none outside core in Tovu.

### 2.7 C5: repairs live in two places and know two tricks

- Registry tools: `normalizeToolInput` (`core/src/tool-input-normalization.ts:231`) applies declared `aliases`
  (`:125`), number-string coercion (`:69`), near-miss key names. No bounds handling.
- MCP-local tools use a smaller normalizer (`mcp/src/server/tool-arguments.ts:135-153`) unless they set `schemaInput`.
- Open cases: `read_tool_result.limit` over 8000 refused by the schema (`mcp/src/server/tool-result-pages.ts:48`);
  `theme_duplicate` has no `sourceId` alias (`apps/website/src/features/theme/duplicate-theme-tool.ts:48-50`);
  `theme_list_files` without `themeId` gets "supply required argument" plus the schema but no pointer to `theme_list`
  (`features/theme/agent-tools.ts`, `LIST_FILES_SCHEMA`); `pages_read_html` not-found has no hint
  (`features/pages/html-document-store.ts:347,350,392`).
- **Not re-verified:** `web_fetch_page sitePath`, `web_screenshot_page width`. S13 checks them against the live schema.

### 2.8 C6: one constant for every capture

*(rev 2)* Three owners hold a deadline today, all with the same number: Tovu's outer race
(`playwright-page-capture.ts:165-175`, aborts and drops the browser), Jini's `renderPage` hard signal
(`render-page.ts:294-295`, `AbortSignal.timeout`) whose abort closes the context (`:311-313`), and the work budget
(`page-work-budget.ts`, `Date.now()` + `setTimeout`). A fallback that starts when the budget is spent has no time left
under either hard stop.

`CAPTURE_DEADLINE_MS = 20_000` (`apps/website/src/features/web-screenshot/web-screenshot.ts:35`), message at `:230`.
The budget is spent in Jini's `renderPage` (`diagnostics/src/web-evidence/render-page.ts`, `timeoutMs` `:44`, navigation
`:205`, wait `:228-234`, load wait `:252`). A fallback already takes the current frame when only the **stable-frame
screenshot** times out (`playwright-page-capture.ts:199-217`, 4 s reserve). A page that uses the budget during navigation,
scrolling (`fullPage`) or its requested wait still fails with nothing, and the outer race (`:163-175`) drops the browser.
**Not verified:** how many of the audit's 20 came before that fallback; the file's history was squashed by later refactors.

### 2.9 C7: two walls at 300 seconds

1. The CLI. `packages/mcp/src/server/**` never sends `notifications/progress` (search finds the word only in
   `federation/adapter.http.ts`, which is Jini acting as a client). The call handler forwards only `extra.signal`
   (`tool-server.ts:331-333`; port type `:48-53`), although the SDK passes the whole `extra` object through
   (`tool-server.ts:139`). The delegated call itself waits without a deadline by decision (`tools/delegated-tool.ts:114`).
2. The HTTP hop. The MCP process calls the daemon with the global `fetch` (`daemon-client.ts:230`). Node's fetch gives up
   when response headers do not arrive within its own default timeout, which is 300 s in current Node releases.
   **Not verified in this run** (nothing was executed), but it matches the audit's unexplained `fetch failed` ×10 on
   publish and credential tools. S15's first test proves or disproves it against a real local server.

3. *(rev 2)* A third clock exists and is **not** a wall this plan moves: the human-approval window.
   `APPROVAL_WAIT_TIMEOUT_MS = 120_000` (`core/src/approval.ts:14`) is armed in `daemon/src/tool-executor.ts:403-411`,
   once per call, and its comment says progress cannot extend it. Revision 1's OD-6 text ("no limit on a human wait
   other than the run") did not match this code. Progress frames (M9) go from the MCP host to the CLI only.

*(rev 2)* CLI coverage, from the defs: Claude, Codex and OpenCode inject MCP (`claude-mcp-json`, `codex-toml`,
`opencode-env-content`). The Gemini def is retired (`defs/__tests__/gemini.test.ts:5-10` asserts it cannot be
selected; Antigravity, `env-passthrough`, is the Google CLI in the registry). Aider has no MCP client
(`defs/aider.ts:8,80-86`, `mcpIsolation: 'no-client'`), so no tool call reaches it at all.

No generated MCP config sets a per-server tool timeout (`mcp/src/core/config.ts`, `core/opencode/config.ts`,
`daemon/src/agent-executor/mcp-bridge.ts`: no match for any timeout key).

Overlap check: the AG-UI design keeps the server's chat-card exchange as the one approval mechanism (its OD-10) and adds
SSE keepalive between browser and server. It does not touch the hop from the agent CLI to the MCP host. No shared change.

### 2.10 C8: Chrome is a switch now, on by default

- `useClaudeInChrome` defaults to `true` in **two** places *(rev 2)*: the registered setting
  (`features/settings/admin-interface.ts:81`, `defaultValue: true`), which the runtime reader asks first, and the
  fallback object (`apps/website/src/assistant/runtime-preferences.ts:25`).
- *(rev 2)* One daemon process hosts many site scopes (`agent-daemon-server.ts:194-201`, `createSiteScope(input, { idlePark })`).
- It applies only to the owner on a runtime that supports it, and a supporting runtime is always told `--chrome` or
  `--no-chrome` explicitly (`apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts:55-72`;
  Jini `agent-runtime/src/defs/claude.ts:127-128`).
- Nothing limits how many runs hold Chrome at once, and the tab group belongs to the CLI and its browser extension.
  **Not verified:** whether the CLI offers a per-session tab group; I found no such option in the adapter.
- Collisions with the owner's own non-Tovu sessions cannot be fixed from here.

## 3. Mechanisms *(rev 2: rewritten; sheets are the executable form)*

Each mechanism has one owner. A Jini package imports itself, `@jini-ai/core` and `@jini-ai/protocol` only, and holds
no web framework: Express middleware is Tovu code. New functions take `(required, optional = {})`, stay under 50
lines and complexity 10, and new files stay under 500 lines. Files close to or over the limit get a new sibling file
(at merge-final: `tool-server.ts` 438, `delegated-tools.ts` 392, `approval.ts` 400, `tool-protocol.ts` 333, `registration-kit.ts` 593,
Tovu `theme-files.ts` 1,344 and `agent-daemon-scope.ts` 1,670, both on the size ratchet).

**Publication (judge finding 6).** A new symbol that another package or Tovu imports is a public entry, created in
the commit that creates the file: `exports["./<entry>"]` plus `jini.entries["./<entry>"]` in that package's
`package.json`, pointing at the concrete file. New entries in this plan:

| Entry | Sheet | Consumers |
|---|---|---|
| `@jini-ai/core/tool-call-text` | S1 (S3 adds to it) | `daemon`, `mcp`, Tovu |
| `@jini-ai/core/text/masked-identifier-rows`, `@jini-ai/core/text/diagnostic-vocabulary` | S6 | `mcp`, Tovu tests |
| `@jini-ai/core/approval-batch-chain` | S10 | Tovu |
| `@jini-ai/core/tool-input-repairs` | S12a | `mcp`, `daemon`, Tovu gate |
| `@jini-ai/diagnostics/web-evidence/capture-budget`, `…/web-evidence/testing` | S14a | Tovu |
| `@jini-ai/daemon/exclusive-run-lease` | S17 | Tovu |

Tovu pins `@jini-ai/*` to registry versions (`^0.7.0`, `package.json:135-156`), so a sibling build is invisible until
linked. Executors link with the repo's own script (`npm run link:jini`, `sheets/README.md` §1). The version bump and
lockfile are release nodes (**REL**) in INDEX §3, placed before each Tovu sheet merges to an unlinked branch.

### M1. One tool-target decision; families answered, never routed by the server (Jini `daemon`; `protocol`, `core`, `mcp`)

```ts
// daemon/src/core/tool-target.ts (new)
export type ToolTarget =
  | { readonly kind: 'tool'; readonly toolId: string; readonly descriptor: ToolDescriptor }
  | { readonly kind: 'unknown'; readonly toolId: string; readonly candidates: readonly string[];
      readonly family?: { readonly id: string; readonly members: readonly string[]; readonly selector?: FamilySelector } };
export interface FamilySelector { readonly keys: readonly string[]; readonly byValue: Readonly<Record<string, string>> }
export interface ToolFamilyPort {   // host-owned; absent means "no families"
  describeFamily(required: { familyId: string }): { members: readonly string[]; selector?: FamilySelector } | undefined;
}
export function resolveToolTarget(required: { toolId: string; registry: Pick<ToolRegistry, 'list'> },
                                  optional?: { families?: ToolFamilyPort }): ToolTarget;
```

- The delegated route calls it **once**, after the run-existence check and before the read-only check, the principal
  lookup and the bridge. An unknown target answers `404 UNKNOWN_TOOL` on both gateways (OD-1).
- One sentence format, built in `@jini-ai/core/tool-call-text`:
  `There is no tool named "x". Closest names: a, b. Find tools with search_tools.` For a family:
  `"content_read" is a group of tools, not one tool. Call one of: content_read.menu, content_read.page.` plus
  `details.family` (members and selector, filtered by the route's own registry). The MCP-local "unknown tool" answer
  uses the same builder. The `content_read` string leaves Jini (guard rule).
- **The server never turns a family id into a member (blocker 1).** Tovu mounts `registerDurableToolGuard`
  (`agent-daemon-scope.ts:1512`, `durable-run-routes.ts:49-84`) before the Jini route. It rejects stale attempts and
  ledgers mutations by the request's `toolId`, and lets unregistered ids pass (`:60`). A server-side reroute would run
  the member without those two gates. Instead (OD-2) the **MCP gateway tool** reads the 404's `details.family` and,
  when the caller's input selects exactly one member, sends a second ordinary request for that concrete member (S2b).
  Every host gate sees the concrete id from the first byte; the first request executed nothing and ledgered nothing.

Security trace (lesson 13), unchanged order: scope-closed check → idle park → bearer → 6 MB parser → run credential
matches `body.runId` → run-ownership → durable guard (registered ids only) → run exists → **target decision** →
read-only check → principal → attenuation → executor (policy, confirmation card, deny by default) → result capture.
The target decision reads descriptors only, from the run-scoped registry the route already uses; a tool hidden from
the run and a made-up id get the byte-identical answer (S1 test). A 404 instead of a 403 must not change any gate
keyed on the status: S1 lists every reader of `TOOL_OPERATION_DENIED` and of `DaemonHttpError.status` first.

### M2. Every answer says how to call the tool, by its published name; a lint reads model-facing text (Jini `mcp`, `core`; Tovu check)

- Callable names come from the publisher (finding 7). `publishTool` returns `{ wireName } | { skipped: reason }`.
  `describe_tool` adds `callAs: 'direct' | 'gateway' | 'none'` and `call`: the **wire name** for a direct tool, or
  `execute_delegated_tool({"toolId":"<registry id>","input":{…}})` (the read-only gateway for a read-only descriptor).
  The false "also appears in tools/list" promise leaves the description. A skipped promotion is no longer silent.
- `toolCallText({ toolId }, { wireName, readOnly, input })` in `@jini-ai/core/tool-call-text` renders a mention.
- Tovu pins: `startupToolIds` puts the named set first, then the four theme file tools, then the rest. The named
  set is a generated, committed list.
- Lint `check:tool-guides` (finding 18). It reads text by **provenance**, never "every string": (A) descriptor and
  schema descriptions from the booted registry, (B) MCP-local tool text and `INSTRUCTIONS`, (C) the files listed in a
  committed `tool-guide-sources.json`. A report-only candidate pass lists other files where a registered id sits in
  prose, for a person to classify; it never fails the build and never judges a call. Negative fixtures: SQL
  (`json_extract(`…), template placeholders, identifiers, schema syntax.
  1. A registered id or local name inside model-facing text is a mention. 2. A mention must be pinned or in gateway
  form. 3. In sources A to C, a snake_case token in call form or backticks that is no id, local name, wire name or
  declared property fails. 4. The **named registry descriptors** must fit 64 tools and 256 KiB (local tools are not
  in that count); the margin is printed.

### M3. A wording gate for "read" (Tovu)

The central risk check stays as it is (§2.3). Added: a registry-wide test that (1) a description starting with
"Reads", "Lists", "Gets", "Tests", "Checks" or "Reports" on a tool that is not read-only fails unless it says it needs
the full gateway; (2) `approval.class === 'read'` ⇒ `readOnly`, and the reverse; (3) lists every registration not
built through the registration kit with the evidence for its flag. The sheet may reword and may fix `approval.class`
toward the corroborated risk. It never sets a tool to read-only.

### M4. Trusted vocabulary, complete before the first lossy pass (Jini `core`, `mcp`, `daemon` route)

```ts
// core/src/text/diagnostic-vocabulary.ts (new)
export function buildDiagnosticVocabulary(required: { toolIds: readonly string[] },
  optional?: { inputSchema?: unknown; envelopeDetails?: unknown; echoed?: { input: unknown; schema?: unknown } }): readonly string[];
```

Sources, all from trusted positions, never from the error text:
1. Registered tool ids (today's `diagnosticToolIds`) and local tool names.
2. Property names of the **domain** tool's schema: the MCP tool's own schema for a typed call; for a gateway call the
   descriptor this run already holds, else `details.inputNames` sent by the server.
3. Named envelope fields: `requestId`, `errorId`, `details.executionId`, `details.jobId`, `details.toolId`,
   `details.pendingToolId`, `details.inputNames`. Each must match its expected shape.
4. (OD-3) Scalar string arguments of this same call, except secret-marked properties and anything a secret rule matches.

Where it is applied (finding 10, lesson 34): at the MCP client's **first** format of a daemon error
(`requestDaemonJson`), from the decoded envelope, and again in `handleToolCall`'s second pass with the same tokens.
The server half (S7): the delegated route attaches `details.toolId` and `details.inputNames` from the **registered
descriptor** for a tool that resolved in the run's registry, and `executionId` when the result has one. It adds no
sentence. The daemon's failure redaction is not changed: in Tovu it is secrets-only already (finding 9).

Kept separate (finding 10): the vocabulary travels as `trustedTokens` / `ctx.diagnosticVocabulary`.
`ctx.diagnosticToolIds` keeps its two meanings and gains nothing.

Rules that do not change: credential and labelled-secret rules run first; an entry exempts a **whole** token only;
UUIDs and letter+digit runs are not exempt by shape; the 20-character rule stays for everything else.
Disclosure (lesson 24): the vocabulary only stops masking of names the caller could already see with `describe_tool`.

### M5. Never a status alone, never text that was not written for the caller (Jini `mcp` client; Tovu boundary)

Client (`mcp/src/server/daemon-client.ts`, formatting in a sibling `daemon-error-text.ts`):
- A recognized envelope (nested, or the flat `{ error: "<text>" }` shape `decodeApiError` already reads) keeps today's
  form `HTTP <status>: <CODE>: <message>` byte for byte and gains ` Error ID: <id>.` when the server sent one.
- **Anything else is never quoted (blocker 4).** HTML, plain text, invalid JSON and empty bodies give fixed words and
  an error ID: `The tool service failed (HTTP 500) and its answer was not readable. Error ID: <id>. Do not retry the same call; give the user this error ID.`
  503 with a flat envelope: `The tool service is restarting or closed (HTTP 503): <text>. Wait a few seconds and retry once.`
- The error ID (core's `ERR-XXXX-XXXX-XXXX-XXXX`, `mintToolErrorId`) is minted and recorded by the **one reporter**: an injected `reportFailure` port with the shape of
  `ErrorReporter['record']` from `@jini-ai/core/errors/reporter`. The record holds status, route, content type and
  body length, never body text. Wiring (finding 19) is explicit and tested through the assembled host:
  `bin/serve.ts` (`createErrorReporter`) → `RunToolHostOptions` → `McpToolServerOptions` → `McpToolContext` →
  `daemonCallOptions` → `DaemonRequestOptions`.
- `DaemonHttpError` gains `code`, `requestId`, `details`, so callers stop parsing text.

Server (blocker 3): **no Jini code**. Tovu adds `server/inbound/assistant/daemon-error-boundary.ts`, an Express error
handler mounted last on the scope app. Body-parser refusals keep their status (413, 400) with a plain sentence;
everything else gets an id from core's `mintToolErrorId` (through Tovu's existing wrapper in
`assistant/tool-recovery-preset.ts`) and is reported once through Tovu's existing sink `reportServerFailure` with that
id, so one failure is one incident whose id is the `requestId` the caller sees. *(rev 3)* It does not go through
`reportRouteInternalError`: that function mints a `randomUUID()` (`http-kit/src/internal-error.ts:38`) and has no id
port, which would give the caller a second id format next to S8's (Opus review B4). The three flat answers become `createApiError` envelopes. This matches R7 §3.5, which keeps the host
parser and host gates as Express middleware in Tovu.

Coordination with the error-system design (nothing planned twice): its E2 (reporter, id function in core) has landed
on merge-a and is what S8 binds to. Its E4 makes `reportRouteInternalError` and `reportServerFailure` call the
reporter. *(rev 3)* S9 uses `reportServerFailure` and core's id function as they are; E4 rebinds the boundary's two
ports where the scope file mounts it, with its other call sites; the boundary file itself does not change.
Its site list has no row for `daemon-client.ts` or `delegated-tools.ts`.

### M6. Same-target batch items chain on what the batch itself committed (Jini `core`, Tovu theme adoption)

```ts
// core/src/approval-batch-chain.ts (new)
createChainedBatchHandler<TPrepared, TCommitted>({ prepare, run, targetKey, successor }, { maxItems, targetNoun })
//   run(...)       → Promise<{ output: unknown; committed: TCommitted | undefined }>
//   targetKey({ prepared }) → string
//   successor({ prepared, committed, previous }) → TPrepared     // synchronous, no I/O
```

- **No re-read (blocker 2).** After an item's `run`, the next item with the same key is pinned to the version that
  `run` reported it committed. In Tovu that value is the digest of the temp file taken inside `writeFileAtomically`
  before the rename, which already happens with no `await` after the pin check. A foreign write in any window
  (before the successor is computed, after it, or during asynchronous preparation) therefore fails the next item's
  existing pin checks, and is never adopted as a baseline.
- If an item fails, later items with the same key report `Skipped: an earlier change to this file in the same call failed.`
  Items for other targets still run. The result lists every item as applied, failed or skipped.
- Only for direct batches. The asking variant is untouched; `createPreparedBatchHandler` is untouched.
- New wording, both Tovu sites: `This theme file changed after it was read. Read it again and retry; this change was not applied.`

### M7. Declared repairs in the schema, one contract for both call paths (Jini `core`, `mcp`, `daemon`; Tovu data)

- `aliases` (exists): add `sourceId` on `theme_duplicate.sourceThemeId`.
- `clamp: true` on a numeric property with a bound: an out-of-range number is set to the bound with a value-free note.
  Implemented once in `@jini-ai/core/tool-input-repairs` (`clampDeclaredBounds`) and called by `normalizeToolInput`
  (typed MCP tools, the registry's execution path, batch inputs). MCP-local tools do not run that normalizer
  (finding 11: `schemaInput` is off for `search_tools` and `read_tool_result`), so they opt in to the clamp alone with
  `argumentNormalization.clamp`; their other refusal texts do not change. The MCP layer's silent integer-string
  coercion stays silent: a clamped `"8300"` yields one note.
- `obtainFrom: "<tool id>"` on a required property. Typed path: the MCP validator's message gains
  `; list valid values with theme_list`. Gateway path: the handler refuses in the daemon, so the route's validation
  answer appends ` List valid values for \`themeId\` with theme_list.` from the registered descriptor. Both call
  `missingArgumentGuidance`. A tool the run cannot see is never named.
- Gate (Tovu): every integer page, size or wait control with a `maximum` declares `clamp` as true or false.

### M8. Work deadline, fallback reserve and hard stop, defined together (Jini `diagnostics`; Tovu adoption)

For a capture with hard limit `T` and reserve `R`: ordinary work must end by `T − R`; if navigation has committed, the
fallback (`consume` on the current page) runs in `[T − R, T]`; at `T` the existing hard signal closes the context and
Tovu's outer race drops the browser. The fallback never needs time after `T` (finding 12). A caller cancel is not a
deadline and never starts fallback work. `captureBudget(...)` returns `{ totalMs, softDeadlineMs, reserveMs }`; the
total grows with the request up to a host cap (OD-5). S14a first adds a clock port so the three deadlines can be
driven by one fake clock. Messages state the real number.

### M9. Progress from one place, a long-wait fetch, timeouts as adapter data (Jini `mcp`, `agent-runtime`)

- `mcp/src/server/call-progress.ts`: when the request carries `_meta.progressToken`, send `notifications/progress`
  (`{ progressToken, progress: n, message: "waiting" }`) every 25 s from the one `tools/call` handler; stop on settle
  and on abort; carry no output, no arguments, no ids (lessons 18, 19).
- **Progress is a keepalive to the CLI only (finding 13).** It does not reach the executor. The 120 s
  human-approval window and "zero effects after expiry or cancel" are pinned by characterization tests that must
  still pass unchanged after the pump lands. Changing 120 s is OD-10.
- `bin/serve.ts` passes a `fetchImpl` whose response-header wait is unlimited, if S15's first step proves the wall.
- CLI coverage (finding 14): everything in M1 to M8 sits behind the transport, so it applies to every CLI with a tool
  transport. S16a commits a support matrix with a measured row for Claude, Codex, OpenCode and Antigravity and two
  recorded `unsupported` rows: Gemini (retired def) and Aider (no MCP client, so no tool call exists to fix), OD-11.
  S16b emits a timeout key only for measured CLIs and schedules the Tovu binding in the same sheet.

### M10. One browser integration at a time per daemon (Jini `daemon` lease; Tovu composition)

- `createExclusiveRunLease()` (pure, `@jini-ai/daemon/exclusive-run-lease`). **One instance per daemon process**,
  created in `agent-daemon-server.ts` beside `idlePark` and passed to every `createSiteScope` (finding 16).
- A run that would get the integration acquires; a second run launches with `false` and one guidance sentence.
  Release is idempotent and happens on the run's terminal wait (completed, failed, cancelled, launch failure,
  scope disposal) **and** when the executor's run promise settles (a child that exited without a terminal event).
- Default (OD-4, finding 15): changed in the registered definition and the fallback together; stored choices are not rewritten.

## 4. Gates that stop each class from coming back

| Class | Gate | Where it runs |
|---|---|---|
| C1a | Route test: unknown id on either gateway is `404 UNKNOWN_TOOL` with the exact sentence; guard rule: no product tool name in `packages/**` | Jini daemon tests, `pnpm guard` |
| C1b | `check:tool-guides` (strict after S4b), pinned-fit test | Tovu check, Jini `scripts/` |
| C1c | Read-wording registry test; the existing risk corroboration in the registration kit | Tovu test, Jini core |
| C2 | Table test of real masked examples, each redactor in its own package plus one Tovu end-to-end test; property test that a credential-shaped value is still masked even when it is in the vocabulary sources that must not be trusted | Jini core + mcp tests |
| C3 | Property test: for any status 400–599 and any body the message is never only a status, always has an id or reference, and never contains body text of an unrecognized answer; wire test that a throwing middleware answers JSON with a request id | Jini mcp tests, Tovu integration test |
| C4 | Core test for chain and skip; Tovu tests with three edits to one file and a foreign write in each of three windows | Jini core, Tovu |
| C5 | Bounds-declared registry test; normalizer tests | Jini core, Tovu |
| C6 | Pure budget tests; one-clock tests of work deadline, reserve and hard stop; cancel never starts a fallback | Jini diagnostics, Tovu |
| C7 | Fake-scheduler test of the pump; real-server test of the header wait; pinned approval-window tests; CLI matrix test | Jini mcp |
| C8 | Lease tests (two site scopes, release on six endings); default read through a fresh settings repository | Jini daemon, Tovu |

## 5. Lessons applied (the ones that shaped this plan)

- 2 / 9 / "search for existing mechanisms": reused `decodeApiError`, core `mintToolErrorId` and Tovu `reportServerFailure`, `normalizeToolInput`
  and its `aliases`, `toolCandidates`, `targetToolIds`, `buildEvalToolRegistry`, the `chromeIntegration` option, the screenshot fallback.
- 5: every sheet lists its prerequisites and is green alone; text-changing sheets update the tests that read the text in the same commit.
- 6: each characterization test names the failure it must show before the fix (INDEX §2, column "red-first test").
- 13: gate order on the delegated path traced in M1; S1 and S9 carry tests that fail when a gate is removed.
- 15: owner rules are acceptance criteria in every sheet (limits, DI, exact error text, no masked names, no bare status).
- 18 / 19: the progress pump carries no content and no correlation by tool name.
- 20: making the screenshot deadline configurable revisits the outer race and the message that quoted the constant.
- 21: the lease is released on process death, not only on promise settlement.
- 24: un-masking names is separated from disclosure; both directions of old client × new server are covered in S8 and S9.
- *(rev 2)* 27: host-preset and Express-in-Tovu exceptions applied before planning (S9 has no Jini code).
- *(rev 2)* 29 / 30: `sheets/README.md` is one contract with a command per STOP; red tests are never committed alone;
  split sheets (S2a/b, S12a/b, S14a/b, S16a/b) each compile alone, and a Jini part is always committed before the Tovu part that reads it.
- *(rev 2)* 31: every security or deadline test names its seam; where none exists the sheet creates it first (S14a clock, S11 file port).
- *(rev 2)* 34: vocabulary is built before the first lossy pass (M4). 35: the fallback reserve sits inside every hard deadline (M8).
  36: call text uses the publisher's wire name (M2). 37: the guide lint is scoped by provenance with negative fixtures (M2).

## 6. Not verified

1. Nothing was executed. All claims come from reading the commits named at the top.
2. The number of registered tools, the number of guide sites, and whether the named descriptors fit the 64-tool limit (S4a measures).
3. Which bare-status source caused the 11-09 storm (the parent app adds no error handler: verified in rev 2).
4. The 300 s response-header wait of Node's fetch on the versions in use (S15 measures).
5. Whether each agent CLI sends a progress token, resets its timer on progress, or has a per-server timeout key (S16a measures).
6. How a failed plan-mode batch reaches the model today (S10 measures).
7. `web_fetch_page sitePath`, `web_screenshot_page width`, and the publish "status could not be confirmed" case (S13 step 0; the last is not planned here).
8. Whether the audit's 300 s approval losses happened before or after the 120 s approval window existed (S15 step 0a pins today's behaviour).
9. Whether the MCP validator and each CLI's schema loader accept the two new schema keywords (S12a step 0).
10. Tool names leaking into assistant replies (audit item 16) is a prompt and UI matter and is not planned here.
11. No registry release process was read; REL nodes in INDEX §3 name what must be released, not how.
