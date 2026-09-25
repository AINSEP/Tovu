# Themes guide

**Status:** the one source of truth for Tovu themes, written for people building a site or a
theme. Every behavior below was checked against the renderer on 2026-09-24. It replaces
`theme-authoring-guide.md` (v1) and `theme-authoring-guide-v2.md`. Both are still in this folder
as internal history, marked superseded. When a section here disagrees with them, this guide wins.

The public docs pages at tovu.com (`/how-themes-work`, `/create-a-theme`, `/theme-markers`) are
built from this file. If you change one, change the other.

---

## 1. The short version

- **Switch themes:** Admin → **Themes** → **Activate** on the one you want.
- **Change a theme:** open it in **Themes**, edit a file, save. **Reset** puts a file back to how it shipped.
- **Make your own:** copy a theme folder, rename it, change its `id`, click **Rescan**, then **Activate**. Section 4 walks through it.

You don't need to learn anything else to restyle a site. The rest of this guide is reference.

---

## 2. What a theme is

A theme is a folder of files that decides how your site looks. Your content (pages, posts,
menus, media) lives in the database. The theme only decides where that content goes and how it
is styled. Switching themes never changes or deletes content.

Themes live in your site folder under `themes/<tier>/<id>/`. A new site gets a copy of the
built-in themes on first start. After that, the copies are yours to edit.

### Tiers

A tier is the format a theme is written in. Pick **static** unless you have a reason not to.

| Tier | You write | Code runs? | Use it when |
|---|---|---|---|
| **static** | Plain HTML, CSS, JS. One file per page. | Only your own JS, in the browser | Almost always. Every live site today uses it. |
| **templated** | LiquidJS templates | Template logic only, sandboxed. No JS. | You need loops and conditionals over live data. |
| **declarative** | JSON block layouts | Nothing | You want a theme that is pure data. Reference only today. |
| **handlebars** | Handlebars templates | Template logic only, sandboxed | Supported, but no example theme ships. |
| **code** | n/a | n/a | Reserved. Not built. Don't use it. |

The rest of this guide covers the static tier.

---

## 3. File layout (static tier)

```
themes/static/my-theme/          folder name must equal "id" in theme.json
  theme.json                     required. Name, tier, templates, partials.
  tokens.json                    required. Colors, fonts, spacing, as design tokens.
  tokens.light.json              optional. Light-mode overrides.
  css/theme.css                  your stylesheet
  scripts/*.js                   optional. Your browser JS.
  assets/                        optional. Images, fonts, logo.
  render/pages/*.html            one complete HTML file per page. index.html is the home page.
  render/partials/nav.html       shared header
  render/partials/footer.html    shared footer
  render/partials/footer-*.html  optional footer variants, e.g. footer-minimal.html
  NOTICE.md                      optional. Credits and licenses.
```

Three kinds of file under `render/`:

- **Page:** a complete HTML document for one URL. `render/pages/pricing.html` is served at `/pricing`.
- **Partial:** a shared fragment, like the header, pulled into every page with one marker line.
- **Template:** a page file that your own pages and posts can pick to render through. It has a
  `content` marker where the page or post body goes. You list templates in `theme.json`.

---

## 4. Create a theme, step by step

1. **Copy a theme.** Copy `themes/static/basic` to `themes/static/my-theme`. Starting from a
   working theme is much faster than starting from nothing.
2. **Rename it.** In `my-theme/theme.json`, set `"id": "my-theme"` and a new `"name"`. The id
   must equal the folder name or the theme won't load.
3. **Fix the asset paths.** Search the copy for `/theme-assets/basic/` and replace it with
   `/theme-assets/my-theme/`. Otherwise your copy keeps loading the original's logo and icons.
4. **Load it.** Admin → **Themes** → **Rescan**, then **Activate** on your theme.
5. **Restyle it.** Change colors in `tokens.json` first (section 7). Then edit `css/theme.css`.
6. **Edit the header and footer** in `render/partials/nav.html` and `footer.html`. Every page
   picks up the change.
7. **Add a page.** Copy `render/pages/about.html` to `render/pages/team.html` and edit it. It is
   served at `/team`.
8. **Check it.** If you run Tovu from source: `tovu theme validate themes/static/my-theme`.

