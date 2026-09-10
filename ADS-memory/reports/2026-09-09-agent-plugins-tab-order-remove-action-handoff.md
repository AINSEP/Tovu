# Handoff: Agent Plugins tab-order + Downloaded row-action-swap (INCOMPLETE)

Rotating out at ~350k context per standing dispatch rule. This is a mid-task handoff, not a
finished deliverable — a fresh agent must finish the test rewrite before this is gate-clean.

## What was asked (owner corrections, via team lead, to already-shipped work)

Two corrections to `apps/admin/src/features/plugins/AgentPlugins.tsx` (previously shipped in
commits `d24645c6`, `dda463c2`, `5522ad8a`, `02103f85` — all green, all still valid):

1. **Tab order**: Installed first (default/active tab), Downloaded second, Marketplace third.
   Previously Downloaded was first.
2. **Downloaded's row action must be "Remove", not the Enable/Disable switch** — "so its not
   redundant with Installed." Installed keeps the real switch. Downloaded's row instead shows a
   single action button that reuses the same `AgentPluginDisableConfirmDialog`, reworded.

## Design decision made (not explicitly specified by the owner — flag for review)

The owner's wording described Downloaded's action as always "Remove". But Downloaded is
**unfiltered** — it lists disabled plugins too — and Installed only lists **enabled** rows. If
Downloaded's action were unconditionally "Remove" (mapped to disabling), there would be **no
control anywhere in the UI to re-enable a disabled plugin** — Installed can't reach it (filtered
out), and Downloaded would only ever offer to turn things further off. That would be a silent
functional regression (losing the enable path entirely), so I implemented Downloaded's row as
**context-sensitive**: "Remove" (opens confirm dialog, disables) for a currently-enabled row,
"Enable" (direct, no confirm — same as before) for a currently-disabled row. This preserves the
full round-trip. **This is my inference, not a verified instruction — flag it to the owner/team
lead before treating it as final.** If they actually want Downloaded to show "Remove" unconditionally
with no re-enable path at all, that's a straightforward simplification of what's already built (drop
the `enabled ? ... : ...` branch in `AgentPluginRowStateArea`'s remove-or-enable case), but it needs
an explicit answer to "then how does an operator re-enable a disabled bundled plugin?" before it ships
that way.

Also decided (lower-stakes, worth a sanity check): left the existing permanently-disabled
"Uninstall" trash icon **unchanged on both tabs** rather than removing it from Downloaded even
though Downloaded's new Remove button now does mechanically what that icon gestures at. Minimal-diff
call — flag if the owner wants it removed from Downloaded specifically once Remove exists there.

## Current file state — READ THIS BEFORE TOUCHING ANYTHING

### `apps/admin/src/features/plugins/rules.ts` — SHARED FILE, DO NOT COMMIT AS-IS, DO NOT REVERT

This file currently contains **two unrelated agents' uncommitted work interleaved**:
- **Mine** (bottom of file, from `filterEnabledAgentPlugins` at ~line 217 through
  `agentPluginRemoveOrEnableAriaLabel` at the end, ~line 291): complete, correct, needed by
  `AgentPlugins.tsx`/`AgentPluginRow.tsx` as they stand right now. `buildAgentPluginDisableConfirmCopy`
  now takes `{ name, variant: "disable" | "remove" }` (was `{ name }` only, in the earlier committed
  version) — this is a **breaking signature change** already reflected in this dispatch's own
  `AgentPluginDisableConfirmDialog.tsx`/hook, but it means the LAST COMMIT (`02103f85`) plus these
  working-tree changes together are what's needed for the tree to compile — the last commit ALONE
  does not have the new signature.
- **Someone else's, concurrently** (top of file, `describeApiError`/`pluginToggleControl` additions
  referencing `PLUGIN_UNINSTALL`/`PLUGIN_NOT_UNINSTALLABLE`/`PLUGIN_ENABLED`/`PLUGIN_ID_INVALID`):
  an in-progress uninstall feature for the **sibling** `Plugins.tsx`/`AdminPlugin` screen (NOT
  `AgentPlugins.tsx` — different type family, confirmed by reading the file). Also touched,
  uncommitted, by that same agent: `hooks/plugins-dependencies.hooks.ts`, `hooks/plugins-port.hooks.ts`,
  `hooks/use-plugins.hooks.ts`, plus new untracked files `PluginRemoveConfirmDialog.tsx`,
  `PluginRow.tsx`, `hooks/use-plugin-remove-confirm.hooks.ts`, `plugins-visuals.tsx`.

