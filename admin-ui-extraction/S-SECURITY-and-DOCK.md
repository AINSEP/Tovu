# S-SECURITY and S-DOCK. Read `COMMON-ADMIN.md` and `T-SCREEN.md` first.

## S-SECURITY: Tovu uses Jini's security module; Tovu's feature is retired (owner decision 11-10)
Measured: Tovu `features/security` = **6,108 source lines in 32 files + 2,394 dictionary + 7,980 test lines**; three
files over 500 (`rules.ts` 1,133, `AccessTokensTab.tsx` 1,068, `hooks/use-access-tokens.hooks.ts` 939); 19
hook-debt keys. Jini `packages/admin/src/security` = **746 lines in 22 files**, no Tovu import site, tabs
`AccessTokensTab` (19 lines) and `RootKeyTab` (22). So "port the Tovu-only behaviour" is most of the feature:
Jini's module is a skeleton about one eighth the size. This is 4 runs, not 1.
**Home (round 2):** the module stays where the owner named it, `packages/admin/src/security` (`@jini-ai/admin/security[/react|…]`,
keys exist at `packages/admin/package.json`). Round 1's move to `user-management` (D-5) is not planned (lesson 27:
no work against a decision the owner already made). So S-SECURITY no longer waits for JM5.
Class of everything here: credential and key management UI. Describe changes by class and location only.

Tovu parts (files in `inventory.tsv`, area `f/security`):
| Part | Tovu files (lines) | Jini today |
|---|---|---|
| Access tokens | `AccessTokensTab.tsx` 1,068, `AccessTokensTab.hooks.tsx` 203, `hooks/use-access-tokens.hooks.ts` 939, `access-tokens-{dependencies 98,port 79}`, `use-copy-keys` 78, `CopyKeysDialog` 33 | `AccessTokensTab` 19 + hooks 65 + controller 71 |
| Other credentials | `OtherCredentialsSection.tsx` 264 + hooks 51, `use-other-credentials` 455, deps 96, port 36 | controller 46 |
| Site key + recovery | `SiteKeyTab.tsx` 286 + hooks 32, `use-site-key` 163, `use-site-key-recovery` 183, `SiteKeyRecoveryCard` 108, `RecoveryCodesCard` 86 + hooks 44 | `RootKeyTab` 22 + hooks 27 + controller 57 |
| Rules, page, permissions | `rules.ts` 1,133, `Security.tsx` 198, `use-security-permissions` 43 + deps/port | `rules.ts` 82, `SecurityPage` 9 |
Edges out of the Tovu feature: `deployment:5`, `source-control:2`, `media:1`, `@jini-ai/user-management/react` (TOTP,
passkeys already delegate), `@jini-ai/core/agent-handles` 10. Edge in: `deployment:3`.

