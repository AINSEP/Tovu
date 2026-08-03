# Outbox `workspaceId` fix + MCP-UI confirmation decisions

Date: 2026-08-03
Session: Coordinator (Review Mode), Claude Code / Opus 5 (1M context)
Branch: `refactor/jini-admin-extraction` (the prior handoff recorded `main` — wrong, same commit `18890f1`)
Supersedes the open items in `ADS-memory/.local-artifacts/handoff/20260803-122014-handoff.md`

---

## 1. Both "unverified" risks from the handoff — CONFIRMED, executed not inferred

### Risk 1: `admin/entries/create` broken identically — CONFIRMED, and wider than that

Live authenticated probe against the running dev server:

```
POST /api/admin/v1/entries {"type":"widget","slug":"__entries-create-probe__",
  "fieldsJson":{"ext":{"site":{"payload":"probe"}}}}
→ 500 {"error":"NOT NULL constraint failed: outbox_events.workspace_id"}
```

The entry was still written (`6627b874-…` appeared in the list). Same write-succeeds/response-fails
signature as widgets.

**The blast radius was not "widgets + entries". All THREE bridges had the identical defect** —
`toEntryOutbox`, `toContentTypeOutbox`, `toTaxonomyOutbox` — so entries, content-types, taxonomy and
widgets were all affected. The handoff named only `toEntryOutbox`.

### Risk 2: inline images silently dropped from published output — CONFIRMED

`renderDocNode` has no `case "image"` (`src/server/http/site/render.ts:146-186`); TipTap's node type
is `"image"`, so it falls to `default`, which renders `node.content` — and an image node is a leaf
with none. Executed against the real renderer:

```
input : doc[ paragraph("before"), image{src,alt,title}, paragraph("after") ]
output: "<p>before</p><p>after</p>"
```

Not a placeholder, not alt text — the image is gone. **Confirmed, deliberately NOT fixed** (scope).
Note `render.ts:237` has a labelled aspect-ratio box helper standing in for an image already, so a
fix has something to reuse.

---

## 2. The fix that landed

**Root cause, precisely:** each bridge under-declared the port it wraps. Their `outbox` parameter was
typed `{id, name, occurredAt, payload}` — no `workspaceId` — while a real `core/ports` `DomainEvent`
carries `workspaceId` as a non-optional tenant boundary (ADR-007) and `SqliteOutboxAdapter.enqueue`
writes it to a NOT NULL column. So a host binding the SQLite adapter typechecked clean and threw on
every write.

**Fix (Jini `packages/cms`):** all three bridges now take `workspaceId: string` as a REQUIRED dep and
declare it on the wrapped port's event type. Omitting it is now a **compile error**, not a runtime
500.

- `src/entries/repo.memory.ts` — `toEntryOutbox`
- `src/content-types/repo.memory.ts` — `toContentTypeOutbox`
- `src/taxonomy/repo.memory.ts` — `toTaxonomyOutbox`

**Why `deps.workspaceId` and not `event.payload.workspaceId`** (a real fork in the road — the payload
route needs zero call-site changes and is tempting): **taxonomy rules it out.** Its events are
`{name, taxonomyId, actorId, occurredAt}` — no `workspaceId` anywhere
(`packages/cms/src/taxonomy/write-service.ts:214,273,320`). Entries/content-types happen to carry one
in `payload`, but that is a per-event convention, not a contract. Sourcing from `deps` is the only
uniform answer.

**Tovu call sites:** the type change surfaced exactly 4, all in `src/widgets/` — `write-service.ts`
(via `entriesWriteDeps`, which gained a `workspaceId` param threaded from `input.workspaceId` at its
4 call sites), `region-area-service.ts`, `embed-service.ts`, `entry-payload.ts`. Every
entries/content-types/taxonomy ROUTE call site already passed a `deps` bag structurally containing
`workspaceId` and needed no edit.

### Verified live (not by tests — see §3)

| Path | Before | After |
|---|---|---|
| `POST /api/admin/v1/entries` | 500 | **201** |
| widget create | 500 | **201** |
| widget update (`PUT …/widgets/:id`, field is `baseVersion`) | 500 | **200** |
| widget trash | 500 | **200** |
| widget purge | 500 | **200** |
| region-bind | 500 | **201** |

`outbox_events` rows now carry `workspace_id`; zero `NOT NULL` / `mapWidgetErrorToResponse` errors in
the server log after restart. Jini `packages/cms`: 471 tests / 62 files pass. Root `npm run typecheck`
clean.

**Symlink note still applies:** `Tovu/node_modules/@jini-ai/cms` → `Jini/packages/cms`. No publish
step; `npm --prefix packages/cms run build` is immediately live in Tovu. The dev server must be
restarted to pick it up.

### `check:outbox-bridge` — the 3 findings were false positives, checker fixed

Confirmed the handoff's Risk 3. `widgets/write-service.ts` composes as
`deps: { ...entriesWriteDeps(deps, ws), onWritten }`; the resolver understood a direct
`deps: helper(...)` call but not a **spread** of one, so it failed closed on correct code.

