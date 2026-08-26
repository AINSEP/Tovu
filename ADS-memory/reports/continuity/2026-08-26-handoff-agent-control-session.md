# Handoff — agent-control session (2026-08-26)

Tovu `general-work` @ `56af1fdb` · Jini `general-work` @ `80994382`
Both trees green: `npx tsc -p tsconfig.json --noEmit` exits 0 in Tovu and in Jini's touched packages.
No agents running. Nothing uncommitted that belongs to this session.

---

## 1. The one thing to read if you read nothing else

**We spent the session making the admin UI agent-controllable. Then we tested it live, and the
assistant never used any of it.** Twice, in the real browser admin chat, it went straight to backend
tools (`taxonomy_create_term`, `taxonomy_create_taxonomy`) and issued **zero `page.*` calls.**

That is not a failure — using a backend tool is the *correct* choice when one exists. But it means:

- The tagging work is a **fallback path** for actions with no backend tool, not the main path.
- **Before tagging more screens, find out which actions have no tool.** That is where handles earn
  their keep. Tagging the other ~40 screens blind is not obviously worth it.
- The bigger, provable problem is elsewhere — see §4.

---

## 2. What shipped

**Tovu** (36 commits since `d4cd84c7`; the notable ones):

| Commit | What |
|---|---|
| `0ced6347` `365ac5a7` `97fe3236` | Merged three finished feature branches: `site_get_profile`, site-compliance plugin, generic OAuth + streamable-HTTP MCP transport |
| `de4da172` | **Reactive External MCP admin form** — URL/transport/OAuth fields that show and hide as you pick. Replaces Jini's static `ExternalMcpTab` with a Tovu-owned panel composed from Jini's lower-level exports |
| `ae22d4b9` | **All four in-chat UI tools ship enabled**; `TOVU_ENABLE_DEMO_TOOLS` gate removed entirely. Measured 150 → 154 wired tools |
| `46907402` `a08efb4d` `9528f618` `5d4a774e` | Tagged 5 feature screens with agent handles: Forms, Collections, Taxonomy, Users, Media |
| `3617d08a` `8572625a` `d3691dd3` `26a5686a` | `apps/admin/src/components/` **complete** — pass-through `agentHandle` prop on every reachable shared component |
| `44f3809f` `e45d32be` `56af1fdb` | RowMenu wired on 11 screens |
| `f9c97b00` | Tovu's `agent-list-handles.ts` is now a thin re-export of Jini's |
| `fc78ebb1` | The regression test that drives the real `executePageCapability` + `createDomPageDriver` |
| `415f3dc0` | Rescued an abandoned agent-tool domain (`src/features/external-mcp/`) — **still unwired, no handlers, no tests** |

**Jini** (4 commits):

| Commit | What |
|---|---|
| `c87a512d` | `agentHandle?: string` on 4 `source-config-list` components |
| `53756aca` | Per-item handle policy moved into `packages/agentic/src/core/list-handles.ts` — `buildAgentListHandles`, id-keyed, suffix-search dedup |
| `fd917e2d` | `agentHandle` on **RowMenu**; added `@jini-ai/agentic` as a real dep of `@jini-ai/admin` |
| `80994382` | `agentHandle` on **ConfirmDialog**; labels carry the consequence tier (danger → "cannot be undone") |

**The convention, if you're adding handles:** caller passes ONE base string; the component derives
`<base>-<action>` and supplies each element's `role` and `label` itself. Host-supplied keys get
their own namespace. Omitting the prop emits zero markup. Handles go on the real interactive
element, never a wrapper. Read `Taxonomy.tsx` for the label-quality bar:
`"Confirm the plan and issue a one-time execution token — still commits nothing"`.

---

## 3. Live test results (real browser admin chat, not CLI)

Two runs, both successful, both via backend tools:

