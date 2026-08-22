# Handoff: the Agent Plugin is wired and installed; an opt-in AG-UI canary is what blocks it live

Generated: 2026-08-21
Source: Claude Code (Opus 5, 1M), Coordinator — Review Mode, with 5 Sonnet subagents
Target: Claude Code, fresh session
Branch `general-work` · **26 unpushed commits** · Jini `packages/chat` has **3 unpushed commits**
All agent work committed; all agents stood down.

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this handoff.
>
> **Start with §1.** The Agent Plugin feature is BUILT, INSTALLED, and TESTED — but it does nothing
> in the owner's browser, and the reason is not a bug in any of it. Read §1 before touching code, or
> you will "fix" something that already works.
>
> Hard constraints: **never run `npm run test:cov` or bare `npm test`** (35 min, 2.7 GB, OOMs this
> machine). Scoped runs only. **Do not start Docker.** **Do not kill any process** — PID 9969
> (vite :5173) and the backend on :3000 are the owner's. Shared git tree, and a second session has
> ~100 uncommitted files in the Jini repo: `git commit -F <msg-file> -- <exact paths>` ONLY.

---

## §1 — THE STATE: it works on one path, and the owner's browser is on the other

The full chain is built and proven:

```
composer chip -> pluginRefIds -> POST /api/runs (contextRef) -> daemon resolves the installed
SKILL.md off disk -> prepends it to the prompt -> agent receives it
```

Every link has a test. `npm run test:e2e:agent-plugin-chip` (4/4) asserts the real outbound request
body carries `pluginRefIds: ["ui-ux-design"]`. `plugin-prompt-prefix.unit.test.ts` (5/5) asserts the
final assembled prompt contains the REAL installed SKILL.md bytes read independently off disk.

**But there are TWO transports, chosen by a localStorage flag:**

| | Path | Carries plugin refs? |
|---|---|---|
| Default (flag absent) | `POST /api/runs` + `contextRef` | **YES** — tested, passing |
| Canary (flag `= "1"`) | `POST /api/admin/v1/assistant/ag-ui-run` | **NO** — `context: []` hardcoded |

- `apps/admin/src/lib/assistant-transport-ag-ui.ts:63-65` — `isAgUiTransportEnabled()` returns true
  only when `localStorage.getItem("tovu:assistant-ag-ui") === "1"`. Key constant at `:54`.
- Selected at `apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx:712`.
- `assistant-transport-ag-ui.ts:293` — `context: []`, hardcoded. Never carried plugin refs.
- Governing doc is **ADR-059** (`ADS-memory/reports/architecture/ADR-059-assistant-transport-ag-ui-canary.md`):
  AG-UI is an **additive canary alongside** the default path, not a replacement. ADR-049's
  transport decision is superseded ONLY on that point; its Decisions 2–7 stand.

**The owner's browser has the canary enabled.** That is the entire reason the live A/B saw nothing.

**Fix, one line, no code change:**
```js
localStorage.removeItem("tovu:assistant-ag-ui"); location.reload()
```

**OWNER RULING (2026-08-21): do NOT wire plugin refs into the AG-UI canary.** The Coordinator
proposed it; the owner rejected it and was right. It is investment in an opt-in experiment, and the
tool approach in §5 makes the question moot. Do not re-propose it.

## §2 — What the live A/B actually proved (and did not)

Full write-up: `ADS-memory/reports/2026-08-21-agent-plugin-live-ab-experiment.md`.

Three real page-gen runs with the chip visibly pinned. Confirmed two independent ways that the
plugin never reached the agent: the spawned CLI's own transcript
(`~/.claude/projects/-Users-la-Programming-Tovu/<sessionId>.jsonl`) had **0** occurrences of
`AGENT_PLUGIN`, and a `window.fetch` interception captured `context: []` on the wire.

**That transcript-grep technique is reusable and needs zero code changes** — it is the cheapest
objective check for "did the prefix reach the agent." Use it.

**The experiment never tested the default path** — the root-cause message reached the agent too
late. So it says NOTHING about whether a working plugin changes output. That question is still open.

**Genuinely useful side finding:** 2 of 3 runs independently produced near-identical eyebrow strings
(`SMALL-BATCH ROASTERS · EST. <year>`) with zero plugin content, converging with the older
`/cinder-coffee-roasters` and `/thornwood-coffee-roasters` pair. That is the model's own prior for
this prompt shape. **It sets the bar: a working plugin must beat that, or "it looks different" means
nothing.** The exact original prompt is preserved in memory (`reference_tovu_agent_plugin_ab_prompt`).

