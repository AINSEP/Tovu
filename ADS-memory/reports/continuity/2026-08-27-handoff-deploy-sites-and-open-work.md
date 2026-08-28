# Handoff — toward actually deploying sites (2026-08-27)

Tovu `general-work` @ `04567478`. Prior handoff: `2026-08-26-handoff-higgsfield-and-discovery-session.md`.

**Owner's stated goal for the next stretch: start actually deploying sites and getting this working.** Everything below is ordered against that, not against what was most recently interesting.

**Nothing running.** Dev server is owner-owned. **26 dirty paths belong to two OTHER sessions** — untouched, do not touch.

---

## 0. READ FIRST — the upgrade problem, and the `sites/` question

The owner asked: *would a separate `sites/` folder let a person's site survive a Tovu version upgrade?*

**Yes — and the pattern already exists and is already half-built. `infra/` IS that folder.**

Already outside the package, already survives an upgrade:
`infra/content.db` (all content), `infra/uploads/`, `infra/agent-plugins/`, `infra/skills/`, `infra/export/`, `infra/publish/`, `infra/publish-history/`, `infra/ops/`, plus restore-point DBs.

Note the shape already in use: `infra/skills/ws/<workspaceId>/`, `infra/agent-plugins/ws/<workspaceId>/`. Per-site separation is already the convention.

