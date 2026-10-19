Software Architect(Direct): Software Architect persona loaded to reconcile runtime ownership, token boundaries, delivery order, and verification.

# Owner summary

1. You get editable Classic and Glass themes, with the running admin as the preview.
2. First, preserve current work and capture how Classic looks today.
3. Next, unify tokens, add independent sidebar styling, and finish dark-mode support.
4. Then, deliver live switching and saved edits without reloading the admin.
5. Finally, reuse Explore for editing, assets, duplication, recovery, and assistant changes.
6. Effort: several medium pieces; the largest stage, the runtime, is split into two deliveries.
7. Should edits affect everyone using that theme on the site? Default: yes; duplicate for an independent version.
8. Should this include undo for every edit? Default: no; use originals, Trash, and site backups.
9. Approve Classic harmonization, accent recoloring, and dark unpinning? Default: yes, after one Chrome review.
10. Reuse the existing theme-editing permission? Default: yes; authorized users can still load/select without editing.

# 1) Goal and binding decisions

Deliver one Jini-owned admin theming system with Tovu-supplied theme packages.

**Flow:** Admin UI → Theme → card → existing Explore → **Use theme** → edit files, replace assets, or ask the assistant. Changes appear in the running admin; **Back to previous theme** remains available.

Inputs: existing THEMING-PLAN, CRITIQUE-R2, retained R1 decisions and owner corrections, [ADR-069](../architecture/ADR-069-admin-themes-token-only-theme-packages.md), [token contract](../architecture/admin-theme-token-contract.md), architecture chapters 13/14, constitution, project memory, and inspected Tovu/Jini source.

This revision is read-only. No files changed; no tests, builds, typechecks, servers, or browser checks ran. MCP graph tools were unavailable; discovery used direct reads and `rg`.

| Requirement | Delivery |
|---|---|
| One token authority; input-only packages | P1 |
| Independent sidebar material | P1 |
| Classic parity except reviewed changes | P0–P2 ledger; accepted P2 becomes the later baseline |
| Canonical scheme; dark-compatible duplicates | P2, before duplication |
| Jini-owned live runtime, independent of AdminShell | P3, `@jini-ai/ui/theme` |
| Immediate switch and saved CSS/settings/image/font updates | P3 |
| Editable built-ins, protected originals, safe upgrades | P3–P4 |
| Existing Explore and equivalent human/assistant editing | P4 |
| Theme-owned assets, upload/replace, optional Media copy | P4–P5 |
| Knobs edit files; no second settings store | P5 |
| Originals/reset, Trash, existing site backups | P3–P4 |
| One validator for writes and serving, including external edits | P3–P4 |
| Remembered theme before normal first paint | P3 |
| Same site-owned layout for desktop and hosted sites | P3–P5 |

**Owners:** Jini UI owns token resolution, package contracts, validation, stylesheet loading, application, switching, and edit reload. Jini admin retains default theme assets and may consume the runtime through a thin hook. Jini chat owns chat styling. Tovu owns theme data, CMS file operations, site storage binding, authorization, settings/catalog/event adapters, and Media integration.

P0 must revise ADR-069’s transitional decisions explicitly. Do not introduce a parallel runtime, token registry, or palette authority. Preserve the existing palette-oriented `AdminTheme` API.

# 2) Delivery phases

**Order:** P0 → P1 → P2 → P3a → P3b → P4b → P5.

P4a contract/server preparation may run alongside P1 after kind/manifest contracts and file ownership are agreed. Do not expose seeding, duplication, or editable packages before their prerequisites land.

Paths are relative to Tovu `/Users/la/Programming/Tovu` or Jini `/Users/la/Programming/Jini`. **New** marks proposed files.

| Phase | Size |
|---|---|
| P0 — Preservation and baseline | S |
| P1 — Token authority and rail inputs | M |
| P2 — Scheme migration and pin removal | S–M |
| P3 — Runtime, delivered as P3a + P3b | L overall |
| P3a — Validated live prototype | M |
| P3b — Upgrade and notification reliability | S–M |
| P4 — Explore, assets, recovery, assistant | M |
| P5 — File-backed knobs and Media copy | S |

## P0 — Preserve work and establish acceptance

