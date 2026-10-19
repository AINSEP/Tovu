Programmer(Execution) + Security(Review): loaded both persona files; implementation ownership and media/preview trust boundaries fit this dispatch.

# Media, public files, and editor previews — peer handoff

## Inputs and constraints

Read `AI-Dev-Shop/AGENTS.md`, the persona roster and both selected personas, architecture chapters 13/14, project memory, governance ADR index/GOV-ADR-001, and ADR-027 §§5–6. Task authority: `development/todos.md` lines 200, 327, 1032, 1270 and `ADS-memory/reports/2026-10-17-todotriage-c2/TRIAGE.md` rows s1-101, s1-145, s3-13, s4-07, s4-08.

No tests, typechecks, builds, servers, benchmarks, network commands, commits, or pushes were run. No runtime or test files changed. Graph tools were unavailable in the exposed tool catalog; discovery used local scoped searches and source reads in Tovu and Jini. The sibling Jini checkout is readable but outside this session's writable roots; approval is unavailable. The dispatcher explicitly permits returning owner decisions or work larger than M without forcing implementation.

## Per-item outcome

ITEM 200: NOT DONE (public-file protection needs a shared reference-policy contract before the default can safely flip).

ITEM 327: NOT DONE (same feature and blocker as 200; no second implementation).

- Evidence: `apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:425` resolves aliases and live referrers, then permits an empty gating set at line 440. Its `scanEntryAssets` at line 196 sees bodies, featured images, and placed widgets, but does not read `seoExtJson`, site-wide SEO settings, or active theme templates. The rationale at line 412 explicitly names legitimate anonymous share-card and theme media consumers outside the scan. Jini `packages/cms/src/seo/seo.ts:176` confirms the SEO output path and `settings.defaultOgImage` fallback at line 188. No public-file protection setting matched the scoped source search in either repository.
- Reuse: public-media access; searched public-file protection settings, referrer scans, SEO defaults and theme media consumers; inspected the route's alias/member gate, `features/publish-content/media-references.ts`, and Jini SEO output. Extend the existing gate and settings owner; do not introduce another reference policy. The extraction backlog already identifies the generic authored-reference walkers as Jini candidates (`SURVEY.md:886`).
- Coordinator decision: settle the common reference-policy contract and its owner across public visibility and safe deletion. Keep the existing member-entitlement rule when unreferenced-file protection is disabled. Specify how enabling protection handles previously issued immutable cache responses (`media-rendition.ts:46`, `:552`); a server-side toggle alone cannot revoke already cached bytes. Then dispatch the one default-protected setting, complete public-use coverage, and both original/rendition route wiring together. This is more than adding a Boolean to settings.
- Required test cases after that contract lands: default and explicit protected mode; explicit unprotected mode; body/featured/SEO/default-share/theme/widget references; unpublished public references; mixed member/public refs; id/current/retired slugs; both byte routes; policy changes and response cache headers. Existing route tests are in `server/__tests__/media-rendition-gating-bypass.test.ts`, `media-rendition-route.test.ts`, and `media-original-video-route.test.ts`.

ITEM 1270: NOT DONE (where-used purge protection requires a Jini owner change; Jini is outside writable roots).

- Evidence: Jini `packages/cms/src/media/media-service.ts:697` exposes `PurgeMediaDeps` without a reference-check port. `purgeMedia` at line 749 checks only trashed status before deleting rows. Tovu's `server/inbound/admin-http/routes/media/delete.ts:33` calls that service; it never calls the existing `features/media/where-used.ts:10` adapter.
- Reuse: purge reference safety; searched purge callers, where-used adapters, reference extraction and existing tests; inspected `purgeMedia`, `findMediaWhereUsed`, and `mediawidget-where-used.test.ts`. The service remains Jini-owned (`features/media/index.ts:1`; todos line 1270). A route-only duplicate guard would leave the shared service invariant unenforced.
- Smallest next slice: add an injected reference-check contract to Jini's existing purge service, deny on lookup failure, and invoke it before destructive effects; Tovu supplies its existing post/index adapter. Review completeness first: that adapter currently takes id/current slug only (`where-used.ts:14`), whereas public serving includes retired slugs. ADR-027 §5 is the deletion contract; resolve any force-purge exception explicitly rather than treating `media.delete.force` as an implicit bypass.
- Required tests: a trashed referenced asset returns the referencing list with zero deletion/tombstone effects; unreferenced trashed assets purge; active assets still fail; reference lookup errors preserve rows; workspace and alias isolation. Extend Jini's existing `media-service.test.ts` and Tovu's `admin-media-routes.test.ts` plus where-used tests after the contract is available.

