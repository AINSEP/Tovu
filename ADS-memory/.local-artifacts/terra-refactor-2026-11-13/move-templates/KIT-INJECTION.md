# Kit injection for Jini `*/react` packages (2026-11-15, planning only, nothing executed)

## Summary
1. **Pattern:** each receiving package owns ONE contract file, `src/react/kit.tsx` (exported as `@jini-ai/<pkg>/react/kit`). It holds local structural slot types, an `<Pkg>KitProvider`, and same-name facades (`Button`, `useFetchQuery`, ...) that read the provider. Moved code changes only its import line. Tovu builds the kit from ui-kit/ui at its composition root and checks it with `satisfies <Pkg>Kit`. No type import from ui-kit either, because `check-package-layers.ts` counts type imports as edges.
2. **The flag over-counts:** of the 51 files that actually carry `kit-inject` (the PLAN's "70 / 14.5k" does not reproduce; strict count is 51 files / 10.5k lines), 28 import no UI package at all, 7 need only pure helpers (`interpolate`, `Translate`, `formatTimestamp`...), and only 16 need kit slots. 8 files also target packages with no React (`core`, `db`, `mcp`, `cms`, `agentic`, `agent-plugins`) and must be retargeted, not injected.
3. **Receiving packages reduce to three:** `admin` (13 slot files), `chat` (2), `user-management` (1). Helpers go to `@jini-ai/core/text` (D2 rule (a)). Fetch-query hooks inject via the existing `FetchQueryAdapter` contract in `@jini-ai/core/fetch`.
4. **Existing tangles:** 153 production import lines in 5 packages break the rule. 80 are in admin, 51 in user-management, 20 in chat, 1 in commerce, and 7 in provider-plugins (allowed, see §3). Two of them are the layer gate's upward exceptions (chat→ui, user-management→ui/admin). None blocks the moves once a ratchet gate freezes them. The cleanup is mostly a mechanical import repoint onto the same contract files.
5. **Order and cost:** first the gate plus baseline, then core/text helpers, then the admin contract (Opus worked example), then chat and user-management (Sonnet + Opus review). That unblocks 8 features at once, 4 after the helpers, 11 after admin, and 2 after chat/user-management. The prerequisites cost about 0.15M Opus + 0.5M Sonnet. The tangle cleanup is about 0.06M Opus + 0.4M Sonnet. Feature sheets get cheaper because no per-feature kit-props design is needed.

---

## 1. The pattern

### 1.1 Rules
- A receiving package never imports `@jini-ai/ui`, `@jini-ai/ui-kit` (any subpath), or another domain package's `/react`. That includes `import type`: the layer gate already says "type imports still count because they appear in published declarations" (`scripts/check-package-layers.ts:2-3`). A type import would force a manifest peer, which is the very edge the owner forbids. It would also pin the package's published `.d.ts` to ui-kit's version.
- It MAY import `react` (peer) and lower kernel contracts: `@jini-ai/core` (`/fetch` `FetchQueryAdapter`, `/text` helpers, `UserFacingError`) and `@jini-ai/agentic` (agent handles). Neither is a UI package.
- One contract file per package (not per feature): `packages/<pkg>/src/react/kit.tsx`, added to `exports` as `./react/kit` (browser entry). It lists only the slots that package's code actually uses (smallest change), with only the props it actually passes.
- Slot props are local copies, a narrower subset of ui-kit's props. Compatibility is proven where both sides are visible: in Tovu, `const adminKit = {...} satisfies AdminKit`. If ui-kit drifts, Tovu's typecheck fails at the wiring line.
- Tovu injects the ui-kit facades (`Button` from `@jini-ai/ui-kit/react`), not raw `nativeKit` parts. A facade still reads Tovu's `<KitProvider>`, so agent handles, the overlay container, the confirm guard and Tovu's chosen implementations behave exactly as with today's direct import.
- Hook slots (`useFetchQuery`, `useFocusTrap`...) are legal under the rules of hooks only if the kit identity never changes. The provider freezes the first kit (`useState(() => kit)`), the same rule `FetchQueryBinding` already documents ("Keep the adapter fixed for this provider's lifetime").
- A missing provider throws a plain-words error naming the provider and where the host mounts it. This follows the existing precedent: fetch-query throws `'Fetch-query hooks require FetchQueryProvider'`. It is a wiring error that shows at first render, not a production boot refusal.

### 1.2 Package side: `packages/admin/src/react/kit.tsx` (abridged to 4 slots + query)
```tsx
import { createContext, forwardRef, useContext, useState, type ComponentProps, type ComponentType, type ReactNode, type Ref } from 'react';
import type { FetchQueryAdapter } from '@jini-ai/core/fetch';
import type { UserFacingError } from '@jini-ai/core';

/** Same shape as the host kit's attrs; local so this package imports no UI package (owner 2026-11-15). */
export type AdminSlotAttrs = Readonly<{ id?: string; 'data-jini-part'?: string }>
  & Readonly<Partial<Record<`data-${string}` | `aria-${string}`, string | number | boolean | undefined>>>;
type Base = { readonly className?: string; readonly attrs?: AdminSlotAttrs; readonly agentHandle?: string | false };
type Action = (required: Record<string, never>, optional?: Record<string, never>) => void;
type Tone = 'info' | 'success' | 'warning' | 'danger';

/** Every UI primitive @jini-ai/admin renders. The host supplies all of them; nothing here has a default. */
export interface AdminKitComponents {
  Button: ComponentType<Base & { children?: ReactNode; onPress?: Action; disabled?: boolean; pending?: boolean;
    variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost'; type?: 'button' | 'submit' | 'reset'; ref?: Ref<HTMLButtonElement> }>;
  Dialog: ComponentType<Base & { open: boolean; title: string; children?: ReactNode; onClose: Action; pending?: boolean; closeLabel?: string }>;
  Notice: ComponentType<Base & { children: ReactNode; tone?: Tone }>;
  ErrorNotice: ComponentType<{ failure: UserFacingError; t?: (key: string) => string; className?: string }>;
}
export interface AdminKit { readonly components: AdminKitComponents; readonly query: FetchQueryAdapter }

const AdminKitContext = createContext<AdminKit | null>(null);

/** Mount once at the host's root. The first kit is kept: hook slots must not change identity between renders. */
export function AdminKitProvider(required: { kit: AdminKit; children: ReactNode }, _optional: Record<string, never> = {}) {
  const [kit] = useState(() => required.kit);
  return <AdminKitContext.Provider value={kit}>{required.children}</AdminKitContext.Provider>;
}

export function useAdminKit(): AdminKit {
  const kit = useContext(AdminKitContext);
  if (!kit) throw new Error('@jini-ai/admin/react needs <AdminKitProvider kit={...}> above this screen. '
    + 'The host app builds the kit from its UI library (Tovu: apps/admin/src/integrations/jini-kits.ts).');
  return kit;
}

/** A same-name stand-in, so moved code only changes its import line. */
function slot<K extends keyof AdminKitComponents>(name: K): AdminKitComponents[K] {
  const Slot = forwardRef<unknown, ComponentProps<AdminKitComponents[K]>>(function AdminKitSlot(props, ref) {
    const Impl = useAdminKit().components[name] as ComponentType<Record<string, unknown>>;
    return <Impl {...props} ref={ref} />;
  });
  Slot.displayName = `AdminKit.${name}`;
  return Slot as unknown as AdminKitComponents[K];
}
export const Button = slot('Button');
export const Dialog = slot('Dialog');
export const Notice = slot('Notice');
export const ErrorNotice = slot('ErrorNotice');

export const useFetchQuery: FetchQueryAdapter['useFetchQuery'] = (r, o) => useAdminKit().query.useFetchQuery(r, o);
export const useFetchMutation: FetchQueryAdapter['useFetchMutation'] = (r, o) => useAdminKit().query.useFetchMutation(r, o);
export const useInvalidate: FetchQueryAdapter['useInvalidate'] = () => useAdminKit().query.useInvalidate();
export const useCachedLoader: FetchQueryAdapter['useCachedLoader'] = (r, o) => useAdminKit().query.useCachedLoader(r, o);
```
`forwardRef` stays because the peers allow React 18.3. Generic components (`SettingsDialogShell<T>`) are declared as a slot with the package's concrete tab type.

### 1.3 Moved component: the only change is the import line
```diff
-import { Button, Dialog } from "@jini-ai/ui-kit/react";
-import type { Translate } from "@jini-ai/ui/panel-kit";
+import { Button, Dialog } from "../../react/kit.js";          // leaf import, never the package barrel
+import type { Translate } from "@jini-ai/core/text";
```
(`CopyKeysDialog.tsx` → `@jini-ai/admin/security/react`; JSX unchanged.)

### 1.4 Tovu side: one wiring file, one provider mount
```ts
// apps/admin/src/integrations/jini-kits.ts  (next to the existing jini-admin/kit.ts)
import { Button, Dialog, Notice } from '@jini-ai/ui-kit/react';
import { ErrorNotice } from '@jini-ai/ui/panel-kit';
import { useFetchQuery, useFetchMutation, useInvalidate, useCachedLoader } from '@jini-ai/ui/fetch-query';
import type { AdminKit } from '@jini-ai/admin/react/kit';

/** Tovu picks the implementations; @jini-ai/admin only states what it needs. A ui-kit prop change fails here. */
export const adminKit = {
  components: { Button, Dialog, Notice, ErrorNotice },
  query: { useFetchQuery, useFetchMutation, useInvalidate, useCachedLoader },
} satisfies AdminKit;
```
```tsx
// apps/admin/src/main.tsx: inside the existing <KitProvider> and <FetchQueryProvider>
<KitProvider kit={tovuKit} agent={tovuAgentAttrs}>
  <FetchQueryProvider>
    <AdminKitProvider kit={adminKit}><ChatKitProvider kit={chatKit}><UserManagementKitProvider kit={userManagementKit}>
      ...existing tree...
```
- Nesting order does not matter: injected facades and hooks read `KitProvider` and `FetchQueryProvider` when they are called, and both are ancestors. The second `KitProvider` in `App.tsx:794` (overlay container) keeps working, because the injected `Button` is ui-kit's facade and reads the nearest one.
- Site-chat mounts `<ChatKitProvider kit={siteChatKit}>` at its embed root, built from the same ui imports chat already pulls in today. The bundle content stays the same; only the import edge moves to the app.

### 1.5 Tests
- Unit tests in the package use a package-local fake: `packages/admin/src/react/__tests__/fake-admin-kit.tsx`, unpublished. It holds plain elements (`Button: p => <button {...p.attrs} type={p.type ?? 'button'} disabled={p.disabled || p.pending} onClick={() => p.onPress?.({})}>{p.children}</button>`) and a fixture query adapter (`useFetchQuery: () => ({ data, status: 'success', ... })`). It is wrapped by `renderWithAdminKit(ui, { kit? })`.
- One provider test: a missing provider throws the message above, and changing the `kit` prop does not swap the kit.
- No ui-kit in Jini tests. The compatibility proof is Tovu's `satisfies`, which already runs in Tovu typecheck. The behaviour proof stays the ui-kit conformance suite plus the owed Chrome look.

---

## 2. Per receiving package: slots from the blocked files

Source: the 51 files `classify.py` actually flags (`kind == UI` and target pkg not `ui`/`ui-kit`), scanned in the terra clone for imports.

### 2.1 What the 51 files really need
| Need | Files | Lines | Files |
|---|---|---|---|
| Nothing from a UI package (flag is a false positive: React hooks or native `<button>`/`<input>`) | 28 | ~5.5k | App.hooks, AgentFailureCard.hooks, OverflowAwareMcpUiSurfaceCard, SlowRunNoticeCard, use-composer-send-stop-guard, use-routed-a2ui-surface-card, useOverflowDetection, InstallTabCard, use-folder-upload, CollectionEntryEditor, use-email-sender, IntegrationDeliveries, Integrations, use-admin-surface-frame, AlwaysAllowPanel, Taxonomy, use-push-to-talk, use-space-hold-to-talk, use-assistant-chats, use-dock-auto-rail, use-drawer-active-item-centring, use-sidebar-empty-click-toggle, assistant-prompt-bus, widget-embed-extension.hooks, widget-embed-extension, SiteAssistantActivation/Header/ToolConfirmation hooks |
| Pure helpers only (`Translate`, `interpolate`, `localeEntry`, `createDictionaryTranslator`, `formatTimestamp`) → `@jini-ai/core/text` | 7 | ~1.6k | ChatFab, GitBackupCard, integrations-i18n, CollectionEntries, use-agent-plugin-install, use-agent-plugin-update, use-plugin-install |
| Kit slots | 16 | ~3.4k | listed per package below |

`DataTable`, `RowMenu`, `ConfirmDialog` and `useConfirmRequest` from `@jini-ai/admin/react` are internal when the target is admin, so they need no slot.

### 2.2 Retargets (React into a package with no React layer, which is wrong whatever the kit decision)
| File | Survey target | Retarget |
|---|---|---|
| features/email/hooks/use-email-sender.hooks.ts | `core` | `admin` (email panel). Core takes no React; any pure half stays a D2 candidate. |
| features/recovery/Recovery.tsx | `db/recovery` | `admin/recovery/react` |
| features/providers/AlwaysAllowPanel.tsx | `mcp` | `admin` (providers panel) |
| features/pages/hooks/use-interactive-flush.hooks.ts | `cms/widgets/markers` | `admin` (pages) |
| components/WidgetConfigFields/WidgetConfigFields.hooks.tsx | `cms/content-types` | `admin/widgets/react` |
| components/AssistantDock/hooks/use-routed-a2ui-surface-card.hooks.ts | `agentic/a2ui` | `chat/react` (it already types against `chat/react`) |
| components/InstallTabCard/use-folder-upload.hooks.ts | `agent-plugins` | `admin/agent-plugins/react` |
| features/plugins/hooks/use-admin-surface-frame.hooks.ts | `agent-plugins/admin-surfaces` | `admin/agent-plugins/react` |

Also out of kit scope but found: `App.hooks.ts` → `admin/react/shell` imports `@jini-ai/chat/react` (session bridge). Moving it as-is would add an admin→chat domain edge, so it needs a domain port. Its Opus sheet must design that.

### 2.3 `@jini-ai/admin/react/kit` (one file)
| Group | Slots for the moved files (file) | Slots the existing admin code adds in the cleanup |
|---|---|---|
| components | Button, Dialog (CopyKeysDialog); ErrorNotice (use-skill-files); Toast, TabBar, FileDropzone (Library, Plugins); SettingsDialogShell + I18nProvider + `SETTINGS_DIALOG_DICTIONARIES` value (Recovery); SecretInput (EmailProviderTab, now Tovu's wrapper) | Notice, Spinner, TextField, TextArea, Select, Switch, Tabs, Badge, IconButton, Menu, ConfirmDialog (ui-kit, used inside admin's own ConfirmDialog), InfoTip, Lightbox, admin-widgets Select, InteractiveHtmlEditor |
| query | `FetchQueryAdapter` (use-admin-theme, MediaPickerDialog.hooks, WidgetConfigFields.hooks, WidgetPickerDialog.hooks, use-assistant-owner-grant, use-plugins, use-skill-files) | same |
| hooks | none | useFocusTrap, useDirtyGuard, useSettlementGeneration, useAgentHandle, useConfirmController, useNativeDialog |
| htmlEditor | `isEditorSourceError` + local `InteractiveHtmlEditorHandle` shape (use-interactive-flush) | InteractiveHtmlEditor, hasAttributeOnAnyNodeShape |
| theme | local `SettingsThemeChoice` and `MatchMediaPort` shapes (use-admin-theme, types only) | applyAdminTheme, resolveColorScheme, defaultAdminTheme as a `theme` port (later: decide whether `ui/theme`'s admin-theme code belongs in admin) |

Tovu-local components that the moved admin files render (ServerLabel ×6, PublishSectionButton, TermPicker, EmailParts, MessageOverflowModal, PluginRow...) are not kit slots. They are the existing MOVE-AFTER preconditions and move first in slice order.

### 2.4 `@jini-ai/chat/react/kit` (one file, shared by `/react` and `/react/embed`)
| Group | Moved files | Existing chat code (cleanup) |
|---|---|---|
| components | ErrorNotice (AgentFailureCard), Icon (SelectedAgentPluginTray) | RemixIcon, AgentIcon, SecretInput, SecretTextarea, InfoTip, TabBar, SearchableModelSelect, WorkingDirPicker |
| hooks | none | useAgentHandle, useOverlayContainer, useFileDropTarget, useFocusTrap, useInfoTip, infoTipBubbleStyle (value) |
| surfaces | none | MCP-UI (`McpUiToolCallHandler`, `parseUIResource`, `readActionPlan`, `readExpiresAt`, `readPreferredFrameSize`), `InteractiveUiRegistry` + default, `buildA2uiCatalogFromRegistry`. These are renderer features, not primitives; inject them as one `surfaces` port. Opus designs this group once. |

### 2.5 `@jini-ai/user-management/react/kit` (one file, shared by `/react` and `/admin/react`)
| Group | Moved files | Existing code (cleanup) |
|---|---|---|
| components | ErrorNotice, SecretInput (RecoveryCodesCard) | Button, Notice, TextField, Spinner, Menu, Badge, ConfirmDialog, Select, Tabs, InfoTip, and from admin: RowMenu, ConfirmDialog (admin's), which removes the user-management→admin/react edge |
| query, hooks | none | FetchQueryAdapter, useAsyncAction |
| other | none | `needs()` from ui-kit root goes away: the package exports `USER_MANAGEMENT_KIT_SLOTS` (string list), and Tovu passes `needs({ id: 'user-management', components: [...] })` to its `KitProvider` |

### 2.6 Pure helpers to `@jini-ai/core/text` (not injected; D2 rule (a))
`Translate`, `DictionaryTranslator`, `LocaleDictionary`, `createDictionaryTranslator`, `interpolate`, `splitOnPlaceholders`, `pickPlural`, `localeEntry` (ui `features/i18n/dictionary-translator.ts` + `template-i18n.ts`, ~80 lines, React-free), plus `formatTimestamp`, `formatRelativeMinutesAgo`, `isAbortError`, `resolveActiveTabId` (panel-kit helpers, ~45 lines). `@jini-ai/ui/panel-kit` and `/i18n` re-export them from core, the same way panel-kit already re-exports `buildAgentListHandles` from agentic, so no existing importer breaks. `buildAgentListHandles` users import from `@jini-ai/agentic` directly. ui-root pure helpers that admin uses (`extensionForMimeType`, `isEntryPresent`, `isMarkerOnlyEntry`, `maskedKeyLabel`, `sortProvidersByConfigured`, `isProviderBaseUrlInvalid`, `invalidBaseUrlProviderIds`, `useMediaProvidersTab`) are cleanup-lane items: the admin-specific ones move into admin, the generic ones into core/text.

---

## 3. Existing cross-package UI imports in Jini (production files, terra-base `993c84343`)
| From → to | Lines | Smallest fix | Blocks moves? |
|---|---|---|---|
| admin → `ui-kit/react` (28), `ui-kit/react/native` (1), `ui-kit` types (1) | 30 | Repoint to `../react/kit.js` slots; `KitAttrs`/`AgentAttrsPort` become local shapes | No (gate baseline) |
| admin → `ui/fetch-query` (23), `ui/panel-kit` (9), `ui/i18n` (3), `ui/tab-strip` (2), `ui/admin-widgets` (5), `ui/theme` (4), `ui/html-editor` (1), `ui` root (3) | 50 | fetch-query → kit `query`; helpers → core/text; components → kit slots; theme → `theme` port | No |
| user-management → `ui-kit/react` (24), `ui-kit` `needs` (1), `ui/panel-kit` (21), `ui` (3), `ui/admin-widgets` (1), `ui/fetch-query` (1) | 51 | Same; `Translate` (15 files) is just the core/text repoint | No |
| user-management → `admin/react` (RowMenu, ConfirmDialog: 6 files) | 6 | Slots in the user-management kit; Tovu passes admin's components | No |
| chat → `ui` (7), `ui/mcp-ui` (5), `ui/admin-widgets` (2), `ui/interactive-ui` (2), `ui/a2ui` (1), `ui/panel-kit` (1), `ui/renderers` (1), `ui/tab-strip` (1) | 20 | Primitives → chat kit; mcp-ui/interactive-ui/a2ui → one `surfaces` port (Opus, once) | No |
| commerce → `ui/panel-kit` `createDictionaryTranslator` | 1 | core/text repoint | No |
| provider-plugins → `ui/charts` types, `ui/charts/browser` `applyChartTheme` | 7 | None needed: a provider plugin implementing ui's chart contract, downward (L7→L5), not a receiving package | No |

Two of these rows are today's sanctioned upward edges in the layer gate (`hasReactPeer`: user-management→ui/admin, chat→ui; domains are L4, ui/admin are L5). The cleanup deletes those exceptions. That is the "no package above domains" rule made mechanical.

Also seen, not UI and out of scope (flag only): user-management → `admin/core/module` (12 files: `defineAdminModule`, `AdminInstance`, `adminPort`), admin → `cms/forms|comments|widgets/markers` (11). These are capability→host module-registration edges, which fall under "plugins never import each other", and need their own decision.

**Gate (prerequisite P1):** add rule `L-ui-injected` to `scripts/check-package-layers.ts`. No production file outside `packages/ui` may import `@jini-ai/ui` or `@jini-ai/ui-kit` (any subpath, type imports included). No package may import another domain package's `/react*` subpath. Freeze today's sites in `scripts/ui-injection-debt.json` (ratchet, like `hardwiring-debt.json`): new violations fail, the baseline only shrinks. This is what keeps moves from adding tangles before the cleanup finishes.

---

## 4. Move-plan updates

### 4.1 Patch to `T-UI.md` (apply as a patch; replaces the lines named)
```diff
@@ header
-... (cap 6 files / 1.2k lines; ...)
+... (cap 6 files / 1.2k lines; ...). Kit rule (owner 2026-11-15): only `ui`/`ui-kit` may import @jini-ai/ui*;
+every other target imports its slots from its own contract file `packages/<pkg>/src/react/kit.tsx` (KIT-INJECTION.md).
@@ Sheet
-jini_target: {pkg} {subpath} {files}       # pkg ui/ui-kit: may import @jini-ai/ui; any other pkg: kit injected (COMMON rule 6)
-kit_injection: {- | the props/slots/KitProvider components the host passes, e.g. "Select via props.components.Select"}
+jini_target: {pkg} {subpath} {files}       # pkg must have a React layer (admin, chat, user-management, commerce, vibecoding, ui, ui-kit)
+kit_slots: {- | names imported from "<rel>/react/kit.js", e.g. "Button, Dialog, useFetchQuery"}   # every name must already exist in the contract
+core_helpers: {- | names repointed to @jini-ai/core/text (Translate, interpolate, formatTimestamp, ...)}
+tovu_kit_wiring: {- | none needed when every slot already exists; never edited by a feature slice}
@@ Steps
-0. ... If `jini_target` pkg is not `ui`/`ui-kit` and `kit_injection` is `-` while the code renders a kit component: STOP.
+0. ... If `jini_target` pkg has no React layer: STOP (retarget, KIT-INJECTION §2.2). If a `kit_slots` name is missing
+   from `packages/<pkg>/src/react/kit.tsx`: STOP (contract change = its own slice, Sonnet + Opus review).
@@ Jini (commit 1)
-2. Rule checks (COMMON 2–9 + rule 6); ...
+2. Rule checks (COMMON 2–9 + rule 6); `rg -n "@jini-ai/ui(-kit)?(/|['\"])" <new files>` prints nothing (pkg ≠ ui/ui-kit);
+   `rg -n "@jini-ai/(admin|chat|user-management|commerce|vibecoding)/react" <new files>` lists only the target pkg's own paths;
+   tests render through the package fake (`renderWith<Pkg>Kit`), never ui-kit; ...
@@ STOP specific to UI
+- The moved file imports a UI package for a name that is neither a contract slot nor a core/text helper.
+- The move would add a Tovu-side kit slot or provider (the contract slice owns those).
```
`classify.py`: `kit-inject` fires only when a file's scanned imports include `@jini-ai/ui*` or a foreign `/react` (new `ui_imports` signal in `signals.py`), not on every React file outside ui. Add a `RETARGET` map for the 8 files in §2.2. Re-run `classify.py` and `judge.py`.

### 4.2 Order (contract first, then features)
| Step | Work | Unblocks (CLASSIFY rows; other blockers still apply) |
|---|---|---|
| U0 | T-UI patch + classify signal fix + 8 retargets (no Jini code) | **8 features:** InstallTabCard, voice-input, taxonomy, providers, hooks (still SCC S2), lib (still tiptap new-dep), site-chat (still micromark), admin/(src) (Opus; needs the admin→chat port). Also 6 of 8 AssistantDock files. |
| P1 | Gate `L-ui-injected` + debt baseline | Nothing directly; required before any slice lands so moves cannot add tangles |
| P2 | core/text helpers (T-MOVE; needs owner D2 = rule (a)) | **4 features:** ChatFab, import-export, integrations, collections (still tiptap) |
| P3a | Admin contract `admin/src/react/kit.tsx` with the moved-file slots (§2.3 col 2) + fake kit + Tovu `jini-kits.ts` + mount | **11 features:** admin-themes, library, MediaPickerDialog, WidgetConfigFields, recovery, plugins, skills, ai-assistant, pages, email, WidgetPickerDialog (still SCC S2); security, admin half (CopyKeysDialog) |
| P3b | Chat contract (components + hooks; `surfaces` waits for the cleanup) + site-chat mount | AssistantDock (AgentFailureCard, SelectedAgentPluginTray) |
| P3c | User-management contract | security (RecoveryCodesCard) |
| K1–K3 (parallel, not blocking) | Cleanup: repoint existing admin / user-management / chat imports onto their contracts, drop `ui`/`ui-kit`/`admin` peers from the manifests, remove the `hasReactPeer` exceptions, empty the baseline | n/a |

Of the 25 kit-flagged features, 7 have no other blocker (ChatFab, InstallTabCard, admin-themes, library, WidgetConfigFields, ai-assistant, admin/(src)). They are the first to land after their step.

### 4.3 Cost
| Item | Opus | Sonnet |
|---|---|---|
| U0: T-UI patch, `signals.py`/`classify.py` change, re-run | — | 20k |
| P1: gate rule + baseline + gate test | — | 75k |
| P2: core/text move + ui re-exports (T-MOVE sheet + exec) | — | 105k |
| P3a: admin contract (worked example: Opus designs the sheet, Sonnet executes a Jini commit and a Tovu commit) | 60k | 90k |
| P3b + P3c: chat and user-management contracts from the example (Sonnet sheet + Opus review each) | 30k | 190k |
| Chat `surfaces` port design (cleanup, once) | 60k | — |
| K1–K3 cleanup: ~110 files, mostly import repoints (script + Sonnet check; manifests; gate baseline to 0) | — | ~400k |
| **Prerequisites (U0–P3)** | **~0.09M** | **~0.48M** |
| **Cleanup** | **~0.06M** | **~0.4M** |

The 25 features' sheet estimates in CLASSIFY (0.93M Opus + 1.47M Sonnet; 4.9M Sonnet to execute) stay as they are for now. Once the slot list is fixed, kit-related judgment drops out of the UI sheets. 9 of the 25 have Opus-tier slices driven mostly by size, not by the kit, so expect a modest cut (W0 measures it). The PLAN's "every admin/chat/user-management UI move needs its own kit-props design from Opus" no longer applies: there is one contract per package, not one per feature.

### 4.4 Risks
- **Hook slots:** a host passing an inline object as the kit would remount-swap hooks. The provider keeps the first kit; the package test proves it.
- **Prop drift:** caught only by Tovu typecheck (`satisfies`). A host other than Tovu gets the same check from its own wiring. The contract file states this in its header.
- **Two Toasts:** `ui`'s `Toast` and ui-kit's `Toast` differ. The admin slot `Toast` keeps today's `ui` one (the props the moved Library/Plugins pass). Unifying them is a separate item.
- **SSR/embed:** site-chat's IIFE gains one provider and no new code. ui-kit's `globalThis` context sharing is unchanged because the facades still come from ui-kit.