**Scope**

- During implementation, commit relevant Glass, Classic-dark, and follow-up work before changing token authority. Select explicit paths, including required untracked assets.
- Record Tovu/Jini SHAs, actual package resolution and loaded output, and stylesheet order.
- Capture fresh `authority-before-light` and `authority-before-dark` baselines; preserve the old archive.
- Update acceptance, ADR-069, and the token contract for ownership, scheme, pin retirement, runtime, storage, validation, and recovery.
- Establish one P1/P2 visible-change ledger.

**Files/artifacts**

- Relevant changes under `apps/admin/src/admin-themes/`, admin styles/hooks, and touched Jini packages.
- `ADS-memory/reports/architecture/{ADR-069-admin-themes-token-only-theme-packages,admin-theme-token-contract}.md`
- Acceptance and change ledger under `ADS-memory/reports/2026-10-17-admin-themes/`.
- Existing parity harness:
  `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/92729b94-41a3-4453-8a6f-3113364271c9/scratchpad/parity2/`
- Reuse `MANIFEST.md` and `tools/{helpers.js,states.js,sink.py,diff.py,peek.py}`.

**Verification**

Record affected-suite baseline results during implementation. Reuse 64 states per scheme; extend `states.js` only for missing acceptance states. Chrome: desktop **1244×723**, phone **390×844**, **DPR 2**, both schemes, real-mouse hover. Capture computed consumer paint, pseudos/backdrops, fonts, root variables, screenshots, and sheet order.

**Done:** relevant work committed; source/output identity recorded; captures reproducible; intentional changes listed; existing failures identified separately.

## P1 — Make Jini tokens the sole authority

**Contract**

```text
Theme inputs --jini-theme-* and private --theme-* intermediates
    → Jini roles --jini-*
    → components and Jini UI’s existing legacy aliases
    → legacy consumers
```

**Scope**

- Add optional inputs to existing roles; preserve standalone fallbacks.
- Limit new shared roles to `bg-muted`, `focus-ring`, `danger-ink`, necessary `selected-*`, and the navigation-rail material.
- Add `--jini-theme-rail-bg` and `--jini-theme-rail-backdrop`, resolving through corresponding rail roles and defaulting to panel material. Route the actual sidebar through these roles; `overlay-bg-navigation` remains the mobile scrim.
- Add independent radius/shadow inputs to existing roles.
- Convert Classic/Glass to input-only packages. Private intermediates always use **`--theme-*`**; rename Glass’s `--glass-*` declarations and references during this conversion.
- Keep legacy aliases in Jini UI’s existing `styles/admin.css`.
- Remove output-to-input references, reverse bridges, duplicate default seeding, and chat border/danger seams in dependency order.
- Route ChatPane and its portaled runtime popover through inputs at their existing owner, preserving standalone defaults.
- Replace Tovu’s accent writer with a small Jini input operation. Tovu retains persistence and stale-read/draft protection.
- Keep `AdminTheme` palette compatibility; package manifests use a separate contract.

**Files**

Jini:

- `packages/ui/src/styles/{variables,admin}.css`
- `packages/ui/src/theme/apply.ts`
- `packages/ui/src/core/theme/{types,stylesheet}.ts` where compatibility is affected.
- `packages/admin/src/themes/default/{admin.css,chat.css,manifest.json}`
- `packages/chat/src/react/features/chat-pane/styles.ts`
- Existing tests beside these owners.

Tovu:

- `apps/admin/src/admin-themes/{classic,glass}/{admin.css,chat.css,manifest.json}`
- `apps/admin/src/styles/admin-theme-bridge.css`
- `apps/admin/src/styles.css`
- `apps/admin/src/styles/{assistant,settings,select}.css`
- `apps/admin/src/integrations/jini-admin/jini-media.css`
- `apps/admin/src/hooks/use-admin-appearance.hooks.ts`
- Existing theme/appearance tests; manifests and lockfiles for the adopted Jini release.

**Reuse/restraint**

Map layout to app background and settings/select surfaces to panel where paint matches. Preserve distinct menu shadows, scrims, and rail elevation. Keep beam decoration component-local with literal defaults; add no gold-beam roles. Geometry, preview swatches, and measured runtime values remain outside the theme contract.

