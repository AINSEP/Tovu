# Handoff: image capability landed on the wrong transport; vibecoding gained two tiers

Generated: 2026-08-03, later than `2026-08-03-handoff-vibecoding-and-merges.md`, which it supplements
rather than replaces (that file's vibecoding background and reference-implementation table still stand).
Source: Coordinator (Review Mode), Claude Code / Claude Opus 5 (1M), repos `Tovu` + `Jini`.

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this file, then
> `ADS-memory/reports/refactors/2026-08-03-image-send-capability.md` end to end. Both repos are on
> `refactor/jini-admin-extraction`. **Read the "READ THIS FIRST" section of the image-send report
> before doing anything with images** — it records that the five provider adapters, though correct
> and green, are not on the transport a user's dropped image actually travels.
> A second human session works the same Tovu tree; run `git log` and `git status` first.

---

## State

| repo | branch | HEAD | tree |
|---|---|---|---|
| Tovu | `refactor/jini-admin-extraction` | `18890f1` | dirty — see below |
| Jini | `refactor/jini-admin-extraction` | `e9b9fbd83` | dirty — ALL of this session's Jini work is UNCOMMITTED |

**Nothing is pushed. Neither `main` is updated.** Deliberate — the user wanted local verification first.

### Uncommitted and at risk

**Jini — this session's entire output, all green, none committed:**
- `packages/agent-runtime/src/providers/{anthropic-messages,openai-chat,azure-chat,google-messages,ollama-chat}.ts` + their tests
- `packages/http-kit/src/__tests__/model-proxy.test.ts` (2 new integration tests; `model-proxy.ts` itself deliberately untouched)
- `packages/vibecoding/src/core/history.ts` + tests, `packages/vibecoding/src/html/{regions.ts,index.ts}` + tests, `package.json`
- Plus whatever the two in-flight agents have (see "In flight")

**THE OTHER SESSION IS IN THE JINI TREE TOO — not just Tovu.** Measured at handoff time:
`packages/cms/src/{entries,content-types,taxonomy}/repo.memory.ts` are modified in **Jini** and belong
to their outbox-bridge investigation (`NOT NULL constraint failed: outbox_events.workspace_id`), not to
any agent in this session. This invalidates the earlier assumption that Jini was exclusively ours.

Their Jini paths (`packages/cms/**`) and ours (`agent-runtime`, `daemon`, `http-kit`, `vibecoding`) do
**not** currently overlap, so a path-scoped commit is still safe — but name paths deliberately and
re-check `git status` first. Do not sweep directories. See the `18890f1` contamination below for what
happens when a path you touch also holds someone else's edits.

**Tovu — belongs to the OTHER session, do not touch:** `apps/admin/src/sections/{FormEditor,Media}.tsx`,
`apps/admin/src/styles.css`, `src/server/http/admin/widgets.ts`, `src/server/routes/admin/widgets/*.ts`,
`package.json` (a `check:outbox-bridge` script), `src/widgets/deps.ts`, ADR-052/ADR-053, two recon reports,
`SeeMore.tsx` and friends.

---

# THE FINDING THAT MATTERS MOST

**The five provider adapters are not on the path a user's image travels.** They were built on the
direct-provider BYOK route (`/api/proxy/*/stream`). Tovu's admin assistant does not use it:

- `grep -rn "api/proxy" src apps/admin/src` → **zero hits**.
- `src/server/routes/admin/assistant/deps.ts` calls the assistant *"a reverse proxy in front of the
  agent-daemon process"* — the **CLI-agent/daemon path**, where `defs/claude.ts` discards `_imagePaths`.

The adapter work is still correct and still wanted: the direct-provider route is the right home for
the **vision self-check loop** (renderer → tool result → model, no user upload involved), and for any
future BYOK chat surface. But it does not make "drop an image into the admin chat" work.

**Lesson, recorded because it cost most of a session:** an unverified assumption about *which path the
product uses* outranks any amount of verified detail about a path it does not. The recon listed the
frontend as unverified/out of scope; four tool calls would have settled it at the start.

---

## Done and verified

### Image transport — all five providers (Jini, uncommitted)

`agent-runtime` **1926/1926** package-wide, typecheck clean; `http-kit` **83/83**.
Full detail in `2026-08-03-image-send-capability.md`. Three mechanisms, not one:

| provider | mechanism |
|---|---|
| Anthropic, Ollama | **native** — image rides in the tool result itself |
| OpenAI, Azure | **workaround** — labeled synthetic `user` turn after ALL tool messages |
| Google | **workaround** — labeled `inlineData` folded into the same `functionResponse` Content |

Proven on the wire with a real 201KB screenshot via a reusable probe (see "Tools left behind").

**Still unverified, needs a live smoke test before the self-check loop ships:** whether Gemini
actually honors an `inlineData` part folded into the same `Content` as a `functionResponse`.
Structurally legal, undocumented. Do not resolve by guessing.

### `@jini-ai/vibecoding` — two new tiers (Jini, uncommitted)

**49/49 tests, build clean, no new `npm run guard` violations.**

- **`/core` history** (`src/core/history.ts`) — operation-level undo/redo over `snapshot`/`restore`,
  adding **no verb** to `EditTarget`. Three decisions: undo/redo **bypass `validate`** (a multi-part
  rewind passes through intermediate states that never existed as committed states); a snapshot
  restore is recorded as an ordinary transaction so a mis-aimed rewind is itself undoable; a
  transaction that throws still commits its partial entry. Known limit, documented and tested:
  **undoing a creation cannot remove the part** (upsert, no delete verb) — it writes empty content
  and records `existedBefore: false`.
- **`/html`** (`src/html/regions.ts`) — the Pages adapter. Parts are tagged regions of one document.
  - Addressing reuses **`data-agent-element`** and its handle grammar. D-5's `data-tovu-id` is dead.
  - **Security property:** `validate` refuses any candidate that changes the handle **multiset**,
    because a model that can write `data-agent-element` into a region it may edit grants itself a new
    addressable part at the next `listParts()`. One comparison catches invented, deleted and
    duplicated handles.
  - **Writes are byte-preserving outside the edited region** (splice across inner offsets) — sidesteps
    D-REV-4's Onlook reformatting risk entirely.
  - **The HTML parser is an injected port**, not a dependency: no parser exists anywhere in Jini and
    the package is `"runtime": "universal"`. No dependency decision has been forced yet.
  - Deliberate contract deviation: `replacePart` is **not** an upsert here.

### Tovu shim removal (committed, `18890f1`)

3 of 5 shims removed, 206 files. `core/ports` (137 true importers), `core/tools/registration-kit` (16),
`core/commands/change-set` (9 — the handoff estimated 1). Typecheck clean; **2778/2783 scoped tests**,
the 5 failures all pre-existing and pre-flagged.

`identity/index.ts` and `core/commands/command.ts` survive with **exactly one importer each** —
`src/server/http/admin/widgets.ts`, the other session's live file. Two-line cleanup once they're done.

**`18890f1` is contaminated, and it is the Coordinator's fault, not the agent's.** It swept in ~50
lines of the other session's outbox-bridge work across five `src/widgets/*.ts` files. The instruction
"commit only files you rewrote, by explicit path, never `git add -A`" is **insufficient** — per-path
staging captures another session's edits inside a file you touch. Nothing was lost (their work went
*into* a commit, the safer failure direction) and typecheck is clean. Recommendation on file:
**do not rewrite history** on a branch a live session is using, to fix a cosmetically wrong message.

