# HARDEN-A13: desktop renderer controllers -> existing `@jini-ai/ui` owners (templates T-HARDEN + T-UI)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`); every cited line read that day. Row `audit2:A13` (7 files, "extend existing ui owners"). `kit-inject(C9-ui)` is **not** needed: the moved code is hooks and pure rules; the one component (`SiteToast`) renders plain elements. Direct `ui` target (KINDS §7: pkg `ui` is the direct case).

Tier: S1 Sonnet (4 additive Jini commits, each independent), S2 Sonnet (Tovu repoint). Opus review only for S1.b (dismiss behaviour change reaches six existing callers). est. executor tokens ≈ 75k (S1 45k, S2 30k). Chrome/Electron look owed (desktop renderer: tab strip keyboard + overflow, toast, card menu dismissal).

## What exists, what is missing (read before slicing)
- **Dismiss already has an owner, not exported.** Jini `ui/src/browser/useDismissOnOutsideOrEscape.ts` (blob `8dfe4c89…`) wraps `ui/src/utils/dom-subscriptions.ts` `subscribeOutsideClickOrEscape` (blob `46af5eea…`). It is **not reachable by Tovu**: `packages/ui/package.json` has no `"./browser"` export and neither `src/index.ts` nor `src/core.ts` re-exports it (rg 2026-11-16). Tovu's `useDismissibleDropdown` (`use-dropdown-menu.hooks.ts:33-55`) differs from it in exactly two behaviours: (1) Escape is listened to in the **capture** phase (`doc.addEventListener('keydown', onEscape, true)`), so a dropdown closes before a host dialog's own bubbling Escape handler; (2) `dismissOnEscape` ignores Escape while `isComposing` (IME). Jini's version is bubble-phase and has no IME guard. So this is a **HARDEN** (add both, opt-in capture + always-on IME guard), then repoint.
- **Tab strip has an owner of a different shape.** Jini `ui/tab-strip` (index blob `4aac771f…`) is a drag-reorder strip (`TabStrip`, `TabStripItem`, `useTabStripDragReorder`) plus `TabBar` with `useTabBarKeyboard` (enabled-index math, calls `onChange`). The desktop strip is **scrollable with overflow arrows, auto-reveals the active tab, roving tabindex, and arrow keys that *click* the next DOM tab**; its markup (All tab, Import tab, status dot, `tabstrip*`/`tab*` classes) is product. Jini has none of the scroll/overflow/roving logic (`useActiveTabInView` exists in `TabBar.hooks.tsx` but only moves `scrollLeft`, no overflow state, no arrows). So the **hooks and pure rules move; `app/TabStrip.tsx` stays** (its JSX is the product tab design).
- **Menu keyboard (`menuFocusIndex`, `useMenuKeyboard`) has no Jini twin** (`rg -n "menuitemradio" packages/ui/src` hits only unrelated pickers). Generic: moves next to the dismiss hook.
- **Toast has no `ui` owner** (`rg -il toast packages/ui/src` hits only unrelated features). New small feature `ui/transient-notice`; the product copy ("New website created: …") stays.
- **`SiteGrid`:** `SiteGrid.tsx` (749 lines) already renders Jini `ui/site-card` (`SiteCard`, `SiteCardPin`, `SiteCardStatus`, `SiteListToolbar`, `useSiteListView`); the composition (power, locate, delete copy, rename overlay, `SiteRecord`) is Tovu product and **stays**. Only four generic helpers in `SiteGrid.hooks.ts` move: `isCardOpenKey` (:47), `cardOpenProps` (:189), `closeMenuThen` (:220), `duplicateDisplayNames` (:231). `isCardOpenable`, `cardOverlay`, `siteCardTone`, `databaseLabel`, `deleteActionCopy`, `siteCardParentFolder` read `SiteRecord` and stay.