**Verification**

Test defaults, alias direction, accent apply/reset and removal of all accent-owned overrides, standalone chat, and absence of legacy dependencies in inputs.

Compare exact rewiring parity, ledgered “Classic wins” harmonization, and custom accents separately. Preserve Classic color spaces, alpha, `#171717` dark surfaces, typography, shadow geometry, completion-marker distinctions, and separate chat font stacks.

Prove a sidebar-only transparency edit leaves cards/dialogs unchanged, including mobile navigation and portal behavior.

**Done:** themes declare only accepted inputs/private tokens; no input/role depends on legacy aliases; standalone defaults work; every visual difference is ledgered.

## P2 — Canonical scheme and light-pin retirement

**Scope**

- Write `data-color-scheme`; use `data-admin-theme` only for identity.
- Update readers and portaled controls before stopping legacy writes; retain legacy reading for other Jini hosts where required.
- Retire `resolveAdminThemeBoundary`, subscriptions, and spreads.
- Remove ten Tovu light pins and Jini ProvidersTab’s separate pin.
- Combine harmonization, accent changes, and dark unpinning into **one owner Chrome review**.
- Leave public-site canvas documents and their theme contract unchanged.

**Files**

Tovu:

- `apps/admin/index.html`
- `apps/admin/src/admin-themes/{apply.ts,use-admin-theme.hooks.ts}`
- `apps/admin/src/hooks/use-admin-appearance.hooks.ts`
- `apps/admin/src/App.tsx`
- Under `apps/admin/src/features/`:
  `media/Media.tsx`, `authentication/Authentication.tsx`, `providers/Providers.tsx`,
  `settings/{SettingsUi,AdminAppearance}.tsx`, `observability/Observability.tsx`,
  `plugins/AgentPlugins.tsx`, `ai-assistant/AiAssistant.tsx`, `skills/Skills.tsx`.
- Classic/Glass scheme selectors and affected structural dark selectors.

Jini:

- `packages/ui/src/react/components/CustomSelect.tsx`
- `packages/ui/src/features/sketch-editor/react/hooks/useSketchTheme.ts`
- `packages/ui/src/renderers/shiki.ts`
- `packages/chat/src/react/features/chat-pane/hooks/useAgentRuntimePicker.hooks.ts`
- `packages/chat/src/react/features/chat-pane/components/AgentRuntimePicker.tsx`
- `packages/admin/src/media/react/tabs/ProvidersTab.tsx`
- Existing affected tests.

**Verification**

Reuse scheme resolution, portal-origin handling, and observers. Test canonical reads/writes, system changes, open-portal updates, removed pins, and other-host compatibility.

Chrome: ten regions, providers, forms, charts, settings, dialogs, selects, runtime picker, phone drawer/chat sheet, focus, disabled/error states. Capture pinned → unpinned candidate; review the combined ledger once.

**Done:** boundary helper removed; no theme ID receives special light treatment; Classic dark and Glass pass the reviewed matrix. Accepted P2 paint becomes the P3–P5 baseline.

**Duplicates and user themes cannot ship before P2.**

## P3a — Validated live runtime prototype

Prove **seed → site-folder load → live switch → external active-file edit → live update**, before expanding Explore or knobs. Validation and compatible stock resources land with this served slice.

### Storage and admission

```text
<site>/themes/
  admin/<id>/
    manifest.json
    admin.css
    chat.css
    assets/images/
    assets/fonts/
  __original-themes__/admin/<id>/
    ...
```

Seed only after P1/P2. Handle existing sites whose `themes/` already exists; the existing presence-only seed gate is insufficient.

**Do not seed empty `settings.css`.** It is optional and created on the first knob write in P5. Its absence must not fail loading.

Promote the existing PostCSS structural check into one node-safe checker at **`@jini-ai/ui/theme/node`**. Declare PostCSS as a production dependency there. Apply §3’s policy before serving; cache by file identity/mtime, invalidate on writes/events, and validate before **304**. Invalid CSS returns **422**.

Before seeding:

