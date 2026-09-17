import assert from "node:assert/strict";
import test from "node:test";

import type { ResolveHtmlPageEmbedsResult } from "#src/features/widgets/resolver-service";
import type { WidgetRenderIR } from "#src/features/widgets/types";
import { renderHtmlPageBody } from "../render.js";

// ---------------------------------------------------------------------------
// T5 (2026-09-16 embed-attributes plan) — `renderHtmlPageBody` forwards a "media" marker's own
// authored attributes (`EmbedOccurrence`, from `html-embeds.ts`'s T4) onto the rendered `<video>`/
// `<img>` tag, and a marker `controls="false"` attribute turns off the default `controls` attribute.
// Owner override (2026-09-16, applied by the previous writer, T4): controls-off is an HTML ATTRIBUTE
// on the marker (`controls="false"`), never a JSON config key — there is no `"controls":false` JSON
// option anywhere in this codebase. `resolveMarkerControls` (`html-embeds.ts`) strips any
// `"controls"`-named entry out of `EmbedOccurrence.elementAttributes` unconditionally, so
// `render.ts`'s merge helper never sees one there — it renders `occurrence.controls` as a bare
// `controls`/nothing, never a raw forwarded attribute of that name (see that function's own doc).
//
// `resolved` is a plain type -> key -> IR map here, matching how every other `renderHtmlPageBody`
// test in `render.test.ts` builds one directly rather than going through a real resolver.
// ---------------------------------------------------------------------------

function resolvedMap(type: string, key: string, ir: WidgetRenderIR): ResolveHtmlPageEmbedsResult {
  return new Map([[type, new Map([[key, ir]])]]);
}

const VIDEO_IR: WidgetRenderIR = {
  componentId: "media-image",
  props: { assetId: "asset-1", contentType: "video/mp4", alt: "", width: null, height: null, cssClass: null },
};

const NO_SUPPORT_FALLBACK = "Your browser does not support the video tag.";

test("renderHtmlPageBody: autoplay muted loop playsinline on a media wrapper land on the rendered <video>, the wrapper keeps its class", () => {
  const html = `<div class="xai-video" data-embed-config='{"type":"media","id":"asset-1"}' autoplay muted loop playsinline></div>`;
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", VIDEO_IR));
  assert.equal(
    out,
    `<div class="xai-video"><video src="/m/asset-1/original" controls autoplay muted loop playsinline>${NO_SUPPORT_FALLBACK}</video></div>`
  );
});

test('renderHtmlPageBody: a marker controls="false" attribute removes the default controls attribute', () => {
  const html = `<div class="probe" data-embed-config='{"type":"media","id":"asset-1"}' controls="false"></div>`;
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", VIDEO_IR));
  assert.equal(out, `<div class="probe"><video src="/m/asset-1/original">${NO_SUPPORT_FALLBACK}</video></div>`);
});

test("renderHtmlPageBody: a bare marker controls attribute keeps controls on", () => {
  const html = `<div data-embed-config='{"type":"media","id":"asset-1"}' controls></div>`;
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", VIDEO_IR));
  assert.equal(out, `<div><video src="/m/asset-1/original" controls>${NO_SUPPORT_FALLBACK}</video></div>`);
});

test("renderHtmlPageBody: a <video> marker collapses — class, id, style and autoplay all land on the one rendered <video>", () => {
  const html = `<video data-embed-config='{"type":"media","id":"asset-1"}' class="hero" id="v1" style="max-width:600px" autoplay></video>`;
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", VIDEO_IR));
  assert.equal(
    out,
    `<video src="/m/asset-1/original" controls class="hero" id="v1" style="max-width:600px" autoplay>${NO_SUPPORT_FALLBACK}</video>`
  );
});

test("renderHtmlPageBody: marker class is appended after the asset cssClass, never replacing it", () => {
  const html = `<img data-embed-config='{"type":"media","id":"asset-1"}' class="hero wide"></img>`;
  const ir: WidgetRenderIR = {
    componentId: "media-image",
    props: { assetId: "asset-1", transformName: "public", version: 3, alt: "A photo", width: null, height: null, cssClass: "rounded" },
  };
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", ir));
  assert.equal(out, `<img src="/m/asset-1/public.v3/image.jpg" alt="A photo" class="rounded hero wide" loading="lazy">`);
});

