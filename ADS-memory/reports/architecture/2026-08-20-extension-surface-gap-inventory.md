# Tovu Extension Surface — Verified Gap Inventory vs WordPress & Directus

**Date:** 2026-08-20
**Branch:** general-work @ 99494a6
**Method:** cbm-mcp graph search + direct file reads. Every Tovu row below cites a real file:line.
**Supersedes:** the gap tables given verbally on 2026-08-19, which were wrong in four rows
(they were answered from memory without reading the capability vocabularies).

---

## 1. What Tovu actually has — verified

### 1.1 Two parallel extension mechanisms

| | `plugin-runtime` | `site-glue` |
|---|---|---|
| Manifest | `tovu.plugin.json` | glue manifest (ADR-057) |
| Capabilities | **3** | **8** |
| Trust tiers | ✅ tier-1/2/3 | ❌ none |
| Integrity hashing | ✅ `loader.ts:167` | ❌ skipped by design (REQ-10) |
| Quarantine on failure | ✅ `hook-registry.ts:182` | ❌ |
| Marketplace-facing | ✅ | ❌ first-party only |
| Can register agent tools | ❌ | ✅ |
| Can contribute rendering | ❌ | declared, unwired |

`plugin-runtime` capability vocabulary — `src/features/plugin-runtime/manifest.ts:124`:
```
content.read   content.extend   hooks.attach
```

`site-glue` capability vocabulary — `src/features/site-glue/capability-gate.ts:52`:
```
content.read      content.extend      hooks.attach       tools.register
events.subscribe  admin.nav.register  render.contribute  http.route.register
```

**The trust model and the capability breadth are in different systems.** That is the core
architectural problem.

### 1.2 ADR-057 call-site dispatch table — 3 wired, 3 placeholders

`src/features/site-glue/manifest.ts:120` (`VALID_CALL_SITES`), adapters in
`src/features/site-glue/attachment-points/`:

| Call site | Adapter file | State |
|---|---|---|
| `content.entry.beforeSave` | `content-lifecycle.ts` | ✅ wired |
| `assistant.tools` | `tool-registration.ts` | ✅ wired |
| `events.subscribe` | `events.ts` | ✅ wired |
| `admin.nav` | — | ❌ typed placeholder |
| `render.contribute` | — | ❌ typed placeholder |
| `http.routes` | — | ❌ typed placeholder |

The manifest's own comment: *"Wiring a fourth is 'add one member here,' never a manifest-schema
change."* The schema work is done; three adapters are missing.

### 1.3 Front-end rendering — the mechanism exists, the registry is closed

Three ways a template gets dynamic content today:

1. **`{% render_block component: "tovu/site-header" %}`** — Liquid tag.
   Allowlisted at `src/features/theme/liquid-allowlist.ts:45`.
2. **`{{render_block ...}}`** — Handlebars helper, same registry.
   `src/features/theme/handlebars-allowlist.ts:80` (the *only* allowed helper).
3. **`data-embed-config='{"type":…}'`** — static tier markers, `src/core/embeds/marker.ts`.

All of (1) and (2) resolve against **one hardcoded object literal** —
`src/server/http/site/render.ts:1226`:

```ts
export const COMPONENTS: Record<string, Component> = {
  "tovu/site-header": siteHeader,   "tovu/entry-list": entryList,
  "tovu/entry-content": entryContent, "tovu/site-footer": siteFooter,
  "tovu/hero": hero,                "tovu/section": section,
  "tovu/feature-grid": featureGrid, "tovu/media-placeholder": …,
  "tovu/announcement": announcement, "tovu/nav": siteNav,
  "tovu/cta": ctaBand,              "tovu/footer": siteFooterRich,
};
```

**Twelve core components. No extension seam.** `render.contribute` = making this map
contributable. The tag, the allowlist, the two-engine plumbing, and the sandbox already exist.

### 1.4 Templating — Tovu is ahead of Directus here

Five theme tiers — `src/features/theme/theme.ts:40`:
```
declarative | templated | handlebars | static | code(reserved)
```

`templated` = **LiquidJS**, the same language Shopify themes use. Real example already shipped:
`src/themes/templated/storefront/render/pages/products.liquid` loops products and prints
`{{ product.title }}`, `{{ product.priceFormatted }}`, `{{ product.stock }}`.

Security posture: rendered in an isolated worker (`liquid-worker.ts`, spawned per render by
`liquid-sandbox.ts`), tag/filter allowlist enforced at load *and* re-checked in the worker,
`outputEscape: "escape"` on by default so `{{ post.title }}` cannot inject markup.

**This sandbox is reusable as the Tier-2 plugin sandbox.** It already does the hard part.

---

## 2. The gap, ranked

### Blocking — a designed placeholder with no adapter

