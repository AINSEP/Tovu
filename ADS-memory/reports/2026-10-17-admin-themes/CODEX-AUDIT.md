Web Design(Direct), with Software Architect persona loaded: design-system coverage and reusable package boundaries.

**Verdict: switchable admin themes are feasible incrementally. Heavy CSS restructuring is unnecessary; installable packages and complete glass/neumorphic treatments need additional wiring.**

Paths below: `A=/Users/la/Programming/Tovu/apps/admin/src`, `W=/Users/la/Programming/Tovu/apps/website/src`, `J=/Users/la/Programming/Jini/packages`, `U=J/ui/src`.
Read-only investigation using `rg`, `sed`, and `wc`; no tests, typechecks, builds, servers, or rendered verification.

**1. TOKEN LAYER**

Counts cover CSS files; “sites/distinct” means declaration occurrences/unique names, excluding comments.

| Token prefix | Tovu admin CSS | Jini ui + admin CSS |
|---|---:|---:|
| `--admin-*` | 9/5 | 0/0 |
| `--jini-theme-*` | 2/2 | 0/0 |
| Other `--jini-*` | 38/26 | 113/97 |
| Other names | 128/88 | 74/73 |
| Total | 177/121 | 187/170 |

- Tovu’s main palette lives in [A/styles.css](/Users/la/Programming/Tovu/apps/admin/src/styles.css:11): mostly **unprefixed** `--bg`, `--surface*`, `--fg*`, `--primary*`, `--font-*`, `--r-*`, `--shadow-*`, and spacing/type scales. `--admin-*` chiefly controls dialog/chat geometry.
- Jini’s contract lives in [U/styles/variables.css](/Users/la/Programming/Jini/packages/ui/src/styles/variables.css:1): **20 light/dark palette inputs → semantic tokens → derived surface/accent/radius/spacing tokens → components**. Layering exists, but there is no comprehensive primitive colour ramp.
- `U/core/theme/types.ts::AdminTheme` supplies **10 colours per scheme**, body/heading/optional mono fonts, font stylesheet URLs, radius, and density. It exposes **no shadow, blur, border-highlight, or component-surface fields**.
- `U/styles/admin.css` maps Jini tokens **to legacy names**, e.g. `--surface: var(--jini-bg-panel)`. Tovu independently redeclares those legacy values: **two overlapping palette authorities remain**.
- Tovu maps primary inputs in `A/styles.css:132`, chart neutrals nearby, and reverses direction locally at `A/styles.css:3452`: `.select-panel.select-panel` / `.select-trigger.select-trigger` map `--jini-bg-elevated → --surface`, `--jini-bg-subtle → --surface-2`, `--jini-text → --fg`.
- `A/styles/settings.css:54` also remaps Jini panel/elevated surfaces. These local bridges show that a Jini-only theme currently cannot consistently recolour the whole admin.

**2. HARD-CODED VALUES**

CSS counts exclude comments. Property cells show **without `var(--...)` / with `var(--...)`**; “without” includes intentional `none`, `0`, and `inherit`. Mixed expressions count as “with”.

| Metric | A: admin CSS | B: direct TSX `style={{}}` | C: Jini ui/admin CSS |
|---|---:|---:|---:|
| Hex/rgb/rgba/hsl/hsla literal occurrences | 62 | 0 | 20 |
| Additional `oklch(...)` occurrences | 115 | 0 | 12 |
| Colour-bearing declarations: literal / variable¹ | 84/1,591 | 0/1 | 0/682 |
| `font-family` | 9/85 | 0/0 | 4/13 |
| `box-shadow` | 32/71 | 0/0 | 6/39 |
| `border-radius` | 97/212 | 0/0 | 22/125 |
| `backdrop-filter` | 6/0 | 0/0 | 3/0 |
| `transition` | 61/11 | 0/0 | 12/39 |
| All `var(...)` references | 3,067 | 3 | 1,153 |

¹ Colour-bearing properties include foreground, background, borders, outline, fill/stroke, etc.; literal and variable categories can overlap. Literal totals include valid token defaults/fallbacks.
B covers **11 direct object literals across 184 production TSX files**, excluding tests; referenced style objects and conditional expressions are outside that count.
Only **4 of Tovu’s 9** non-variable font declarations specify fixed font stacks; the other 5 inherit. Jini’s 4 are 2 inheritance declarations and 2 icon-font declarations.
Only **56/103 Tovu shadows** and **12/45 Jini shadows** take their complete value from a variable; many remaining “with-var” shadows retain fixed geometry.