---

## In flight — two Sonnet 5 subagents

Both dispatched with `model: "sonnet"`. Note: the Agent tool has **no effort parameter**, so despite
the user asking for xhigh, they inherit session effort — worth knowing when judging their output.

1. **`anthropic-vision` — COMPLETE (uncommitted).** Images now reach the `claude` CLI.

   **New file `packages/daemon/src/image-prompt-delivery.ts`** — three pure functions. The important
   one is `applyImagePromptDelivery(imageDelivery, prompt, imagePaths, extraAllowedDirs)`: a SINGLE
   gate that returns its inputs **completely unchanged — same string, same array reference** — unless
   the def is `'prompt-path'` AND images are present. One gate rather than a check duplicated per call
   site is what makes `'native'` defs *provably* unaffected.

   Wired into `agent-executor.ts` at one place, its output replacing `input.prompt`/
   `input.extraAllowedDirs` at exactly 4 downstream sites (`checkPromptArgvBudget`,
   `preparePromptFileForAgentFn`, `buildArgs`, and — the one that matters — `writePromptToStdin`).
   The two ACP/pi-rpc `wire*Lifecycle` sites were **deliberately not edited**, so no code path exists
   by which augmentation could reach them; a regression test asserts it anyway.

   `defs/claude.ts` needed **exactly one line**: `imageDelivery: 'prompt-path'`. Its existing
   `--add-dir` logic needed zero changes — the widened `extraAllowedDirs` arrives already merged.

   **New `RuntimeAgentDef.imageDelivery`**: `'native' | 'prompt-path' | 'unsupported'`, with
   `undefined` meaning *not yet audited* and never conflated with `'unsupported'`. It superseded a
   dead `supportsImagePaths?: boolean` that was **never read anywhere** outside its own tests —
   verified before removal, so a clean supersession rather than a behavior change.

   **THE DOUBLE-DELIVERY HAZARD WAS BIGGER THAN THE COORDINATOR'S BRIEF SAID.** The brief named three
   native forwarders (`qoder`, ACP `buildPromptBlocks`, pi-rpc). In fact `wireAcpLifecycle`
   (`agent-executor.ts:~1784`) is shared by **all 9 `acp-json-rpc` defs** — `devin`, `hermes`, `kilo`,
   `kimi`, `kiro`, `reasonix`, `trae-cli`, `vibe`, `amr` — each verified individually rather than
   inferred. **11 defs are now provably `'native'`.** Acting on the briefed "three" would have
   double-delivered to six.

   Left `undefined` (not audited, NOT claimed unsupported), 12 defs: `amp`, `antigravity`, `codebuddy`,
   `codex`, `copilot`, `cursor-agent`, `opencode`, `mimo`, `aider`, `deepseek`, `qwen`, `grok-build`.
   Adopting `'prompt-path'` for any is one line on the def, no daemon change.

   **Tests:** defs `371/371`; registry/index `14/14`; whole `daemon` package `536/536` — including a
   new `image-prompt-delivery.test.ts` (12 tests: strict reference-equality no-op at zero images,
   paths with spaces and quotes preserved verbatim, dir dedup) and 5 new `agent-executor` tests
   proving the augmented prompt reaches the **actual stdin write**, that a `'native'` def with images
   leaves `buildArgs` untouched, and that ACP receives the raw unaugmented prompt. Both `tsc` builds
   clean. 17 files modified + 2 new, +246/−12.

   **No escaping needed for paths with spaces/quotes:** there is no `shell: true` anywhere in the spawn
   path, so a path is a plain array element to `spawn` and plain text inside the prompt. Tested both.
