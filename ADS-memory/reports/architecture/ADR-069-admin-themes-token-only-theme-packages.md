# ADR-069: Admin themes: token-only theme packages

- Status: Accepted direction for steps 1–3 by the owner's 2026-10-17 dispatch; later rollout remains deferred.
- Date: 2026-10-17
- Personas: Programmer + Software Architect.
- Inputs: [OPUS-DESIGN](../2026-10-17-admin-themes/OPUS-DESIGN.md), [CODEX-AUDIT](../2026-10-17-admin-themes/CODEX-AUDIT.md), the dispatch's OWNER DECISIONS (10-17), architecture chapters 13/14, constitution, and current Jini/Tovu CSS.
- Contract: [admin-theme-token-contract.md](admin-theme-token-contract.md).

## Context and reuse

Tovu's legacy palette and Jini's semantic palette coexist. ChatPane additionally injects component-local defaults, including a separate palette on a portaled runtime popover. A root palette cannot override those local declarations through inheritance. Site themes have a separate document, activation setting and rendering contract; they do not own admin theming.

Reuse: palette/scheme contracts; inspected Jini UI's `styles/variables.css`, `styles/admin.css`, `core/theme/default.ts`, `theme/apply.ts` and `core/theme/stylesheet.ts`; retain their token names and native CSS inheritance. The existing `AdminTheme` data API remains a palette API, not a new CSS-theme runtime.

Reuse: chat customization; inspected Jini chat's `react/features/chat-pane/styles.ts` and Tovu's `styles/assistant.css`; retain existing scoped aliases and specificity, move only their input values. No second ChatPane stylesheet or styling runtime is created.

Discovery used the available local Codebase Memory CLI for `AdminTheme`/`ChatPane`, then source reads and literal CSS/config searches across both workspaces. MCP graph tools were not exposed in this host. Older graph summaries do not establish current CSS behavior. No dependency is needed: the native CSS import/custom-property mechanisms satisfy this slice.

## Decision and boundaries

1. A theme supplies **custom-property values and font faces only**. It must not contain component selectors, layout/interaction rules, selectors targeting chat mount points, or import component styling indirectly. Root/theme/scheme selectors are allowed. Classic temporarily retains its existing Google Fonts font-only `@import`, verbatim, to preserve font loading; self-hosting is a separate change.
2. The shared contract is `Jini/packages/ui/src/styles/variables.css`. Jini UI/admin/chat keep structural CSS. New material roles read `--jini-theme-<role>` inputs; chat reads `--jini-theme-chat-<role>` inputs. This allows themes to supply values without owning component selectors. Existing palette inputs stay `--jini-theme-{light,dark}-<color>`.
3. Default values ship **inside `@jini-ai/admin`**, in `src/themes/default/{admin.css,chat.css,manifest.json}`. No `@jini-ai/theme-default` package is created. Export all three assets, include their source directory in published files, and mark CSS as side effects. Raw static assets need no new build/copy step.
4. Tovu's present orange look is **classic**, in `apps/admin/src/admin-themes/classic/`, statically imported as Tovu's default. It uses the same shape. Every manifest has `{id, name, schemes, stylesheets: {admin, chat}, fonts}`. Paths are relative to the manifest. Font entries describe a family and its existing stylesheet URL; the neutral default uses system fonts and an empty list. Manifests are descriptive data this round; no loader/validator is introduced.
5. Admin and chat stylesheets are independent imports. A chat host can import the UI variable contract and only the default `chat.css`, without the admin palette. The default chat colors equal today's injected warm palette, in both schemes; this round does not invent a dark chat palette.
6. `data-color-scheme` is canonical for future scheme selection. Preserve classic's existing `:root[data-theme="dark"]` selector and all current light pins this round. Translating that selector now would change current behavior. Existing chart compatibility with both attributes stays intact.
7. Native `color-scheme: light/dark` remains in Tovu structural CSS, under the same selectors, since a theme may set only custom properties/fonts. Keep the chat border/danger aliases resolved at root; never close a cycle through the package's local `--border`/`--danger` aliases. Keep the pane and doubled-popover selectors in `assistant.css`, feeding them from the extracted root inputs. Their value/portal/cycle rationale moves with the values.
8. Existing UI literal fallbacks and injected chat defaults remain compatibility behavior until their consumers migrate. New material defaults belong to admin's theme. Removing old fallbacks now would alter hosts that do not import a theme. Material component routing is step 4; no primitive, dialog, control, or ChatPane source is rerouted here.
9. Glassmorphic, neumorphic, skeuomorphic and smooth-black will each be a separate package with its own fonts. None is added here. No picker, settings persistence, dynamic installation, switching, scheme activation or public-site theme import is added.

