# Media embed "unresolved" warning — diagnosis

Symptom: `[widgets] resolveHtmlPageEmbeds: unresolved "media" reference — missing or invalid
"id"/"variant" in data-embed-config` for workspace `workspace-local`.

## 1. Offending rows

Table: `posts` (SQLite `sites/tovu-com/content.db`, opened read-only). Six rows, all
`workspace_id = 'workspace-local'`, `kind = 'page'`, `body_format = 'html'`, each containing the
literal, non-UUID id `"<media uuid>"` inside their `body_html`:

| id | slug | status |
|---|---|---|
| `4f220108-5113-415a-a264-e787d13d2ec4` | `/` (site root) | **published** |
| `7de9b443-10a1-4baa-8277-d88a05d4e52b` | `landing-b2` | **published** |
| `d9af0e71-d56d-4134-9f7b-db0f91f51bbd` | `landing-page` | **published** |
| `dbf8bd38-209a-4092-80c4-ee15e5bac645` | `landing-a1` | draft |
| `a4fb989d-a36f-430a-9b69-c34d17356f85` | `landing-a2` | draft |
| `66777b30-3872-4090-ba7f-4ffe89c08929` | `landing-b1` | draft |

Three are published, including the site root (`/`) — so this fires on real visitor renders, not
just previews. Two other `body_format='html'` rows also contain a `media` marker with a genuine
UUID id (`80ec431a…` "Testing Page", `adaca1fa…` "Untitled") and are **not** part of this bug.

The literal `data-embed-config` text in each offending row:

```
'{"type":"media","id":"<media uuid>"}'
```

(`4f220108…` and `d9af0e71…` use `class="xai-video"`; the other four use no class or
`lp-video-media`/`lq-video-media` — cosmetic only, config payload is identical.)

**Critical detail: this text is not live markup.** In every one of the six rows it sits inside an
inert container:

- `4f220108…` and `d9af0e71…`: inside a genuine HTML comment in the document body —
  `<!-- [VIDEO PLACEHOLDER] Swap the <div class="xai-ph-frame"> below for the wrapper-div marker
  form: <div class="xai-video" data-embed-config='{"type":"media","id":"<media
  uuid>"}'></div> Wrapper-div only. A self-closing <video/> marker never resolves, and a marker
  authored directly on a <video> tag drops its attributes. -->`
- `dbf8bd38…`, `a4fb989d…`, `66777b30…`, `7de9b443…`: inside a `<style>` block's CSS `/* … */`
  header comment near the top of `body_html` — e.g. `/* ... VIDEO SLOT. <figure class="lp-video">
  holds <div class="lp-video-frame">, the honest placeholder. To ship the real clip, replace that
  one div with the wrapper-div marker form <div class="lp-video-media"
  data-embed-config='{"type":"media","id":"<media uuid>"}'></div> ... */`

These are authoring notes explaining to a future editor (human or agent) how to wire up a real
video once one is available — `<media uuid>` is a deliberately human-readable placeholder for
"paste the real asset id here," not a broken real reference. A browser never parses any of this as
an element (HTML comment / `<style>` raw-text content), so nothing is visibly broken on any of
these pages.

## 2. Verdict: **code problem** in the marker scanner, not (primarily) bad data

Root cause: `scanEmbedMarkers`/`MARKER_PATTERN` in
`apps/website/src/contracts/core/embeds/marker.ts:108`:

```ts
const MARKER_PATTERN = /<([a-z]+)((?:\s+[^>]*?)?\sdata-embed-config='([^']*)'(?:\s+[^>]*?)?)\s*>([\s\S]*?)<\/\1>/gi;
```

This is a plain regex scan over the raw HTML string with **no awareness of HTML comments
(`<!-- … -->`) or raw-text elements (`<style>`, `<script>`)**. `resolveHtmlEmbedsForRender`
(`apps/website/src/server/inbound/public-http/routes/site/pages.ts:312`) passes `post.bodyHtml`
straight through unmodified to `resolveHtmlPageEmbeds` → `scanHtmlEmbeds(input.html)` — no
comment-stripping or `<style>`/`<script>` exclusion happens anywhere upstream. Because the
authoring note in each of these six rows happens to be syntactically well-formed (`<div
data-embed-config='...'>...</div>`, correctly matched open/close tags), the regex matches it as if
it were a live marker regardless of the surrounding `<!-- -->` or `<style>` wrapper.