test("renderHtmlPageBody: a marker attribute beats the asset htmlAttributes value of the same name", () => {
  const html = `<img data-embed-config='{"type":"media","id":"asset-1"}' loading="eager"></img>`;
  const ir: WidgetRenderIR = {
    componentId: "media-image",
    props: {
      assetId: "asset-1",
      transformName: "public",
      version: 3,
      alt: "",
      width: null,
      height: null,
      cssClass: null,
      htmlAttributes: 'loading="lazy"',
    },
  };
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", ir));
  assert.equal(out, `<img src="/m/asset-1/public.v3/image.jpg" alt="" loading="eager">`);
  assert.equal((out.match(/loading=/g) ?? []).length, 1, "loading must appear exactly once, not twice");
});

test("renderHtmlPageBody: author src and srcset never override the resolved asset URL", () => {
  const html = `<img data-embed-config='{"type":"media","id":"asset-1"}' src="https://evil.example/x.jpg" srcset="https://evil.example/x.jpg 2x"></img>`;
  const ir: WidgetRenderIR = {
    componentId: "media-image",
    props: { assetId: "asset-1", transformName: "public", version: 3, alt: "", width: null, height: null, cssClass: null },
  };
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", ir));
  assert.ok(out.includes('src="/m/asset-1/public.v3/image.jpg"'), "the resolved asset URL must be the img's src");
  assert.ok(!out.includes("evil.example"), "the author-supplied src/srcset must never reach the output");
  assert.doesNotMatch(out, /srcset/, "srcset is renderer-owned (D3) — dropped, not merely overridden");
});

test("renderHtmlPageBody: marker values are source text — &amp; is not double-escaped", () => {
  const html = `<img data-embed-config='{"type":"media","id":"asset-1"}' title="a &amp; b"></img>`;
  const ir: WidgetRenderIR = {
    componentId: "media-image",
    props: { assetId: "asset-1", transformName: "public", version: 3, alt: "", width: null, height: null, cssClass: null },
  };
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", ir));
  assert.ok(out.includes('title="a &amp; b"'), "the marker's own &amp; must survive unchanged");
  assert.ok(!out.includes("&amp;amp;"), "a source-text &amp; must never be re-escaped into &amp;amp;");
});

test("renderHtmlPageBody: an asset htmlAttributes value with on* is still dropped by the allowlist even when the marker forwards attributes", () => {
  const html = `<img data-embed-config='{"type":"media","id":"asset-1"}' data-foo="bar"></img>`;
  const ir: WidgetRenderIR = {
    componentId: "media-image",
    props: {
      assetId: "asset-1",
      transformName: "public",
      version: 3,
      alt: "x",
      width: null,
      height: null,
      cssClass: null,
      htmlAttributes: 'onerror="alert(1)"',
    },
  };
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", ir));
  assert.doesNotMatch(out, /onerror/i, "the asset-level allowlist must still fail closed");
  assert.doesNotMatch(out, /alert\(1\)/, "the rejected payload must never reach the rendered page");
  assert.ok(out.includes('data-foo="bar"'), "a marker attribute must still land even though the asset's own value was rejected");
});

test("renderHtmlPageBody: a media embed with no marker attributes renders byte-identical to before", () => {
  const html = `<div data-embed-config='{"type":"media","id":"asset-1","variant":"public"}'></div>`;
  const ir: WidgetRenderIR = {
    componentId: "media-image",
    props: { assetId: "asset-1", transformName: "public", version: 3, alt: "A photo", width: 640, height: 480, cssClass: "rounded" },
  };
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", ir));
  assert.equal(out, `<div><img src="/m/asset-1/public.v3/image.jpg" alt="A photo" width="640" height="480" class="rounded" loading="lazy"></div>`);
});

test("renderHtmlPageBody: the same asset embedded twice with different attributes renders each occurrence with its own attributes", () => {
  const html =
    `<img data-embed-config='{"type":"media","id":"asset-1"}' class="a"></img>` +
    `<img data-embed-config='{"type":"media","id":"asset-1"}' class="b"></img>`;
  const ir: WidgetRenderIR = {
    componentId: "media-image",
    props: { assetId: "asset-1", transformName: "public", version: 1, alt: "", width: null, height: null, cssClass: null },
  };
  const out = renderHtmlPageBody(html, resolvedMap("media", "asset-1", ir));
  assert.equal(
    out,
    `<img src="/m/asset-1/public.v1/image.jpg" alt="" class="a" loading="lazy">` +
      `<img src="/m/asset-1/public.v1/image.jpg" alt="" class="b" loading="lazy">`
  );
});
