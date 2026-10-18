# Admin theme token contract

Related decision: [ADR-069](ADR-069-admin-themes-token-only-theme-packages.md), owner dispatch 2026-10-17. Contract owner: `Jini/packages/ui/src/styles/variables.css`. Original material/chat defaults: `Jini/packages/admin/src/themes/default/`; additive paint/elevation fallbacks: UI `variables.css`. Classic values: `Tovu/apps/admin/src/admin-themes/classic/`.

This is the inventory of every `--jini-*` name declared by the shared variables contract, plus its theme inputs and chart override hooks. Component-private hooks are not new material roles. Defaults are CSS expressions, not precomputed colors; density, fonts and scheme still resolve normally. Light/dark pairs are shown explicitly where the existing contract differs.

## Ownership and loading

Themes contain only custom-property declarations and fonts, under root/theme/scheme selectors. No component selectors or structural imports. `data-color-scheme` is canonical; classic's existing `data-theme` dark selector remains a compatibility boundary until the scheme migration. Static imports select classic today; no attribute, setting or picker is changed.

Import UI structural CSS (which includes `variables.css`), then the selected `admin.css` and/or `chat.css`. A chat-only host can load UI's `styles/variables.css` plus `@jini-ai/admin/themes/default/chat.css`; admin's theme is not a dependency of chat's theme. The manifest export is `@jini-ai/admin/themes/default/manifest.json`; the admin CSS export is `@jini-ai/admin/themes/default/admin.css`. Assets are included directly in the published package and CSS is marked as a side effect. No generated CSS is required.

New role inputs use `--jini-theme-<role>`; new chat inputs use `--jini-theme-chat-<role>`. UI maps those inputs to the role names below. The original material/chat aliases retain their admin-owned defaults; step 2 adds paint/elevation roles with exact fallback defaults in UI and activates the existing overlay background/shadow roles. Existing UI palette/typography/spacing fallbacks remain during migration, and ChatPane retains its existing component-local values. Default chat colors intentionally remain identical in light/dark, because that is what the package renders today.

## Existing palette, type, spacing and semantic roles

Each name below is declared in UI `variables.css`. Existing palette roles read the matching `--jini-theme-{light,dark}-*` input and keep the listed fallback. Derived role expressions and existing scale defaults are unchanged.

