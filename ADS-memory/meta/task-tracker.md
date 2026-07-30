# Tovu Task Tracker

Last updated: 2026-07-30 (session continuing from
`ADS-memory/.local-artifacts/handoff/20260730T224540Z-handoff.md`)

Living checklist — update status inline as items move. This is the durable copy;
the in-harness `TaskList` mirrors it for the current session but does NOT persist
across sessions (confirmed empty on this session's start despite the prior
session's #4-#10 list) — treat this file as the source of truth going forward.

## 2026-07-30 update, part 3 (handoff continuation — everything committed + pushed)

Picked up from the `20260730T224540Z` handoff. Its own contract said to re-run
`git status` first to check for drift — did, and found real drift: the mcp-ui
build the handoff called "fully uncommitted" had actually already landed as
Jini commit `f387a1665` (timestamped ~76s before the handoff was captured —
a genuine race between a background subagent's commit and the handoff script's
git-status snapshot, not an error in the handoff).

- **Tovu**: all 6 outstanding files committed as 4 logical commits
  (`e86b51f` permission-mode fix, `6b8cc47` ChatFab CSS fix, `3128908`
  `@jini-ai/ui/chat` import migration, `c0deb88` docs) and pushed to
  `origin/main` (`5dbf32e..c0deb88`).
- **Jini**: cleaned up a stale git index left by an untracked intermediate
  rename (`packages/chat-react` → `packages/ui/src/react/chat-react` → the
  real final path `packages/ui/src/react/chat`, only the last hop was ever
  reflected on disk) and committed as 4 commits (`5eb432544` chat relocation,
  `876d9431f` missing `./mcp-ui` package.json exports, plus the already-landed
  `f387a1665`, plus `bf6436e41` fixing reference-web's 9 stale
  `@jini-ai/chat-react` imports). Pushed to `origin/main` (`f2f999dfc..bf6436e41`).
  - mcp-ui's own test suite (never run before, only typechecked): **232/232 pass**.
  - `pnpm run build` in `packages/ui` rebuilt cleanly; `dist/react/chat`,
    `dist/react/mcp-ui`, `dist/features/mcp-ui` all present.
  - reference-web: `tsc --noEmit` clean, 41/41 local tests pass.
  - Jini commits are landing under git identity `LA <la@LAs-MacBook-Pro.lan>`
    (auto-configured, no `user.name`/`user.email` set in that repo) — different
    from Tovu's configured `Leona Burime` identity. Not fixed (never touch git
    config unasked) — flagged for the user to set if they care about consistent
    authorship.
- **Re-verified `9b284b7`** (Supabase-to-plugin refactor): read the real diff,
  spot-checked `presets.ts` and `agent-daemon-server.ts`'s registration call —
  matches the commit message's architecture claims exactly. Independently
  reran the scoped tests: **73/73 pass**, confirming the commit's own claim.
- **Read `a689082`'s report** (`front-facing-assistant-search-approach.md`,
  never read this session before now): well-grounded, recommends direct DB
  calls as the starting option for the public-site assistant's search, names
  the precise open variable (whether the roadmap needs more public-facing
  agent actions soon) rather than guessing. No code changes — research only,
  as scoped.
- **The `jini-fix-*-2026-07-30` triggers (4 of them)**: confirmed landed —
  all 4 are ancestors of Jini's current `main` via the
  `integration/agent-executor-reconcile-2026-07-30` merge chain
  (`fix/post-merge-audit-{http-kit,agentic,agent-runtime-mcp,daemon}-2026-07-30`).
- **"Jini: reach OD route parity" trigger — genuinely unresolved, not just
  unverified.** Checked `RemoteTrigger action:list` directly: this trigger
  does not exist anywhere in the current list of 20 triggers (only 4 target
  Jini, and those are the 4 post-merge-audit fixes above, not this one).
  Checked Jini's `git log`/remote branches for any matching commit or
  branch — nothing. This work was either never actually dispatched, or its
  trigger record has rolled off the API's retention — either way, **the
  described work (model-proxy providers, ops endpoints, connectors route
  parity) has no evidence of existing anywhere** and should be treated as
  not started, not "unknown."

## 2026-07-30 update, part 2 (evals investigation)

