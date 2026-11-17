# S-SECURITY and S-DOCK. Read `COMMON-ADMIN.md` and `T-SCREEN.md` first.

## S-SECURITY: Tovu uses Jini's security module; Tovu's feature is retired (owner decision 11-10)
Measured: Tovu `features/security` = **6,108 source lines in 32 files + 2,394 dictionary + 7,980 test lines**; three
files over 500 (`rules.ts` 1,133, `AccessTokensTab.tsx` 1,068, `hooks/use-access-tokens.hooks.ts` 939); 19
hook-debt keys. Jini `packages/admin/src/security` = **746 lines in 22 files**, no Tovu import site, tabs
`AccessTokensTab` (19 lines) and `RootKeyTab` (22). So "port the Tovu-only behaviour" is most of the feature:
Jini's module is a skeleton about one eighth the size. This is 4 runs, not 1.
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
| a | **Design, by an Opus-class model, not Sonnet**: behaviour diff (one row per user action, as S-ROLES step 1) and the partition of `rules.ts` (1,133) and `use-access-tokens.hooks.ts` (939) by their real dependency graph (state cells, timers, clipboard, reveal lifetimes). Output: the port list, the migration graph, the test table. | 250k | JM5 (security lives in its owner), D-5 |
| b | Access tokens + copy-keys into Jini, tests first | 240k | a |
| c | Other credentials + site key + recovery codes into Jini | 240k | a |
| d | Tovu switches to the Jini module, retires `features/security`, Chrome check | 200k | b, c, and the `deployment → security` 3 imports resolved (S-DEPLOY or a slot) |
Characterization tests the design must include (each must fail when the named guard is removed):
- a revealed secret value leaves the DOM and component state when the reveal ends, on unmount, and on identity switch;
- a created token's plaintext is shown once and is not kept in any cache, query result or storage key
  (`rg -n "localStorage|sessionStorage|useFetchQuery" apps/admin/src/features/security` lists the places to pin);
- copy-to-clipboard failure shows the plain-words error and does not log the value;
- every write control is absent, not merely disabled, without the manage permission, and the binding sends no
  request when a stale client tries (server stays the authority);
- recovery codes: the confirm step cannot be skipped by re-rendering; regenerating invalidates the shown set.
STOP for runs b-d: any secret-bearing value would pass through a Jini cache or a kit hook that persists results.

## S-DOCK: the assistant dock's generic part → `@jini-ai/chat/react`
Measured: `components/AssistantDock` = **6,395 source lines in 48 files + 2,197 dictionary + 7,821 test lines**; 50
hook-debt keys (the largest area); files over 500: `hooks/AssistantDock.hooks.tsx` 2,134, `AssistantDock.tsx` 665.
On merge-b the dock is already partly split (`AssistantDock.state.hooks.ts`, `DockChatPane.tsx` added): **take the
guard on the merged branch; this section's line numbers are merge-a's.**
Imports: `@jini-ai/chat` 33, `@jini-ai/ui` 25, features `fs-files` 3, `voice-input` 3, `skills` 2, `settings` 2, `webmcp` 1.
`chat/react` has no failure card, overflow modal or slow-run notice today (`rg -l "AgentFailure|OverflowModal|SlowRun" packages/chat/src` finds only an unrelated `MidRunUserMessage.tsx`): these are moves, not dedupes. Confirm by behaviour, not by name, before each.

Generic candidates (11-10 survey's ~2.1k, re-measured where a file exists):
| Piece | Tovu files (lines) | Target | Host supplies |
|---|---|---|---|
| Agent failure redaction + card | `agent-failure.ts` 208, `agent-failure-scanners.ts` 213, card + hooks (find: `rg -l AgentFailureCard`) | `chat/src/core/agent-failure/` (pure) + `chat/react` card | the scanner list (D-6: which scanners are generic) |
| Routed A2UI / MCP-UI surface cards | `RoutedA2uiSurfaceCard.tsx` 109, `hooks/use-routed-a2ui-surface-card.hooks.ts` 147 | `chat/react` | surface router port |
| Dock renderer registry | `hooks/use-dock-renderer-registry.hooks.ts` 194 | `chat/react` (diff against `tool-renderer-registry.ts` and `ext-event-renderer-registry.ts` first: likely a third registry) | renderer list |
| Header, settings menu, display preferences | `DockHeader.tsx` 118, `DockSettingsMenu.tsx` 141, `dock-header-rules.ts` 220, `chat-display-preferences.ts` 109 | `chat/react` | preference store port, menu items |
| Overflow modal, slow-run notice, folder-drop notices | inside `AssistantDock.hooks.tsx` / `AssistantDock.tsx` (not separate files on merge-a) | `chat/react` | copy |
Stays in Tovu: `execution-config-write.ts`, `chat-package-kind.ts`, `resolve-composer-discovery-outcome.ts`,
`assistant-dock-props.tsx`, all Tovu policy, publishing and daemon wiring, the Tovu tip.

| Run | Work | Estimate | Needs |
|---|---|---|---|
| a | Pure pieces: agent-failure (421 lines + tests) into `chat/src/core`; class: **redaction of failure text**. Lesson 24: redaction is not disclosure permission; the card shows the redacted text only, and "Copy details" copies the redacted text. Tests: each scanner's fixture still redacts; an unknown secret shape is not shown raw. | 160k | D-6 |
| b | Surface cards + renderer registry + header/menu/preferences as `chat/react` components, hooks as props, `jini-chat-*` classes, `messages.en.ts`; Tovu repoints, dictionary parity test | 240k | a; xpkg D-CHAT rulings |
| c | **After an Opus split design** of `AssistantDock.hooks.tsx` (2,134): overflow, slow-run, folder-drop notices | 150k design + 220k | merge-b merged; b |
Visual check YES for b and c: real chat on localhost, each supported CLI, failure card, overflow, A2UI and MCP-UI
cards, folder drop, 390 px sheet mode (the sheet's slide animation must still run on the phone width).
STOP: a piece reads `features/settings`, `features/skills`, `features/webmcp` or a Tovu endpoint directly and the
sheet gives no port for it.