Top 15 files by summed literal colour occurrences plus non-variable property declarations below. **C/F/S/R/B/T** = colours including OKLCH/font/shadow/radius/backdrop/transition. Token-definition files rank highly without implying defects.

| File | C/F/S/R/B/T | Sum | Variable references |
|---|---|---:|---:|
| `A/styles.css` | 126/4/15/43/0/35 | 223 | 1,753 |
| `U/styles/variables.css` | 32/0/0/0/0/0 | 32 | 80 |
| `A/integrations/jini-admin/jini-media.css` | 15/3/2/5/0/3 | 28 | 322 |
| `U/features/settings/dialog/styles/settings-dialog.css` | 0/1/4/13/2/6 | 26 | 842 |
| `A/styles/assistant.css` | 4/0/5/10/0/5 | 24 | 185 |
| `A/styles/pages.css` | 7/1/2/9/3/2 | 24 | 22 |
| `A/styles/editor.css` | 3/0/1/4/3/1 | 12 | 44 |
| `A/styles/media.css` | 10/0/0/1/0/0 | 11 | 68 |
| `A/features/ai-assistant/ai-assistant.css` | 2/0/1/4/0/3 | 10 | 35 |
| `U/styles/admin.css` | 0/1/0/7/0/2 | 10 | 146 |
| `A/features/voice-input/push-to-talk-mic-button.css` | 5/0/0/2/0/0 | 7 | 0 |
| `A/components/InstallTabCard/install-tab-card.css` | 0/0/1/3/0/1 | 5 | 46 |
| `A/styles/access-tokens.css` | 1/0/0/1/0/3 | 5 | 70 |
| `A/styles/media-content-editor.css` | 0/0/1/4/0/0 | 5 | 47 |
| `A/styles/seo.css` | 1/0/1/0/0/2 | 4 | 69 |

**3. LIGHT/DARK**

- **9 live `data-theme="light"` pins**: `A/App.tsx:404`; `features/media/Media.tsx:1309`; `authentication/Authentication.tsx:188`; `providers/Providers.tsx:223`; `settings/SettingsUi.tsx:824`; `observability/Observability.tsx:221`; `plugins/AgentPlugins.tsx:461`; `ai-assistant/AiAssistant.tsx:1027`; `skills/Skills.tsx:73`.
- Tovu dark tokens select `:root[data-theme="dark"]`. Current Jini base palettes select **`data-color-scheme`**; chart defaults accept both attributes. These conventions need reconciliation.
- `J/admin/src/react/shell/use-admin-theme.ts::useAdminTheme` applies theme data, resolves light/dark/system, listens to OS changes, persists through an injected preference store, and sets `data-color-scheme`.
- Tovu’s `A/App.tsx::AdminShell` is its **own shell function**, not that Jini shell. No production Tovu caller of Jini’s `useAdminTheme`/`applyAdminTheme` was found.
- **Appearance is partially applied:** `A/App.tsx:648` invokes `useAdminAppearance`; Settings invokes `useSettingsAppearance` through `features/settings/hooks/use-settings-ui.hooks.ts:172`.
- [A/hooks/use-admin-appearance.hooks.ts](/Users/la/Programming/Tovu/apps/admin/src/hooks/use-admin-appearance.hooks.ts:41) controls **only accent colour**, writing the two Jini primary inputs, with refresh subscriptions and draft-preview race protection. It never applies the saved scheme.
- `A/lib/settings-tabs.ts:189` defaults to light; Dark/System still save. `A/features/settings/SettingsUi.tsx:773` explicitly records the owner’s earlier decision to remove their visual effect. Revisiting that is a product decision.

**4. REUSE / INSTALLABLE PACKAGES**

