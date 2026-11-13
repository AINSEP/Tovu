### tovu:apps/desktop/src/renderer/SiteGrid.tsx
- **Over:** file 505 lines (`SiteCard` 100 = at the limit, not over)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/SiteGrid.jsdom.test.ts`, `SiteGrid.no-add-tile.render.test.ts`, `SiteGrid.status-title.render.test.ts`, `SiteGrid.hooks.test.ts`, `site-card-actions-wiring.test.ts`, `stalecard-paths.test.ts`, `sitesnest-card.test.ts`, `site-restart.test.ts`, `shell-bug-fixes.test.ts`, `App.sites-home.render.test.ts`, `app/MainContent.render.test.ts` (renderer runner). No mocks of the module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `SiteGrid`, `siteListCopy`, `SiteCardList`, `SiteCard`, `SiteCardNotes`, `MissingFolderNotice` | the grid and one card's slots (stays) |
| B | `CardOverlays`, `CardConfirmOverlay`, `CardRenameOverlay` | the inline panels that replace a card's content: delete/stop confirm and rename form |
| C | `CardActions`, `SiteCardMenu` | the card's button row and ⋮ menu (stays) |

- **Splits:**
  1. NEW `apps/desktop/src/renderer/SiteGrid-card-overlays.tsx` — job: a card's inline confirm and rename panels. Moves `CardOverlays`, `CardConfirmOverlay`, `CardRenameOverlay` verbatim with their doc comments (the `role="group"` / stopPropagation "why" blocks and the rename `autoFocus` / Escape comments move word for word). Exports: `CardOverlays` only. Imports it needs: `SiteRecord` (type, `../contracts/project.js`), `SiteRenameState`, `renameInputKeyDown`, `showsInvalidNameHint` (`./use-site-rename.hooks.js`), `codeSpans`, `externalStopConfirm`, type `SitePower` (`./use-site-power.hooks.js`), types `CardOverlayMode`, `DeleteActionCopy` (`./SiteGrid.hooks.js`), `namePasteHandler` (`../contracts/site-name.js`). Header: one paragraph — "A site card's inline panels (delete/stop confirm, rename), split out of `SiteGrid.tsx`; the card is inert under them (see `SiteCard`)." Imports nothing from `SiteGrid.tsx`.
  2. In `SiteGrid.tsx`: `import { CardOverlays } from './SiteGrid-card-overlays.js';`; drop now-unused imports (`namePasteHandler`, `renameInputKeyDown`, `showsInvalidNameHint`, `codeSpans`, `externalStopConfirm`; keep the ones still used — check with rg). The comment in `SiteCardMenu` ("See `CardConfirmOverlay` below") becomes "See `CardConfirmOverlay` in `SiteGrid-card-overlays.tsx`".
- **Importers to update:** none (all three were module-private).
- **After:** `SiteGrid.tsx` ~380; `SiteGrid-card-overlays.tsx` ~140; largest function `SiteCard` 100 (unchanged).
- **Risks / notes:** the new `.tsx` lands in the coverage-floors "src renderer components" area automatically (dir-based); no `coverage-floors.json` edit needed. Keep the file header paragraph about the inline delete-confirm in `SiteGrid.tsx` as is.
