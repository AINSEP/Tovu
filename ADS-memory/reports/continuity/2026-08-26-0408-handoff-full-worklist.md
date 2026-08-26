# Handoff — full worklist for restart (read this first)

Generated: 2026-08-26 04:08 UTC · Branch `general-work` @ `d4cd84c7`
Written because the owner is restarting the session and asked for everything not yet done —
tests, plugins still to create, all of it — not just a "do this first" summary.

---

## TL;DR

1. **Three big features got built and verified this session** (site-info tool, compliance-audit
   plugin, Higgsfield/OAuth external-MCP backend) — but **none of the three are merged into
   `general-work` yet.** They're sitting on their own worktree branches, clean, tested, ready.
2. **The admin UI for external MCP still only supports local/stdio servers.** The backend now
   supports hosted OAuth connections; nothing in the admin form exposes that yet. This is the
   next concrete, scoped piece of work.
3. **A cookie-consent banner was scoped, not built.** The scoping surfaced a real problem: it
   can't be a Plugin at all (the mechanism to inject into a public page doesn't exist), and
   Tovu's analytics is server-side/cookieless today, so there's currently nothing for a consent
   banner to gate. Needs an owner decision before any code gets written.
4. **Original task #1 (E2E test run-3 failure) was never picked up this session.** Still open
   from before this session started.

---

## 1. THREE BRANCHES READY TO MERGE — do this first

All three are clean (no uncommitted changes), independently verified (not just trusting the
subagent reports — I re-ran their key tests myself), and standing down. **None branched from the
same point as current `general-work` tip** — expect real merges, not fast-forwards.

| Branch | Worktree path | Latest commit | What it is |
|---|---|---|---|
| `worktree-agent-a7e2e8bba04842f0f` | `.claude/worktrees/agent-a7e2e8bba04842f0f` | `2488db43` | `site_get_profile` + `fetch_published_page` |
| `worktree-agent-acd4039588ea074a8` | `.claude/worktrees/agent-acd4039588ea074a8` | `7894cf36` | `site-compliance` Agent Plugin + browser evidence tool |
| `worktree-agent-a1ec79fc18aabbe6b` | `.claude/worktrees/agent-a1ec79fc18aabbe6b` | `31200623` | Generic OAuth subsystem + streamable-HTTP MCP transport |

**Merge hazards, specific and real, not generic advice:**

- **`package.json` will very likely conflict.** A different, still-uncommitted session's work
  (`check:theme-replaced-elements` script line) sits in `general-work`'s working tree right now —
  do NOT let any merge silently absorb or drop it. See §5 below for the full "other people's
  uncommitted work" list; none of it is ours to touch.
- **`site-profile`'s `createSiteApp` signature intentionally differs from main.** In that worktree
  it's `(routeDeps: RouteDeps) => Express`; on `general-work` (as of whenever it diverged) it had
  already been made nullary. The port is declared with method syntax + an `unknown` param
  specifically so it satisfies both shapes. **Do not "simplify" this during merge** — that was an
  explicit warning from the agent that built it.
- **`compliance-audit`'s worktree was 469 commits stale when that agent started** (it fast-forwarded
  before writing anything, but that was hours before the *current* tip). Check its diff against
  current `general-work` carefully, not just against whatever it fast-forwarded to.
- **`compliance-audit`'s `SKILL.md` references `site_get_profile`'s tool id and its `sections`
  parameter shape (`pages`/`settings`/`theme`/`plugins`/`contentTypes`, `forbidden` per-section
  status) — verify that shape actually matches what `site-profile`'s branch shipped**, once both
  are merged. The compliance agent flagged this itself as unverified from its side.
- **`site-profile`'s worktree has no `node_modules`** — recreate with
  `ln -s /Users/la/Programming/Tovu/node_modules node_modules` from inside that worktree before
  running its tests again.
- **After merging, re-run each feature's own test suite against the merged tree**, not just trust
  that it passed in isolation on its own branch.