## Verdict table
| file (lines, blob) | verdict |
|---|---|
| `renderer/use-tab-strip.hooks.ts` (84) `0f3593f1…` | MOVE hook + 4 pure fns -> `ui/tab-strip` `scrollable.ts` + `useScrollableTabStrip` (the `SiteRecord` dependency becomes `tabs: readonly { id: string; label: string }[]`) |
| `renderer/app/TabStrip.tsx` (106) `a4818a96…` | STAYS (product markup); consumes the hook |
| `renderer/SiteToast.tsx` (21) `05a47a2a…`, `use-site-toast.hooks.ts` (51) `02a3b790…` | SPLIT: generic `useTransientNotice` + `TransientNotice` -> `ui/transient-notice`; `createdToast`/`announceImported`/`announceAdded` and all English copy stay (`use-site-toast.hooks.ts` reduces to the product announcers over the Jini hook) |
| `renderer/use-dropdown-menu.hooks.ts` (155) `9fe20d49…` | SPLIT: `useDismissibleDropdown` -> composition of Jini `useDismissOnOutsideOrEscape` (after S1.b); `menuFocusIndex` + `useMenuKeyboard` -> `ui/browser`; `settingsControlHandlers`/`SettingsControlHandlers` (theme preference) STAY |
| `renderer/SiteGrid.hooks.ts` (271) `d36c3026…` | SPLIT: 4 helpers -> `ui/site-card` `rules.ts`; rest stays |
| `renderer/SiteGrid.tsx` (749) `38bc5570…` | STAYS; import edits only (:1, :46-55) |

## Guards (blobs at integ/wave-b)
```
tovu_files (edit):
  - apps/desktop/src/renderer/use-tab-strip.hooks.ts | blob 0f3593f1dffcc88df5e9d71e11aaa849b145294d   (DELETE)
  - apps/desktop/src/renderer/app/TabStrip.tsx | blob a4818a96036c68f5d3ca11ad3fa777a54dea3313
  - apps/desktop/src/renderer/SiteToast.tsx | blob 05a47a2a4b30dba0b82b796a5be5642c9227b802   (DELETE)
  - apps/desktop/src/renderer/use-site-toast.hooks.ts | blob 02a3b790295e382e45ba92c47f5ad80b11c70add   (reduce)
  - apps/desktop/src/renderer/use-dropdown-menu.hooks.ts | blob 9fe20d49cda65e73b4f9a49c3eb6386e10f11c92   (reduce)
  - apps/desktop/src/renderer/SiteGrid.hooks.ts | blob d36c3026f80727b82a4d97dbf80df8fb8434f898   (reduce)
  - apps/desktop/src/renderer/SiteGrid.tsx | blob 38bc55709b17a48365d75b315b41092e5aa6ea2b
  - apps/desktop/src/renderer/App.tsx (:22-23, :142, :276), App.hooks.ts | blob c739230e3eec9a23f376532f8aaf653419a648a3 (:41-44 re-exports), use-start-imported.hooks.ts (:13 type import): guard by text
  - apps/desktop/src/renderer/app.css (`.site-toast*` :1911-1920; guard by text)
tovu_tests:
  - tab-strip-keyboard.test.ts 5415bec3… , use-tab-strip.hooks.render.test.ts 0abc7c9e… , use-site-toast.hooks.render.test.ts 6e3f0924… ,
    use-dropdown-menu.hooks.render.test.ts 0e928f55… , use-dropdown-menu.hooks.test.ts 082e9016… , SiteGrid.hooks.test.ts 02c59d51… (all under apps/desktop/src/renderer/)
jini_guards:
  - packages/ui/package.json | blob 83c6938b9d18b8c75ad42fa29f84c25124b8f289
  - packages/ui/src/browser/useDismissOnOutsideOrEscape.ts | blob 8dfe4c89f8212e776a136b82b8f539e5f94aefe5 ; browser/index.ts | blob 469cbcb631461abdc7a7bdd363156d98d42fdca0
  - packages/ui/src/utils/dom-subscriptions.ts | blob 46af5eeae88354e19ffbc6030e6401e3e848262e
  - packages/ui/src/features/tab-strip/index.ts | blob 4aac771f16e8a1bc62cc7bb04445904ce95b5528 ; tab-strip/rules.ts | blob 5b958b282019bde7011db6708860c2e725533e5d
  - packages/ui/src/features/site-card/index.ts | blob 16f19d5973f346f8135ce2b95e7686e93287bd7f ; site-card/SiteCard.tsx | blob 1d08dd210ecb80c57655be77141d0ae06f019b38
  - packages/ui/src/features/transient-notice/** must not exist ; packages/ui/src/features/tab-strip/scrollable.ts must not exist
```
Importer census (rg 2026-11-16): `use-tab-strip` <- `app/TabStrip.tsx:1` + its 2 tests; `SiteToast`/`use-site-toast` <- `App.tsx:22,23,142,276`, `use-start-imported.hooks.ts:13,25,45` (type only), the toast render test; `use-dropdown-menu.hooks` <- `App.hooks.ts:44` (a **re-export block**, `App.hooks.ts:41`: `useDismissibleDropdown` and friends re-exported; rule 19: S2 deletes the re-exports and repoints every consumer: `rg -n "useDismissibleDropdown|useMenuKeyboard|menuFocusIndex" apps/desktop/src` lists them: `SiteGrid.tsx:47` (`useDismissibleDropdown` from `./App.hooks.js`), `App.tsx`/`SettingsControl`; S2 step 0 prints the full list); the four SiteGrid helpers <- `SiteGrid.tsx:54,134,220,622` and `SiteGrid.hooks.test.ts:10`.

