# lightboxcheck-67 — landing lightbox duplicate arrows

Root cause: newer kUInetic (CDN kuinetic@0) wraps prev/next in a fixed .kui-lightbox-nav with its own SVG chevrons; the buttons are position:static, so tovu-theme's absolute ::before mask (theme.css ~1525) centred on the 96x44 nav box, which drew a second small pair between the circles.

- Commit cf1552006 (Tovu): content/themes/static/tovu-theme/css/theme.css adds `.kui-lightbox-prev:has(> svg)::before, .kui-lightbox-next:has(> svg)::before { content: none; }`, reverts round-1 edit, fixes comments.
- Site copy ~/Documents/Tovu/tovu-dev/themes/static/tovu-theme/css/theme.css is byte-identical (md5 859e08e44490d2b709f0e1f24bdadfbc). That file is what https://localhost:3000/theme-assets/tovu-theme/css/theme.css serves.
- Codex rounds: r2 only (prompt/out in scratchpad lightbox-67/r2, out-r2). Nothing went back.
- Chrome checks: 1/19, 19/19, focus ring, 390px frame: one chevron per circle, circles unchanged. No tests (CSS pseudo-element; visual check only).
- Leftovers: (1) The landing page's inline <style> (DB page body) and theme.css layout rules for `.kui-lightbox-gallery > .kui-lightbox-prev/next` (counter-row / bottom-left anchored) are dead with the new DOM. (2) The library's fixed bottom-right nav puts "next" over the site-chat bubble on desktop and phone, which is the overlap the old bottom-left rule avoided. Not fixed (out of scope).
- Note: Codex launched at 1-min load 44 (CPU_Speed_Limit 100). It was one light job.

## Follow-up (r3)
- Commit 8ef2aa77d: deleted dead content/themes/static/tovu-theme/scripts/vendor/lightbox.js, and the same file in the tovu-dev site copy. Nothing loaded it; tovu-starter and __original-themes__ untouched. The facts sent later (kuinetic glyphs + theme mask) match what r2 already confirmed in Chrome: the glyphs are SVGs, not text.

## Round 4
- Commit 042775dde: theme.css hides button.jini-chat-bubble while dialog.kui-lightbox[open], and deletes all dead .kui-lightbox-gallery rules. Site theme copy byte-identical (md5 af8b9a22).
- Landing "/" page (local tovu-dev DB, id 4f220108) inline lightbox block (old lines 499-534) removed via PUT /api/admin/v1/workspaces/workspace-local/pages/<id>/html, v130 -> v131. Codex could not write the scratch file (sandbox), so I built it with sed 499,534d; its md5 matched Codex in-memory md5 9c82ebb1. Prod is not touched; publishing to tovu.dev is a separate step.
- Chrome: 1/19, 19/19, 390px, bubble hidden while open and visible after close.
