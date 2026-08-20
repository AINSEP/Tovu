# `PLUGIN_SAFE_COMPONENT_IDS` Audit — Per-Renderer Verdicts

- **Date:** 2026-08-20
- **Author:** Security agent (dispatched, `general-work` branch, read-only)
- **Trigger:** `ADS-memory/reports/architecture/2026-08-20-call-site-payload-schemas.md`'s Open Question
  1 — `render.contribute`'s `componentId` field needs a closed, host-published set of
  `WIDGET_IR_RENDERERS` keys safe to hand arbitrary plugin-declared `props`/`children` to. That report's
  author explicitly did not audit each renderer body. This report does.
- **Method:** read every function reachable from `WIDGET_IR_RENDERERS` (`src/server/http/site/render.ts`)
  to a fixed point, against the threat model: *a third party controls `ir.props` and `ir.children`
  entirely — no plugin code runs, but the JSON is theirs*. All line numbers below were re-verified
  against the file's content as read during this session (`src/server/http/site/render.ts` was not
  concurrently modified in the region I cite — re-`grep` before trusting any number if it has since
  changed).
- **Scope boundary honored:** `COMPONENTS` (the `Component` table at `render.ts:1072`) is out of scope
  per `2026-08-20-component-catalog-split-proposal.md`'s settled decision — plugins attach to the
  widget-type registry only. I confirmed no `WIDGET_IR_RENDERERS` entry delegates into `COMPONENTS`
  (checked every renderer body below; none call `siteHeader`/`entryList`/etc.), so that carve-out needed
  no further work.

## Result summary

**0 SAFE (clean) / 4 SAFE WITH CLAMPS / 4 UNSAFE FOR PLUGIN PROPS**, of 8 total `WIDGET_IR_RENDERERS`
entries. Every renderer that reaches a shared helper inherits that helper's verdict — I did not
double-count the same root cause as N independent findings, but I did apply it to every renderer that
reaches it.

## Root-cause finding (drives 3 of the 4 UNSAFE verdicts): `safeHref` accepts protocol-relative URLs

`safeHref` (`src/server/http/site/render.ts:172-178`):

```ts
function safeHref(value: JsonValue | undefined): string {
  if (typeof value !== "string") return "#";
  const href = value.trim();
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  return "#";
}
```

The function's own doc comment (`render.ts:166-171`) claims it allows only "in-page (`#…`), same-origin
relative (`/…`), `http(s)://`, and `mailto:` targets." **That claim is false for one input shape**:
`"//evil.example/phish"` — a protocol-relative URL. `"//evil.example/phish".startsWith("/")` is `true`
(the check tests for a single leading `/`, not "not followed by a second `/`"), so line 175 returns it
**unchanged**. A browser resolves `href="//evil.example/phish"` against the current page's own scheme
(`https://evil.example/phish`) — this is not same-origin, it is an attacker-chosen external host,
indistinguishable in the rendered page from a real on-site link.

This is not code execution — `javascript:` and `data:` remain correctly rejected (neither starts with
`/`, `#`, `http(s)://`, or `mailto:`). It is an **open-redirect / link-spoofing** primitive: a plugin
can make a widget's link silently point anywhere, styled and positioned as if it were host-authored
navigation. This is exactly the check the dispatch's item 2 named explicitly ("does it cover…
protocol-relative URLs?") — it does not.

**This is not a plugin-only bug.** `safeHref` is also called by `renderLinkMark`
(`render.ts:419-421`), the TipTap `link`-mark renderer used by every ordinary post/page body today.
Fixing it fixes all three call sites listed below at once — this is one finding, not three, and the fix
belongs in `safeHref` itself, not in each caller.

**Required fix to admit any renderer that reaches `safeHref`:** reject a value whose trimmed form starts
with `//` before the existing `startsWith("/")` branch, e.g. `if (href.startsWith("//")) return "#";`
placed before line 175's check.

By contrast, `safeImageSrc` (`render.ts:257-270`) does **not** have this gap — it requires
`/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(src)` (`render.ts:260`), which a bare `//host` string fails (no
`https?://` prefix), so `media-image`'s image path is unaffected.

## Second cross-cutting finding: no recursion-depth clamp on `WIDGET_IR_RENDERERS`-side recursion

`src/widgets/registry.ts`'s `clamps` (`maxItems`/`timeoutMs`) are enforced only around a **resolver
call** (Tier-2/3 `query`-capability types), before a `WidgetRenderIR` is produced. Nothing in
`render.ts` enforces any bound once `ir.children` or a JSON array inside `ir.props` exists — the render
functions themselves recurse with no counter. `renderDocNode` is the one exception: it has its own
`depth` parameter and `MAX_RENDER_DEPTH = 200` (`render.ts:661`, checked at `render.ts:1054`),
empirically tuned against a real V8 stack-overflow boundary (measured ~500-562 frames, `render.ts:629-660`'s
own doc). **Two other recursive renderers have no equivalent check at all**:

