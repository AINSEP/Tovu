import type { PostRecord } from "#src/features/post/index";
import type { ResolveHtmlPageEmbedsResult } from "#src/features/widgets/resolver-service";
import type { WidgetRenderIR } from "#src/features/widgets/types";
import { escapeHtml, renderDocNode, renderHtmlPageBody, type MediaAssetRenderMeta } from "./render.js";

/**
 * @file Bare-page document renderer (owner ruling 2026-09-23, `no-template-bare-plan-2026-09-23.md`
 * S3) — the renderer for a Page whose author explicitly picked "No template chosen"
 * (`templateChoice === ""`, `isBarePageChoice` in `features/theme/static-render.ts`). Produces ONLY
 * the Page's own HTML: no theme CSS/JS, no `data-theme`, no `site-header`/`site-footer`, no
 * site-assistant widget. The one thing this module still adds is the SEO/og head fold, via the
 * pre-built `extraHead` string the caller (`routes/site/pages.ts`'s `renderBarePage`, S4/S5) already
 * resolves through the SAME `buildExtraHead`/`foldPageHead` pipeline every other route uses — this
 * module never builds its own SEO markup, and never imports `page-head.ts` directly.
 *
 * Pure and synchronous, mirroring `render.ts`'s own "caller resolves, this renders" convention: every
 * input here is already resolved (no repo reads, no I/O), so the same post/extraHead/embeds always
 * produce the same document.
 */

/** {@link renderBareEntryDocument}'s own empty default for `widgetInlineResolved` — mirrors
 *  `render.ts`'s private `EMPTY_INLINE_RESOLVED`, which this module cannot import (not exported). */
const EMPTY_INLINE_RESOLVED: ReadonlyMap<string, WidgetRenderIR> = new Map();
/** {@link renderBareEntryDocument}'s own empty default for `mediaTransformVersions` — see
 *  {@link EMPTY_INLINE_RESOLVED}'s doc for why this is a local copy, not an import. */
const EMPTY_MEDIA_TRANSFORM_VERSIONS: ReadonlyMap<string, number> = new Map();
/** {@link renderBareEntryDocument}'s own empty default for `mediaAssetMetadata` — see
 *  {@link EMPTY_INLINE_RESOLVED}'s doc for why this is a local copy, not an import. */
const EMPTY_MEDIA_ASSET_METADATA: ReadonlyMap<string, MediaAssetRenderMeta> = new Map();

/**
 * True when `html`, after stripping a leading BOM and any run of leading whitespace/HTML comments,
 * starts with `<!doctype html` or an `<html` tag (case-insensitive). An `"html"`-format Page body
 * that matches this is a COMPLETE document the author wrote their own `<head>` for — not a fragment
 * {@link renderBareEntryDocument} should wrap. Only the PREFIX is inspected (never a scan for a
 * `<html>` tag anywhere in the string), so an ordinary fragment that merely mentions "doctype" or
 * "<html>" later in its body — e.g. in a code sample — never false-positives into passthrough.
 *
 * Exported for direct unit coverage of the detection rule without constructing a full
 * {@link renderBareEntryDocument} call for every prefix variant (BOM, comment, case).
 *
 * @complexity O(n) over `html`'s length — one linear scan stripping alternating whitespace/comment
 * runs, each consumed exactly once, plus one bounded regex test against the remaining prefix.
 */
export function isFullHtmlDocument(html: string): boolean {
  let rest = html.charCodeAt(0) === 0xfeff ? html.slice(1) : html;
  for (;;) {
    const withoutLeadingSpace = rest.replace(/^\s+/, "");
    const comment = /^<!--[\s\S]*?-->/.exec(withoutLeadingSpace);
    if (!comment) {
      rest = withoutLeadingSpace;
      break;
    }
    rest = withoutLeadingSpace.slice(comment[0].length);
  }
  return /^<!doctype html/i.test(rest) || /^<html[\s>]/i.test(rest);
}

/**
 * Wraps a fragment body in the minimal valid document a bare Page gets: doctype, charset, viewport,
 * an escaped `<title>`, and `extraHead` verbatim. The `<title>` is suppressed when `extraHead`
 * already carries one — the SEO fold's own priority-100 title element (`page-head-contributor.ts`) —
 * same suppression rule `pageShell` applies in `render.ts` (`extraHead?.includes("<title>")`), so a
 * bare page never ships two competing `<title>` tags.
 *
 * Deliberately absent, versus `pageShell`: `BASE_STYLE`, any theme font link/style, `data-theme`, the
 * `<div class="site">` wrapper, and the site-assistant widget's head/body markup. Bare means only the
 * page's own authored HTML plus the same SEO fold every other route gets — nothing else Tovu's theme
 * layer would otherwise contribute (owner ruling, plan §3).
 *
 * @complexity O(1) beyond the linear cost of concatenating its own inputs.
 */