Fixed by teaching the resolver top-level spreads (`topLevelSpreadHelpers` + `findOutboxValue`, capped
at `MAX_RESOLVE_DEPTH = 4`). Fail-closed remains the default — that was right; the resolver was wrong.

**Self-tested both directions** (`--dir <fixtures>`), because a guard that was only made to pass is
worthless: a raw `outbox: deps.outbox` hidden inside a spread helper is still caught, a wrong-family
bridge inside a spread is still caught, and correct spread composition is silent.

Scope note recorded in the script: it checks that the bridge is CALLED, not what it is called WITH.
The `workspaceId` half is now enforced by the type system instead. The CALLED half still needs a
shape check, because a raw adapter satisfies the narrow port's call signature under method-parameter
bivariance and always will.

---

## 3. Standing hazard: this bug class is invisible to the test suite

`SqliteOutboxAdapter` appears in exactly 2 non-production files, both testing it in isolation. No
domain test wires it — e.g. `widgets/__tests__/integration/write-service.integration.test.ts:42`
passes `outbox: { enqueue: async () => undefined }`. **A green test run proves nothing about this
class of bug.** Verify through the running app. This is why the static guard exists at all.

---

## 4. `content_post_delete` — confirmed self-approvable, END TO END through the real product path

The handoff called this "confirmed by static trace". Re-verified along the path the product actually
executes, which matters because the previous framing stopped at `okResult` in isolation.

**The chain:**

1. `src/features/post/tool-registrations.ts:457` returns
   `buildUIToolResult({modelText, ui})` → `{content: [textBlock, uiResource]}`. Token is in `ui`,
   never in `modelText`. **Correct where written.**
2. The daemon's `ToolExecutionResult.output` is typed `unknown` and holds that raw return value
   (`Jini packages/daemon/src/tool-executor.ts:130-136`).
3. `execute_delegated_tool`'s handler returns `data.result`
   (`Jini packages/mcp/src/server/tools/delegated-tool.ts`).
4. `handleToolCall` does `return okResult(result)`; `okResult`
   (`Jini packages/mcp/src/server/tool-protocol.ts:73-76`) `JSON.stringify`s any non-string into
   **one text block**.

So the dialog's inline `<script>` — `var TOKEN = "…"` — arrives as ordinary model-visible context.
The model can then issue step 2 itself with `confirmationToken` filled in from what it just read.

**Second, independent failure: nothing renders the dialog.** `buildUIToolResult` has exactly one
caller (the delete handler) and **zero consumers**. No `McpUiHost`, no `useMcpUiHost`, no
`registerExtEventRenderer`, no `ui://` renderer anywhere in `src/` or `apps/`. No human is ever asked.

**Net: this is worse than an ungated delete.** The tool is registered and reachable
(`src/assistant/tool-registrations.ts:204`). Its description asserts *"it requires a secret that
exists only inside the rendered dialog and is never shown to you"* — false. The real gate
(`assertToolIsWirable` / `ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT`, which correctly
refuses three sibling tools) was explicitly opted out of with a comment arguing this tool needs no
transport because its confirmation rides in the return value.

**Fixing `okResult` alone does not restore the property** — failure two still stands.

---

## 5. DECISIONS TAKEN THIS SESSION (user, 2026-08-03)

### D1 — "selected tool calls" means USER APPROVES EACH CALL

The handoff flagged this phrase as ambiguous between *a curated tool subset* and *the user approving
individual calls*. **Resolved: the second.** The assistant proposes a tool call; the human approves or
rejects it in chat before it runs.

**Consequence: the chat-assistant workstream and the MCP-UI confirmation workstream are ONE piece of
work**, not two. There is no separate "chat FAB" project. Build the approval mechanism once,
generalized beyond delete.

Also established: `ChatFab.tsx` and `AssistantDock.tsx` **already exist and are already rendered**
(`apps/admin/src/App.tsx:443-445`), wrapping `@jini-ai/chat-react`'s `ChatPane`. Nothing to build
from scratch; the work is what the surface DOES.

### D1a — SCOPE NARROWING (user, same session, refining D1)

> *"the only thing for mcp-ui to gate on the backend is to delete for right now. obviously the front
> end shouldn't delete anything, its tools are search, navigate, answer questions"*

Two surfaces, two different rules:

- **Backend agent tools** — MCP-UI confirmation gating applies to **delete only**, for now. Not a
  general per-call approval layer over everything.
- **Front-end chat assistant** (the admin `ChatFab`/`AssistantDock`/`ChatPane`) — **read-only**:
  search, navigate, answer questions. It should not be able to delete anything.

This refines D1 rather than reversing it. Per-call approval is still the mechanism, but its scope is
the one destructive backend tool; the front-end surface is handled by *not exposing* destructive
tools at all, which is the cheaper and stronger control.

