Programmer(Execution): Programmer persona loaded and selected for the root-cause type repair and CMS reader-boundary implementation.

Round-2 type-fix handoff, 2026-10-22. Branch `codex/r2-tsc`, starting HEAD `1f13da62db0626e9fa367a67624802307c65c6f2`. No commits, installs, builds, application servers, provider calls or tests. No test files changed. All started type-check processes finished.

Inputs: dispatched finding 33 and the supplied 33-diagnostic `tsc-errors.txt`; `.cloud-coord/round2-FIX-REPORT.md`; canonical architecture sections 13/14, project memory and GOV-ADR-001; existing post, SEO and widget owners and installed Jini contracts. Local architecture/memory files were absent, so `/Users/la/Programming/Tovu/ADS-memory` was read. Graph MCP tools were unavailable; direct source searches were the fallback. The dispatch supplies the bounded implementation contract; no independent spec certification is claimed.

Root cause: the merge widened the raw stored `PostKind` to include `email-template`, while content getters and authoring results still advertised unrestricted `PostRecord`. Existing runtime exclusions were consequently invisible to TypeScript. SEO/sitemap and Jini widget host ports also received unrestricted raw repository readers. Widening Jini's public types would have admitted a storage-only document into content readers.

The fix retains raw `PostRecord`/`PostRepoPort` for email authoring, slug reservation, recovery and trash. `PublicPostRecord` narrows the existing `PublicPostKind`, and `isPublicPost` owns the explicit post/page allowlist. Existing content getters return that narrowed record after their kind/liveness guards. Create/update results preserve the same invariant, including the update no-op re-read. `createPublicPostReader` supplies kind-filtered id, slug and list reads to SEO/sitemap, widget dependency composition and all four public HTML embed bindings. It delegates to the actual repository receiver, keeps whole records for CAS/revisions, and leaves writes with the captured original owner. Public render/preview/template contracts accept the narrower record. Both content DTO serializers refuse a raw email-template row with `PostNotFoundError`.

Behavior: valid posts/pages keep their existing publication, schedule, trash, template and member-access behavior. Email templates are excluded by kind even if incorrectly marked published. They cannot be content API records, SEO/sitemap entries or widget hosts/references through these bindings. The update tool refuses a template before theme-template lookup. Mail template HTML authoring and raw persistence remain available. No schema, package, provider, migration or storage-lifecycle changes.

Files changed (11 production files):

- `apps/website/src/features/post/post.ts` — public record/reader contracts, shared allowlist/read adapter, narrowed content and create/update results.
- `apps/website/src/features/post/index.ts` — exports for the existing post owner.
- `apps/website/src/features/post/preview-tool.ts` — post/page preview contract.
- `apps/website/src/features/post/template-options.ts` — public kind contract.
- `apps/website/src/features/post/tool-registrations.ts` — validated kind return type and template-safe update target.
- `apps/website/src/features/seo/index.ts` — filtered SEO/sitemap read binding, original write ownership.
- `apps/website/src/features/widgets/deps.ts` — filtered Jini read view, original captured write repository.
- `apps/website/src/server/inbound/admin-http/routes/posts/template-preview-render.ts` — narrowed render contract.
- `apps/website/src/server/inbound/public-http/http/shared/post.ts` — fail-closed content serializers.
- `apps/website/src/server/inbound/public-http/http/site/render.ts` — narrowed public render contract.
- `apps/website/src/server/inbound/public-http/routes/site/pages.ts` — narrowed public records and filtered HTML embed bindings.

Verification: final `nice -n 10 npx tsc --noEmit -p tsconfig.json` **exited 0 with no TypeScript diagnostics**. Working directory: `/private/tmp/tovu-r2-typefix-__q78x7t`. It contains copies of this checkout's unchanged `package.json`/`tsconfig.json`, an `apps` symlink to this checkout's actual source tree, and a `node_modules` symlink to the already-installed canonical `/Users/la/Programming/Tovu/node_modules`. No source snapshot or generated declarations substituted for the changed source. Final log: `/private/tmp/tovu-r2-typefix-canonical-final-tsc.txt`. The host printed `nice: setpriority: Operation not permitted`, but ran TypeScript successfully and returned 0. `git diff --check` also passed.

