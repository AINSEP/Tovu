# Static menu selection (2026-10-25)

ADR-029 §7 governs static theme markers too: the marker id is first a location key. An assigned
menu wins over a matching legacy slug or database id. A missing/stale binding retains slug-then-id
compatibility (rationale lives at `findStaticMenu` in pages.ts). Docs header-derived navigation uses
the same selection. Reserved Docs markers retain their specific contracts.

The August 10 bypass decision below is superseded by that contract. Its rationale is preserved here
rather than asserting obsolete behavior in code:

> A theme marker now names a real stored menu `id` directly (e.g. `data-embed-id="menu-header-nav"`)
> — the same `data-embed-type`/`data-embed-id` convention posts already use (`injectCurrentEntityContentId`) —
> rather than a theme-independent named location resolved through `nav_location_bindings`. This
> intentionally leaves `resolveForLocation`, `navLocationBindingRepo`, and the admin `assign-location`
> API route (`admin-http/routes/menus/assign-location.ts`) in place but UNUSED for static-tier
> header/footer rendering specifically — the Menus admin screen itself has no "assign location" UI;
> the theme alone decides where each menu goes, via the `data-embed-id` slug markers above. These are
> not deleted (other tiers or a future deprecation may still want them), simply no longer
> on this call path.
