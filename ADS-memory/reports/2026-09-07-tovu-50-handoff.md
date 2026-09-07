# Handoff — session tovu-50 → tovu-20, 2026-09-07 ~00:30 PDT

## STATE: nothing is running. All work below is committed. No uncommitted agent work exists.

## WHAT SHIPPED THIS SESSION (4 commits, every claim verified by me against source/git/db)

- `af46b0ad` (repo **Jini**, branch `general-work`) — **J01**: interrupted identity seed permanently left the
  owner with no role link. `seed.ts:334` returned early once the owner *user* existed, but the role link is
  written later (~`:431`), so a death in between bricked the site for its owner forever and the "resumable"
  seed never repaired it. New `ensureOwnerRoleBinding` makes completion mean "user AND role link".
  Design point worth preserving: it fires on *"principal holds NO role at all"*, not *"lacks the owner role"* —
  the broader gate would silently re-escalate a deliberately demoted owner to wildcard on every restart.
  RED proven (1 failed → 8 passed). Two sibling tests pass before AND after; they constrain shape, not RED.
  Residual, NOT fixed, pre-existing: an interrupt between `principals.save` and `users.save` orphans a principal.
- `103f7ae1` — **MI-01/MI-02** media import. MI-01 was far wider than the audit said: a lossy UTF-8 decode
  expands image data ~1.81x, so EVERY complete image from ~6.94 MiB to the 10 MiB limit was falsely refused
  with "exceeds the import limit". New optional `bodyBytesTruncated`; `bodyTruncated` keeps its meaning so no
  existing consumer changes. All 13 `bodyTruncated` sites checked individually — `fetch-image.ts:284` is the
  only production reader. MI-02 fixed by propagating `finalUrl`.
  **Deliberate behavior change needing Leona's ruling:** on a redirect the default stored *filename* now
  follows the final hop, not the requested URL. That is what the contract claimed, but it is user-visible.
- `f682eff2` — **chat runs dying**. See below; this one overturned a premise Leona had been operating on.
- Fable audit reports (see AUDIT RESULTS).

## THE CHAT-DEATH FINDING — a premise correction, read this before trusting older handoffs

**Runs that die are recorded as `succeeded`.** I independently confirmed the shape in the live DB:
`ai_chat_messages` holds rows with `run_status='succeeded'` and zero content (`2a5fbd7d…`, `f38e1666…`).

- **H1 — "the daemon is a child of the tsx-watch API, so saves under `apps/website/src` kill it" — mechanism
  CONFIRMED but REFUTED as the cause.** API pid 17655 and daemon pid 17890 were alive continuously through
  the 23:23:54 death; a respawn would have made new pids. **tovu-14's handoff named this as the leading
  candidate. It is not the cause.** Do not re-inherit it.
- Actual causes, all fixed additively in `f682eff2`: the agent CLI's `stderr` was emitted as a named SSE
  event with no listener (EventSource silently drops those); the `end` listener read `reason`, a field
  `RunEndPayload` does not have, so a run the daemon had classified `failed` arrived as a normal completion;
  nothing durable ever logged how a run *ended*.
- **`development/.dev-server.log` is not written by any code** — it exists only when a human redirects stdout.
  It was last touched Sep 5 21:28. `development/todos.md:166` claims otherwise and is WRONG. The previous
  session's entire diagnostic method rested on that file.
- **Open decision for Leona:** whether a failed run should actually persist `run_status='failed'`. One line.
  Deliberately not done — it changes what the product writes down.

## AUDIT RESULTS — three Fable 5.1 lenses, all complete, all committed

| Report | Ledger | Notes |
|---|---|---|
| `ADS-memory/reports/2026-09-06-fable-audit-bugs.md` | 86 read / 4 / 153 skipped = 243 | 7 NOTREACHED (below) |
| `ADS-memory/reports/2026-09-06-fable-audit-security.md` | all 243 accounted | 0 not-reached |
| `ADS-memory/reports/2026-09-06-fable-audit-architecture.md` | 160 / 83 / 0 = 243 | complete |

Also on disk, **UNCOMMITTED, left for review**: `ADS-memory/reports/codex-audit/` — a codex `gpt-6-astra`
audit, 15 findings. It stopped on a **usage limit, not completion** (quota back 8:41 AM), so its `00-progress.md`
still has `pending` rows. The Fable lenses verified its claims and **refuted none of them** — good calibration
signal for that report.

