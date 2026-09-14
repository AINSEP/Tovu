# tovu-ce → tovu-c0 handoff

**From:** session `tovu-ce`. **Date:** 2026-09-05. Branch `restructure/apps-website-phased`.
Inherited from `tovu-26`, whose own worklist (`2026-09-05-tovu-26-worklist.md`) is still the
authoritative history of everything before this session.

---

## 0. THE ACTIVE COMPLAINT — fix this first

**Leona asked for a TAB SYSTEM on the Sites page. She got a header button and a separate page, and
the tab bar was deleted. That is a regression against an explicit instruction, and it is my fault.**

Her words, twice:

> "Maybe we actually need a tab system for this. So the first tab is all sites. Second tab is create
> new or create or something. And then in the tab, we have cards for all the sites we have currently
> active."

> "What I wanted was a tab system. I specifically told you a tab system. And then the new website
> will be a tab with a list that will create a new website. That should go back to the first tab, and
> then we should see the new website created there. It shouldn't go to another page. It makes no
> sense to have a `?tab=...` that's another page and then delete the tab I specifically asked you to
> create in the first place."

**What she wants, concretely:**
- **Two tabs: "All sites" and "New site."** A real tab bar, both tabs visible.
- **The create form lives INSIDE the "New site" tab** — not a full-page view, not a `?tab=new` route
  that reads as a separate page with a back link.
- **On successful create, return to the "All sites" tab** with the new site's card visible there.

**How it went wrong (so it is not repeated):** her first request was a two-tab system, and it was
built that way (`92731735`). Then she showed screenshots of Tovu Runner, where "Create website" is a
header button leading to a full page. **I relayed that as a correction and it overrode her explicit
instruction.** The agent implemented my correction faithfully (`554f6183`), which emptied the tab bar
to one item, so it removed the bar. The agent's reasoning was sound; the instruction was wrong.

**The lesson worth carrying: a reference screenshot is not an instruction. When a reference conflicts
with something the owner stated in words, the words win — or you ask.**

Current state on disk: header `+ New site` button → `?tab=new` full-page "Create a site" screen with
a `← All sites` back link. **All of that needs to become two tabs.** The onboarding screen's *content*
(sections, the three database options) is good and should be preserved inside the tab.

---

## 1. Live agents — DO NOT COLLIDE

Three of my subagents were still running when I was told to stop dispatching. **Check `ListAgents`
and `git status` before touching their scopes.** Leona has said **no more subagents** — these are
pre-existing, not new.

| Agent | Scope | Status |
|---|---|---|
| `coverage-100-refactor` | `apps/admin/src/{lib,components}/**` | running — refactoring to reach 100% |
| `voice-wire-composer` | `Jini/packages/chat/**`, `apps/admin/src/features/voice-input/**`, `apps/desktop/src/speech/**` | running |
| `fix-model-discovery` | `Jini/packages/agent-runtime/**` | running |

---

## 2. Standing rules from Leona this session

- **1-2 test/coverage-running agents maximum, across all sessions.** A big backlog is the argument
  FOR the cap. Everything else queues.
- **350k token cap per subagent; report and stop by ~300k.** Put it in the SPAWN PROMPT — mid-flight
  messages to a busy agent arrive late or not at all (this bit me three times today).
- **Commit incrementally**, as each unit goes green. Never hold a batch uncommitted.
- **Opus for the Sites/admin UI work** — she asked for it explicitly after Sonnet output she rejected.
- **Never delete production code for a metric.** Refactor/extract to make it testable: yes. Delete: no.
  Her words: *"if we have excessively difficult tests, that means we have excessively bad code that we
  need to extract and refactor and just fix."*
- **She dictates by voice; proper nouns garble.** "Genie" = Jini, "dograh"/"Superbase" = Dograh/Supabase,
  "sonic" = Sonnet. Resolve against repo vocabulary and **state your reading inline** so she can
  correct it cheaply.
- **She wants to SEE things working**, not be told they work. Leave things running; give exact URLs
  and click paths.
- **Keep replies short.** She is listening to them.

---

## 3. Landed this session — verified, do not redo