2. **`openai-google-vision` — Phase 1 done, PHASE 2 PRODUCED NOTHING.** Confirmed by measurement, not
   by its report: `git status` on all four target files (`AssistantDock.tsx`, `assistant-transport.ts`,
   `src/server/modules/assistant.ts`, `agent-daemon-server.ts`) is **empty**. No code was written.

   **Coordinator error worth knowing about:** it was sent a GO for Phase 2 with five constraints, and
   then minutes later — when the restart was called — a "do NOT start anything new, report status"
   message. Two contradictory instructions in one inbox. **Do not try to resume this agent's Phase 2
   across the restart.** Re-spawn fresh with the whole brief inline: the Phase 1 trace below plus the
   five constraints below are everything needed, and a spawn prompt is the only channel that reliably
   lands at t=0.

   Its Phase 1 trace, recorded next, is the valuable output and is complete.

### The Phase 1 trace — act on this, do not re-derive it

**The attachment mechanism already exists, fully built.** An earlier claim in this session that it did
not was **wrong**: it grepped `packages/chat-react/src`, a directory that does not exist, with stderr
suppressed, so "no such directory" read as "no matches."

Real path: `@jini-ai/ui/chat` → `packages/ui/src/react/chat`.
- `Composer.tsx:83-99` — real `type="file"` input + "Attach files" button
- `hooks/useChatPaneFileDrop.hooks.ts` — real drag-and-drop
- `features/chat-pane/create-daemon-attachment-uploader.ts` — ready-made uploader (quotas, bounded
  concurrency, rollback)
- `hooks/useChatPane.hooks.ts:260-276` — already forwards attachments into `startRun` as
  `input.attachments` (`chat-core/src/transport.ts:59`)
- `ChatPane.tsx:216-233` — **the entire gate** is whether the host passes `uploadAttachments`

**No change to `@jini-ai/ui` is needed.** The four breaks are all Tovu-side wiring:

1. `apps/admin/src/components/AssistantDock.tsx` — never passes `uploadAttachments`
2. `apps/admin/src/lib/assistant-transport.ts` (~190-221) — `startRun` drops `input.attachments`;
   POST body is only `{contextRef, agentId}`
3. `src/server/modules/assistant.ts` (144-177) — no proxied `/api/attachments` route
4. `src/assistant/agent-daemon-server.ts` — never mounts `registerAttachmentRoutes`/
   `createDiskAttachmentStore`; `onStarted` (284-350) never claims, never passes `imagePaths` to
   `agentExecutor.run()` (337-343), despite that field being first-class (`agent-executor.ts:519`)

