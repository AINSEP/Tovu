# Handoff — Higgsfield connected + discovery bugs (2026-08-26, evening)

Tovu `general-work` @ `04567478`
Prior handoff: `2026-08-26-handoff-discovery-and-layout-session.md` (`5b663af9`). This session starts there.

**Nothing running except one architect** (see §7). Dev server is up and owned by the owner's own terminal.
**26 dirty paths belong to two OTHER sessions** — untouched all session, do not touch.

---

## 1. The one thing to read if you read nothing else

**Higgsfield is connected for real, and it still cannot make an image — because Tovu forbids every external write tool, on purpose.**

`trust.ts` rule **R3** (`src/assistant/mcp-federation/trust.ts:70-74`), whose own comment calls it "the single most important line in the file":

> `destructiveHint: true` or `readOnlyHint: false` **REMOVES** an otherwise-allowlisted tool. `readOnlyHint: true` grants nothing.

Higgsfield honestly declares `generate_image` as a write. Tovu refuses it. The operator allowlist **cannot** override. Every *read* tool on the same list registered fine — the assistant diagnosed it itself: *"the read tools were enabled; the write tools weren't."*

**CORRECTION — the Coordinator got this wrong and the architect caught it. R3 does not block write tools. It blocks HONEST write tools.**

Both checks are `=== true` / `=== false` against an **optional** field (`trust.ts:275-279`). A remote publishing `annotations: undefined`, or `{}`, or `{title: "…"}` sails straight through. This is asserted as intended behaviour today — `mcp-federation.trust.test.ts:165-181` has two passing cases pinning exactly that.

So "no external MCP server can do anything that writes" is **false**. The true statement is narrower and worse:

> A server that **declares** its write tools is blocked. A server that stays **silent** about them is admitted — with no override, no marking, and no operator awareness that a write just entered the catalog.

Higgsfield is blocked because it is honest. A less scrupulous server would not be.

**This changes the design.** The override list is not only an unblock path for Higgsfield; it is the only place a *silent* write could ever be surfaced. Any design that adds the unblock and skips the surfacing leaves the bigger hole wide open.

R3 still exists for a good reason (`trust.ts:24-26`): stop a compromised server labelling `delete_everything` as read-only. **Do not remove it.** Task #31 + the outline at `ADS-memory/reports/pipeline/external-mcp-write-tools/implementation-outline.md` have the shape of the fix.

**Second load-bearing correction (C-2): Tovu DOES now have a human-confirmation transport.** `supabase-mcp-plugin.ts:99-103` says it does not, and that comment is stale — `src/core/tool-surface-exchanges.ts` is real, `ctx.emitSurface` is forwarded verbatim through the audit wrapper (`tool-executor-audit.ts:149-162`), and `content_post_delete` is the production tool using it today. The whole read-only posture rests on that file's reasoning. **Fixing the comment is in scope for Phase 1.** It also makes a per-call confirmation design possible — evaluated, deferred, not impossible.

**The owner's harder objection, which is the real work:** a normal person will never know these settings exist. Today you must type tool names by hand into a comma-separated box, with no way to learn the names, and getting it wrong produces **total silence** — no error anywhere. The Coordinator only learned Higgsfield's 85 tool names by reading daemon stderr.

---

## 2. A FOURTH discovery failure mode was found and confirmed — query formulation

The prior handoff named three (selection / registration / activation). There is a fourth, and it is upstream of all of them.

| Mode | Symptom | Example | Status |
|---|---|---|---|
| Selection | right answer ranks #1, agent uses #5 | `ui-ux-design` | UNSOLVED |
| Registration | never enters the catalog | Word Count | FIXED `905d5248` |
| Activation | registered but switched OFF | `site-compliance` | **FLIPPED ON this session** |
| **Query formulation** | **tool exists, registered, enabled, ranks fine — the agent never issues a query whose vocabulary could match it** | `skill_incident_response` | **NEW, unsolved** |

**Arm A (fails):** *"Our site went down for about 20 minutes this morning. What should I do now?"* → four queries, all asking WHAT HAPPENED (`retrieve recent server events`, `check current site health`, `list the audit log`, `list available datab…`). Never found the skill. 48s, $0.60.