1. *"Add a term called Autumn to the dummy taxonomy"* → `taxonomy_create_term`. 15s, $0.51. Worked.
2. *"Create a new taxonomy called Seasons"* → searched tools, **then searched again for
   update/delete tools**, discovered there is **no edit-taxonomy tool**, so the flat-vs-nested choice
   is permanent — and **stopped to ask the user before creating**, with a recommendation. 21s +
   16s, $0.64 total. This is exactly the guided-workflow behaviour the owner wants. It works.

**Zero `page.*` calls in either run.**

---

## 4. THE GAP WORTH FIXING FIRST — stale UI after an agent write

**Proven live.** Immediately after the chat said *"Done. **Seasons** is created"*, the Categories &
Tags page beside it still listed only `dummy`. On the first run it at least said *"Refresh the
screen to see it"*; on the second it did not mention it at all.

**The fix already half-exists.**

- `apps/admin/src/lib/fetch-query/` wraps TanStack Query and **already exports `useInvalidate`** —
  refetch and re-render, no page reload, no Ctrl-R.
- `apps/admin/src/lib/settings-refresh-bus.ts` **already does exactly this for settings.** Its own
  doc names the two publishers: `AssistantDock.tsx` when an assistant run finishes, and
  `settings-events.ts` when the server pushes over SSE. Subscribers re-read through the normal
  authorized path; the bus carries namespace names only, never values.

**So the job is: generalize that bus to content** (taxonomy, posts, pages, media, collections,
users…). Same trigger, same shape, wider scope. The assistant-run-finished publisher already exists.

Note there is **no `page.reload`/`page.refresh` verb** — the 7 `page.*` verbs are `find_elements`,
`highlight`, `scroll_to`, `click`, `fill`, `select_option`, `navigate`. Adding one is an option but
the bus is the better answer, since it fixes the SSE/other-tab case too.

---

## 5. Open work, roughly in the order I'd do it

1. **Generalize the refresh bus to content.** §4. Small, proven pattern, fixes the thing you can feel.
2. **Find out which actions have NO backend tool.** That tells you whether more tagging is worth it.
   Without this, tagging the remaining ~40 screens is speculative.
3. **RowMenu portal gap — still unresolved.** `RowMenu.tsx:186` portals its dropdown to
   `document.body`. Tovu's driver is scoped to `<main>` on purpose (`App.hooks.tsx`, `createDomPageDriver({ root: contentEl })`
   — the doc comment says the chat pane sits outside that subtree so a page verb cannot reach the
   assistant's own UI). **Net: RowMenu triggers are reachable, its dropdown items are not.** Preferred
   fix: give RowMenu a portal-container prop so the host targets a node inside `<main>`. Do NOT widen
   the driver scope — that boundary is deliberate.
4. **`ConfirmButton.tsx`** (`packages/admin/src/react/components/ConfirmButton/`) — third Jini gap,
   zero handles. Same fix as RowMenu/ConfirmDialog. Small.
5. **`Comments.tsx` and `Pages.tsx`** — the only two screens skipped in the RowMenu sweep, both
   blocked by another session's in-flight work. Follow `Posts.tsx`, near-identical shape.
6. **`src/features/external-mcp/{agent-tools,deps,save-form}.ts`** — committed as WIP in `415f3dc0`.
   Not wired, not in `tool-catalog-manifest.ts`, no handlers, no tests. Finish or delete; don't leave.

---

## 6. Things you are probably forgetting — you asked, so here they are

- **Higgsfield was never tested.** The whole external-MCP OAuth backend is built and merged, and the
  admin form now exposes it. But `src/oauth/providers.ts` still has only an example descriptor, and
  **nobody has established whether Higgsfield even exposes an MCP server at all.** If it is a plain
  API, external-MCP is the wrong path and it should be a normal integration. That question is
  unanswered and blocks any real test. Also: OAuth always needs a human to click "Authorize" in a
  browser — no agent can do that leg.
