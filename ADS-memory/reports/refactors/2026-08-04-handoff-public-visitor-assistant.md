# Handoff: the public visitor assistant shipped; Gemini tool-calling was broken and is fixed

Generated: 2026-08-04 (session ran 2026-08-03 evening).
Source: Coordinator (Review Mode), Claude Code / Claude Opus 5 (1M), repos `Tovu` + `Jini`.
Supersedes the operational parts of `2026-08-03-handoff-image-capability-and-vibecoding.md`; that
file's vibecoding background still stands.

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this file, then
> `ADS-memory/reports/architecture/ADR-054-public-visitor-assistant.md`. Both repos are on
> `refactor/jini-admin-extraction` and **everything is pushed to both the branch and `main`.**
> A second human session shares both trees — run `git status` in **both** repos first.
> **Do not re-derive the two-content-model finding or the Gemini fix; both are settled below.**

---

## State

| repo | branch | HEAD | pushed | tree |
|---|---|---|---|---|
| Tovu | `refactor/jini-admin-extraction` | `a5dcd29` | ✅ branch **and** `main` | one uncommitted file, see below |
| Jini | `refactor/jini-admin-extraction` | `726f1ae4` | ✅ branch **and** `main` | other session active |

**`main` is current in both repos** — fast-forwarded this session (Tovu 35 commits, Jini 56), zero
divergence, nothing overwritten. This was the prerequisite for cloud dispatch, which clones from
GitHub.

**One file uncommitted at handoff:** `apps/site-chat/src/widget.css` (+17/−30 since `a5dcd29`), a
subagent's half-finished light-mode fix. See "In flight".

---

# The feature that shipped: public visitor assistant (ADR-054)

A visitor-facing chat on **every page of the public site**, separate from the admin assistant
(ADR-049) and sharing only UI components with it.

**Verified working end to end in a real browser**, with a real answer streamed from published
content. Not "tests pass" — a browser rendered it and a visitor question returned real titles.

### Architecture, and why

| decision | rationale |
|---|---|
| **Direct provider call, not the agent-CLI daemon** | The daemon **spawns an OS process per run** with filesystem + write-capable MCP access. N anonymous visitors = N processes, any of whom could rewrite the site. |
| **NOT `registerModelProxyRoutes`** | ADR-054 originally said to mount it. **Wrong** — it requires `apiKey` in the POST body with no server-side injection hook. Correct for the admin's BYOK mode, a key-leak if pointed at the public. Tovu calls `runGoogleToolTurn` in-process instead. |
| **Read-only allowlist, closed switch** | Three tools, no registry lookup, no dynamic dispatch. An unknown tool name cannot resolve to anything. |
| **Injection in `render.ts`, not per theme** | Five themes = five things to desync, and custom themes would silently miss it. |

### Files

- `src/assistant/site/mode.ts` — the `byok`/`cli` gate. Fails closed. **Not** loopback-gated:
  `app.listen(port, cb)` passes no host, so Express binds every interface and there is no
  loopback-vs-public state to read. Gated on two independent env vars + a `NODE_ENV=production`
  refusal instead. 8 tests.
- `src/assistant/site/tools.ts` — `search_published_entries`, `get_published_entry`,
  `list_categories`. 12 tests.
- `src/server/modules/site-assistant.ts` — `POST /api/site-assistant/chat`, SSE, no admin session,
  no client-supplied key.
- `apps/site-chat/` — second build target (Vite/React IIFE), reuses `ChatFab`/`ChatPane` from
  `@jini-ai/chat/react` unmodified. Has its own transport (the public route speaks a different
  protocol from the admin daemon).
- `src/server/middleware/site-chat-static.ts`, `src/server/http/site/render.ts` (injection).

---

# THE FINDINGS THAT MATTER MOST

## 1. Tovu has TWO parallel content models. Do not confuse them.

The first version of the tool surface returned nothing, and the assistant told visitors the site had
no posts — while the dashboard showed 9 published.

```
entries table:  widget|draft|59   widget_area|draft|2     <- nothing else
posts table:    published|9   draft|5                      <- the real content
```

`EntryListPort`/`entries` is the widget model. **`PostRepoPort`/`posts` is what the live site and
admin dashboard actually read.** The published-only filter was working perfectly — filtering an
empty table.

**Two traps inside this:**
- `features/entries/list.ts`'s `listEntries()` never forwards `status`. It is the obvious-looking
  call and it returns drafts.
- `PostRepoPort.list({workspaceId})` has **no status parameter at all**, deliberately, so
  uniqueness checks elsewhere can see every row. Any filtering is therefore the *entire*
  enforcement, not a second layer.
- `posts.deleted_at` is **independent of `status`** — `softDelete` stamps the timestamp without
  flipping status, so a trashed row still reads `status: "published"`. Three trashed drafts exist
  today. Filtering on status alone looks correct and starts leaking the moment a *published* post is
  trashed.

