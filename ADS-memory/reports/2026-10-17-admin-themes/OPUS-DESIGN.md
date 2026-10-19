# Admin themes — independent design (themedesign-opus-67, Opus 5.5, 2026-10-17, read-only)
Given the owner's requirements only; NOT shown Codex's audit (CODEX-AUDIT.md in this folder).

## 1. Today
- Tovu owns the look: apps/admin/src ~14.9k CSS lines (styles.css 6.9k, styles/assistant.css 1.6k, integrations/jini-admin/jini-media.css 1.6k). Literal tokens styles.css:9–~330 (dark block :235); fonts via Google @import (styles.css:1); ~130 colour literals, 41 literal shadows, 66 literal radii outside the token blocks. Rules mix Tovu --fg/--border (~1,100 uses) and --jini-* (~200).
- Jini packages/ui is already look-free: ~5.9k lines (settings-dialog 4.7k), zero literals, enforced by ui/src/theme/__tests__/boundaries.test.ts. Literals only in styles/variables.css (--jini-* from --jini-theme-{light,dark}-*, switched by [data-color-scheme]). admin.css aliases --bg/--fg → --jini-*, but Tovu's :root overrides them → two token systems.
- Jini packages/admin ships NO CSS (class names Tovu styles in jini-media.css).
- Jini packages/chat is the outlier: chat-pane/styles.ts 1,814 lines injected CSS with its own --jini-chat-* layer + 44 literals.
- A theme API exists, unused by Tovu: @jini-ai/ui/theme AdminTheme (10 colours × 2 schemes, fonts, radius, density), applyAdminTheme, resolveColorScheme, AdminShell useAdminTheme. Tovu only pipes accent via --jini-theme-*-primary (hooks/use-admin-appearance.hooks.ts).
- Dark is dead: nothing sets data-theme="dark"; 9 screens pin data-theme="light" (e.g. SettingsUi.tsx:824); Appearance tab livePreview={false}.

## 2. What full restyling needs
Palettes can't express material: glass = alpha surfaces + backdrop-filter + a backdrop layer; neumorphism = surface == bg, no borders, paired raised/inset shadows per state; skeuo = gradients/textures/bevels. All expressible as custom properties IF every primitive reads them: (a) ~30 material/role tokens, (b) route ~25 Tovu primitives (page bg, sidebar, topbar, card, buttons, inputs/select, dialogs/popovers, tables, tabs/chips, toggles) + Jini tabbed/settings shell + chat pane through them, (c) remove ~130 colour / 41 shadow literals.

## 3. Architecture
- Theme = theme.css + manifest {id, name, schemes, stylesheet, fonts/}. theme.css may contain only @font-face + custom properties under :root[data-admin-theme=id] (opt. [data-color-scheme=dark]). No component selectors (small, safe, refactor-proof). Fonts self-hosted woff2 per package (fetched only when used).
- Contract (--jini-*, declared in ui/styles/variables.css): existing palette/fonts/radius/density + NEW --jini-app-bg; --jini-panel-{bg,border,shadow,backdrop,texture}; --jini-overlay-{bg,backdrop,shadow}; --jini-control-{bg,border,shadow,shadow-hover,shadow-pressed,shadow-inset}; --jini-border-width. All default to today's values.
- Packages: Jini ui/admin/chat/ui-kit = structural CSS + tokens only (Jini admin takes its modules' structural CSS out of Tovu's jini-media.css). @jini-ai/theme-default (neutral, exportable). Tovu admin-theme-classic (today's orange look, Tovu default). Tovu admin-theme-{glass,neumorph,skeuo,smooth-black} separate.
- Runtime: v1 static imports of installed themes; per-user appearance.adminTheme in existing appearance namespace (lib/settings-tabs.ts); useAdminAppearance also sets data-admin-theme + data-color-scheme (resolveColorScheme); picker in Jini AppearanceTab, disables schemes a theme lacks. v2: plugin manifest adminThemes[] beside browserProviders (Jini/packages/plugins/src/host/browser-providers.ts) reusing digest-pinned assets + route/link loading like chart providers, + CSS lint at install.
- Light/dark + accent: canonical data-color-scheme (migrate off data-theme); accent picker only sets --jini-theme-*-primary; AdminTheme JSON stays as palette-only shorthand (compiles via renderAdminThemeVariables); don't use applyAdminTheme's inline vars with CSS themes (inline wins).
- Site isolation: admin is a separate document. Risk: site themes also use bare --bg/--fg and the Pages canvas (use-theme-canvas-styling.hooks.ts) renders site tokens → new admin code uses --jini-* only; canvas stays iframe/shadow root; guard test: website bundle never imports admin-theme-*.

## 4. Owner's call
Agree: separate packages with own fonts, exportable default, no site impact, simple. Corrections: "unstyled" = no LOOK, not no CSS (structural CSS stays in ui, else every host rebuilds layout); ui is already ~there; chat ships UI and must be in scope (or glass admin keeps a beige chat dock); admin ships no CSS today; the real work is Tovu's 14.9k lines, not Jini. Disagree on one point: themes must not override component selectors — token-only is what keeps it simple. Limit: skeuo may later need a scoped first-party overrides.css only if tokens fall short.

## 5. Migration (no step changes the current look)
1. ADR + token list + Chrome screenshot baseline of ~12 screens. S
2. Move Tovu :root + dark blocks + font @import into admin-theme-classic (pixel-identical). S
3. Add role tokens to variables.css with today's values as defaults. S
4. Route ~25 Tovu primitives + Jini tabbed/settings shell + chat pane through role tokens; remove ~130 colour / 41 shadow literals; point --jini-chat-* at --jini-*. L (~250 rules), per-area lanes
5. Wire data-admin-theme + data-color-scheme + setting + picker; unpin the 9 light wrappers once dark verified. M
6. Smooth-black first (dark-only) to prove the contract, then glass, neumorph, skeuo — each checked in Chrome. S–M each
7. Move Jini's neutral literals into @jini-ai/theme-default; keep the boundaries test. S
8. Optional: plugin adminThemes[] + CSS lint. M

## 6. Diagram
```
 Jini (look-free)                         Theme packages (look)
 ui/admin/chat/ui-kit                     @jini-ai/theme-default (neutral, exportable)
  structural CSS -- reads --> --jini-* <-- tovu admin-theme-classic (default)
  variables.css = contract    tokens   <-- admin-theme-glass|-neumorph|-skeuo|-smooth-black
                                 ^          (theme.css: @font-face + vars under
 Tovu apps/admin                 |           :root[data-admin-theme=id][data-color-scheme=x])
  primitives CSS -- reads -------+
  useAdminAppearance -> <html data-admin-theme="glass" data-color-scheme="dark"
                             style="--jini-theme-*-primary: accent">
  appearance.adminTheme (per user) · picker in AppearanceTab
  v2: manifest adminThemes[] -> digest-pinned assets -> <link> (like chart providers)
 Public site: separate document + own theme tokens; never imports admin themes.
```