Every page file must keep this exact stylesheet line in its `<head>`. Tovu injects your tokens
right before it, and matches it character for character:

```html
<link rel="stylesheet" href="../css/theme.css" />
```

A minimal page:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{{title}}</title>
<link rel="stylesheet" href="../css/theme.css" />
</head>
<body>
<div data-embed-config='{"type":"partial","id":"nav","current":"team"}'></div>
<main>
  <h1>Our team</h1>
</main>
<div data-embed-config='{"type":"partial","id":"footer"}'></div>
<script src="../scripts/main.js"></script>
</body>
</html>
```

`{{title}}` is replaced with the page's own title. It is the only placeholder of its kind.

---

## 5. Markers: how a theme pulls in content

A **marker** is an ordinary HTML element with a `data-embed-config` attribute. Tovu finds it and
fills it in, or swaps it out, with real content. One attribute, JSON inside, single quotes outside:

```html
<nav class="main-nav" data-embed-config='{"type":"menu","id":"menu-header-nav"}'>…</nav>
```

Rules that apply to every marker:

- `type` is required. It says what goes here.
- Most types also take an `id`: which menu, which partial, which item.
- Wrap the JSON in **single** quotes, so the JSON's own double quotes need no escaping.
- **Fallback content:** whatever you put inside the marker shows when there is nothing to fill it
  with, such as a menu that doesn't exist yet. Put sensible links there, not "loading…".
- Markers inside `<!-- comments -->`, `<script>`, or `<style>` are ignored. Commenting a marker
  out really does turn it off.
- A marker needs a closing tag. `<div data-embed-config='…' />` is not a marker.

### Every marker type

| `type` | What it puts there | Keys | Fills or replaces? |
|---|---|---|---|
| `partial` | A shared file from `render/partials/` | `id`, `current`, `variant` | Replaces the marker |
| `menu` | A menu you edit in Admin → Menus | `id`, `variant` | Fills the marker, keeps its tag |
| `content` | The body of the page or post being viewed | `id`, `slug`, `header` | Fills the marker |
| `post-previews` | A list of your latest posts | `limit` | Fills the marker |
| `collection` | Entries from a collection | `id`, `where`, `sort`, `limit`, `columns`, `layout`, `fields` | Fills the marker |
| `widget` | A widget | `id` or `slug` | See [Embeds](/embeds) |
| `media` | An image, video, or file | `id` or `slug`, `variant` (size) | See [Embeds](/embeds) |
| `post` | Another post, inline | `id` or `slug` | See [Embeds](/embeds) |

`widget`, `media`, `post`, and `collection` also work inside page bodies. The
[Embeds](/embeds) and [Collections](/collections) pages cover them in full.

### `partial`: shared header and footer

```html
<div data-embed-config='{"type":"partial","id":"nav","current":"docs"}'></div>
```

- `id`: which partial. `theme.json`'s `slots` maps each id to a file (section 6). Without a
  `slots` block, `nav` and `footer` map to `nav.html` and `footer.html`.
- `current` (optional): marks one link in the partial as the current page. It finds
  `<a href="…" data-nav-id="docs">` in the partial and adds `aria-current="page"`. Write the
  link with `href` first and `data-nav-id` second, and nothing after, or it won't match.
  Once a real menu fills the nav, the menu marks the current page itself, so `current` only
  affects the partial's fallback links.
- `variant` (optional): use a different version of the partial. `"variant":"minimal"` loads the
  file `slots` names for it, or `footer-minimal.html` by convention.

Before and after:

```html
<!-- page source -->
<div data-embed-config='{"type":"partial","id":"footer","variant":"minimal"}'></div>

<!-- rendered: the marker is gone, the partial is in its place -->
<footer class="site-footer">…</footer>   (contents of footer-minimal.html)
```

If you give the marker any other attribute (a `class`, say), the element stays and wraps the
partial. An `id` that `slots` doesn't know leaves the marker untouched.

### `menu`: a menu from the admin

```html
<nav class="main-nav" data-embed-config='{"type":"menu","id":"menu-header-nav"}'>
  <a href="/docs">Docs</a>
