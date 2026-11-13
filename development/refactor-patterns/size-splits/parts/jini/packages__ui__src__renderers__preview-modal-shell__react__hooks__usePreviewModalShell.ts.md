### jini:packages/ui/src/renderers/preview-modal-shell/react/hooks/usePreviewModalShell.ts
- **Over:** `usePreviewModalShell` 141 (file 172)
- **Phase:** now · **Batch:** size-33
- **Tests:** `packages/ui/src/renderers/preview-modal-shell/react/hooks/usePreviewModalShell.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `fullscreen` state, Escape `useEffect` (~L91), fullscreen-mirror `useEffect` (~L107), `enterFullscreen`, `exitFullscreen` | fullscreen + Escape |
| B | `primaryMenuOpen` state, `primaryMenuRef`, dismissal `useEffect` (~L116) | split-button menu |
| C | `stageSize` state, stage-size `useEffect` (~L146), re-measure `useEffect` (~L174), `scale`, `scalerStyle` | stage measuring/scaling |
| D | views/sidebar state, `sidebarToggleRef`, sidebar/onView effects, body-lock effect, `activeView`, return | shell core (stays) |

- **Splits** (same file, above, in order):
  1. SUB-HOOK `useFullscreenMode({ stageRef, onClose }: UseFullscreenModeInput): { fullscreen, enterFullscreen, exitFullscreen }` ← unit A with both comments (the Escape effect reads `fullscreen` and `onClose`).
  2. SUB-HOOK `useSecondaryMenu(): { primaryMenuOpen, setPrimaryMenuOpen, primaryMenuRef }` ← unit B.
  3. SUB-HOOK `useStageScale({ stageFrameRef, sidebarOpen, activeId, designWidth }: UseStageScaleInput): { stageSize, scale, scalerStyle }` ← unit C with both comments.
  Call order: state `activeId`/`sidebarOpen`, refs, sidebar + onView effects, `useFullscreenMode`, `useSecondaryMenu`, body-lock effect, `useStageScale` — keeps the original effect order.
- **Importers to update:** none.
- **After:** `usePreviewModalShell` ~60; file ~195.
- **Risks / notes:** `stageRef`/`stageFrameRef` stay in the main hook (returned to the component). `fullscreen` state slot moves after `activeId`/`sidebarOpen` (harmless).
