### tovu:content/themes/__original-themes__/static/tovu-theme/scripts/main.js
- **Over:** the file's IIFE `<anonymous>` 193 (file 193)
- **Phase:** now (label ?) · **Batch:** size-42
- **Tests:** none (browser theme script). Smoke = load a page of a site using this theme (header scroll class, copy buttons, mobile drawer).
- **Responsibility map:** one IIFE with already-named setup steps: header scroll state (`onScroll`), install-command copy (`if (copyBtn)`), code copy buttons (`setupCodeCopyButtons`), mobile/compact menu (`readMenu`, `publishMobile`, `buildMenuList`, `buildMenuItem`, `desktopNavFits`, `setupMobileNav`).
- **Splits:** none planned — see exception line. (If the owner declines: move `setupCodeCopyButtons` and the mobile-menu group out of the IIFE into separate top-level IIFE-scoped functions is NOT possible without globals; the only same-file option is wrapping the mobile-menu group in `function setupCompactMenu({ header }) { … }` called where `setupMobileNav()` is — applied identically to ALL FOUR copies in one commit.)
- **Importers to update:** none.
- **After:** unchanged.
- **Risks / notes:** byte-identical (md5 23f04f63…) in `content/themes/__original-themes__/static/{tovu-starter,tovu-theme}/scripts/main.js` and `content/themes/static/{tovu-starter,tovu-theme}/scripts/main.js`; the `__original-themes__` copies are Explore's pristine originals.
- **Owner exception candidate:** theme runtime script duplicated per theme (4 identical copies incl. the originals catalog); a split must touch every copy in lockstep and changes the originals' bytes. Recommend exempting `content/themes/**/scripts/*.js`.