**Resolved properly:** `readPublished()` now calls `listPublishedPosts` from `features/post` rather
than reimplementing the predicate, so the assistant cannot drift more permissive than the site
itself. All 20 tests passed unchanged after the substitution, proving the two predicates were
genuinely identical rather than coincidentally agreeing.

## 2. Gemini tool-calling was broken on every currently-served model — FIXED

`google-messages.ts` sent no `thought_signature`, and every current Gemini model rejects the tool
continuation with **HTTP 400**. The whole tool loop was dead; it only ever worked on the 2.x line,
which is now discontinued (measured: `gemini-2.5-flash`/`-lite` → **404**, `gemini-2.0-flash` →
quota `limit: 0`).

Wire shape, **measured against a live response** — the published docs page redirects to a thinking
guide describing a *different* thought-block form that would produce a wrong implementation:

```json
{ "functionCall": { "name": "...", "args": {}, "id": "..." },
  "thoughtSignature": "EukCCuYCARFNMg..." }
```

**Sibling of `functionCall` on the same `Part`**, not inside it. Wire key is camelCase even though
the error spells it `thought_signature`. Carried and echoed verbatim; absent and empty kept
distinguishable. Jini `726f1ae4`, `agent-runtime` 1928/1928.

## 3. Gemini DOES honor `inlineData` beside `functionResponse` — CONFIRMED

The prior handoff's oldest open question, flagged "do not resolve by guessing". Solid-colour PNG as
the only channel carrying the colour: `rgb(128,0,128)` → `"purple"`, `rgb(0,160,60)` → `"green"`.
Two colours, two correct answers. It was never a key problem — the comprehension test was blocked
behind the 400 above.

---

# In flight — one subagent, mid-task

**`site-assistant` (Sonnet 5).** Completed and pushed: the tool surface fix, the bundle, injection,
the visibility collapse, the crash fixes, and the admin-matching chrome.

**Uncommitted at handoff:** `apps/site-chat/src/widget.css`, a partially-applied light-mode fix.
Three `prefers-color-scheme` references remain. It was asked to either finish or revert to
`a5dcd29` and push — **check `git status` and the remote before assuming either.**

### Three owner requests NOT done

1. **Force light mode.** The widget honors `prefers-color-scheme: dark`; the public site's theme is
   fixed light (`--bg: #FFFFFF`, no dark handling anywhere). On a dark-OS visitor the page stays
   white and the chat goes dark. **Drop the dark block entirely** — do not add a toggle, the host
   page has no dark concept. Verify with `browser.newPage({ colorScheme: "dark" })`, or the fix
   silently passes on a light test browser.
2. **"New thread" needs a confirmation.** It currently wipes the transcript with no undo. Inline
   two-step in the header preferred over `window.confirm()`. Only confirm when there is a transcript
   to lose. **Open question:** whether `ChatPane` exposes a header slot or interceptable `onReset` —
   unverified. If it requires forking `@jini-ai/chat`, escalate.
3. **FAB icon must match the admin's.** Package `ChatFab` renders a **text emoji**
   (`{open ? '×' : '💬'}`, `ChatFab.tsx:49`); admin renders an SVG sparkle. `ChatFabProps` is
   `{open, onToggle, label}` — **no icon override**, so this cannot be done app-side.
   **Authorized:** add an optional icon prop to `@jini-ai/chat`'s `ChatFab`, purely additive, emoji
   remaining the default for other consumers. Then pass the admin's SVG verbatim.
   ⚠️ Copy the markup at **20×20**. It was previously authored at `width="50"` inside a 56px flex
   button and rendered a squashed 23.6×50 slab (fixed this session, `dd22881`). `.chat-fab > svg
   { flex: none }` exists for that reason.

---

## Also landed this session

- **Both re-export shims deleted** (`e182e09`) — `identity/index.ts`, `core/commands/command.ts`.
  Had 3 importers, not the 2 the prior handoff estimated.
- **`@jini-ai/ui` was an undeclared dependency** (`cd55427`) — the agent daemon crashed at import
  with `Cannot find module '@jini-ai/ui/mcp-ui/surfaces'`. **The subpath and its build output
  existed all along**; only the consumer-side declaration was missing. A Coordinator diagnosis that
  blamed missing code in Jini was wrong and was corrected by another session.
- **`ollama-chat.ts` doc corrected** (`f13f92c2`) — it claimed "Ollama has no call-id concept on the
  wire". False, verified against `ollama/ollama` `api/types.go`: `Message` declares both `ToolName`
  and `ToolCallID`, `ToolCall` carries `ID`. Only OpenAI's `type` discriminator is genuinely absent.
- **`ChatFab` icon squash fixed** (`dd22881`) — rendered 23.6×50 in a 56px button.

## Open items on the visitor assistant

1. **Rate limiting — NOT built.** Deferred by the owner (correctly: it protects nothing locally).
   **Required before any public exposure** — an anonymous endpoint in front of a paid API is a
   cost-attack surface. `app.listen` binds all interfaces, so "it's only local" is not a guarantee.
