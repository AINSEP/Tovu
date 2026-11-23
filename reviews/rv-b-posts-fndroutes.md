REVIEW r62t-rv-b PARTIAL

## ex5-posts · FIX

1. **Apply the `jini-*` class rule to the moved field labels.** In Jini `packages/admin/src/posts/PostAuthorFields.tsx:15,22` and `packages/admin/src/posts/PostPublishingFields.tsx:24`, change `field-label` to `jini-field-label`. In Tovu `apps/admin/src/styles.css` and `apps/admin/src/styles/editor.css`, extend the shared label styling to the new class and update the post-specific selectors. Preserve the current layout and leave unrelated labels alone.

The production spot check covered both admin components, `post-before-save.ts`, `slug.ts`, and the old `rendering.ts` shell. The four implementations matched after accounting for import, comment, and class-name changes. Both former shell callers go directly to the slug subpath. Fixed-string searches found zero remaining importers of the deleted modules, and the removed `BeforeSaveHookPort` barrel export has no remaining consumers. The Jini slug test differs only in its test-runner import. The two admin exports match the API baseline and patch changeset. The moved components receive `t` and their state callbacks as props. The diff adds no inter-package implementation imports or runtime under `core/src/contracts` and touches no theme files.

The lane report records a slug mutation that went red and passed after restoration. It also records the schema and route-key reverts and the held editor, K5, and route steps. This verdict covers the delivered slice.

## ex5-fnd-routes · FIX

1. **Restore the redirect ID passed to authorization.** Jini `packages/cms/src/admin-http/routes/redirects/shared.ts:72` drops the `entityId` that the Tovu base supplied for get-by-ID, hits, update, and tombstone. Add an optional `entityId` field to the existing `JsonRouteAuthorize` args and the host authorize-port args. Pass each route’s parsed `input.id` through `packages/http-kit/src/adapter.ts:72` and Tovu `apps/website/src/server/inbound/admin-http/admin-json-route-ports.ts:69` to `deps.authorize`. Keep list and import calls ID-free. Add a mounted-route test that asserts the authorizer receives the requested ID and goes red when forwarding is removed.
2. **Keep recovery tests on the same injection seam as production.** Jini `packages/cms/src/admin-http/routes/recovery/__tests__/deep-link.test.ts:4`, `disclosure.test.ts:4`, and `restore-points.test.ts:3` import concrete `@jini-ai/db` implementations into the CMS package. Replace those imports with typed fakes injected through the existing route deps. Assert the forwarded inputs and the unchanged wire results in Tovu’s recovery route tests.
3. **Match the move changeset to the extraction contract.** In Jini `.changeset/p9k-ex5-fnd-routes.md:2`, change the CMS move from `minor` to `patch` per P9 §1. The separate http-kit changeset covers the new opt-in `onReturnedError` API.

The legacy 413 body is preserved as `{"error":"Content too large to save.","code":"PAYLOAD_TOO_LARGE"}`. The host still supplies that literal to the Express middleware, and `apps/website/src/server/inbound/admin-http/__tests__/admin-json-route-ports.test.ts:75` covers the exact cap, one byte over, and handler short-circuiting. The route-table fixture is unchanged. The inspected cutovers retain the pinned methods, paths, order, and anonymous handler names. The two auth rows covered by OD-1 were untouched. This was a static comparison.

Seven helper spot checks matched byte-for-byte or differed only in imports, host-neutral comments, or the redirect DTO split. The redirect DTOs moved to Jini while the Express registrar types stayed with Tovu’s mount. The 24 new CMS export keys match the API baseline, the lane adds route-spec tests alongside retained host route tests, and the diff adds no runtime under `core/src/contracts` or theme-file changes.

**NOT-CHECKED** — `cloud-results/ex5-fnd-routes.md` was absent from the supplied Tovu ref, so the lane’s first-line status, full skip list, gate results, and mutation evidence could not be verified. The Foundation old-specifier search exceeded its output limit. No stale importer appeared in the inspected results, and exhaustive zero-importer and shell verification remains open. The review stopped at 160 targeted lookups.

## MERGE-ORDER

Land each corrected Jini half before its Tovu half. Both Tovu halves need a linked Jini build or published artifacts containing the new exports. Posts still declares `^0.7.3-next.2` and its report also records a base AdminKit host-assignment gap.

The Jini diffs share no changed files. The Tovu diffs share three files:

- `apps/website/src/server/inbound/public-http/http/site/render/doc/doc-nodes.ts`
- `apps/website/src/server/inbound/public-http/http/site/render/widgets/social-entries.ts`
- `development/why-comments-debt.json`

Keep both import rewrites in the renderer files: Posts owns the slug import and Foundation Routes owns the value-reader import. Union the three new why-comment debt IDs. The two lanes have no direct dependency on each other after those resolutions.