Once matched, `resolver-service.ts`'s `parseMediaEmbedRef`
(`apps/website/src/features/widgets/resolver-service.ts:540-554`) correctly rejects it — the id
`"<media uuid>"` contains a literal space, so it fails `isPlausibleMediaRefId`'s
`/^[^\s/]+$/` check (line 483-486) — and logs exactly the warning in the bug report. The resolver
is doing the right thing with what it was handed; the defect is one layer up, in what got handed to
it.

Net effect: the warning is spurious noise with no visible page breakage (the marker is left "as
authored" per `substituteMarkers`'s own contract, so the comment/style text round-trips unchanged),
but it fires on every render of three published pages including the site root, and will fire again
for any future author who leaves a similar inline authoring note near an embed marker — which the
note itself (correctly) encourages by demonstrating the wrapper-div marker syntax inline.

### Checking the two "known context" assumptions from the dispatch

- **"An embed marker substitutes the WHOLE element, not just its inner content."** — Not accurate
  for `media` as of 2026-08-24. `html-embeds.ts`'s `WRAPPER_PRESERVING_EMBED_TYPES` (`media`,
  `post`, `content`) splice the resolved output *inside* the marker's own tag/attrs
  (`spliceWrapperPreservingReplacement`, `html-embeds.ts:415-421`), preserving the author's wrapper
  — only `widget` (and any type this stage doesn't own) is whole-element replace. Not the cause
  here regardless, since these refs never resolve at all.
- **"A self-closing marker never resolves."** — Confirmed true: `MARKER_PATTERN` requires a
  backreferenced closing tag (`<\/\1>`), so a genuinely self-closing `<div .../>` marker never
  matches and is silently invisible to the scanner (no warning at all). Also not the cause here —
  every offending snippet has an explicit `</div>`, which is exactly why the regex *does* match it
  despite living inside a comment/`<style>` block.

Neither named hazard is what's happening. The actual defect is a third thing: the scanner doesn't
respect comment/raw-text boundaries.

## 3. Recommended fix

In `apps/website/src/contracts/core/embeds/marker.ts`, strip HTML comments and the raw-text
content of `<style>`/`<script>` elements from the string before running `MARKER_PATTERN` over it
(or otherwise make the scan comment/raw-text-aware), so `scanEmbedMarkers` never treats an inert
authoring note as a live reference. This is a shared parser (`html-embeds.ts`,
`entry-refs/extractor.ts`, `static-render.ts` menu/partial markers all route through it), so the
fix benefits every consumer, not just the media resolver.

**Required RED regression test before any fix**, in
`apps/website/src/contracts/core/embeds/__tests__/marker.unit.test.ts` (or the sibling
`.canary.test.ts`):

- Assert `scanEmbedMarkers(html).markers` is **empty** for an `html` fixture containing a
  syntactically well-formed `data-embed-config` marker (open + matching close tag) placed inside an
  HTML comment (`<!-- ... <div data-embed-config='{"type":"media","id":"x"}'></div> ... -->`) —
  mirrors the `4f220108…`/`d9af0e71…` shape.
  - `beacon: markers.length === 0` (or `.length` unchanged from a control fixture with the same
    comment but no marker inside it).
- Same assertion for a marker embedded inside a `<style>...</style>` block's CSS `/* ... */`
  comment — mirrors the `dbf8bd38…`/`a4fb989d…`/`66777b30…`/`7de9b443…` shape.
- Both fixtures currently make the scanner return exactly one marker each — this is what makes the
  test genuinely RED against current code, not a vacuous pass.
- A live-marker control case (an uncommented `data-embed-config` marker elsewhere in the same fixture
  string) must still be found — the fix must not blind the scanner to markers outside comments/raw
  text.

Optionally, a behavior-level test at `resolveHtmlPageEmbeds` (`resolver-service.ts`) asserting
`console.warn` is **not** called with the `unresolved "media" reference` message for a `body_html`
fixture matching one of the six DB rows' actual shape would pin the observable symptom directly,
but the marker-level test above is the minimal RED case and the right place to fix it.

## 4. Not touched

- Did not modify `apps/website/src/features/widgets/resolver-service.ts` or any other source file
  (read-only per dispatch constraints; that file is also flagged as reserved for another task).
- Did not run `tovu serve`, any `serve-command*.integration.test.ts`, or open the DB through the
  app's normal (migrating) path — all queries above used `sqlite3 "file:...?mode=ro"` against
  `sites/tovu-com/content.db`.