**The gap is THEMES, and it is a known destroyer.** Themes live **inside the package** at `src/themes/` — including `src/themes/__original-themes__/` (the themes' own "reset to original" backups) and `src/themes/__marketplace__/`. **Upgrading Tovu destroys installed and edited themes AND their backups.**

**The seam to fix it already exists.** `src/server/deps.ts:174`:
```ts
return process.env.TOVU_THEMES_DIR ?? resolve(import.meta.dirname, "../themes");
```
The override is already there. It just **defaults to the wrong side of the line.** Used at `app.ts:542` and `deps.ts:798` via `builtInThemesDir()`.

**Proposed shape (needs an owner call before building):** default `TOVU_THEMES_DIR` to `infra/themes/ws/<workspaceId>/`, matching `infra/skills` and `infra/agent-plugins` exactly. Seed built-in themes there on first boot the way `seed-bundled.ts` already seeds agent plugins, and never write into the package again. Keep `src/themes/` as the read-only vendor source that seeds from.

**Open questions on this:**
- Does a theme upgrade need a merge story, or is "operator edits win, vendor updates land beside them" enough?
- `__original-themes__` is a backup *of vendor originals*. If vendor themes move to `infra/`, does that backup still mean anything, or does it become "the version I installed from"?
- Themes are COPIED, not inherited (existing project knowledge). Confirm that still holds after the move.

**Do this before shipping any upgrade path.** Everything else in this document is less urgent than not eating a customer's theme.

---

## 1. Deployment — what is actually blocking a real site going live

Collected from project knowledge, **not re-verified this session — verify before acting**:

- **A desktop app already exists: Tovu-Runner (Electron).** A mac build is on disk. It bundles `node_modules`, which **voids the `file:`-dependency blocker** that stopped the Docker path. It has no updater, is unsigned, and builds `target: dir`. It needs Node 24 preinstalled.
- **Docker was the earlier plan and is blocked** by `spawn` plus 22 `file:` deps escaping the build context. Owner rule: **ask before starting Docker.**
- **CI is not "off" — it is BILLING-BLOCKED** (corrected 2026-08-26). Triggers are on; GitHub refuses to start the runner. **8 gates currently run ZERO tests.** If deploys are going to be real, this matters: nothing is gating anything right now.
- Publish targets that exist in the tree: `infra/publish/github-pages/`, `infra/publish/vercel/`, plus a static exporter (`export/site-exporter.ts`) and `infra/export/` output.

**Suggested first move next session:** pick ONE target (Tovu-Runner, or static export to one host) and drive a single real site end to end, the way Higgsfield was driven end to end this session. Find the wall by walking into it, not by auditing.

---

## 2. Higgsfield — connected, still cannot generate

**CONNECTED.** `status: connected`, `clientId: DWjbUpAZxhRW2AgE`, scopes `openid email offline_access`, 24h token, refresh token present, auto-refresh works with a cross-process lease. **No periodic re-sign-in needed.**

Every previously fixture-only path worked live first try: RFC 9728/8414 discovery, RFC 7591 dynamic client registration, PKCE S256, `clerk.higgsfield.ai` redirect, token exchange, seal.

**There is still NO Authorize button.** It was connected by hand:
1. Save the row (transport `streamable_http`, auth `oauth`, client id BLANK, sign-in method "Browser sign-in").
2. From the admin page's own JS console: `POST /api/admin/v1/workspaces/workspace-local/mcp-servers/higgsfield/oauth/connect` with body `{}`.
3. Open the returned `authorizationUrl`; owner signs in. Expires in 10 minutes.
**Do NOT click the saved row in Settings** — see §5, autofill corrupts the client id.

**Allowlist set (7):** `generate_image, models_explore, job_status, jobs_wait, show_generations, reveal_generation, show_generation_by_ids`. Six register. `generate_image` is refused.

**Higgsfield advertises 85 tools.** Recover the full list by booting the daemon with an empty allowlist and reading stderr. Deliberately excluded: `sandbox_exec`, `confirm_billing_purchase`, `website_secrets`, `deploy_website`, `publish_website`, `tiktok_publish`, `apps_invoke`.

---

## 3. Why it cannot generate — and the correction that matters

**R3 does not block write tools. It blocks HONEST write tools.**

`refusalForRemoteToolHints` (`src/assistant/mcp-federation/trust.ts:275-279`) checks `=== true` / `=== false` against an **optional** field. A remote publishing `annotations: undefined`, `{}`, or `{title: "…"}` passes straight through — and `mcp-federation.trust.test.ts:165-181` pins that as intended.

> A server that **declares** its write tools is blocked. A server that stays **silent** is admitted — no override, no marking, no operator awareness that a write entered the catalog.

Higgsfield is blocked *because it is honest*.

**Second correction: Tovu DOES have a human-confirmation transport.** `supabase-mcp-plugin.ts:99-103` says it does not; that comment is stale. `src/core/tool-surface-exchanges.ts` is real, `ctx.emitSurface` is forwarded verbatim through `tool-executor-audit.ts:149-162`, and `content_post_delete` uses it in production. The entire read-only posture rests on that file's reasoning. Belongs in the false-comment register.

**Full design ready to build:** `ADS-memory/reports/pipeline/external-mcp-write-tools/implementation-outline.md` (50KB). Read §0 (four corrections) before anything else. **Seven owner decisions in §13**, all with recommendations — D-1 (cover `destructiveHint`? recommends no, with a stated real cost), D-2, D-3, D-4 (restart-button permission — a real permission change, owner's call), D-5, D-6, D-7 (restrict probe to `streamable_http`? recommends yes).
**Phases:** 0+1 together, 2 is 3-wide, 3 is 2-wide, 4 is UI. Peak concurrency 3. **Phase 1 is BLOCKING.**

**The owner's objection is the real work, and is now the brief's headline:** nobody will ever find these settings. Today you type tool names by hand into a comma-separated box, with no way to learn the names, and getting it wrong produces **total silence**. The daemon already walks all 85 tools and knows which write — and throws that away to stderr. It should be a **checklist**.

---

## 4. Discovery — a FOURTH failure mode, confirmed

| Mode | Symptom | Example | Status |
|---|---|---|---|
| Selection | right answer ranks #1, agent uses #5 | `ui-ux-design` | UNSOLVED |
| Registration | never enters the catalog | Word Count | FIXED `905d5248` |
| Activation | registered but switched OFF | `site-compliance` | FLIPPED ON 2026-08-26 |
| **Query formulation** | **exists, registered, enabled, ranks fine — the agent never asks a question whose words could match** | `skill_incident_response` | **NEW, unsolved** |

**Arm A (fails):** *"Our site went down for about 20 minutes this morning. What should I do now?"* → four queries, all asking WHAT HAPPENED. Never found the skill. 48s, $0.60.
**Arm B (succeeds):** *"do we have anything having to do with incident response?"* → found and used it on the first search.
**Decisive:** `check site health` appears in **both** and surfaced nothing either time. Only the query containing "incident response" worked. **Ranking never mattered; vocabulary overlap did.**

**Consequence:** items #22, #23, #27 below would ALL have changed nothing in Arm A. They improve what comes *back*; this breaks before anything is *asked*. **Do not fund index work as a fix for this mode.**

---

## 5. Open work — everything, in priority order

### A. Site-owner safety (do first — these lose data)
1. **Themes are destroyed on upgrade.** §0. `TOVU_THEMES_DIR` seam already exists at `deps.ts:174`. Needs an owner call on the target layout, then it is small.
2. **#29 — autofill corrupts an OAuth client id.** Clicking a saved External MCP row opens an edit form with blank credential fields; Chrome autofilled `"admin"` into Client ID and it saved, breaking the connection. Needs `autocomplete="off"` on credential-shaped inputs AND the form must populate stored values instead of rendering blank.
3. **#30 — `PUT` silently discards an array `allowedToolNames`.** Returns 200, saves empty, no error, indistinguishable from a deliberate empty list. `put.ts:79` uses `asStringField`. Same "registered but invisible" class.
4. **CI is billing-blocked; 8 gates run ZERO tests.** Nothing is gating anything before a deploy.

### B. Deployment (the owner's stated goal)
5. Drive ONE real site live end to end — Tovu-Runner or static export. §1.
6. Decide the `sites/` layout formally once §0's theme move settles.

### C. Higgsfield / external MCP
7. **#31 — the write-tool override + tool picker.** Outline done, 7 decisions queued. §3.
8. **#18 — federated images never render inline.** `mcp-federation/registrations.ts:144-152` returns no top-level `content` array, so `extractResultMedia` (`@jini-ai/daemon/src/tool-result-media.ts:98`) finds nothing and the base64 is stringified and truncated at **64KB**. Working shape exists at `src/assistant/demo-image-tool.ts:88-97`. **Blocks the owner's core requirement for this whole surface.**
9. **The Authorize button.** Routes exist (`routes/admin/external-mcp/oauth.ts:111`, `:140`); nothing calls them. Outline: `ADS-memory/reports/pipeline/external-mcp-agent-control/implementation-outline.md`.
10. **The five external-MCP agent tools.** Same outline, Phase 2a/2b. Owner APPROVED the MCP-UI allowlist going 6→7 for `external_mcp_save`, in the same commit as its parking handler.
11. **#26 — BYOK should federate external MCP.** `adapter.http.ts` spawns **no** child process (only `adapter.stdio.ts` does); everything `attachFederatedMcpTools` needs is already on `routeDeps`, which `assistant-byok.ts:280` holds. Open: federation is boot-only, BYOK has no boot.

### D. Finish what is half-built
12. **Commit Phase 1A** — the skills route. Verified: 9/9 tests, `tsc` 0, live curl returns `skill_incident_response`. **Uncommitted:** `src/server/http/admin/skills.ts`, `src/server/routes/admin/skills/{deps,list}.ts`, `src/server/modules/skills.ts`, 2 lines in `src/server/app.ts`, 2 test files.
13. **Phase 2 of the typeahead** — wire `createInstalledSkillsComposerCapabilitySource()` into `AssistantDock.hooks.tsx:601`; delete the inert `skill:ui-ux-design` entry (`composer-capabilities.ts:270-282`); i18n key; INV-001 regression test. **OWNER CORRECTION: the inserted pointer text must be ONE line, not six** — six does not fit the compose box. Phase 1B built six with a defensible reason (bridge discovery hops); make it one dense line.
14. **#17 — mobile sheet peek height, A or B.** Unanswered three sessions. One number, one place (`--chat-sheet-peek`). A: 58vh → ~35-40vh. B: collapse to a pill after each turn.

### E. Discovery cluster — order matters
15. **#23 — admin panels are in NO search index.** The External MCP panel is `agentReachable: true` (`apps/admin/src/panels.tsx:833-845`) with handles on every field and a passing drive test, and the agent still cannot find it. **Must precede any all-in-one search.**
16. **#22 — `site_get_profile` has no integrations section.** `SITE_PROFILE_SECTION_NAMES` (`site-profile.ts:65`) = pages, theme, plugins, settings, contentTypes. No connections, no skills.
17. **#27 — one all-in-one ADMIN search.** Visitor half already exists and is already narrow (`src/assistant/site/tools.ts`, six tools). Do 15 and 16 first.
18. **#21 — the agent never searches the WEB.** Distinct mode; name it before designing an eval.
19. **#7/#8 — the selection bug.** Cheapest untested hypothesis (truncation/rendering in the jini bridge) deferred **four** times now.

### F. Carried, untouched
20. **#10 — admin chat cwd is the Tovu repo.** Five handoffs. Hides gaps — the agent Bash-es around missing tools and succeeds, so nothing looks broken.
21. **#16 — Word Count agent-invocable** (postId → compute on demand). Supersedes the backfill task. Blocked on the undecided "where does plugin code run" question.
22. **#8 — refresh bus Stage 2 (SSE).** Mirror `routes/admin/settings/events.ts` + `change-feed.ts`.
23. **#9 — red E2E test** (`agent_tool_attempts` missing table). Five handoffs. Three untested hypotheses in `2026-08-24-2118-handoff-what-went-wrong.md` §2.2.
24. **Landscape phone 896×414 FAB** lands on a Cancel button; root cause is the width-only breakpoint behind it.
25. **`src/features/external-mcp/{agent-tools,deps,save-form}.ts`** — still no `tool-registrations.ts`. Resolved by item 10.
26. **Jini `ConfirmButton` + RowMenu portal gap** — dropdown portals outside the driver's `<main>` scope. Fix with a portal-container prop; do NOT widen the driver scope.

### G. Housekeeping that keeps biting
27. **#24 — consensus report stranded** in a duplicate tree: `AI-Dev-Shop/ADS-memory/reports/swarm-consensus/runs/2026-08-26T005706Z-consensus-report.md`. Canonical is `ADS-memory/` (131 report dirs vs 3). **Cost already paid**: an architect looked in the right place, correctly found nothing, and re-derived a whole design.
28. **Stale worktree** `.claude/worktrees/agent-acd4039588ea074a8` — a full repo duplicate that doubles every grep. **Every dispatch this session had to explicitly exclude it.** Decide keep or remove.
29. **The `capability_search` removal note is local-only.** `ADS-memory/knowledge/` is gitignored; `ADS-memory/reports/` is not (`.gitignore:71-74`). A committed comment in `tool-catalog-manifest.ts` points at that file — a dangling reference on any other clone. Move it to `reports/` or accept it.
30. **`infra/` has 4 restore-point DBs and a `.bak`** totalling ~50MB+ alongside a 29MB `content.db`. Nobody has decided a retention policy.

---

## 6. Things we may have forgotten to add

- **Nobody has ever tested what happens on an actual Tovu version upgrade.** §0 is theory until someone runs it.
- **`search_components` / `describe_component`** — mounted at `agent-daemon-server.ts:901`, **still never live-tested**, four handoffs running.
- **`site-compliance` was flipped ON this session** (`infra/agent-plugins/ws/workspace-local/activations.json`, gitignored local state) and **still never exercised**.
- **The hero-image acceptance test never ran** — blocked by R3. Prompt held verbatim for comparability: *"Make me a hero image for the homepage — something warm and cinematic, a coffee roastery at dawn."*
- **Mobile keyboard occlusion** — still NOT TESTED, needs a real device. Zero uses of `visualViewport`, `dvh`/`svh`/`lvh`, or `interactive-widget` anywhere in `apps/admin/src`.
- **Skill labels are not title-cased.** The typeahead will read `incident-response`. No title-casing exists anywhere; adding it is a deliberate act.
- **Restore-point DBs** — no retention policy, no UI, nobody knows if they still restore.
- **Scroll chaining** at the bottom of `.admin-content` — the test page was shorter than the viewport, so it was never provable either way.

---

## 7. What shipped 2026-08-26, all re-verified by the Coordinator

| Commit | What |
|---|---|
| `b6e2f597` | Saving an external MCP row no longer destroys its OAuth token. Red-first: 2 fail → 41 pass. |
| `30bbe531` | `capability_search`/`capability_get` removed — 1,913 lines, 9 files deleted, 16 edited. Owner call. Every plugin already had its own `agent_plugin_<id>` tool, so nothing went invisible. |
| `04567478` | Phase 1B — installed-skills composer capability source. 5/5 green. |

---

## 8. Operating notes that will save the next session real time

- **Architects go idle without ever reporting. Five for five.** The ones that delivered did so because they were told to **write the outline to a FILE**. Always make the file the deliverable; never depend on the chat reply. The recovery poke that works is short, names the exact shape to return, and says "use what is already in your context, do not re-read anything."
- **Programmers reported reliably — four for four.** The difference is a concrete verifiable deliverable.
- **`tsx watch` restarts the daemon on any `src/` edit, and that silently kills any in-flight agent run** — spinner forever, no error. Cost one wasted live test and one false "it froze" diagnosis. **Never run a live chat test while a programmer is editing watched source.**
- **The daemon is a grandchild of `npm run dev`.** Killing just the daemon respawns it in ~3s with fresh boot logs and leaves the web server up. Killing the top supervisor stops everything.
- **The daemon writes no log file.** Federation logs go to the operator's terminal only — the sole route to a server's real tool list today.
- **The daemon snapshots its tool catalog ONCE at boot.** Config changed after boot does nothing until a restart. This cost two inconclusive test runs.
- **Subagent reports are claims.** Every one was re-verified this session; two were subtly wrong.
- **Architects corrected the Coordinator on every single dispatch and were right every time** — a data-loss blast radius, a legacy seam, a security-allowlist premise, a cross-process problem already solved in-tree, a binding that did not exist, and the R3 framing in §3. **Ask to be corrected. It is the highest-value thing they do.**
- **`git commit -F <msgfile> -- <explicit paths>` only.** Never `git add -A`. Never `stash`/`checkout --`/`restore`/`reset --hard`/`clean` — two other sessions hold uncommitted work in this tree.