</nav>
```

- `id`: the menu's slug or id, as shown in Admin → Menus.
- `variant` (optional): `"tree"` renders nested items. Leave it out for a flat row of links.

The marker's own tag and attributes stay (`<nav class="main-nav">` survives). Only what's inside
changes. Deleted or unpublished targets are left out, never shown as dead links.

**Flat (default).** Top-level items only, as bare links. Child items are **not shown at all**.

```html
<nav class="main-nav" data-embed-config='{"type":"menu","id":"menu-footer-nav"}'><a href="/docs">Docs</a><a href="/about" aria-current="page">About</a></nav>
```

**Tree.** Add `"variant":"tree"` to get every level, as nested lists, with classes to style against:

```html
<nav class="docs-nav" data-embed-config='{"type":"menu","id":"docs-section","variant":"tree"}'>
  <ul class="menu-list depth-0">
    <li class="menu-item depth-0 has-children is-active">
      <a href="/docs#get-started">Get started</a>
      <ul class="menu-list depth-1">
        <li class="menu-item depth-1 is-current is-active"><a href="/quickstart" aria-current="page">Your first site</a></li>
      </ul>
    </li>
  </ul>
</nav>
```

| Class | Means |
|---|---|
| `menu-list depth-N` | A `<ul>` at nesting level N (0 = top) |
| `menu-item depth-N` | An `<li>` at level N |
| `has-children` | This item has a submenu |
| `is-current` | This item is the page being viewed |
| `is-active` | This item or something under it is the page being viewed. Use it to open the right section. |
| your own class | Whatever you typed in the menu item's CSS class field |

Why tree isn't the default: most nav CSS styles `nav > a`. A tree wraps links in `<ul><li>`, so
switching an existing nav to tree breaks its layout until you add CSS for the lists. Opt in one
marker at a time. A menu item with a description or icon gets
`<span class="menu-item-desc">` / `<span class="menu-item-icon" data-icon="…">` in tree mode.

**Built-in docs menus.** Three menu ids don't name a stored menu. They are computed from your
header menu's **Docs** item, the top-level item that links to `/docs`:

| `id` | Renders |
|---|---|
| `docs-section` | The Docs item's groups and pages, as a tree. For a docs sidebar. |
| `docs-prev-next` | The previous and next docs page, tagged `docs-pager-prev` / `docs-pager-next`. |
| `docs-current-page-sidebar` | Older convention: a menu with slug `docs-<page-slug>-sidebar`. Still works. |

Add a docs page to the Docs item in Admin → Menus, and the sidebar and pager pick it up.

### `content`: the page or post being viewed

```html
<article class="post-detail">
  <div data-embed-config='{"type":"content"}'></div>
</article>
```

- No `id`: the page or post at the current URL. This is what every template uses.
- `id` or `slug`: show a different page or post here instead.
- `header` (optional): `false` hides the title and date header Tovu adds to posts written in the
  editor. Use it on landing pages. Only the JSON value `false` works, not the string `"false"`.

A template (section 6) must contain at least one `content` marker.

### `post-previews`: latest posts

```html
<section class="blog-grid" data-embed-config='{"type":"post-previews","limit":6}'>
  <p>No posts yet.</p>