- Self-host licensed WOFF2 fonts.
- Replace external font imports and local stylesheet imports with explicit manifest-loaded font-face sheets.
- Retain valid SVG/PNG data URLs in custom-property values; do not rasterize chevrons.
- Preserve typography and chevron paint through parity capture.

### Runtime owner

Implement the framework-agnostic runtime beside `applyAdminTheme` and the existing font lease in **`@jini-ai/ui/theme`**:

```ts
createAdminThemeRuntime({ catalog, root, document }, { storage })
```

It owns application, loading, switching, edit reload, and bootstrap logic. Tovu supplies settings/catalog/events adapters and mirrors the exported bootstrap contract in `index.html`. Its existing hook calls this runtime; it does not keep a second orchestrator.

Jini admin’s `react/shell/use-admin-theme.ts` may gain an optional thin hook. AdminShell adoption is not required.

Generalize `acquireFont` into **`acquireStylesheet`**, retaining reference counting and caller ownership while adding readiness/error handling, bootstrap-link adoption, and cleanup.

### Loading, switches, and edits

- Serve authenticated plain folders at:

  ```text
  /api/admin/v1/workspaces/:ws/admin-themes/:id/r/:pkgHash/<path>
  ```

- Compute the package hash from package contents, including assets. Put it in the **path**, not a CSS query parameter.
- The server ignores the hash for file selection and serves live bytes. Use **`Cache-Control: private, no-cache` + ETag**. This creates no snapshots or revision tree.
- Whenever any package file changes, reload its stylesheet URLs under the new hash path. Their relative image/font URLs consequently change too.
- Preserve deterministic admin → chat → optional settings precedence; load declared font-face sheets explicitly.
- **Theme switch:** append candidate sheets scoped to the new ID; they remain inert while the old ID is active. Await required loads, reject stale switch completions, then commit theme/scheme/accent together and release superseded links.
- **Same-theme edit:** watcher → `admin-theme-changed` on the existing SSE feed → append newer links after their older versions, preserving logical stylesheet order. Remove only older links after successful loading. Document order gives newer versions precedence regardless of load completion order; no inactive staging or same-theme stale-completion guard.
- Preserve navigation, drafts, chat, open menus, and focus. No reload or application remount.

### First paint and failure

Extend the existing head bootstrap to insert remembered same-origin stylesheet links **render-blocking**, before chrome paints. Mirror Jini’s exported bootstrap behavior and verify both implementations against the same contract.

Keep bundled Classic as fallback. Cold-load failure explicitly selects Classic so its scoped inputs apply. Failed live switches/edits retain the last working sheets. No neutral boot screen.

### Files

Jini:

- `packages/ui/src/theme/{apply,index}.ts`
- `packages/ui/src/theme/runtime.ts` — **new**
- `packages/ui/src/theme/bootstrap.ts` — **new**
- `packages/ui/src/theme/stylesheet-lease.ts` — **new**
- `packages/ui/src/theme/node.ts` — **new**
- `packages/ui/src/core/theme/admin-theme-manifest.ts` — **new**
- `packages/ui/src/core/theme/token-only-css.ts` — **new**
- Package exports, production dependencies, build inclusion, and adjacent tests.
- Optional thin integration only: `packages/admin/src/react/shell/use-admin-theme.ts`.

Tovu:

- `apps/admin/src/admin-themes/{registry.ts,apply.ts,use-admin-theme.hooks.ts}`
- `apps/admin/index.html`
- `apps/admin/src/lib/settings-events.ts`
- `apps/admin/src/styles.css`, `apps/admin/src/styles/assistant.css`
- Classic/Glass manifests, styles, fonts, and assets.
- `apps/website/src/platform/site-dir/seed-site-themes.ts`
- `apps/website/src/platform/site-dir/seed-admin-themes.ts` — **new**
- `apps/website/src/features/theme/admin-theme-library.ts` — **new**
- `apps/website/src/features/theme/{theme.ts,theme-watcher.ts,preview-refresh.ts,index.ts}`
- `apps/website/src/server/inbound/admin-http/routes/themes/admin-assets.ts` — **new**
- `apps/website/src/server/inbound/admin-http/routes/settings/events.ts`
- `apps/website/src/server/runtime/composition/{deps.ts,serving-app.ts}`
- `apps/website/src/server/routes/types.ts`