## THE WORKLIST — ~23 behavioural bugs + ~10 structural. Leona approved 3 Opus 5 agents on these clusters.

I had NOT yet spawned them when she moved to your session. Suggested split, chosen for zero file overlap:

**AGENT A — the `expectedVersion` cluster. Highest value on the board: one fix closes four findings.**
- C01 CONFIRMED **High** — `post.ts:974` compares, then two awaits (`assertSlugAvailableForUpdate`,
  `runBeforeSaveHook` — arbitrary plugin latency), then `repo.sqlite.ts:167-190` `save()` upserts on
  `posts.id` with NO version predicate. Two concurrent PUTs with `expectedVersion: 7` both 200; one erases
  the other. The doc comment at `post.ts:907` calls it compare-and-set. It is compare, then unconditional set.
- C02 CONFIRMED Medium — `routes/pages/update.ts:23-33` never forwards `expectedVersion`. Reach is external
  API only; PageEditor saves via `/posts/:id`. One arm fixed, sibling left.
- SEO-01 Low — `setEntrySeoOverrides` is a third compare-less version bump.
- arch 4.15 — same column, three arms, three behaviours.
- **The correct primitive already exists in the same file**: `writeAutosave` uses
  `eq(posts.version, snapshot.baseVersion)` + `changes===0 → applied:false`. `save()` never got the predicate.
  Fix = version-predicated save → `PostVersionConflictError`, forwarded by the pages route.

**AGENT B — desktop lifecycle (`apps/desktop/*.cjs`). Contains 2 Highs.**
- D-05 **High** — `handleDelete` never enters `deps.serializer` (only `handleStart` does), and `main.cjs:569-576`
  publishes `openSites` only after the ≤60s boot → Delete `rm`s under a booting `tovu serve`.
- D-04 / SEC-01 — **severity disagreement to resolve first**: the bugs lens rated it Low ("code shape"),
  security rated it **High** with a traced path — `project-delete-guard.cjs:104-108` + `project-ipc.cjs:164-166`
  authorize `fs.rm` on a path-keyed row's origin/containment only; the live directory (markers, inode,
  workspaceId) is never checked, so a moved site + reused path erases a replacement site the app never created.
  Security's read looks stronger. Settle it before fixing.
- D-01 Medium — one unreadable discovery candidate aborts boot (arch says wider than codex stated).
- D-02 Medium — hosted-DB choice accepted then silently dropped.
- D-03 Medium — webview failure listeners never attach after a normal Start.
- D-06 Medium — a crashed child stays "running"; Start reuses the dead handle.
- D-07 Low — a second desktop instance overwrites the first's crash-safety row.
- **Architecture's verdict: this is one state machine with no clear owner** (`main.cjs` is a 1,047-line
  composition root two agents edited blind, one gutted). Likely one rework, not six patches. Read arch §4.5
  and its lifecycle-ownership table before patching individually.

**AGENT C — admin / MCP / misc website.**
- ADM-002 Medium — restart mutation has no invalidates and the query has no polling/focus refetch, so the
  admissions banner permanently reports the previous daemon.
- ADM-001 Low/Medium — drift comparison is one-directional (omits new connections, removed live admissions).
- MCP-01 Medium — `refusalItems` never subtracts admitted, so the prefix tells the model an ADMITTED tool is uncallable.
- C03 Medium — `duplicateSite` leaves `config.json`/partial `content.db` in a pre-existing empty target;
  `validateInitTarget` accepts an empty dir and those writes never flip `wroteAnything`.
- SEC-05 Low — **the refusal-collapse Leona got bitten by**: egress/SSRF refusals are plain Errors from
  `platform/http/client.ts:242` that `media-import/tool-registrations.ts:120` does not classify, so they
  surface as a generic internal error.
- ESC-01 Low — commit `1044e2d5` claimed "every `escapeHtml` copy" and left `page-head.ts` without the
  apostrophe escape. (Arch found **nine** hand-rolled copies; that commit reached four.)
- DS-01 / PG-01 — **PLAUSIBLE only, verify before fixing.** DS-01: `e332ec33` treats cookie presence as
  session validity. PG-01: `schema.postgres.ts` did not get `autosave_json`.