- **Real, significant bug found + fixed**: the agent daemon's `resolvePermissionMode()`
  (`src/assistant/agent-daemon-server.ts`) defaulted to `"restricted"` — but a spawned agent CLI
  has no TTY to answer the resulting interactive permission prompt, so EVERY MCP tool call
  (`identity_user_create`, everything) silently stalled. Not a regression from the earlier
  forms/identity fix (`f23bbd6`, 2026-07-29 — that fixed a separate credential/auth layer and is
  still intact); this env var (`TOVU_AGENT_PERMISSION_MODE`) was simply never set anywhere.
  **Fixed properly**: `resolvePermissionMode()` now defaults off `resolveRuntimeMode()`
  (SPEC-022's existing safe-default seam) instead of requiring a manually-set env var or a
  script-level flag — works regardless of which script/command launches the process, exactly per
  user's explicit ask ("no matter what script it should be bypassed"). Production
  (`TOVU_RUNTIME_MODE=production`) still defaults to restricted. Live-verified end to end via the
  actual admin chat pane: `identity_user_create` succeeded, confirmed by direct sqlite3 query.
- Discovered and killed 3 rounds of orphaned dev-server/daemon processes surviving pattern-based
  `pkill` calls (their actual command lines didn't literally contain the matched pattern) —
  worth remembering: kill by PID from `lsof -t` when in doubt, not just `pkill -f`.
- Removed 8 leftover `.claude/worktrees/agent-*` dirs cluttering grep/search results (their
  `worktree-agent-*` branches remain, harmless, left alone unless asked).
- Confirmed: no test anywhere verifies an actual model correctly turns a natural-language admin
  request into the right tool call — existing identity/forms/etc. tests call tool handlers
  directly with fixed args (contract + authorization only). This is the real, concrete gap #17
  should close, now that the underlying tool-calling path itself is confirmed working.

## 2026-07-30 update (later same day)

- **Real bug found+fixed**: `.chat-fab`'s CSS container was hardcoded `48px`, smaller than the
  bumped 50px icon — the size edit was cosmetically real but had zero visible effect. Bumped
  container to `64px` (`apps/admin/src/styles/assistant.css`). Confirmed via Playwright screenshot.
- **Real bug found+fixed**: an orphaned Jini agent-daemon process (port 4319) survived an earlier
  `kill` pass (parent shells were killed, but the spawned daemon child wasn't), causing
  `EADDRINUSE` on every subsequent `npm run dev` and `401`s on `/api/agents` in the admin UI. Fully
  killed + clean restart confirms the daemon binds correctly; model picker now shows live-detected
  CLI tools (Antigravity/Claude Code/Codex CLI/OpenCode).
- **Lipay**: Opus review landed (`ADS-memory/reports/architecture/lipay-payment-plugin-architecture.md`,
  1306 lines). Key result: adding Stripe later costs 1 file + 1 line under the recommended design.
  User resolved R5 (lipay = a specific plugin, framework role like WooCommerce) and I resolved R1
  (webhook raw-body fix: `express.raw()` mounted before the blanket parser, not the buffer-stash
  option). Backend build dispatched to cloud, `trig_01VsTM44BmDCKyQH7KNpfbfb` (opus-5).
- **#14 folded into #13**: user's "frontend gap" answer was just the front-facing assistant's
  requirements (site-wide FAB+chat on `/welcome`, page routing, product search, article
  summarization, restricted tool set) — same feature, not a separate audit.
- **#15**: user will come back to it later, no content yet.
- Dev servers running clean: `:3000` (Tovu), `:5173` (admin), `:4319` (Jini agent daemon).

## Status snapshot (as of last check)

- Local `main` pulled to `28702f4`, level with `origin/main` (clean fast-forward,
  no conflicts — the 5 commits never touched `apps/admin/`).
- Uncommitted: `apps/admin/src/components/ChatFab.tsx` (star-size bump, likely
  moot — see B1/C2). `fab-check2.png` deleted (B2 done).
- Still TODO: typecheck + scoped tests + diff review (A2-A5) before trusting
  the 5 commits' content, not just their presence.

---

## A. Verify the 5 cloud commits (do first — nothing else should be trusted until this passes)

1. [x] Pull `origin/main` — done, clean fast-forward `69d2f9e..28702f4`
2. [ ] `npm run typecheck` repo-wide
3. [ ] Scoped tests only, per domain (never the full suite):
   - `src/assistant/__tests__/*.test.ts` (all 5 domains + aggregator)
   - `src/features/theme/__tests__/*.test.ts` (Handlebars tier)
   - `src/features/post/__tests__/**/*.test.ts` (Posts/Pages — confirm
     `post.test.ts` / `post.transition-events.test.ts` unchanged byte-for-byte)
   - `src/features/database/__tests__/**/*.test.ts` (SQLite adapter)
   - `src/core/commands/__tests__/**/*.test.ts` (CIC U-005 security fix — confirm
     actually fixed, not just claimed)
4. [ ] Read each commit's real diff (`git show <sha>`) — don't trust commit messages
5. [ ] Reconcile `ADS-memory/reports/pipeline/005-plugin-system/tasks.md` checkboxes
   against what `ca7a85d` actually landed

## B. Cleanup

1. [ ] Decide: keep / discard / fold `ChatFab.tsx` star-size edit into the Jini rework (C2)
2. [x] Delete `fab-check2.png` — done

## C. Carried-over feature work (from the 2026-07-30 handoff, was #5–#10)

1. [~] **Lipay plugin**: prior WooCommerce/OpenSaaS synthesis was never durably
   saved and isn't available in this session — redoing from scratch. Opus 5
   subagent `lipay-opus-review` running now (background, local), focused on
   provider-extensibility (PayPal/Stripe/regional) per user's explicit ask.
   Writing to `ADS-memory/reports/architecture/lipay-payment-plugin-architecture.md`.
   Cloud build dispatch happens AFTER this lands.
2. [ ] **ChatFab → Jini**: drop the local admin component, switch to Jini's exported
   `ChatFab` from `/Users/la/Programming/Jini/packages/chat-react` (separate repo,
   separate git history/remote — confirm before editing). User confirmed: local/interactive, not cloud.
3. [~] **Supabase MCP federation + adapter**: dispatched to cloud,
   `trig_014eB8fYNH3HLEVuJYEbNKJS` (opus-5), scheduled 2026-07-30T19:30Z. Part 1
   (must-complete): external-MCP-connection capability so the assistant can talk
   to Supabase's official MCP server, in a separate/more-restricted trust tier
   from Tovu's own reviewed tool catalog. Part 2 (only if natural): a
   DatabaseIntrospectionPort-style read-only adapter for an external Supabase
   Postgres project.
4. [~] **Post/page delete + real MCP-UI gate**: dispatched to cloud,
   `trig_01UnqJkffh8ZYZLsXqdSofhf` (opus-5), scheduled 2026-07-30T19:33Z.
   User chose the real MCP-UI protocol over the existing unused
   `requiresConfirmation` flag. Genuinely greenfield — no delete anywhere in
   this domain today (no domain fn, no repo method, no admin route, no tool).
5. [ ] **webmcp + nav test** — explicitly wanted local/live, not a cloud dispatch (reconfirmed).
6. [~] **Front-facing public assistant** (product/post/page search) — dispatched
   to cloud as research-only, `trig_01SrtgrjmzTpRgzjAoWMHNCC` (sonnet-5),
   scheduled 2026-07-30T19:31Z. Now compares 3 options (NLWeb / bespoke MCP /
   plain direct DB calls) on quality, speed, cost, architectural fit — build
   waits on the verdict.

## D. New scope opened 2026-07-30 — needs scoping input from the user

1. [ ] **Frontend (Tovu public site) gap pass** — what specifically? (theme
   coverage beyond the 4 built themes? products/store pages? nothing scoped yet)
2. [ ] **Admin app gap pass** — beyond ChatFab, what else needs attention?
3. [ ] **Plugin samples — CORRECTED, was NOT actually unscoped** (user called
   out this was already answered): the three deliverables are (a) harden
   `deploy-plugin.ts` (exploratory SPIKE today, only Vercel implemented,
   deliberately unwired from `bootstrap.ts`), (b) lipay (= C1 above), (c)
   frontend/admin integration so both plugins are actually usable end-to-end
   from the live site, not just backend modules. Sequenced after C1 lands.
4. [ ] **AI tests**: an eval pass across the ~20+ now-wired agent-tool domains
   confirming the assistant can actually invoke them correctly end-to-end, not
   just pass unit/contract tests. Ties into the existing
   `AI-Dev-Shop/harness-engineering/agent-evals/` framework — its
   bug-taxonomy.md / eval-design-playbook.md / README.md are mandatory reads
   before any eval fixture/suite work per `AI-Dev-Shop/CLAUDE.md`.

---

## Open questions (unanswered, need the user)

1. ~~NLWeb vs MCP-search~~ — landed (`a689082`), re-read and verified 2026-07-30
   part 3: recommends direct DB calls to start; the real open variable is
   whether public-facing agent *actions* (not just search) are on the near-term
   roadmap.
2. ~~Supabase MCP federation (read-only tool access)~~ — landed and verified
   (`19d0320`, `9b284b7`). **But this is NOT the same thing as the question
   below — do not treat it as having answered #6.**
3. Keep, discard, or fold the local `ChatFab.tsx` size edit? — resolved by
   circumstance: it landed as its own commit (`6b8cc47`, 2026-07-30 part 3)
   paired with the CSS container fix, since both were needed for the icon to
   actually render at the intended size.
4. What exactly is in scope for D1 (frontend) and D2 (admin) beyond what's listed?
5. ~~mcp-ui gate choice~~ — answered: real MCP-UI protocol, not the flag. Landed
   and test-verified 2026-07-30 part 3 (232/232 mcp-ui tests pass).
6. **STILL OPEN, asked twice now, unanswered both times: Supabase as an actual
   database backend** (not the read-only assistant-tool federation in #2). The
   user's own words: "i want them to be able to set up a supabase db project
   completely new and have it be the database and not sqllite... a user decided
   they dont want to use sqllite so they see the supabase plugin and create one
   on Supabase through this Tovu platform." This is materially bigger than #2 —
   `ContentDb` is concretely SQLite-typed today, no Postgres adapter exists, and
   the real unknown is whether `declareDataModule()`'s raw-`better-sqlite3` DDL
   engine (ADR-023) can be made provider-agnostic. Needs its own spec/ADR pass
   before any code is written — do not start building it without that.

---

## Known-unreliable, do not treat as findings

- Killed agent `a53da1c442023e91d` (lipay opus review) — mid-thought fragment only, no verdict.
- Killed agent `a8f20dc9a5cf63768` (bolt.diy Supabase research) — returned nothing.
