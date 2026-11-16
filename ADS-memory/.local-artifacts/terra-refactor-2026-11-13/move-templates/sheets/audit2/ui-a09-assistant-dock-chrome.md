# UI-A09: AssistantDock chrome -> `@jini-ai/chat/react` dock module (templates T-UI + T-SPLIT)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`); every cited line read that day. Row `audit2:A09` (15 files named, 1.4k lines). **PARTIAL by judgment**: 9 of the 15 move; 3 stay in Tovu for stated reasons; `RoutedA2uiSurfaceCard` is deferred to the C10 `surfaces` row. One un-listed file is pulled in (`chat-agent-plugin-preferences.ts`) because `dock-header-rules.ts` imports it.

Tier: S1 Sonnet, S2 Sonnet + **Opus review** (kit gaps, menu a11y), S3 Sonnet. est. executor tokens ≈ 110k (S1 30k, S2 50k, S3 30k). Chrome look owed after S3 (Dock gear menu, folder-drop notices, header with long titles, es locale).

## Precondition (HARD, checked at step 0 of S2; S1 does not need it)
`@jini-ai/chat/react/kit` (C9b) **does not exist at integ/wave-b**: `ls packages/chat/src/react/kit.tsx` fails and `packages/chat/package.json` has no `react/kit` entry (only `./react`, `./react/chat-pane`, `./react/embed`, `./react/styles/*`). KIT-INJECTION §2.4 designs it (components ErrorNotice, Icon; existing cleanup RemixIcon/InfoTip/...; hooks useAgentHandle/useFocusTrap/useInfoTip...). **S2 may start only when that file exists with an `Icon` and an `InfoTip` slot.** If C9b lands without `InfoTip` (it is listed as existing-code cleanup, not a "moved file" slot), S2 step 0 adds the missing slot to `kit.tsx` in a separate first commit (`feat(chat/react): kit InfoTip slot`) and stops for review. S1 (headless, no React) can land now.

