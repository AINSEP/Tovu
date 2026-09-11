# The apiVersion-2 static-tier shape, condensed

Every fact below was checked directly against `apps/website/src/features/theme/theme.ts`,
`theme-layout.ts`, and `static-asset-contract.ts` (not copied from a doc's prose) as of
2026-09-10. Re-verify against current `HEAD` before trusting a line number; the shape itself
(field names, path names) is stable across the recent v1→v2 migration and unlikely to move.

## Required files (the only ones `loadTheme()` refuses to start without)

```
theme.json
tokens.json
render/pages/index.html
```

Everything else below is convention or optional.

## Directory layout (v2 — `resolveThemeLayout()`, `theme-layout.ts`)

```
<theme-id>/
  theme.json
  tokens.json
  tokens.light.json        # optional — :root[data-theme="light"] override block
  css/
    theme.css               # the theme's own stylesheet, linked as href="../css/theme.css"
    vendor/<lib>.css         # convention for a vendored third-party stylesheet, not enforced
  scripts/
    <name>.js
    vendor/<lib>.js          # convention, e.g. basic's scripts/vendor/kuinetic.all.js
  render/
    pages/*.html             # one file per route; index.html is required
    partials/*.html           # nav/footer/etc. fragments, referenced by theme.json's `slots`
  assets/                    # images, video, fonts — theme's own, convention not enforced
  icons/                     # favicons/PWA icons — convention
  screenshots/               # theme-picker preview images — convention
  manifest.webmanifest       # PWA manifest — convention
  NOTICE.md                  # provenance/decisions doc — convention, see basic's own
```

v1 (legacy, still fully supported — `apiVersion` absent or not `2`): `pages/` at theme root
(not `render/pages/`), `nav.html`/`footer*.html` at theme root (not `render/partials/`),
`css/styles.css` (not `css/theme.css`), `js/` (not `scripts/`). Do not mix the two — a theme
declares one `apiVersion` and gets exactly one of these two layouts throughout.

## theme.json fields that matter for a static-tier conversion

| Field | Required | Notes |
|---|---|---|
| `id` | yes (or defaults to folder name) | Must equal the folder name or the theme fails to validate. |
| `apiVersion` | no, but write `2` | Selects the v2 layout above. Omit only for a deliberate v1 theme. |
| `tier` | no, but write `"static"` | Anything else routes through an entirely different renderer. |
| `modes` | no | e.g. `["light","dark"]` — names, nothing more; see the tokens section below. |
| `defaultMode` | no | Which of `modes` a freshly-served page starts in (`data-theme` on `<html>`). Must be a value actually listed in `modes`, or the theme fails to load. |
| `slots` | no (defaults to a legacy `nav`/`footer` pair) | `{ "<key>": { "source": "<file>.html", "honorsCurrentPage"?: true, "variants"?: {...} } }`. Use `honorsCurrentPage`, not the legacy `activeAttr` string — both are accepted but only the boolean is current. |
| `templates` | no | Filenames a Post/Page's `templateChoice` can pick between. Only relevant if this theme should support CMS content rendering through it — a pure asset/marketing-page port usually doesn't need this at all. |
| `publishedPages` | **yes, in practice** | See below — this is the field a conversion is most likely to forget. |
| `pages` | no | Documentation only; nothing reads it. Fine to keep in sync for authoring convenience, harmless if you don't. |
| `fonts` | no | **Inert for `static` tier.** Only consumed by `pageShell()`, which a static theme's own complete `<head>` never reaches. If the source needs a web font, `<link>` or self-host it directly in each page's own `<head>` — don't rely on this field. |

## `publishedPages` — the default-unpublished trap

Absent, or present but missing an id: that page is **unpublished** — `GET /<id>` falls through
to the ordinary 404 path even though the file exists and the theme is otherwise valid. Only
`index`, `404`, and a page declared in `templates` are exempt (structurally load-bearing, never
gated by this field). Every other converted page needs its id listed here explicitly. There is
no other publish mechanism for a static theme's own pages, and no validation error warns you
if you forget — the theme still loads clean.

## Tokens — which file holds which palette

`tokens.json` → emitted as bare, unconditional `:root { ... }` (applies whenever `data-theme`
is not the literal string `"light"`). `tokens.light.json` → emitted as
`:root[data-theme="light"] { ... }`. There is no third file and no other override selector —
if the source names more than two modes, only "light" gets its own slot; every other named
mode has to be expressed as `tokens.json`'s own (single) palette, or requires a design
decision this skill can't make for you. See the SKILL.md Rule 3 worked reasoning for how to
map a source whose own default happens to be light.

## Path rewriting — what's automatic, what's your job

`rewriteAssetPaths()` (`static-asset-contract.ts`) rewrites exactly two literal sentinel
prefixes inside `href=`/`src=` attribute values:

- `href="../css/..."` → `href="/theme-assets/<id>/css/..."`
- `src="../scripts/..."` → `src="/theme-assets/<id>/scripts/..."` (v2) or `src="../js/..."` →
  `.../js/...` for v1.

That's the entire automatic rewrite. Nothing else — not `<img src>`, not `<link rel="icon">`,
not `manifest.webmanifest`, not a JS `fetch()`/XHR call, not a CSS `url()` inside an inline
`<style>` block — gets touched. Anything else needing to reach a theme asset must be authored
with the real, absolute `/theme-assets/<id>/<relative-path>` directly. `findUnrewrittenAssetPaths()`
(same file) is a cheap self-check: run it against a converted page's post-rewrite HTML and it
returns any sentinel-prefixed reference the rewrite pass missed.

## Route/slug behavior worth knowing before you "fix" a link

The static-page route strips a trailing `.html` from the requested slug before matching, and
only matches a single path segment (`[a-z0-9-]+`, no `/`). Two consequences:

- An unmodified `<a href="about.html">` and `<a href="about">` both resolve to the same route —
  you do not need to strip `.html` from intra-site links during a conversion.
- A relative reference with more than one path segment (`./data/x.json`, `./docs/x.md`) has
  nowhere to land — there is no nested-path route for a static theme's own pages. This is the
  one case ordinary "keep it relative" porting breaks, and it only shows up in `fetch()`/XHR
  calls and similar JS-driven references, never in an `<a href>` to another top-level page.
