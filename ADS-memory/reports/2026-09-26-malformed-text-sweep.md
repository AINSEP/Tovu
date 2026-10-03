# Malformed-text sweep — 2026-09-26

## Scope
All 41 public URLs from `https://localhost:3000/sitemap.xml` (29 pages, 6 posts, 1 home page = 41 total; matches `posts` table in `sites/tovu-dev/content.db`, kind='page'/'post', status='published'). Same 41 paths re-checked against `https://tovu.dev` (read-only GETs).

## Method
1. Fetched each page's rendered HTML (`curl -sk`).
2. Stripped `<pre>…</pre>` and `<code>…</code>` blocks (code samples are intentionally escaped).
3. Checked the remainder for:
   - `data-*config` attributes still holding escaped JSON (`&quot;` inside the attribute value) — the original embed-marker bug shape.
   - `data-embed-config` present with `"type":"widget"/"form"/"post"/"page"/"media"` in the broken escaped form (menu markers excluded by design).
   - Double-encoded entities: `&amp;lt;`, `&amp;gt;`, `&amp;quot;`, `&amp;amp;`, `&amp;#39;`.
   - Mojibake: `â€`, `Ã©`, `Ã¨`, `Â `, U+FFFD.
   - Template leaks: `{{` / `{%` outside code.
   - Literal `\n` (backslash-n) in visible text.
   - Visible literal `&lt;`/`&gt;`/`&quot;` — checked by decoding entities once (browser-equivalent single pass) and looking for residual escaped text, since a single, correctly-formed entity decodes away and only survives as literal text when double-encoded.
4. Cross-checked the same patterns directly against `content.db`'s `posts.body_html` / `posts.body_json` for every published row (41 rows), independent of rendering.

## Result: zero real hits, local or live

| URL (all 41 checked) | Pattern | Real or intended | Fixed locally | On live |
|---|---|---|---|---|
| *(none — no page matched any pattern)* | — | — | — | — |

Both the rendered-HTML scan and the raw-DB scan came back empty on every pattern, on both local and live. The `data-embed-config` fix (single-quoted attribute, unescaped JSON) is confirmed live in the actual markers — e.g. `/embeds`, `/menus`, `/collections`, `/landing-page*` all render `data-embed-config='{"type":"...",...}'` with literal, unescaped JSON, not `&quot;`-escaped.

## Near-misses investigated and ruled out (not bugs, not fixed)

- **`/embeds`, `/collections`, `/menus`, `/theme-markers`, `/plugin-api`, `/assistant-tool-catalog`, `/the-nascent-agentic-web-2`, `/sample-gold`** — raw HTML contains single-encoded `&quot;`/`&gt;`/`&#39;` inside plain body text (e.g. `&quot;agentic&quot;`, `-&gt;`). These are the *correct* way to write a literal quote/arrow in HTML text; browsers render them as `"` / `→`-style arrow, not as literal entity text. Confirmed by decoding once and checking for survivors — none found. My first-pass script flagged these before I added the single-decode check; they are false positives, not malformed text.
- **`/collections` (DB) and `/embeds` (DB)** — `body_html` contains literal `{{title}}`, `{{fields.docs_page}}`, `{{fields.summary}}`. These are documented placeholder syntax for the collection-embed `<template>` feature (self-hosting instructions on `/embeds`, live example on `/collections`). Checked the *rendered* `/collections` page: the live example resolved to real feature cards (Media, Collections, Menus, Forms, Posts) with no `{{…}}` left in the output — template substitution works, no leak.
- **`sample-post` (DB, `body_json`)** — contains `\\n` (JSON-escaped newline) inside a Python code sample string. This is normal JSON encoding of a newline inside the doc's stored text node, not a literal backslash-n. Confirmed the rendered page shows real line breaks in the `<pre><code>` block, not the text `\n`.
- **`/landing-page`, `/landing-page-2`, `/landing-sample-xai-2`** — an HTML comment (`<!-- [VIDEO PLACEHOLDER] ... -->`) contains an example marker with a literal placeholder `id="<media uuid>"`. This is inside an HTML comment, invisible to any visitor, and is an editor instruction ("swap this div in, here's the shape") — not rendered, not a bug. Same comment text repeats verbatim across all three pages, which is expected since they're variants of the same landing-page template/copy, not a code bug replicating an error.

## Backups
None taken — no fix was needed, no admin writes were made.

## Conclusion
The embed-marker escaping bug does not reproduce anywhere in the current 41 published pages/posts, locally or on the live site. No malformed text (double-encoded entities, mojibake, template leaks, literal backslash-n, or lingering escaped embed markers) was found. No code-bug pattern repeating across many pages was found either — the near-misses above are all intentional content, verified against their rendered output.