**Independently verified this session (not just taken on the subagents' word):**
- `site-profile`: ran `site-profile.unit.test.ts` + `published-page.unit.test.ts` myself — 41/41 pass.
- `compliance-audit`: ran `bundled-inactive-gating.integration.test.ts` myself — 7/7 pass (the
  "load-bearing," mutation-verified activation-gating tests). `tsc --noEmit` clean.
- `oauth`: ran `mcp-federation.http-adapter.test.ts` + `mcp-federation.registrations.test.ts` — 64/64
  pass. Ran `admin-external-mcp-routes.test.ts` — 14/14 pass (this is the one that caught the write
  route silently dropping OAuth fields — see §2).

---

## 2. External MCP / Higgsfield — backend done, UI is the actual remaining gap

**Backend, fully built and verified on the `oauth` branch above:**
- Generic, provider-agnostic OAuth 2.0 client (PKCE + device grant) — `src/oauth/`. Zero mentions
  of "Higgsfield" anywhere in it; confirmed by grep. Any future provider is a config entry in
  `src/oauth/providers.ts`, not new code.
- Transport and auth-mode made fully orthogonal (`stdio`/`streamable_http` × `none`/`static_env`/`oauth`).
- A real streamable-HTTP MCP federation adapter (`src/assistant/mcp-federation/adapter.http.ts`) —
  Tovu can now actually connect to a *hosted* remote MCP server, not just local processes. Proven
  end-to-end against a real loopback HTTP server with a real bearer-token check.
- `needs_reauth` state, single-flight token refresh, fail-loud-no-retry on connect-time provider
  downtime — all built and mutation-tested (weakening session-ID validation, flipping redirect
  handling, removing 401 mapping, restoring the old stdio-only gate all correctly turn tests red).
- **A real bug was caught and fixed along the way**: the admin PUT route
  (`src/server/routes/admin/external-mcp/put.ts`) was silently dropping `url`, `authMode`, and the
  whole `oauth` block from incoming requests. Before this fix, there was no way to ever save a
  server in OAuth mode at all — five commits of working OAuth machinery with nothing able to reach
  it. Fixed, tri-state field semantics preserved (matches the existing `env` field's absent/string/empty
  rule).

**What's NOT done:**
- **The admin UI still only has ID / Command / Args / Allowed Tools / Env** (owner confirmed this
  live via screenshot at `/admin/settings?tab=external-mcp`). No transport selector, no URL field,
  no OAuth fields (provider/grant/client id/secret/scopes), no "Connect" button. The file to start
  from: `apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts` — `command` is currently
  `required: true` unconditionally, which will block submitting a hosted (no-command) row.
  **⚠️ The admin copy strings double as their own i18n keys** — editing one in place instead of
  adding a new key silently reverts all 21 locales to English for that string. This is a known,
  previously-documented trap in this codebase, not new.
- **No real Higgsfield provider registered.** `src/oauth/providers.ts` only has an example
  descriptor. This needs Higgsfield's actual authorization/token endpoint URLs — an information
  problem (owner has a Higgsfield account now, no credits used yet, wants to test with it), not a
  coding one.
- **This is UI work — per this project's standing preference, do it as its own dispatch with the
  owner watching live** (Claude-in-Chrome / dev server), not blind. Don't build it silently.
- Two other routes in a shared library (`@jini-ai/http-kit`'s `db-ops.ts` and `terminals.ts`) have
  the same "validation failure → wrong 500" bug class that was just fixed for `theme_list_files`
  (see §4) — flagged as a cheap follow-up, not done.

---

## 3. Cookie-consent banner — scoped only, real open questions before any code

A full scoping pass (Opus 5 subagent, investigation only, zero code written) found the original
plan doesn't hold:

- **Cannot be a Plugin.** Tovu's plugin-runtime hook vocabulary is exactly one hook
  (`content.entry.beforeSave`) and three capabilities (`content.read`/`content.extend`/`hooks.attach`)
  — there is no mechanism for a plugin to touch a public page at all. A second extension system,
  `site-glue`, has the right-looking vocabulary (`render.contribute`, `http.route.register`) but
  those call sites are validated and then explicitly rejected as `UNWIRED_CALL_SITE` — "three real
  entries, three typed placeholders." Building this as a plugin means building an entire unwired
  platform layer first — a multi-week project, not this feature.
- **There is currently nothing to gate.** Tovu's analytics is server-side and cookieless — no
  script tag is ever emitted to a visitor's browser, no client-side identifier, IP-truncated hash
  only. A consent banner in front of *today's* analytics arguably gates nothing, cookie-law-wise.
- **Recommended real plan** (if the owner still wants this): build it as a **core feature**,
  mirroring `src/assistant/public-assistant-settings.ts` / `siteAssistantMarkup()` almost exactly —
  same settings-gated-markup-injected-into-every-page shape, new `src/consent/` module, a first-party
  cookie (`tovu_consent`, NOT `HttpOnly` since client JS must read it). Full file-level plan is in
  the subagent's report (see the conversation, or re-run the scoping — it wasn't saved to a file).
- **Real hazard flagged**: Tovu's public-page rendering is split by theme tier (declarative/Liquid/
  Handlebars go through `pageShell()`; static-tier themes, including `basic` — the one actually in
  use — are pre-built HTML files only string-transformed). A banner naively wired through only one
  path will silently not appear on the theme tier real visitors are using. This exact class of bug
  ("silently dropped on static-tier pages") has already happened once for SEO metadata and took
  three commits to fully close — budget for it.