- `renderWidgetMenuItems` (`render.ts:1428-1443`) calls itself on `arr(o.children)` (line 1438-1439)
  with no depth parameter and no base case besides an empty array — a plugin-supplied `menu` widget's
  `props.items` can nest `children` arbitrarily deep and drive this to a `RangeError: Maximum call stack
  size exceeded`.
- `renderWidgetRecentEntries` (`render.ts:1420-1423`) maps `children` through `renderWidgetIr` (line
  1421) with no depth parameter either — a `recent-entries` IR whose `children` nest self-referencing
  `recent-entries` (or any other componentId) entries arbitrarily deep hits the same crash class.

Effect: a single malicious `render.contribute` payload can force an uncaught synchronous `RangeError`
inside whatever HTTP request is rendering that page — a per-request DoS (Express's synchronous-throw
handling turns it into a 500, not a process crash, but every visitor hitting that widget gets a broken
page). This is precisely the "unbounded recursion via `children`" class the dispatch's item 4 asked
about, and it is currently unguarded.

## Per-renderer verdicts

| `componentId` | Verdict | Evidence |
|---|---|---|
| `text` | **SAFE** | `render.ts:1700` — `escapeHtml(str(ir.props.body))`, no href/attribute surface, no recursion. Full escaping, nothing else reachable. |
| `social-links` | **UNSAFE FOR PLUGIN PROPS** | `renderWidgetSocialLinks` (`render.ts:1403-1412`) line 1408: `href="${escapeHtml(safeHref(o.url))}"` — inherits the `safeHref` protocol-relative bypass above. `platform` text is properly escaped; the only gap is the href. |
| `recent-entries` | **UNSAFE FOR PLUGIN PROPS** | `renderWidgetRecentEntries` (`render.ts:1420-1423`) recurses through `renderWidgetIr` over attacker-controlled `children` with no depth bound (see cross-cutting finding above). No escaping gap of its own — the finding is purely structural/DoS. |
| `entry-summary` | **UNSAFE FOR PLUGIN PROPS** | `renderWidgetEntrySummary` (`render.ts:1414-1418`) line 1417: `href="/${escapeHtml(slug)}"` — does not go through `safeHref` at all, just a literal `/` prefix + escape. `escapeHtml` does not touch `/`, so `props.slug = "/evil.example"` renders `href="//evil.example"` — same protocol-relative bypass as above, reached by an even more direct path (no allowlist function involved at all). `title` is properly escaped. |
| `menu` | **UNSAFE FOR PLUGIN PROPS** | `renderWidgetMenuItems` (`render.ts:1428-1443`): line 1436 `href="${escapeHtml(safeHref(o.href))}"` inherits the `safeHref` bypass, **and** line 1438-1439's self-recursion on `o.children` has no depth bound (second, independent finding — see cross-cutting finding above). Two separate defects, either sufficient alone for this verdict. |
| `contact-form` | **SAFE** | `renderWidgetContactForm`/`renderContactFormField`/`renderExtraFieldAttrs` (`render.ts:1460-1511`). Attribute **names** from `o.attributes` are checked against `ATTRIBUTE_NAME_PATTERN` (`src/forms/forms.ts:48-49`) before being emitted — confirmed this is a real closed allowlist (`aria-*`, `data-*`, `placeholder`, `autocomplete`, `inputmode`, `pattern`, `title`, `min`, `max`, `step`, `minlength`, `spellcheck`, `readonly` only), and `forms.ts:36-46`'s own comment confirms it deliberately excludes `^on`, `style`, `formaction`, `href`, `src`, `srcdoc`, `id`, `name`, `type` — the exact set that would make an attribute NAME itself dangerous. Attribute values and labels are `escapeHtml`'d (`render.ts:1462`, `:1468`, `:1493-1494`). `slug` reaches `action="/forms/${escapeHtml(slug)}/submit"` (`render.ts:1510`) — a fixed `/forms/` prefix, so no scheme/host injection is possible regardless of `slug`'s content (relative-path traversal via `../` stays same-origin). No recursion. |
| `media-image` | **SAFE** | `renderWidgetMediaImage` (`render.ts:1534-1551`) requires `typeof assetId/transformName === "string"` and `isPlausibleMediaRefId` (`render.ts:480-481`, `^[^\s/]+$`, ≤200 chars) on both before calling `renderImageTag` (`render.ts:502-517`), which builds `src` from `encodeURIComponent`-wrapped segments plus a numeric `version`, then `escapeHtml`s the whole assembled `src` again (`render.ts:511,516`) — double-gated. `width`/`height` are `typeof === "number"` checked in the caller (`render.ts:1547-1548`), so they can't carry a string payload; `cssClass` is `escapeHtml`'d (`render.ts:515`). No href/scheme surface at all — this path never reads a plugin-supplied URL, only an id it looks up server-side. No recursion. |
| `post-content` | **SAFE WITH CLAMPS** | `renderWidgetPostContent` (`render.ts:1668-1691`) delegates to `renderDocNode`/`renderNodes` (`render.ts:1039-1059`, `672-682`), the full TipTap-doc walker. Traced every `DOC_NODE_HANDLERS` entry (`render.ts:996-1019`): `image` uses `safeImageSrc` (not `safeHref` — unaffected by the bypass above, confirmed `render.ts:900-915`); `youtube` extracts a video id via a closed regex against known host patterns (`render.ts:917-932`, `365-372`) rather than trusting a raw URL; `mention` validates against `SLUG_FORMAT_PATTERN`/`MAX_SLUG_LENGTH`, not `safeHref` (`render.ts:934-963`); `codeBlock`'s language is allowlisted (`render.ts:341-345`, `805-815`); table `colspan`/`rowspan` are bounds-checked 1-1000 (`render.ts:616-625`); text styling (color/font/length) all go through dedicated CSS-value allowlists (`render.ts:257-326` region, applied at `388-417`) before ever reaching a `style=""` attribute; recursion has a real, empirically-derived depth bound (`MAX_RENDER_DEPTH = 200`, `render.ts:661`, checked at `render.ts:1054`). **The one gap is the `link` mark** (`renderLinkMark`, `render.ts:419-421`), which *does* call `safeHref` and so *does* inherit the protocol-relative bypass — meaning `post-content` needs the same `safeHref` fix as `social-links`/`menu` before it's clean. Separately, unlike `renderDocNode`'s depth bound, there is **no breadth/node-count clamp** anywhere on `bodyJson` for this call path — the file's own comment (`render.ts:654-659`) discloses this was "considered and deliberately deferred" for the trusted-author case (100k siblings survive in ~250-650ms); that tradeoff was made for admin-authored `bodyJson`, not for a third party's. Given this is by far the largest, most complex renderer in the table (900+ lines of reachable code, with a documented history of two prior real vulnerabilities in this exact file — the admin-media-URL leak and the dot-segment bypass noted at `render.ts:214-254`), I am not willing to call it a clean `SAFE` even once `safeHref` is fixed: it needs an explicit node-count/size budget analogous to `clamps.maxItems` before a plugin should be allowed to hand it an unbounded document. |

