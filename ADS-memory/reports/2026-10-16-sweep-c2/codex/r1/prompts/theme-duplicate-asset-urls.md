# theme_duplicate leaves absolute /theme-assets/<source-id>/ URLs in the copy

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY for you.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`.
REUSE before you write (search for an existing mechanism first). Smallest change. Move "why" comments
with code, never delete them. Do NOT edit non-test files under apps/website/src/assistant/** or
apps/website/src/server/runtime/composition/** (another agent owns them tonight).

## Bug
Duplicating a theme (assistant tool `theme_duplicate`, apps/website/src/features/theme/duplicate-theme-tool.ts
→ apps/website/src/features/theme/duplicate-theme.ts) copies the theme's files, but absolute asset
URLs inside the copied templates/partials/CSS still point at the SOURCE theme, e.g.
`/theme-assets/<source-id>/assets/site.css` or `/theme-assets/<source-id>/images/hero.png`. The copy
therefore keeps loading the source theme's assets; editing or deleting the source changes/breaks the copy.

## Fix
- Reuse the existing rewrite machinery first: theme migration already rewrites
  `/theme-assets/<id>/...` references (`AssetPathRewriteRule`, `applyAssetPathRewrites`, see
  apps/website/src/features/theme/migration/theme-migration-plan.ts and migrate-theme.ts). Call or
  extract that, do not write a second rewriter.
- Rewrite only exact `/theme-assets/<source-id>/` prefixes (not other theme ids, not a source id that
  is a prefix of another id, e.g. `foo` vs `foo-2`) in every copied text file the theme serves
  (templates, partials, CSS, JSON manifests if they hold URLs). Leave binary files untouched.
- RED test first: add a unit test next to the existing duplicate-theme tests (find them under
  apps/website/src/features/theme/**/__tests__) that duplicates a theme whose template + CSS contain
  `/theme-assets/<source-id>/...` (and one `/theme-assets/<source-id>-other/...` that must stay) and
  asserts the copy points at `/theme-assets/<new-id>/...`. It must FAIL on the current code. Use the
  existing DI fakes/fixtures those tests use.