This records the owner's explicit corrections to OPUS-DESIGN §3/§5: default values belong to Jini admin; packages have two stylesheets; chat is in scope. It supersedes those design recommendations, not an earlier accepted ADR.

## Cascade and zero-change constraints

Before: `styles.css` imported Google Fonts, Jini admin widgets (UI variables → legacy aliases), then `see-more.css`, followed by Tovu root light/dark values and structural rules. After: Jini widgets → `see-more.css` → classic `admin.css` (its Google Fonts import, then the identical root light/dark values) → native scheme declarations → structural rules. Thus palette specificity and order relative to all component/helper styles are preserved. The font-only import is nested in the classic theme after the two helper imports; its URL/families/weights are unchanged and neither helper defines those font faces.

Chat: `AssistantDock` still imports `styles/assistant.css` at the same module position. That stylesheet first imports classic `chat.css`, then retains its original header and the two existing scoped alias blocks, followed by the untouched dock/component rules. Jini's runtime injected stylesheet remains last; the host's selectors still outrank it. Root values can see classic admin variables regardless of stylesheet import evaluation order. Literal searches found no descendant overrides of the classic surface/text/radius dependencies being lifted to root. Existing border/danger root seams remain in place.

No new default theme is imported by Tovu: its installed registry Jini packages are unchanged. The Jini source changes will be available on a later package release. No lockfile or generated output is changed.

## Alternatives and tradeoffs

| Option | Fit / adaptability | Evidence / tradeoff | Disposition |
|---|---|---|---|
| Token-only themes at existing owners | Strong / high | Existing CSS variable seam; preserves component structure; needs complete token coverage later | Selected by owner |
| Theme-owned component selectors | Poor / low | Competes with injected/component specificity; repeats behavior ownership | Forbidden by owner |
| New standalone neutral-theme package | Technically viable / high | Adds packaging without a required owner boundary | Rejected by owner; values live in admin |

The accepted tradeoff is transitional aliasing and old compatibility fallbacks in exchange for unchanged rendering. Tokens alone cannot restyle every primitive until step 4 removes remaining literals at their real owner. A separate chat stylesheet prevents a chat-only host from loading admin styling. No custom abstraction, dependency, persistence format migration or platform module is needed.

Constitution/chapters 13–14: library/native-first and simplicity are satisfied; reusable contract/default values stay in Jini and product values in Tovu. This dispatch explicitly authorizes a static extraction and reserved vocabulary and explicitly prohibits tests, typechecks, builds and servers. No certified test or rendered evidence is claimed. Existing `AdminTheme` data/API ownership stays intact; this introduces no alternative runtime. No security boundary or public-site theme behavior changes. Critical Internal Constraints: NOT TRIGGERED (static CSS/data only). Implementation Outline: SKIP; the file map is the boundary list above.

## Handoff and remaining verification

Outputs: ADR, complete shared-token inventory, classic theme extraction, new material/chat contract inputs, neutral default theme assets and package exports. Default role values are traced to UI surfaces/shadows, neutral control borders and the existing tabbed-dialog `blur(4px)` scrim. All new material roles remain unused by components.