| Area | Commits |
|---|---|
| Astra audit F1 `.env` written 0644 | `852265ae` |
| F2 unconditional catch + sibling at `active-site.ts:161` | `f36bd199` |
| F3 widget `header` collision — **CONFIRMED, not refuted** | `fc1a506a` |
| F4 `sites.ts` complexity 11→8 | `fac1d6cd` |
| Chat DB split: `chat.db` sidecar wiring | `0fb84ae0` |
| Chat data migration script (dry-run default, **not yet run**) | `ac171e6d` |
| `duplicateSite` + `sites_duplicate_site` assistant tool | `bcf09c62`, `0bf7f08e` |
| OG image emission rule + ADR-PIPE-008 amendment | `faf4df15`, `02ecfc2c` |
| SEO media picker (`MediaRefField`) + wiring | `578165bd`, `b391a69f` |
| Hook races: post editor, page editor, checkPreview | `42c6a534`, `8739739e`, `af11273a` |
| Gemini batch: sites/settings (5 commits) | `838b2667`, `31a06461`, `244a3b9c`, `56578834`, `5423ba97` |
| Gemini batch: backfill scripts (5 commits) | `3fb55bdf`, `adcf0e42`, `f199c6c3`, `ac29e900`, `523d0556` |
| Coverage `admin/lib` 99.2%, `admin/components` 98.8% | `e149b98d`, `1e26d6c2` |
| Nav: Sites above AI Assistant | `8e0928af` |
| Sites: served site now appears in the listing | `561f62ce` |
| Sites: square cards, path tooltip, panel removed | `bb8e3589` |
| Voice: macOS on-device speech spike + mic button | `7e5c54c6`, `5524e8e7` |

**Share cards now work end to end.** Verified live: `curl -sk https://localhost:3000/` renders an
`og:image`, and that URL returns `200 image/webp` anonymously.

---

## 4. Needs Leona's decision — carry these forward

1. **The tab system** (§0). Highest priority.
2. **Chat data migration has NOT been run.** The `chat.db` wiring is live, so **new chats go to the
   new database while her existing chat history sits in `content.db` and is invisible in the UI.**
   Nothing is lost. Runbook — back up first:
   ```
   cp sites/tovu-com/content.db sites/tovu-com/content.db.bak
   npx tsx development/scripts/split-chat-data-into-chat-db.ts --db sites/tovu-com/content.db
   npx tsx development/scripts/split-chat-data-into-chat-db.ts --db sites/tovu-com/content.db --apply
   ```
   Deliberately never run against her real data by an agent.
3. **`stash@{0}` holds PRE-FIX versions** of two backfill scripts (an agent used `git stash` against
   the house rule and recovered). A bare `git stash pop` would restore old code over committed fixes.
   **Four other stashes are someone else's real work — do not touch those.** Drop `stash@{0}`?
4. **Dry-run behaviour change**: `backfill-custom-credential-usernames.ts`'s dry run now requires
   `TOVU_INTEGRATIONS_ROOT_KEY` (it previously needed no key — a documented, tested property). Traded
   for an accurate count. Keep or revert?
5. **A7/C11 — data safety, never ruled on.** `index.ts` (the `npm run dev` path) has no schema guard:
   `openContentDb` migrates unconditionally, so dev can silently migrate a `content.db` that
   `tovu serve` would refuse to open. Two agents confirmed independently. Changes boot for every dev.
