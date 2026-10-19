# /admin/seo shows the real effective share image (Landing "/" = its body image)

Persona: Programmer. Repos: Tovu (/Users/la/Programming/Tovu, cwd) and Jini (/Users/la/Programming/Jini, writable).

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state.
Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`. REUSE before you write
(search for an existing mechanism first). Smallest change. Move "why" comments with code, never
delete them. Do not touch any file not listed below unless it is a test you add next to it; if you
must, list it under CHANGED FILES with a one-line reason.

## Problem
/admin/seo > Pages & posts > Landing "/" says "Using site default: tovu-share-card.png", but the live
"/" `og:image` is a library image from the page body (no featured image, no SEO override). Owner
decision: "/" keeps its content image; nothing is written to it. The admin must show what the page
really uses, muted, as "Using image from page content: {name}".

## Cause
- Public render (`apps/website/src/features/seo/page-head-contributor.ts`) projects the body cover
  onto the post (`resolveSeoCoverImage` + `withCoverSeoDefaults`, `apps/website/src/features/seo/cover-image.ts`)
  and binds a read-only `postRepo.findById` returning the projection before `buildHeadElements`.
- The admin reads (`apps/website/src/server/inbound/admin-http/routes/seo/get-entry.ts`,
  `get-entry-analyze.ts`, and the post-write re-read at the end of `put-entry.ts`) call
  `getEntryMeta`/`analyzeEntry` with the raw `deps.seoDeps`, so they never see the body cover.

## Change (exactly this)
1. Tovu `apps/website/src/features/seo/cover-image.ts`: export
   `withCoverReadDeps({ deps }: { deps: GetEntryMetaDeps; workspaceId: string; entryId: string }, _optional = {}): Promise<GetEntryMetaDeps>`
   (or an equivalent shape following the file's `(required, optional)` convention) that does what
   `page-head-contributor.ts` does today: findById, `resolveSeoCoverImage`, `withCoverSeoDefaults`,
   and returns a copy of deps whose `postRepo` is the read-only projection
   (`findById` → projected post, `extractPlainText`/`isTrashed` bound). Missing post → return the
   original deps unchanged (so `getEntryMeta` still throws `SeoEntryNotFoundError`). Move the
   "Bind only the read port..." comment into it. Make `page-head-contributor.ts` use it (keep its
   JSON-LD logic; it still needs `cover?.url`, so return or expose the cover too if needed, e.g.
   `{ deps, cover }`; your call, keep it minimal).
2. Use it in the three admin READS: `get-entry.ts`, `get-entry-analyze.ts`, and the final
   `getEntryMeta` re-read in `put-entry.ts` (line ~79). NEVER pass it to `setEntrySeoOverrides` or
   any write path.
3. Jini cms: add `imageSource?: 'override' | 'content' | 'default' | undefined` to `OpenGraph` in
   `Jini/packages/cms/src/seo/types.ts` (doc comment), set it in `buildOpenGraph` in
   `Jini/packages/cms/src/seo/seo.ts`: `overrides.ogImage` → 'override'; else the resolved
   `ogImage.ref === featuredImageRef(post)` → 'content'; else resolved → 'default'; no image → omit.
   (pass `post` or the featured ref into `buildOpenGraph`; keep it small.)
4. Tovu external-URL cover case: `withCoverSeoDefaults` injects an external body URL as
   `seoExtJson.ogImage`, which would make cms report `imageSource: 'override'` and
   `imageOverridden: true`. In `get-entry.ts` and `put-entry.ts` only, correct that: when the RAW
   stored post has no `ogImage` override but the meta says override, return
   `imageSource: 'content'` and drop `imageOverridden`. Put that as one small pure exported helper in
   `cover-image.ts` (e.g. `withContentImageSource({ meta, rawPost })`) or fold it into step 1's
   helper; do not duplicate it in both routes.
5. Jini admin port: add `readonly imageSource?: 'override' | 'content' | 'default'` to
   `AdminSeoOpenGraph` in `Jini/packages/admin/src/core/ports/seo.ts` (doc: absent from older hosts).
6. Jini admin rules: `ogImageInherited` in `Jini/packages/admin/src/seo/rules.ts` returns
   `false | 'default' | 'content'` instead of boolean: keep its current checks for 'default';
   additionally, when not touched and not overridden and `meta.openGraph.imageSource === 'content'`
   and there is an image → 'content'. Update its doc comment (keep the owner-quote history). Update
   `models.ts` (`ogImageInherited?:` type), `react/hooks/use-seo-entry-panel.hooks.ts`, and
   `react/pages/SeoPage.tsx` to pass the value through.
7. Jini `react/components/MediaRefField.tsx`: `inherited?: false | 'default' | 'content'` (accept
   `true` as 'default' only if something else still passes a boolean). 'default' keeps
   "Using site default: {name}"; 'content' shows "Using image from page content: {name}" with the
   same muted class and the same hidden Remove/size. Update the prop doc.
8. i18n: add key `"Using image from page content: {name}"` to
   `Jini/packages/admin/src/seo/messages.en.ts` next to "Using site default: {name}", AND to every
   locale block in Tovu `apps/admin/src/features/seo/seo-i18n.ts` (all 21 locales; write a real
   translation per locale, matching the tone of that locale's "Using site default: {name}"). The
   parity test `apps/admin/src/features/seo/__tests__/seo-i18n-parity.unit.test.ts` requires every
   Jini key in every locale.

## Tests to add/update (write them; do NOT run them)
- Jini `packages/cms/src/seo/__tests__/share-image.unit.test.ts` (or the closest existing seo test):
  imageSource is 'override' / 'content' (featured) / 'default' / absent (no image).
- Jini `packages/admin/src/seo/__tests__/rules.unit.test.ts`: `ogImageInherited` returns 'content'
  for imageSource 'content'; existing boolean expectations become 'default'/false.
- Jini `packages/admin/src/seo/react/__tests__/copy-polish.unit.test.tsx` (where "Using site default"
  is asserted today): add the "Using image from page content: {name}" render, Remove hidden.
- Tovu `apps/website/src/server/inbound/admin-http/routes/seo/__tests__/get-entry.test.ts`: an entry
  with no featured image and no override whose body has a library image → GET returns that image's
  ref/URL with `imageSource: 'content'` (not the site default), and the stored post's
  `featuredMediaId`/`seoExtJson` stay unchanged. Plus the external-URL body cover case →
  `imageSource: 'content'`, no `imageOverridden`. Follow the file's existing fixtures/fakes.
- Tovu `put-entry.test.ts`: a PUT with a patch that doesn't touch `ogImage` stores no `ogImage`, and
  its response meta shows the content image.
- Check (search, don't assume) that Jini's SEO entry save sends only touched fields so the shown
  content image is never saved as an override; if no existing test pins that for `ogImage`, add one
  in the existing entry-panel/controller test.
- Existing `apps/website/src/features/seo/__tests__/cover-image-head.test.ts` must keep passing
  unchanged after the head contributor refactor; don't edit its expectations.
