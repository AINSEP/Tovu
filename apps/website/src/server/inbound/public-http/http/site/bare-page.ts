import { renderBareEntryDocument as renderBareEntryDocumentWithRenderers, type RenderBareEntryDocumentRequired } from "@jini-ai/cms/public-http/http/site/bare-page";
import { renderHtmlPageBody } from "./render/page-body.js";
import { renderDocNode } from "./render/content-html.js";

/**
 * @file Host binding of the bare-page document renderer (owner ruling 2026-09-23,
 * `no-template-bare-plan-2026-09-23.md` S3) — the algorithm lives in
 * `@jini-ai/cms/public-http/http/site/bare-page`; this file only supplies Tovu's own body renderers
 * (`renderHtmlPageBody` for an `"html"` Page, `renderDocNode` for a `"doc"` Page).
 */
export function renderBareEntryDocument(required: RenderBareEntryDocumentRequired, _optional = {}): string {
  return renderBareEntryDocumentWithRenderers({ ...required, renderers: { renderHtmlPageBody, renderDocNode } });
}