| Token | Purpose | Default (light; dark where different) |
|---|---|---|
| `--jini-bg` | Application background | `var(--jini-theme-light-bg, #ffffff)`; dark: `var(--jini-theme-dark-bg, #171717)` |
| `--jini-surface` | Base neutral surface | `var(--jini-theme-light-surface, #f5f5f5)`; dark: `var(--jini-theme-dark-surface, #242424)` |
| `--jini-text` | Body text | `var(--jini-theme-light-text, #202020)`; dark: `var(--jini-theme-dark-text, #f0f0f0)` |
| `--jini-muted` | Muted text | `var(--jini-theme-light-muted, #666666)`; dark: `var(--jini-theme-dark-muted, #b3b3b3)` |
| `--jini-border` | Standard border color | `var(--jini-theme-light-border, #d9d9d9)`; dark: `var(--jini-theme-dark-border, #454545)` |
| `--jini-primary` | Primary action fill | `var(--jini-theme-light-primary, #363636)`; dark: `var(--jini-theme-dark-primary, #e0e0e0)` |
| `--jini-primary-ink` | Text on primary fill | `var(--jini-theme-light-primary-ink, #ffffff)`; dark: `var(--jini-theme-dark-primary-ink, #202020)` |
| `--jini-danger` | Destructive/error foreground | `var(--jini-theme-light-danger, #b42318)`; dark: `var(--jini-theme-dark-danger, #ff8b80)` |
| `--jini-success` | Success foreground | `var(--jini-theme-light-success, #18763b)`; dark: `var(--jini-theme-dark-success, #79d69b)` |
| `--jini-warning` | Warning foreground | `var(--jini-theme-light-warning, #845800)`; dark: `var(--jini-theme-dark-warning, #ebc36b)` |
| `--jini-chart-default-1` | Fallback categorical series 1 | `oklch(55.29% 0.1129 43.4)`; dark: `oklch(62% 0.11 44)` |
| `--jini-chart-default-2` | Fallback categorical series 2 | `oklch(50% 0.11 240)`; dark: `oklch(64% 0.11 240)` |
| `--jini-chart-default-3` | Fallback categorical series 3 | `oklch(64% 0.13 88)`; dark: `oklch(66% 0.13 88)` |
| `--jini-chart-default-4` | Fallback categorical series 4 | `oklch(58% 0.15 350)`; dark: `oklch(65% 0.14 350)` |
| `--jini-chart-default-5` | Fallback categorical series 5 | `oklch(50% 0.11 155)`; dark: `oklch(56% 0.12 155)` |
| `--jini-chart-default-6` | Fallback categorical series 6 | `oklch(48% 0.12 295)`; dark: `oklch(64% 0.12 295)` |
| `--jini-font-body` | Body font stack | `system-ui, sans-serif` |
| `--jini-font-heading` | Heading font stack | `system-ui, sans-serif` |
| `--jini-font-mono` | Code/monospace font stack | `ui-monospace, monospace` |
| `--jini-radius` | Base corner radius | `8px` |
| `--jini-density` | Spacing multiplier | `1` |
| `--jini-bg-panel` | Panel surface | `var(--jini-surface)` |
| `--jini-bg-subtle` | Subtle surface | `color-mix(in srgb, var(--jini-surface) 75%, var(--jini-bg))` |
| `--jini-bg-elevated` | Elevated surface | `var(--jini-surface)` |
| `--jini-border-soft` | Soft border color | `var(--jini-border)` |
| `--jini-border-strong` | Strong border color | `color-mix(in srgb, var(--jini-border) 75%, var(--jini-text))` |
| `--jini-backdrop` | Modal scrim fill | `color-mix(in srgb, var(--jini-text) 42%, transparent)` |
| `--jini-text-strong` | Strong text | `var(--jini-text)` |
| `--jini-text-secondary` | Secondary text | `color-mix(in srgb, var(--jini-text) 80%, var(--jini-bg))` |
| `--jini-text-muted` | Muted text alias | `var(--jini-muted)` |
| `--jini-text-faint` | Low-emphasis text | `color-mix(in srgb, var(--jini-muted) 75%, var(--jini-bg))` |
| `--jini-text-disabled` | Disabled text | `color-mix(in srgb, var(--jini-muted) 60%, var(--jini-bg))` |
| `--jini-accent` | Primary action accent | `var(--jini-primary)` |
| `--jini-accent-hover` | Hovered action accent | `color-mix(in srgb, var(--jini-primary) 88%, var(--jini-text))` |
| `--jini-accent-strong` | Strong action accent | `color-mix(in srgb, var(--jini-primary) 85%, var(--jini-bg))` |
| `--jini-accent-ink` | Text on accent fill | `var(--jini-primary-ink)` |
| `--jini-accent-soft` | Tinted accent fill | `color-mix(in srgb, var(--jini-primary) 10%, transparent)` |
| `--jini-accent-ring` | Accent focus-ring color | `color-mix(in srgb, var(--jini-primary) 22%, transparent)` |
| `--jini-neutral-accent` | Neutral selected-state accent | `var(--jini-text)` |
| `--jini-neutral-accent-hover` | Hovered neutral accent | `var(--jini-muted)` |
| `--jini-neutral-accent-ink` | Text on neutral fill | `var(--jini-bg)` |
| `--jini-neutral-accent-text` | Neutral selected text | `var(--jini-text)` |
| `--jini-neutral-accent-soft` | Neutral selected-state tint | `color-mix(in srgb, var(--jini-text) 7%, transparent)` |
| `--jini-neutral-accent-ring` | Neutral focus-ring color | `color-mix(in srgb, var(--jini-text) 16%, transparent)` |
| `--jini-link` | Link foreground | `var(--jini-primary)` |
| `--jini-link-ink` | Text on link fill | `var(--jini-primary-ink)` |
| `--jini-success-bg` | Success tint | `color-mix(in srgb, var(--jini-success) 12%, var(--jini-bg))` |
| `--jini-success-solid` | Solid success fill | `var(--jini-success)` |
| `--jini-success-solid-ink` | Text on solid success fill | `var(--jini-bg)` |
| `--jini-danger-bg` | Error/destructive tint | `color-mix(in srgb, var(--jini-danger) 12%, var(--jini-bg))` |
| `--jini-warning-bg` | Warning tint | `color-mix(in srgb, var(--jini-warning) 12%, var(--jini-bg))` |
| `--jini-font-ui` | UI font alias | `var(--jini-font-body)` |
| `--jini-font-display` | Display font alias | `var(--jini-font-heading)` |
| `--jini-shadow-xs` | Hairline elevation shadow | `0 1px 0 color-mix(in srgb, var(--jini-text) 4%, transparent)` |
| `--jini-shadow-sm` | Small elevation shadow | `0 1px 3px color-mix(in srgb, var(--jini-text) 10%, transparent)` |
| `--jini-shadow-md` | Medium elevation shadow | `0 6px 24px color-mix(in srgb, var(--jini-text) 15%, transparent)` |
| `--jini-shadow-lg` | Dialog/large elevation shadow | `0 24px 60px color-mix(in srgb, var(--jini-text) 22%, transparent)` |
| `--jini-radius-xs` | Extra-small corner radius | `calc(var(--jini-radius) * 0.5)` |
| `--jini-radius-sm` | Small corner radius | `calc(var(--jini-radius) * 0.75)` |
| `--jini-radius-md` | Compact row/popover corner radius | `calc(var(--jini-radius) * 1.25)` |
| `--jini-radius-lg` | Dialog corner radius | `calc(var(--jini-radius) * 1.5)` |
| `--jini-radius-pill` | Pill corner radius | `999px` |
| `--jini-space-1` | Density-scaled spacing step 1 | `calc(0.25rem * var(--jini-density))` |
| `--jini-space-2` | Density-scaled spacing step 2 | `calc(0.5rem * var(--jini-density))` |
| `--jini-space-3` | Density-scaled spacing step 3 | `calc(0.75rem * var(--jini-density))` |
| `--jini-space-4` | Density-scaled spacing step 4 | `calc(1rem * var(--jini-density))` |
| `--jini-space-5` | Density-scaled spacing step 5 | `calc(1.25rem * var(--jini-density))` |
| `--jini-space-6` | Density-scaled spacing step 6 | `calc(1.5rem * var(--jini-density))` |
| `--jini-space-7` | Density-scaled spacing step 7 | `calc(2rem * var(--jini-density))` |
| `--jini-space-8` | Density-scaled spacing step 8 | `calc(2.5rem * var(--jini-density))` |
| `--jini-font-size-2xs` | Font size: 2xs | `0.6875rem` |
| `--jini-font-size-xs` | Font size: xs | `0.75rem` |
| `--jini-font-size-sm` | Font size: sm | `0.8125rem` |
| `--jini-font-size-base` | Font size: base | `0.875rem` |
| `--jini-font-size-md` | Font size: md | `0.95rem` |
| `--jini-font-size-lg` | Font size: lg | `1.05rem` |
| `--jini-font-size-xl` | Font size: xl | `1.65rem` |
| `--jini-font-weight-normal` | Font weight: normal | `400` |
| `--jini-font-weight-medium` | Font weight: medium | `500` |
| `--jini-font-weight-semibold` | Font weight: semibold | `600` |
| `--jini-font-weight-bold` | Font weight: bold | `700` |
| `--jini-line-tight` | Tight line-height | `1.25` |
| `--jini-line-normal` | Normal line-height | `1.5` |
| `--jini-line-relaxed` | Relaxed line-height | `1.7` |
| `--jini-duration-fast` | Transition duration: fast | `120ms` |
| `--jini-duration-base` | Transition duration: base | `200ms` |
| `--jini-duration-slow` | Transition duration: slow | `320ms` |
| `--jini-ease-out` | Ease-out timing curve | `cubic-bezier(0.23, 1, 0.32, 1)` |
| `--jini-ease-in-out` | Ease-in/out timing curve | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--jini-transition-base` | Base duration and easing | `var(--jini-duration-base) var(--jini-ease-out)` |
| `--jini-z-dropdown` | Stacking layer: dropdown | `100` |
| `--jini-z-sticky` | Stacking layer: sticky | `200` |
| `--jini-z-overlay` | Stacking layer: overlay | `300` |
| `--jini-z-modal` | Stacking layer: modal | `400` |
| `--jini-z-toast` | Stacking layer: toast | `500` |
| `--jini-modal-padding` | Modal interior padding | `24px` |
| `--jini-sidebar-width` | Sidebar width | `240px` |

## New material and role tokens

The 16 original roles below are now consumed by the G1 admin material wiring, with the per-consumer Classic exceptions described below. Each maps to its named input (`--jini-panel-bg` → `--jini-theme-panel-bg`, for example). These rows list both the role and input explicitly; defaults belong to admin's theme. The overlay background/filter describe the scrim; overlay shadow describes the floating dialog. Inputs do not merge existing control states: `none` preserves their current absence of resting/hover/pressed/inset shadows. Step 2 routes complete focus shadows through the additive roles below, preserving their rules and geometry.

For the eight scheme-dependent roles, host `--jini-theme-<role>` inputs, including inherited inputs, always take precedence over Jini defaults regardless of stylesheet order. Their admin-owned `--jini-default-<role>` fallbacks (for example, `--jini-default-panel-bg`) re-resolve on `:root`, `[data-admin-theme]` and `[data-color-scheme]`; the fixed inputs remain on `:root`.

| Role | Theme input | Purpose | Jini default | Classic default |
|---|---|---|---|---|
| `--jini-app-bg` | `--jini-theme-app-bg` | Application canvas background | `var(--jini-bg)` | `var(--bg)` |
| `--jini-panel-bg` | `--jini-theme-panel-bg` | Panel/card fill | `var(--jini-bg-panel)` | `var(--surface)` |
| `--jini-panel-border` | `--jini-theme-panel-border` | Panel/card border color | `var(--jini-border)` | `var(--border)` |
| `--jini-panel-shadow` | `--jini-theme-panel-shadow` | Panel/card elevation | `var(--jini-shadow-sm)` | `var(--shadow-sm)` |
| `--jini-panel-backdrop` | `--jini-theme-panel-backdrop` | Panel backdrop-filter | `none` | `none` |
| `--jini-panel-texture` | `--jini-theme-panel-texture` | Panel background-image layer | `none` | `none` |
| `--jini-overlay-bg` | `--jini-theme-overlay-bg` | Modal scrim background | `var(--jini-backdrop)` | `oklch(0% 0 0 / 0.45)` |
| `--jini-overlay-backdrop` | `--jini-theme-overlay-backdrop` | Modal scrim backdrop-filter | `blur(4px)` | `blur(4px)` |
| `--jini-overlay-shadow` | `--jini-theme-overlay-shadow` | Floating dialog elevation | `var(--jini-shadow-lg)` | `0 24px 64px rgb(0 0 0 / 22%)` |
| `--jini-control-bg` | `--jini-theme-control-bg` | Neutral input/control fill | `var(--jini-bg-elevated)` | `var(--surface)` |
| `--jini-control-border` | `--jini-theme-control-border` | Neutral input/control border color | `var(--jini-border-strong)` | `var(--border-strong)` |
| `--jini-control-shadow` | `--jini-theme-control-shadow` | Resting control shadow | `none` | `none` |
| `--jini-control-shadow-hover` | `--jini-theme-control-shadow-hover` | Hovered control shadow | `none` | `none` |
| `--jini-control-shadow-pressed` | `--jini-theme-control-shadow-pressed` | Pressed control shadow | `none` | `none` |
| `--jini-control-shadow-inset` | `--jini-theme-control-shadow-inset` | Inset control shadow | `none` | `none` |
| `--jini-border-width` | `--jini-theme-border-width` | Standard primitive border width | `1px` | `1px` |

## Step 2 additive paint and elevation contract

New generic roles use `--jini-<role>: var(--jini-theme-<role>, <exact-default>)` in UI `variables.css`, on its existing root/admin-theme/color-scheme boundaries. This is an additive fallback-default policy: **no existing Jini default changes**, and the original material defaults remain admin-owned. Classic supplies each matching input with the exact current Tovu expression. The existing `--jini-overlay-bg` and `--jini-overlay-shadow` aliases retain their defaults and receive Classic inputs only. No packaging/version change is included; the coordinator rebuilds UI separately before parity verification.

The following terse inventory gives every new role suffix; prefix with `--jini-` for the public role and `--jini-theme-` for its input. Values are identical across Classic light/dark unless stated. Fixed whites, RGB/OKLCH spaces/alpha, powerless `none` hue and complete shadow geometry are preserved.

| Paint role suffix | UI fallback = Classic input |
|---|---|
| `control-chevron-image` | Complete original 14px SVG URL; stroke `%23666C75` (UI/Classic light), `%23999FA6` (Classic dark); geometry unchanged |
| `overlay-tooltip-bg` | `#fff` |
| `overlay-tooltip-text` | `#111` |
| `overlay-tooltip-border` | `rgba(0, 0, 0, 0.1)` |
| `overlay-bg-preview` | `oklch(0% 0 0 / 0.55)` |
| `overlay-bg-navigation` | `oklch(0% 0 0 / 0.4)` |
| `code-string` | `#4caf7a` |
| `code-number` | `#d1975a` |
| `control-thumb-bg` | `#fff` |
| `control-solid-ink` | `#fff` |
| `overlay-bg-lightbox` | `oklch(0% 0 0 / 0.6)` |
| `control-media-bg` | `oklch(0% 0 0 / 0.55)` |
| `control-media-ink` | `oklch(100% 0 0)` |
| `control-media-border` | `oklch(100% 0 0 / 0.35)` |
| `control-media-bg-hover` | `oklch(0% 0 0 / 0.72)` |
| `overlay-bg-source` | `oklch(0% 0 0 / 0.48)` |
| `file-icon-folder` | `oklch(72% 0.12 75)` |
| `file-icon-json` | `oklch(72% 0.13 90)` |
| `file-icon-markdown` | `oklch(62% 0.12 245)` |
| `file-icon-javascript` | `oklch(76% 0.15 95)` |
| `file-icon-typescript` | `oklch(60% 0.13 250)` |
| `file-icon-config` | `oklch(62% 0.14 20)` |
| `file-icon-html` | `oklch(64% 0.17 40)` |
| `file-icon-css` | `oklch(62% 0.13 280)` |
| `file-icon-image` | `oklch(64% 0.12 160)` |
| `file-icon-shell` | `oklch(64% 0.12 145)` |
| `status-complete-ink-fallback` | `oklch(99% 0 none)` |
| `control-preview-ink` | `#fff` |
| `control-preview-bg` | `rgba(17, 17, 17, 0.42)` |
| `control-preview-bg-hover` | `rgba(17, 17, 17, 0.72)` |
| `control-preview-tip-bg` | `rgba(17, 17, 17, 0.88)` |
| `panel-border-muted` | `#d9d9d9` |
| `control-composer-border-focus` | `oklch(70% 0.012 255)` |
| `overlay-bg-chat` | `rgb(0 0 0 / 45%)` |
| `control-hover-neutral-bg` | `rgba(127, 127, 127, 0.15)` |
| `control-recording-bg` | `#dc2626` |
| `control-recording-ink` | `#ffffff` |
| `control-recording-bg-hover` | `#b91c1c` |