## What would have to change to admit each excluded/clamped renderer

- **`social-links`, `menu`, `post-content`:** fix `safeHref` (`render.ts:172-178`) to reject any value
  whose trimmed form starts with `//`, before the `startsWith("/")` branch. One fix, three renderers
  unblocked (plus it fixes existing non-plugin post content, which has carried this bug all along).
- **`entry-summary`:** same root fix is insufficient here since this renderer never calls `safeHref` —
  either route `href="/${escapeHtml(slug)}"` through `safeHref`-equivalent validation, or validate
  `slug` against the real slug format (`SLUG_FORMAT_PATTERN`/`MAX_SLUG_LENGTH`, already imported into
  this file at `render.ts:2` and used at `render.ts:959`) before interpolating it, so a value starting
  with `/` can never reach the `href` attribute.
- **`menu`:** additionally needs a depth counter threaded through `renderWidgetMenuItems`
  (`render.ts:1428`), mirroring `renderDocNode`'s `depth`/`MAX_RENDER_DEPTH` pattern, with a
  placeholder/truncation return once exceeded (never a throw).
- **`recent-entries`:** needs the same depth counter threaded through `renderWidgetIr`
  (`render.ts:1721-1724`) itself (not just this one caller), since `children` recursion is reachable
  from any future componentId that recurses, not only this one.
- **`post-content`:** needs (1) the `safeHref` fix above, and (2) an explicit size/node-count budget on
  `props.bodyJson` enforced before it reaches `renderDocNode` — e.g. a total-node-count walk capped at
  a constant analogous to `WidgetTypeRegistration.clamps.maxItems`, rejected (placeholder, not a throw)
  before render rather than only bounded by depth.

## Proposed `PLUGIN_SAFE_COMPONENT_IDS` (as of this audit, before any fix lands)

```ts
const PLUGIN_SAFE_COMPONENT_IDS: ReadonlySet<string> = new Set(["text", "contact-form", "media-image"]);
```

Only these three have zero open findings against the threat model. `social-links`, `entry-summary`,
`menu`, `recent-entries`, and `post-content` should **not** be added until their respective fixes above
land — at which point `entry-summary`, `social-links`, `media-image` stay/become clean `SAFE`, and
`menu`/`recent-entries`/`post-content` become admissible once their clamps are in place (still worth a
second, narrower re-check of just the new clamp code before shipping, not a full re-audit).

## Confidence / residual gaps

- I traced every `DOC_NODE_HANDLERS` entry and every `MARK_RENDERERS` entry reachable from
  `post-content` to a concrete escaping or allowlist decision — nothing in that path was left unproven.
  The one thing I did **not** do is execute a live request against a running server (this dispatch was
  read-only, no server was started) — all findings are from static trace, consistent with how this
  file's own prior security fixes (`render.ts:214-254`) describe their own methodology.
- I did not attempt to enumerate every possible `JsonValue` shape Zod/JSON-Schema validation at the
  `configSchema` layer might reject before a value ever reaches these renderers — this audit assumes
  the worst case named in the dispatch (`ir.props`/`ir.children` fully attacker-controlled at the
  renderer boundary), which is the correct assumption for a renderer-level allowlist that must remain
  correct independent of whatever validates upstream.
