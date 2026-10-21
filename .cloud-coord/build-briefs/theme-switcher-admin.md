# Build brief: Admin screen for the theme preview switcher

Code: `tovu-int` (branch `integration/2026-10-20`). The backend landed in `6547c6ff4`. It explicitly shipped
**no admin UI** (`ADS-memory/.local-artifacts/theme-preview-switcher/handoff.md`, "No ... admin UI").

## Goal (owner terms)
On the Themes screen the owner flips "Let visitors preview themes" on, ticks which installed themes to offer
(2 to 8, always including the active one), and renames how each appears in the banner. The site then shows the
banner on live pages and adds the static `/_themes/<id>/` variants on export. Today this is only possible by
asking the assistant.

## Owner rules (every lot)
- This is Tovu-specific: a Tovu theme setting on the Tovu Themes screen. No Jini change.
- Functions take `(requiredObj, optionalObj = {})` with ports. React components get props only. Complexity ≤10.
- 100% coverage per touched file with DI fakes. No schema change: it uses the existing settings ledger.
- Settings autosave, as owner chips do (memory "chips AUTOSAVE"). Make the smallest change, preserve "why" comments, and add no deps.
- Vitest runs with `--maxWorkers=2`. Leave no test processes running.

## What already exists (reuse)
- The setting is `core.theme` / `previewSwitcher` (`apps/website/src/features/theme/preview-switcher.ts:6-7`), shaped `{ enabled, themes: [{themeId,label}], position: "top" }`. The default is disabled.
- Validation (`preview-switcher.ts:21-75`): 2–8 unique **valid installed** themes, must include the active theme when enabled, labels trimmed and ≤80 characters, id `reset` reserved.
- Write policy needs `theme.set` (`preview-switcher.ts:82-92`). It is applied on the generic settings write path (`features/settings/site-title-write.ts:50-70`, `applyPreviewSwitcherPolicy`), so the admin's ordinary settings API already writes it safely.
- Effective roster on read: a later-activated theme is auto-included and removed themes drop out (`readPreviewSwitcher`, `:66-78`).
- Tools `theme_get_preview_switcher`, `theme_update_preview_switcher` (`features/theme/preview-switcher-tools.ts:18-20`) show the read shape, including the installed choices.
- Admin settings plumbing: `apps/admin/src/lib/ledger-slice.ts` (`loadNamespaceValues`, `saveChangedEntries`) and `apps/admin/src/hooks/use-settings-slice.hooks.ts`. `features/consent/settings.hooks.ts` is a worked example of a slice port.
- Themes screen: `apps/admin/src/features/themes/Themes.tsx:550` (`Themes`) with `TabBar` at `:625`. The installed roster and active theme come from `hooks/use-themes.hooks.ts:302` (`useWiredThemes`). Tabs are **theme groups** (`rules.ts:96,113`), so the switcher must not become a fake theme tab.

## Scope
IN: one "Visitor theme preview" card on the Themes screen, placed above the tab bar where the screen's own notices sit, with:
- an on/off switch;
- a checklist of valid installed themes (the active theme is pre-checked and locked);
- a label input per checked theme;
- "Open preview" links (`/?theme=<id>`);
- inline count errors.

OUT:
- Banner position (only `top` exists).
- Static-export size reporting in the UI: the export result already reports the multiplier.
- Per-page preview.
- Any server change. If a gap appears, stop and report it; do not patch the server.
- **The a26/thetayway hand-copy removal** (below).

## Lots
**L1: rules + port (S).**
- `features/themes/preview-switcher-rules.ts` holds pure functions:
  - `toPreviewSwitcherValue({ enabled, checked, labels, activeThemeId })`;
  - `previewSwitcherProblems({ value, installed, activeThemeId })`, which mirrors the server rules for inline messages (the server stays the authority);
  - `defaultLabel({ theme })` (the manifest name).
- `hooks/preview-switcher-dependencies.hooks.ts` is a port over ledger-slice for namespace `core.theme`, key `previewSwitcher`, scope `workspace`. Server `ValueValidationFailedError` text is shown as-is.
- Tests: every rule branch (1, 2, 8 and 9 themes; active missing; duplicate; label 0/80/81 characters), plus the port with a fake ledger.

**L2: card + mount (S).**
- `PreviewSwitcherCard.tsx` takes props only: `value`, `installed`, `activeThemeId`, `problems`, `onChange`, `status`.
- `hooks/use-preview-switcher.hooks.ts` wires the slice autosave, debounced. It saves only when there are no problems; while problems exist, it shows them and holds the save.
- Mount it in `Themes.tsx` with one prop seam (the `useThemesHook`-style test seam).
- Add `agentHandle`s on the switch, checkboxes and labels, so the in-app assistant can drive the card.
- Strings go in `themes-i18n.ts` for all locales it carries.
- Tests: RTL render with fakes (toggle, check/uncheck, label edit, locked active row), autosave called once per settled edit, and no save while invalid.

## Acceptance tests
- Enable + tick 2 themes, and the ledger value equals `{enabled:true, position:"top", themes:[active, other]}`. A live page then renders the banner (an integration test via the existing `preview-switcher.integration.test.ts` harness, extended rather than duplicated).
- Unticking down to 1 theme shows the inline error and makes no write.
- A user without `theme.set` sees the card read-only with a reason.

## Needs a local Chrome look afterwards
Yes:
- the card on the Themes screen at desktop and 375px, dark theme;
- the real banner on a live site page;
- `/?theme=` switching and reset;
- the banner at 375px, which the handoff says was never exercised in a real browser.

## Risks
- The server rewrites the roster at read time (it auto-includes the active theme), so the card must render from a fresh read after every activation change, or it will show a stale active row.
- Themes.tsx is 640 lines. Add only the mount and its seam; do not refactor it.

## Needs owner OK, NOT part of this build: site cleanup
The doc `tovu-int/ADS-memory/.local-artifacts/theme-preview-switcher/site-cleanup.md` lists the owner's hand-built demo bars. Once the setting is on for those sites, they can be removed:
- delete `theme-demo.js` / `theme-demo.css` in `a26-base`, `a26-ucla` (a26-ventures) and `tayway-athletic/editorial/mono/sky` (thetayway);
- edit pages/partials to remove the demo bar, the hidden crawl anchors and the includes.

These files live in `/Users/la/Documents/Tovu/<site>/themes/...`: owner site data outside any repo, so no cloud job can touch them. Do this only after the owner (1) approves the deletion and (2) has confirmed the built-in banner looks right on each site. Each site's theme list must first be saved in the new card.