`http-kit`'s `attachments.ts` is production-quality and **completely unreferenced by any product**:
the only `.claim()` caller and only `registerAttachmentRoutes` mount in either repo is
`examples/reference-web/src/daemon.ts:589`.

**Documentation defect:** `attachments.ts`'s module doc (~line 49) shows `attachmentRefsFrom(context.request)`
as the canonical pattern. **That helper does not exist**, and `RunCreateRequest` (`runs.ts:37-41`) has
no attachments field. Refs must ride inside `contextRef`'s JSON blob.

### API details needed to actually write Phase 2

Captured here because the agent that found them has been stopped and these existed only in its report:

- **The uploader**: `createDaemonAttachmentUploader(baseUrl)` returns a ready-made `uploadAttachments`
  implementation that POSTs to `` `${baseUrl}/api/attachments` ``. Its own doc says the one-line
  wire-up is the whole of composer drag-and-drop plus the file picker.
- **The two host props** on `<ChatPane>`: `uploadAttachments` (the gate) and `attachmentAccept`
  (`types.ts:150`) — a MIME-filter string for the file picker, e.g. `"image/*"`.
- **`registerAttachmentRoutes`** lives at `attachments.ts:897`; it is what mounts `/api/attachments`.
- **The intended claim→imagePaths pattern**, from `attachments.ts:43-64`'s own module doc:
  `store.claim(refs, run.id)` → `imagePaths: claimed.attachments.filter(a => a.kind === 'image').map(a => a.path)`
  on `executor.run()`.
- **`agent-daemon-server.ts` is 434 lines** and already mounts `registerRunRoutes`, `registerAgentRoutes`,
  `registerDelegatedToolRoutes`, `frontendControl.httpExtension` and `registerToolCatalogRoutes` — that
  list is where an attachment-routes mount belongs, alongside them.
- **Demo-only callers** proving the mechanism works end to end today, useful as a working reference:
  `examples/reference-web/src/attachment-uploader.ts:16` constructs the uploader; `App.tsx:168`,
  `McpUiLab.tsx:134`, `WebMcpLab.tsx:424` and `AgentLab.tsx:410` pass it as `uploadAttachments=`.

### The agent's own Phase 2 sketch — approved as the shape, never built

1. `AssistantDock.tsx`: pass `uploadAttachments={createDaemonAttachmentUploader(...)}` plus
   `attachmentAccept="image/*"`.
2. `assistant-transport.ts`: fold `input.attachments` into `contextRef` as opaque ids (the same channel
   `prompt`/`principalId`/`frontendBindToken` already use — there is no dedicated field, see the
   documentation defect above).
3. `agent-daemon-server.ts`: mount `registerAttachmentRoutes` + `createDiskAttachmentStore`; in
   `onStarted`, decode the ids, call `.claim()`, pass `imagePaths`/`extraAllowedDirs`/`uploadRoot` to
   `agentExecutor.run()`, clean up in `finally`.
4. `src/server/modules/assistant.ts`: add a proxied `/api/attachments` route matching the existing pattern.

This flow stays `claim()`-gated — opaque ids until server-side re-validation — so it does not route
around the trust boundary.

**Open question nobody answered:** what happens to a non-image that slips past `attachmentAccept`
(a renamed file, or a drag-drop bypassing the accept filter). `detectAttachmentKind` sniffs magic bytes
rather than trusting the client, so it *should* degrade to `kind: 'file'` rather than being smuggled
through as an image — but this was never verified. Verify rather than assume.

### Constraints issued for Phase 2 — carry these forward

1. **Auth is non-negotiable** — proxied `/api/attachments` behind `getAuthedPrincipal`. An open upload
   endpoint is an arbitrary-file-write primitive.
2. **Upload root resolves against the site install dir, not `process.cwd()`** — previously-fixed bug
   with a live regression test (CR-R01 in `serve-command.integration.test.ts`).
3. **Scope storage per workspace** (multi-workspace `content.db` is normal here) and wire `cleanupRun`.
4. **The two agents interlock at `agentExecutor.run()`** — Tovu supplies `imagePaths`/`extraAllowedDirs`/
   `uploadRoot`; the daemon agent consumes and augments the prompt. If both touch the prompt, the image
   is delivered twice.
5. **Do not commit** — shared tree.

---

## Open decisions for the user — all still unanswered