**Arm B (succeeds, owner-run):** *"do we have anything having to do with incident response?"* → found and used it on the first search.

**The decisive detail:** `check site health` appears in **both** arms and surfaced nothing either time. The only query that worked contained the literal phrase "incident response". **Ranking never mattered; vocabulary overlap did.**

**Consequence for the backlog:** #22, #23 and #27 (integrations section, searchable panels, all-in-one search) would ALL have changed nothing in Arm A. They improve what comes *back*. This breaks before anything is *asked*. **Do not fund index work as a fix for this mode.**

---

## 3. What shipped — 3 commits, each re-verified by the Coordinator

| Commit | What |
|---|---|
| `b6e2f597` | **Saving an external MCP row no longer destroys its OAuth token.** Red-first: 2 fail → 41 pass. Coordinator re-ran independently. |
| `30bbe531` | **`capability_search`/`capability_get` removed** — 1,913 lines deleted, 9 files gone, 16 edited. Owner call. |
| `04567478` | **Phase 1B** — installed-skills composer capability source. 5/5 green. |

**Uncommitted but done and verified — Phase 1A, the skills route.** Owner has not yet said commit:
`src/server/http/admin/skills.ts`, `src/server/routes/admin/skills/{deps,list}.ts`, `src/server/modules/skills.ts`, 2 lines in `src/server/app.ts`, plus 2 test files. 9/9 pass, `tsc` exit 0, verified live by curl returning `skill_incident_response`.

---

## 4. Higgsfield — exactly where it stands

**CONNECTED.** `status: connected`, `clientId: DWjbUpAZxhRW2AgE`, scopes `openid email offline_access`, token valid 24h, refresh token present. Every previously fixture-only path worked against the real server first try: RFC 9728/8414 discovery, RFC 7591 dynamic client registration, PKCE S256, redirect via `clerk.higgsfield.ai`, token exchange, seal.

**Auto-refresh is real** — the daemon refreshes on its own, with a cross-process lease so web server and daemon cannot burn the same single-use refresh token twice. **No periodic re-sign-in needed.**

**How it was connected, because there is NO Authorize button:** saved the row, then `POST /api/admin/v1/workspaces/workspace-local/mcp-servers/higgsfield/oauth/connect` from the admin page's own JS console (session cookie reused), then opened the returned `authorizationUrl` for the owner to sign in. The UI offers only *Add server* and *Remove*.

**Allowlist currently set** (7): `generate_image, models_explore, job_status, jobs_wait, show_generations, reveal_generation, show_generation_by_ids`. Six register; `generate_image` is refused by R3.

**Higgsfield advertises 85 tools.** The full list is recoverable by booting the daemon with an empty allowlist and reading stderr. Dangerous ones deliberately excluded: `sandbox_exec`, `confirm_billing_purchase`, `website_secrets`, `deploy_website`, `publish_website`, `tiktok_publish`, `apps_invoke`.

**First attempt failed and cost a full round trip** — Chrome autofilled `"admin"` into the blank Client ID box when the row was clicked. Sign-in succeeded; token exchange failed on the wrong client id. Task #29.

---

## 5. Open work — the full list

### Needs the owner
1. **#31 — the write-tool override. Outline is DONE**: `ADS-memory/reports/pipeline/external-mcp-write-tools/implementation-outline.md` (50KB). **Read §0 first — four corrections, two load-bearing.** Seven owner decisions are queued in its §13, all with recommendations:
   - **D-1** — does the override cover `destructiveHint: true`? Recommends **no, not this slice** (keeps it to one predicate; additive later). Known real cost: a vendor that conservatively marks every write destructive stays fully blocked with no operator route.
   - **D-2** — build per-call confirmation on top? Recommends **not now**; ship the list, use it, then decide.
   - **D-3** — persist the probe result? Recommends **no in v1** — it is a cache of third-party data and belongs nowhere near the security table.
   - **D-4** — the restart button is `system.write`-gated but the tab is `admin.integrations.manage`-gated. Recommends **hide the button and explain who can restart**; widening the restart permission is the owner's call.
   - **D-5** — wire Jini's existing "Test" button? Recommends **yes**, one port method, already built and agent-driveable.
   - **D-6** — fix the stale `supabase-mcp-plugin.ts:99-103` comment in this slice? Recommends **yes**, folded into Phase 1 free.
   - **D-7** — restrict the v1 probe to `streamable_http`, skipping `stdio`? Recommends **yes** — it removes child-process spawning from the web server entirely, and Higgsfield is hosted.

   **Phases: 0 and 1 start together, 2 is 3-wide, 3 is 2-wide, 4 is UI. Peak concurrency 3.** Phase 1 is BLOCKING.
