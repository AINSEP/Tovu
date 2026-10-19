# Codex prompt: /admin/seo shows the real effective share image ("/" = its body image)

Persona: Programmer (non-UI server + Jini model change; the one copy change is tiny).

## Problem
/admin/seo > Pages & posts > Landing "/" says "Using site default: tovu-share-card.png", but the live
"/" `og:image` is `/m/ai-provider-keycaps/og.v1/image.jpg`, an image from the page body. Owner
decision: "/" keeps its content image (no override). The admin must show what the page really uses.

## Cause
- Public render: `apps/website/src/features/seo/page-head-contributor.ts:33-41` projects the body
  cover onto the post (`resolveSeoCoverImage` + `withCoverSeoDefaults`, `features/seo/cover-image.ts`)
  and binds a read-only `postRepo.findById` returning the projection before `buildHeadElements`.
- Admin read: `apps/website/src/server/inbound/admin-http/routes/seo/get-entry.ts:35` calls
  `getEntryMeta` on the raw post, so the chain is override > featured > site default, with no body
  cover. Jini's `ogImageInherited` (`Jini/packages/admin/src/seo/rules.ts:234`) then sees
  image === defaultOgImage and renders "Using site default: …"
  (`Jini/packages/admin/src/seo/react/components/MediaRefField.tsx:98`).

## Smallest change
1. `features/seo/cover-image.ts`: export one helper, e.g. `withCoverProjectedDeps({ deps, post })`,
   that returns the read-only deps object `page-head-contributor.ts` builds today. Use it in
   `page-head-contributor.ts` (move its comments with it) and in `get-entry.ts` (plus
   `get-entry-analyze.ts`, so the analyzer judges the same image). Read-only: never pass it to
   `put-entry.ts` or any write path.
2. Copy: add `imageSource?: 'override' | 'content' | 'default'` to cms `SeoMeta.openGraph`
   (`Jini/packages/cms/src/seo/types.ts:203`, set in `seo.ts` `buildOpenGraph`, around :233:
   override → 'override', featured/cover → 'content', settings default → 'default') and to
   `AdminSeoMeta.openGraph` (`Jini/packages/admin/src/core/ports/seo.ts:85`). In `MediaRefField`,
   when the value is not the entry's own pick and `imageSource === 'content'`, show it muted as
   "Using image from page content: {name}" (new key in `seo/messages.en.ts`; Tovu adds it to
   `apps/admin/src/features/seo/seo-i18n.ts` for all 21 locales, the parity test
   `features/seo/__tests__/seo-i18n-parity.unit.test.ts` will fail until it does).
3. Check: the Jini SEO form writes only touched fields, so showing the projected image must not
   save it as an override. Add a test that GET of "/" returns the body image with
   `imageSource: 'content'` and that a save without touching the image writes no `ogImage`.

## Constraints
- Owner is testing on :3000; saving under apps/website/src restarts the server. Check
  `ai_chat_messages.run_status` is not running first.
- No override is added to "/" (owner decision).
