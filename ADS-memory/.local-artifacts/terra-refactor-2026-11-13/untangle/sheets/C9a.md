# C9a: admin kit contract (`@jini-ai/admin/react/kit`) — worked example for C9b/C9c

Planning only. Read at Jini `jini-terra-base` @ `2b59c1eae` (5 commits past DESIGN's `1b1737eb8`; none touch admin/ui/ui-kit), Tovu `tovu-codex-trial-terra` @ `984912ca3`. Written near the context cap: the two items marked **UNVERIFIED** need a one-line check by the executor.

## Decisions (read first)
1. **C9a lands the contract only.** `kit.tsx`, the fake, the provider test, the manifest entry, Tovu's `jini-kits.ts` binding. No existing admin file changes its imports here; R1 (admin `react/`) and R2 (admin non-React) do the repoint with the map in §R. So C9a alone changes no runtime behaviour: nothing reads the kit until R1 lands.
2. **Of the 80 admin → ui/ui-kit lines, 69 become kit slots, 9 are pure repoints, 2 wait on a C1 addendum:**
   - 7 lines `interpolate`/`formatTimestamp`/`Translate` → `@jini-ai/core/text` (already in core at this commit).
   - 1 line `QueryKey` (forms/rules.ts, type) → `@jini-ai/core/fetch` (already there).
   - 1 line: `MediaDialog.hooks.ts` `DialogProps` → kit type (counted in the 69).
   - **C1+ addendum (Sonnet, ~15k, before R1):** `extensionForMimeType` (ui/utils/file-transfer.ts:66, pure, 3 users) → `core/text/mime.ts`; `hasAttributeOnAnyNodeShape` (ui/features/html-editor/dom.ts:14, pure) → `core/primitives/node-shape.ts`. ui keeps re-exports. Both are generic pure helpers (D2 rule (a)); a kit slot cannot serve them because admin calls them outside render (`isProtectedEmbedElement`, a module function).
3. **Two Selects.** ui-kit `Select` (label/onValueChange) keeps the name `Select`. ui `admin-widgets` `Select` (searchable listbox) becomes slot `WidgetSelect`; its two users import `{ WidgetSelect as Select }`, still an import-line-only change.
4. **Three files need a hand edit beyond the import line** (R1 does them; exact edits in §R): `media/react/hooks/ProvidersTab.hooks.ts` (6 pure media-provider rules are called from module helpers, so they come from a hook), `react/shell/use-admin-theme.ts` and `consent/react/ConsentFields.tsx` (theme values used in effects and at module scope).
5. **Theme types are restated locally** (admin is the only Jini consumer of `ui/theme` besides ui itself; DESIGN B4). `applyAdminTheme` cannot go to core (module-scope `WeakMap` `fontLeases` written later, B2), so it is a kit value.
6. **Moved-file slots (KIT §2.3 col 2) are a follow-up, C9a-M** (Sonnet ~25k + Opus review): `Toast` (ui), `FileDropzone`, `SettingsDialogShell` + `I18nProvider` + `SETTINGS_DIALOG_DICTIONARIES`, `SecretInput` (Tovu wrapper). Props the moving files pass are recorded in §M. KIT rule 1.1 says the contract lists only what admin's own code uses; the first move slice that needs one of these STOPs until C9a-M lands. `ErrorNotice` is included now (shape known, also used by `use-skill-files`).

## Sheet
```
id: C9a
feature: admin UI kit contract (KIT P3a)
precondition: C0 landed: rg -n "L5-injected-edge" scripts/check-package-layers.ts
jini_guards:
  - packages/admin/src/react/kit.tsx must not exist
  - packages/admin/src/react/__tests__/fake-admin-kit.tsx must not exist
  - packages/admin/package.json blob 2db49005d82e749370c805b37d3955ea66943e28
  - rg -n "AdminKitProvider|useAdminKit" packages/admin/src -> prints nothing
tovu_guards:
  - apps/admin/src/integrations/jini-kits.ts must not exist
  - apps/admin/src/main.tsx blob c221bade0ab32e229ed3b33560d9573e5ffe8d53 (coordinator edits it, lane only reads)
  - apps/admin/src/integrations/jini-admin/kit.ts blob 19e11207ac4f691278943a8b5db529d28f46ba32 (read only)
jini_target: admin ./react/kit packages/admin/src/react/kit.tsx (NEW)
entry:
  exports_after: "\"./react/overlays\": {...}" block   # insert "./react/kit" right after it
  exports_value: { "types": "./dist/react/kit.d.ts", "import": "./dist/react/kit.js", "default": "./dist/react/kit.js" }
  runtime: browser          # jini.entries "./react/kit": "browser", next to "./react/overlays"
  isolation_shared_append: "src/react/kit.tsx"   # jini.isolation.shared: one module instance for every */react entry
  optional_peers_text: -    # ui/ui-kit peers stay until R1/R2 empty the debt
values_injected: every slot below (host passes them; nothing has a default)
changeset: admin: minor | "Add @jini-ai/admin/react/kit: the UI contract admin screens render through. Hosts mount <AdminKitProvider kit={...}> with their own components and fetch-query hooks."
jini_msg: "feat(admin): add the react/kit UI contract (AdminKitProvider + slot facades)" | body "Admin states the UI primitives, hooks, fetch-query and theme functions it renders through. Hosts inject them; no admin file uses it yet (R1 repoints)."
tovu_msg: "feat(admin): bind @jini-ai/admin/react/kit to ui-kit and ui" | body "jini-kits.ts builds adminKit from ui-kit facades and ui; satisfies AdminKit proves prop compatibility at typecheck. Mounted by the coordinator in main.tsx."
extra_stops: see STOP section
```

## Slot inventory (what admin uses today, file count, source)
| Group | Slot (facade name) | Source today | Admin files |
|---|---|---|---|
| components | Button | ui-kit/react | 13 |
| | IconButton | ui-kit/react | 2 |
| | TextField | ui-kit/react | 8 |
| | TextArea | ui-kit/react | 1 |
| | Select | ui-kit/react | 3 |
| | Switch | ui-kit/react | 1 |
| | Dialog (+ type `DialogProps`) | ui-kit/react | 5 (+1 type) |
| | ConfirmDialog (ui-kit's; admin's own stays in components/) | ui-kit/react | 4 |
| | Tabs | ui-kit/react | 3 |
| | Menu | ui-kit/react | 1 |
| | Notice | ui-kit/react | 13 |
| | Spinner | ui-kit/react | 8 |
| | Badge | ui-kit/react | 2 |
| | InfoTip | ui/admin-widgets | 3 |
| | Lightbox | ui/admin-widgets | 1 |
| | WidgetSelect | ui/admin-widgets `Select` | 2 |
| | TabBar (+ type `TabBarTab`) | ui/tab-strip | 1 (+1 type) |
| | HtmlEditor (+ types `HtmlEditorProps`, `CanvasEmbedPlaceholderDescriptor`, `InteractiveHtmlEditorHandle`, `CanvasStyling`) | ui/html-editor | 1 |
| | ErrorNotice | ui/panel-kit | 0 today (use-skill-files on move) |
| hooks | useConfirmController | ui-kit/react | 1 |
| | useNativeDialog | ui-kit/react/native | 1 |
| | useFocusTrap | ui/panel-kit | 1 |
| | useDirtyGuard (+ type `DirtyGuard`) | ui/panel-kit | 2 (+1 type) |
| | useSettlementGeneration | ui/panel-kit | 1 |
| | useAgentHandle | ui (root) | 1 |
| query | useFetchQuery, useFetchMutation, useInvalidate, useCachedLoader (core `FetchQueryAdapter`) + useFetchQueryScope | ui/fetch-query | 22 |
| mediaProviders | useMediaProvidersTab + rules {sortProvidersByConfigured, isEntryPresent, isMarkerOnlyEntry, maskedKeyLabel, isProviderBaseUrlInvalid, invalidBaseUrlProviderIds} | ui (root) | 1 |
| theme | applyAdminTheme, resolveColorScheme, defaultAdminTheme + local types AdminTheme, AdminThemeColors, ColorScheme, ColorSchemePreference, MatchMediaPort, AdminThemeTarget, AdminThemeDocument | ui/theme | 4 |
| types only | KitAttrs, AgentAttrsPort | ui-kit | 1 |

## Full `packages/admin/src/react/kit.tsx`
```tsx
/**
 * @file The UI contract every @jini-ai/admin React screen renders through. Admin imports no UI
 * package (owner 2026-11-15: everything injected): it states the primitives, hooks, fetch-query
 * and theme functions it needs, with only the props it passes, and the host supplies them once via
 * <AdminKitProvider kit={...}>. Shapes are local copies so this package's published types pin no
 * UI library; the host proves compatibility with `const kit = {...} satisfies AdminKit`, so a UI
 * library prop change fails the host's typecheck at that line.
 *
 * Hook slots are only legal because the provider keeps the FIRST kit it receives: a kit whose hooks
 * changed identity between renders would break React's hook order (same rule as fetch-query's
 * FetchQueryBinding, "keep the adapter fixed for this provider's lifetime").
 */
import { createContext, forwardRef, useContext, useState } from 'react';
import type { ComponentProps, ComponentType, MouseEvent, ReactNode, Ref, RefObject, SyntheticEvent } from 'react';
import type { FetchQueryAdapter } from '@jini-ai/core/fetch';
import type { Translate } from '@jini-ai/core/text';
import type { MediaProviderCatalogPolicy, MediaProviderOption } from '@jini-ai/core';
import type { UserFacingError } from '@jini-ai/core';   // UNVERIFIED entry: use the specifier ui/src/features/panel-kit/ErrorNotice.tsx imports it from
import type { AdminMediaProvidersKit } from './kit-media-providers.js';

/* ---------- shared shapes (local; structurally equal to the host kit's) ---------- */
/** Opaque host metadata; implementations spread it onto the documented focus target. */
export type KitAttrs = Readonly<{ id?: string; 'data-jini-part'?: string }>
  & Readonly<Partial<Record<`data-${string}` | `aria-${string}`, string | number | boolean | undefined>>>;
/** The host owns handle validation and its agent runtime. */
export type AgentAttrsPort = (required: { handle: string }, optional?: { role?: 'button' | 'field' | 'select'; label?: string }) => KitAttrs;
type Action = (required: Record<string, never>, optional?: Record<string, never>) => void;
type ValuePort<T> = (required: { value: T }, optional?: Record<string, never>) => void;
type Tone = 'info' | 'success' | 'warning' | 'danger';
interface Base { readonly attrs?: KitAttrs; readonly className?: string; readonly agentHandle?: string | false }

/* ---------- component props: only what admin passes ---------- */
export interface ButtonProps extends Base {
  readonly children?: ReactNode; readonly onPress?: Action; readonly disabled?: boolean; readonly pending?: boolean;
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost'; readonly type?: 'button' | 'submit' | 'reset';
  readonly ref?: Ref<HTMLButtonElement>;
}
export interface IconButtonProps extends ButtonProps { readonly label: string }
export interface TextFieldProps extends Base {
  readonly label: string; readonly value: string; readonly onValueChange: ValuePort<string>;
  readonly disabled?: boolean; readonly required?: boolean; readonly placeholder?: string;
  readonly type?: 'text' | 'password' | 'email' | 'search' | 'url' | 'tel' | 'number'; readonly ref?: Ref<HTMLInputElement>;
}
export interface TextAreaProps extends Base {
  readonly label: string; readonly value: string; readonly onValueChange: ValuePort<string>;
  readonly disabled?: boolean; readonly rows?: number; readonly ref?: Ref<HTMLTextAreaElement>;
}
export interface SelectOption { readonly value: string; readonly label: string; readonly disabled?: boolean }
export interface SelectProps extends Base {
  readonly label: string; readonly value: string; readonly options: readonly SelectOption[];
  readonly onValueChange: ValuePort<string>; readonly disabled?: boolean; readonly ref?: Ref<HTMLSelectElement>;
}
export interface SwitchProps extends Base {
  readonly label: string; readonly checked: boolean; readonly disabled?: boolean;
  readonly onCheckedChange: (required: { checked: boolean }, optional?: Record<string, never>) => void;
}
export interface DialogProps extends Base {
  readonly open: boolean; readonly title: string; readonly children?: ReactNode; readonly onClose: Action;
  readonly pending?: boolean; readonly closeLabel?: string; readonly ref?: Ref<HTMLDialogElement>;
}
export type KitConfirmTone = 'default' | 'warning' | 'danger';
/** The host kit's confirm dialog. Admin's own ConfirmDialog (components/ConfirmDialog) is separate. */
export interface KitConfirmDialogProps extends Base {
  readonly open: boolean; readonly title: string; readonly confirmLabel: string; readonly cancelLabel?: string;
  readonly tone?: KitConfirmTone; readonly pending?: boolean; readonly consequence?: string; readonly agentMayConfirm?: boolean;
  readonly body?: ReactNode; readonly errorLabel?: string;
  readonly onConfirm: (required: Record<string, never>, optional?: Record<string, never>) => void | Promise<void>;
  readonly onCancel: Action;
  readonly actionAccessibleNames?: { readonly cancel: string; readonly confirm: string };
}
export interface TabItem { readonly id: string; readonly label: string; readonly content: ReactNode; readonly disabled?: boolean; readonly attrs?: KitAttrs }
export interface TabsProps extends Base { readonly label: string; readonly value: string; readonly items: readonly TabItem[]; readonly onValueChange: ValuePort<string> }
export interface MenuItem { readonly id: string; readonly label: string; readonly disabled?: boolean; readonly onPress: Action; readonly attrs?: KitAttrs }
export interface MenuProps extends Base { readonly label: string; readonly items: readonly MenuItem[]; readonly disabled?: boolean }
export interface NoticeProps extends Base { readonly children: ReactNode; readonly tone?: Tone }
export interface SpinnerProps extends Base { readonly label?: string }
export interface BadgeProps extends Base { readonly children: ReactNode; readonly tone?: Tone }
export interface InfoTipProps { label: string; agentHandle?: string | false | undefined }
type LightboxPart = 'dialog' | 'close' | 'previous' | 'next';
export interface LightboxProps {
  open: boolean; title: string; onClose: () => void; children?: ReactNode;
  index?: number | undefined; count?: number | undefined; onNavigate?: ((index: number) => void) | undefined;
  labels?: Partial<Record<'close' | 'previous' | 'next', string>> | undefined; className?: string | undefined;
  partAttrs?: Partial<Record<LightboxPart, Record<string, string>>> | undefined;
}
/** Option rows for the searchable listbox; `group` runs must arrive ordered. */
export interface WidgetSelectOption { value: string; label: string; group?: string | undefined; badge?: string | undefined; detail?: string | undefined }
export interface WidgetSelectProps {
  value: string; onChange: (value: string) => void; options: WidgetSelectOption[];
  placeholder?: string | undefined; id?: string | undefined; 'aria-label'?: string | undefined;
  disabled?: boolean | undefined; agentHandle?: string | false | undefined; translate?: Translate | undefined;
}
export interface TabBarTab { readonly id: string; readonly label: string; readonly icon?: ReactNode | undefined; readonly count?: number | undefined; readonly tag?: string | undefined }
export interface TabBarProps { tabs: readonly TabBarTab[]; activeId: string; onChange: (id: string) => void; ariaLabel: string; containerHandle?: string | undefined }
export interface CanvasEmbedPlaceholderDescriptor { kindLabel: string; identityLabel: string }
export interface CanvasContentWrapperNode { tagName: string; attributes?: Readonly<Record<string, string>> }
export interface CanvasStyling {
  adminTheme?: AdminTheme; colorScheme?: ColorScheme; stylesheets?: readonly string[]; css?: string;
  contentWrapper?: readonly CanvasContentWrapperNode[];
}
/** `flush()` before save/unmount syncs an open rich-text session's pending edit into onChange. */
export interface InteractiveHtmlEditorHandle { flush(): Promise<string | undefined> }
export interface HtmlEditorProps {
  html: string; onChange: (html: string) => void; className?: string; canvasStyling?: CanvasStyling;
  isProtectedElement?: (el: Element) => boolean;
  describeEmbedPlaceholder?: (el: Element) => CanvasEmbedPlaceholderDescriptor | undefined;
  ref?: Ref<InteractiveHtmlEditorHandle>;
}
export interface ErrorNoticeProps { readonly failure: UserFacingError; readonly t?: Translate; readonly className?: string; readonly role?: 'alert' | 'status' }

export interface AdminKitComponents {
  Button: ComponentType<ButtonProps>; IconButton: ComponentType<IconButtonProps>; TextField: ComponentType<TextFieldProps>;
  TextArea: ComponentType<TextAreaProps>; Select: ComponentType<SelectProps>; Switch: ComponentType<SwitchProps>;
  Dialog: ComponentType<DialogProps>; ConfirmDialog: ComponentType<KitConfirmDialogProps>; Tabs: ComponentType<TabsProps>;
  Menu: ComponentType<MenuProps>; Notice: ComponentType<NoticeProps>; Spinner: ComponentType<SpinnerProps>;
  Badge: ComponentType<BadgeProps>; InfoTip: ComponentType<InfoTipProps>; Lightbox: ComponentType<LightboxProps>;
  WidgetSelect: ComponentType<WidgetSelectProps>; TabBar: ComponentType<TabBarProps>; HtmlEditor: ComponentType<HtmlEditorProps>;
  ErrorNotice: ComponentType<ErrorNoticeProps>;
}

/* ---------- hooks ---------- */
export interface AgentControlProps {
  readonly agentHandle?: string | false | undefined; readonly 'data-agent-element'?: string | undefined;
  readonly 'data-agent-private'?: string | boolean | undefined; readonly 'data-agent-page'?: string | undefined;
}
export interface DirtyGuard {
  isDirty: boolean;
  confirmLeave: (required?: Record<string, never>, optional?: { unsavedBeyondTracked?: boolean }) => boolean;
}
export type DirtyGuardHostPort = Pick<Window, 'addEventListener' | 'removeEventListener' | 'confirm'>;
export interface SettlementGeneration { next: () => number; isCurrent: (required: { generation: number }) => boolean }
/** The fields of the host's confirm view model admin's ConfirmDialog reads. */
export interface ConfirmControllerView {
  readonly pending: boolean; readonly error: ReactNode;
  readonly cancel: { readonly attrs?: KitAttrs; readonly onPress?: Action };
  readonly confirm: { readonly attrs?: KitAttrs; readonly onPress?: Action };
  requestDismiss(required: { reason: 'cancel-button' | 'escape' | 'backdrop' | 'close' }, optional?: Record<string, never>): boolean;
}
export interface NativeDialogView {
  readonly titleId: string;
  readonly props: {
    readonly ref: RefObject<HTMLDialogElement | null>;
    readonly onCancel: (event: SyntheticEvent<HTMLDialogElement>) => void;
    readonly onClick: (event: MouseEvent<HTMLDialogElement>) => void;
  };
}
export interface AdminKitHooks {
  useAgentHandle(required: AgentControlProps, optional?: Record<string, never>): string | undefined;
  useFocusTrap(required: { containerRef: RefObject<HTMLElement | null> }, optional?: { active?: boolean | undefined }): void;
  useDirtyGuard<T>(required: { current: T; original: T | null }, optional?: { translate?: Translate | undefined; host?: DirtyGuardHostPort | undefined }): DirtyGuard;
  useSettlementGeneration(): SettlementGeneration;
  useConfirmController(required: KitConfirmDialogProps, optional?: { agent?: AgentAttrsPort }): ConfirmControllerView;
  useNativeDialog(required: DialogProps, optional?: { initialFocus?: () => void; document?: Pick<Document, 'activeElement'> }): NativeDialogView;
}

/* ---------- fetch-query (core's adapter + the scope hook) ---------- */
export interface AdminQueryKit extends FetchQueryAdapter {
  useFetchQueryScope(required: { owner: object }, optional?: Record<string, never>): number;
}

/* ---------- theme (admin is ui/theme's only Jini consumer: shapes restated, DESIGN B4) ---------- */
export interface AdminThemeColors {
  readonly primary: string; readonly primaryInk: string; readonly bg: string; readonly surface: string; readonly text: string;
  readonly muted: string; readonly border: string; readonly danger: string; readonly success: string; readonly warning: string;
}
export interface AdminTheme {
  readonly name: string;
  readonly fonts: { readonly body: string; readonly heading: string; readonly mono?: string; readonly load?: readonly string[] };
  readonly light: AdminThemeColors; readonly dark: AdminThemeColors; readonly radius?: string; readonly density?: number;
}
export type ColorScheme = 'light' | 'dark';
export type ColorSchemePreference = ColorScheme | 'system';
export type MatchMediaPort = (query: string) => {
  readonly matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};
export type AdminThemeTarget = Pick<HTMLElement, 'style' | 'getAttribute' | 'setAttribute' | 'removeAttribute'>;
export type AdminThemeDocument = Pick<Document, 'head' | 'createElement' | 'baseURI'>;
export interface AdminThemeKit {
  applyAdminTheme(required: { readonly theme: AdminTheme }, optional: { readonly target: AdminThemeTarget; readonly document: AdminThemeDocument }): () => void;
  resolveColorScheme(required: { readonly preference: ColorSchemePreference }, optional?: { readonly matchMedia?: MatchMediaPort }): ColorScheme;
  readonly defaultAdminTheme: AdminTheme;
}

export interface AdminKit {
  readonly components: AdminKitComponents;
  readonly hooks: AdminKitHooks;
  readonly query: AdminQueryKit;
  readonly mediaProviders: AdminMediaProvidersKit;
  readonly theme: AdminThemeKit;
}

/* ---------- provider ---------- */
const AdminKitContext = createContext<AdminKit | null>(null);

/** Mount once at the host root. The first kit is kept: hook slots must not change identity. */
export function AdminKitProvider(required: { kit: AdminKit; children: ReactNode }, _optional: Record<string, never> = {}) {
  const [kit] = useState(() => required.kit);
  return <AdminKitContext.Provider value={kit}>{required.children}</AdminKitContext.Provider>;
}

export function useAdminKit(): AdminKit {
  const kit = useContext(AdminKitContext);
  if (!kit) throw new Error('@jini-ai/admin screens need <AdminKitProvider kit={...}> above them. '
    + 'The host builds the kit from its UI library and mounts it once at its root (Tovu: apps/admin/src/integrations/jini-kits.ts, mounted in main.tsx).');
  return kit;
}

/* ---------- same-name facades: moved/repointed code changes only its import line ---------- */
function slot<K extends keyof AdminKitComponents>(name: K): AdminKitComponents[K] {
  const Slot = forwardRef<unknown, ComponentProps<AdminKitComponents[K]>>(function AdminKitSlot(props, ref) {
    const Impl = useAdminKit().components[name] as ComponentType<Record<string, unknown>>;
    return <Impl {...(props as Record<string, unknown>)} ref={ref} />;
  });
  Slot.displayName = `AdminKit.${name}`;
  return Slot as unknown as AdminKitComponents[K];
}
export const Button = slot('Button');
export const IconButton = slot('IconButton');
export const TextField = slot('TextField');
export const TextArea = slot('TextArea');
export const Select = slot('Select');
export const Switch = slot('Switch');
export const Dialog = slot('Dialog');
export const ConfirmDialog = slot('ConfirmDialog');
export const Tabs = slot('Tabs');
export const Menu = slot('Menu');
export const Notice = slot('Notice');
export const Spinner = slot('Spinner');
export const Badge = slot('Badge');
export const InfoTip = slot('InfoTip');
export const Lightbox = slot('Lightbox');
export const WidgetSelect = slot('WidgetSelect');
export const TabBar = slot('TabBar');
export const HtmlEditor = slot('HtmlEditor');
export const ErrorNotice = slot('ErrorNotice');

export const useAgentHandle: AdminKitHooks['useAgentHandle'] = (r, o) => useAdminKit().hooks.useAgentHandle(r, o);
export const useFocusTrap: AdminKitHooks['useFocusTrap'] = (r, o) => useAdminKit().hooks.useFocusTrap(r, o);
export function useDirtyGuard<T>(required: { current: T; original: T | null }, optional?: { translate?: Translate | undefined; host?: DirtyGuardHostPort | undefined }): DirtyGuard {
  return useAdminKit().hooks.useDirtyGuard<T>(required, optional);
}
export const useSettlementGeneration: AdminKitHooks['useSettlementGeneration'] = () => useAdminKit().hooks.useSettlementGeneration();
export const useConfirmController: AdminKitHooks['useConfirmController'] = (r, o) => useAdminKit().hooks.useConfirmController(r, o);
export const useNativeDialog: AdminKitHooks['useNativeDialog'] = (r, o) => useAdminKit().hooks.useNativeDialog(r, o);

export const useFetchQuery: FetchQueryAdapter['useFetchQuery'] = (r, o) => useAdminKit().query.useFetchQuery(r, o);
export const useFetchMutation: FetchQueryAdapter['useFetchMutation'] = (r, o) => useAdminKit().query.useFetchMutation(r, o);
export const useInvalidate: FetchQueryAdapter['useInvalidate'] = () => useAdminKit().query.useInvalidate();
export const useCachedLoader: FetchQueryAdapter['useCachedLoader'] = (r, o) => useAdminKit().query.useCachedLoader(r, o);
export const useFetchQueryScope: AdminQueryKit['useFetchQueryScope'] = (r, o) => useAdminKit().query.useFetchQueryScope(r, o);

export const useMediaProvidersTab: AdminMediaProvidersKit['useMediaProvidersTab'] = (options) => useAdminKit().mediaProviders.useMediaProvidersTab(options);
/** The pure media-provider rules, read once per render by the hook that calls them. */
export function useMediaProviderRules(): AdminMediaProvidersKit['rules'] { return useAdminKit().mediaProviders.rules; }
/** applyAdminTheme / resolveColorScheme / defaultAdminTheme, read once per render. */
export function useAdminThemeKit(): AdminThemeKit { return useAdminKit().theme; }

export type { MediaProviderCatalogPolicy, MediaProviderOption };
```
Size ~250 lines; every function ≤10 lines, complexity 1–2.

### `packages/admin/src/react/kit-media-providers.ts` (types only, NEW)
Copy verbatim (byte for byte, why-comments kept) from `packages/ui/src/features/media-providers/`: `MediaProviderCredentials` (types.ts:37), `MediaProviderMap` (types.ts:50), `MediaProvidersLoadState` (types.ts:64), `MediaProvidersSaveState` (types.ts:73), `MediaProvidersPort` (ports.ts:15), `MediaProviderEditPatch` (react/hooks/useMediaProvidersTab.ts:21), `UseMediaProvidersTabOptions` (:23), `UseMediaProvidersTabResult` (:35). Rewrite their two `@jini-ai/core` type re-exports as `import type { MediaProviderCatalogPolicy, MediaProviderOption } from '@jini-ai/core'`. Then append:
```ts
/** The media-providers editor and its pure rules; ui implements them, admin's ProvidersTab renders them. */
export interface AdminMediaProvidersKit {
  useMediaProvidersTab(options: UseMediaProvidersTabOptions): UseMediaProvidersTabResult;
  readonly rules: {
    sortProvidersByConfigured<T extends { id: string; label: string }>(catalog: readonly T[], providers: MediaProviderMap, pinnedIds?: readonly string[]): T[];
    isEntryPresent(entry: MediaProviderCredentials | null | undefined): boolean;
    isMarkerOnlyEntry(entry: MediaProviderCredentials | null | undefined): boolean;
    maskedKeyLabel(entry: MediaProviderCredentials | null | undefined): string | null;
    isProviderBaseUrlInvalid(entry: MediaProviderCredentials | null | undefined): boolean;
    invalidBaseUrlProviderIds(providers: MediaProviderMap | null | undefined): readonly string[];
  };
}
```
**UNVERIFIED:** `sortProvidersByConfigured`'s exact parameter list (ui `rules.ts:222`). Copy its real signature; STOP if it is not a plain function of data.

## Fakes: `packages/admin/src/react/__tests__/fake-admin-kit.tsx` (NEW, unpublished)
```tsx
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { AdminKitProvider, type AdminKit } from '../kit.js';

/** Plain elements, no UI library: package tests check admin's behaviour, not a kit's markup. */
export function fakeAdminKit(overrides: Partial<{ [G in keyof AdminKit]: Partial<AdminKit[G]> }> = {}): AdminKit {
  return {
    components: { ...fakeComponents, ...overrides.components },
    hooks: { ...fakeHooks, ...overrides.hooks },
    query: { ...fixtureQuery({}), ...overrides.query },
    mediaProviders: { ...fakeMediaProviders, ...overrides.mediaProviders },
    theme: { ...fakeTheme, ...overrides.theme },
  } satisfies AdminKit;
}
export function renderWithAdminKit(ui: ReactElement, options: { kit?: AdminKit } = {}): RenderResult {
  return render(<AdminKitProvider kit={options.kit ?? fakeAdminKit()}>{ui}</AdminKitProvider>);
}
```
Rows (each ≤3 lines): `Button`/`IconButton` → `<button {...p.attrs} type={p.type ?? 'button'} className={p.className} disabled={p.disabled || p.pending} aria-label={'label' in p ? p.label : undefined} onClick={() => p.onPress?.({})}>{p.children}</button>`; `TextField`/`TextArea`/`Select` → labelled native control calling `onValueChange({ value })`; `Switch` → checkbox calling `onCheckedChange({ checked })`; `Dialog` → `p.open ? <div role="dialog" aria-label={p.title}>{p.children}<button onClick={() => p.onClose({})}>{p.closeLabel ?? 'Close'}</button></div> : null`; `ConfirmDialog` → same with confirm/cancel buttons; `Tabs` → buttons + active `content`; `Menu` → buttons per item; `Notice`/`Badge` → `<div role="status" data-tone={p.tone}>`; `Spinner` → `<span role="progressbar" aria-label={p.label}>`; `InfoTip` → `<span title={p.label} />`; `Lightbox` → like Dialog; `WidgetSelect` → native `<select aria-label>` calling `onChange(value)`; `TabBar` → `role="tablist"` buttons calling `onChange(id)`; `HtmlEditor` → `<textarea value={p.html} onChange={e => p.onChange(e.target.value)} />`; `ErrorNotice` → `<p role={p.role ?? 'alert'}>{p.failure.message}</p>`.
Hooks: `useAgentHandle: r => r.agentHandle === false ? undefined : r.agentHandle ?? 'fake-handle'`; `useFocusTrap: () => {}`; `useDirtyGuard: r => ({ isDirty: r.original !== null && JSON.stringify(r.current) !== JSON.stringify(r.original), confirmLeave: () => true })`; `useSettlementGeneration` → a `useRef` counter object; `useConfirmController` → `{ pending: !!r.pending, error: null, cancel: { onPress: () => r.onCancel({}) }, confirm: { onPress: () => void r.onConfirm({}) }, requestDismiss: () => { r.onCancel({}); return true; } }`; `useNativeDialog` → `{ titleId: 'fake-title', props: { ref: useRef(null), onCancel: () => r.onClose({}), onClick: () => {} } }`.
`fixtureQuery({ data? })`: `useFetchQuery` returns `{ data, status: 'success', ... }` per core's `QueryResult` (copy the field list from `core/src/fetch/types.ts`), mutations resolve immediately, `useInvalidate: () => () => {}`, `useFetchQueryScope: () => 1`. `fakeMediaProviders`: rules = trivial pure stubs; `useMediaProvidersTab` returns an idle editor. `fakeTheme`: `applyAdminTheme: () => () => {}`, `resolveColorScheme: r => r.preference === 'dark' ? 'dark' : 'light'`, `defaultAdminTheme` = a frozen neutral literal.

## Tovu binding: `apps/admin/src/integrations/jini-kits.ts` (NEW)
```ts
import { Badge, Button, ConfirmDialog, Dialog, IconButton, Menu, Notice, Select, Spinner, Switch, Tabs, TextArea, TextField, useConfirmController } from '@jini-ai/ui-kit/react';
import { useNativeDialog } from '@jini-ai/ui-kit/react/native';
import { useAgentHandle, useMediaProvidersTab, sortProvidersByConfigured, isEntryPresent, isMarkerOnlyEntry, maskedKeyLabel,
  isProviderBaseUrlInvalid, invalidBaseUrlProviderIds } from '@jini-ai/ui';
import { ErrorNotice, useDirtyGuard, useFocusTrap, useSettlementGeneration } from '@jini-ai/ui/panel-kit';
import { InfoTip, Lightbox, Select as WidgetSelect } from '@jini-ai/ui/admin-widgets';
import { TabBar } from '@jini-ai/ui/tab-strip';
import { InteractiveHtmlEditor } from '@jini-ai/ui/html-editor';
import { applyAdminTheme, defaultAdminTheme, resolveColorScheme } from '@jini-ai/ui/theme';
import { useCachedLoader, useFetchMutation, useFetchQuery, useFetchQueryScope, useInvalidate } from '@jini-ai/ui/fetch-query';
import type { AdminKit } from '@jini-ai/admin/react/kit';

/** Tovu picks the implementations; @jini-ai/admin only states what it renders. ui-kit facades (not
 *  raw native parts) so Tovu's <KitProvider> still supplies agent attrs, overlay container and guards.
 *  A ui/ui-kit prop change that breaks admin fails typecheck HERE, at `satisfies`. */
export const adminKit = {
  components: { Button, IconButton, TextField, TextArea, Select, Switch, Dialog, ConfirmDialog, Tabs, Menu, Notice, Spinner, Badge,
    InfoTip, Lightbox, WidgetSelect, TabBar, HtmlEditor: InteractiveHtmlEditor, ErrorNotice },
  hooks: { useAgentHandle, useFocusTrap, useDirtyGuard, useSettlementGeneration, useConfirmController, useNativeDialog },
  query: { useFetchQuery, useFetchMutation, useInvalidate, useCachedLoader, useFetchQueryScope },
  mediaProviders: { useMediaProvidersTab, rules: { sortProvidersByConfigured, isEntryPresent, isMarkerOnlyEntry, maskedKeyLabel, isProviderBaseUrlInvalid, invalidBaseUrlProviderIds } },
  theme: { applyAdminTheme, resolveColorScheme, defaultAdminTheme },
} satisfies AdminKit;
```
**Coordinator lines for `apps/admin/src/main.tsx`** (lane does not edit it):
- after line 3 (`import { tovuAgentAttrs, tovuKit } ...`): `import { AdminKitProvider } from "@jini-ai/admin/react/kit";` and `import { adminKit } from "./integrations/jini-kits";`
- wrap the children of `<FetchQueryProvider>` (lines 78–84): `<AdminKitProvider kit={adminKit}>` … `</AdminKitProvider>`, so the order is `KitProvider > FetchQueryProvider > AdminKitProvider`. Order only matters for the hooks' call-time reads, and both providers are ancestors.
- The only React root that renders `@jini-ai/admin/*/react` is `apps/admin/src/main.tsx` (desktop, site-chat and website import no admin React: rg-checked).

## Tests
- Jini `packages/admin/src/react/__tests__/kit.unit.test.tsx` (NEW, vitest, `--maxWorkers=2` in the batched run):
  1. a facade outside a provider throws the message above (`render(<Button>x</Button>)`);
  2. re-rendering `<AdminKitProvider>` with a second kit keeps the first (spy `Button` in kit B is never called);
  3. `Button` facade forwards props and `ref` (ref receives the fake's `<button>`);
  4. `useDirtyGuard`, `useFetchQuery`, `useMediaProviderRules`, `useAdminThemeKit` facades return the kit's values (one `renderHook` each).
- The fake file `satisfies AdminKit` (typecheck proof the fake stays complete).
- Tovu: no new test; `satisfies AdminKit` in `jini-kits.ts` runs in Tovu typecheck (linked Jini, D1).
- Gates: admin `check-subpath-isolation` (kit.tsx is in `isolation.shared`), complexity/size gates, `L5-injected-edge` (kit.tsx imports only `react` and `@jini-ai/core*`).

## STOP conditions
- Any guard blob differs, or `kit.tsx`/`jini-kits.ts` already exist.
- `satisfies AdminKit` fails for a slot: report the slot and the TypeScript message; do not widen a prop type beyond the sheet (a ui/ui-kit drift is the owner's call).
- `kit.tsx` would import anything but `react`, `@jini-ai/core`, `@jini-ai/core/fetch`, `@jini-ai/core/text`, or its sibling `./kit-media-providers.js`.
- `UserFacingError` or `sortProvidersByConfigured` (the two UNVERIFIED items) differ from the sheet in a way that needs more than copying the real declaration.
- A function would exceed 50 lines or complexity 10.
- Any edit to an existing admin source file other than `package.json` (that is R1/R2's job).

## Files touched (disjoint from C0–C8, C9b, C9c, C10)
Jini: NEW `packages/admin/src/react/kit.tsx`, NEW `packages/admin/src/react/kit-media-providers.ts`, NEW `packages/admin/src/react/__tests__/{fake-admin-kit.tsx,kit.unit.test.tsx}`, EDIT `packages/admin/package.json` (exports, entries, isolation.shared), NEW `.changeset/admin-react-kit.md`.
Tovu: NEW `apps/admin/src/integrations/jini-kits.ts`. Coordinator: `apps/admin/src/main.tsx` (3 lines).
C7 touches `admin/src/core/module/*` only; no overlap.

## Unblocks
- **R1** (admin `react/`, 72 kit lines) and **R2** (admin non-React; its `forms/rules.ts` QueryKey and `seo/rules.ts` interpolate need only core and can run now). R1 also needs C1+, C2 (handles), C8 (forms types).
- The 11 KIT P3a move features (admin-themes, library, MediaPickerDialog, WidgetConfigFields, recovery, plugins, skills, ai-assistant, pages, email, WidgetPickerDialog, security/CopyKeysDialog) once C9a-M adds their slots.
- **C9b/C9c** copy this file's shape: `<Pkg>Kit { components, hooks, query? }`, `slot()`, first-kit-wins provider, plain-words missing-provider error, fake + `renderWith<Pkg>Kit`, Tovu `jini-kits.ts` gains `chatKit`/`userManagementKit`.

## §R. Repoint map for R1/R2 (old import → new; `<kit>` = relative path to `packages/admin/src/react/kit.js`)
| Old specifier | Names | New |
|---|---|---|
| `@jini-ai/ui-kit/react` | Button, IconButton, TextField, TextArea, Select, Switch, Dialog, ConfirmDialog, Tabs, Menu, Notice, Spinner, Badge, useConfirmController; type DialogProps | `<kit>` same names |
| `@jini-ai/ui-kit/react/native` | useNativeDialog | `<kit>` |
| `@jini-ai/ui-kit` | type AgentAttrsPort, KitAttrs | `<kit>` (type) |
| `@jini-ai/ui/fetch-query` | useFetchQuery, useFetchMutation, useInvalidate, useCachedLoader, useFetchQueryScope | `<kit>` |
| `@jini-ai/ui/fetch-query` | type QueryKey (forms/rules.ts, R2) | `@jini-ai/core/fetch` |
| `@jini-ai/ui/admin-widgets` | InfoTip, Lightbox | `<kit>` |
| `@jini-ai/ui/admin-widgets` | Select (EntityField.tsx, SeoPage.tsx) | `{ WidgetSelect as Select }` from `<kit>` |
| `@jini-ai/ui/tab-strip` | TabBar, type TabBarTab | `<kit>` |
| `@jini-ai/ui/panel-kit` | useDirtyGuard, useSettlementGeneration, useFocusTrap, type DirtyGuard | `<kit>` |
| `@jini-ai/ui/panel-kit`, `@jini-ai/ui/i18n` | interpolate, formatTimestamp, type Translate | `@jini-ai/core/text` |
| `@jini-ai/ui` | useAgentHandle | `<kit>` |
| `@jini-ai/ui` | extensionForMimeType | `@jini-ai/core/text` (after C1+) |
| `@jini-ai/ui/html-editor` | `InteractiveHtmlEditor as HtmlEditor`, `type InteractiveHtmlEditorProps as HtmlEditorProps`, type CanvasEmbedPlaceholderDescriptor | `{ HtmlEditor, type HtmlEditorProps, type CanvasEmbedPlaceholderDescriptor }` from `<kit>` |
| `@jini-ai/ui/html-editor` | hasAttributeOnAnyNodeShape | `@jini-ai/core/primitives` (after C1+) |
| `@jini-ai/ui/theme` | types AdminTheme, ColorSchemePreference, AdminThemeDocument, AdminThemeTarget, ColorScheme, MatchMediaPort | `<kit>` (type) |

**Hand edits (not import-line only), R1:**
1. `react/shell/use-admin-theme.ts`: import line → `import { useAdminThemeKit, type AdminTheme, type ColorSchemePreference } from '../kit.js';`; first statement of `useAdminTheme`: `const themeKit = useAdminThemeKit();`; `applyAdminTheme(` → `themeKit.applyAdminTheme(` (and add `themeKit` to that effect's deps); `resolveColorScheme(` → `themeKit.resolveColorScheme(`.
2. `consent/react/ConsentFields.tsx`: `COLOR_TOKENS` `fallback: defaultAdminTheme.light.bg|text|border` → `fallback: 'bg' | 'text' | 'border'` typed `keyof AdminThemeColors`; at the map (line 129) read `const { defaultAdminTheme } = useAdminThemeKit();` at the component top and pass `fallback={defaultAdminTheme.light[token.fallback]}`.
3. `media/react/hooks/ProvidersTab.hooks.ts`: import `{ useFetchMutation, useMediaProvidersTab, useMediaProviderRules } from '../../../react/kit.js'` and `import type { AdminMediaProvidersKit } from '../../../react/kit-media-providers.js'` (r2-sheets-b: kit.tsx does not re-export that type); in `useProvidersTab` add `const rules = useMediaProviderRules();` and pass `rules` in the `required` object of `rowStatus`, `baseUrlHint`, `providerRow`, `editorView` (and `settingsFields`/`credentialFields` only if they reach those helpers); replace the 6 bare calls with `rules.<name>(...)`.

**R1 risks:** (a) Tovu has 59 production files and 16 tests importing `@jini-ai/admin/*/react`; any Tovu test that renders an admin screen without `AdminKitProvider` throws after R1. R1's Tovu commit adds `apps/admin/src/__tests__/render-with-jini-kits.tsx` (wraps `KitProvider` + `FetchQueryProvider` + `AdminKitProvider` with the real `adminKit`) and repoints the failing tests the cloud run lists. (b) Admin package tests that assert ui-kit markup (agent handles, `jini-*` classes) cannot keep it with the plain fake under Q5: they move to `packages/integration-tests` or assert behaviour.

## §M. C9a-M (moved-file slots, follow-up) — props the moving Tovu files pass
- `Toast` (ui root; Plugins, Library): message, role, tone, ttlMs, onDismiss, actionLabel, onAction.
- `FileDropzone` (Library): accept, prompt, helper, onFiles.
- `SettingsDialogShell` (Recovery; generic `<T extends SettingsDialogTab>` → declare with Recovery's concrete tab type): tabs, activeTabId, onActiveTabIdChange, presentation, className, fullscreenEnabled, dialogAriaLabelledBy, labels. Plus `I18nProvider` (the `@jini-ai/ui` root one: initialLocale, dictionaries, fallbackLocale, syncDocumentAttributes) and the value `SETTINGS_DIALOG_DICTIONARIES` (as `kit.values.settingsDialogDictionaries`, read through a hook).
- `SecretInput` (EmailProviderTab; Tovu's own wrapper today): label, autoComplete, spread input props.
- `TabBar`, `ErrorNotice`, `Button`, `Dialog`, `useFetchQuery`: already in C9a.

## No-shells revision (2026-11-15) — overrides decision 2's "ui keeps re-exports" and §R's status
1. **C1+ is now its own sheet, `C1-plus.md`, with deletes:** `extensionForMimeType` → `@jini-ai/core/text`, `hasAttributeOnAnyNodeShape` → `@jini-ai/core/primitives` (parameter typed structurally as `NodeShape`; core has no DOM lib). ui's definitions and its 3 barrel re-exports are deleted; importers in `C1-plus.repoint.tsv` (13 Jini + 5 Tovu files).
2. **C9a deletes nothing** (the kit adds a contract; ui-kit/ui keep their real components, which the host binds). So C9a has no old definitions and no shells. Its import-line changes are the §R map, applied to admin by the wave pass after C9a lands; the 3 hand edits stay with R1.
3. **`C9a.repoint.tsv` is NOT built yet** (context cap). Build it with a TS-AST pass over `packages/admin/src/**` (tests included) for imports from `@jini-ai/ui-kit*` and `@jini-ai/ui*`, mapping names per §R (`<kit>` = relative path to `packages/admin/src/react/kit.js`; `QueryKey` → `@jini-ai/core/fetch`; `interpolate`/`formatTimestamp`/`Translate` → `@jini-ai/core/text`; the two C1+ names come from `C1-plus.repoint.tsv`, not here). Expected ~80 lines in ~70 admin files (EDGES-sites rows with lane R1/R2 and target ui/ui-kit). Tovu: 0 rows (hosts may import ui-kit).
4. **UNVERIFIED items:** still open for the executor (`UserFacingError` specifier; `sortProvidersByConfigured` signature). Not re-checked here (context cap).

## Resolution of UNVERIFIED items, repoint TSV, mount CHECKs (2026-11-15, Jini `jini-terra-base`, Tovu `tovu-codex-trial-terra`)
1. **`UserFacingError` specifier: resolved.** `import type { UserFacingError } from '@jini-ai/core';` (core `index.ts:13` does `export * from './user-facing-error.js'`; `ErrorNotice.tsx:1` imports it the same way). Drop the UNVERIFIED marker on kit.tsx line "import type { UserFacingError }".
2. **`sortProvidersByConfigured` signature: resolved, the sheet's copy is wrong.** Real (ui `media-providers/rules.ts:222`): `sortProvidersByConfigured<T extends { id: string; label: string }>(catalog: readonly T[], providers: MediaProviderMap | null | undefined, pinnedIds: readonly string[] = []): readonly T[]`. Use `providers: MediaProviderMap | null | undefined` and return `readonly T[]` in `AdminMediaProvidersKit.rules` (admin's only call, `ProvidersTab.hooks.ts:199`, passes `editor.providers`). It is a plain function of data, so no STOP. The other five rule signatures were not re-read; the executor copies each from `rules.ts`.
3. **`C9a.repoint.tsv` built** (script: a TS-AST pass over `packages/admin/src/**`, scratch `c9a.cjs`, because the census tool resolves declaring files and C9a has no moved file). 132 rows, 107 admin files, Jini only (Tovu 0). 84 rows repoint to `<kit>` (relative `react/kit.js`), 1 to `@jini-ai/core/fetch` (`QueryKey`), 2 to C1+ (`extensionForMimeType`, `hasAttributeOnAnyNodeShape`; the actual edit lives in `C1-plus.repoint.tsv`), 45 MANUAL.
   - `interpolate`/`formatTimestamp`/`Translate` are ALREADY imported from `@jini-ai/core/text` in admin, so those rows from §R are no-ops.
   - **MANUAL, not in the §R map:** (a) `FetchQueryProvider` (33 test files), `KitProvider`, `createKit`, `ConfirmViewProps` and the tanstack `FetchQueryProvider`: test harness imports the kit has no slot for. §R risk (b) applies: kit-only tests render through `renderWithAdminKit` (fake-admin-kit.tsx); a test that needs real ui-kit/ui moves to `packages/integration-tests`. R1 decides per file. (b) `applyAdminTheme`, `resolveColorScheme`, `defaultAdminTheme` are hand edits 1 and 2; tests get the theme from the fake kit. (c) the six media rules are hand edit 3.
   - `type ButtonProps` (3 test files) maps to `<kit>`; `ButtonProps` is exported by kit.tsx.
   - One test file has `vi.mock('@jini-ai/ui/html-editor')` plus an `import()` type (`InteractiveHtmlEditor.wiring.test.tsx`): MANUAL.
4. **C9-ui mount-list CHECK: resolved.** React roots in Tovu: `apps/admin/src/main.tsx`, `apps/site-chat/src/main.tsx`, `apps/desktop/src/renderer/main.tsx` (mounts `<App />` through `mount-renderer.ts`). `apps/website` has no `createRoot`/`hydrateRoot`/`renderToString`, so it needs no provider. Desktop's renderer imports `@jini-ai/chat` (`WorkspaceChatPane.tsx`, `App.tsx`) and `@jini-ai/ui`, so it needs the chat and ui providers too. `SecretReveal` shape (ui-kit `secret-reveal.hooks.ts:34`): `{ revealed: boolean; inputType: 'text' | 'password'; toggleLabel: string; toggle(): void }`, as the sheet already declared, so drop that CHECK.
5. **C10 CHECKs: resolved.** `McpUiHost` is a plain function (`McpUiHost.tsx:39`), no `forwardRef`. Chat has `zod` in devDependencies (not dependencies), so the fake may use it in test files. Mount list = the three roots above; website needs none. The `mcp-ui-resource.ts` file name was already settled by the C10 revision.

## r2-sheets-b revision (2026-11-15; Codex review r2; wins over everything above)
1. **Test wrappers land with wave B** (coordinator decision), not R1: package tests render through a test-only REAL kit (`admin/src/__tests__/kit-render-support.tsx`, same body as Tovu's `jini-kits.ts`), `fetch-query-support.ts` wraps it, failing tests are switched by the missing-provider message. Tovu: `apps/admin/src/__tests__/render-with-jini-kits.tsx` with `KitProvider > FetchQueryProvider > UiKitProvider > AdminKitProvider` (UiKitProvider added: the real `WidgetSelect` needs it after C9-ui). Steps: **`../followups/C9a.md`**.
2. Fakes whose real slot is `forwardRef` forward `ref` to the native element (Button/IconButton at least).
3. Hand edit 3's `AdminMediaProvidersKit` import corrected above (from `kit-media-providers.js`).
4. TSV: rows 19/99 (C1+ prose targets) deleted (C1-plus owns them); rows 92/98 carry `InteractiveHtmlEditor->HtmlEditor`, `InteractiveHtmlEditorProps->HtmlEditorProps`.
5. Tovu `apps/admin/src/integrations/jini-kits.ts` has two writers (C9a, C9-ui): C9a lands first; C9-ui merges its `uiKit` into it.
