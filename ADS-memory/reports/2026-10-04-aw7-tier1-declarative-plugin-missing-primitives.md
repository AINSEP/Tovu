# AW-7 Tier 1 — declarative Testimonials + FAQ plugin: what core is missing

2026-10-04. Owner decision the same day: contact forms are core now, so the Tier-1 sample is
**Testimonials + FAQ** (zero code), not a contact form. This note is the "dead without X" list the
AW-7 item exists to produce, plus what was built.

## Built in core (this pass)

| Primitive | Where | State |
|---|---|---|
| Manifest `contentTypes` grammar (closed, bounded: ≤20 types, ≤50 fields, identifier grammar, core field kinds, reserved keys refused) | `apps/website/src/features/plugin-runtime/declarative-content-types.ts` | done, 100% covered |
| Enable-time provisioner: create-if-missing, keep-if-compatible, skip-if-tombstoned, refuse-on-conflict before any write; retain on disable/uninstall; actor `plugin:<id>`, `principalKind: system` | same file + `declarative-enable.ts` | done, 100% covered |
| Tier-1 enable path that never imports code (wrapper around the runtime's `onPluginEnabled`) | `declarative-enable.ts` (`createDeclarativeAwareEnable`, `createDeclaredContentTypePorts`) | done, **not yet wired** into `server/runtime/composition/{deps,app}.ts` |
| Manifest-only package install: tier-1 accepted only with zero code files (allowlist: json/md/txt/png/jpg/gif/webp/LICENSE), no capabilities/hooks/fields; honest preview (`hasCode:false`, `contentTypes`) and CLI consent | `features/plugin-runtime/install.ts`, `cli/commands/plugin/install.ts` | done |
| Collection-list layouts `accordion` (native `<details>`) and `carousel` (CSS scroll-snap, focusable) + opt-in `structuredData: "faq-page"` (FAQPage JSON-LD) | `features/theme/entry-list-render.ts` | renderer done; **not yet reachable from config** (see remaining) |

## Remaining to make the sample installable end to end (small, next agent)

1. Wire `createDeclarativeAwareEnable` where both roots hand `onPluginEnabled` to the routes
   (`deps.ts` ~2242, `app.ts` ~1347): `enableCode: pluginRuntime.onPluginEnabled`,
   `discoverPlugins: pluginRuntime.discoverPlugins`, ports from `createDeclaredContentTypePorts({ repo:
   contentTypeRepo, clock, ids: idGen, outbox })`. The closure may reference the later-declared
   `contentTypeRepo` (top-level composition is synchronous; precedent: `postRepo` in `wireCoreResolvers`).
2. Make the layouts reachable: `entries/public-list.ts` `parseLayout` + `CollectionListDisplay`
   (`accordion`/`carousel`, `structuredData`), `routes/site/pages.ts` pass `structuredData`,
   `widgets/resolvers/recent-entries.ts` `widgetLayout` + prop, `widgets/registry.ts` schema key
   `structuredData`, `http/site/render.ts` `renderWidgetRecentEntries` (cards → any non-list layout).
3. The package itself: `tovu.plugin.json` (tier-1, `contentTypes` testimonial + faq, README.md in
   `integrity`) + an integration test that installs it from its folder, enables it through the
   wrapper, and renders an FAQ accordion with JSON-LD.
4. Admin install dialog: show "contains no code / adds content types" instead of the full-access
   warning when `hasCode` is false (string in all 22 locales of `plugins-i18n.ts`), and widen the
   admin `PluginInstallPreview` type (`tier: string`, `contentTypes`).

## Missing primitives ("dead without X") — not built

| # | Missing | Why the plugin is dead/degraded without it | Size |
|---|---|---|---|
| 1 | **Validation in `validateManifest`** (call `validateDeclarativeManifest`) | discovery lists a bad declaration as `valid`; it only fails at enable | tiny — blocked on the in-flight conflict-detection edits to `manifest.ts` |
| 2 | **Tier-1 inside the runtime**: run the declarative path after the conflict gate; boot re-attach skips tier-1 | today a tier-1 plugin bypasses plugin-vs-plugin claim checks, and boot logs a harmless "re-attach failed" | small — same blocker (`composition/plugin-runtime.ts`) |
| 3 | **Content-type key as a claim kind** (`contributes.contentTypes`) | two plugins declaring `faq` resolve by "second one conflicts on schema", not by the claim system | small |
| 4 | **Media field kind** (+ image rendering) | testimonial avatar is a `relation` string; admin shows a text box, the site prints the id | medium (field kind lives in Jini `@jini-ai/cms`) |
| 5 | **Field presentation metadata**: label, help text, long-text/textarea, select/enum options, min/max | admin shows raw field names (`answer`), one-line inputs for a quote/answer, free text for category, no 1–5 bound on rating | medium (Jini content-types + admin Collections) |
| 6 | **Per-field i18n for plugin-declared labels** | plugin type/field labels cannot be translated into the admin's 22 locales | medium |
| 7 | **Declarative widget presets** (manifest `widgets: [{ base: "recent-entries", config }]`) | the owner must hand-configure a Collection list widget (`collection: faq, layout: accordion, structuredData: faq-page, sort: order`) — the plugin cannot ship "FAQ accordion" as a one-click block | medium (widget registry is code-only by design, ADR-047 Amendment 3; a preset is data) |
| 8 | **Plugin provenance on content types** (owner/source column) | Collections cannot show "added by Testimonials + FAQ"; nothing stops an owner editing the declared schema into a conflict | migration (stage under `ADS-memory/.local-artifacts/codex-waves/features-2026-10-04/staged/aw7-t1/`) |
| 9 | **Plugin-owned envelope readable by display paths** | every display path reads `ext.site` only, so plugin types must use owner `site` | small-medium |
| 10 | **Declarative settings schema** | not needed for this sample; still unbuilt for Tier-1 generally (ADR-024 Open) | — |
| 11 | **Entry public pages** (D1 seam) | testimonials/FAQ cannot be linked or deep-linked (`#faq-…`) | owner-open |

Visual checks owed (dev server stopped): FAQ accordion + JSON-LD on a page, carousel scroll-snap on
phone width, Collections screen for the two new types, install dialog for a tier-1 package.