2. **Commit Phase 1A** (above). Verified, just needs the word.
3. **#17 — mobile sheet peek height, A or B.** Unanswered across two sessions. One number, one place (`--chat-sheet-peek`). A: shrink 58vh → ~35-40vh. B: collapse to a pill after each turn.

### Immediately actionable, no decision needed
4. **Phase 2 of the typeahead** — wire `createInstalledSkillsComposerCapabilitySource()` into `AssistantDock.hooks.tsx:601`; delete the inert `skill:ui-ux-design` entry at `composer-capabilities.ts:270-282`; add the i18n key; add the INV-001 regression test. **OWNER CORRECTION: the inserted pointer text must be ONE line, not six** — six lines does not fit the compose box. Phase 1B built six with a defensible reason (bridge discovery hops); make it one dense line instead.
5. **#18 — federated images never render inline.** `mcp-federation/registrations.ts:144-152` returns no top-level `content` array, so `extractResultMedia` (`@jini-ai/daemon/src/tool-result-media.ts:98`) finds nothing and the base64 is stringified and truncated at 64KB. Working shape already exists: `src/assistant/demo-image-tool.ts:88-97`. Fix is hoisting image blocks. **Blocks the owner's stated requirement for this whole surface.**
6. **#29 — autofill can corrupt an OAuth client id.** Needs `autocomplete="off"` on credential-shaped inputs, and the edit form must populate stored values rather than render blank.
7. **#30 — `PUT` silently discards an array `allowedToolNames`.** Returns 200, saves empty, no error. Same "registered but invisible" class. `put.ts:79` uses `asStringField`.
8. **The Authorize button** — `api.ts` client method + a Connect control. Routes exist (`routes/admin/external-mcp/oauth.ts:111`, `:140`); nothing calls them. Outline already written: `ADS-memory/reports/pipeline/external-mcp-agent-control/implementation-outline.md`.
9. **The five external-MCP agent tools** — same outline, Phase 2a/2b. Owner APPROVED the allowlist going 6→7 for `external_mcp_save`, in the same commit as its parking handler.

### Discovery cluster — sequence matters
10. **#23 — admin panels are in NO search index.** Verified. The External MCP panel is `agentReachable: true` (`apps/admin/src/panels.tsx:833-845`) with handles on every field and a passing drive test, and the agent still cannot find it. **Must precede any all-in-one search** — a fan-out over N indexes cannot return a panel that is in none of them.
11. **#22 — `site_get_profile` has no integrations section.** `SITE_PROFILE_SECTION_NAMES` (`site-profile.ts:65`) = pages, theme, plugins, settings, contentTypes. No connections, no skills.
12. **#27 — one all-in-one ADMIN search.** The visitor half already exists and is already narrow (`src/assistant/site/tools.ts`, six published-content tools). Do #23 and #22 first.
13. **#21 — the agent never searches the WEB**, only the local tool catalog. Distinct from query formulation; name the mode before designing an eval.
14. **#8/#7 — the selection bug.** Still unsolved. Cheapest untested hypothesis (truncation/rendering in the jini bridge) has now been deferred three times.

### Carried over, untouched this session
15. **#10 — admin chat cwd is the Tovu repo.** Four handoffs now. Hides gaps.
16. **#16 — Word Count agent-invocable** (postId → compute on demand). Supersedes the backfill task.
17. **#8 — refresh bus Stage 2 (SSE).**
18. **#9 — red E2E test** (`agent_tool_attempts` missing table). Four handoffs.
19. **Landscape phone 896×414 FAB**, and the width-only mobile breakpoint behind it.
20. **`src/features/external-mcp/{agent-tools,deps,save-form}.ts`** — still no `tool-registrations.ts`. Resolved by item 9.
21. **Jini `ConfirmButton` + RowMenu portal gap.**
22. **#24 — consensus report stranded** in a duplicate tree: `AI-Dev-Shop/ADS-memory/reports/swarm-consensus/runs/2026-08-26T005706Z-consensus-report.md`. The canonical tree is `ADS-memory/` (131 report dirs vs 3). **Real cost already paid**: an architect looked in the right place, correctly found nothing, and re-derived a whole design.
23. **#17 (list) — stale worktree** `.claude/worktrees/agent-acd4039588ea074a8`. A full duplicate of the repo that doubles every grep result. Every dispatch this session had to explicitly exclude it. Decide keep or remove.