2. **992 KB bundle**, no code-splitting, on every public page. `defer` keeps it off first paint.
3. **No cross-turn memory** — the route has no history param, so each message is standalone. The
   transport sends only the latest turn rather than faking a transcript.
4. **ADR-054's unresolved question:** do logged-in admins see the visitor assistant or the admin
   one? No login-state check exists.
5. **`site.assistant.public_enabled` is currently ON** (workspace scope). Default is off. Turn it
   off when not testing.

## Wider worklist (unchanged from the prior handoff)

1. **E2E tests** — the owner's oldest outstanding ask, deferred three times now.
2. **Merge `refactor/admin-react-to-ui`** — last unmerged cloud branch, both repos.
3. **vibecoding `./node` → `./react`** — dispatched to the cloud, unverified at handoff.
4. **Attachment security claims** — dispatched to the cloud, unverified at handoff. Two code
   comments assert security properties that were never tested.
5. **Lock the architecture baseline?** `check:architecture` says ahead of baseline.
6. Admin's `ChatFab.tsx` duplicates a component `@jini-ai/chat` already exports — possible cleanup,
   but diff the drag/persistence behavior before claiming equivalence.

## Cloud dispatch — how it actually works here

**"Cloud task" means the `RemoteTrigger` tool.** `Agent` with `isolation: "remote"` runs **locally**
in a `.claude/worktrees/` worktree — the opposite of what is wanted. This cost real time this
session.

Working create body and env id are recorded in `feedback_cloud_means_remote_trigger.md`. Two briefs
are committed at `ADS-memory/reports/dispatch/`; the trigger message just points at the file, since
briefs exceed the tool's inline input limit.

**Both cloud briefs now carry a mandatory setup block**, because two facts break every cloud build
silently: Tovu declares **10 deps as `file:../Jini/packages/*`** (needs a sibling checkout named
exactly `Jini`), and **Jini's `dist/` is gitignored** so a fresh clone has no build output at all.

---

## Traps worth not re-learning

- **The mechanism can be perfect and the input wrong.** Three times this session: image transport
  verified across four providers that the product never calls; a tool surface built against a table
  with no content; a bundle that delivered correctly and never executed. Each was "verified" by a
  check that could not have caught the failure.
- **"Tests pass" ≠ "it works" for anything a browser runs.** 80/80 green, curl 200s, and correct
  HTML all coexisted with a bundle that threw `ReferenceError: process is not defined` on load and
  never mounted. For a browser deliverable, verification means a browser executed it: assert the
  mount node has **children**, not that it exists.
- **`grep` on a guessed path proves nothing about the code.** Concluded `@jini-ai/ui/mcp-ui/surfaces`
  did not exist by `ls`-ing directories named after the subpath. The export map pointed elsewhere
  and the files were there. Print export map **values**, not `Object.keys()`.
- **Two React copies from `file:` links.** `@jini-ai/chat`/`@jini-ai/ui` resolve into the sibling
  Jini checkout, which has its own nested React (19.2.7 vs the app's 19.2.8) — a null-`useRef`
  crash that only appeared once an earlier crash was fixed. Fixed with `resolve.alias` + dedupe.
- **Vite `build.lib` does not auto-inject `process.env.NODE_ENV`** the way app builds do, and
  react-dom ships CJS with an unguarded reference. Needs an explicit `define`.
- **A subagent's completion report can be wrong on a security-relevant claim.** One reported
  restoring a setting it had not restored. Verify state, do not read reports.
- **`SendMessage` can silently not deliver.** An agent reported "Tasks 1–3 complete" and went idle
  while a break I had messaged about was unfixed. **Diff a completion report against every
  correction sent; a missing item is the tell.** Resend with full state inline and require a
  paraphrase.
- **`req.on("close")` on a POST fires when the body finishes reading**, not on disconnect. Wiring an
  abort there cancels every request before the model emits a token. Use `res`, guarded by
  `writableEnded`.
- **`GEMINI_API_KEY` in `~/.bash_profile` needs `export`** or no child process sees it. Start dev
  servers from a login shell (`bash -lc 'npm run dev'`).
- **Gemini free tier is ~20 requests.** A 429 with `retry in Ns` is quota, not a bad key — check
  auth separately with a models-list call, which does not consume generate quota.

## Handoff Contract

- **Inputs used:** git state in both repos; `npm run typecheck`; scoped `node --test` runs; direct
  `sqlite3` reads of `infra/content.db`; live Gemini API calls with a real key; real-Chromium
  Playwright runs against both the admin and the public site.
- **Output summary:** a fresh session can finish the three outstanding UI fixes and the open
  hardening items without replaying any of this session's investigation.
- **Risks:** one uncommitted subagent file; two cloud jobs dispatched but unverified; a second human
  session shares both trees; the public assistant switch is currently ON.
- **Suggested next assignee:** Coordinator.
