# A-adm-shell-hooks-1 — adm-shell-hooks → @jini-ai/admin (Jini step J then Tovu step T)

Lane A. Batch J:34 T:37. Depends on: A-adm-shell-lib-2, A-adm-shell-lib-4. Est: J 72 min, T 42 min.

## J — move verbatim into Jini (10 files, 592 LOC)

| Tovu source | Jini destination | LOC | flags |
|---|---|---|---|
| `apps/admin/src/hooks/admin-locale-port.hooks.ts` | `packages/admin/src/shell/hooks/admin-locale-port.hooks.ts` | 24 |  |
| `apps/admin/src/hooks/use-admin-document-locale.hooks.ts` | `packages/admin/src/shell/hooks/use-admin-document-locale.hooks.ts` | 15 |  |
| `apps/admin/src/hooks/use-cms-sidebar-label-tooltips.hooks.ts` | `packages/admin/src/shell/hooks/use-cms-sidebar-label-tooltips.hooks.ts` | 40 |  |
| `apps/admin/src/hooks/use-desktop-view-release.hooks.ts` | `packages/admin/src/shell/hooks/use-desktop-view-release.hooks.ts` | 18 |  |
| `apps/admin/src/hooks/use-dock-auto-rail.hooks.ts` | `packages/admin/src/shell/hooks/use-dock-auto-rail.hooks.ts` | 110 |  |
| `apps/admin/src/hooks/use-drawer-active-item-centring.hooks.ts` | `packages/admin/src/shell/hooks/use-drawer-active-item-centring.hooks.ts` | 92 |  |
| `apps/admin/src/hooks/use-list-table-cell-labels.hooks.ts` | `packages/admin/src/shell/hooks/use-list-table-cell-labels.hooks.ts` | 77 |  |
| `apps/admin/src/hooks/use-sidebar-empty-click-toggle.hooks.ts` | `packages/admin/src/shell/hooks/use-sidebar-empty-click-toggle.hooks.ts` | 107 |  |
| `apps/admin/src/hooks/use-content-refresh-subscription.hooks.ts` | `packages/admin/src/shell/hooks/use-content-refresh-subscription.hooks.ts` | 64 |  |
| `apps/admin/src/hooks/use-agent-screen-context.hooks.ts` | `packages/admin/src/shell/hooks/use-agent-screen-context.hooks.ts` | 45 |  |

**package.json export entries** (dist triple `types`/`import`/`default`, same shape as the neighbours):
- "@jini-ai/admin" exports["./shell/hooks/admin-locale-port.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-admin-document-locale.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-agent-screen-context.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-cms-sidebar-label-tooltips.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-content-refresh-subscription.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-desktop-view-release.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-dock-auto-rail.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-drawer-active-item-centring.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-list-table-cell-labels.hooks"]
- "@jini-ai/admin" exports["./shell/hooks/use-sidebar-empty-click-toggle.hooks"]


**Relative imports inside moved files**: rewrite each `../..`/`#src/`/`@/` specifier that pointed at a file moved in this or an earlier step to the relative path between the two Jini destinations (`.js` suffix); a `@jini-ai/<same package>/x` import becomes relative. Nothing else in the file changes.

## Tests that move with the code (7, 788 LOC) → Jini `__tests__/` beside the destination
- `apps/admin/src/hooks/__tests__/use-cms-sidebar-label-tooltips.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/use-desktop-view-release.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/use-dock-auto-rail.hooks.test.tsx`
- `apps/admin/src/hooks/__tests__/use-drawer-active-item-centring.hooks.test.ts`
- `apps/admin/src/hooks/__tests__/use-list-table-cell-labels.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/use-sidebar-empty-click-toggle.hooks.test.tsx`
- `apps/admin/src/hooks/__tests__/use-content-refresh-subscription.hooks.test.ts`


## T — Tovu repoint: delete the 10 sources, rewrite every importer (36 lines)

