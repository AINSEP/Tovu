# Admin lib (host side)

## Wiring

- `agent-screenshot.ts` keeps only the html2canvas-pro rasterizer (`renderAdminScreenshotCanvas`);
  `App.hooks.ts` passes it as `renderElementToCanvas` to the Jini
  `captureAdminScreenshotToolResult` (`@jini-ai/admin/shell/lib/agent-screenshot`).
- `media-embed-extension.hooks.ts` keeps `useWiredMediaEmbedNodeView`, which passes `translate` and
  `mediaOriginalUrl` to the Jini `useMediaEmbedNodeView`. `media-image-extension.tsx` passes the
  `app-i18n` translator to `createMediaImageTranslator`. The TipTap extension definitions stay here.
- The post editor narrows its TipTap editor with the Jini `isLiveEditor`
  (`@jini-ai/admin/shell/lib/live-tiptap-editor`).
