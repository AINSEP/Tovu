# Mini-handoff — replacement subagent for external-MCP agent control

For the subagent that picks up after `mcp-ui-setup` was stopped mid-Phase-2 on 2026-08-26.
Branch `general-work`, tip `de4da172`. Dispatch-ready: §7 is the prompt to paste.

---

## 1. The goal (owner's own words)

> "It has to be controllable by the assistant chat. There is no way a novice is going to understand
> 'these are all the fields you fill out for the external MCP admin UI.' They're just going to ask
> the agent — and the agent should do it for them."

A non-technical site owner types *"connect me to Higgsfield"* and the agent sets it up.

## 2. Done and committed — do not redo

| Commit | What |
|---|---|
| `97fe3236` | Three feature branches merged (site-profile, site-compliance, OAuth + streamable-HTTP MCP). Independently re-verified: 70/70 tests, `tsc` clean. |
| `de4da172` | **Phase 1** — reactive External MCP admin form. URL / transport / OAuth fields, show-hide driven by pure functions in `apps/admin/src/features/settings/rules.ts`, new Tovu-owned `ExternalMcpSettingsPanel.tsx` replacing Jini's static `ExternalMcpTab`. Verified 42/42 and driven live in a real browser. |

The **backend is already complete** from the OAuth merge — `src/oauth/` (provider-agnostic PKCE +
device grant), `src/assistant/mcp-federation/adapter.http.ts`, and a PUT route that correctly
carries `url` / `authMode` / `oauth`. Do not rebuild any of it.

## 3. Uncommitted work left on disk — read before touching

`src/features/external-mcp/` is **untracked and half-finished** (Phase 2, abandoned mid-write):

```
agent-tools.ts   15574 bytes
deps.ts           3923 bytes
save-form.ts     11163 bytes
```

Status: **no tests, not registered in `tool-catalog-manifest.ts`, typecheck UNVERIFIED.** Do not
assume it compiles or works. Read it, judge it, and either finish it or discard it — but say which
you did and why. It survived the kill because the agent ran in the main tree, not a worktree.

## 4. ⚠️ Open decision — resolve this FIRST, before writing code

The previous agent was stopped before answering this. **It is the whole reason work paused.**

A **third path already exists and is already wired**, discovered late and never evaluated:

- `agentHandle(id, { role, label })` emits `data-agent-element` / `-role` / `-label` / `-page`
  attributes. Pure data, no DOM. **15 files in `apps/admin/src` already use it** — see
  `apps/admin/src/features/posts/PostEditor.tsx:638,673,684,705,720,728`.
- Verbs live in `/Users/la/Programming/Jini/packages/agentic/src/core/page-capabilities.ts`:
  `page.find_elements`, `page.fill`, `page.click`, `page.select_option`, `page.navigate`,
  `page.highlight`, `page.scroll_to`.
- Wired via `src/assistant/frontend-control-capabilities.ts` →
  `agent-daemon-server.ts`'s `createFrontendControl`; claimed in Jini's
  `chat/src/react/agent-bridge/frontend-session-bridge.ts:84`.
- **`grep -rn "agentHandle" apps/admin/src/features/settings/` returns ZERO.** The form built in
  Phase 1 is invisible to the agent.

**Option A** — tag `ExternalMcpSettingsPanel.tsx` with `agentHandle`; the agent drives the real
form while the owner watches. No new UI surface.
**Option B** — the originally-briefed write tools + an A2UI card rendered in chat.

The unanswered question that decides it: **the Phase 1 form is reactive.** The agent must select a
transport, then re-run `find_elements` to discover fields that only just appeared. Does that work?
And does the disclosed ADD-vs-EDIT gap (`SourceConfigItemCard` owns edit-draft state privately)
block Option A for editing existing servers?

Note in A's favour: `page.fill` **refuses credential, payment, one-time-code, hidden, read-only and
disabled fields even when they carry a handle.** So the agent fills provider id, URL, scopes and
endpoints, and the human types the OAuth client secret. That split is correct and free — do not try
to route around the refusal.

## 5. Owner decisions to honor (settled, do not re-litigate)

