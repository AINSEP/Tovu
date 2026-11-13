### tovu:apps/desktop/src/renderer/app/SiteWorkspace.tsx
- **Over:** `SiteWorkspace` 121 (file 260, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/app/SiteWorkspace.render.test.ts`, `app/SiteWorkspace.live-views.render.test.ts`, `app/SiteWorkspace.loading-overlay.render.test.ts`, `site-toolbar-wiring.test.ts`, `webview-partition-wiring.test.ts`, `App.workspace-start.render.test.ts`, `expanded-mode.test.ts`, `import-site-entry.test.ts` (renderer runner). No mocks of the module.
- **Responsibility map:**

| unit | statements / JSX | job |
|---|---|---|
| A | `const workspace = useSiteWorkspace(` … `const startPanel = running ? (` | tab state, composed guest ref, start panel (stays) |
| B | `<div className="workspace__nav">` (Back / Forward / Reload buttons) | browser-style history controls |
| C | `<div className="workspace__views">` (`SITE_SURFACES.map`) | Admin / Site surface toggle |
| D | rest of `workspace__bar`, guest-or-start-panel ternary | stays |

- **Splits** (same file; sub-components at module level directly below `SiteWorkspace`, beside `WorkspaceGuest` / `ExpandToggle`; plain props):
  1. `WorkspaceHistoryNav({ canGoBack, canGoForward, running, onBack, onForward, onReload }: WorkspaceHistoryNavProps)` ← unit B JSX verbatim (the "A browser's order: history first" comment moves with it). Call: `<WorkspaceHistoryNav canGoBack={workspace.history.canGoBack} canGoForward={workspace.history.canGoForward} running={running} onBack={workspace.goBack} onForward={workspace.goForward} onReload={workspace.reload} />`. Callback prop types = `() => void` (use the existing `ReturnType<typeof useSiteWorkspace>["goBack"]` etc. if `() => void` does not fit).
  2. `WorkspaceViewToggle({ surface, onSelect }: WorkspaceViewToggleProps)` ← unit C JSX verbatim incl. the `reportShellTelemetry(...)` call inside `onClick`; `onSelect` = `workspace.selectView`; `surface` typed as `(typeof SITE_SURFACES)[number]`.
- **Importers to update:** none (no export moves).
- **After:** `SiteWorkspace` ~83; file ~280; new sub-components ~33 and ~15.
- **Risks / notes:** button order, `title`/`aria-label` text and `disabled` expressions must be byte-identical (`site-toolbar-wiring.test.ts` asserts them). Telemetry stays inside the click handler, before `selectView`.