## LOWER PRIORITY — security lens, all Low/Info
SEC-03 desktop-spawned `tovu serve` binds all interfaces (`serve.ts:259`, pre-existing, acknowledged in
`15548bef`). SEC-04 `TOVU_AGENT_DAEMON_TOKEN` reaches the child via env — the exact channel
`desktop-auth.cjs:22-24` rejects for the boot token; holding it = run tools as any principal id via
`contextRef`. SEC-06 `transport.fetch.ts` buffers to 100 MiB before the 12 MiB cap. SEC-07 admin
localStorage draft backup not cleared on logout. SEC-08 pre-window: own-server/attach `createWindow` hands
any-scheme `window.open` targets to `shell.openExternal` (`main.cjs:324-328`).

## STRUCTURAL (architecture lens) — real debt, nothing breaks tomorrow
Nine `escapeHtml` copies · `main.cjs` 1,047-line composition root · two server boot paths with a
hand-copied sequence · two site-dir marker classifiers with two vocabularies and two things called "adopt" ·
`CONTENT_DB_FILENAME` vs `CONTENT_DB_FILE_NAME` in the same directory, same night · `server/inbound`
importing `server/runtime/composition` (the missing layering rule) · four SSE-response-head copies ·
three accepted-image-type lists · autosave shared core with copied shell · `useSettlementGeneration` seam
correctly drawn but inventory incomplete (8 of 11).
Genuine negatives: layering otherwise clean, `agentHandle` consistently applied, AAD scripts consolidated well.

## PREMISE CORRECTIONS — things older handoffs assert that are now known FALSE
1. The daemon-child lifecycle is NOT what kills chats (above).
2. `development/.dev-server.log` is not produced by any code; `todos.md:166` is wrong.
3. The 4 orphaned Runner launchers hold **DEAD** credentials, not live ones — tokens are per-Runner-process
   and the 0700 token-baking path lives in `Tovu-Runner/src/main/runner-mcp-bridge.ts:225-254`, not in Tovu.
   **Nothing in Tovu writes a token to disk.** tovu-14's handoff listed this as an urgent decision. It is not.
4. Commit trailers misattribute the model — never cite one as evidence of which model wrote a commit.

## NOT REACHED by the bugs lens (7) — 3 are covered by other lenses or out of scope
`b27cdba4` (MenuEditor — off limits, Leona's own work), `4ede4562` / `2b69b327` (tests, out of scope this
pass), `6a0bd61c` (desktop preload IPC — **flagged security-lens, genuinely unclaimed**), `cb3789a9`
(gitignore closing a chat.db + db-snapshot leak — **unverified by anyone**), `0c1a1324` (composition root
registration), `10fb9215` (renderer build).

## LIMITS AND MACHINE STATE
- **Fable 5.1 hit the account WEEKLY limit at ~00:22 PDT; resets 4am.** The architecture lens finished first,
  so nothing was lost. Codex quota returns 8:41 AM.
- Reasoning effort is NOT settable via the subagent tool. Leona asked for xhigh; that needs a CLI run she drives.
- Load has been 5-7 all night. This box hit load average 613 against a ~721 crash point once — `uptime` first.
- **Mid-flight `SendMessage` to a running subagent often does not arrive.** Restart with corrected instructions
  instead; I lost a cadence change that way tonight and had to respawn all three auditors.
- Incremental commits work: the auditors committed every ~5 minutes and the weekly-limit kill cost nothing.
  Keep that cadence for anything long-running.

## STANDING RULES FOR ANY SPAWN (each cost real time)
Exact test FILE paths only, never a directory or glob. One test process at a time. `apps/website` tests run
from the repo ROOT; `apps/admin` is the inverse. No `index_repository` / codebase-memory MCP calls — an
indexer hit 3.88 GB and TaskStop does not kill it, and the graph is STALE. `grep` is **ugrep**: it silently
ignores `--include`/`--exclude` and skips NUL-byte files (`command grep -a`); prove a pattern CAN match before
believing a zero. **`timeout` does not exist on macOS.** Never read an exit code through a pipe. Never
`2>/dev/null`. **Never `pgrep -fl` or `ps eww`** — both dump live API keys. Migrations AUTO-APPLY on a normal
sqlite open — only ever `sqlite3 "file:<path>?mode=ro"`, and never open `sites/tovu-com/content.db` writable.
Shared git tree: `git add <explicit paths>` before `git commit -F <uniquely-named msgfile> -- <paths>`;
never `git add -A`, never bare `git stash`. RED test before any bugfix. Every subagent report is a CLAIM
until read against source.
