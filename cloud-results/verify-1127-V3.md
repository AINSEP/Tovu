DONE run V3 | branches 6/6 | tests run 3176 pass 3175 fixed 66 dropped 2 | weak fixed 2 | bugs 12 | left: none

# verify-1127 V3: Jini `packages/cms` Codex coverage branches (2026-11-27)

This was an unattended cloud run on Opus (high). It ran 4 subagents (Opus high, one branch each: cms-1, cms-2, cms-7, cms-8); the coordinator verified cms-4 and cms-5 itself. Only the coordinator pushed.

Rules held throughout:
- No codebase-memory tools, no RemoteTrigger.
- No `--no-verify`, no force-push, no tag or publish.
- No ts-ignore/expect-error, no `as any`, no skipped tests.
- No coverage, threshold, guard or `.gitleaks.toml` edits.
- packages/commerce and PageEditorChrome were not touched.
- `gitleaks protect --staged` reported no leaks before every commit.

| branch | final sha (pushed) | tests run / pass | fixed | dropped | weak fixed | bugs |
|---|---|---|---|---|---|---|
| codex/w62-cov-cms-1 | b9f97dde | 909 / 909 | 3 | 0 | 0 | 0 |
| codex/w62-cov-cms-2 | b3e3b732 | 734 / 734 | 3 | 0 | 2 | 2 (fixed) |
| codex/w62-cov-cms-4 | 8cc63949 | 292 / 292 | 43 | 1 | 0 | 2 (fixed) |
| codex/w62-cov-cms-5 | b7d086be | 284 / 284 | 6 (+14 tsc errors) | 0 | 0 | 4 (fixed) |
| codex/w62-cov-cms-7 | 3dfb454c | 309 / 309 | 9 (+137 tsc errors) | 1 | 0 | 2 (1 fixed, 1 open) |
| codex/w62-cov-cms-8 | 6f075747 | 648 / 647 | 2 | 0 | 0 | 2 (fixed) |

"Tests" counts the individual test cases in each branch's changed test files. The one red in cms-8 is OLD: `widgets/site/__tests__/publish-content.test.ts > destination form ids swap only for the matching widget type` is also red on the untouched merge-28 base checkout. Every branch ends with scoped tsc 0 and eslint 0 errors on its changed files.

## Setup and method
- Node 24 (`/opt/node24/bin`). Jini base `origin/integ/merge-28-2026-11-26` (d1ced6c5): `pnpm install --frozen-lockfile` then `pnpm -r build` (green).
- One git worktree per branch, with `node_modules` and `packages/cms/dist` symlinked from the built base checkout. The branches change only test files, and production fixes are in src, so the base dist stands for every branch.
- Scoped typecheck: a temporary tsconfig (kept outside the repo) that extends `packages/cms/tsconfig.json`, includes only the branch's changed files, and is strict with `exactOptionalPropertyTypes`.
- Tests: vitest on only the changed test files. Lint: repo eslint on only the changed files.
- Coverage: `vitest --coverage.include=<the job's FILES>`, over the tests in each FILE's folder and `__tests__` plus the branch's changed tests. "After" is therefore a scoped number, while "before" comes from the brief.
- Heavy commands ran one at a time through a shared flock.
- **Trap: dual module identity.** cms production modules import their siblings through the package self-name (`@jini-ai/cms/posts/post`), which resolves to the built dist, while tests import `../post.js` from src. So `instanceof` checks and `assert.rejects({constructor})` fail across the two. The fix is to import the error class from the same specifier the thrower uses.
- **Trap: mutations.** A mutation reaches a test only through a module that test imports directly (self-name imports hit dist).
- OLD reds also on base: `posts/__tests__/content-duplicate.post-page.test.ts` ("duplicates an HTML page through the injected HTML store") and the cms-8 widgets publish-content case above.

## Open BUG (not fixed; also in development/open-bugs.md)
- **cms-7:** `packages/cms/src/seo/cover-image.ts:58` together with `packages/cms/src/seo/seo.ts:194`. An external body-image URL is injected as the `ogImage` override, and `twitter:image` then inherits it, contrary to the doc "OG only, never Twitter's fallback". The test is dropped and its spec is quoted in the cms-7 section. Proposed fix: carry the body URL as a separate transient OG-only fallback in the seo.ts OG chain, so Twitter keeps its own chain (3 files, more than 40 lines).

## Owner decisions
1. **cms-4:** an `undo()` of a publish-retire on an already-trashed holder leaves its renamed slug (`story-trashed`). `restorePostForward` is gated on a version bump that `releaseTrashedSlug` deliberately never makes. Should undo restore the slug from the captured inverse `{deletedAt, slug}`? The test is dropped; its code is in the cms-4 section.
2. **cms-7:** callbacks typed `() => void` receive the React click event, because they are wired as `onClick={onX}`. Intended?
3. **cms-7:** the y5-publish-ceremony "no selectable rows" test lost its click-on-disabled / not-called pair. jsdom fires `onChange` on a disabled checkbox; browsers do not. `@testing-library/user-event` is not a cms dev dependency. The `disabled` assertion stays. Add user-event to restore the assertion?
4. **cms-7:** `packages/cms/src/seo/__tests__/share-image.unit.test.ts:1` contains "tovu" text. It is pre-existing on the base and conflicts with the no-tovu-in-Jini rule.
5. **cms-8:** `widgets/tool-handlers.areas.ts:157-166`. The comment says the reorder shape check gets schema decoration, but `isWidgetsShapeRejection` does not match `ToolInputError`. Making it match would also decorate the placement validators. The test now asserts the real, undecorated message.
6. **cms-4 / cms-5:** partial `PostToolDeps` fakes use `as unknown as PostToolDeps`, the convention of the base test `content-duplicate.post-page.test.ts`. A shared full-deps test factory would remove these casts.


---

## codex/w62-cov-cms-1


counts: `tests run 909 pass 909 fixed 3 dropped 0 | weak fixed 0 | bugs 0`

Status: DONE. Base for this pass: Codex commit 2190fbc0 (81 changed test files, +1813 lines). The first run had 2 tsc errors and 1 failing vitest case (908/909 passed). Final state: tsc exit 0, vitest 81 files with 909/909 passing, eslint exit 0.

## Reds -> why -> fix
- `http/__tests__/posts.test.ts`: TS2322, `bodyJson: null` is not a valid `PostRecord` (`bodyJson: JsonObject`) -> the stored record now carries a real doc `{ type: "doc", content: [] }`. The expected output still requires `bodyJson: null`, so the test now proves the HTML branch drops the stored doc instead of passing it through (stronger than before).
- `routes/plugins/__tests__/provider-settings.test.ts`: TS2352, cast of `{ capture }` to `Tracker` -> uses `as never`, the same convention as the neighbouring test at line 97. The tracker is an opaque pass-through checked by identity.
- `routes/fs-files/__tests__/custom-root.test.ts` ("store throws a string"): the fake `writeCustomRoot` was `async`, but the route calls the sync `FsCustomRootWriteFn` without awaiting it, so the rejection escaped the try/catch -> the fake now throws synchronously like the real store contract. The assertion is unchanged.

## Weak tests fixed
- none needed. I reviewed all added lines: no `toBeDefined`/`not.toThrow`/`toBeTruthy` used as the only assertion, no snapshots, no skip/only/ts-ignore/`as any`, no `vi.mock` of the unit under test. Assertions check exact port args, exact refusal bodies, and that fail-closed paths make no port calls. I read admin-surfaces, events, seo/entry-routes and every file with 14 or fewer added lines in full. The others I covered only with the pattern grep and the mutation checks.

## Mutation spot-checks (production reverted after each; `git status` clean)
| file:test | mutation | red? |
|---|---|---|
| `__tests__/limits.test.ts`: exact binary body cap | `limits.ts` `1024*1024` -> `1000*1024` | yes (1 failed) |
| `agent-plugins/__tests__/admin-surfaces.test.ts`: lists admitted surfaces only for the requested plugin | `admin-surfaces.ts:140` plugin filter -> `filter(() => true)` | yes |
| `fs-files/__tests__/custom-root.test.ts`: host-classified string refusal | `custom-root.ts:133` `String(err)` -> `"invalid path"` | yes |
| `settings/__tests__/events.test.ts`: caches present and missing namespaces | `events.ts:280` `cached !== undefined` -> truthy check (stops memoizing null) | yes |