**MEASURED GAP — the current surface is nowhere near this.** Counted from the registered catalogs
(`src/assistant/tool-registrations.ts` wires 20 domains):

| `sideEffects` | count |
|---|---|
| `none` (read-only) | 63 |
| `mutates-durable-state` | 49 |
| `mints-token` | 1 |
| `deletes-durable-state` | 1 |

**88 unique tool ids**, ~50 of them mutating. Today's assistant can reach forms, identity, comments,
members, newsletter, media, widgets, menus, database, recovery, plugins, workspace, settings,
entries, post, taxonomy, seo, redirects, integrations and themes. "Search, navigate, answer
questions" is roughly the 63 read-only tools plus `@jini-ai/agentic`'s `page.*` capabilities
(`page.navigate`, `page.find_elements`, `page.scroll_to` — already wired in
`src/assistant/agent-daemon-server.ts:149`).

**CLASSIFICATION GAP, needs a decision before gating on the label.** Only `content_post_delete` is
declared `deletes-durable-state`. These are declared `mutates-durable-state` despite deleting things:

- `theme_delete_file`
- `integrations_delete_subscription`
- `newsletter_remove_subscription`
- `widgets_remove_embed`
- `comments_trash_comment` (soft — arguably fine)
- `widgets_trash_instance` (soft — arguably fine)

The soft-delete pair is defensible. `theme_delete_file` and `integrations_delete_subscription` look
like genuine misclassifications. **Consequence: a gate keyed on `sideEffects ===
"deletes-durable-state"` would catch exactly one tool and let those through.** Either fix the
classifications or key the gate on something else — do not assume the label is trustworthy.

### D2 — no stopgap on `content_post_delete`; fix it properly via MCP-UI

User chose to leave the tool as-is rather than excluding it from the agent surface now. The
self-approval window stays open until MCP-UI steps 1–4 land. **Recorded as a deliberate, informed
decision** — the alternative (adding `actorClassRule: "confirmer-must-equal-own-delegatedBy"` so the
build refuses it) was offered with its cost and declined.

Practical read: this raises the priority of the MCP-UI work rather than lowering it, since nothing
else closes the hole.

---

## 6. The MCP-UI build order (unchanged from ADR-053, now the single active plan)

1. **Redesign the handler so it stops returning the resource in its own tool-call result.** This is
   where the security property is re-established; everything else is plumbing. The fork must happen
   *inside the daemon at handler execution* — a tool call's return value is definitionally what the
   model receives, so anywhere downstream is too late. Model gets `modelText` only; the resource goes
   out-of-band over the agent event stream.
2. **Swap in Jini's `features/mcp-ui/surfaces/confirmation.ts`** — already generalized from this
   repo's own `delete-confirmation-ui.ts`. Required, not optional: the current dialog speaks an
   ad-hoc postMessage dialect, `useMcpUiHost` expects a JSON-RPC handshake.
3. **Register `McpUiHost` via `registerExtEventRenderer`.** `AgentEvent` already has a `kind:'ext'`
   escape hatch and the transport already routes unknown wire events into it. Additive call, NOT a
   `ChatPane` edit, zero blast radius.
4. **One admin-authenticated redemption endpoint.** `onToolCall` is a plain callback — no second CLI
   round-trip needed.

**Trap, do not reach for it:** `registerToolRenderer` looks like the obvious answer (it is what
`McpUiLab.tsx` uses) but its `result` field is `string | undefined`, derived from the same flattened
value the model saw. It puts the token straight back on the model-visible path.

**Rejected alternative, still on file:** Jini's native `surface_request`/`surface_response` event
(`surfaceKind:'confirmation'`) that Tovu's transport reserves space for and nothing uses. Genuinely
less work, non-MCP-UI. Kept in ADR-053's rejected-alternatives because MCP-UI was asked for
specifically. Raise again only if MCP-UI's cost grows.

---

## 7. Corrections to the previous handoff

- Branch was `refactor/jini-admin-extraction`, not `main`.
- The defect was in **all three** bridges, not just `toEntryOutbox`.
- "There are 4 widgets in `workspace-local`, not ~47" — **wrong, and the reverse of the truth.** The
  entries endpoint reports **55** `type=widget` rows in `workspace-local`, including a full
  `smoke-test-widget-1..25` set (twice) and `smoke-test-social-links-*`. The widgets ADMIN endpoint
  shows only 3 active / 3 trash, which is why the previous session concluded there were 4. The gap
  between 55 entries and 6 surfaced widgets is **unexplained and not investigated** — worth a look
  before any cleanup, since it means the admin list is hiding rows that exist.
- Probe rows now in the DB from this session: `__entries-create-probe__`, `__fix-verify-entries__`
  (both `type=widget` entries), plus `__fix-verify-widget__` / `__fix-verify-update__` /
  `__fix-verify-update2__` (created AND purged) and one `footer` region binding. Pre-existing:
  `__net-probe-widget__`, `__outbox-fix-verify__`.