6. **Untrimmed credential whitespace** (`use-external-mcp.hooks.ts`'s `omitIfBlank`) — documented as
   intentional legacy. Trimming changes what a stored secret *is* and needs a data decision.
7. **12+ stray screenshot PNGs at repo root** from agent verification runs, going back to Aug 30.
8. **Real data written to her dev DB**: a site-wide OG image and an override on the Home entry.
9. **Browser mic button**: macOS on-device recognition is native-only. In a browser the only option
   is Web Speech, which **uploads audio to Google** — contradicting local-first. My recommendation was
   to disable it in-browser rather than do that quietly. Not ruled on.
10. **Per-site tabs** (Runner's strip): an agent argued against them — each Runner tab embeds a
    separate running server, while Tovu's admin is bound to one site at boot, so a per-site tab would
    claim a switch that requires a restart. It costed an honest version. Her call.

---

## 5. Open work, not started

- **`apps/desktop` multi-site + crash-safety is BUILT AND UNCOMMITTED** — `site-registry.cjs` (223
  lines, wired into `main.cjs`), `keyed-serializer.cjs`, `selftest-tracker.cjs`, all untracked from an
  agent stopped mid-flight. **Nobody has verified any of it.** Also `apps/desktop` spawns a **stale
  Aug-28 CLI at schema v50 while source is v57**, so it rejects sites made from current code. Fix by
  spawning from source via `tsx` — **not** by running `npm run build` (Jini is deliberately linked).
- **Voice is ~90% done and blocked on one thing**: Jini's composer has no way for host code to insert
  text into the draft. `voice-wire-composer` is adding that prop now. macOS on-device transcription
  **works, verified, 0 MB downloaded**. Push-to-talk should be **hold-space-when-composer-is-empty at
  ~400-500ms**, not the 4s she first suggested (key-repeat types spaces; 4s is too slow).
- **Model discovery**: `fix-model-discovery` is live. Effort levels are **per-model, not global**
  (Astra supports `ultra`, Luna stops at `max`, GPT-5.5 at `xhigh`). She wants the effort control to
  **appear after a model is chosen** and re-derive on change. **The admin-side dependent-dropdown UI is
  NOT dispatched** — the agent will hand back a contract to build against.
- **Postgres/Supabase at site creation**: `initSite` hardcodes SQLite. The create route reads only
  `name` and discards everything else. Supabase currently ships visibly unavailable, guaranteed
  structurally (`createSite()` takes no argument). Wiring Postgres in is unstarted backend work.
- **"Repair this site"** — write correct marker files into `sites/tovu-com`, deriving the real schema
  version from the db rather than guessing. Costed at ~half a day. **Never guess the stamp: migrations
  auto-apply here and that is 44 MB of real data.**
- **Gemini findings still queued**: `check-governance-adr-scope-drift.ts` (4 dormant edge cases),
  `dead-path-sweep.ts` design gaps (2, no live trigger), `apps/admin/src/lib` finding 17, and
  `components` findings 33 + 37 — **33 was upgraded to a confirmed live defect** (AssistantDock's
  unmemoized `sandboxProxyUrl` defeats a real memo boundary in Jini's `useMcpUiHost.ts`).
- **Small debts never actioned**: A9's two unverified boot divergences (`tovu serve` skips the
  production-readiness gate entirely); `MediaRenditionRouteDeps`'s doc is measurably FALSE; three
  copies of `collectImageAssetIds` with no consolidation verdict; `deps.ts:27` stale cross-reference;
  `dev.mjs`'s `main()` at complexity 11 with `.mjs` outside the gate entirely.
- **A latent trap I agreed to mark and never did**: `resolver-service.ts`'s `resolved` map is keyed by
  `ref.id` and is staged data — occurrence-specific options must be applied at substitution. Without a
  comment there, the next per-occurrence option silently reintroduces the F3 bug.
- **Two seeded media fixtures are corrupt**: "blue-circle" and "red-triangle" 422 with "source image
  could not be processed."
- **Nobody has run a type check all session** — it is banned because it OOMs the box. Three agents
  flagged it. Real new code has landed at the composition root. Worth one run on a quiet machine.

---

## 6. Traps that cost real time today

- **`grep` is ugrep** — three silent-zero modes: a `--` before the pattern turns later
  `--include`/`--exclude-dir` into file operands; searches reach `dist/`/`coverage/`; **NUL-byte files
  are silently skipped as binary** (`command grep -a`). Prove a pattern can match before believing a zero.
- **`git show -- <path>` prints NOTHING when the pathspec matches no file** — same silent-zero class.
  Burned me on `fc1a506a` (`render.ts` lives under `public-http/http/site/`, not `features/widgets/`).
- **Never read an exit code through a pipe.** **`timeout` does not exist on macOS.** **Never `2>/dev/null`.**
- **The Playwright MCP browser is SHARED across agents** — one agent's resize landed on another's tab
  twice. Never run two visual-verification agents concurrently; open your own tab.
- **`screencapture` returns only desktop wallpaper** in agent sessions. Playwright is the only route.
- **`env -u TOVU_ADMIN_PASSWORD` must be UNSET** — empty string does not work.
- **`apps/website` tests run from the REPO ROOT** (node runner, never drop `--test`); **`apps/admin`
  from `apps/admin`** (vitest). Pass your own `--coverage.reportsDirectory` — two coverage runs clobber
  `apps/admin/coverage/.tmp`.
- **Judge machine headroom by `memory_pressure`'s free percentage, NOT load average.** Box crashed at
  load 721 today.
- **`apps/admin/src/features/menus/**` is Leona's own uncommitted work — permanently off-limits.**