---

## 6. Questions still unanswered

- **Does the write-tool override survive contact with a real UI?** The architect was asked to argue against the Coordinator's two-list sketch, not ratify it. One list of per-tool records each with an `allowWrite` flag may be better.
- **Should R5 (boot-only federation) be revisited?** Ticking a checkbox does nothing until a restart. That is a bad UX for a checklist, and R5 is load-bearing against the rug-pull.
- **Should `destructiveHint: true` be overridable at all**, or stay absolutely refused even by an operator?
- **Should BYOK federate external MCP?** Owner says yes. `adapter.http.ts` spawns **no** child process (only `adapter.stdio.ts` does) and everything `attachFederatedMcpTools` needs is already on `routeDeps`, which `assistant-byok.ts:280` already holds. Open: federation is boot-only and BYOK has no boot.
- **Should plugins be invocable at all**, and where would that code run — in-daemon or sandboxed? Sketched, never decided.
- **Does the mobile keyboard occlude the chat input?** Still NOT TESTED — needs a real device.
- **Should the skill label be title-cased?** The typeahead will read `incident-response`. No title-casing exists anywhere; adding it is a deliberate act.

---

## 7. Things NOT tested

- **The hero-image acceptance test never ran** — blocked by R3. `"Make me a hero image for the homepage — something warm and cinematic, a coffee roastery at dawn."`
- **Inline image rendering** — cannot be tested until #18 and #31 are both done.
- **`site-compliance`** — flipped ON this session (`infra/agent-plugins/ws/workspace-local/activations.json`, gitignored local state) but never actually exercised.
- **Components capability (`search_components`)** — still never live-tested.
- **The typeahead end-to-end** — Phase 2 is not built, so `/inc` still matches nothing.
- **Scroll chaining** at the bottom of `.admin-content`.

---

## 8. Operating notes from this session

- **Architects go idle without ever reporting. Five for five.** Two delivered anyway because they were told to write their outline to a FILE. **Always make the file the deliverable; never depend on the chat reply.** The recovery poke that works is short and names the exact shape to return, plus "use what is already in your context, do not re-read anything" — an open-ended "please report" invites a restart.
- **Programmers reported reliably.** All four did. The difference appears to be a concrete, verifiable deliverable.
- **`tsx watch` restarts the daemon on any `src/` edit, and that kills any in-flight agent run silently** — spinner forever, no error. Cost one wasted live test and one false "it froze" diagnosis. **Do not run live chat tests while a programmer is editing watched source.**
- **The daemon is a grandchild of `npm run dev`.** Killing just the daemon respawns it in ~3s and prints fresh boot logs, without touching the web server. Killing the top supervisor stops everything.
- **The daemon writes no log file.** Federation logs go to the operator's terminal only. That is the sole route to a server's real tool list today.
- **Subagent reports are claims.** Every one was re-verified. Two were subtly wrong: one misattributed file churn to "another session" when it was our own agent, one claimed `ADS-memory` was gitignored-by-design without noting that `reports/` is explicitly un-ignored while `knowledge/` is not.
- **`ADS-memory/knowledge/` is gitignored; `ADS-memory/reports/` is not** (`.gitignore:71-74`). The `capability_search` removal note was written to `knowledge/` and is therefore **local-only**, while a committed code comment in `tool-catalog-manifest.ts` points at it — a dangling reference for anyone else cloning. Move it or accept that.
- **Architects corrected the Coordinator repeatedly and were right every time** — about a data-loss blast radius, about `DOMAIN_SLICES` being a legacy seam, about a security-allowlist premise, about a cross-process problem the codebase had already solved, and about a binding that did not exist. **Ask to be corrected; it is the highest-value thing they do.**