**I did not commit `rules.ts`.** Committing it would have bundled someone else's unfinished,
untested work under this commit's message and authorship — the shared-git-index risk this repo's
own memory notes warn about explicitly. My additions are sitting safely in the working tree (not at
risk of loss from an interrupt — only from someone running a destructive `git checkout`/`reset` on
this file, which nobody has been told to do). **Next agent: read the current file before touching
it. Do not revert either half. If you need to commit it, commit the CURRENT on-disk content — do
not try to reconstruct "just my part" by hand, and do not overwrite it with an older version from
this handoff or from git history.**

`tsc --noEmit` from `apps/admin` currently reports exactly 2 errors, both in
`hooks/plugins-dependencies.hooks.ts` (`PluginsPort` missing `uninstallPlugin`) — **that's the other
agent's in-progress state, not mine.** Zero errors in any file this handoff's commit touches.

### Files I DID commit (see SHA below) — production code complete, tests NOT yet updated to match

- `apps/admin/src/features/plugins/AgentPlugins.tsx` — tabs reordered (`installed`, `downloaded`,
  `marketplace`); `pendingDisableId` state replaced with `pendingDisable: { pluginId, variant } | null`;
  `onRequestToggleEnabled` (Installed) and new `onRequestRemove` (Downloaded) both feed it;
  `stateControlFor` factories passed per-tab into `InstalledOnlyPanel`/`DownloadedPanel`.
- `apps/admin/src/features/plugins/AgentPluginRow.tsx` — new exported `AgentPluginRowStateControl`
  discriminated union (`"toggle"` | `"remove-or-enable"`), replaces the old flat
  `onToggleEnabled: () => void` prop. New internal `AgentPluginRowStateArea` sub-component renders
  either the switch (unchanged markup) or the new Remove/Enable button.
- `apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx` — new required `variant:
  "disable" | "remove"` prop; title/body come from `rules.ts`'s now-variant-aware
  `buildAgentPluginDisableConfirmCopy`; confirm button label and all `agentHandle` suffixes are
  variant-aware (`-disable-confirm`/`-remove-confirm` etc).
- `apps/admin/src/features/plugins/hooks/use-agent-plugin-disable-confirm.hooks.ts` — forwards the
  new `variant` param through to `buildAgentPluginDisableConfirmCopy`.
- `apps/admin/src/features/plugins/__tests__/AgentPlugins.unit.test.tsx` — 2 NEW tests added and
  passing (RED-then-GREEN verified specifically for the row-action swap, as the team lead asked
  for): `"Installed's row keeps the switch, with no Remove action"` and `"Downloaded's row shows
  Remove/Enable, not a switch"`. **The other 23 pre-existing tests were NOT yet updated** — 8 of
  them now fail because they assert the OLD tab order/switch-everywhere behavior. Full current
  count: **17 passed, 8 failed, 25 total** (`env -u TOVU_ADMIN_PASSWORD npx vitest run --testTimeout=30000
  src/features/plugins/__tests__/AgentPlugins.unit.test.tsx` from `apps/admin`).

## The 8 known-failing tests and exactly what each needs (already worked out, just not typed in)

All 8 fail for one of two root causes: (a) they assumed Downloaded was the default/first tab, or
(b) they used `TOVU_DEPLOY_FLY` (the fixture's disabled plugin) expecting a SWITCH, which no longer
exists anywhere for a disabled plugin not shown on Installed.

1. `"renders the first horizontal tab as Downloaded, ahead of Installed and Marketplace..."` —
   rename/rewrite to assert **Installed** is first/active/aria-pressed, Downloaded second,
   Marketplace third, and that the default view shows only 1 listitem (Site Compliance — enabled),
   not 2.
2. `"reports each row's applied state with a switch AND a word..."` — split in two: an
   Installed-tab test asserting Site Compliance's switch is `aria-checked="true"` (there is no
   reachable "off" switch anymore, since Installed excludes disabled rows and Downloaded has no
   switch at all — this is a real, intended consequence of the redesign, not a bug); a
   Downloaded-tab test (or fold into the two new tests already added) asserting Tovu Deploy Fly
   shows an "Enable" button.