| ID / shadow role suffix | Exact Classic input | UI fallback when different |
|---|---|---|
| S01 / `control-shadow-focus` | `0 0 0 3px var(--primary-ring)` | `0 0 0 3px var(--jini-accent-ring)` |
| S02 / `overlay-tooltip-shadow` | `0 4px 16px rgba(0, 0, 0, 0.25)` | Same |
| S03 / `control-shadow-focus-subtle` | `0 0 0 2px var(--accent-dim)` | `0 0 0 2px var(--jini-neutral-accent-soft)` |
| S04 / `overlay-toast-shadow` | `0 8px 24px rgb(0 0 0 / 22%)` | Same |
| S05 / `status-danger-shadow` | `inset 3px 0 0 var(--danger)` | `inset 3px 0 0 var(--jini-danger)` |
| S06 / `control-thumb-shadow-strong` | `0 1px 2px rgba(28, 27, 26, 0.28)` | Same |
| S07 / `panel-shadow-divider` | `inset 0 -1px 0 var(--jini-border)` | Same |
| S08 / `control-shadow-focus-accent` | `0 0 0 3px color-mix(in srgb, var(--jini-accent) 18%, transparent)` | Same |
| S09 / `overlay-menu-shadow-above` | `0 -4px 14px rgba(20,28,45,0.09), 0 -1px 4px rgba(20,28,45,0.06)` | Same |
| S10 / `control-shadow-selected` | `0 0 0 1px var(--selected-ring)` | `0 0 0 1px var(--jini-accent)` |
| S11 / `control-shadow-swatch-selected` | `0 0 0 2px var(--jini-bg-panel), 0 0 0 4px var(--selected-ring)` | `0 0 0 2px var(--jini-bg-panel), 0 0 0 4px var(--jini-accent)` |
| S12 / `control-shadow-segment` | `0 1px 2px rgb(0 0 0 / 8%)` | Same |
| S13 / `panel-shadow-sticky` | `0 6px 8px -6px rgb(0 0 0 / 0.14)` | Same |
| S14 / `overlay-menu-shadow` | `0 12px 32px rgb(0 0 0 / 12%)` | Same |
| S15 / `overlay-shadow` | `0 24px 64px rgb(0 0 0 / 22%)` | Existing admin-owned `var(--jini-default-overlay-shadow)` → `var(--jini-shadow-lg)` (unchanged) |
| S16 / `control-shadow-segment-raised` | `0 1px 2px rgb(0 0 0 / 12%)` | Same |
| S17 / `control-thumb-shadow` | `0 1px 2px rgb(0 0 0 / 25%)` | Same |
| S18 / `panel-shadow-banner` | `0 2px 8px rgb(0 0 0 / 0.12)` | Same |
| S19 / `status-warning-shadow` | `inset 2px 0 0 var(--warning)` | `inset 2px 0 0 var(--jini-warning)` |
| Flat / `panel-shadow-flat` | `none` | Same |