- **Open questions for the owner, unresolved:**
  1. Does this even make sense given cookieless analytics — is it future-proofing, or does the real
     exposure lie elsewhere? (The report argues the *actual* live legal exposure is the separately-
     filed finding that forms/comments store undisclosed visitor IPs — a banner doesn't fix that.)
  2. Accept-only, or accept + reject (GDPR wants reject to be equally easy)?
  3. Default state — block until accepted, or track until declined?
  4. All themes, or opt-in per theme?
  5. Where does the "cookie policy" link point — entangled with the still-unfixed template-placeholder
     finding on the live Privacy Policy page.

---

## 4. Fully done and verified this session (for the record, don't redo)

- **Skills feature** (standalone Agent Skills, separate from Agent Plugins) — committed, tested.
- **Agent-daemon wiring** (skills + agent plugins register as real tools before the FTS snapshot) — committed.
- **Capability-discovery E2E test + config** — committed. **Still not fully green** — see the
  original task #1 below, this was never re-debugged this session.
- **Tool-description experiment** (leading `agent_plugin_ui_ux_design`'s description with an
  imperative instead of a noun phrase) — code shipped, unit + integration tests pass, ranking
  unaffected. **The live re-test (does this actually change model behavior on the "polished and
  professional" control prompt) was attempted and did NOT complete** — see §6, the admin chat's
  agent went into full source-code-exploration mode instead of using site tools, for reasons
  unrelated to the experiment itself. Inconclusive, not failed.
- **`theme_list_files` 500→400 bug** — fully fixed, in BOTH the Tovu repo and the Jini repo
  (a shared library dependency). Verified independently (ran the new end-to-end test myself,
  4/4 pass). A `ToolInputError` marker now threads through `@jini-ai/core` → `@jini-ai/daemon` →
  `@jini-ai/http-kit`, so *any* tool's validation failure gets a real 400, not a blanket redacted 500.
- **Admin FAB "covers Send button" — confirmed NOT a real bug.** Already fixed 2026-08-05 (31 unit
  tests + a dedicated e2e test, all passing, all pre-dating this session). The live repro this
  session was a Claude-in-Chrome background-tab-throttling artifact (`document.visibilityState:
  "hidden"` stalls the `ResizeObserver` that positions the FAB). No code change made. Documented in
  memory so it doesn't get "rediscovered" as live via Claude-in-Chrome again.
- **Three product findings filed** (not fixed — each needs real info/decisions from the owner, not
  a blind auto-fix): `ADS-memory/reports/findings/2026-08-26-no-cookie-consent-capability.md`,
  `...-policy-pages-template-placeholders.md`, `...-undisclosed-visitor-ip-storage.md`.
- **A design debate** (5 participants: Claude, Codex GPT-5.6-sol, 2× Gemini, an added Opus 5
  subagent) settled the architecture for the three big features above. Full report:
  `AI-Dev-Shop/ADS-memory/reports/swarm-consensus/runs/2026-08-26T005706Z-consensus-report.md`.
- **A stale architecture doc corrected** — `ADS-memory/docs/architecture/reference/external-mcp-server-federation.md`
  said "stdio transport only"; now correctly describes the streamable-HTTP+OAuth adapter. Note:
  this file is gitignored (`ADS-memory/docs/` is local-only, not shared via git) — the fix is on
  disk in this checkout but was never meant to be committed.

---

## 5. Original 10-item list from earlier this session — final status

1. **Debug E2E run 3 failure (`agent_tool_attempts` missing table)** — ⚠️ **NEVER PICKED UP THIS
   SESSION.** Still exactly as documented in the PRIOR session's handoff
   (`ADS-memory/reports/continuity/2026-08-24-2118-handoff-what-went-wrong.md`, §2.2) — three
   untested hypotheses in cheapest-first order are written there. Start there, not from scratch.
2. Commit skills feature — ✅ done.
3. Commit agent-daemon wiring — ✅ done.
4. Commit capability-discovery E2E test + config — ✅ committed, but ⚠️ the suite itself is still
   not confirmed green end-to-end (see #1 above — same root issue).
5. Commit ADS-memory reports — ✅ done.
6. Tool-description rewrite experiment — ✅ code shipped and tested; ⚠️ live behavioral re-test
   inconclusive (see §6).
7. Test Skills in live admin chat — ❌ not done, deferred by the owner to next session.
8. Test Components capability in live admin chat — ❌ not done.
9. Wire and test one external MCP — ⚠️ backend fully built (§2), UI + real registration still open.
10. File tickets for open product findings — ✅ done (§4).

---

## 6. A real, unresolved bug found this session: admin chat agent ignores product tools

While live-testing #6 via Claude-in-Chrome, the prompt "make it look polished and professional"
sent the admin assistant into reading Tovu's own React source files (`PageEditor.tsx`,
`theme-canvas-wrapper.ts`, etc. — files that happen to be another session's uncommitted WIP sitting
in this checkout) instead of ever considering `theme_list` or the design plugin. The chat panel
shows **"Working directory: Tovu"** — the agent's cwd is the literal product checkout, not a
scratch/site directory, so a vague prompt about "the site" gets interpreted as "edit this codebase."

This is the same *class* of bug the prior session's handoff already found and partially fixed for
the E2E test harness specifically (`TOVU_AGENT_CWD` env var) — but that fix does not cover this
**live, interactive admin chat** path. Attempting to change the "Working directory" setting via
Claude-in-Chrome caused the browser tab to hang (possibly a native OS file-picker dialog opening
outside the page, never confirmed either way — the tab had to be closed and recreated).

**Not investigated further this session.** Whoever picks this up next should: (a) find where the
admin chat's agent-CLI working directory actually gets set (likely near where `agent-daemon-server.ts`
or a sibling spawns the CLI process for a chat run), (b) decide what it *should* default to for a
real user's site (probably NOT the Tovu monorepo root itself, unless this admin instance is
specifically being used to develop Tovu-based custom code), and (c) if testing the "Working
directory" admin setting again via Claude-in-Chrome, be ready for it to possibly trigger a native
file picker — check for that before assuming the browser is just slow.