### Verification and done

Test existing-site seeding, validation including SVG/PNG data URLs and limits, loader ordering/cleanup, switch races, bootstrap adoption, optional settings absence, ETags, authentication, traversal/symlinks, watcher routing, and site switching.

Chrome: remembered light/dark/system cold loads, throttling, failed CSS, rapid switches, same-ID edits, **same-path image replacement**, missing fonts/images, and open menus. Verify runtime-loaded Classic retains accepted P2 computed paint/screenshots.

**Done:** the prototype switches and reflects saved external edits without reload; remembered loads show the selected theme first; serving enforces the checker; failures preserve usable Classic or the last working theme.

## P3b — Safe upgrades and reliable change delivery

**Scope**

- Compare the complete built-in working tree, including settings/assets, with its original.
- Byte-identical working copy: replace working copy and original with new stock.
- Customized copy: preserve both and show **Update available**.
- Missing original: treat as customized.
- Recheck before replacement so intervening edits survive.
- Reuse staged-copy behavior and existing file-identity safeguards.
- Keep one recursive watcher. Route `admin/**` changes separately from site roster synchronization and public preview refresh; null/unknown filenames safely refresh both catalogs.
- Reuse durable notifications for writes from the separate agent process.
- On SSE reconnect, compare current catalog hashes to recover missed changes.
- Scope links/subscriptions to document/site/user; dispose the old scope.

**Files:** extend P3a’s seed adapter, catalog, watcher/notification owners, SSE route, runtime, and their tests. No new storage or notification subsystem.

**Verification**

Test complete-tree upgrade comparisons, missing originals, concurrent edits, cross-process notification, reconnect recovery, and scope cleanup. Chrome: offline/reconnect changes, site switching, customized upgrades, and retained P2 parity.

**Done:** upgrades never overwrite customization; external and assistant-process changes reach the active theme after normal delivery or reconnect. P3a/P3b complete before P4b release.

## P4 — Reuse Explore, assets, recovery, and assistant tools

### P4a — Server and tools

Add `kind: "site" | "admin"` to existing operations; omitted kind remains `site`.

- Site discovery skips `admin/`.
- `isRecognizedThemeRoot` accepts admin folders only for `kind:"admin"`; **do not add `admin` to `ENGINE_SUBFOLDERS`**.
- Reuse contained reads/writes, reset/diff, staging, duplication, binary import, and Trash.
- Apply the shared checker before every admin CSS write/import/reset.
- Distinguish kinds in caches, tools, notifications, original lookup, and Trash.
- Reuse **`theme.edit`**. Asset loading remains available to authorized users without editing permission.
- Preserve reversible assistant Trash operations and existing hard-delete restrictions.

### P4b — UI

Open:

```text
/admin/themes/explore?kind=admin&theme=glass&file=admin.css
```

Reuse grouped file tabs, editor, save chord, Wrap toggle, notices, and dialogs. Expose Styles, Config, and Assets; omit public-page publishing/preview controls.

Provide **Use theme**, **Back to previous theme**, upload/replace, reset, Duplicate, and Trash. Built-in working copies are immediately editable.

**Duplicate:** copy assets and any settings; assign a fresh ID; rewrite the theme ID in selectors and the manifest; validate; capture its original. **Keep `--theme-*` names and manifest `cssVariable` bindings unchanged.**

### Files

Tovu server, under `apps/website/src/features/theme/`:

- `theme-files.ts`, `file-identity-lock.ts`, `agent-tools.ts`, `tool-registrations.ts`
- `duplicate-theme.ts`, `duplicate-theme-tool.ts`
- `theme-file-import.ts`, `import-theme-file-tool.ts`
- `theme-trash.ts`, `trash-theme-tool.ts`
- Routes: `apps/website/src/server/inbound/admin-http/routes/themes/{explore.ts,duplicate.ts}`
- Existing composition and contract tests.

Tovu admin:

- `apps/admin/src/features/admin-themes/{AdminThemes.tsx,admin-themes-i18n.ts}`
- `apps/admin/src/features/themes/ThemeExplore.tsx`
- Existing Explore controller, dependency/port, URL, file-group, and theme-detail hooks.
- `apps/admin/src/lib/api.ts`
- `apps/admin/src/panels.tsx`
- Existing Explore/card tests.