- Site themes are folders containing `theme.json`, `tokens.json`, optional `tokens.light.json`, templates/assets/CSS. `W/features/theme/theme-layout.ts::resolveThemeLayout` owns versioned paths; v2 CSS is `css/theme.css`.
- `W/features/theme/theme.ts::{loadTheme,discoverThemes,discoverAllBuiltInThemes,rescanThemes}` own loading and the in-memory discovered-theme registry; `theme-roster-sync.ts::syncThemeRoster` refreshes it.
- `W/platform/site-dir/seed-site-themes.ts::seedSiteThemes` installs stock folders into a site. Folder arrivals become available through discovery/rescan; `theme.ts` records that the former marketplace was removed.
- Switching uses `W/server/inbound/admin-http/routes/presentation/patch-active-theme.ts`, Jini CMS `setActiveTheme`, and `W/features/theme/set-active-theme-tool.ts::applyActiveTheme`; selection is stored as `presentation_settings.active_theme_id`.
- `W/features/theme/static-render.ts::{tokensToRootCss,injectColorMode}` emit tokens and the default mode. `W/server/inbound/public-http/middleware/theme-static-assets.ts::registerThemeStaticAssets` serves `/theme-assets/:themeId/...`.
- These are **site-rendering contracts**. An admin theme should reuse asset/storage/install infrastructure where compatible, with its own selection; activating one must not change the public site.
- `J/plugins/src/host/plugin-format.ts` names canonical `jini.plugin.json` and legacy `tovu.plugin.json`. `host/manifest.ts::PluginManifest` has **no admin-theme kind or mounted theme contribution**; `adminSurfaces` remains unused.
- `J/plugins/src/host/node/install.ts::{previewSitePluginInstall,installSitePlugin}` provide existing package installation. An additive theme manifest field/contribution needs validation and mounting; adding a “kind” alone would provide no behaviour.
- Font loading already exists: **`U/theme/apply.ts::applyAdminTheme` / `acquireFont`** deduplicate stylesheet links and clean them up. Site themes separately use `W/server/inbound/public-http/http/site/render.ts::fontLink`; Tovu currently imports Google Fonts at `A/styles.css:1`.

**5. STRUCTURE / OVERRIDE RESISTANCE**

- Tovu: **37 CSS files, 14,887 lines**; `styles.css` alone is **6,897 lines (46%)**. Other large files: `assistant.css` **1,648**, `jini-media.css` **1,582**.
- Jini ui/admin: **8 CSS files, 8,891 lines**; **0 CSS files in admin**. UI includes settings **4,682**, icon-font CSS **3,270**; excluding icon CSS leaves **5,621 lines**.
- Global CSS plus feature/partial imports from `A/main.tsx` and components; **0 CSS modules**. No Tailwind directives, cascade-layer declarations, or styled-component calls were found in the scanned presentation source.
- Actual `!important`: **4 Tovu**, **1 Jini**; Jini’s is the icon font. Tovu has only **1 directly colour-related** important declaration, `styles.css:506`.
- A conservative simple-selector regex finds **at least 11 Tovu / 1 Jini** selectors with four or more descendant components; complex selectors are excluded.
- More material than `!important`: doubled `.select-panel.select-panel` specificity, scoped token redeclarations, global `button:disabled`, and page rules that remove shadows/borders. Examples: `A/styles/settings.css:54`, `A/styles.css:3452`, `A/styles/pages.css:54`, `A/styles/editor.css:109`.

**6. VERDICT / PHASED PLAN — ESTIMATES**

Overriding **both token vocabularies** today would change approximately **70–80% of the visible look**; this is a source-based estimate, not a measured screenshot percentage. Variable coverage supports it: colours **80%**, fonts **90%**, radii **69%**. Applying only today’s Jini `AdminTheme` would reach substantially less because Tovu maintains independent values.
“Smooth black” is close to palette work. Glass needs translucent surface roles, configurable backdrop filters, border highlights, and suitable backgrounds. Neumorphism needs complete paired inset/outset shadows, pressed-state roles, and coordinated surface colours. Existing shadow tokens can carry those values, but the theme-data contract cannot configure them and many components bypass them.

| Phase | Concrete scope | Rough files / changed lines |
|---|---|---:|
| 1 | Define Jini-owned token authority; bridge Tovu aliases once; preserve current default appearance | 5–8 / 200–400 |
| 2 | Extend `AdminTheme` with surface/elevation/filter/highlight roles; migrate shared controls and states | 8–12 / 300–650 |
| 3 | Add validated package contribution, asset loading, independent admin selection, runtime apply/restore and fallback | 10–16 / 500–900 |
| 4 | Convert remaining fixed presentation values; ship black/glass/neumorphic packages; verify portals, contrast, focus and reduced motion | 12–20 / 400–800 |

Ranges overlap; they are planning estimates. **All phases can land incrementally**, retaining current styles as defaults. Generic contracts/runtime belong in Jini; Tovu supplies CMS adapters and product branding. Architecture chapters 13/14 require the replaceable seam and spec/contract work before implementation.
Debate-worthy decisions: **(1)** semantic/material token contract versus unrestricted CSS, **(2)** Jini package ownership and Tovu adapter boundary, **(3)** plugin contribution field versus separate package family, **(4)** per-user/workspace preference precedence and runtime versus build-time switching, **(5)** one scheme attribute and portal inheritance policy.

CHANGED FILES: none.