Classic alone owns the seven product tokens; no Jini counterpart or admin-panel substitution:

| Tovu token | Classic value, both schemes |
|---|---|
| `--tovu-site-preview-bg` | `#fff` |
| `--tovu-theme-preview-paper-bg` | `#faf6ef` |
| `--tovu-theme-preview-paper-text` | `#2b2620` |
| `--tovu-theme-preview-atlas-bg` | `#0e1420` |
| `--tovu-theme-preview-atlas-text` | `#e8ecf4` |
| `--tovu-theme-preview-glass-bg` | `linear-gradient(135deg, #1c2740, #3a2a55)` |
| `--tovu-theme-preview-glass-text` | `#f2f4fb` |

S11 rebinds **both** `--jini-theme-control-shadow-swatch-selected` and `--jini-control-shadow-swatch-selected` at descendant `[data-theme="light"]` boundaries under the existing implicit/explicit Classic root selector. This lets Settings' local `--jini-bg-panel` participate; an alias inherited from root captures the wrong gap color. Theme CSS contains only custom properties and theme/scheme selectors. Settings keeps its existing component selectors and routes S10/S11/flat shadows in place. Chat inputs, pane/popover seams and their root-only public aliases remain unchanged.

Bridge reuse: the five font/radius/density declarations defer to identical UI root defaults. The 18 palette input literals remain: UI outputs consume those inputs, so reading outputs back into the inputs creates cycles; a single active-scheme output also cannot preserve both light and dark input values. Existing `--jini-default-*` aliases already read UI tokens and stay unchanged.