- **The E2E test is still red** — `agent_tool_attempts` missing table. This has now survived **two**
  handoffs without being picked up. Three untested hypotheses in cheapest-first order are in
  `ADS-memory/reports/continuity/2026-08-24-2118-handoff-what-went-wrong.md` §2.2.
- **The admin chat's "Working directory" is the Tovu repo itself.** Visible at the bottom of the chat
  panel in today's screenshots. A vague prompt about "the site" can send the agent into editing this
  codebase. Documented but never fixed.
- **Skills and Components capability live tests** — still not done, from the original 10-item list.
- **Capability discovery is a SELECTION problem, and it is unsolved.** `ADS-memory/reports/2026-08-24-capability-discovery-retrieval-is-not-the-problem.md`:
  the agent wrote a good query, the right plugin came back **rank #1**, and it used **rank #5**.
  Better ranking cannot help above #1. There are 20 eval files in `development/evals/`. Any future
  test should measure *did it use the right capability*, not *did the right capability appear*.
- **Jini's `guard:drift` is RED at baseline** — ~10 pre-existing violations in `packages/admin`,
  `agentic`, `chat`, `cms`, `ui/features/{html-editor,mcp-ui}`. Not ours. Report deltas, not totals.
- **Jini's 4 new agent-label strings are untranslated** across the 22 locales. They land only in
  `data-agent-label` — agent-facing, never rendered to a human — so this is low stakes.
- **False-comment register entry F9** added (`ADS-memory/reports/2026-08-20-false-code-comments-register.md`):
  a comment claiming "three" demo tools when there were four. The generalizable lesson recorded
  there: **grepping a helper's NAME inventories that helper's callers, not instances of the
  condition.** Grep the env var / literal / config key.
- **Another session still has 14 modified + 11 untracked files in this tree** — PageEditor and pages
  hooks, media-provider-catalog, pages.css, site/render.ts, basic theme.css, html-embeds,
  theme-canvas-*, check-theme-replaced-elements, and an uncommitted `check:theme-replaced-elements`
  line in `package.json`. Jini has 14 dirty paths from a third session. Not ours, do not touch.

---

## 7. Operating rules that cost us time today

- **Mid-flight `SendMessage` to a subagent does not arrive. 0-for-3 today**, including re-sending on
  an idle signal. One agent stayed blocked ~45 minutes waiting for a clearance sent twice.
  **Stop and respawn with the information in the spawn prompt.** Do not send and assume it landed.
- **"Phase complete" does not mean committed.** An agent reported a finished, tested, browser-verified
  phase having made **zero commits** — a `TaskStop` then would have destroyed it. **Check
  `git log`/`git status` and commit their work before stopping any agent.**
- **Every brief needs the blocked-exit sentence:** *"If you become blocked by something outside your
  task, write it up in your final report and stop. Do not wait, retry, or schedule follow-up work.
  Ending blocked with a clear explanation is a successful outcome."* Also: no spawning subagents, no
  scheduling work. Source: `agent-poll-loop-postmortem.md` — a sibling project burned ~8% of a weekly
  budget on agents polling a blocker they could not clear.
- **Three test runners, pick by path.** Tovu root → `node --import tsx --test --experimental-test-module-mocks "<path>"`.
  `apps/admin` → `cd apps/admin && npx vitest run <path>`. Jini → `npx vitest run <path>`. Tovu root
  has **no vitest at all**. Always scoped.
- **Jini source edits are invisible to Tovu until Jini is rebuilt** — `dist/` is gitignored, exports
  point at it, no hot-reload. Build only the package you changed.
- **Claude-in-Chrome tabs need a window resize and a longer wait** or the admin renders blank and
  screenshots time out. That blankness is the tab, not the app — it has already produced one
  false-positive bug report on this project.
- Duplicate handles do not fail loudly. They make `page.click` resolve to whichever element the DOM
  reaches first. This bug class was hit **three separate times** today.