function wrapBareFragment(required: { title: string; extraHead: string | undefined; body: string }): string {
  const foldHasTitle = required.extraHead?.includes("<title>") ?? false;
  const titleTag = foldHasTitle ? "" : `<title>${escapeHtml(required.title)}</title>`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>${titleTag}${required.extraHead ?? ""}` +
    `</head><body>${required.body}</body></html>`
  );
}

/** {@link renderBareEntryDocument}'s required input. Every optional field defaults exactly the way
 *  `render.ts`'s `buildSiteRenderContext` already defaults the same fields for `renderSite`, so a
 *  caller that only has a post/siteTitle (no widgets, no embeds) still gets a valid document. */
export interface RenderBareEntryDocumentRequired {
  post: PostRecord;
  siteTitle: string;
  /** SPEC-008 T049 — the caller's pre-built SEO/og head fold (`pages.ts`'s `buildExtraHead`), spliced
   *  in verbatim. Omitted degrades to no extra head tags, never a crash. */
  extraHead?: string;
  /** SPEC-047 Slice 2 — an `"html"`-format Page's pre-resolved `data-embed-type` targets, threaded
   *  straight into {@link renderHtmlPageBody}. Omitted degrades to every marker resolving to the
   *  REQ-28 placeholder, that function's own existing contract. */
  pageHtmlEmbeds?: ResolveHtmlPageEmbedsResult;
  /** SPEC-043/ADR-047 W-004 — a `"doc"`-format Page's pre-resolved inline widget embeds, threaded
   *  straight into {@link renderDocNode}. Omitted degrades to empty, same as that function's own
   *  default parameter. */
  widgetInlineResolved?: ReadonlyMap<string, WidgetRenderIR>;
  /** ADR-027 §4 — threaded straight into {@link renderDocNode}'s `image` case. Omitted degrades to
   *  empty (every ref-based image renders its placeholder), same as that function's own default. */
  mediaTransformVersions?: ReadonlyMap<string, number>;
  /** Owner-directed public-render sizing fix — threaded straight into {@link renderDocNode}'s `image`
   *  case. Omitted degrades to empty (no width/height/class override), same as that function's own
   *  default. */
  mediaAssetMetadata?: ReadonlyMap<string, MediaAssetRenderMeta>;
}

/**
 * Renders a bare Page (`templateChoice === ""`) to a complete HTML document. `post.bodyFormat` picks
 * the body path the same way `renderPostBody` (`render.ts`) does: `"html"` substitutes embed markers
 * via {@link renderHtmlPageBody}; anything else walks `post.bodyJson` via {@link renderDocNode}.
 * Unlike `renderPostBody`, no assigned-terms block is appended afterward — bare means only the page's
 * own authored content, and assigned terms are the theme layer's "filed under" footer (plan §3).
 *
 * An `"html"`-format body that is already a complete document ({@link isFullHtmlDocument} on the RAW
 * `post.bodyHtml`, before embed substitution) is returned through unchanged apart from embed
 * resolution: no SEO fold, no wrapping, no injected `<title>`. The author owns their own `<head>` in
 * that case — injecting would produce duplicate `<title>`/meta tags (plan §3, point 1). Detection
 * reads the RAW body rather than the embed-resolved one because embed substitution can only ever
 * replace marker elements *inside* the document, never introduce or remove the leading
 * doctype/`<html>` prefix this check inspects — so the two are equivalent for this decision, and
 * reading the raw string keeps the check independent of `pageHtmlEmbeds` being provided at all.
 *
 * @complexity O(n) over the body's length: one embed-substitution or doc-walk pass (whichever body
 * path applies), plus {@link isFullHtmlDocument}'s own O(n) scan for an `"html"`-format body.
 */
export function renderBareEntryDocument(required: RenderBareEntryDocumentRequired): string {
  const { post } = required;
  const title = `${post.title} — ${required.siteTitle}`;
  if (post.bodyFormat === "html") {
    const rawBodyHtml = post.bodyHtml ?? "";
    const resolvedBody = renderHtmlPageBody(rawBodyHtml, required.pageHtmlEmbeds);
    if (isFullHtmlDocument(rawBodyHtml)) return resolvedBody;
    return wrapBareFragment({ title, extraHead: required.extraHead, body: resolvedBody });
  }
  const body = renderDocNode(
    post.bodyJson,
    required.widgetInlineResolved ?? EMPTY_INLINE_RESOLVED,
    required.mediaTransformVersions ?? EMPTY_MEDIA_TRANSFORM_VERSIONS,
    required.mediaAssetMetadata ?? EMPTY_MEDIA_ASSET_METADATA
  );
  return wrapBareFragment({ title, extraHead: required.extraHead, body });
}
