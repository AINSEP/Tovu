# Tovu host guidance for site-import

This Tovu guidance comes before the portable `site-import` skill and names Tovu's tools for each
job the skill describes. Where the two differ, this guidance is the more specific one.

**Route Tovu backups first.** For an uploaded `.tovu.zip`, a Tovu share link (`/_share/…`),
or a request to install a shared Tovu site, call `site_import_backup` with exactly one of
`{url}` or `{uploadId}` from the authenticated ZIP upload endpoint. It creates a NEW separate
site and returns private owner setup/opening instructions. Never crawl a ZIP or write its content
into the current site. The skill's crawl-and-write flow is for live public websites.

**Design and theme plugins.** The plugin that provides `ui-design` is UI/UX Design: call
`agent_plugin_ui_ux_design({"skill":"ui-ux-design"})` before designing. The plugin that provides
`theme-authoring` is Tovu Theme: call `agent_plugin_tovu_theme` and follow its Part C ("match a
reference site"). Part C runs `content_read.theme`, `theme_duplicate`, `theme_read_file`,
`theme_write_file`, `theme_edit_file`, and `theme_set_active` only with the owner's approval.
Start with `theme_duplicate { sourceThemeId, newName, mode: "structure-only", activate: false }`.
Tovu Starter supplies structure and functional wiring only. Rebuild CSS from the supplied site's
design; never inherit Starter styling. A `valid` copy can still be `unstyled`: write fresh CSS,
compare screenshots and obtain the owner's approval before activation.

**References.** Read the skill's references with `agent_plugin_site_import` and
`file: "references/<file>"`, and Tovu's exact write shapes with `file: "host/content-mapping.md"`.
Read `host/content-mapping.md` before Step 4. For a dropped local folder (Tovu Theme Part B),
read only `host/content-mapping.md` § Local-folder sources; do not run the public-URL crawl.

## Tovu tools for each job

| Job | Tool |
|---|---|
| Read the source site | `web_fetch_page` (`format`: `raw` for robots.txt, sitemap.xml and CSS; `html` when you need the markup; `markdown` for article text) |
| Check what already exists | `content_read.content_post` (`kind` optional; omit for posts and pages together), `content_post_search`, `content_read.taxonomy`, `content_read.menu`, `content_read.redirect`, `content_read.media_asset`, `site_get_profile`. Each `content_read.<resource>` lists without an id; add its id (`id`, `taxonomyId`, `menuId`) to read one |
| Pages and posts | `content_post_create` (`kind` `page` or `post`), `content_post_update`, `pages_write_html` (pages whose layout matters) |
| Categories and tags | `content_read.taxonomy`, `taxonomy_create_taxonomy`, `taxonomy_create_term`, `taxonomy_assign_terms` |
| Images | `media_import_from_url` |
| Navigation | `menus_create_menu`, `menus_update_menu_tree`, `menus_assign_location` |
| Old URLs | `redirects_import` (up to 500 rules per call) |
| SEO | `seo_set_entry_overrides`, `seo_get_settings`, `seo_set_settings` |
| Site time zone | `settings_set_value` (`namespace` `core.site`, `key` `timezone`, `scope` `workspace`). Post `publishAt` stays the original instant |
| Theme | `agent_plugin_tovu_theme` (Part C) |
| See how pages look | `web_screenshot_page` (`{url, viewport}` for the source, `{sitePath, viewport}` for this site, plus `themeId` to see an inactive theme copy; `desktop` and `mobile`). Each capture is saved; `savedFiles` gives the paths |
| The one question | `assistant_ask_choice`, the suggested default first |
| Final `/` check | `fetch_published_page` for `/` (status 200); `fetch_live_url` once published to the live site. `fetch_live_url` only reads THIS site's own published copy |

**Batches are ONE call.** `web_fetch_page`, `media_import_from_url`, `content_post_create`,
`content_post_update`, `pages_write_html`, `theme_read_file`, `theme_write_file`,
`theme_edit_file` and `theme_import_file_from_url` take `items: [{...}, ...]` (each item is that
tool's normal input; a field set at the top level, such as `themeId` or `format`, applies to every
item). The result lists each item's `ok`, `result` or `error`; one failure never stops the rest.

**Rendering.** For Softr, Wix, Webflow, SPAs, or an empty shell, call `web_fetch_page` with
`render: true`. Default waiting is DOM content loaded + 1.2 seconds; set `waitFor` to a visible
content selector or 0–10 settle seconds when needed. Cookie banners are dismissed by default.
Read `data` for the page's own XHR/fetch JSON answers and `dataTruncated`/`truncated` before
treating the result as complete. `screenshot: true` reads and sees the page in one call. The
homepage's `stylesheets` field lists the stylesheets to fetch raw for Step 5.

**Menus in Tovu themes.** A static theme shows a menu only where its header partial has a menu
marker naming that menu's id; `menus_assign_location` does not place it. Owners edit menus in
Admin → Menus.

Why the theme hand-off exists (Luvira import, 2026-10-08): the old recipe duplicated the active
starter theme and edited only tokens and the nav/footer partials, so the result looked like the
starter in a different colour. Tovu Theme Part C rebuilds layout, header, page shell and fonts,
and requires a screenshot compare loop.
