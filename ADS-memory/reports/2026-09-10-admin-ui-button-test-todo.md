# TODO (later, not now) — admin UI button coverage + the agent-plugin uninstall affordance

Raised by the owner 2026-09-10. Deferred deliberately; do not start without her go-ahead.

## 1. The agent-plugin delete button is not a regression

Verified 2026-09-10. `apps/admin/src/features/plugins/AgentPluginRow.tsx` renders the trash button
with a literal `disabled` attribute and an `aria-describedby` note explaining why. Nothing removed
the capability; it has never been live. The in-file rationale checks out against the code:

- `features/agent-plugins/uninstall.ts`'s `uninstallAgentPlugin()` refuses any package whose
  activation record says `origin: "bundled"` (`AgentPluginNotUninstallableError`), because
  `recordBundledAgentPluginIfAbsent` re-seeds it on the next boot — a delete would appear to
  succeed and then silently reappear.
- Every installed package today IS bundled. `installAgentPluginFromUrl` exists but has zero
  production callers, so nothing can arrive as `operator-installed`.
- There is no HTTP uninstall route. Confirmed: `server/inbound/admin-http/routes/agent-plugins/`
  contains only `deps.ts`, `list.ts`, `set-enabled.ts`. The only wrapper is an assistant tool.

So a live button would refuse on every row that exists. The disabled state is honest.

**But it is a dead affordance, and that matters more now.** The owner wants a marketplace where a
vendor publishes a plugin and an operator downloads it. That path is exactly
`installAgentPluginFromUrl` + `origin: "operator-installed"` + an HTTP uninstall route — none of
which are wired. Uninstall becomes real at the same moment install-from-url does. Track them as one
piece of work, not two.

## 2. The actual ask: UI tests that a button does what it claims

The owner's words: "we need a test for that to make sure it isn't happening. We probably need a
whole lot of UI tests for buttons in it to make sure they work."

The failure class to catch is NOT "the button renders" — it is **a control that renders and is
reachable but is wired to nothing, or wired to a handler that cannot succeed for any real row**.
A render-only assertion passes on every one of those.

Shape worth considering when this is picked up:
- Enumerate interactive controls per admin screen and assert each is either (a) wired to a handler
  that reaches a real port, or (b) explicitly `disabled` WITH an accessible explanation — the
  agent-plugin trash button is the reference example of (b) done right.
- A control that is neither is the defect.
- Watch for the codebase's dominant defect shape: correct primitive, unwired call site. Assert the
  sink, not the handler.
- jsdom has no `<details>` toggle, and React root delegation makes `stopPropagation()` a false RED
  (assert `event.defaultPrevented` from a document capture listener instead).

## Why this is not in development/todos.md

That file had uncommitted changes from another session at the time of writing. Move this entry
there once the tree is clean.