ITEM 1270: NOT DONE (shared ingress policy requires coordinated Jini owner changes; Jini is outside writable roots).

- Evidence: ADR-027 §6 (`ADR-027-media-assets-subsystem.md:144`) names one `MediaIngressPolicy` for every byte entry point. Jini `media-service.ts:312` validates declared MIME and byte length, not shared byte/dimension policy. Tovu HTTP upload sniffs at `routes/media/upload.ts:139`; replacement calls `resolveUploadContentType` at `routes/media/replace.ts:25`; agent upload sniffs in `features/media/tool-registrations.ts:133`. URL/local imports reuse Jini's `media/import/fetch-image.ts` byte validator through `features/media-import/fetch-image.ts:152`/`:183`. Lazy transform input reaches the transformer through Jini `rendition-service.ts:172`.
- Reuse: byte-ingress policy; searched MIME sniffing, import validation, upload, replacement, generation, and lazy transforms; inspected those owners and Jini's Sharp adapter. Guarded HTTP already supplies SSRF/DNS pinning and redirect controls; reuse it. Sharp already has its default input-pixel bound, documented at `image-transformer.sharp.ts:135`; the missing requirement is a common ingress contract and enforcement before persistence/processing, not the complete absence of any pixel bound.
- Smallest next dispatch: extend the existing Jini media owner with shared byte validation and an injected pre-decode image-inspection seam, preserve caller MIME/byte limits, and wire upload/import/replacement/generation/transform paths. Do not create another Tovu validator or duplicate outbound HTTP policy.
- Required tests: forged MIME, unknown/active content, byte limits, malformed images, excessive dimensions and aggregate animation frames, no persistence on refusal, and equivalent refusal across entry points. Preserve existing guarded-fetch tests. No new dependency is proposed; the installed Sharp adapter is the first reuse candidate for image inspection.

ITEM 1032: NOT DONE (origin/authentication boundary decision and a larger coordinated slice are required).

- Evidence: `apps/admin/src/lib/api.ts:2716` builds the preview URL with the ordinary site URL. `PageEditor.tsx:1395` uses the live site for saved previews and `:1420` POSTs unsaved HTML to the template endpoint. `PostEditor.tsx:2002` uses the analogous live/template branches, with the POST form at `:2039`. The server template route authorizes the admin principal (`routes/posts/template-preview.ts:184`) and returns HTML with an opaque-origin sandbox CSP (`:174`, `:217`). Shared iframe flags omit `allow-same-origin` at `apps/admin/src/features/pages/rules.ts:631`.
- Reuse: preview rendering/isolation; searched preview-origin configuration, URL builders, both editor branches, server authorization, sandbox tests, and the existing origin adapter. Rendering is already shared by `renderPostPreview`; trusted-origin normalization belongs to Jini `@jini-ai/http-kit/verified-origin` (`features/origin/configured-origin.ts:14`). No replacement render pipeline is needed.
- Coordinator decision: define a dedicated preview serving origin/listener and a preview-scoped authorization handoff for GET and unsaved POST content; define how live previews and relative assets/navigation use it across desktop, local and hosted runtimes. Preserve the existing sandbox until that boundary is implemented. Changing only the iframe URL or restoring `allow-same-origin` does not deliver this feature. Generic origin/capability infrastructure must land in Jini before Tovu adapters; hosting/listener changes also exceed this dispatch's isolated editor files.
- Required tests: both editors, saved and dirty branches, preview cannot access admin cookies/APIs or parent DOM, unauthorized/expired handoffs fail, workspace isolation, fonts/modules/assets and relative navigation work, and unsaved content is not published or shared-cached. Existing sandbox tests in page rules, editor suites, and `server/__tests__/routes/admin-post-template-preview.test.ts` remain intact.

## Handoff

Architecture assessment: BLOCKER for runtime implementation until the shared reference/origin contracts are resolved and the Jini owner is writable. No architecture or runtime behavior was changed. Tests were neither added nor run because this handoff changes documentation only. No claim of passing runtime validation is made.

Suggested next assignee: Coordinator to split the shared Jini contracts from host adoption and resolve preview origin/authentication. Then Programmer with Jini write access; separate authorized verification/release work is needed before Tovu consumes new package exports.

CHANGED FILES:
- `ADS-memory/reports/2026-10-17-media-public-preview-peer-handoff.md` — evidence, reuse decisions, per-item blockers and next slices.
- `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md` — append-only owner-contract backlog entry.

NOT DONE: all five assigned rows remain open; no source or test changes, commit, push, build or runtime verification.
