Programmer(Direct): Programmer persona selected for the smallest rendering fix and regression tests.

ROOT CAUSE: [render.ts:3196](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/render.ts:3196) treated every folded title as authoritative. Entry-less static `/` and `/about` receive the display-name fallback, which displaced the theme title. With a backing root entry, `/` uses explicit entry SEO → explicit Site title → entry title; `/about` remains entry-less.

CHANGED FILES:

- [pages.ts](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/pages.ts:1940): reuse `seoDeps.siteTitle` for the two entry-less static paths.
- [render.ts](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/render.ts:3190): preserve authored titles when requested, using the existing comment-aware helper. Keep other head elements and supply the fallback when the theme has no title.
- [seo-site-serving.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/__tests__/routes/seo-site-serving.test.ts:305): add both requested cases, backing-root coverage, and explicit SEO precedence.
- [render.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts:3122): cover comments and missing theme titles.
- [site-title.integration.test.ts](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/site/__tests__/integration/site-title.integration.test.ts:92): update the previous fallback expectations.

NOT DONE: Tests, typechecks, builds, and servers were not run, as requested. Validation is source review only. Git state and Jini were untouched.