| Run | Work | Estimate | Needs |
|---|---|---|---|
| a | **Design, by an Opus-class model, not Sonnet** (recipe: `S-design-first.md`, T-DESIGN): the operation trace below, the behaviour diff (one row per user action, as S-ROLES step 1) and the partition of `rules.ts` (1,133) and `use-access-tokens.hooks.ts` (939) by their real dependency graph (state cells, timers, clipboard, reveal lifetimes). Output: the port list, the migration graph, the test table. | 280k | A1 Step D (credential helpers have their final owner) |
| b | Access tokens + copy-keys into Jini, tests first | 240k | a |
| c | Other credentials + site key + recovery codes into Jini | 240k | a |
| d | Tovu switches to the Jini module (`panels.tsx`, `modules.hooks.ts`, `jini-kits.ts` edited by this run), retires `features/security`, Chrome check | 200k | b, c, and the `deployment → security` 3 imports resolved (S-DEPLOY or a slot) |
**Run a, step 1: the operation trace (characterize, never invent; lesson 31; round-1 judge finding 8).**
Round 1 listed tests for behaviour nobody had read ("a created token's plaintext is shown once", "every write
control is absent without the manage permission"). Both are removed. Verified instead at `e801e9ae`:
- the only permission the screen reads is `admin.security.site-key.manage`
  (`hooks/use-security-permissions.hooks.ts:8-17`); it decides whether the **Site key tab is offered**
  (`Security.tsx:153-163`) and is `false` while the `/auth/me` read is in flight, on purpose (unknown = hidden);
- the Access Tokens tab is composed separately (`AccessTokensTab.tsx:117-145`) and reads no such permission;
- saved publish credentials come back as metadata only, by design: no token, no ciphertext, no masked suffix
  (`api/security-api.types.ts:9-18`).
The design run produces this table, one row per credential operation the UI offers (list, create, edit, revoke or
delete, rotate, copy keys, other credentials set/clear, site key view/rotate/recover, recovery codes
generate/confirm, …), with every cell cited:
| Operation | UI entry (`file:line`) | Port method + argument object | Server route and its authorization check (`apps/website` `file:line`; read only) | Response fields the client receives | Client state that holds a secret-bearing value, and where it is cleared |
Rules for the table: a cell you cannot cite is written `NOT FOUND`, never guessed. "Server authorization" names the
predicate the route runs, per security profile if the route differs by profile (lesson 13).
**Step 2: parity tests come only from table rows.** For each row: the request (method, argument object, order);
the rendered result for one fixture; which controls exist for (permissions unknown / without / with the cited
permission) **as the code behaves today**; and, where the last column names a state cell, that the value is gone
from component state and DOM at the cited clearing point (unmount, dialog close, identity switch — only those the
code implements). Each test names the guard whose removal makes it fail.
Tests that are certain from the facts above and must be in the table: P1 the Site key tab is absent while
permissions are loading and when the permission is missing, present when held (fails if loading is treated as
allowed); P2 the Access Tokens tab renders in all three states; P3 `credentialDraftError` rethrows a
non-validator error inside the token form (A1 Step D's D1, through the form); P4 a credentials list fixture
containing an unexpected `token`/`secret` field never reaches the DOM (fails if a row is spread into the view).
**Step 3: proposed hardening is a separate list** ("show-once plaintext", "hide every write control without a
manage permission", anything else the designer thinks should exist). It is an owner decision, costed separately,
and **no run b-d implements it**: adding a secret-display path to satisfy a test would be a new disclosure path.
STOP for runs b-d: any secret-bearing value would pass through a Jini cache or a kit hook that persists results
(`rg -n "localStorage|sessionStorage|useFetchQuery|useCachedLoader" <the files being ported>`; each hit is checked
against the trace table's last column); or a run needs a behaviour that has no row in the trace table.

## S-DOCK: the assistant dock's generic part → `@jini-ai/chat/react`
Measured: `components/AssistantDock` = **6,395 source lines in 48 files + 2,197 dictionary + 7,821 test lines**; 50
hook-debt keys (the largest area); files over 500: `hooks/AssistantDock.hooks.tsx` 2,134, `AssistantDock.tsx` 665.
On merge-b (`450ac748`) the dock is already partly split (`AssistantDock.state.hooks.ts`, `DockChatPane.tsx` added;
`AssistantDock.tsx` is 240 lines there, `AssistantDock.hooks.tsx` still 2,134): **take the guard on the merged
branch; this section's line numbers are merge-a's.** The files in the table below exist with the same names on both.
Imports: `@jini-ai/chat` 33, `@jini-ai/ui` 25, features `fs-files` 3, `voice-input` 3, `skills` 2, `settings` 2, `webmcp` 1.
`chat/react` has no failure card, overflow modal or slow-run notice today (`rg -l "AgentFailure|OverflowModal|SlowRun" packages/chat/src` finds only an unrelated `MidRunUserMessage.tsx`): these are moves, not dedupes. Confirm by behaviour, not by name, before each.

Generic candidates (11-10 survey's ~2.1k, re-measured where a file exists):
| Piece | Tovu files (lines) | Target | Host supplies |
|---|---|---|---|
| Agent failure redaction + card | `agent-failure.ts` 208, `agent-failure-scanners.ts` 213, `agent-failure-hints.ts` 13, `AgentFailureCard.tsx` 21, `AgentFailureCard.hooks.ts` 82 | `chat/src/core/agent-failure/` (pure) + `chat/react` card | the scanner list (D-6: which scanners are generic) |
| Routed A2UI / MCP-UI surface cards | `RoutedA2uiSurfaceCard.tsx` 109, `hooks/use-routed-a2ui-surface-card.hooks.ts` 147 | `chat/react` | surface router port |
| Dock renderer registry | `hooks/use-dock-renderer-registry.hooks.ts` 194 | **split, not moved whole**: it already calls the existing registry owner (`:186-193`), so it is not a third registry. Generic part = the registration lifecycle (register on mount, unregister on unmount, re-register when the list identity changes) → `chat/react`; host part = the list of Tovu renderers and every endpoint/setting binding they close over → stays in Tovu and is passed in as the renderer list | renderer list |
| Header, settings menu, display preferences | `DockHeader.tsx` 118, `DockSettingsMenu.tsx` 141, `dock-header-rules.ts` 220, `chat-display-preferences.ts` 109 | `chat/react` | preference store port, menu items |
| Overflow modal + overflow-aware surface card | `MessageOverflowModal.tsx` 79, `MessageOverflowModal.hooks.tsx` 59, `OverflowAwareMcpUiSurfaceCard.tsx` 72, `hooks/useOverflowDetection.hooks.ts` 79 (**separate files today; round 1 wrongly said they were inside the two large files**) | `chat/react` | copy; the surface card component it wraps |
| Slow-run notice | `SlowRunNoticeCard.tsx` 41, `SlowRunNoticeCard.hooks.ts` 63 | `chat/react` | copy, the threshold |
| Folder-drop notices | `FolderDropConfirmation.tsx` 53, `FolderDropError.tsx` 64, `FolderDropNotice.tsx` 38, `FolderDropPathHint.tsx` 39 | `chat/react` if step 0 shows no Tovu path/daemon knowledge inside; else stay | copy, path formatter |
Stays in Tovu: `execution-config-write.ts`, `chat-package-kind.ts`, `resolve-composer-discovery-outcome.ts`,
`assistant-dock-props.tsx`, all Tovu policy, publishing and daemon wiring, the Tovu tip.

| Run | Work | Estimate | Needs |
|---|---|---|---|
| a | Pure pieces: agent-failure (434 lines + tests) into `chat/src/core`; class: **redaction of failure text**. Lesson 24: redaction is not disclosure permission; the card shows the redacted text only, and "Copy details" copies the redacted text. Tests: each scanner's fixture still redacts; an unknown secret shape is not shown raw. | 160k | D-6 |
| b | Surface cards (`RoutedA2uiSurfaceCard`, its hook) + the registration-lifecycle half of the renderer registry + header/menu/preferences as `chat/react` components, hooks as props, `jini-chat-*` classes, `messages.en.ts`; Tovu repoints, dictionary parity test. `RoutedA2uiSurfaceCard` reads `AdminChartRegistryContext` (`:75`): the registry snapshot becomes a **prop** supplied by the Tovu wrapper, which keeps reading the context (T1b test S8 must stay green). | 240k | a; T1b; xpkg D-CHAT rulings |
| c | Overflow modal + overflow-aware card + overflow detection, slow-run notice, folder-drop notices (647 lines in 11 existing files): move as components, hooks as props. **No split design of `AssistantDock.hooks.tsx` is needed for this run** (round 1 required one because it believed the code was embedded). | 200k | b; merge-b merged |
The 2,134-line `AssistantDock.hooks.tsx` stays Tovu wiring; splitting it is Tovu size work (`development/scripts/size-debt.json`), not part of this extraction. It is listed in INDEX section 9.
Run c, tests first (GREEN on the Tovu code, RED under the mutation, still GREEN after the move):
| # | Asserts | Fails when |
|---|---|---|
| O1 | **single live surface** (class: duplicate live tool-confirmation session; the invariant is documented at `OverflowAwareMcpUiSurfaceCard.tsx:25-42`): with a counting fake surface card, at every point of collapsed → expand → collapse exactly **one** instance is mounted; never two, never zero after the transition settles | the inline card stays mounted while the modal copy mounts (the `expanded ? null : …` swap is lost) |
| O2 | a pending confirmation answered in the modal copy calls the tool-call callback once | both copies are wired to the same callback and both live |
| O3 | the overflow control appears only when the fake measurement reports overflow, and disappears after a resize that removes it | detection is not re-run on resize |
| O4 | the slow-run notice appears after the threshold with a fake clock and is removed when the run ends or the dock unmounts (no timer left: `vi.getTimerCount()` is 0) | the timer cleanup is dropped |
| O5 | registry lifecycle (run b): renderers are registered once on mount, unregistered on unmount, and a new list identity replaces the old registrations with no duplicate id | registration leaks across mounts |
Visual check YES for b and c: real chat on localhost, each supported CLI, failure card, overflow, A2UI and MCP-UI
cards, folder drop, 390 px sheet mode (the sheet's slide animation must still run on the phone width).
STOP: a piece reads `features/settings`, `features/skills`, `features/webmcp` or a Tovu endpoint directly and the
sheet gives no port for it.