3. `"calls the controller with the row's own plugin when its switch is activated"` — uses Tovu
   Deploy Fly's switch to enable it; rewrite to click Downloaded's `"Enable Tovu Deploy Fly"` BUTTON
   instead (`getByRole("button", { name: "Enable Tovu Deploy Fly" })`), after navigating to
   Downloaded.
4. `"disables only the in-flight row's switch, and marks it busy"` — split into an Installed-only
   busy check on Site Compliance's switch, plus a new Downloaded-tab busy check on the Remove/Enable
   button (`aria-busy`/`disabled` still wired through the same `busy` prop, unchanged mechanism).
5. `"keeps every per-plugin fact, moving keywords and components behind the row's own expander"` —
   add `await userEvent.click(screen.getByRole("button", { name: "Downloaded" }))` before the first
   assertion AND again right after the `rerender(...)` call (defensive — `TabbedDialog`'s active-tab
   state is internal to a child component that should survive the `rerender`, but this wasn't
   possible to verify before the interrupt; re-click is a harmless no-op if state did persist, and
   correctness-critical if it didn't).
6. `"calls the controller with the row's own id when the expander is activated"` — same, click
   Downloaded first, then find Tovu Deploy Fly's expander button.
7. `"says what enabling actually does, and still offers no install or run action"` — default tab's
   lede text changed (Installed's lede now, not Downloaded's): assert against
   `/Their skills reach the assistant's prompt on every run/i` instead of
   `/Enabling one puts its skills in the assistant's prompt/i`.
8. `"does not open a confirm dialog when enabling a disabled plugin — only disabling asks first"` —
   rewrite to navigate to Downloaded and click `"Enable Tovu Deploy Fly"` instead of a switch (no
   switch exists for this row anywhere anymore); assert `onToggleEnabled` called once with
   `TOVU_DEPLOY_FLY`, no dialog appears.

## Also still needed (not started)

- **New tests for Downloaded's "Remove" confirm-dialog path specifically** (team lead explicitly
  asked for RED/GREEN evidence on this — the 2 tests already landed cover switch-vs-button
  PRESENCE, not the confirm-dialog interaction itself): click Downloaded's `"Remove Site Compliance"`
  button → dialog title `"Remove Site Compliance?"` (not `"Disable ... for this site?"`) → body
  contains `/stays right here on Downloaded and can be enabled again/` and `/ships with Tovu/` →
  Confirm button reads "Remove" (not "Disable") → clicking it calls `onToggleEnabled` once with
  `SITE_COMPLIANCE` and closes the dialog. Plus a Cancel variant. (Copy and wiring for this are
  DONE in `rules.ts`/`AgentPluginDisableConfirmDialog.tsx`/`AgentPlugins.tsx` — only the test is
  missing.)
- Full-suite rerun after all rewrites — target: 25+ passed, 0 failed.
- `tsc --noEmit` rerun after `rules.ts` stabilizes (once the other agent commits or the tree settles)
  to confirm the 2 current errors are genuinely theirs and not masking something real.
- Scoped complexity check (same command earlier agents in this thread used):
  `npx eslint --no-error-on-unmatched-pattern --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}' -f json apps/admin/src/features/plugins/AgentPlugins.tsx apps/admin/src/features/plugins/AgentPluginRow.tsx apps/admin/src/features/plugins/rules.ts apps/admin/src/features/plugins/AgentPluginDisableConfirmDialog.tsx` —
  not yet run against the FINAL state (was run and clean against an earlier intermediate state
  before the row-swap work started).
- Once green: **one commit** covering the test rewrite (matches the team lead's "same gates, one
  commit" instruction) — do not add more scope beyond finishing this specific rewrite.
- Report to team lead: SHA, final RED count (8, captured above) → GREEN count, tsc result (and the
  rules.ts caveat above), confirmation `Plugins.tsx` was not touched.

## Commit landed this session (this handoff)

See the commit immediately following this file's own addition in `git log` — message states
explicitly that it is a mid-task WIP snapshot, not a gated deliverable, and lists the 8 known-red
tests by name.
