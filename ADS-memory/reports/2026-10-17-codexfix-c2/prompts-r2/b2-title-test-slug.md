# Follow-up: static-theme title test hits a seeded post, not the theme page

Persona: Programmer (test-only). Repo: Tovu (/Users/la/Programming/Tovu).
RULES: do NOT run tests, typecheck or builds. Do NOT commit or touch git state. Edit ONLY
`apps/website/src/server/__tests__/routes/seo-site-serving.test.ts`. Report `CHANGED FILES:` + `NOT DONE:`.
Smallest change; keep comments.

The test `static theme titles: ...` (around line 305, added by an earlier run) fails both cases at
the `/about` check (line ~343):
```
AssertionError: must exercise the theme's static document
actual: `<html><head><title>What Is Tovu?</title>...<main data-tpl="blog-post">...
expected: /data-theme-title-probe/
```
`/about` resolves to a SEEDED post with slug "about" in createRouteDeps(), so it never reaches the
static theme marketing page. Use a marketing slug that no seeded post owns (check the seed used by
`createRouteDeps` for existing slugs; e.g. "theme-probe"): set `theme.pages[<slug>]`,
`publishedPages = [<slug>]`, and use `/<slug>` in every `/about` assertion in this test (including
the "A root entry changes home's branch, while /about remains entry-less" part). The `/` checks passed;
leave them unchanged.
