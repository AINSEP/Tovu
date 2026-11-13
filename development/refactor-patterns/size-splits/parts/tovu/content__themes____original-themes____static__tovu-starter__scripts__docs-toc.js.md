### tovu:content/themes/__original-themes__/static/tovu-starter/scripts/docs-toc.js
- **Over:** the file's IIFE `<anonymous>` 125 (file 125)
- **Phase:** now (label ?) · **Batch:** size-42
- **Tests:** none (browser theme script). Smoke = load a docs page of a site using this theme.
- **Responsibility map:** one IIFE: guard (`toggle`/`nav`/`content`), id assignment (`slugify`, `ensureId`, `usedIds`), TOC build (`buildTree`, `renderList`), scroll-spy (`setActive`, `lockedUntil`, `IntersectionObserver`, click lock).
- **Splits:** none planned — see exception line. (If the owner declines the exception: lift `slugify`/`buildTree` to IIFE-top-level pure functions and wrap the scroll-spy block in `setupScrollSpy({ nav, toggle, targets })` — identically in ALL FOUR byte-identical copies listed below, in one commit.)
- **Importers to update:** none.
- **After:** unchanged.
- **Risks / notes:** this file is byte-identical (md5 fe55ff61…) in `content/themes/__original-themes__/static/{tovu-starter,tovu-theme}/scripts/docs-toc.js` and `content/themes/static/{tovu-starter,tovu-theme}/scripts/docs-toc.js`. The `__original-themes__` copies are the pristine originals Explore resets/compares against ("modified" badge) — editing one copy and not the others marks themes modified or breaks reset parity.
- **Owner exception candidate:** theme runtime script duplicated per theme (4 identical copies incl. the originals catalog); not kUInetic, but a split must be applied to every copy in lockstep and changes the originals' bytes. Recommend exempting `content/themes/**/scripts/*.js`.