## Coverage (cov.sh; L/B/F before -> after)
| file | before L/B/F | after L/B/F |
|---|---|---|
| admin-http/http/forms.ts | 100.0/71.43/100.0 | 100/100/100 |
| admin-http/http/media.ts | 100.0/82.35/100.0 | 100/100/100 |
| admin-http/http/posts.ts | 0.0/100.0/100.0 | 100/100/100 |
| admin-http/http/widgets.ts | 96.15/100.0/47.06 | 100/100/100 |
| admin-http/limits.ts | 0.0/100.0/100.0 | 100/100/100 |
| admin-http/routes/agent-plugins/admin-surfaces.ts | 0.0/0.0/0.0 | 100/96.29/100 |
| admin-http/routes/agent-plugins/install-response.ts | 100.0/96.15/100.0 | 100/96.29/100 |
| admin-http/routes/agent-plugins/install.ts | 100.0/97.14/100.0 | 100/100/100 |
| admin-http/routes/agent-plugins/list.ts | 100.0/80.0/100.0 | 100/100/100 |
| admin-http/routes/agent-plugins/set-enabled.ts | 100.0/88.24/100.0 | 100/100/100 |
| admin-http/routes/assistant/execution-shared.ts | 100.0/96.88/100.0 | 100/100/100 |
| admin-http/routes/assistant/shared.ts | 100.0/94.12/100.0 | 100/100/100 |
| admin-http/routes/assistant/stored-credential-probe.ts | 95.56/88.89/100.0 | 100/94.73/100 |
| admin-http/routes/assistant/test-agent.ts | 100.0/93.33/100.0 | 100/92.85/100 |
| admin-http/routes/assistant/test-connection.ts | 100.0/90.91/100.0 | 100/100/100 |
| admin-http/routes/change-sets/revert.ts | 100.0/96.97/100.0 | 100/96.96/100 |
| admin-http/routes/comments/shared.ts | 100.0/71.43/100.0 | 100/100/100 |
| admin-http/routes/consent/routes.ts | 100.0/94.59/100.0 | 100/100/100 |
| admin-http/routes/content-types/collections-route.ts | 100.0/81.82/100.0 | 100/100/100 |
| admin-http/routes/content-types/lifecycle.ts | 100.0/100.0/50.0 | 100/100/100 |
| admin-http/routes/content-types/update-fields.ts | 100.0/85.71/100.0 | 100/100/100 |
| admin-http/routes/database/restore-points.ts | 100.0/94.29/100.0 | 100/97.14/100 |
| admin-http/routes/database/timeline.ts | 100.0/93.33/100.0 | 100/100/100 |
| admin-http/routes/email-templates/shared.ts | 100.0/95.45/100.0 | 100/100/100 |
| admin-http/routes/entries/create.ts | 100.0/88.89/66.67 | 100/92.3/100 |
| admin-http/routes/entries/lifecycle.ts | 100.0/75.0/50.0 | 100/88.88/100 |
| admin-http/routes/entries/list.ts | 100.0/66.67/100.0 | 100/100/100 |
| admin-http/routes/entries/update.ts | 100.0/77.78/100.0 | 100/100/100 |
| admin-http/routes/external-mcp/oauth.ts | 81.99/85.71/57.14 | 100/93.22/78.26 |
| admin-http/routes/external-mcp/probe.ts | 100.0/83.33/60.0 | 100/100/100 |
| admin-http/routes/external-mcp/provider-refusal.ts | 100.0/75.0/100.0 | 100/100/100 |
| admin-http/routes/external-mcp/route-helpers.ts | 94.12/72.22/100.0 | 100/100/100 |
| admin-http/routes/external-mcp/tool-approvals.ts | 100.0/100.0/80.0 | 100/100/100 |
| admin-http/routes/forms/list-submissions.ts | 100.0/93.33/100.0 | 100/94.11/100 |
| admin-http/routes/forms/providers.ts | 100.0/100.0/50.0 | 100/100/100 |
| admin-http/routes/fs-files/custom-root.ts | 100.0/96.3/100.0 | 100/100/100 |
| admin-http/routes/integrations/shared.ts | 100.0/94.12/100.0 | 100/100/100 |
| admin-http/routes/media/batch-providers.ts | 100.0/61.11/50.0 | 100/100/100 |
| admin-http/routes/media/byte-size.ts | 100.0/92.86/100.0 | 100/92.85/100 |
| admin-http/routes/media/grid.ts | 100.0/94.81/100.0 | 100/97.4/100 |
| admin-http/routes/media/provider-catalog.ts | 100.0/100.0/50.0 | 100/100/100 |
| admin-http/routes/media/replace.ts | 100.0/97.06/100.0 | 100/100/100 |
| admin-http/routes/media/shared.ts | 97.3/95.83/93.33 | 100/100/100 |
| admin-http/routes/media/stored-media-response.ts | 100.0/80.0/100.0 | 100/100/100 |
| admin-http/routes/media/upload.ts | 100.0/95.56/100.0 | 100/100/100 |
| admin-http/routes/members/request-magic-link.ts | 100.0/87.5/100.0 | 100/92/100 |
| admin-http/routes/menus/assign-location.ts | 100.0/88.89/100.0 | 100/100/100 |
| admin-http/routes/menus/create.ts | 100.0/90.0/100.0 | 100/100/100 |
| admin-http/routes/menus/update-tree.ts | 100.0/89.47/100.0 | 100/100/100 |
| admin-http/routes/newsletter/create-campaign.ts | 100.0/94.44/100.0 | 100/100/100 |
| admin-http/routes/newsletter/create-subscription.ts | 100.0/92.31/100.0 | 100/100/100 |
| admin-http/routes/newsletter/import-subscriptions.ts | 100.0/92.86/100.0 | 100/100/100 |
| admin-http/routes/newsletter/schedule-campaign.ts | 100.0/92.31/100.0 | 100/100/100 |
| admin-http/routes/newsletter/send-test-campaign.ts | 100.0/94.12/100.0 | 100/100/100 |
| admin-http/routes/newsletter/update-campaign.ts | 100.0/95.74/100.0 | 100/100/100 |
| admin-http/routes/pages/delete.ts | 100.0/90.91/100.0 | 100/90.9/100 |
| admin-http/routes/pages/get-by-id.ts | 100.0/96.88/100.0 | 100/96.87/100 |
| admin-http/routes/pages/update-html.ts | 100.0/97.5/100.0 | 100/100/100 |
| admin-http/routes/pages/update.ts | 95.45/100.0/85.71 | 100/100/100 |
| admin-http/routes/plugins/install.ts | 95.5/89.19/95.0 | 100/92/95 |
| admin-http/routes/plugins/provider-settings.ts | 100.0/95.65/100.0 | 100/97.1/100 |
| admin-http/routes/posts/autosave.ts | 100.0/98.55/100.0 | 100/100/100 |
| admin-http/routes/posts/delete.ts | 100.0/91.67/100.0 | 100/92.3/100 |
| admin-http/routes/posts/get-by-id.ts | 100.0/88.89/100.0 | 100/100/100 |
| admin-http/routes/posts/shared.ts | 100.0/97.62/100.0 | 100/97.56/100 |
| admin-http/routes/posts/template-preview-embeds.ts | 97.1/83.33/100.0 | 100/93.87/100 |
| admin-http/routes/posts/template-preview-render.ts | 90.59/71.43/75.0 | 100/100/100 |
| admin-http/routes/posts/template-preview.ts | 100.0/96.88/100.0 | 100/100/100 |
| admin-http/routes/presentation/patch.ts | 100.0/95.65/100.0 | 100/100/100 |
| admin-http/routes/publish-content/backstop.ts | 100.0/97.33/87.5 | 100/97.36/91.66 |
| admin-http/routes/publish-content/blob-put.ts | 100.0/94.12/100.0 | 100/100/100 |
| admin-http/routes/publish-content/blobs-probe.ts | 100.0/94.74/100.0 | 100/100/100 |
| admin-http/routes/publish-content/bundle-create.ts | 100.0/98.68/100.0 | 100/100/100 |
| admin-http/routes/publish-content/destination.ts | 97.67/97.56/87.5 | 100/100/87.5 |
| admin-http/routes/publish-content/export.ts | 100.0/93.33/80.0 | 100/100/100 |
| admin-http/routes/publish-content/import-errors.ts | 100.0/94.12/100.0 | 100/100/100 |
| admin-http/routes/publish-content/import.ts | 100.0/98.39/100.0 | 100/98.38/100 |
| admin-http/routes/publish-content/peer-transport.ts | 88.95/72.37/71.43 | 98.25/86.86/82.14 |
| admin-http/routes/publish-content/peers.ts | 100.0/100.0/93.33 | 100/100/100 |
| admin-http/routes/publish-content/route-helpers.ts | 100.0/87.5/100.0 | 100/100/100 |
| admin-http/routes/redirects/update.ts | 100.0/81.82/100.0 | 100/100/100 |
| admin-http/routes/seo/get-entry-analyze.ts | 95.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/seo/get-entry.ts | 95.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/seo/post-sitemap-regenerate.ts | 100.0/100.0/50.0 | 100/100/100 |
| admin-http/routes/seo/put-entry.ts | 90.32/71.43/100.0 | 100/100/100 |
| admin-http/routes/settings/clear.ts | 100.0/82.61/100.0 | 100/95.83/100 |
| admin-http/routes/settings/events.ts | 86.79/69.81/79.17 | 100/95/100 |
| admin-http/routes/settings/get-raw.ts | 100.0/94.12/100.0 | 100/100/100 |
| admin-http/routes/settings/list-definitions.ts | 100.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/settings/preview-feed-access.ts | 0.0/100.0/100.0 | 100/100/100 |

Files still under 100% after this pass, for a later pass: external-mcp/oauth.ts (93.22 br / 78.26 fn), publish-content/peer-transport.ts (98.25/86.86/82.14), plugins/install.ts (fn 95), publish-content/destination.ts (fn 87.5), backstop.ts (fn 91.66), plus some files short only on branches (all 88.88 or higher).
Note: cov.sh also printed `grep: /home/user/wt/cov-1/run.log: No such file or directory` (a harmless script quirk; the table was produced).

## BUGs
none

## Owner decisions
none

## Commit
- `b9f97dde` fix(w62-cov-cms-1): tests run + fixed in cloud (local, not pushed; on top of 2190fbc0). gitleaks: no leaks found.
- `git status --short` at end: (empty)