Step 3 retains ownership of removing these ten light pins (all still present): `App.tsx:405`, `features/media/Media.tsx:1309`, `features/authentication/Authentication.tsx:188`, `features/providers/Providers.tsx:223`, `features/settings/SettingsUi.tsx:783`, `features/settings/AdminAppearance.tsx:23`, `features/observability/Observability.tsx:227`, `features/plugins/AgentPlugins.tsx:461`, `features/ai-assistant/AiAssistant.tsx:1027`, `features/skills/Skills.tsx:73` (under `apps/admin/src/`).

## Chat roles and inputs

All 17 role names and their inputs are part of the shared contract. Defaults exactly match the injected ChatPane palette and its sent-bubble fallbacks. Classic values use its existing surface/ink/border/radius roles in both schemes. The root border/danger seams remain necessary to prevent cycles with the package's local legacy aliases and to reach portaled popovers.

The existing scoped bridge in Tovu's structural `assistant.css` overrides local package values with these inputs at the same specificity. Its grouped pane/popover block still maps only the original eight shared roles; the pane-only block still maps the other nine. This is extraction of the existing seam, not step 4's component rewrite. UI's transitional chat aliases live on `:root` only, never on nested `[data-admin-theme]` or `[data-color-scheme]` elements, so component-local values always win over these inherited aliases, including within nested theme/scheme scopes. Jini ChatPane's local defaults are intentionally untouched.