Source review can establish unchanged token values/selectors and unchanged structural CSS, not pixel identity. No screenshots, tests, builds, typechecks, servers, commits or pushes are run. Before step 4, Coordinator should arrange the approximately twelve-screen light/current-dark screenshot baseline, including dock/popover, portals, dialogs and native controls. The only non-custom-property declarations retained from the extracted root blocks are native `color-scheme`; unrelated component literals and injected chat defaults stay for step 4. Revisit if tokens cannot express a material, local token scopes change, font delivery changes, or another host needs an independently loadable scoped theme. Next assignee: Coordinator/design reviewer for source review and authorized visual verification, then step 4 at existing component owners.

## Step 2 addendum — additive fallback defaults (2026-10-17)

The owner-approved step-2 plan and coordinator trim extend decision 8 **only for additive paint/elevation roles**: UI owns `--jini-role: var(--jini-theme-role, exact-default)` declarations. Original material defaults remain admin-owned; no existing UI fallback changes. Classic supplies exact existing Tovu values through the matching inputs, including the original Tovu expressions for S01/S03/S05/S10/S11/S19. UI expression fallbacks use only Jini roles. Existing overlay background/shadow roles activate via Classic inputs (`oklch(0% 0 0 / 0.45)` and S15); their Jini defaults remain unchanged. Fixed whites, color spaces, alpha and shadow geometry remain part of the parity contract.

The complete new name/value table is in the [step-2 token contract](admin-theme-token-contract.md#step-2-additive-paint-and-elevation-contract):

| Additive family | New role suffixes (`--jini-`; inputs `--jini-theme-`) |
|---|---|
| Controls | `control-chevron-image`, `control-thumb-bg`, `control-solid-ink`, `control-media-{bg,ink,border,bg-hover}`, `control-preview-{ink,bg,bg-hover,tip-bg}`, `control-composer-border-focus`, `control-hover-neutral-bg`, `control-recording-{bg,ink,bg-hover}` |
| Overlays | `overlay-tooltip-{bg,text,border}`, `overlay-bg-{preview,navigation,lightbox,source,chat}` |
| Code/status/panels | `code-{string,number}`, `file-icon-{folder,json,markdown,javascript,typescript,config,html,css,image,shell}`, `status-complete-ink-fallback`, `panel-border-muted` |
| Complete shadows | `control-shadow-{focus,focus-subtle,focus-accent,selected,swatch-selected,segment,segment-raised}`, `control-thumb-shadow{,-strong}`, `overlay-{tooltip-shadow,toast-shadow,menu-shadow-above,menu-shadow}`, `panel-shadow-{divider,sticky,banner,flat}`, `status-{danger,warning}-shadow`; existing `overlay-shadow` activated |
| Tovu only | `--tovu-site-preview-bg`, `--tovu-theme-preview-{paper,atlas,glass}-{bg,text}` |

Reuse: complete control/media/preview paints and shadows; searched current Tovu CSS plus Jini UI `styles/variables.css`, admin `themes/default/admin.css` and the shared token contract for palette, overlays, controls, defaults and scheme inputs; extended the existing UI input/role owner and Classic theme inputs (decision 2), with native CSS only. Existing quiet-control shadows are reused; no parallel lifecycle, theme runtime or dependency is introduced. S11 alone re-resolves its input **and public alias** at existing light-pin boundaries using only theme/scheme selectors, preserving Settings' local gap color. Chat code and cycle-breaking seams remain unchanged.

The bridge defers five font/radius/density duplicates to identical UI defaults. Its 18 scheme-palette inputs remain literal: output-to-input references would cycle, and active-scheme tokens cannot preserve both palettes. Root computed values must stay identical. Existing `--jini-default-*` material aliases still read UI tokens.

All ten light pins are retained and listed for step 3 in the contract. Consumer routing is split across disjoint lanes; this addendum does not claim completion of later primitive/material migration. The coordinator trim supersedes the plan's publish/adopt instructions: no publish, version/manifest/lockfile edits or local dependency changes; UI rebuild and rendered/computed light/dark parity checks belong to the coordinator after these source edits. This build lane runs no tests, typechecks, builds or commits and claims no pixel-verification result.