New draft pages created (all new, existing two never touched): `/amber-fields-coffee-roasters`
(true control, no plugin), `/wren-and-anvil-coffee-roasters`, `/foxglove-coffee-roasters`.

## §3 — Shipped this session

**Tovu (14 commits, `cbde23c1..6133ad3e`):**
- `fetch-archive.ts` + `install-from-url.ts` — URL -> verified bytes -> `installAgentPlugin`. Scheme
  allowlist re-checked post-redirect; 32 MB cap on bytes ACTUALLY READ, not `Content-Length`;
  `integrity` is a tagged union so a caller can never pass off a self-computed digest as verification.
- `development/scripts/{package,install}-agent-plugin.ts` + `agent-plugin:package` / `agent-plugin:install`.
- `layout.ts` — workspace ids no longer must be UUIDs (owner decision, option B). The real id is
  `workspace-local`. Traversal/separator/whitespace still rejected. **Do not re-tighten.**
- The composer chip, `pluginRefIds` transport, and daemon-side resolve+prepend.
- `f125cae7` — the `/` slash path was typing the row's LABEL into the draft (Jini's `Composer.tsx:248`
  falls back to `label` when `insertText` is absent). Fixed with `insertText: ""`, same precedent
  `mcp:settings` already used. Proven RED first.

**THE PLUGIN IS REALLY INSTALLED:**
`infra/agent-plugins/ws/workspace-local/packages/sha256/f64f7a62e483a965d8c697d4403ff6e8a3ce5243ae3094a045f96f74d7b4a14d/`
46 files, frozen read-only, `plugin.json` byte-identical to Jini's source, 7 skills. `infra/` is
gitignored. Packaging is deterministic — re-zipping the source reproduces that exact digest.

**Jini (3 unpushed commits in `packages/chat`, NOT REBUILT — see §4):**
- `198bbbf1` — `ChatPane.tsx` silently discarded `composerSlots.leadingAccessories`. Closed at the
  type level, matching how `footerAccessories` was already excluded. Tovu unaffected (it uses the
  top-level `leadingAccessory` prop).
- `0bd6071e` + `4abd6c9b` — the pinned-context zone is now a first-class composer control: hairline
  seam, zero height/border when empty, single-row horizontal scroll, animate-on-populate,
  `prefers-reduced-motion`, and a scroll-state-aware shadow (shows only on sides with hidden content).

## §4 — DO THIS FIRST: the Jini rebuild is still pending

The 3 Jini commits are **not built**. Tovu imports `@jini-ai/chat`'s `dist/`, so none of the zone
work is visible in Tovu yet. The rebuild was deliberately held all session because agents were
driving the live admin.

Rebuild `packages/chat`, then **judge the zone in the REAL app** — all screenshots so far are from a
static harness with a synthetic dark palette, NOT Tovu's actual theme. The open question is whether
the scroll shadow reads as "swipe for more" at real size; it was adequate-not-obvious in the mockup.

Then **Task #1**: delete the ~57 uncommitted lines in `apps/admin/src/styles/assistant.css`. They are
the Tovu-side specificity hack (a 4-class selector purely to out-specify Jini's later-mounted
stylesheet) that the Jini zone replaces. Kept deliberately at the owner's instruction as a fallback.
Revert with `git checkout -- apps/admin/src/styles/assistant.css` (that exact path only), then re-run
`npm run test:e2e:agent-plugin-chip`.

## §5 — The owner's own architecture proposal, unbuilt and worth doing

Owner: *"should there be a tool to retrieve the mcps, plugins, agent plugins and outside stuff like
there's a search tool for components and tools?"*

Verified: 8 features already expose tools this way (`src/features/*/agent-tools.ts` — database,
deployments, pages, plugin-runtime, post, recovery, taxonomy, theme). **There is no
`src/features/agent-plugins/agent-tools.ts`.** That is the gap.

Why it beats today's prompt injection: injection spends ~9 KB of prompt on every message whether
needed or not and does not scale past a couple of pinned items; a tool is on-demand and adds
discovery. **Decisively: tools execute daemon-side through the ToolExecutor gate, not through the
browser transport — so a tool works on BOTH transports and today's entire canary problem never
arises.** That is why the owner rejected wiring AG-UI.

Caveat to design around: the chip carries *intent* ("use this one, now") that a tool alone does not.
Likely shape is both — chip sends a short pointer, tool fetches the content.

Not specced. The owner was asked whether to spec it and the session ended before answering.

## §6 — Constraints and traps that cost time today