| # | Gap | Blocks | Where it goes |
|---|---|---|---|
| 1 | `render.contribute` | every front-end plugin | open up `render.ts:1226` `COMPONENTS` |
| 2 | `admin.nav` | every admin plugin | new adapter + `apps/admin/src/panels.tsx` |
| 3 | `http.routes` | integrations, webhooks, OAuth callbacks | new adapter + route mounting |

### Missing entirely — no placeholder, no vocabulary

| # | Gap | WP | Directus | Notes |
|---|---|---|---|---|
| 4 | Scheduled jobs / cron | ✅ `wp_cron` | ✅ | Tovu has one bespoke scheduler (`publish-credentials/account-label-heal-scheduler.ts`), no general facility |
| 5 | Custom field editors | ✅ | ✅ `interface` — their flagship | `CONTENT_TYPE_FIELD_KINDS` is a closed set from `@jini-ai/cms` |
| 6 | Custom field displays | ✅ | ✅ `display` | how a field renders in a list |
| 7 | Admin dashboard panels | ✅ | ✅ `panel` | `COMPONENTS` is site-side only |
| 8 | Collection layouts | — | ✅ `layout` | alternate views of a list |
| 9 | Plugin i18n | ✅ | ✅ | plugins can't ship translations |
| 10 | Automation/flow steps | — | ✅ `operation` | `events.subscribe` is the seed, no flow builder |

### Meta-gap

| # | Gap |
|---|---|
| 11 | Two mechanisms. Trust model in one, capability breadth in the other. Neither is complete. |

### Where Tovu is ahead

| Capability | WP | Directus | Tovu |
|---|---|---|---|
| Agent-driven CMS (25 tool catalogs, permissioned, audited, revertable) | ❌ | ❌ | ✅ |
| Renders the actual site | ✅ | ❌ headless | ✅ 5 tiers |
| Sandboxed template execution | ❌ | partial | ✅ Liquid worker |
| Tiered plugin trust model | ❌ | partial | ✅ ADR-024 |

**On Directus `{{ }}`:** Directus's `{{ field }}` is a *display template* — an admin-only label
for a related record. Directus is headless and renders no public pages at all. Tovu's Liquid tier
is the Shopify-equivalent, not the Directus-equivalent, and it is strictly more capable for the
"sell products" use case. This is not a gap.

---

## 3. Recommendation — combining `plugin-runtime` and `site-glue`

**Keep `plugin-runtime`'s envelope. Adopt `site-glue`'s vocabulary.**

- **From `plugin-runtime`:** manifest + integrity hashing + tier + activation state + quarantine
  + marketplace listing. This is the trust machinery and it has no equivalent in glue.
- **From `site-glue`:** the 8-capability vocabulary and the call-site dispatch table. This is the
  extensibility model and it has no equivalent in plugin-runtime.

**Tier gates which capabilities may be requested** — this is the join that makes one system out of
two, and it reuses ADR-024's existing tier semantics rather than inventing a parallel axis:

| Tier | May request | Enforcement |
|---|---|---|
| **Tier-1** — declarative, zero code | `render.contribute` (static HTML only), `admin.nav`, content types, taxonomies | no `server/` folder in the artifact = structurally verifiable |
| **Tier-2** — sandboxed | + `hooks.attach`, `content.*`, `tools.register`, `events.subscribe` | **reuse the existing Liquid worker sandbox** |
| **Tier-3** — trusted, in-process | + `http.route.register`, arbitrary JS | install-consent screen (now load-bearing — see §4) |

`data-module` already precedents this: `data-module.ts:413` refuses Tier-1 outright because the
declaration requires executable code.

---

## 4. Owner decisions on record

- **2026-08-19 — Tier-3 IS listable in the marketplace.** Reverses ADR-024 §2
  ("Tier-3 plugins are never listable in the public marketplace"). ADR-024 needs a formal
  amendment. Consequence: the install-consent screen becomes the only user protection for
  full-access third-party code, so it has to be real, not a checkbox.
- **2026-08-19 — plugin folder layout:** `css/`, `script/`, `assets/` (assets = images/video),
  plus `hooks/`, `admin/`, `server/`, `tovu.plugin.json`.
- **2026-08-19 — hook name list is provisional.** `body.middle` added for ad slots.
  Expected to change.
- **2026-08-19 — embed marker stays `data-embed-config`.** No second `data-plugin-config`
  attribute. Plugin embeds use `{"type":"plugin","plugin":"<id>", …}`; the `plugin` key carries
  the id because `id` already means "which instance" (`marker.ts:48`).

## 5. Known unenforced

- **Signing is a string comparison, not crypto** — `src/features/plugins/plugin-identity.ts:20`
  says so in its own header. Any manifest can claim `publisher: "Microsoft"`. With Tier-3 now
  marketplace-listable, this moves from "future work" to "on the critical path."
- **`tier` is self-declared** and enforced in exactly one place (`data-module.ts:413`).
