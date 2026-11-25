import type { SiteRenderContext } from "@jini-ai/cms/public-http/http/site/render-context";
import type { JsonObject } from "@jini-ai/core/primitives";
import { siteHeader, siteFooter, siteNav, siteFooterRich } from "@jini-ai/cms/public-http/http/site/render/components/layout";
import { entryList } from "./entry-lists.js";
import { entryContent } from "../post-body.js";
import { hero, section, featureGrid, announcement, ctaBand } from "@jini-ai/cms/public-http/http/site/render/components/marketing";
import { mediaPlaceholder } from "@jini-ai/cms/public-http/http/site/render/media-placeholder";
import { TOVU_DOC_RENDER_CLASSES } from "#src/server/runtime/composition/doc-render-host";

// ---------------------------------------------------------------------------
// Core component registry (v1) — the safe building blocks a theme references.
// A theme can arrange these by id; it cannot define new ones. This table has no schema,
// capability tier, or isolation boundary (each `Component` runs synchronously, in-render, with
// no timeout), so it stays closed to plugins. A future plugin-contributed component goes through
// the widget-type registry instead (`WidgetTypeKey`/`CORE_RESOLVERS`, `Jini/packages/cms/src/widgets/registry.ts`),
// which already has schema validation, tier gating, and a try/catch+timeout isolation boundary —
// see the Widget IR rendering block below for that seam's own dispatch (ADR-047; ratified by
// `ADS-memory/reports/architecture/2026-08-20-component-catalog-split-proposal.md`).
// ---------------------------------------------------------------------------

type Component = (ctx: SiteRenderContext, props: JsonObject) => string;

/** Exported for `liquid-worker.ts`: the `render_block` Liquid tag (registered on the isolated worker's own engine) resolves against this same registry, so a Liquid theme and a declarative theme render identical output for the same component id. */
export const COMPONENTS: Record<string, Component> = {
  "tovu/site-header": siteHeader,
  "tovu/entry-list": entryList,
  "tovu/entry-content": entryContent,
  "tovu/site-footer": (ctx) => siteFooter(ctx, { creditText: "powered by Tovu" }),
  "tovu/hero": (_ctx, props) => hero({ props, mediaPlaceholderClasses: TOVU_DOC_RENDER_CLASSES.mediaPlaceholder }),
  "tovu/section": (_ctx, props) => section({ props, mediaPlaceholderClasses: TOVU_DOC_RENDER_CLASSES.mediaPlaceholder }),
  "tovu/feature-grid": (_ctx, props) => featureGrid({ props }),
  "tovu/media-placeholder": (_ctx, props) => mediaPlaceholder({ props, classes: TOVU_DOC_RENDER_CLASSES.mediaPlaceholder }),
  "tovu/announcement": (_ctx, props) => announcement({ props }),
  "tovu/nav": siteNav,
  "tovu/cta": (_ctx, props) => ctaBand({ props }),
  "tovu/footer": siteFooterRich,
};