Environment limitation: invoking the same command directly at this clone's root exits 2 because its pre-existing `node_modules/@jini-ai/*` links target stale sibling `jini-int/packages/*/dist` packages; the baseline showed hundreds of unrelated missing exports. A source-iteration check under those links recorded 378 diagnostics in `/private/tmp/tovu-r2-typefix-tsc.txt`. No dependency links were changed. The green verification above uses the canonical installed dependencies underlying the supplied 33-error report. The clone's own dependency setup still needs correction before a direct root invocation can be a release gate.

Reuse: content-kind isolation; searched `apps/website/src` and `/Users/la/Programming/Jini/packages/cms/src` for `PublicPost`, public readers and kind filtering; inspected `post.ts` content getters, raw repo methods, Jini widgets host ports and SEO ports; extended the existing Tovu post reader owner and its `PublicPostKind`, then called that reader from host adapters. This filter depends on Tovu's stored document kinds and remains in the CMS product boundary; no generic parallel Jini service was added. Existing public getters and the type guard are reused rather than casting individual consumers.

Architecture audit: PASS for the scoped source changes. Checked raw-storage versus public-reader separation, Jini host-port compatibility, dependency direction, complete CAS/revision records and captured repository receiver/write ownership. Architecture sections 13/14 and GOV-ADR-001 remain respected; no new mutation gateway or independent lifecycle. Existing transaction, hook, slug and scheduling why-comments remain with their owners. The new reader factory/methods and changed update-target helper use required-object/optional-object signatures. Type predicates/Array.filter callbacks retain language-required scalar signatures; existing serializer/parser/private builder ABIs remain compatible.

Function-quality semantic assessment (no separate metric/test tool was run):

| Unit | Disposition | Findings | Local action |
|---|---|---|---|
| `isPublicPost` | NO_RECORDED_FINDINGS | None in semantic review | Explicit allowlist; handles null/missing rows. |
| `createPublicPostReader` and methods | NO_RECORDED_FINDINGS | None in semantic review | One existing repo call per method; id/slug O(1) beyond repo cost, list O(n) time/space; no writes or caches. |
| Existing content getters/create/update/no-op result | NO_RECORDED_FINDINGS | None in semantic review | Narrow return contracts follow real guards and preserve complete records. |
| SEO/widget/HTML bindings | NO_RECORDED_FINDINGS | None in semantic review | One shared reader; write ownership unchanged. |
| Update target and serializers | NO_RECORDED_FINDINGS | None in semantic review | Templates fail as not-found before projection/theme lookup. |

New predicates/reader callbacks are below the requested complexity ceiling of 10 by inspection; existing large functions were not expanded with new decision chains. No numeric complexity measurement or runtime coverage claim is made. Zero-findings skepticism rechecked missing rows, published templates, mixed post/page/template lists, scheduled/trashed rows, raw slug reservation and recovery, prototype receivers, no-op update races, variable names, full-row write fidelity and error propagation. Runtime/coverage evidence remains unmeasured under the explicit no-tests restriction.

Coordinator/testfix follow-up: static inspection found that `features/widgets/__tests__/unit/deps.unit.test.ts:51` asserts raw repository object identity, which intentionally changes to a filtered read view. Its lookup fixture at line 93 also omits the required `kind`; the explicit allowlist now refuses that invalid fixture. No tests were run or changed. The separate testfix owner should assert filtered read behavior plus captured original write ownership and provide valid post/page fixture kinds. New boundary probes should include a published email template by id/slug and in a mixed SEO/sitemap list; this handoff does not claim those probes ran.

Pre-completion: all 33 supplied diagnostic sites compile with canonical dependencies; no `as any`, ignores, dependency changes or test weakening; changed source stays within the dispatched readers/host bindings. Self-validation beyond TypeScript was not run because the dispatch permits only the read-only type check. Suggested next assignee: Coordinator to integrate these uncommitted source changes, reconcile the separate testfix job and correct this clone's dependency links before running its direct root release gate.