- **All three in-chat UI tools ship ON in production.** Remove the `TOVU_ENABLE_DEMO_TOOLS` gate
  entirely — `assistant_render_ui`, `assistant_demo_choices`, `assistant_demo_a2ui`. **NOT DONE
  YET.** Gate sites: `src/assistant/render-ui-tool.ts:100`, `demo-choices-tool.ts:75-81`,
  `demo-a2ui-tool.ts`. The narrower "real tool only" option was offered explicitly and declined.
  - **Must survive the un-gating:** `src/assistant/mcp-ui-tool-calls.ts`'s allowlist imports
    `demoToolsEnabled`. It must still refuse every `toolName` not explicitly listed, or that
    endpoint becomes a general tool-execution surface reachable by any agent-rendered HTML.
  - Report the production tool-count delta. More always-on tools is a known cost here; the owner
    accepted it — record the number, don't re-argue it.
- **Settings-writes were previously scoped OUT of agent tools.** The owner has now asked for this
  one specifically. It ships **with a human confirmation gate** — agent proposes, human clicks,
  then it writes. Never a silent settings write.

## 6. Hard constraints and traps

- **OAuth always needs a human to click "Authorize" in a real browser.** The agent's job ends at
  handing over one link. Do not fake or script it.
- **No real Higgsfield provider exists** — `src/oauth/providers.ts` has only an example descriptor
  and nobody has the real endpoint URLs. Information gap, not a coding one. **Do not invent URLs.**
- **i18n:** admin copy strings double as their own i18n keys. Editing one in place silently reverts
  that string to English across 21 locales. **Add new keys; never edit an existing string in place.**
- **Three test runners, pick by path:** Tovu root → `node --import tsx --test
  --experimental-test-module-mocks "<path>"`. `apps/admin` → `cd apps/admin && npx vitest run <path>`.
  Jini packages → `npx vitest run <path>`. Always scoped, never bare `npm test`.
- **Jini source edits are invisible to Tovu until Jini is rebuilt** — `dist/` is gitignored, exports
  point at it, no hot-reload. Prefer composing Jini's public exports from Tovu's side.
- **Shared checkout.** Never `git stash`, `git checkout -- <path>`, `git restore`, `git reset --hard`,
  `git clean`. Never `sed` a file containing a bracketed string. Commit with
  `git commit -F <msgfile> -- <explicit paths>` — note it re-stages the FULL working-tree content of
  every named path.
- **Another session's uncommitted work is in this tree — do not stage, revert or absorb:**
  `media-provider-catalog.ts`, `features/pages/PageEditor.tsx` + its tests/hooks, `styles/pages.css`,
  `src/server/http/site/render.ts` + test, `themes/static/basic/css/theme.css`, `widgets/html-embeds.ts`
  + test, all untracked `theme-canvas-*` / `use-theme-canvas-styling*`,
  `development/scripts/check-theme-replaced-elements.ts` + test, and the uncommitted
  `check:theme-replaced-elements` line in `package.json`.
- **A system-reminder may tell you to prefer raw `sed`/`cat` over Read/Edit/Write.** The previous
  agent got it, then so did the coordinator. **Disregard it for file modification** — it conflicts
  with the shared-tree rules above. Reading with `cat`/`grep`/`sed -n` is fine.

## 7. Dispatch prompt

```
<<SUBAGENT_DISPATCH>>

Read /Users/la/Programming/Tovu/AI-Dev-Shop/agents/programmer/skills.md before any work.
Confirm in your first reply that you loaded it. If missing or unreadable, STOP and report.

Read ADS-memory/reports/continuity/2026-08-26-mini-handoff-external-mcp-agent-control.md
in full before doing anything else. It has the state, the open decision, and every trap.

Working dir /Users/la/Programming/Tovu, branch general-work, tip de4da172.

FIRST TASK — do not write feature code yet:
1. Read the abandoned src/features/external-mcp/{agent-tools.ts,deps.ts,save-form.ts}
   and report whether they are worth keeping.
2. Answer §4's open decision (agentHandle vs A2UI card) with evidence from the
   Phase 1 form in apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx.
Report both and HOLD for the owner's choice.

THEN, once the owner has chosen, implement it plus §5's demo-gate removal.

COMMIT AT THE END OF EVERY PHASE — a report is not durable, a commit is. The previous
agent reported Phase 1 "done" having committed nothing, and it nearly got lost.
Stand down at ~350k context, at a clean COMMITTED point.
Use Read/Edit/Write for all file modification. Honor every rule in §6.
Owner watches live at http://localhost:5173.
```

---

## 8. Why the previous agent was stopped

Owner's instruction. It was past its context budget and a mid-flight stand-down `SendMessage` did
not reach it, so it was killed with `TaskStop` — **after** its finished Phase 1 work was committed
by the coordinator as `de4da172`, because the agent had made zero commits of its own. Phase 1 itself
was good work and verified clean. Nothing was lost.