| Chat role | Theme input | Purpose | Jini default, both schemes | Classic default, both schemes |
|---|---|---|---|---|
| `--jini-chat-bg` | `--jini-theme-chat-bg` | Transcript/pane background | `#faf9f7` | `var(--surface)` |
| `--jini-chat-panel` | `--jini-theme-chat-panel` | Chat panel/popover fill | `#fdfcfa` | `var(--surface)` |
| `--jini-chat-text` | `--jini-theme-chat-text` | Chat body text | `#1a1916` | `var(--fg)` |
| `--jini-chat-text-strong` | `--jini-theme-chat-text-strong` | Chat strong text | `#0d0c0a` | `var(--fg)` |
| `--jini-chat-muted` | `--jini-theme-chat-muted` | Chat secondary text | `#74716b` | `var(--muted)` |
| `--jini-chat-faint` | `--jini-theme-chat-faint` | Chat low-emphasis text | `#b3b0a8` | `var(--faint)` |
| `--jini-chat-border` | `--jini-theme-chat-border` | Chat standard border | `#e1e5eb` | `var(--chat-border-seam)` |
| `--jini-chat-border-strong` | `--jini-theme-chat-border-strong` | Chat strong border | `#c9d0da` | `var(--chat-border-strong-seam)` |
| `--jini-chat-border-soft` | `--jini-theme-chat-border-soft` | Chat soft border | `#edf0f4` | `var(--chat-border-seam)` |
| `--jini-chat-subtle` | `--jini-theme-chat-subtle` | Composer/suggestion/status fill | `#f4f5f7` | `var(--surface-2)` |
| `--jini-chat-accent` | `--jini-theme-chat-accent` | Chat accent foreground | `#c96442` | `var(--accent-text)` |
| `--jini-chat-accent-soft` | `--jini-theme-chat-accent-soft` | Chat accent tint | `#fbeee5` | `var(--surface-2)` |
| `--jini-chat-danger` | `--jini-theme-chat-danger` | Chat errors/destructive text | `#e5484d` | `var(--chat-danger-seam)` |
| `--jini-chat-radius` | `--jini-theme-chat-radius` | Chat card base corner radius | `8px` | `var(--r-sm)` |
| `--jini-chat-radius-lg` | `--jini-theme-chat-radius-lg` | Chat larger corner radius | `12px` | `var(--r-md)` |
| `--jini-chat-user-bubble` | `--jini-theme-chat-user-bubble` | Sent-message bubble fill | `#1a1b1c` | `#1a1b1c` |
| `--jini-chat-user-bubble-ink` | `--jini-theme-chat-user-bubble-ink` | Sent-message bubble text | `#fff` | `#fff` |

`--jini-chat-controls-height` is runtime geometry, not a theme value: ChatPane's ResizeObserver measures it; transcript padding falls back to `240px` if unavailable. Themes must not overwrite that measurement. The package's `--bg-panel`, `--border`, `--danger`, `--radius` etc. are structural compatibility aliases, not another palette owner.

## Existing scheme palette inputs

These 20 input names already belong to the palette API. The default theme supplies the same values as UI's retained compatibility fallbacks and `defaultAdminTheme`. Classic currently maps only the two primary inputs to its own `--primary`; it does not remap Jini's other neutral colors this round.