</section>
```

- `limit` (optional): how many. Default 6, max 24.

Renders one card per post, newest first:

```html
<article class="post-card"><h3><a href="/hello">Hello</a></h3><div class="post-meta"><time datetime="2026-09-03T…">Sep 3, 2026</time></div></article>
```

With no published posts, your fallback content stays.

---

## 6. `theme.json`

The fields that do something:

```json
{
  "apiVersion": 2,
  "id": "my-theme",
  "name": "My Theme",
  "version": "0.1.0",
  "tier": "static",
  "description": "One sentence about the theme.",
  "modes": ["dark", "light"],
  "defaultMode": "dark",
  "templates": ["posts-default.html", "posts-sidebar.html", "pages-default.html"],
  "slots": {
    "nav": { "source": "nav.html", "honorsCurrentPage": true },
    "footer": { "source": "footer.html", "variants": { "minimal": "footer-minimal.html" } }
  }
}
```

| Field | Does |
|---|---|
| `apiVersion` | `2` means the `render/`, `css/theme.css`, `scripts/` layout. Always use 2. |
| `id` | Must equal the folder name. |
| `tier` | `static`, `templated`, `declarative`, or `handlebars`. Missing means `declarative`. An unknown value stops the theme loading. |
| `modes`, `defaultMode` | Color modes. `defaultMode` must be in `modes`, or the theme fails to load. |
| `templates` | Page files your pages and posts can choose in the editor's template picker. The first is the default. Each must exist and contain a `content` marker. |
| `slots` | Maps partial ids to files. `honorsCurrentPage` turns on the `current` key. `variants` names variant files. |
| `fonts` | Google Fonts specs, loaded for you. |

`pages` appears in the built-in themes but does nothing. Tovu finds pages by scanning
`render/pages/`.

**Templates vs pages.** A page file not listed in `templates` is served at its own URL
(`pricing.html` → `/pricing`). A file listed in `templates` is a layout your content picks. In the
page editor, the template picker lists them, and **View Template** opens the file.

---

## 7. Styling

**Tokens first.** `tokens.json` is a flat list of CSS variables. Tovu writes them onto `:root`
in every page:

```json
{ "--bg": "#020203", "--fg": "#f4f4f5", "--accent": "#f5b83d" }
```

Use them in CSS, with a fallback:

```css
body { background: var(--bg, #020203); color: var(--fg, #f4f4f5); }
```

Change a token and every rule that uses it follows.

**Light and dark.** `tokens.light.json` holds only the values that differ in light mode. They
apply under `:root[data-theme="light"]`. Tovu puts `data-theme="<defaultMode>"` on `<html>`. A toggle button flips it:

```html
<button data-theme-toggle>Toggle</button>
<script>
  document.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    const el = document.documentElement;
    el.dataset.theme = el.dataset.theme === 'light' ? 'dark' : 'light';
  });
</script>
```

**Paths.** In a page file, `../css/…` and `../scripts/…` are rewritten to the theme's public URL.
For images and fonts, use the full path: `/theme-assets/my-theme/assets/logo.png`. Links to other
page files, like `href="about.html"`, become `/about`.

---

## 8. Publishing

**To your live site.** Theme edits are part of your site. The app's **Publish** sends changed
theme files along with pages and menus. Nothing reaches the live site until you publish.

**Sharing a theme with others.** Run `tovu theme validate <folder> --profile publish`. It
requires a `license`, a `description`, and `assets/previews/card.webp`. Credit bundled fonts and
libraries in `NOTICE.md`.

---

## 9. Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| Colors and fonts missing on one page | The stylesheet line was changed | Restore `<link rel="stylesheet" href="../css/theme.css" />` exactly |
| Theme doesn't appear in the list | `id` doesn't match the folder name, or no Rescan | Fix the id, click **Rescan** |
| A dropdown's child links vanished | The menu marker lost `"variant":"tree"` | Add it back |
| Nav collapsed into one lump after adding tree | Tree wraps links in `<ul><li>` | Style `.menu-list` / `.menu-item` |
| A marker shows its fallback forever | Wrong `id`, or the menu is empty | Check the slug in Admin → Menus |
| A marker does nothing at all | Double quotes around the JSON, invalid JSON, no `type`, or self-closing tag | Use `data-embed-config='{"type":"…"}'` with a closing tag |
| Copied theme shows the old logo | Hardcoded `/theme-assets/<old-id>/` paths | Replace with your id |
| A template doesn't show in the picker | Not in `templates`, or no `content` marker | Add both |
| Theme fails to load after setting a mode | `defaultMode` not in `modes` | Add it to `modes` |
| Page title shows the literal placeholder | `{{title}}` used somewhere other than `<title>` | Only use it in `<title>` |

---

## 10. Where the code lives

For contributors. Markers are parsed in `apps/website/src/contracts/core/embeds/marker.ts`.
Partials, menus, post previews, and collections render in
`apps/website/src/features/theme/static-render.ts`. The docs menus (`docs-section`,
`docs-prev-next`) resolve in `apps/website/src/server/inbound/public-http/routes/site/pages.ts`.
`widget`/`media`/`post`/`content` resolve in `apps/website/src/features/widgets/resolver-service.ts`.
The theme loader is `apps/website/src/features/theme/theme.ts`, and the validator is under
`apps/website/src/features/theme/validation/`.
