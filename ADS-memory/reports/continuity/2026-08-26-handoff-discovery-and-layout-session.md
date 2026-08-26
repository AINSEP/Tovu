# Handoff — discovery gaps + layout session (2026-08-26, afternoon)

Tovu `general-work` @ `76bca46a` · tree green (`npx tsc -p tsconfig.json --noEmit` exits 0)
**No agents running.** Nothing uncommitted that belongs to this session.
26 dirty paths in the tree belong to **two other sessions** — untouched all day, do not touch.

Prior handoff: `2026-08-26-handoff-agent-control-session.md` (`4cec3874`). This session starts there.

---

## 1. The one thing to read if you read nothing else

**Three separate discovery bugs got conflated into one for weeks. They are not the same bug and they
do not share a fix.** Naming them was the most valuable output of the day:

| Failure | What it looks like | Example | Status |
|---|---|---|---|
| **Selection** | right answer ranks **#1**, agent uses **#5** | `ui-ux-design` plugin | **UNSOLVED** (task #7) |
| **Registration** | right answer never enters the catalog at all | Word Count plugin | **FIXED** (`905d5248`) |
| **Activation** | registered and rankable, but switched **OFF** | `site-compliance` plugin | **found, not flipped** (task #12) |

Every future eval must say which of the three it is measuring. The 2026-08-24 report
(`retrieval-is-not-the-problem.md`) is about **selection only** — it does not describe the other two,
and reading it as "the discovery problem" is how these got merged.

**All three were found by USING the product, not by auditing it.** The owner asked the admin chat a
normal question ("is there a way to count words in posts?") and the gap fell out immediately. That is
worth repeating as a method.

---

## 2. What shipped — 11 commits, all independently verified by the coordinator

I re-ran every subagent's tests myself rather than quoting their reports. Where I could not
reproduce a claim, it is marked below.

| Commit | What |
|---|---|
| `53eb29e0` | **Stale screen fixed.** `lib/content-refresh-bus.ts` — sibling of `settings-refresh-bus.ts`, not a merge (mixing `"taxonomy"` and `"core.language"` in one string space would make every settings panel refetch on a content write). Publisher is the existing assistant-run-finished trigger. Taxonomy is the only subscriber — a proving slice. |
| `9ccc4003` | Plugin discoverability audit (report only) |
| `0b0ab25c` | **RFC 9728/8414 discovery + RFC 7591 dynamic client registration** — `src/oauth/discovery.ts`, `dynamic-registration.ts`, `bounded-json.ts` |
| `905d5248` | **Plugins enter `search_tools`.** One read-only `plugin_capability_<id>` tool per *enabled* plugin-runtime plugin |
| `99edd012` | A remote external-MCP connection discovers its own OAuth config and mints its own client |
| `19a79afd` | Stop requiring a client id on a hosted external-MCP OAuth connection |
| `bdab8773` | Exempt remote OAuth rows from the client-side identity rule |
| `4c5c0745` | **Two narrow-width layout bugs** — `white-space: nowrap` on `.tier`/`.status`, `flex-wrap: wrap` on `.editor-actions` |
| `287189b0` | Hide the FAB while the mobile sheet is open |
| `9e18afd9` | Repoint an admin OAuth-identity test |
| `76bca46a` | **Mobile scroll fixed** — `::after` spacer reserves room below the open sheet |

**Verification actually run by me:** taxonomy refresh 3 tests fail-first then 32 pass · plugin-runtime
38 pass · oauth/DCR 52 pass · admin CSS 3 pass · mobile-sheet E2E 4 pass · `tsc` exit 0 four separate
times · every commit checked against the 26 off-limits paths (all clean) · `grep -i higgsfield` over
the whole `src/oauth` + `src/assistant` diff returns **nothing outside tests**, so the
provider-agnostic rule in `providers.ts` held.

---

## 3. Two subagent corrections that were RIGHT and I was wrong

Both worth keeping, because both would have shipped a bug:

1. **`padding-bottom` does not work for the mobile scroll fix.** I specified it. On 375×667 with the
   sheet expanded, `padding-bottom: 92vh` = 613px, which plus existing padding exceeds
   `.admin-content`'s entire 615px allotment. **Padding has a hard floor at its own value**, so the
   box is forced taller than the viewport and the last row stays ~14px under the sheet at max
   scroll. Measured, reproducible. The fix is an `::after` spacer — ordinary content, so
   `overflow-y: auto` clips it and the box never grows. There is now a dedicated E2E test for
   exactly this case.
2. **Tool-id collisions DO fail loudly.** I told an agent they silently shadow. `@jini-ai/core`'s
   `createToolRegistry()` throws `ToolRegistry: tool "X" is already registered`. I had conflated it
   with the **DOM agent-handle** duplication bug, which is a different thing and does fail silently.
   Keep those separate.

---

## 4. Open work — full list, in the order I would do it

### Needs the owner, cannot be delegated

1. **#19 — Connect Higgsfield for real.** All the code is done and green, and **it has never touched
   the real server.** Every test is a loopback fixture.
   Steps: Settings → External MCP → URL `https://mcp.higgsfield.ai/mcp`, transport `streamable_http`,
   auth `oauth`, **leave client id blank** (that's what `19a79afd` enabled). Click Connect. **Owner
   clicks Authorize and signs in** — no agent can do that leg, it is a password.
   Then the battery prompt: *"Make me a hero image for the homepage — something warm and cinematic, a
   coffee roastery at dawn."*
   **Watch for:** does the image come back **inline in the chat**, not as a link? That is the owner's
   actual stated requirement for this whole surface.
   **Expect a `403 TOOL_NOT_ALLOWLISTED`** — browser-reachable tool calls go through
   `MCP_UI_REDEEMABLE_TOOL_IDS` (`src/assistant/mcp-ui-tool-calls.ts`) and Higgsfield's tools are not
   on it. Config line, not a bug.
2. **#12 — Flip `site-compliance` on.** It has been off since it was seeded (`system:seed`,
   2026-08-26 04:22). Admin UI exists: `apps/admin/src/features/plugins/AgentPlugins.tsx`.
   **The battery cannot test it until this is done** — a run today would look like a third
   "plugin does nothing" data point when the real cause is the flag.
3. **#17 — Mobile sheet peek height, A or B.**
   **A:** shrink peek from 58vh to ~35–40vh, or size to composer + last message. Cheap.
   **B:** collapse-to-pill after each turn — slim strip, page ~90% visible, tap to reopen.
   Rejected with reasons: full-screen takeover (kills the live-update visibility that is the whole
   point — `App.tsx` scopes `createDomPageDriver` to `<main>`); push-content-up (neither pane usable
   at 375–414px).
   **This got cheaper today:** `76bca46a` made the heights `--chat-sheet-peek` /
   `--chat-sheet-expanded`, shared by the sheet AND the scroll spacer. One number, one place.

### The battery, and what blocks it

4. **#2 — Build one Skill.** Never done, from the original 10-item list two handoffs ago.
5. **#4 — Build one regular Plugin.** None installed anywhere. Constraint: the plugin-runtime hook
   vocabulary is exactly **one** hook (`content.entry.beforeSave`) plus three capabilities
   (`content.read`/`content.extend`/`hooks.attach`). Scope it to a save-time hook; it cannot touch a
   public page.
6. **#6 — Run the live prompt battery.** Blocked by #2 and #4. Prompts drafted, and the design rule
   is fixed: **measure DID IT USE the capability, not DID IT APPEAR.**
   - External MCP: *"Make me a hero image for the homepage — something warm and cinematic, a coffee roastery at dawn."*
   - site-compliance: *"I'm about to launch this site in the EU. Is there anything on it that could get me in trouble?"*
   - ui-ux-design: *"My site looks kind of plain and amateur. How do I make it look more polished and professional?"*
     **Use this one word for word** — it is the only prompt with a known prior result (ranked #1, agent used #5). Changing it destroys comparability.
   - Also include `search_components`/`describe_component` — verified mounted at
     `agent-daemon-server.ts:901`, **never live-tested.**
   **Never name the capability in a prompt.** Naming it gives away the answer.
   **Warning:** the ui-ux prompt is the exact one that sent the assistant reading `PageEditor.tsx`
   last time, because of #10. Expect it again or fix #10 first.
7. **#7 — Does the agent ever SEE result #1?** Cheapest unresolved question in the selection bug.
   Hypothesis #3 from the 2026-08-24 report, never tested: truncation/rendering in the jini bridge.
   That report says check it FIRST because it would change the diagnosis entirely. Still nobody has.

### Real gaps found today, not yet built

8. **#15 — Backfill plugin data.** Word Count returns `count: null` for every post, because the hook
   only fires on save and nothing has been saved since the plugin was enabled. **This is every
   plugin, not a Word Count quirk** — any plugin lands empty on day one.
   Do NOT solve it by mass re-saving: that bumps `updated-at` on 13 posts and the dashboard's
   "Recently updated" list is ordered by exactly that field.
   Build a backfill that runs the hook and writes only `ext.*`, leaving dates/revisions/publish
   state alone.
   **Note:** this is also the *smallest safe version of "let the agent execute a plugin"* — same
   hook, triggered on demand, no new execution surface, no sandbox question.
9. **#10 — Admin chat cwd is the Tovu repo.** Still unfixed across three handoffs. The chat panel
   literally shows "Working directory: Tovu". Beyond the risk of the agent editing this codebase, it
   **hides gaps**: today the assistant routed around the missing word-count tool by shelling out to
   Bash and counting manually. It succeeded, so the gap was invisible until someone looked.
10. **#8 — Stage 2 of the refresh bus: SSE.** Stage 1 covers "agent wrote in THIS tab". Stage 2
    covers other-tab / other-operator / background-job. Mirror the settings path:
    `src/server/routes/admin/settings/events.ts` + its `change-feed.ts` server-side,
    `apps/admin/src/lib/settings-events.ts` client-side (EventSource, browser handles reconnect and
    `Last-Event-ID` replay which the server honors as a ledger cursor).
    The agent that built Stage 1 stopped without saying why it skipped Stage 2.
11. **#9 — The red E2E test (`agent_tool_attempts` missing table).** Has now survived **three**
    handoffs untouched. Three untested hypotheses, cheapest first, are in
    `2026-08-24-2118-handoff-what-went-wrong.md` §2.2. Start there, not from scratch.

### Known-broken, deliberately left

12. **Landscape phone (896×414) has the same FAB-over-content bug**, via a different path — width
    alone crosses the 640px breakpoint so it renders the *desktop docked pane*, and `avoidRightPx`
    puts the FAB on the "New term" Cancel button. Needs smarter logic in
    `useFabPosition`/`ChatFab.hooks.tsx` — behavior, not CSS. Screenshot:
    `.playwright-mcp/mobile-chat-sheet/09-landscape-896x414-docked.png`
13. **The mobile breakpoint is width-only** (`max-width: 640px`), so it cannot distinguish a small
    phone from a landscape phone.
14. **`src/features/external-mcp/{agent-tools,deps,save-form}.ts`** — committed as WIP in `415f3dc0`
    two handoffs ago. Still unwired, no handlers, no tests. Finish or delete.
15. **`ConfirmButton.tsx`** (Jini, `packages/admin/src/react/components/ConfirmButton/`) — zero agent
    handles. **RowMenu portal gap** — dropdown portals to `document.body`, outside the driver's
    `<main>` scope, so its items are unreachable. Preferred fix is a portal-container prop; **do NOT
    widen the driver scope**, that boundary is deliberate.

---

## 5. Questions still unanswered

- **Why does a #1-ranked result get skipped?** The core selection bug. Three untested candidates,
  and the cheap one (#7) has now been deferred twice.
- **Should plugins be invocable at all?** Sketched with the owner but not decided. The shape is
  agreed: a manifest declaring functions + args schema, which is *already* the shape
  `search_tools`/`describe_tool` returns — so discovery is free. **The undecided part is where plugin
  code runs**: in-daemon (fast, a bad plugin hangs everything) or sandboxed (safe, real machinery).
  That is a security decision and should not be answered as a side effect of a feature.
  Also agreed: pass a **postId**, not the post body — the plugin already holds `content.read`, and
  sending bodies through the agent's context is expensive. `plugin_capability_word_count` already
  takes `{"postId": "..."}`, so the pattern exists.
- **Does the mobile keyboard occlude the chat input?** **NOT TESTED — needs a real device.**
  Playwright has no on-screen keyboard. Code inspection found **zero** uses of `visualViewport`,
  `dvh`/`svh`/`lvh`, or a `viewport-fit`/`interactive-widget` meta anywhere in `apps/admin/src`;
  the sheet height is plain `vh` against the static layout viewport. Known iOS Safari risk with a
  focused input inside `position: fixed`. **Verify on a real phone before shipping any peek-height
  change.**
- **Is `enabled: false` the right default for a bundled agent plugin?** It is documented and
  deliberate, but the owner did not know it, and there is **no agent-facing tool to flip it**.

---

## 6. Things NOT tested

- **Skills — never live-tested.** Original 10-item list, now three handoffs old.
- **Components capability (`search_components`) — never live-tested**, despite being mounted.
- **Higgsfield — never touched the real server.** Loopback fixtures only.
- **The regular-plugin path** — nothing installed, so it has never run end to end.
- **`site-compliance`** — could not be tested; it was off.
- **Mobile keyboard** — see above.
- **Scroll chaining** at the bottom of `.admin-content` — the taxonomy page was shorter than the
  viewport, so it could not be proven either way.

---

## 7. Actions with NO agent-facing tool — a real answer to the prior handoff's open question

The prior handoff asked: *"find out which actions have no backend tool — that tells you whether more
tagging is worth it."* Three fell out of normal use today, without an audit:

1. **Enable/disable an Agent Plugin.** `plugins_set_enabled` exists but is the *other* plugin system.
2. **Backfill a plugin's data over existing content.**
3. **Execute a plugin on demand.**

These are the first concrete candidates for the `page.*` handle work, which the prior handoff
correctly identified as the **fallback** path for exactly this case.

---

## 8. Operating notes from today

- **Verify, then quote.** Every subagent claim in this document was re-run by the coordinator. Two
  were wrong in my favor and two of *my* instructions were wrong — see §3.
- **Idle notifications arrive without reports, and duplicate.** Four agents went idle silently;
  `git log` told the real story every time. `TaskStop` sometimes needs a second call — the first
  kills one instance. **Always check `git status` before stopping anything.**
- **Mid-flight `SendMessage` still does not arrive.** Put everything in the spawn prompt. To change
  a running agent's model, stop and respawn — check `git log`/`git status` first, `TaskStop`
  discards uncommitted work.
- **Keep comments proportionate.** One agent shipped a single-line CSS rule with a twelve-line
  comment and the owner called it bloat. The codebase does lean verbose, but match the code's size.
- **A dispatch brief that says "that's the owner's call" will stop an agent from fixing the actual
  bug.** That happened: the mobile agent fixed a FAB overlap and left the scroll bug because I had
  fenced the sizing. Fence *design decisions*, not *outcomes the owner asked for*.
- **Chrome tabs**: a Claude-in-Chrome tab errored and closed itself mid-session. Prefer Playwright
  for subagents — it drives its own browser and never fights the owner's tabs.
- **Three test runners, pick by path.** Tovu root → `node --import tsx --test
  --experimental-test-module-mocks "<path>"` (**no vitest at root**). `apps/admin` → `cd apps/admin
  && npx vitest run <path>`. Jini → `npx vitest run <path>`. Always scoped.
- **E2E tests get committed** to `development/e2e/` with their own config. `76bca46a` did this
  correctly — follow it.