| Input | Purpose | Default |
|---|---|---|
| `--jini-theme-light-bg` | Light application background | `#ffffff` |
| `--jini-theme-light-surface` | Light base neutral surface | `#f5f5f5` |
| `--jini-theme-light-text` | Light body text | `#202020` |
| `--jini-theme-light-muted` | Light muted text | `#666666` |
| `--jini-theme-light-border` | Light standard border color | `#d9d9d9` |
| `--jini-theme-light-primary` | Light primary action fill | `#363636` |
| `--jini-theme-light-primary-ink` | Light text on primary fill | `#ffffff` |
| `--jini-theme-light-danger` | Light destructive/error foreground | `#b42318` |
| `--jini-theme-light-success` | Light success foreground | `#18763b` |
| `--jini-theme-light-warning` | Light warning foreground | `#845800` |
| `--jini-theme-dark-bg` | Dark application background | `#171717` |
| `--jini-theme-dark-surface` | Dark base neutral surface | `#242424` |
| `--jini-theme-dark-text` | Dark body text | `#f0f0f0` |
| `--jini-theme-dark-muted` | Dark muted text | `#b3b3b3` |
| `--jini-theme-dark-border` | Dark standard border color | `#454545` |
| `--jini-theme-dark-primary` | Dark primary action fill | `#e0e0e0` |
| `--jini-theme-dark-primary-ink` | Dark text on primary fill | `#202020` |
| `--jini-theme-dark-danger` | Dark destructive/error foreground | `#ff8b80` |
| `--jini-theme-dark-success` | Dark success foreground | `#79d69b` |
| `--jini-theme-dark-warning` | Dark warning foreground | `#ebc36b` |

## Existing chart override hooks

UI's six `--jini-chart-default-*` fallbacks are listed in the first table, with both schemes. These optional consumer hooks remain unchanged:

| Token | Purpose | Default when host omits it |
|---|---|---|
| `--jini-chart-1` | Categorical series 1 override | `var(--jini-chart-default-1)` |
| `--jini-chart-2` | Categorical series 2 override | `var(--jini-chart-default-2)` |
| `--jini-chart-3` | Categorical series 3 override | `var(--jini-chart-default-3)` |
| `--jini-chart-4` | Categorical series 4 override | `var(--jini-chart-default-4)` |
| `--jini-chart-5` | Categorical series 5 override | `var(--jini-chart-default-5)` |
| `--jini-chart-6` | Categorical series 6 override | `var(--jini-chart-default-6)` |
| `--jini-chart-grid` | Grid line | `var(--jini-border)` |
| `--jini-chart-axis` | Axis label | `var(--jini-muted)` |
| `--jini-chart-cursor` | Hover cursor fill | `var(--jini-accent-soft)` |
| `--jini-chart-surface` | Chart tooltip surface / hover-point halo | `var(--jini-bg)` (tooltip adds `#ffffff` fallback) |
| `--jini-chart-text` | Chart tooltip text | `var(--jini-text, #171717)` |

Classic keeps its existing explicit grid/axis/cursor/surface/text overrides (`--border`, `--muted`, `--primary-dim`, `--surface`, `--fg` respectively). It uses Jini's series palette unchanged.

## Cascade and limitations

Admin import order: Jini widgets → Tovu `see-more.css` → `admin-theme-bridge.css` → classic `admin.css` (unchanged Google Fonts URL, original light/dark palette blocks, material and additive role inputs) → native `color-scheme` rules → structural CSS with declaration values routed through the shared roles. The font-only import formerly appeared before widgets; it is now nested in classic after the helper imports. Neither helper declares these font faces, so the palette cascade and font-face identity remain the same. No font is downloaded or self-hosted by this change.

Chat import order: the existing AssistantDock module import → `assistant.css` → classic `chat.css` → the original scoped bridge selectors → unchanged dock/component CSS; Jini's injected style remains last, with the same lower specificity. Classic chat inputs resolve at root to the same ancestor surface/ink/radius values; no descendant overrides of those source tokens were found in the current admin CSS. Border/danger cycle comments travel with the values.

Literals retained outside themes: native `color-scheme: light/dark` is structural behavior; alpha masks, `transparent`, `currentColor` and SVG geometry are intentional. Step 2 routes the approved visible color/shadow inventory through tokens across parallel consumer lanes; unrelated radius/filter literals and Jini's injected chat defaults remain for later component migration. UI's pre-existing neutral/scale/chart literals remain compatibility fallbacks. No new theme package/variant, scheme switching, inline theme application or public-site styling is introduced.

Validation for this build lane: source/diff inspection only, under the dispatch's explicit ban on tests/typecheck/builds. Pixel identity has not been rendered or certified. The coordinator owns UI rebuild and subsequent current-Classic light/dark screenshot and computed-value comparisons at 1244px/390px, including Appearance selected card/swatch, first paint, portals and the additional states in step-2 plan §5.


## G1 material consumer wiring (2026-10-17)

Inputs: the G1 CSS-only dispatch, ADR-069, the Glass package/plan and
`2026-10-17-admin-themes/GLASS-REFERENCE.md`. Existing UI role declarations, Classic
inputs and the structural host bridge remain the owners; there is no second theme runtime.
Both Glass stylesheets import immediately after their Classic counterparts. Registration,
scheme boundaries and accent handling belong to the parallel runtime lane.

Four additive aliases extend UI's existing input → role contract. Classic supplies no new
inputs; each alias preserves the existing consumer value in both schemes:

| Role | Theme input | Exact compatibility fallback |
|---|---|---|
| `--jini-control-preview-backdrop` | `--jini-theme-control-preview-backdrop` | `blur(6px)` |
| `--jini-chat-font-body` | `--jini-theme-chat-font-body` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Noto Sans", Roboto, "Helvetica Neue", Arial, sans-serif` |
| `--jini-chat-font-mono` | `--jini-theme-chat-font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` |
| `--jini-chat-popover-shadow` | `--jini-theme-chat-popover-shadow` | `0 18px 46px rgba(13, 12, 10, .15), 0 2px 8px rgba(13, 12, 10, .06)` |

