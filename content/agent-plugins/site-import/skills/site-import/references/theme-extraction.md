# Theme extraction: what site-import hands to tovu-theme

Version: 2.0.0 (2026-10-08)

The theme step belongs to the `tovu-theme` plugin, Part C ("Match a reference site"): one place
owns design logic. Load it with `agent_plugin_tovu_theme` (no arguments). If that tool is not in
this session, read the same skill with `fs_read_file` root `repo`, path
`content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md`. Follow Part C to the end,
including its compare loop.

Why the hand-off (Luvira import, 2026-10-08): the old recipe here duplicated the active starter
theme and edited only tokens and the nav/footer partials. The starter's header, 720px page
column and fonts won, the run never screenshotted its own page, and the result looked like the
starter in a different colour. Part C rebuilds layout, header, page shell and fonts, and
requires a screenshot compare loop.

## What to hand over

Pass these in the same turn, so Part C does not re-read what Steps 1-2 already fetched:

- The source homepage URL, and the stylesheet URLs from its `stylesheets` field.
- Palette, fonts and logo you already noted (roles and values, as the source wrote them).
- The main menu's id from Step 4 (`menus_create_menu` returns it) — Part C puts it in the
  header partial's menu marker.
- The footer menus' slugs and column headings (content-mapping.md § 9) — Part C renders each one
  through a menu marker in the footer partial instead of hard-coding its links.
- The header call-to-action: label and href exactly as on the source.

## Still site-import's job

- Favicons: a binary `.ico`/`.png` cannot be written into a theme by any tool. Name it in the
  report with its source URL.
- Content images: `media_import_from_url` (content-mapping.md § 3), not the theme.
- Page HTML that keeps a source's scroll-reveal start state (content-mapping.md § 5).