## Verdicts per file (what moves, what stays, why)
| file (Tovu, lines, blob) | verdict | target / reason |
|---|---|---|
| `AssistantDock/assistant-runtime-preferences.ts` (79) `bfd12b13…` | SPLIT | types, defaults, `REPLY_LENGTH_OPTIONS`, `visibleAssistantRuntimePreferences` -> chat `dock/preferences.ts`; its ledger key constants + `load/save` calls stay Tovu (they use `CHAT_DISPLAY_NAMESPACE` = Tovu's `INTERFACE_NAMESPACE` from `@/lib/settings-tabs`) |
| `AssistantDock/chat-display-preferences.ts` (109) `a5414d6f…` | SPLIT | `ChatToolCallDisplay`, `ChatDisplayPreferences`, `DEFAULT_CHAT_DISPLAY`, `CHAT_TOOL_CALL_OPTIONS`, `chatPaneDisplayProps`, `sameChatDisplay` -> chat; `CHAT_DISPLAY_NAMESPACE`/keys/`read*`(uses `@jini-ai/admin/core` `readBoolean/readString/LedgerCandidate`: chat may not import admin)/`load`/`save`/`chatDisplayCandidates` STAY Tovu |
| `AssistantDock/chat-agent-plugin-preferences.ts` (27) `266de90b…` (not on the row) | SPLIT | `ChatAgentPlugins`, `DEFAULT_CHAT_AGENT_PLUGINS`, `CHAT_AGENT_PLUGIN_OPTIONS` -> chat; key + ledger half stays |
| `AssistantDock/dock-header-rules.ts` (220) `bb811176…` | MOVE | -> chat `dock/rules.ts`. Needs the two controller types and the runtime-controller type as structural `Pick`s (see Contracts) instead of importing Tovu hooks files |
| `AssistantDock/DockSettingsMenu.tsx` (141) `07cdf93b…` | MOVE | -> chat `react/features/dock/DockSettingsMenu.tsx`; `RemixIcon` -> kit `Icon`; `InfoTip` -> kit `InfoTip`; `useTaxonomyRowMenu` default **removed**: `useMenu` becomes a required prop (host hook port) |
| `AssistantDock/DockHeader.tsx` (118) `e42bbdc4…` | MOVE with slots | `SubagentsIndicator` (Tovu, uses ai-assistant i18n) and `DockHeaderTip` (Tovu) become optional slots; the delete confirmation already arrives as `conversationDelete.confirm` |
| `FolderDropConfirmation.tsx` (53) `8b103df2…`, `FolderDropError.tsx` (64) `baea64b1…`, `FolderDropNotice.tsx` (38) `af53f299…`, `FolderDropPathHint.tsx` (39) `8ba6df6b…`, `FolderPathButton.tsx` (26) `9f9179ca…` | MOVE | -> chat `react/features/dock/folder-drop/`; `Icon` -> kit; class prefix `tovu-folder-drop-*` -> `jini-folder-drop-*` |
| `hooks/use-assistant-empty-state.hooks.ts` (28) `93144cd3…` | MOVE | -> chat `react/features/dock/hooks/useAssistantEmptyState.ts` (types against `@jini-ai/chat/core` already) |
| `hooks/use-selected-agent-auth-warning.hooks.ts` (72) `98029cd2…` | **STAYS** | reads Tovu's `createExecutionPort` (module-cached sweep) and `selectedAgentWarning` (Tovu copy). Both are product/host (sign-in warning copy, BYOK mode). Only its type import `ExecutionPort`/`DetectedAgent` from `@jini-ai/ui` is the host's business. Re-judged: not generic |
| `RoutedA2uiSurfaceCard.tsx` (109) `3b41fa95…` | **DEFERRED to C10** | reads `playground-render-target-bus` and `AdminChartRegistryContext` (Tovu product) and imports `@jini-ai/ui/interactive-ui.css`; C10 designs the single `surfaces` port. No slice here |
| `lib/admin-frontend-session.ts` (27) `553c283c…` | **STAYS** | `adminFrontendTabId` + the WebMCP page-confirmation channel; both are Tovu admin concerns and it imports `assistant-dock-bus` |
| `lib/assistant-dock-bus.ts` (124) `832a7025…` | SPLIT | the *mechanism* (open state + request pub/sub, `useSyncExternalStore`-shaped) -> chat `core/dock/dock-bus.ts` as `createAssistantDockBus()` returning an instance; Tovu keeps one module singleton `assistantDockBus` (so `resetAssistantDockBus` stays a Tovu test helper) |

## Guards (blobs at integ/wave-b)
```
tovu_files (move/split, then delete or reduce):
  - the 13 AssistantDock files and 2 lib files above, blobs in the table (take with `git hash-object` at step 0; the 8-hex prefixes above are the check, the executor records the full ones)
tovu_edited (stay):
  - apps/admin/src/components/AssistantDock/AssistantDock.tsx   (imports DockHeader :5, dock-header-rules :9, chat-display-preferences :10, assistant-runtime-preferences :14: guard by text)
  - apps/admin/src/components/AssistantDock/assistant-dock-props.tsx   (FolderPathButton :6)
  - apps/admin/src/components/AssistantDock/DockLeadingAccessory.tsx   (FolderDropNotice :4)
  - apps/admin/src/components/AssistantDock/DockHeaderTip.hooks.ts   (`shouldShowHeaderTip` :4: STAYS importing from chat after S3)
  - apps/admin/src/components/AssistantDock/hooks/{use-chat-display-preferences,use-assistant-runtime-preferences,use-chat-agent-plugins}.hooks.ts, chat-display-preferences.adapter.ts
  - apps/admin/src/components/AssistantDock/hooks/AssistantDock.hooks.tsx (:9 bus import), apps/admin/src/App.hooks.ts (:46), apps/admin/src/lib/assistant-prompt-bus.ts (:3), apps/admin/src/features/ai-assistant/hooks/use-admin-assistant-switch.hooks.ts (:3)
  - apps/admin/src/styles/assistant.css (selectors renamed), apps/website/src/features/settings/admin-interface.ts (comments only: :30, :38 name the moved files; reword)
jini_guards:
  - packages/chat/src/react/index.ts | blob 25a68a066ec61580d23576331c0cbdd4dd4f070c
  - packages/chat/src/core/index.ts | blob 18909e5faa2d2b64a5cb8dea854a2e21ab3ea6c6
  - packages/chat/package.json | blob 7b78526cd91e192494552c87044d76f114bd099c
  - packages/chat/src/react/components/ChatSettingsSegmented.tsx | blob 7139e14a0fe7cfdbf20d4fe5ff284b5cea8bbc83
  - packages/chat/src/react/tool-call-display.ts exports `ToolCallDisplay = 'show'|'collapsed'|'hidden'` (:19): the dock's `ChatToolCallDisplay` becomes an alias of it (Tovu's file says "declared here so this compiles against a chat build that predates it": that reason is gone, state it)
  - packages/chat/src/react/features/dock/** , packages/chat/src/core/dock/** must not exist
```
Importer census (all at integ/wave-b, `rg` 2026-11-16): `dock-header-rules` <- AssistantDock.tsx:9, DockHeaderTip.hooks.ts:4, DockSettingsMenu.tsx:8, tests `DockSettingsMenu`, `agent-plugins-setting`, `dock-header`, `chat-settings-tooltips`; `chat-display-preferences` <- AssistantDock.tsx:10, `use-chat-display-preferences.hooks.ts:9`, `use-assistant-runtime-preferences.hooks.ts:4`, `use-chat-agent-plugins.hooks.ts:4`, `chat-display-preferences.adapter.ts:4`, DockHeader tests, `components/__tests__/AssistantDock.chat-settings.unit.test.tsx:9`; `assistant-runtime-preferences` <- AssistantDock.tsx:14, `dock-header-rules.ts:11`, the runtime hook :5, 3 tests; `assistant-dock-bus` <- 4 prod files (above) + 6 tests (`assistant-dock-bus.unit.test.ts`, `assistant-prompt-bus.unit.test.ts`, `use-site-transfer.hooks.unit.test.tsx:9`, `AssistantDock.hooks.unit.test.tsx` x2, `daemon-prewarm-error`, `daemon-starting-label.integration`, `AiAssistant.unit.test.tsx:7`, `use-admin-assistant-switch...unit.test.ts:25`).

## Contracts
`packages/chat/src/core/dock/dock-bus.ts` (headless, no React):
```ts
export interface AssistantDockBus {
  getOpen(required?: Record<string, never>, optional?: Record<string, never>): boolean;
  subscribe(required: { listener: () => void }, optional?: Record<string, never>): () => void;
  publishState(required: { open: boolean }, optional?: Record<string, never>): void;       // owner (App) -> subscribers; unchanged value does not notify
  subscribeRequests(required: { listener: (open: boolean) => void }, optional?: Record<string, never>): () => void;
  request(required: { open: boolean }, optional?: Record<string, never>): void;            // sections -> owner
  reset(required?: Record<string, never>, optional?: Record<string, never>): void;         // test hook, also exported by the instance
}
export function createAssistantDockBus(required?: Record<string, never>, optional?: Record<string, never>): AssistantDockBus;
```
Behaviour is the module's today (read `assistant-dock-bus.ts:45-124`: step 1 of S1 copies the **existing 6 test files' cases** against the factory first). Tovu positional-ABI exports (`subscribeToAssistantDock(listener)`, `publishAssistantDockState({open})`, `requestAssistantDock({open})`, `getAssistantDockOpen()`, `subscribeToAssistantDockRequests(listener)`, `resetAssistantDockBus()`) stay as the Tovu module's public names (a const object + 6 `export const` that call the one instance: this is a *binding of a singleton*, not a forwarder shell for moved code; the file keeps the long "why a bus" header comment).