```
apps/admin/src/hooks/__tests__/use-admin-locale.hooks.test.ts:6  '../admin-locale-port.hooks' -> '@jini-ai/admin/shell/hooks/admin-locale-port.hooks'
apps/admin/src/hooks/admin-locale-dependencies.hooks.ts:3  './admin-locale-port.hooks' -> '@jini-ai/admin/shell/hooks/admin-locale-port.hooks'
apps/admin/src/hooks/use-admin-locale.hooks.ts:6  './admin-locale-port.hooks' -> '@jini-ai/admin/shell/hooks/admin-locale-port.hooks'
apps/admin/src/App.tsx:4  './hooks/use-admin-document-locale.hooks' -> '@jini-ai/admin/shell/hooks/use-admin-document-locale.hooks'
apps/admin/src/hooks/__tests__/use-admin-document-locale.unit.test.ts:5  '../use-admin-document-locale.hooks' -> '@jini-ai/admin/shell/hooks/use-admin-document-locale.hooks'
apps/admin/src/App.tsx:2  './hooks/use-cms-sidebar-label-tooltips.hooks' -> '@jini-ai/admin/shell/hooks/use-cms-sidebar-label-tooltips.hooks'
apps/admin/src/__tests__/unit/sidebar-labels.unit.test.tsx:2  '../../hooks/use-cms-sidebar-label-tooltips.hooks' -> '@jini-ai/admin/shell/hooks/use-cms-sidebar-label-tooltips.hooks'
apps/admin/src/components/__tests__/SitesSidebarNav.unit.test.tsx:10  '@/hooks/use-cms-sidebar-label-tooltips.hooks' -> '@jini-ai/admin/shell/hooks/use-cms-sidebar-label-tooltips.hooks'
apps/admin/src/App.tsx:21  './hooks/use-desktop-view-release.hooks' -> '@jini-ai/admin/shell/hooks/use-desktop-view-release.hooks'
apps/admin/src/App.tsx:42  './hooks/use-dock-auto-rail.hooks' -> '@jini-ai/admin/shell/hooks/use-dock-auto-rail.hooks'
apps/admin/src/App.tsx:34  './hooks/use-drawer-active-item-centring.hooks' -> '@jini-ai/admin/shell/hooks/use-drawer-active-item-centring.hooks'
apps/admin/src/App.tsx:41  './hooks/use-list-table-cell-labels.hooks' -> '@jini-ai/admin/shell/hooks/use-list-table-cell-labels.hooks'
apps/admin/src/App.tsx:37  './hooks/use-sidebar-empty-click-toggle.hooks' -> '@jini-ai/admin/shell/hooks/use-sidebar-empty-click-toggle.hooks'
apps/admin/src/features/dashboard/hooks/use-dashboard.hooks.ts:4  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts:7  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/integrations/hooks/use-integrations.hooks.ts:7  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/library/hooks/use-library.hooks.ts:8  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/media/hooks/use-media.hooks.ts:8  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:19  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/pages/hooks/use-pages.hooks.ts:7  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/plugins/hooks/use-agent-plugins.hooks.ts:8  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/plugins/hooks/use-plugins.hooks.ts:8  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:35  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/posts/hooks/use-posts.hooks.ts:8  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/recovery/hooks/use-recovery.hooks.ts:10  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts:12  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/security/hooks/use-other-credentials.hooks.ts:8  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/sites/hooks/use-sites-snapshot.hooks.ts:5  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/themes/hooks/use-theme-explore.hooks.ts:8  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/themes/hooks/use-themes.hooks.ts:8  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/features/trash/hooks/use-trash.hooks.ts:7  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/integrations/chart-providers/use-chart-registry.hooks.ts:9  '@/hooks/use-content-refresh-subscription.hooks' -> '@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks'
apps/admin/src/App.tsx:35  './hooks/use-agent-screen-context.hooks' -> '@jini-ai/admin/shell/hooks/use-agent-screen-context.hooks'
apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts:21  '@/hooks/use-agent-screen-context.hooks' -> '@jini-ai/admin/shell/hooks/use-agent-screen-context.hooks'
apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts:34  '@/hooks/use-agent-screen-context.hooks' -> '@jini-ai/admin/shell/hooks/use-agent-screen-context.hooks'
apps/admin/src/lib/__tests__/agent-screen-context.unit.test.ts:12  '@/hooks/use-agent-screen-context.hooks' -> '@jini-ai/admin/shell/hooks/use-agent-screen-context.hooks'
```

## Tovu tests that must stay green (5; import lines are repointed above, assertions untouched)
- `apps/admin/src/__tests__/unit/sidebar-labels.unit.test.tsx`
- `apps/admin/src/components/__tests__/SitesSidebarNav.unit.test.tsx`
- `apps/admin/src/hooks/__tests__/use-admin-document-locale.unit.test.ts`
- `apps/admin/src/hooks/__tests__/use-admin-locale.hooks.test.ts`
- `apps/admin/src/lib/__tests__/agent-screen-context.unit.test.ts`

## Neutrality N2 (no `apps/website|admin|desktop` or `#src/` text in Jini, comments included)
- `apps/admin/src/hooks/admin-locale-port.hooks.ts`: reword each comment path citation to name the host module in words ("the host's theme routes"), keeping the why

## Named mutation
in the Jini copy of `use-dock-auto-rail.hooks.ts`, negate the first `if (` condition of its first exported function; `use-dock-auto-rail.hooks.test.tsx` must go red, then revert