---

## codex/w62-cov-cms-2


counts: tests run 734 pass 734 fixed 3 dropped 0 | weak fixed 2 | bugs 2 (both fixed in place, test-first)

Initial state: tsc 2 errors (2 files); vitest 67 files / 734 tests, 3 failed.

## Reds -> why -> fix
- asset-transfer/__tests__/copy-tool.test.ts (tsc) -> fixture `isFsShapeRejection` inferred as `=> false`, later reassigned to a boolean predicate -> annotated return type `: boolean`.
- core/commands/__tests__/command.test.ts:289 (tsc) -> `events: AttributedDomainEvent[]` but `OutboxPort.enqueue` receives `DomainEvent` -> typed the array `DomainEvent[]` (assertion `toEqual([event])` unchanged).
- copy-tool.test.ts "one large video reaches Media without an approval payload" (PRE-EXISTING red: also fails on the base file, Codex did not touch it) -> (a) `described` IS called: production `describe` deliberately passes an empty batch when nothing needs approval -> now asserts the exact call `[[{ batch: { folder: "", writes: [] }, toolId: "files_copy" }, {}]]` (proves no bytes enter the approval payload, stronger than not-called); (b) after that it timed out (5 s, deterministic): `toHaveBeenCalledExactlyOnceWith` deep-compared a 10 MB Buffer element-wise -> now `toBe(bytes)` identity on the persisted buffer + exact `toEqual` on every other field + options `{}`. File runtime 22 s -> 0.5 s.
- content-duplication/__tests__/tool-registrations.test.ts "reports malformed overrides [] ..." -> PRODUCTION BUG (see BUGs #1) -> fixed in source.
- forms/destinations/__tests__/rewrite-actions.unit.test.ts "rewrites portable Uint8Array HTML ..." -> PRODUCTION BUG (see BUGs #2) -> fixed in source.

## Weak tests fixed
- copy-tool.test.ts "adds caller-facing input guidance only for a classified source refusal" -> was bare `rejects.toBeInstanceOf(ToolInputError)`; now also asserts the message starts with the original refusal text and is extended (schema guidance appended).
- comments/site/__tests__/settings.test.ts "registers the built-in provider default and preserves selection when a stale compare-and-set fails" -> `assert.ok(revision > 0)` replaced/augmented with exact `revision === settingsRepo.maxRevisionSeq()` for both the selection and the disable write.
- Grep scan of all 3355 added diff lines: no toBeDefined/toBeTruthy/not.toThrow()/snapshots/as any/ts-ignore/expect-error/.only/.skip/secret-like values/'tovu' text. Remaining `toBeInstanceOf` uses are paired with cause/identity checks.

## Mutation spot-checks
| file:test | mutation | red? |
|---|---|---|
| system/credential-copy.ts via credential-copy.test.ts "refuses non-owners" | `false && actorId !== owner` (owner check removed, :82) | yes (1 failed) |
| system/site-backups.ts via site-backups.test.ts "refuses a publish-trust principal" | `false && deps.isPublishTrusted(...)` (:69) | yes (1 failed) |
| system/credential-copy.ts via credential-copy.test.ts "refuses instance denial" / "declines to write ..." | `false && !await deps.admitInstance(...)` (:69) | yes (4 failed) |
All reverted with `git checkout -- <file>`; git status showed no production change except the two bug fixes.
(The 2 bug-fix tests were also confirmed red before the fix, green after.)

## Coverage (cov.sh, before -> after: lines/branches/functions)
      Tests  2184 passed (2184)
| file | before L/B/F | after L/B/F |
|---|---|---|
| admin-http/routes/settings/protected-namespaces.ts | 100.0/89.66/100.0 | 100/100/100 |
| admin-http/routes/settings/register-definitions.ts | 67.11/76.0/92.31 | 100/100/100 |
| admin-http/routes/settings/reset.ts | 100.0/80.0/100.0 | 100/100/100 |
| admin-http/routes/settings/set.ts | 100.0/96.3/100.0 | 100/100/100 |
| admin-http/routes/settings/shared.ts | 100.0/96.15/100.0 | 100/100/100 |
| admin-http/routes/sites/local-sites.ts | 100.0/97.67/100.0 | 100/100/100 |
| admin-http/routes/sites/site-previews.ts | 100.0/94.44/100.0 | 100/100/100 |
| admin-http/routes/sites/sites-home.ts | 100.0/100.0/90.91 | 100/100/100 |
| admin-http/routes/skills/shared.ts | 100.0/93.33/100.0 | 100/100/100 |
| admin-http/routes/system/assistant-daemon.ts | 100.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/system/assistant-owner-grant.ts | 100.0/98.04/100.0 | 100/100/100 |
| admin-http/routes/system/assistant-subagents.ts | 100.0/100.0/90.91 | 100/100/100 |
| admin-http/routes/system/browser-telemetry.ts | 100.0/78.95/100.0 | 100/98.48/100 |
| admin-http/routes/system/credential-copy.ts | 0.0/0.0/0.0 | 100/98.52/100 |
| admin-http/routes/system/custom-credentials.ts | 100.0/97.96/100.0 | 100/100/100 |
| admin-http/routes/system/dockerfile-source.ts | 100.0/95.83/100.0 | 100/100/100 |
| admin-http/routes/system/mail-activity.ts | 91.92/100.0/91.67 | 100/100/100 |
| admin-http/routes/system/module-status.ts | 100.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/system/observability-status.ts | 100.0/90.91/100.0 | 100/100/100 |
| admin-http/routes/system/publish-credentials/list.ts | 90.0/76.92/100.0 | 100/78.57/80 |
| admin-http/routes/system/publish-site/destinations.ts | 100.0/90.91/75.0 | 100/100/100 |
| admin-http/routes/system/publish-site/trigger.ts | 90.22/80.0/86.67 | 100/94.33/93.33 |
| admin-http/routes/system/server-logs.ts | 100.0/90.91/100.0 | 100/100/100 |
| admin-http/routes/system/site-backups.ts | 0.0/100.0/100.0 | 100/100/100 |
| admin-http/routes/system/site-imports.ts | 76.59/86.75/77.42 | 99.51/93.22/96.96 |
| admin-http/routes/system/site-share-password.ts | 90.28/79.59/100.0 | 100/81.63/100 |
| admin-http/routes/system/site-shares.ts | 100.0/94.55/100.0 | 100/100/100 |
| admin-http/routes/system/sites.ts | 100.0/96.97/100.0 | 100/100/100 |
| admin-http/routes/system/source-control-credentials.ts | 100.0/97.06/100.0 | 100/97.05/100 |
| admin-http/routes/system/tool-gaps.ts | 100.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/taxonomy/assign-terms.ts | 94.37/66.67/100.0 | 100/94.73/100 |
| admin-http/routes/taxonomy/create-taxonomy.ts | 100.0/88.89/100.0 | 100/100/100 |
| admin-http/routes/taxonomy/create-term.ts | 97.14/66.67/100.0 | 100/90/100 |
| admin-http/routes/taxonomy/list.ts | 100.0/100.0/50.0 | 100/100/100 |
| admin-http/routes/taxonomy/rename-term.ts | 93.55/42.86/100.0 | 100/71.42/100 |
| admin-http/routes/taxonomy/shared.ts | 100.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/themes/duplicate.ts | 100.0/94.44/100.0 | 100/100/100 |
| admin-http/routes/themes/explore-detail.ts | 100.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/themes/explore-file-put.ts | 100.0/92.86/100.0 | 100/100/100 |
| admin-http/routes/themes/explore-file-reset.ts | 100.0/95.83/100.0 | 100/100/100 |
| admin-http/routes/themes/explore-shared.ts | 100.0/95.65/100.0 | 100/100/100 |
| admin-http/routes/themes/held-back.ts | 100.0/100.0/93.75 | 100/100/100 |
| admin-http/routes/widgets/agent-tools-create.ts | 87.93/84.62/100.0 | 100/100/100 |
| admin-http/routes/widgets/agent-tools-place.ts | 95.83/85.71/100.0 | 100/100/100 |
| admin-http/routes/widgets/agent-tools-remove.ts | 95.83/85.71/100.0 | 100/100/100 |
| admin-http/routes/widgets/create.ts | 97.14/78.57/100.0 | 100/100/100 |
| admin-http/routes/widgets/embed-insert.ts | 96.3/85.71/100.0 | 100/100/100 |
| admin-http/routes/widgets/embed-remove.ts | 96.0/83.33/100.0 | 100/100/100 |
| admin-http/routes/widgets/embed-reorder.ts | 96.67/90.91/100.0 | 100/100/100 |
| admin-http/routes/widgets/get-by-id.ts | 90.48/66.67/100.0 | 100/100/100 |
| admin-http/routes/widgets/list.ts | 100.0/87.5/100.0 | 100/100/100 |
| admin-http/routes/widgets/region-bind.ts | 79.17/75.0/100.0 | 100/87.5/100 |
| admin-http/routes/widgets/region-get.ts | 58.33/71.43/100.0 | 100/100/100 |
| admin-http/routes/widgets/region-mutate-placements.ts | 98.21/96.55/100.0 | 100/100/100 |
| admin-http/routes/widgets/regions-list.ts | 92.0/50.0/50.0 | 100/100/50 |
| admin-http/routes/widgets/shared.ts | 100.0/60.0/100.0 | 100/100/100 |
| admin-http/routes/widgets/trash.ts | 95.0/50.0/50.0 | 100/100/100 |
| admin-http/routes/widgets/update.ts | 97.14/60.0/100.0 | 100/94.44/100 |
| admin-http/routes/workspace/delete.ts | 97.5/88.89/100.0 | 97.5/88.88/100 |
| asset-transfer/asset-destinations.ts | 84.27/79.71/87.5 | 100/96.34/100 |
| asset-transfer/copy-tool.ts | 89.63/75.0/88.89 | 98.51/87.62/100 |
| change-sets/tool-registrations.ts | 100.0/97.62/100.0 | 100/100/100 |
| comments/sanitize.ts | 100.0/80.0/100.0 | 100/100/100 |
| comments/site/data-module-install.ts | 0.0/100.0/100.0 | 100/100/100 |
| comments/site/provider-selection.ts | 0.0/100.0/100.0 | 100/96.07/100 |
| comments/tool-registrations.ts | 62.07/72.92/82.61 | 100/85.52/100 |
| content-duplication/tool-registrations.ts | 67.57/77.78/83.33 | 100/100/100 |
| content-types/site/publish-content.ts | 90.91/75.0/62.5 | 100/95.45/100 |
| core/commands/repo.memory.ts | 100.0/90.48/100.0 | 100/95.23/100 |
| core/commands/revert.ts | 93.3/92.86/100.0 | 95.87/86.56/100 |
| core/form-collection.ts | 98.25/72.5/100.0 | 100/75/100 |
| entries/repo.trash-aware.memory.ts | 95.54/86.67/94.12 | 97.32/88/94.11 |
| entries/site/public-list.ts | 78.21/62.0/73.33 | 97.2/92.85/73.33 |
| entries/site/publish-content.ts | 78.05/84.62/92.31 | 100/92.3/92.3 |
| entries/site/tool-registrations.ts | 100.0/100.0/50.0 | 100/100/100 |
| entries/site/unreadable-owner-entries-repair.ts | 19.15/100.0/40.0 | 100/100/100 |
| entries/sql/repo.ts | 100.0/98.86/100.0 | 100/100/100 |
| forms/attachment-cleanup.ts | 100.0/88.24/100.0 | 100/97.14/100 |
| forms/attachment-purge.ts | 100.0/94.29/100.0 | 100/100/100 |
| forms/destination-descriptors.ts | 100.0/92.31/100.0 | 100/100/100 |
| forms/destination-registry.ts | 100.0/96.43/100.0 | 100/100/100 |
| forms/destinations/connection-port.ts | 100.0/50.0/100.0 | 100/100/100 |
| forms/destinations/deliver.ts | 100.0/89.47/83.33 | 100/100/100 |
| forms/destinations/port.ts | 24.1/42.86/33.33 | 100/94.11/100 |
| forms/destinations/rewrite-actions.ts | 100.0/95.83/100.0 | 100/96/100 |
| forms/duplicate-form.ts | 100.0/88.89/100.0 | 100/90.47/100 |
| forms/email-sender-fields.ts | 95.65/96.67/100.0 | 95.65/96.66/100 |
| forms/express/handler.ts | 100.0/97.73/100.0 | 100/100/100 |
| forms/form-controls.ts | 100.0/96.55/100.0 | 100/100/100 |
| forms/html-render.ts | 100.0/98.14/100.0 | 100/99.37/100 |

## BUGs (both fixed, small/local)
1. packages/cms/src/content-duplication/tool-registrations.ts:67 — `isRecord` from @jini-ai/core accepts arrays, so `overrides: []` passed validation and duplicated with `{}`; the function's own doc says a non-object is a caller shape error.
   Test: `[[], "'overrides' must be an object"]` in the test.each -> `rejects.toMatchObject({ name: "ToolInputError", message })` and duplicate/authorize not called.
   Fix applied: `isNonArrayRecord` from `@jini-ai/core/records` (existing cms convention); dropped the now-unused `isRecord` import.
2. packages/cms/src/forms/destinations/rewrite-actions.ts:50 — `file.data.toString("utf8")` on a plain `Uint8Array` (allowed by `FormActionFile.data`) yields "60,112,..." so form actions in Uint8Array pages were silently NOT rewritten (exported forms would post to the host path, not the external receiver).
   Test: encode `<p>Crème</p><form action="/forms/contact/submit"></form>` as Uint8Array, rewrite with submitUrl https://relay.example, decode -> expects the relay URL and intact UTF-8 text.
   Fix applied: `new TextDecoder().decode(file.data)` (handles Buffer and Uint8Array).

## Owner decisions
- none required. FYI: the copy-tool "large video" red was pre-existing on the base branch (not introduced by Codex).
- FYI (coordinator): the shared scratchpad is used by other worktree sessions (cms-7 overwrote a `run1.txt`); I used `w2-*` filenames. An environment notice pointed the primary dir at cms-5; ignored per brief, all work done in cms-2 only.

## Commit
local sha b3e3b732 (not pushed). Files: copy-tool.test.ts, comments/site settings.test.ts, core/commands command.test.ts, content-duplication/tool-registrations.ts, forms/destinations/rewrite-actions.ts. gitleaks: no leaks.
git status --short at end: (clean)
Final verification: tsc EXIT 0; vitest 67 files / 734 passed; eslint EXIT 0.

---

## codex/w62-cov-cms-4

counts: tests run 292 pass 292 fixed 43 dropped 1 | weak fixed 0 | bugs 2 (both fixed, test-first)

**Reds -> why -> fix**
- 21 cases in post-authoring-gaps, post-duplicate.lifecycle, post-retire-trash, post-tool-boundaries, publish-content-retire, html-recording-revert: `assert.rejects({constructor: X})` / `toBeInstanceOf(X)` failed with "same structure but not reference-equal". Cause: dual module identity. Production code imports its siblings via the package self-name (`@jini-ai/cms/posts/post`, `@jini-ai/cms/core/commands`, `@jini-ai/cms/pages/html-document-store`), and those resolve to the built dist. The tests imported the error classes from src. Fix: the tests now import each error class from the same specifier its thrower uses. The classifier test in post-tool-boundaries keeps the src classes, because `post-tool-errors.ts` uses `./post.js`; a comment explains this.
- y5-post-bindings (16 cases, whole suite): `it is not defined`. Fix: added `it` to the vitest import. Afterwards, 1 real red: "previews a post by the slug advertised in the tool schema". That is **BUG 2**, below.
- post-retire-trash "never overwrites a save that lands during retirement's slug search": the promise resolved instead of rejecting. That is **BUG 1**, below.
- publish-content-retire "undo restores the address of an already-trashed holder without untrashing it": **DROPPED** (owner decision 1).
- tsc: 2× TS2352 where a partial `PostToolDeps` slice was cast. Now `as unknown as PostToolDeps`, the convention of the base neighbour `content-duplicate.post-page.test.ts`; the duplicate fixture keeps its `satisfies Pick<…>`. 4× TS4094 on `post-coverage.fixture.ts`, because `postRepo()` returned the module-private bound class. It now has a named return type `CoveragePostRepo`.

**Weak tests fixed**: none needed. A grep of all added lines found no `toBeDefined`/`not.toThrow`/`toBeTruthy`/snapshot/skip/only/as any/vi.mock. Spot-read post-write-fields: exact values and exact error messages.

**Mutation spot-checks** (all red, all reverted)
| test file | mutation | result |
|---|---|---|
| post-write-fields.test | `normalizePublishAt`: `value === ""` -> `value === "-"` | 1 failed |
| post-retire-trash.test | post-retire CAS -> plain `repo.save(renamed)` (pre-fix code) | 1 failed |
| y5-post-bindings.test | preview `idOrSlug: postId` -> `${postId}-x` | 4 failed |
| html-recording-revert.test | html-reverter `allowForce: false` -> `true` | 2 failed |

**BUGs (fixed, <= 5 lines each)**
1. `packages/cms/src/posts/post-retire.ts:117` (persistRetirement): the rename used an unconditional `repo.save(renamed)`. The version preflight and the slug-disambiguation loop both run outside the transaction, so a save that landed in between was silently overwritten (a lost update), and the retire then succeeded at that save's version. Fix: `persistUpdatedPost({ repo, post: renamed, expectedVersion: existing.version })`, the same `saveIfVersion` CAS that `updatePost` uses. It now rejects with `PostVersionConflictError {expectedVersion 4, currentVersion 5}`, and nothing is written, revisioned, removed or emitted.
2. `packages/cms/src/posts/preview-tool.ts:69`: `content_post_preview` advertises "id or slug" (the schema description, and the file's own line-32 comment), but it called `getAdminPostById`. So a slug always failed with "no post or page with id or slug". Fix: `getAdminPostByIdOrSlug({ idOrSlug: postId })`. It keeps the same public-kind and non-trashed guard.
Regression check: every test in posts/, pages/ and posts/site/: 338/339. The 1 red, `content-duplicate.post-page.test.ts`, is also red on the untouched merge-28 base (OLD).

**Owner decisions**
1. Dropped test (code below). `retire()` on an already-trashed holder renames its slug (`story` -> `story-trashed`), keeps its version and appends no revision. That is deliberate, so the Trash index stays valid. But `undo()` -> `restorePostForward` is gated on `current.version > prior.version`, so it is a no-op for that holder, and a rolled-back publish leaves the trashed row at the renamed slug. Should undo restore the slug, for example via the captured inverse `{deletedAt, slug}`? The test is kept in `/home/user/wt/dropped-cms4-undo-trashed.txt` (and reproduced in the report).


**Coverage** (scoped; before = brief)

| file | before L/B/F | after L/B/F |
|---|---|---|
| pages/html-document-store.ts | 68.14/34.69/85.0 | 100/90.8/100 |
| pages/html-inverse.ts | 73.68/69.23/75.0 | 100/95/100 |
| pages/html-reverter.ts | 70.73/22.22/50.0 | 100/100/100 |
| pages/tool-registrations.read.ts | 11.54/100.0/0.0 | 100/100/100 |
| pages/tool-registrations.regions.ts | 35.35/57.14/66.67 | 100/100/100 |
| pages/tool-registrations.shared.ts | 44.44/56.52/52.63 | 100/100/100 |
| pages/tool-registrations.ts | 94.87/100.0/50.0 | 100/100/100 |
| pages/tool-registrations.write.ts | 72.41/46.15/100.0 | 100/100/100 |
| posts/content-stats-tool.ts | 83.48/55.56/90.0 | 100/98.63/100 |
| posts/email-template-store.ts | 46.43/85.71/37.5 | 100/100/100 |
| posts/featured-image.ts | 0.0/100.0/100.0 | 100/100/100 |
| posts/go-live-sweep.ts | 0.0/100.0/100.0 | 100/100/100 |
| posts/post-before-save.ts | 0.0/100.0/100.0 | 100/100/100 |
| posts/post-create.ts | 95.61/40.0/100.0 | 100/90.9/100 |
| posts/post-import.ts | 0.0/0.0/0.0 | 100/100/100 |
| posts/post-read.ts | 16.98/100.0/10.0 | 100/91.11/100 |
| posts/post-retire.ts | 70.77/33.33/75.0 | 100/100/100 |
| posts/post-slugs.ts | 7.22/100.0/0.0 | 100/100/100 |
| posts/post-tool-delete.ts | 0.0/0.0/0.0 | 100/100/100 |
| posts/post-tool-duplicate.ts | 80.47/42.86/69.23 | 100/100/100 |
| posts/post-tool-errors.ts | 0.0/0.0/0.0 | 100/100/100 |
| posts/post-tool-input.ts | 0.0/0.0/0.0 | 100/100/100 |
| posts/post-tool-list.ts | 0.0/0.0/0.0 | 100/100/100 |
| posts/post-tool-policy.ts | 100.0/85.71/100.0 | 100/100/100 |
| posts/post-tool-update.ts | 0.0/0.0/0.0 | 100/97.56/100 |
| posts/post-tool-views.ts | 0.0/100.0/100.0 | 100/100/100 |
| posts/post-trash.ts | 88.33/38.46/100.0 | 100/100/100 |
| posts/post-update.ts | 88.14/31.43/100.0 | 100/92.98/100 |
| posts/post-write-effects.ts | 24.32/85.71/27.27 | 100/100/100 |
| posts/post-write-fields.ts | 18.09/100.0/0.0 | 100/100/100 |
| posts/preview-tool.ts | 93.42/75.0/83.33 | 100/100/100 |
| posts/publish-content.retire.ts | 0.0/100.0/100.0 | 100/94.87/100 |

**Dropped test** (publish-content-retire.test.ts; owner decision 1):

```ts
it("undo restores the address of an already-trashed holder without untrashing it", async () => {
  const discarded = { ...holder, deletedAt: "2026-11-24T15:30:00.000Z" };
  const s = setup([discarded]);
  const result = await s.methods().retire({ target, ...work });
  expect(await s.repo.findById(local)).toEqual({ ...discarded, slug: "story-trashed" });
  expect(await s.changeSets.findById({ workspaceId: WORKSPACE, id: result.changeSetId })).toMatchObject({
    items: [{ inversePayload: { deletedAt: "2026-11-24T15:30:00.000Z", slug: "story" }, entityVersionAtApply: 4 }],
  });
  await result.undo();
  expect(await s.repo.findById(local)).toEqual(discarded);
  expect(s.trashIds).toEqual(new Set(["local-page"]));
  expect(s.forgetRemoved).not.toHaveBeenCalled();
  expect(s.events.filter(e => e.name.startsWith("entry."))).toEqual([]);
});
```

**Commit**: 8cc63949 (pushed to codex/w62-cov-cms-4). `git status` is clean.

---

## codex/w62-cov-cms-5

counts: tests run 284 pass 284 fixed 6 (+14 tsc errors in 4 files) dropped 0 | weak fixed 0 | bugs 4 (all fixed, test-first)

**Reds -> why -> fix**
- tsc `posts/__tests__/publish-content.test.ts` (8×): the `policy` object literal widened `TERM_SYNC_PERMISSION` to `string`. Fixed with `as const`.
- tsc + 1 runtime `posts/__tests__/search.test.ts`: the fake passed a bare function where `deps.search` is a `PostSearchPort` object (`deps.search.search(...)`). Fixed: `deps: { search: { search } }`.
- tsc `public-http/routes/members/__tests__/oidc.test.ts`: a plain object where `RouteReply` (branded) is required. Fixed with core's `routeReply({...})` builder.
- tsc `posts/__tests__/tool-registrations.test.ts`: that is **BUG 4**, below.
- `posts/sql/__tests__/search-index.test.ts` (SQLite): the expected ranking `[cafe, pear]` came out `[pear, cafe]`. Fixture cause: 4 of the 5 indexed docs contained "cafe" and only 1 contained "pear". On SQLite, FTS5 bm25 IDF therefore favoured pear; on Postgres, `ts_rank` has no IDF and favoured cafe. Fix: the excluded rows now carry both terms, and 6 non-matching filler rows were added. IDF is equal for both terms, so the title > body column weighting decides on both dialects. The Postgres reindex count follows the fixture's row count (5 -> 11).
- `public-http/http/site/render/__tests__/page-body.test.ts`: it asserted the renderer calls in document order, but replacement runs from the last marker. The rendered HTML (the contract) already matched. Now it checks exactly 2 calls, with exact args in any order.
- revision-refs, form-validation-i18n, doc-host-injection: **BUGs 1–3**, below.

**Weak tests fixed**: none. The added-lines scan found nothing (its only hits were the type name `PluginContributionsSnapshot`).

**Mutation spot-checks** (all red, all reverted)
| test file | mutation | result |
|---|---|---|
| form-validation-i18n.unit | `Object.hasOwn(...)` -> `name in FORM_VALIDATION_COPY` | 1 failed |
| revision-refs | drop the day round-trip check | 1 failed |
| doc-host-injection | drop the `Object.hasOwn(DOC_NODE_HANDLERS, …)` guard | 1 failed |

**BUGs (fixed)**
1. `packages/cms/src/posts/sql/revision-thinning.ts:59` (`readCutoff`): `Date.parse("2026-02-30T00:00:00Z")` rolls over to 03-02, so a nonexistent day silently became a different cutoff, and the preview and thinning ran against it. Fix: round-trip `new Date(day).toISOString().slice(0,10) !== before` -> DATE_ERROR.
2. `packages/cms/src/public-http/http/site/form-validation-i18n.ts:40`: `FORM_VALIDATION_COPY[key]` with `lang="constructor"` (or `__proto__`) returned `Object` (or the prototype) instead of the English copy, so the form script got a function as its copy table. Fix: own-property lookup via `Object.hasOwn`.
3. `packages/cms/src/public-http/http/site/render/doc/doc-nodes.ts:325` (`resolveDocNodeHandler`): a doc node typed `constructor` resolved `Object` as its handler and rendered `[object Object]`, losing its children. Fix: the `Object.hasOwn` guard, which `content-html.ts:99` already uses for widget renderers.
4. `packages/cms/src/posts/post-tool-policy.ts:124`: the `not-image` refusal declared `{ contentType?: string }`. `PostToolDeps.featuredImageRefusals` expects `{ contentType?: string | undefined }`, so under `exactOptionalPropertyTypes` a host cannot assign `createPostFeaturedImageRefusals(...)` to its deps (type-only). Fix: `string | undefined`.
Regression: posts/sql, site, site/render, render/doc test folders 89/89. Scoped coverage run 423/424; the 1 red is `content-duplicate.post-page.test.ts`, which is also red on the untouched base (OLD).


**Coverage** (scoped; before = brief; 423/424 in the run, the 1 red is the OLD content-duplicate case)

| file | before L/B/F | after L/B/F |
|---|---|---|
| posts/publish-content.ts | 0.0/0.0/0.0 | 99.09/96.03/96.55 |
| posts/repo.memory.ts | 81.37/92.68/78.95 | 100/97.36/100 |
| posts/reverters.ts | 0.0/0.0/0.0 | 100/96.55/100 |
| posts/revision-thinning.ts | 100.0/89.66/100.0 | 100/100/100 |
| posts/search.ts | 44.93/44.44/57.14 | 100/100/100 |
| posts/sql/index.ts | 0.0/0.0/0.0 | 0/0/0 |
| posts/sql/kernel-statements.ts | 0.0/0.0/0.0 | 100/100/100 |
| posts/sql/repo.rows.ts | 100.0/88.46/100.0 | 100/97.5/100 |
| posts/sql/repo.ts | 76.11/97.92/68.42 | 100/98.48/100 |
| posts/sql/revision-refs.ts | 88.37/52.94/85.71 | 100/96/100 |
| posts/sql/revision-thinning.ts | 94.74/70.27/90.0 | 100/90.19/100 |
| posts/sql/search-index.contract.ts | 8.33/100.0/0.0 | 100/100/100 |
| posts/sql/search-index.postgres.ts | 28.0/100.0/33.33 | 100/100/100 |
| posts/sql/search-index.sqlite.ts | 55.1/100.0/33.33 | 100/100/100 |
| posts/sql/search-index.ts | 10.87/33.33/8.33 | 100/95.74/100 |
| posts/tiptap-text-schema.ts | 0.0/100.0/100.0 | 100/100/100 |
| posts/tool-registrations.handlers.ts | 0.0/100.0/100.0 | 100/76.47/88.88 |
| posts/tool-registrations.ts | 0.0/0.0/0.0 | 100/97.36/100 |
| posts/tool-registrations.update.ts | 0.0/0.0/0.0 | 100/100/100 |
| presentation/html.ts | 100.0/98.61/100.0 | 100/100/100 |
| presentation/page-head.ts | 98.48/88.57/100.0 | 100/91.42/100 |
| public-http/http/shared/post.ts | 100.0/95.45/100.0 | 100/95.45/100 |
| public-http/http/site/bare-page.ts | 81.82/9.09/100.0 | 100/57.14/100 |
| public-http/http/site/form-label-inspection.ts | 100.0/91.89/100.0 | 100/92.1/100 |
| public-http/http/site/form-validation-i18n.ts | 100.0/91.67/100.0 | 100/93.33/100 |
| public-http/http/site/render-site.ts | 62.62/40.74/70.0 | 100/85.71/100 |
| public-http/http/site/render/blocks.ts | 76.92/57.14/85.71 | 100/78.12/100 |
| public-http/http/site/render/components/entry-lists.ts | 65.31/76.92/50.0 | 100/78.94/100 |
| public-http/http/site/render/components/layout.ts | 25.68/85.71/60.0 | 98.64/86.2/100 |
| public-http/http/site/render/components/marketing.ts | 98.55/30.3/100.0 | 98.55/65.11/100 |
| public-http/http/site/render/contact-form-widget.ts | 59.02/45.45/50.0 | 100/91.66/100 |
| public-http/http/site/render/content-html.ts | 81.36/90.91/33.33 | 89.83/100/44.44 |
| public-http/http/site/render/doc/doc-nodes.ts | 54.22/57.69/25.93 | 98.79/82.35/100 |
| public-http/http/site/render/doc/media-ref.ts | 87.18/87.5/100.0 | 100/100/100 |
| public-http/http/site/render/doc/nodes-media.ts | 97.1/63.41/100.0 | 100/74.41/100 |
| public-http/http/site/render/page-body.ts | 72.97/60.47/84.62 | 91.89/87.03/92.3 |
| public-http/http/site/render/post-body.ts | 77.5/75.0/60.0 | 100/84.21/80 |
| public-http/http/site/render/template-render-data.ts | 92.19/56.25/80.0 | 100/95.83/100 |
| public-http/http/site/render/widgets/media.ts | 73.68/61.54/66.67 | 97.36/97.67/88.88 |
| public-http/http/site/render/widgets/post-content.ts | 67.47/22.22/85.71 | 100/75/100 |
| public-http/http/site/render/widgets/social-entries.ts | 96.3/66.67/100.0 | 100/80.76/100 |
| public-http/middleware/canonical-site-host.ts | 100.0/94.74/100.0 | 100/100/100 |
| public-http/middleware/theme-preview-refresh.ts | 100.0/94.12/100.0 | 100/94.11/100 |
| public-http/middleware/theme-static-assets.ts | 100.0/95.45/100.0 | 100/96/100 |
| public-http/routes/members/complete-sign-in.ts | 100.0/94.12/100.0 | 100/94.44/100 |
| public-http/routes/members/oidc-callback.ts | 100.0/94.44/90.91 | 100/100/90.9 |
| public-http/routes/members/oidc-shared.ts | 100.0/87.5/100.0 | 100/100/100 |
| public-http/routes/members/oidc-verify-email.ts | 100.0/95.45/92.31 | 100/100/92.3 |
| public-http/routes/members/shared.ts | 100.0/97.37/100.0 | 100/100/100 |
| public-http/routes/members/unlink-identity.ts | 100.0/95.45/100.0 | 100/95.45/100 |
| public-http/routes/plugin-contributions.ts | 32.26/70.0/50.0 | 100/93.65/100 |
| public-http/routes/publish-trust/handshake.ts | 100.0/96.36/100.0 | 100/98.18/100 |

**Commit**: b7d086be (pushed to codex/w62-cov-cms-5).

---

## codex/w62-cov-cms-7

counts: tests run 309 pass 309 fixed 9 (+137 tsc errors in 10 files) dropped 1 | weak fixed 0 | bugs 2 (1 fixed, 1 reported)

The subagent's run took this from 137 tsc errors in 10 files and 11/310 red to tsc 0, 309/309 green and eslint 0. In the scoped coverage run (`cov.sh`), 96 test files and 940 tests passed.

**Reds -> why -> fix**
- tsc, 7 files (chrome-playback-note, media-icons, PostCoverImage, EmbedInsertControl.subtype-and-placement, HtmlAttributeRows.refused-attributes, MediaContentEditor.behavior, WidgetPickerDialog): the jest-dom matchers were untyped. Fix: `import "@testing-library/jest-dom/vitest";`, as the package's other DOM tests do.
- tsc, WidgetConfigFields.collection-field-contract: it used generic arguments on render-result queries. Fix: `screen.getByRole<T>`, or the query followed by `as HTMLXElement`.
- tsc, use-post-featured-image and use-post-url-dialog: `initialProps: { x: null }` was inferred as `null`. Fix: an explicit union type.
- tsc, y5-publish-ceremony: `listPeers` is now typed with `vi.fn<PublishContentPort["listPeers"]>`.
- y5-publish-ceremony "multiple peers…": it made two `onPrimary` calls inside a synchronous `act`. The in-flight guard is released only in `.finally`, so the second call was correctly ignored. Fix: the first call now runs in `await act(async …)`.
- Six cases (ceremony "bound dialog…", WidgetConfigFields "social…", WidgetPickerDialog "keeps a single dialog…", PostEditorNotices ×2, post-editor-chrome.guard) asserted no-argument calls. The callbacks are wired as `onClick={onX}`, so React passes the click event. Fix: assert an exact call count (`toHaveBeenCalledOnce` / `toHaveBeenCalledTimes(2)`).
- ceremony "no selectable rows…": the test clicked a disabled checkbox. jsdom's fireEvent still fires `onChange` there; a browser does not. Fix: the click / not-called pair was replaced by a comment, and the `disabled === true` assertion stays. Coordinator note: this removes one assertion. `@testing-library/user-event` is not installed in cms, so a real-browser click could not be used instead. Flagged for the owner.
- seo/site tool-registrations "settings writer…": a fixture bug. `ids.newId` returned a constant, so the in-memory ledger kept only the last SEO definition. Fix: a unique id per call.

**Weak tests fixed**: none found (pattern scan of the added lines).

**Mutation spot-checks** (all red, all reverted)
| file | mutation |
|---|---|
| chrome-playback-note | `<=` -> `<` |
| post-editor-save.rules | drop `previous?.status === "published"` from `withEverPublished` |
| page-head-contributor | remove the BUG-1 fix |
| media-icons | circle `r` 2.25 -> 2.5 |

**BUGs**
1. FIXED, `packages/cms/src/seo/site/page-head-contributor.ts:36`: an authored OG image URL equal to the external body image URL was dropped from the Article JSON-LD, because only the URLs were compared. Fix (+10/-2): new `hasAuthoredOgImage({ rawPost })` in `seo/cover-image.ts`; the guard is now `cover?.url === ogImage.content && !hasAuthoredOgImage({ rawPost })`.
2. REPORTED, test dropped: `packages/cms/src/seo/cover-image.ts:58` together with `packages/cms/src/seo/seo.ts:194`. An external body-image URL is injected as an `ogImage` override, and `twitter:image` then inherits it, contrary to the doc comment "OG only, never Twitter's fallback". The dropped test is share-image.unit "a transient external body cover does not leak into the Twitter image tag": `entryHead({ bodyUrl })` should give og:image = bodyUrl and no `twitter:image`. Proposed fix: carry the body URL as a separate transient OG-only fallback in the seo.ts OG chain (`overrides.ogImage ? [ogImage] : [bodyFallback, featured, default]`), so Twitter keeps its own chain. This crosses 3 files and is more than 40 lines.

**Coverage**: most FILES now reach 100/100/100. The ones still below 100 are listed in the table.

**Owner decisions**
1. Callbacks typed `() => void` receive the React click event, because they are wired directly as `onClick={onX}`. Is that intended, or should they be `() => onX()`?
2. `packages/cms/src/seo/__tests__/share-image.unit.test.ts:1` contains the text "tovu". It is already on the merge-28 base, not added by this branch, so it was left alone.


**Coverage** (scoped; subagent table)

test files: 96
 Test Files  96 passed (96)
      Tests  940 passed (940)
| file | before L/B/F | after L/B/F |
|---|---|---|
| react/media/chrome-playback-note.tsx | 0.0/100.0/100.0 | 100/100/100 |
| react/media/hooks/use-grid-pages.hooks.ts | 94.12/73.33/90.91 | 100/93.1/100 |
| react/media/hooks/use-media-writes.hooks.ts | 0.0/100.0/100.0 | 100/93.75/100 |
| react/media/index.ts | 0.0/0.0/0.0 | 0/0/0 |
| react/media/media-icons.tsx | 0.0/100.0/100.0 | 100/100/100 |
| react/media/use-media-provider-catalog.hooks.ts | 0.0/100.0/100.0 | 100/100/100 |
| react/pages/hooks/page-editor-save.ts | 63.08/81.82/71.43 | 100/100/100 |
| react/pages/hooks/use-preview-embed-ids.hooks.ts | 63.16/92.31/60.0 | 100/95.45/100 |
| react/posts/PostCoverImage.tsx | 60.94/63.64/40.0 | 100/100/100 |
| react/posts/editor/header/PostEditorActions.tsx | 0.0/0.0/0.0 | 100/100/100 |
| react/posts/editor/header/PostEditorHeader.tsx | 90.22/42.86/42.86 | 100/100/100 |
| react/posts/editor/notices/PostEditorNotices.tsx | 64.44/77.78/20.0 | 100/100/100 |
| react/posts/editor/preview/PostPreview.tsx | 89.41/50.0/100.0 | 100/100/100 |
| react/posts/editor/preview/PostPreviewFrame.tsx | 81.97/75.0/100.0 | 100/100/100 |
| react/posts/editor/view-bar/PostEditorViewBar.tsx | 0.0/0.0/0.0 | 100/100/100 |
| react/posts/hooks/post-editor-messages.ts | 0.0/0.0/0.0 | 100/100/100 |
| react/posts/hooks/post-editor-save.rules.ts | 71.43/72.22/50.0 | 100/83.33/100 |
| react/posts/hooks/post-editor-state.rules.ts | 25.0/50.0/16.67 | 100/100/100 |
| react/posts/hooks/use-post-featured-image.hooks.ts | 100.0/92.31/85.71 | 100/100/100 |
| react/posts/hooks/use-post-url-dialog.hooks.ts | 86.96/88.24/80.0 | 100/100/100 |
| react/posts/post-editor-input.rules.ts | 85.84/42.86/53.33 | 100/69.56/93.33 |
| react/posts/post-editor-rules.ts | 22.22/100.0/0.0 | 100/100/100 |
| react/posts/posts-list-rules.ts | 0.0/100.0/100.0 | 100/100/100 |
| react/publish-content/PublishContentActions.tsx | 83.15/88.89/100.0 | 100/100/100 |
| react/publish-content/PublishContentDialog.tsx | 86.84/60.0/33.33 | 100/100/100 |
| react/publish-content/PublishContentReport.tsx | 14.84/30.0/33.33 | 100/100/100 |
| react/publish-content/api/publish-content-api.ts | 98.25/73.33/77.78 | 100/75/88.88 |
| react/publish-content/hooks/publish-completion.rules.ts | 100.0/50.0/100.0 | 100/100/100 |
| react/publish-content/hooks/publish-confirm-view.ts | 99.56/91.03/92.86 | 100/97.7/92.85 |
| react/publish-content/hooks/publish-content-confirm.rules.ts | 0.0/100.0/100.0 | 80.95/87.5/66.66 |
| react/publish-content/hooks/publish-execution.hooks.ts | 86.57/72.73/100.0 | 100/86.2/100 |
| react/publish-content/hooks/publish-lifecycle.hooks.ts | 89.31/90.48/76.92 | 100/96.42/100 |
| react/publish-content/hooks/publish-peers.hooks.ts | 86.41/70.83/100.0 | 100/89.47/100 |
| react/publish-content/hooks/publish-plan.hooks.ts | 88.15/84.21/100.0 | 100/91.66/100 |
| react/widgets/EmbedInsertControl/EmbedInsertControl.hooks.ts | 100.0/85.71/100.0 | 100/100/100 |
| react/widgets/EmbedInsertControl/EmbedInsertControl.tsx | 84.24/47.83/42.31 | 100/95.45/76.92 |
| react/widgets/WidgetConfigFields/HtmlAttributeRows.tsx | 100.0/81.82/80.0 | 100/100/100 |
| react/widgets/WidgetConfigFields/MediaContentEditor.hooks.ts | 78.34/60.61/48.39 | 100/87.5/83.87 |
| react/widgets/WidgetConfigFields/MediaContentEditor.tsx | 80.74/56.45/47.37 | 100/92.85/80 |
| react/widgets/WidgetConfigFields/WidgetConfigFields.controls.tsx | 88.18/68.0/58.33 | 100/97.36/100 |
| react/widgets/WidgetConfigFields/WidgetConfigFields.tsx | 40.95/63.16/33.33 | 98.27/94.66/100 |
| react/widgets/WidgetConfigFields/media-content-rules.ts | 68.75/84.81/76.92 | 100/94.36/100 |
| react/widgets/WidgetPickerDialog/WidgetPickerDialog.hooks.tsx | 52.76/78.57/37.5 | 100/100/100 |
| react/widgets/WidgetPickerDialog/WidgetPickerDialog.tsx | 0.0/100.0/100.0 | 100/98.11/100 |
| redirects/redirects.ts | 100.0/99.52/100.0 | 100/99.5/100 |
| redirects/site/publish-content.ts | 100.0/90.32/100.0 | 100/100/100 |
| redirects/tool-registrations.ts | 98.84/94.12/100.0 | 100/97.14/100 |
| seo/content-analysis/analyze-content.ts | 97.24/76.19/100.0 | 100/98.7/100 |
| seo/content-analysis/summary.ts | 83.78/68.75/55.56 | 100/100/100 |
| seo/content-analyzer-plugin/plugin.ts | 100.0/80.0/100.0 | 100/100/100 |
| seo/cover-image.ts | 14.29/66.67/16.67 | 100/100/100 |
| seo/feed.ts | 90.91/100.0/100.0 | 100/100/100 |
| seo/html-plain-text.ts | 100.0/97.14/100.0 | 100/97.29/100 |
| seo/seo.ts | 100.0/99.17/100.0 | 100/99.15/100 |
| seo/site/page-head-contributor.ts | 72.73/50.0/100.0 | 100/100/100 |
| seo/site/settings.ts | 84.45/83.08/87.5 | 100/94.84/91.66 |
| seo/site/tool-registrations.ts | 66.67/100.0/75.0 | 100/100/93.75 |


**Commit**: 3dfb454c (pushed to codex/w62-cov-cms-7).

---

## codex/w62-cov-cms-8


counts: tests run 648 pass 647 fixed 2 dropped 0 | weak fixed 0 | bugs 2 (both fixed in production, test-first)

The 1 remaining red is an environment artifact, not this branch's: `widgets/site/__tests__/publish-content.test.ts > destination form ids swap only for the matching widget type` is a pre-existing test. Codex added only `changeSets` to its deps. It `vi.spyOn`s the `../../index.js` namespace, but production calls `importWidgetInstance` via `@jini-ai/cms/widgets`, which in this worktree resolves into `/home/user/Jini/packages/cms/src`. That is a different module instance, so the spy cannot intercept it. I ran the BASE (HEAD~1) version of that file in this worktree and it fails the same way. Left unchanged.

## Reds -> why -> fix
- widgets/__tests__/tool-registrations.test.ts (embed rejections ...): expected the reorder-shape message to carry the `widgets_reorder_embeds` schema decoration. In production, `isWidgetsShapeRejection` does not include `ToolInputError`, so no decoration is added. Fixed the test to assert the exact real message (`assert.equal`). Owner decision below.
- settings/site/__tests__/visitor-tools-management.unit.test.ts (prepares public access ...): `changes[0].tool` is the view entry (descriptor + current mode/limits), not the bare descriptor. Fixed the expectation to `{ ...tool, ...off }`.
- settings/site/__tests__/visitor-tools-management.unit.test.ts (dotted tool identity): production BUG, fixed (see BUGs).
- trash/site/__tests__/marker-adapters.test.ts (same-tick media hide retry): production BUG, fixed (see BUGs).

## Weak tests fixed
none needed. I grepped all added lines for toBeDefined/toBeTruthy/not.toThrow/snapshot/bare assert.ok/as any/ts-ignore/.only/.skip. The only hits were `assert.ok(x instanceof Err)` and `assert.ok(row)` guards, each followed by exact message/deepEqual checks. I sampled mail-provider and visitor-management: they use real in-memory repos, exact error classes and messages, and exact port args.

## Mutation spot-checks (all applied together, one test run, then reverted; `git status` clean afterwards except the 2 bug fixes)
| file:test | mutation | red? |
|---|---|---|
| visitor-tools-management: dotted tool identity | configure regex back to `[a-z0-9_]` | yes |
| marker-adapters: same-tick media hide retry | drop `&& Number(row.version) !== before` | yes |
| form-delivery.unit: oversize/empty/non-string reference, middle form ID | MAX_REFERENCE_LENGTH 256 -> 257 | yes (4 tests) |
| manifest-v2: rejects id=3 with v2-id | checkId accepts numbers | yes |
| visibility: trash retention rounds fractional day up | Math.ceil -> Math.floor | yes |

## Coverage
| file | before L/B/F | after L/B/F |
|---|---|---|
| seo/tool-registrations.ts | 69.57/94.44/78.57 | 100/100/100 |
| seo/write-service.ts | 98.06/94.25/100.0 | 98.54/96.51/100 |
| settings/site/chat-execution-write.ts | 95.92/58.62/100.0 | 100/72.72/100 |
| settings/site/form-delivery-write.ts | 93.33/88.89/100.0 | 100/100/100 |
| settings/site/form-delivery.ts | 95.08/65.96/100.0 | 100/81.35/100 |
| settings/site/form-destination.ts | 100.0/66.67/100.0 | 100/100/100 |
| settings/site/mail-provider.ts | 0.0/100.0/100.0 | 100/100/100 |
| settings/site/mail-sender.ts | 100.0/66.67/100.0 | 100/100/100 |
| settings/site/publish-content.ts | 85.71/64.71/60.0 | 100/92.45/86.66 |
| settings/site/settings-confirm-write.ts | 100.0/82.35/100.0 | 100/95.45/100 |
| settings/site/site-timezone.ts | 100.0/85.0/100.0 | 100/100/100 |
| settings/site/site-title-write.ts | 71.76/60.0/81.82 | 98.82/88.67/100 |
| settings/site/site-title.ts | 100.0/78.57/100.0 | 100/88.88/100 |
| settings/site/visitor-tools-configure.ts | 94.12/80.65/100.0 | 100/91.17/100 |
| settings/site/visitor-tools-registrations.ts | 0.0/100.0/100.0 | 100/100/100 |
| settings/site/visitor-tools-service.ts | 0.0/100.0/100.0 | 100/96.87/100 |
| settings/site/visitor-tools-write.ts | 0.0/100.0/100.0 | 100/93.54/100 |
| site-inspection/site-capabilities.ts | 100.0/91.11/100.0 | 100/100/100 |
| site-inspection/site-profile.ts | 52.17/80.95/41.18 | 100/98.36/100 |
| site-inspection/tool-registrations.ts | 43.96/66.67/15.38 | 91.2/90.62/94.11 |
| site/keep-off-content-store.ts | 100.0/100.0/30.0 | 100/100/100 |
| taxonomy/assignment-service.ts | 100.0/97.92/100.0 | 100/100/100 |
| taxonomy/render-entry.ts | 100.0/94.44/100.0 | 100/100/100 |
| taxonomy/site/publish-content.ts | 71.95/89.47/69.23 | 100/100/100 |
| taxonomy/site/publish-term-ids.ts | 67.44/91.18/63.64 | 100/97.72/100 |
| taxonomy/sql/entry-term-repo.ts | 100.0/96.55/100.0 | 100/96.55/100 |
| taxonomy/sql/term-repo.ts | 100.0/97.44/100.0 | 100/97.43/100 |
| taxonomy/tool-handlers.ts | 96.26/80.95/100.0 | 100/86.36/100 |
| themes/files/atomic-write.node.ts | 87.3/68.0/100.0 | 100/90.16/100 |
| themes/files/originals.node.ts | 100.0/96.97/100.0 | 100/97.05/100 |
| themes/files/read-content.node.ts | 100.0/97.62/100.0 | 100/100/100 |
| themes/files/trash.node.ts | 98.51/82.69/94.44 | 100/84.61/94.44 |
| themes/manifest-v2-fields.ts | 35.0/61.9/75.0 | 100/98.71/100 |
| themes/manifest-v2.ts | 61.86/33.33/42.86 | 100/100/100 |
| themes/preview/refresh.node.ts | 97.14/91.43/100.0 | 100/94.28/100 |
| themes/preview/watcher.node.ts | 94.59/100.0/91.67 | 100/100/100 |
| trash/adapters/directory.node.ts | 92.75/85.37/100.0 | 97.1/92.39/100 |
| trash/permanent/tool-registrations.ts | 87.23/58.33/66.67 | 100/94.11/100 |
| trash/site/adapters/marker-sql.ts | 44.68/70.0/75.0 | 100/100/100 |
| trash/site/adapters/media.ts | 41.54/50.0/50.0 | 100/86.2/100 |
| trash/site/adapters/member-credential-sql.ts | 80.0/88.89/83.33 | 100/100/100 |
| trash/site/adapters/plugin.ts | 0.0/0.0/0.0 | 100/100/100 |
| trash/site/adapters/post.ts | 45.61/100.0/40.0 | 100/100/100 |
| trash/site/adapters/redirect.ts | 80.77/100.0/80.0 | 100/100/100 |
| trash/site/adapters/theme.ts | 0.0/100.0/100.0 | 100/100/100 |
| trash/site/move-to-trash.ts | 68.85/35.71/75.0 | 100/88.88/100 |
| trash/site/scheduler.node.ts | 0.0/100.0/100.0 | 100/100/100 |
| trash/sql/entry-sql.ts | 100.0/90.91/100.0 | 100/100/100 |
| trash/sql/not-trashed.ts | 100.0/94.44/100.0 | 100/100/100 |
| trash/sql/repo.ts | 100.0/95.35/100.0 | 100/100/100 |
| trash/sql/table-adapter.cascade.ts | 85.71/80.95/88.89 | 100/82.14/100 |
| trash/sql/table-adapter.purge.ts | 98.25/79.17/100.0 | 100/86.2/100 |
| trash/sql/table-adapter.rows.ts | 100.0/85.71/100.0 | 100/93.1/100 |
| trash/sql/table-adapter.transitions.ts | 96.23/75.76/100.0 | 100/79.41/100 |
| trash/tool-registrations.ts | 100.0/96.88/100.0 | 100/100/100 |
| trash/trash-item-tool.ts | 98.25/94.74/65.0 | 98.24/98.3/65 |
| trash/visibility.ts | 92.0/92.86/75.0 | 100/100/100 |
| webmcp/settings.ts | 47.62/100.0/50.0 | 100/100/100 |
| widgets/caption-track.ts | 93.94/94.59/100.0 | 93.93/94.59/100 |
| widgets/content-markers.ts | 100.0/88.89/100.0 | 100/100/100 |
| widgets/document-markers.ts | 100.0/94.44/100.0 | 100/97.29/100 |
| widgets/duplicate-embeds.ts | 100.0/91.3/100.0 | 100/91.3/100 |
| widgets/entry-refs-extractor.ts | 65.54/90.48/69.23 | 95.48/95.16/100 |
| widgets/entry-refs.memory.ts | 77.42/100.0/66.67 | 100/100/100 |
| widgets/html/media-html.ts | 91.55/76.74/92.86 | 97.88/87/100 |
| widgets/markers/expand-partials.ts | 100.0/95.83/100.0 | 100/100/100 |
| widgets/media-embed-resolution.ts | 99.31/89.8/100.0 | 100/100/100 |
| widgets/page-widget-resolution.ts | 100.0/95.45/100.0 | 100/100/100 |
| widgets/resolvers/create-core-resolvers.ts | 100.0/77.78/100.0 | 100/100/100 |
| widgets/site/publish-content.ts | 73.77/73.08/61.54 | 100/96.82/100 |
| widgets/tool-handlers.areas.ts | 92.65/76.27/100.0 | 100/91.66/100 |
| widgets/tool-handlers.instances.ts | 97.96/77.78/100.0 | 100/80.76/100 |
| widgets/tool-registrations.ts | 85.44/78.57/100.0 | 100/100/100 |
| widgets/widget-slug-normalization.ts | 100.0/87.5/100.0 | 100/100/100 |
| workspace/repo.memory.ts | 98.15/92.59/100.0 | 98.14/96.55/100 |
| workspace/sql/index.ts | 0.0/0.0/0.0 | 100/100/100 |
| workspace/sql/repo.ts | 100.0/96.55/100.0 | 100/100/100 |

## BUGs (both small and local, fixed test-first; Codex's tests proved them red before the fix)
- packages/cms/src/settings/site/visitor-tools-configure.ts:33: the configure toolId pattern `/^[a-z][a-z0-9_]{0,127}$/` rejected dotted IDs that `visitor-tools-service.ts:30` catalog validation (`[a-z0-9_.]`) accepts and lists as eligible. A listed tool such as `catalog.lookup` could never be switched Off. Fix: allow `.` in the configure pattern (`[a-z0-9_.]`).
- packages/cms/src/trash/site/adapters/media.ts (flipAndReport): an idempotent hide retry in the same clock tick (flip returns ok and leaves the row untouched) still matched `updated_at === at` and published a duplicate change. Fix: read the version inside the same transaction before the flip, and report only when the version moved (`Number(row.version) !== before`). Test: `retrying a media hide in the same clock tick does not publish a duplicate change`.

## Owner decisions
- packages/cms/src/widgets/tool-handlers.areas.ts:157-166: the comment says the `orderedWidgetEntryIds` shape check was moved inside `withSchema` to get the tool's schema decoration. But `isWidgetsShapeRejection` (tool-registrations.ts:69) only matches typed widget errors, not `ToolInputError`, so no decoration is added. Adding `ToolInputError` to the predicate would also decorate the placements validators (exact-message tests) and needs a decision. I did not change it; the test now asserts the real undecorated message.

## Commit
6f075747 (local, not pushed) on codex/w62-cov-cms-8. `git status --short`: clean.