### Reuse, verification, and done

Explore and folder lifecycles remain Tovu site-directory features; no prerequisite Jini extraction. Generic runtime/checker behavior already belongs to Jini.

Existing backups/portable copies include `themes/**`; add no backup adapter or allowlist entry.

Integration tests cover equivalent human/assistant edits, kind isolation, permissions, required files, invalid writes, upload limits, selector/manifest duplication, unchanged private-token bindings, text/binary reset, Trash/restore, and dirty editors.

Verify working trees, originals, optional settings, and assets survive backup/portable copy byte-for-byte; public serving/static export excludes admin assets.

Chrome: card → Explore → Use → edit/upload → immediate result; reset; duplicate in both schemes; return to previous theme. Mobile exposes identity, active state, Use/Back, file selection, and save status without hover-only actions.

**Done:** humans and the assistant share existing editing services, validation, and live updates; recovery matches ordinary site themes; site-theme behavior and accepted Classic paint remain intact.

## P5 — File-backed knobs and Media copy

**Scope**

Extend the UI-owned package manifest with `settings[]` descriptors for supported asset/range/color controls. Each declares its `cssVariable`; controls edit root-level `settings.css`.

```json
{
  "id": "backgroundImage",
  "type": "asset",
  "label": "Background image",
  "cssVariable": "--theme-background-image"
}
```

```css
:root[data-admin-theme="glass"] {
  --theme-background-image: url("assets/images/lake.webp");
}
```

- Create `settings.css` on first knob write; load it after admin/chat with compatible specificity.
- Read displayed values from files so assistant edits appear in controls.
- Change only the selected declaration; preserve unrelated content.
- Refuse silent overwrites of invalid or concurrently changed files.
- Choose/upload theme assets; offer **Copy from Media**.
- Pass a Media ID; server authorization and byte reads go through the Media owner.
- Keep accent in its existing per-user preference owner.
- Glass private intermediates feed Jini inputs; reduced-transparency and unsupported-backdrop branches remain readable and opaque.

**Files**

- Jini `packages/ui/src/core/theme/admin-theme-manifest.ts`
- Tovu `apps/admin/src/features/settings/AdminAppearance.tsx` and existing controls/hooks.
- `apps/admin/src/features/admin-themes/` asset-selection composition.
- Existing `apps/admin/src/components/MediaPickerDialog/` and Jini `MediaPickerPort`.
- Classic/Glass manifests and Glass CSS.
- `apps/website/src/features/theme/theme-file-import.ts`
- Existing Explore write/import routes and tool registrations.
- Media binding in server composition, reusing resource/blob resolution from `routes/media/original.ts`.

**Verification**

Reuse existing file writes and binary import/persistence. Test bounds, safe serialization, declaration-only edits, first-write creation, conflicts, reset, Media authorization/type limits, and independence from the source Media record.

Chrome: background/blur/tint changes apply immediately; assistant changes appear in controls. Verify photo replacement/removal, both schemes, keyboard/mobile use, reduced transparency, and unsupported blur.

**Done:** files and knobs agree; duplication/reset/backup naturally includes knob changes; Classic retains accepted P2 paint except deliberate personal accents.

**Delivery discipline:** behavior tests precede implementation and stay beside existing owners. Adopt actual supported Jini output before dependent Tovu verification; never patch generated output manually. Roll back coherent contract/theme/consumer units together. During unattended implementation, commit/push every 5–10 minutes or logical unit, commit before verification, pull with rebase immediately before pushing, never force-push, and report successful branch/SHA pairs.

# 3) Storage, validation, and security

## Persistence and recovery

| Concern | Decision |
|---|---|
| Theme files/assets/settings | Shared within selected site |
| Active theme | Existing per-user `core.interface.adminTheme` |
| Scheme | Existing per-user `core.appearance.theme` |
| Accent | Existing `accentColor` / `adminThemeAccents` |
| Knob override map | None |
| Independent variation | Duplicate theme |
| Boot hint | Scoped cache of successful selection; not authorization or durable authority |
| Desktop/hosted storage | Selected site’s persistent `themes/admin/` |
| Originals | `themes/__original-themes__/admin/<id>/` |