Chat aliases remain root-only, with inline fallbacks in the package for chat-only hosts that
omit UI variables. Attachment-preview text re-resolves the mono input locally with its original
`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` stack, preserving that consumer's
additional Consolas fallback. All existing body/mono font declarations and the three matching
popover/dialog shadows in ChatPane's stylesheet now consume these seams. No chat palette,
portal behavior or injected stylesheet lifecycle changes. Preview controls consume the filter
alias; existing responsive/explicit `backdrop-filter: none` states still win.

| Consumer | Material routing | Classic paint retained |
|---|---|---|
| `body` | `--jini-app-bg` | `var(--bg)` |
| `.admin-layout` | Host compatibility seam → `--jini-app-bg` | `var(--jini-bg)`, which differs from body in dark mode |
| Card/dashboard/detail/site/theme frames | Panel fill/border/shadow/filter/texture | Existing `--surface` / `--border` / `--shadow-sm`; existing 1.5px card borders stay 1.5px |
| Sidebar / chat dock | Panel fill/border/texture; compatible elevation | No desktop shadow; existing `--shadow-md` mobile elevation |
| Existing floating row/select/conversation menus and modal shells | Elevated fill/elevation; bounded panel filter/texture | Existing `--surface` fill and each original shadow, including distinct above-menu/chat-settings shadows |
| Existing scrims and native `::backdrop` | Existing overlay background roles plus compatible overlay filter | Existing per-scrim background; no newly introduced Classic blur |
| Native inputs/selects/textareas, secondary buttons, custom select trigger | Control fill/border/resting/hover/pressed/inset shadows | Existing fills/borders and absent shadows; focus/expanded rings remain separate; custom select's recorded tinted border stays intact |

Tovu's existing `admin-theme-bridge.css` carries six private compatibility mappings. They
are host adapter details, not additional shared role names or a new palette owner:

| Private mapping | Theme material | Implicit/explicit Classic |
|---|---|---|
| `--tovu-admin-layout-bg` | `--jini-app-bg` | `--jini-bg` |
| `--tovu-admin-elevated-bg` | `--jini-bg-elevated` | `--surface` |
| `--tovu-admin-elevated-shadow` | `--jini-overlay-shadow` | `--shadow-md` |
| `--tovu-admin-scrim-backdrop` | `--jini-overlay-backdrop` | `none` |
| `--tovu-admin-rail-shadow` | `--jini-panel-shadow` | `none` |
| `--tovu-admin-mobile-panel-shadow` | `--jini-panel-shadow` | `--shadow-md` |

These exceptions are necessary: assigning Classic's reserved `blur(4px)` to an unblurred
scrim, its reserved dialog shadow to a `--shadow-md` menu, or its body background to the
Jini layout would change Classic's current paint. Shared token defaults and Classic theme
files therefore remain unchanged. The main scroller has no opaque background of its own;
the layout now paints the complete Glass background without filtering any layout ancestor.

Native dialog shells that can contain fixed menu portals, the generic settings shell and the
arbitrary-content message modal retain their paint without a panel filter. The native `::backdrop`
is independently filtered, so their selected portal destination and viewport coordinates survive.

Filters apply only to bounded panels/cards/menus/dialogs and scrims. The chat dock deliberately
remains unfiltered: Jini Composer's discovery/workdir menus are fixed descendants with viewport
coordinates (see `chat/src/react/components/Composer.tsx`), so filtering the dock would move them.
Its panel fill, texture, border and elevation are wired; backdrop blur on that specific ancestor
requires a separate safe background layer or portaling those fixed menus at their existing owner.
No filter is added to `.admin-layout`, `.admin-main-col`, `.admin-content`, body or the chat pane.
The FAB remains outside every newly filtered surface. Existing row/select/runtime portals remain
at their existing destinations.

Reuse: material paints; literal searches across Tovu admin CSS, installed UI CSS, Jini UI
variables/admin styles and ChatPane/Composer source; extended the existing Jini role contract and
Tovu compatibility bridge under ADR-069 using native CSS. Existing panel/menu/control distinctions
and font stack differences are retained rather than collapsed into one default.

Validation: source/diff review only; no tests, typechecks, builds, commits or dependency changes.
No rendered/pixel parity claim. Coordinator still owns publishing/adopting the Jini source seams
and checking Classic light/dark computed paint, Glass backdrop compositing, fixed menus/FAB/toasts,
preview overrides, native dialogs and portals. No logic-bearing functions changed; documentation
classification is contract/update plus inline rationale for the compatibility and fixed-menu seams.
Architecture review: within G1's CSS/contract and two explicitly authorized Jini source seams;
no theme-package component selectors, new provider dependency or public-site change.