---

## 7. Standing reminders for whoever picks this up

- **Verify subagent reports before repeating their claims** — this session caught itself doing this
  correctly multiple times (re-running tests independently rather than trusting summaries).
- **Verify which model a subagent actually ran on** if one was explicitly requested — `grep -ho
  '"model":"[^"]*"' <subagent-transcript>.jsonl | sort | uniq -c`. New standing memory this session:
  `feedback_verify_subagent_model_resolution.md`.
- **If genuinely unsure what the user means, ask** — new standing memory this session:
  `feedback_ask_when_uncertain_about_intent.md`, written after a real mid-session mistake.
- **`git commit -- <pathspec>` re-stages the FULL current working-tree content of every named
  path** — it does NOT respect a prior partial `git apply --cached` hunk-level staging on that same
  path. This bit this session once (accidentally committed another session's uncommitted
  `package.json` line). New addendum in `reference_shared_git_index_across_agents.md`.
- **`git stash` is still off-limits in this shared checkout** — a subagent this session ran one by
  accident (`stash push ... || true; ... stash pop`, matched nothing, popped the wrong entry), caught
  it, and restored it correctly — verified independently, no damage. But the risk is real and
  recurring; don't run it.
- **Other sessions' uncommitted work still sitting in the main tree, not ours, don't touch:**
  `apps/admin/src/features/media/media-provider-catalog.ts`, `apps/admin/src/features/pages/PageEditor.tsx`
  + its tests + hooks, `apps/admin/src/styles/pages.css`, `src/server/http/site/render.ts` + test,
  `src/themes/static/basic/css/theme.css`, `src/widgets/html-embeds.ts` + test, the untracked
  `theme-canvas-*` files, `development/scripts/check-theme-replaced-elements.ts` + test, and the
  still-uncommitted `check:theme-replaced-elements` line in `package.json`.
- **Subagents doing real backend/code work this session all correctly stood down at a clean point
  and asked before continuing into a different discipline (UI)** — that pattern worked well, keep it.