Extend the package manifest; keep it separate from the palette API.

Recovery is ordinary theme recovery: atomic writes, originals/reset, reversible Trash, and site backups. Label **Reset to original** accurately. No durable per-edit undo is promised. Database restore points do not restore folders; existing Trash retention is separate and is not claimed as part of theme backup coverage.

Customized built-ins and their originals are preserved during upgrades. No side-by-side upgrade tree.

## Token-only checker

One implementation enforces write-time and serve-time policy:

- Only **`--jini-theme-*` inputs and `--theme-*` private intermediates**.
- Root selectors scoped to package ID, optionally scheme-qualified.
- Bounded `@media` / `@supports`; contained-resource `@font-face`.
- No component selectors, structural declarations, arbitrary imports, shared-role overrides, legacy palette declarations, or external resource URLs.
- Allow **`data:image/svg+xml` and `data:image/png` URLs inside custom-property values**, capped at **4,096 bytes per data URL**. Preserve existing chevrons.
- Parse selectors/values, including escaped URLs; substring regexes are insufficient.
- Resolve file URLs relative to their stylesheet and require containment within the same package.
- Validate manifest paths and every referenced stylesheet.

Public functions/factories use `(requiredArgs, optionalArgs)`, for example:

```ts
checkTokenOnlyThemeCss({ css, themeId, path }, {})
```

## Assets and limits

Accept PNG, JPG/JPEG, WebP, AVIF, and WOFF2 files. Reject SVG **files**, HTML, JavaScript, and other executable content. Sniff bytes and require matching extensions. Inline SVG data URLs have only the checker exception above.

Reuse existing ceilings:

| Limit | Value |
|---|---:|
| Text file | 1,000,000 bytes |
| Binary file | 10,000,000 bytes |
| Theme | 50,000,000 bytes |
| Files | 2,000 |
| Depth | 12 |

Enforce limits on uploads/imports and externally edited packages at serve time. Originals, Trash, scratch files, symlinks, and arbitrary text are not asset-route resources.

## Authentication, caching, and live safety

- Existing session authentication; authorize workspace/site scope on every request, including conditional requests.
- No secrets in stylesheet URLs or localStorage.
- Generate URLs from validated identities using `/admin-themes/:id/r/:pkgHash/<path>`.
- Hash path segments are cache keys only; the server serves live files with private revalidation and ETags.
- Refresh all package stylesheet hrefs when package contents change so relative asset URLs change with them.
- Theme-switch completion guards prevent superseded selections from committing.
- Same-theme edits use ordered appended links and remove older versions after successful loads.
- Dispose old-site/user subscriptions and links.
- SSE carries identity/hash metadata, never theme contents or private Media URLs.
- Reconcile catalog hashes after reconnect.
- Media copy resolves authorized IDs through the Media owner; never fetch caller-supplied URLs.

Token-only validation enforces structural boundaries, not visual usability. Keep Classic recovery reachable; verify contrast, focus, transparency fallbacks, and reduced motion in Chrome.

# 4) Deferred

- Durable per-edit history for both site and admin themes.
- Jini extraction of Explore and folder services.
- Plugin-delivered `adminThemes[]`.
- Immutable revision asset trees or separate admission state.
- Neutral boot screen or separate preview document.
- New admin-theme permission or personal knob maps.
- Side-by-side built-in upgrades.
- Mechanical migration of legacy `var()` consumers and eventual alias deletion.
- Additional theme families, arbitrary CSS, component selectors, executable theme extensions.
- New backup/restore or storage infrastructure.

# 5) Disagreements

**None.** All five R2 MUSTs and three SHOULDs are incorporated; prior accepted decisions remain.

# 6) Handoff

Coordinator records the acceptance/ADR revision and allocates existing owners, starting with P0 preservation and fresh captures. The four owner questions/defaults are in the Owner summary; none blocks P0–P2.

Principal risks remain alias cycles, package-output drift, first-paint loading, stylesheet ordering, and asset-cache invalidation. Phase verification and done criteria define their exit gates.