- **Two transports.** Always confirm which one a browser is on before concluding anything about the
  assistant. This is the `trace the product's real path first` lesson, paid again.
- **`find -newermt "-N minutes"` is BROKEN on this machine** (bfs errors out). A Coordinator claim
  that an agent "wrote nothing in 15 minutes" rested on it. Use `git status` / explicit mtimes instead.
- Playwright's screenshot tool defaults to writing PNGs into the **repo root**. One agent caught and
  moved its own; `playground-whiteboard-live.png` (Aug 19, another session's) is still there.
- e2e ports 8051-8053: a finished run can leave the webServer bound; the next run dies EADDRINUSE.
  `kill -TERM` the specific PIDs (they are the test's own), wait ~3 s, re-run.
- Mid-flight messages to subagents land LATE or not at all. Two directives missed their window today
  (the original A/B prompt; the AG-UI root cause). **Put everything in the spawn prompt.**
- Agents that hand-drive a browser instead of writing a spec file produce nothing. One was stopped for
  it. Brief: *write the file first, run from the CLI, browser only to diagnose a CLI failure.*
- **Never assert on a model's reply text in a test.** An agent proposed "reply with this exact
  sentence" as the proof; it is non-deterministic and worthless as a gate. Assert on the wire payload
  and on the assembled prompt instead — two deterministic halves that meet.
- Do not touch (other sessions' uncommitted work): `apps/admin/src/features/plugins/{agent-plugin-catalog,agent-plugin-source-catalog}.ts`
  + their two tests, `src/assistant/__tests__/execution-credential-store.test.ts`, and **everything in
  the Jini repo outside `packages/chat`** (~100 staged files, a `packages/plugins` -> `packages/agent-plugins` rename).
- Never delete or modify site content to make a test pass. The coffee pages are evidence.

## §7 — Corrections made this session; do not re-inherit the originals

1. **"The plugin demonstrably reaches the agent."** Coordinator, overstated. True on the default path,
   false on the canary the owner's browser uses. Scope the claim to a transport.
2. **"Wire the plugin into AG-UI."** Coordinator proposal, rejected by the owner. See §1.
3. **"`Composer.tsx`/`AttachmentTray.tsx` are in Tovu."** Coordinator, wrong — they are in Jini
   (`packages/chat/src/react/components/`).
4. **"The chip icon is a toy-looking emoji."** Coordinator, wrong — a mockup artifact. `puzzle` is a
   real Jini UI icon (`packages/ui/src/react/components/Icon.tsx:234`).
5. **Two sibling reports still describe the agent-plugin composer row as a dead `insertText` literal.**
   Stale as of `f125cae7`; the row now has `insertText: ""` and a real `pluginRefId`. The neighbouring
   `skill:ui-ux-design` row IS still a plain insertText and is a different mechanism — do not conflate.

## §8 — Next Steps, ordered

1. Rebuild Jini `packages/chat`; judge the pinned-context zone in the real admin (§4).
2. Task #1 — revert `apps/admin/src/styles/assistant.css` (§4).
3. Clear `tovu:assistant-ag-ui` in the browser, then re-run the A/B **on the default path** with the
   preserved original prompt. Use the transcript-grep to confirm injection BEFORE judging visuals (§2).
4. Decide on §5 (the agent-plugin discovery tool). Spec before building.
5. 26 Tovu commits and 3 Jini commits are **unpushed**.

## Suggested Skills
- `codebase-memory` — structural queries over the two transports / tool registry without re-grepping.
- `frontend-design` — if the zone needs another pass after the real-app look.
- `handoff` — to regenerate this at the next boundary.

## Handoff Contract
- **Inputs used:** live `git log`/`status`/`show` in both repos; direct reads of `assistant-transport-ag-ui.ts`,
  `AssistantDock.hooks.tsx`, `layout.ts`, `install.ts`, `Composer.tsx`, `ChatPane.tsx`, ADR-049/ADR-059;
  independent re-runs of the e2e suite (4/4), the daemon prompt-prefix suite (5/5), the agent-plugins
  suite (103–105/105) and a full `tsc --noEmit` (exit 0); an independent re-package of the real plugin
  reproducing digest `f64f7a62…`; a direct `sqlite3` read of `infra/content.db`; 5 subagent reports,
  each spot-checked rather than accepted.
- **Output summary:** lets a fresh session resume without replaying the day, and stops it from
  "fixing" a feature that already works on the path it was built for.
- **Risks:** the Jini zone has never been seen in the real app. The A/B's central question is still
  unanswered. 29 commits across two repos are unpushed. §5 is unspecced.