1. **Commit the Jini work?** Four adapters, two http-kit tests, three vibecoding files. All green, all loose.
2. **Lock the architecture baseline?** `check:architecture` says *"OK, and ahead of baseline. Run with
   --update to lock in the improvement."* Current: propagation cost 8.78% (baseline 10.23), back-edges
   24 (28), largest SCC 30 (33), API surface 185 (211), core size 10.50% (12.29). **Caveat: these are
   baseline-vs-current, NOT before-vs-after the shim removal** — the handoff recorded 28→24 *before*
   this session. The shim work's isolated contribution was never measured. Against locking now: the
   other session is mid-refactor and the number will move again.
3. **`18890f1`'s misleading commit message** — recommendation is to leave it.

---

## Traps worth not re-learning

- **`grep ... 2>/dev/null` on a path that does not exist returns "no matches", not an error.** This
  session concluded a whole subsystem was missing on exactly that basis, and reported it as a blocker.
  If a grep of a *directory* returns nothing, verify the directory exists before concluding anything.
  (The prior handoff already warned that an empty symbol search is evidence about names, not
  capability. This is the same error one level up.)
- **Per-path `git add` still captures another session's edits inside those paths.** "No `git add -A`"
  is not sufficient protection on a shared tree. To commit only your own hunks you need explicit
  path+hunk control, or the other session commits first.
- **A rejected option may have been rejected on an untested premise.** The recon avoided the CLI path
  because it would mean speaking N per-CLI protocols. One experiment refuted that: piping
  `Tell me what this image is as best you can: /tmp/probe-image.png` into a live `claude -p` produced
  an accurate description — the CLI reads the file itself. It **first refused** the same path under
  `/Users/la/Desktop` as outside its allowed directories, which is why the `extraAllowedDirs` half is
  real and necessary.
- **`SendMessage` latency can exceed an entire task.** An agent finished three adapters and filed a
  full report opening "no response came back on the earlier design-call flag", then acked both
  corrections afterwards. **Diff a completion report against every correction you sent; a silently
  missing item is the tell.** Measure (`git status`) before nudging, and carry full state inline on a
  resend — an agent that never got a message cannot go looking for it.
- **Estimates in a handoff are estimates.** Shim importer counts were off in both directions;
  `change-set` was 9× its estimate. The agent wrote a resolver-based audit script instead of grepping.

---

## Tools left behind

- **`ADS-memory/.local-artifacts/tools/image-wire-probe.mjs`** — copied out of the session scratchpad
  so it survives the restart (gitignored, so local-only). Pushes any real image file through all four provider tool-loops with
  `fetch` stubbed and reports exactly where the bytes land in each outbound request body. Usage:
  `node image-wire-probe.mjs /path/to/any.png`. No API key needed, nothing leaves the machine.
  It proves transport and encoding, **not** model comprehension.
- For a real end-to-end BYOK test you need a provider key — none is present in the shell env or in any
  `.env` in either repo. Cheapest real vision test: `ollama pull llava` + point the adapter at
  `http://127.0.0.1:11434` (free, local, no key, and a genuinely native tool-role image path).

## Remaining worklist (beyond the two in-flight agents)

1. **E2E tests** — still the user's oldest outstanding explicit ask; nothing covers it. Deferred twice.
2. **Merge `refactor/admin-react-to-ui`** — the last unmerged cloud branch, both repos.
3. **Delete the last two shims** once the other session releases `src/server/http/admin/widgets.ts`.
4. **vibecoding `./node` adapter**, then `./react`, then the self-check tier (which needs the asymmetry
   absorbed behind the seam — decided, not built).
5. **Reconcile ADR-052** against `2026-08-03-tovu-runner-recon.md`.
6. `ollama-chat.ts`'s doc claims Ollama has no call-id on the wire; the real Go `Message` struct has
   `ToolCallID`. Flagged, unfixed.

## Handoff Contract

- **Inputs used:** git state in both repos; `npm run typecheck`/`test`/`check:architecture` in Tovu;
  scoped package tests in Jini; direct source reads across `agent-runtime`, `http-kit`, `daemon`,
  `chat-core`, `ui/react/chat`, `vibecoding`, and Tovu's assistant routes; a live `claude -p` image
  probe; a stubbed-fetch wire probe over four adapters with a real 201KB PNG.
- **Output summary:** a fresh session can resume the CLI-path image work, the Tovu attachment wiring,
  and the vibecoding build without replaying this session.
- **Risks:** all Jini work is uncommitted; two agents may still be mid-edit; a second human session
  shares the Tovu tree; `18890f1` contains work that is not ours.
- **Suggested next assignee:** Coordinator.