`packages/chat/src/core/dock/preferences.ts` (types/defaults only): `ChatToolCallDisplay = ToolCallDisplay` (type alias to the chat/react type, via a type import from `../../react/tool-call-display.js`: **core importing react is wrong layering**, so the alias goes the other way: `core/dock/preferences.ts` declares `ChatToolCallDisplay` and `react/tool-call-display.ts` is NOT edited; a structural-equality type test (`const _: ToolCallDisplay = {} as ChatToolCallDisplay`) in `react/__tests__/dock-types.test-d.ts` proves the two stay equal), `ChatDisplayPreferences`, `DEFAULT_CHAT_DISPLAY`, `CHAT_TOOL_CALL_OPTIONS`, `AssistantRuntimePreferences`, `ReplyLength`, `REPLY_LENGTH_OPTIONS`, `DEFAULT_ASSISTANT_RUNTIME_PREFERENCES`, `AgentRuntimePreferenceSupport` + `visibleAssistantRuntimePreferences`, `ChatAgentPlugins`, `DEFAULT_CHAT_AGENT_PLUGINS`, `CHAT_AGENT_PLUGIN_OPTIONS`, `chatPaneDisplayProps`, `sameChatDisplay`. Pure, `(required, optional = {})` everywhere (Tovu's `readChatDisplayPreferences` etc. already are).

`packages/chat/src/react/features/dock/rules.ts` (menu model; from `dock-header-rules.ts`): `shouldShowHeaderTip`, `DockSettingsMenuItem/Section`, `isChoiceSection`, `groupOptionTooltips`, `dockSettingsMenuSections`, `DockRuntimeSwitches`, `activateDockMenuItem`. Its controller inputs become structural, replacing the Tovu hook-file imports:
```ts
export interface DockDisplayControl { readonly preferences: ChatDisplayPreferences; update(required: Partial<ChatDisplayPreferences>, optional?: Record<string, never>): void; }
export interface DockAgentPluginsControl { readonly mode: ChatAgentPlugins; update(required: { mode: ChatAgentPlugins }, optional?: Record<string, never>): void; }
export interface DockRuntimeControl { readonly preferences: AssistantRuntimePreferences; update(required: Partial<AssistantRuntimePreferences>, optional?: Record<string, never>): void; }
```
STEP 0 (S1) must read the Tovu controllers' `update` signatures (`use-chat-display-preferences.hooks.ts`, `use-chat-agent-plugins.hooks.ts`, `use-assistant-runtime-preferences.hooks.ts`) and copy their **exact** argument shapes into these three interfaces; if a Tovu `update` is positional (`update(next)`), S3 adapts the Tovu side (wrap in the binding), the Jini interface keeps `(required, optional = {})`. `dockSettingsMenuSections({ display, agentPlugins, runtime, onMoreSettings, t })` keeps its arguments; `t` is the existing `{ key } -> string` translator (default dictionary keys are the English phrases, as today).

React (`packages/chat/src/react/features/dock/`): `DockSettingsMenu.tsx`, `DockHeader.tsx`, `folder-drop/{FolderDropConfirmation,FolderDropError,FolderDropNotice,FolderDropPathHint,FolderPathButton}.tsx`, `hooks/useAssistantEmptyState.ts`, `index.ts`. Host slots (one object, `DockChromeHost`, passed as a prop to `DockHeader`/`DockSettingsMenu`; context is unnecessary: both render from one parent):
```ts
export interface DockChromeHost {
  readonly useMenu: (required: { itemCount: number }) => DockMenuController;      // Tovu: useTaxonomyRowMenu (required, not defaulted)
  readonly renderTip?: (required: { label: string; children: ReactNode }) => ReactNode;   // Tovu: DockHeaderTip; absent -> children unwrapped
  readonly renderSubagents?: (required: { mode: string; agentId: string | null | undefined }) => ReactNode;  // Tovu: SubagentsIndicator + its i18n; absent -> nothing
}
```
`DockMenuController` = the fields `DockSettingsMenu.tsx:34-60` reads from `menu` (`triggerRef, menuRef, open, position, onTriggerClick, onTriggerKeyDown, onMenuKeyDown, itemProps(index) ...`): S2 step 0 lists them from the source and declares the interface in `dock/menu-port.ts` (it is exactly `ReturnType<typeof useTaxonomyRowMenu>`; STOP if that hook returns something a plain interface cannot express).

```
id: UI-A09-1 .. UI-A09-3
feature: admin/components/AssistantDock (dock chrome) -> @jini-ai/chat dock module
jini_target: chat src/core/dock/{dock-bus,preferences,index}.ts ; src/react/features/dock/{rules,menu-port,DockSettingsMenu,DockHeader,folder-drop/*,hooks/useAssistantEmptyState,index}.ts* ; package.json: no new subpath (exported from "./react" and "./core")
kit_injection: chat kit (C9b) `Icon`, `InfoTip` via ../../kit.js (S2 precondition); no other UI import
agent_handles: UNCHANGED. `rg -n "agentHandle|data-agent-handle|handle:" <the moved .tsx>` before/after: same literal set
changeset: @jini-ai/chat: minor | "react: dock chrome (settings menu, header, folder-drop notices, empty-state hook) and a headless assistant-dock bus"
```

## UI-A09-1 — Jini headless (commit 1; startable now)
0. Branch rule; blobs; `rg -n "createAssistantDockBus|dock-bus|core/dock" packages/chat/src` prints nothing.
1. Tests first (GREEN-by-construction for pure moves; RED on the parent = module missing): `core/dock/__tests__/dock-bus.test.ts` from the cases of Tovu `lib/__tests__/assistant-dock-bus.unit.test.ts` (rewritten to `const bus = createAssistantDockBus()`), PLUS 2 NEW cases: two buses are independent (publish on A does not notify B), `reset` clears both listener sets. `core/dock/__tests__/preferences.test.ts` from `chat-display-preferences.unit.test.ts` (the pure half only: defaults, `chatPaneDisplayProps`, `sameChatDisplay`) and `assistant-runtime-preferences.unit.test.ts` (`visibleAssistantRuntimePreferences`). `react/features/dock/__tests__/rules.test.ts` = the pure cases of `dock-header.unit.test.tsx` (`shouldShowHeaderTip`, `activateDockMenuItem`), `chat-settings-tooltips.unit.test.tsx` (`groupOptionTooltips`, section tooltips), `agent-plugins-setting.unit.test.tsx` (sections only). The dock-header tests that render are S2's.
2. Code per Contracts; why-comments move reworded neutral ("owner, 2026-10-11" dates are product history: keep only the reason, e.g. "tool-call display default is `collapsed`: one compact line per reply"). `core/index.ts` + `react/index.ts` each get one export line (guard by text).
3. Checks: COMMON 2-9; `rg -n -i "tovu|site-chat|apps/|@/lib|admin/core" <new files>` prints nothing; eslint; changeset; commit `feat(chat): headless assistant-dock bus, dock preferences and menu rules`.

## UI-A09-2 — Jini React (commit 2, Opus review; after C9b)
Step 0: the precondition above. Then files: `DockSettingsMenu.tsx` [Tovu 141 lines; `useTaxonomyRowMenu` removed, `host.useMenu` used; `createPortal` stays; `popupStyle` helper stays in the file; classes `row-menu-popup row-menu-item` are **host presentation** (the host's menu hook owns them): the component keeps them as a documented contract `dock-menu-classes` OR renames them `jini-dock-menu*` with Tovu CSS: **decision: rename to `jini-dock-menu`, `jini-dock-menu--above`, `jini-dock-menu-item`; Tovu `assistant.css` gains selectors that apply the same rules** (cheaper than asking every host for `row-menu-*`)], `DockHeader.tsx` [118; `translateAiAssistant` and `SubagentsIndicator` leave via `host.renderSubagents`; `DockHeaderTip` via `host.renderTip`], the five folder-drop files, `useAssistantEmptyState.ts` (verbatim; name + path change only). i18n: `useT()` from chat (own) in the folder-drop files stays; DockHeader's `t` prop stays. Class renames, each ONCE, counts via `rg -c` listed: `tovu-folder-drop-notice*` (assistant.css:8, DockLeadingAccessory:3, FolderDropPathHint:4, FolderDropNotice test:1 + the 3 notice files) -> `jini-folder-drop-notice*`; `assistant-dock-icon-button` (assistant.css:3, DockSettingsMenu:1) -> `jini-dock-icon-button`; `dock-settings-menu` (assistant.css:21, DockSettingsMenu:8, tests 9+1) -> `jini-dock-settings-menu`. `jini-` rules for the chat package live in `react/styles/` (add `dock.css`, exported via the existing styles pattern `./react/styles/dock.css` + `jini.entries` browser tag + README line, COMMON 17).
Tests (red first; fake kit from chat's `react/__tests__` once C9b lands one): the render cases of `DockSettingsMenu.unit.test.tsx`, `DockHeader.unit.test.tsx`, `dock-header.unit.test.tsx` (rendering half), `FolderDrop{Confirmation,Error,Notice}.unit.test.tsx`, `FolderPathButton.unit.test.tsx`, `use-assistant-empty-state.hooks.unit.test.ts` — adapted to a fake `DockChromeHost`. NEW cases: no `renderTip` -> label rendered once, children unwrapped; no `renderSubagents` -> header has no subagents node; radio section roving focus (ArrowUp/Down between stops, Left/Right inside the pill) is covered by the moved test (assert it is present, do not drop it).
Commit `feat(chat/react): dock chrome behind DockChromeHost`.

## UI-A09-3 — Tovu binding + reduce + delete (commit 3; after wave B and S1, S2)
1. `lib/assistant-dock-bus.ts` reduces to the singleton + the 6 named bindings over `createAssistantDockBus()` (keep the header comment). The 4 production importers and 8 tests keep their imports unchanged (the Tovu names do not change).
2. `chat-display-preferences.ts` / `assistant-runtime-preferences.ts` / `chat-agent-plugin-preferences.ts` shrink to the ledger halves; they re-import the moved types from `@jini-ai/chat/core` (type imports) and DO NOT re-export them (rule 19): every importer in the census above changes to import the moved names from `@jini-ai/chat/core`/`@jini-ai/chat/react` in this commit (`AssistantDock.tsx` imports 3, three hooks, adapter, 6 tests).
3. New `apps/admin/src/components/AssistantDock/dock-chrome-host.tsx` building `DockChromeHost` (`useMenu: useTaxonomyRowMenu`, `renderTip: ({label, children}) => <DockHeaderTip label={label}>{children}</DockHeaderTip>`, `renderSubagents: ({mode, agentId}) => <SubagentsIndicator mode={mode} agentId={agentId} t={(key) => translateAiAssistant({ locale, key })} />` — `locale` is read by the component that builds it; the host object is created inside `AssistantDock.tsx`'s render with `useMemo`, locale as dependency).
4. `AssistantDock.tsx:5,9,10,14` and `assistant-dock-props.tsx:6`, `DockLeadingAccessory.tsx:4` import the moved components/rules from `@jini-ai/chat/react`; pass `host` to `DockHeader`. `git rm` the 10 moved `.tsx`/`.ts` Tovu files (`DockHeader.tsx, DockSettingsMenu.tsx, dock-header-rules.ts, FolderDrop*.tsx x4, FolderPathButton.tsx, use-assistant-empty-state.hooks.ts`) and their moved tests (list with blobs; each test either moved or has a Jini twin per the S1/S2 parity list; none silently dropped: report before/after test count).
5. `DockHeaderTip.hooks.ts:4` imports `shouldShowHeaderTip` from `@jini-ai/chat/react`.
6. CSS: rename per the S2 count table in `styles/assistant.css` (and add the `jini-dock-*` selectors the S2 decision needs); `chat-settings-tip-phone-css.unit.test.ts` pins `dock-settings-menu`: repoint to `jini-dock-settings-menu` (same assertion).
7. `apps/website/src/features/settings/admin-interface.ts:30,38` comments name the moved files: reword to name the ledger files that remain (no behaviour).
8. Census: `rg -n "AssistantDock/(DockHeader|DockSettingsMenu|dock-header-rules|FolderDrop|FolderPathButton)|use-assistant-empty-state" apps` prints nothing; `rg -n "tovu-folder-drop|assistant-dock-icon-button|\\bdock-settings-menu" apps tests --glob '!**/node_modules/**'` prints nothing; eslint; commit `refactor(admin): serve dock chrome from @jini-ai/chat`.
Look (Chrome, owed): gear menu (Tool calls segmented, Done line, Thinking, Reply length, Agent plugins, More settings), keyboard roving, tooltips on Chats/Settings, a folder drop (confirmation, hint, error), header with 120-char title, es locale.

## untangle overlap (execute after wave B merge)
- C9b (chat kit) is the precondition of S2; K-cleanup repoints chat's existing `@jini-ai/ui` imports: both edit `chat/react/**` imports; S2's files are new, `react/index.ts` is one export (text guard).
- C10 (surfaces) will edit `RoutedA2uiSurfaceCard.tsx` and `use-routed-a2ui-surface-card.hooks.ts` (not touched here).
- A30 (composer skills) edits `AssistantDock/hooks/*` (different files) and `AssistantDock.tsx`: both A09-S3 and A30 edit `AssistantDock.tsx` imports: text guards, whichever lands second re-reads the import block.
- A18 (execution credential UI) edits `AssistantDock/execution-config-write.ts` only.
- A13's `use-dropdown-menu.hooks.ts` is a different menu hook from `useTaxonomyRowMenu`; do not merge them here.
- R-BARRELS may delete re-export barrels around `AssistantDock/`: re-take blobs; the guards are by text where marked.

## STOP specific to this sheet
- `packages/chat/src/react/kit.tsx` missing or without `Icon`/`InfoTip` at S2 step 0 (wait for C9b).
- `useTaxonomyRowMenu`'s return type cannot be written as a plain interface, or a moved file still imports `@/`, `@jini-ai/ui`, `@jini-ai/admin/*`.
- Any `handle:` text or `aria-label` text changes (the gear's `label`, "Chats", "Settings" are asserted by e2e: `rg -n "aria-label=\"?Chats|Settings\\b" tests apps/admin/src --glob '*e2e*'` before/after).
- A moved test has no Jini twin (parity row missing).