## Contracts
S1.a `ui/src/utils/dom-subscriptions.ts` + `browser/useDismissOnOutsideOrEscape.ts` (additive options, defaults keep today's behaviour except the IME guard):
```ts
export function subscribeOutsideClickOrEscape(
  container: { current: HTMLElement | null } | undefined, onClose: () => void,
  options: { escapeCapture?: boolean } = {},            // NEW, default false = today's bubble listener
): () => void;                                          // Escape is ignored while event.isComposing (NEW, all callers)
// useDismissOnOutsideOrEscape options gain `escapeCapture?: boolean`, passed through.
```
Positional `(container, onClose)` is the existing signature of a Jini util; the new third argument keeps it (converting it to `(required, optional)` is a separate hardening of six callers, **not part of A13**: STOP and report if the executor wants to).
S1.b export: `packages/ui/package.json` gains `"./browser"` (`types/import/default` -> `./dist/browser/index.js`) + `jini.entries "./browser": "browser"` + a README line (COMMON 17). `browser/index.ts` additionally exports `menuFocusIndex`, `useMenuKeyboard`, `DocumentFocus`.
S1.c `ui/src/features/tab-strip/scrollable.ts` (pure) + `react/hooks/useScrollableTabStrip.ts`:
```ts
export function tabOverflow(required: { strip: Pick<HTMLElement,'scrollWidth'|'clientWidth'|'scrollLeft'> }, optional?: Record<string, never>): { left: boolean; right: boolean };
export function revealActiveTab(required: { strip: Pick<HTMLElement,'querySelector'>; activeSelector?: string }, optional?: Record<string, never>): void;   // default selector '.is-active' is a host class: made a parameter with default '[aria-selected="true"]'
export function rovingTabIndex(required: { activeId: string | null; tabIds: readonly (string | null)[]; tabId: string | null }, optional?: Record<string, never>): 0 | -1;
export function nextTabListIndex(required: { key: string; index: number; count: number }, optional?: Record<string, never>): number | undefined;
export function navigateTabList(required: { strip: Pick<HTMLElement,'querySelectorAll'>; event: Pick<KeyboardEvent,'key'|'target'|'preventDefault'|'altKey'|'ctrlKey'|'metaKey'|'shiftKey'> }, optional?: Record<string, never>): void;   // focus + click, as Tovu
export function useScrollableTabStrip(required: { activeTab: string | null; tabs: readonly { id: string; label: string }[] }, optional?: { ResizeObserverImpl?: typeof ResizeObserver }): { stripRef; overflow; showArrows; scrollLeft; scrollRight; tabIndex; onKeyDown };
```
**Behaviour deltas to pin (red-first):** (1) `revealActiveTab` default selector changes from `.is-active` to `[aria-selected="true"]` because a package may not bake in a host class; **Tovu passes `activeSelector: '.is-active'`** through a second hook option so the desktop output is unchanged (the Tovu markup sets both); (2) `useScrollableTabStrip`'s `tabKey` dependency is `JSON.stringify(tabs.map(t => [t.id, t.label]))` — same as today's `[id, displayName]`.
`nextTabListIndex` is Tovu's private `nextTabIndex` (:53); it is intentionally **not** merged with Jini's `resolveTabBarKeyTarget`: that one skips disabled tabs and reports the *tab list position among enabled* tabs, this one navigates raw DOM tabs; a test in S1.c asserts the two agree on an all-enabled list for ArrowLeft/Right/Home/End (documents why both exist).
S1.d `ui/src/features/site-card/rules.ts` (new file, exported from `site-card/index.ts`): `isCardOpenKey`, `cardOpenProps`, `CardOpenKeyEvent`, `closeMenuThen`, `duplicateDisplayNames` (generic over `{ displayName: string }`, verbatim signatures: all already `(required, optional = {})`).
S1.e `ui/src/features/transient-notice/{rules.ts,index.ts,react/hooks/useTransientNotice.ts,react/components/TransientNotice.tsx}`:
```ts
export interface TransientNoticeValue { message: string; note?: string; items?: readonly string[] }
export function useTransientNotice(required: Record<string, never>, optional?: { autoHideMs?: number; autoHideWithDetailsMs?: number }): { notice: TransientNoticeValue | null; show: (n: TransientNoticeValue) => void; dismiss: () => void };
export function TransientNotice(props: { notice: TransientNoticeValue | null; onDismiss: () => void; labels?: { showList?: string; dismiss?: string } }): JSX.Element | null;
```
Defaults 5000 / 12000 (Tovu `AUTO_HIDE_MS` / `AUTO_HIDE_WITH_NOTE_MS`; a notice with `note` or `items` uses `Math.max(autoHideMs, autoHideWithDetailsMs)` exactly as today). Labels default `Show list` / `Dismiss` (the Tovu strings are English literals today: no i18n regression). Classes: `jini-transient-notice`, `__message`, `__note`, `__items`, `jini-transient-notice__dismiss`; the dismiss button keeps `className="button button--quiet"` as a **second** class supplied by the host through a `dismissClassName` prop (default empty) so Tovu's `.button--quiet` styling still applies. Role `status`, `×` glyph and `aria-label` as today.

```
id: HARDEN-A13-1a .. 1e, A13-2
feature: desktop renderer controllers -> @jini-ai/ui owners
jini_target: ui src/utils/dom-subscriptions.ts + src/browser/* (+ ./browser export) ; ui/tab-strip scrollable ; ui/site-card rules ; ui/transient-notice (new subpath ./transient-notice, browser tag, README)
changeset: @jini-ai/ui: minor | "browser: exported dismiss + menu-keyboard hooks (capture + IME-safe Escape); tab-strip: scrollable strip hook; site-card: open-key helpers; transient-notice: one-at-a-time timed notice"
```

## HARDEN-A13-1 — Jini, five commits (each stands alone; tests first, red on the parent)
**1a dismiss options.** Tests (`utils/__tests__/dom-subscriptions.test.ts` + `browser/__tests__`): RED: `escapeCapture:true` fires on Escape even when a bubbling handler on a child calls `stopPropagation` (capture precedes it); Escape with `isComposing:true` does not call `onClose` (ALL callers: this is the one deliberate default change; list the six existing callers (`rg -n "subscribeOutsideClickOrEscape|useDismissOnOutsideOrEscape" packages/ui/src`) in the commit body: none handles IME). GREEN: `escapeCapture` absent = bubble listener, outside-click unchanged. Commit `fix(ui): outside-click/Escape dismissal ignores IME composition; opt-in capture`.
**1b export + menu keyboard.** `package.json` `./browser` per Contracts; move `menuFocusIndex` + `useMenuKeyboard` (+ the 3 cases of `use-dropdown-menu.hooks.test.ts` for `menuFocusIndex` and the render cases of `...render.test.ts` for `useMenuKeyboard`, adapted to vitest) into `browser/useMenuKeyboard.ts`; `MENU_ENTRIES` selector stays (`[role="menuitem"], [role="menuitemradio"]`: ARIA roles, not host classes). Commit `feat(ui): export browser hooks; add useMenuKeyboard`.
**1c scrollable tab strip.** Tests = `tab-strip-keyboard.test.ts` + `use-tab-strip.hooks.render.test.ts` ported (names kept), plus the "agree with resolveTabBarKeyTarget" case and the `activeSelector` case. Commit `feat(ui/tab-strip): scrollable tab strip hook (overflow, reveal, roving index, arrow navigation)`.
**1d card open helpers.** Ported cases of `SiteGrid.hooks.test.ts:22-86,118-121` (`isCardOpenKey`, `closeMenuThen` x2, `cardOpenProps` x3, `duplicateDisplayNames` x2). Commit `feat(ui/site-card): card-open and menu helpers`.
**1e transient notice.** Ported cases of `use-site-toast.hooks.render.test.ts` for the generic half (one at a time, auto-hide base vs details, dismiss, unmount clears the timer) + component cases (no notice -> null; note; items under a `<details>` with `Show list`; dismiss calls back). Commit `feat(ui): transient-notice (one timed notice at a time)`.
Each: COMMON 2-9; `rg -n -i "tovu|site-chat|apps/|desktop-" <new files>` prints nothing; no `console.*`; eslint; changeset (one per commit or one shared `ui-a13-desktop-owners.md`: **one per commit**, rule 16).

## HARDEN-A13-2 — Tovu repoint (after S1 is published/linked; Sonnet)
1. `app/TabStrip.tsx:1` imports `useScrollableTabStrip` from `@jini-ai/ui/tab-strip` and calls `useScrollableTabStrip({ activeTab, tabs: projects.map(({ id, displayName }) => ({ id, label: displayName })) }, { activeSelector: '.is-active' })` — the `projects` array stays the caller's; the markup is untouched. `git rm` `use-tab-strip.hooks.ts` and its two tests (cases ported: report before/after).
2. `use-site-toast.hooks.ts`: keep `createdToast`, `announceImported`, `announceAdded`; state/timer come from `useTransientNotice`; export type `SiteToast = TransientNoticeValue` as a **type alias in this file** (`use-start-imported.hooks.ts:13,25,45` keeps importing it from here; an alias is a product-named type, not a re-export shell of moved code; STOP if the executor sees a plain re-export); `showToast` is the Jini `show`. `SiteToast.tsx` deleted; `App.tsx:23,276` renders `<TransientNotice notice={siteToast.toast} onDismiss={siteToast.dismiss} dismissClassName="button button--quiet" />`. CSS: in `app.css:1911-1920` rename `.site-toast` -> `.jini-transient-notice`, `__message/__note/__items/__items summary` likewise (**counts before/after**: `rg -c "site-toast" apps/desktop` must be 0 after; list the line numbers); the Jini component renders `jini-transient-notice*` so Tovu's CSS is the only styling (the package ships layout-free classes; STOP if Jini ships CSS for it: then Tovu's rules must be removed instead, decide by reading `ui/src/features/*/` precedent: `site-card.css` exists, so a `transient-notice.css` **is** the pattern. **Decision: Jini ships `transient-notice.css` (neutral tokens) and Tovu keeps only overrides for its own look**; the executor diffs the two and removes duplicated declarations, keeping the Tovu ones that differ.)
3. `use-dropdown-menu.hooks.ts` reduces to `useDismissibleDropdown` (now `useState` + `useDismissOnOutsideOrEscape` from `@jini-ai/ui/browser`, `{ enabled: open, containerRef, escapeCapture: true }`; `doc` port parameter: the injected `DocumentListeners` port of the Tovu tests has no Jini counterpart (the Jini hook takes a `subscription` port): **adapt the Tovu render tests to inject `subscription`** and record this as the single test-fixture change) + `settingsControlHandlers`. `App.hooks.ts:41-44` re-export block deleted; `SiteGrid.tsx:47` and `App.tsx` import from `@jini-ai/ui/browser` (`useMenuKeyboard`) or `./use-dropdown-menu.hooks.js` (`useDismissibleDropdown`).
4. `SiteGrid.hooks.ts`: delete the four moved helpers; `SiteGrid.tsx:54` imports `cardOpenProps`, `closeMenuThen`, `duplicateDisplayNames` from `@jini-ai/ui/site-card` (the rest of the line stays local); `SiteGrid.hooks.test.ts` keeps the product cases (`isCardOpenable`, `cardOverlay`, `siteCardTone`, `databaseLabel`, `deleteActionCopy`, `siteCardParentFolder`, `cardOpenClass`) and loses the ported ones (report counts). `isCardOpenKey` is used only inside `cardOpenProps` now: not imported by Tovu any more; `SiteGrid.jsdom.test.ts:523` comment references it: reword.
5. Census: `rg -n "use-tab-strip|SiteToast\b|site-toast|useDismissibleDropdown.*App.hooks|menuFocusIndex|isCardOpenKey|closeMenuThen|duplicateDisplayNames" apps/desktop/src` hits only the Jini imports and the product files named above; `git grep -n "from './App.hooks.js'" apps/desktop/src/renderer | rg "useDismissibleDropdown|useMenuKeyboard|menuFocusIndex"` prints nothing; eslint on touched files; commit `refactor(desktop): serve tab strip, toast, menu and card helpers from @jini-ai/ui`.
Look owed (Electron renderer, Chrome-equivalent): tab strip with 12 tabs (overflow arrows appear/disable, active tab revealed on selection, ←/→/Home/End move and activate), a created-site toast (5 s) and an imported-with-warnings toast (12 s, "Show list"), the card ⋮ menu (outside click closes, Escape closes **before** an open dialog's Escape: the capture regression test), Settings appearance menu keyboard.

## untangle overlap (execute after wave B merge)
- Desktop arg lane (`../desktop-args/`) edits `App.hooks.ts`, `SiteGrid.tsx` call sites for `(required, optional = {})`: text guards; re-read the import blocks at apply time.
- A24 (find + zoom controllers) edits `renderer/use-find-in-page.hooks.ts`/`use-zoom.hooks.ts`/`FindBar.tsx`: disjoint; **both rows touch `@jini-ai/ui/browser-chrome`/`tab-strip` package.json export blocks**: serialize the two `package.json` edits (text guard on the `exports` block).
- A11/A23 (site preview, boot): disjoint.
- C9-ui kit rows do not touch `ui` hooks; the A10 sheet edits `ui/features/*/rules.ts` of other features: disjoint files.

## STOP specific to this sheet
- The IME/capture hardening breaks any of the six existing `subscribeOutsideClickOrEscape` callers' tests (report which; do not edit their tests to fit: COMMON rule 20).
- `ui` would need a new dependency, or a new file imports `@jini-ai/ui-kit`.
- The executor finds `SiteRecord` (or any Tovu type) in a Jini signature.
- A ported test has no Jini twin.
