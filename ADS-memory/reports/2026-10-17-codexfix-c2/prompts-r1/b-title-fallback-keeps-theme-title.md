# No Site title set → a static theme page keeps its own <title>

Persona: Programmer (read /Users/la/Programming/Tovu/AI-Dev-Shop/agents/programmer/skills.md Role section).
Repo: Tovu (/Users/la/Programming/Tovu), apps/website. Jini (/Users/la/Programming/Jini) readable;
edit Jini ONLY if no Tovu-side fix is possible, and then say so loudly in NOT DONE (a Jini edit needs
a rebuild before Tovu sees it).

RULES: do NOT run tests, typecheck, builds or any server. Do NOT commit or touch git state. Edit
code and finish with `ROOT CAUSE:` (file:line), `CHANGED FILES:` and `NOT DONE:`. REUSE before you
write. Smallest change. Move "why" comments with code, never delete them. No read-anything limits.

## Bug
When a site has NO owner-set Site title (`core.site.title` has no workspace-layer value),
`resolveSiteTitle` in `apps/website/src/features/settings/site-title.ts` falls back to the site
display name (config.json `name`, i.e. typically the folder name, e.g. "zoran"). That value is
`ctx.siteTitle`, and the SEO head fold emits it as `<title>` (Jini
`packages/cms/src/seo/page-head.ts` `buildHeadElements`: the `!ctx.entry` branch emits
`{ kind: "title", text: ctx.siteTitle }`; the root-entry branch passes `homeTitle` from
`seoDeps.siteTitle`, which returns only an explicit title). Then
`injectExtraHeadIntoStaticPage` (`apps/website/src/server/inbound/public-http/http/site/render.ts`
~3185) sees a `<title>` in extraHead and REMOVES the static theme's own `<title>`
(`removeThemeOwnTitleElement`). Result: the zoran site home shows "zoran" instead of the theme's
"Zoran Creative Strategy — A New Approach to Social Impact". Trace which branch(es) actually produce
the replacing title for a static-tier home `/` and a static theme marketing page (`/about`, see
`routes/site/pages.ts` call sites of `injectExtraHeadIntoStaticPage`), with and without a backing
root entry.

## Desired
- No owner-set Site title → a static-tier page that has its own `<title>` keeps it (the fold's
  fallback title must not replace it). Other head elements (canonical, meta, OG, feed link) still
  splice in as today.
- Owner-set Site title → behaviour unchanged (the SEO title replaces the theme's).
- Non-static tiers (pageShell, which has no theme title) unchanged: they still render the
  fallback title so a page never ships without a `<title>`.
- An explicit per-entry SEO title (entry meta) still wins as today.
`seoDeps.siteTitle` (explicit-only) already exists; reuse it / its idea rather than adding a new
resolver.

## Tests (write them; do not run)
Find the existing tests for `injectExtraHeadIntoStaticPage` / static-tier home title (search
`apps/website/src` for `injectExtraHeadIntoStaticPage`, `removeThemeOwnTitleElement`,
`core.site.title`, `resolveSiteTitle`) and add, in the most fitting existing file, two cases on a
static theme page whose HTML has its own `<title>Theme Own Title</title>`:
1. no Site title set → rendered HTML has exactly one `<title>` and it is "Theme Own Title";
2. Site title set to "Owner Title" → exactly one `<title>`, containing "Owner Title" (as today).
Case 1 must fail on the current code. node tests in apps/website run with
`node --import tsx --test`; vitest files use vitest; match the file you extend. Tests must not
write the real home (~/Documents/Tovu, ~/Library/Application Support/Tovu, ~/.tovu): use the
temp/isolated helpers the neighbouring tests use.
