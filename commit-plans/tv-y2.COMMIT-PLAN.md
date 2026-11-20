# codex/tv-y2 source handoff

Base: merge-6 `776ce6d0f0`. Seven sheets completed in dispatch order. Behaviour identical apart from the named private diagnostics and export-surface removals. No tests edited or run; no builds, installs, type-checks, linters, graph queries, dependency edits, ledger edits, commits or other `.git` writes performed. Coordinator owns staging and commits.

## DC-AUTH — done

- File: `apps/website/src/server/inbound/admin-http/dev-auth.ts`.
- Added the existing Tovu diagnostic import; replaced the private wrapper text while retaining its cause; attached the class/code diagnostic to the existing detached warning.
- Ledger identities for shared combine clearance: `apps/website/src/server/inbound/admin-http/dev-auth.ts` + `catch-reads-error` (base row 360, value 1), and the same file + `no-generic-failure-text` (base row 361, value 1). Gate confirmation pending; ledger untouched.
- Counts: 1 failure literal renamed; 1 diagnostic attached; 0 assertions given messages.
- File exceeds 500 lines: 846 on base, 847 after this sheet. Changed functions remain below the function limits.
- Combine Chrome look owed: none. STOP: none. Incidental changes removed at diff reread: none.

## DC-ORIGIN — done

- File: `apps/website/src/server/inbound/admin-http/local-admin-request.ts`.
- Replaced only the `isLocalAdminUrl` import with `../../runtime/boot/local-owner-signin.js`, addressing the same declaration file.
- Ledger identity for shared combine clearance: `apps/website/src/server/inbound/admin-http/local-admin-request.ts` + `catch-reads-error` (base row 362, value 1). Gate confirmation pending; ledger untouched.
- Counts: 0 failure literals renamed; 1 import specifier replaced; 0 assertions given messages.
- Combine Chrome look owed: none. STOP: none. Incidental changes removed at diff reread: none.

## DC-TRUST — done

- File: `apps/website/src/server/inbound/admin-http/publish-trust-auth.ts`.
- Bound and described the caught store rejection in `admitFromStores`, reusing the existing Tovu import and retaining the null refusal and read order.
- Ledger identity for shared combine clearance: `apps/website/src/server/inbound/admin-http/publish-trust-auth.ts` + `catch-reads-error` (base row 363, value 1). Gate confirmation pending; ledger untouched.
- Counts: 0 failure literals renamed; 1 diagnostic added; 0 assertions given messages.
- Combine Chrome look owed: none. STOP: none. Incidental changes removed at diff reread: none.

## DC-FEED — done

- File: `apps/website/src/server/inbound/admin-http/routes/settings/events.ts`.
- Added the existing Tovu diagnostic import and the specified admission log before the unchanged 401.
- Ledger identity for shared combine clearance: `apps/website/src/server/inbound/admin-http/routes/settings/events.ts` + `catch-reads-error` (base row 375, value 1). Gate confirmation pending; ledger untouched.
- Counts: 0 failure literals renamed; 1 diagnostic added; 0 assertions given messages.
- Combine must retain this import and catch while resolving the import overlap with `tv-xd5-publish`.
- Combine Chrome look owed: none. STOP: none. Incidental changes removed at diff reread: none.

## DC-CONSENT — done

- File: `apps/website/src/server/runtime/composition/site-consent.ts`.
- Added the existing Tovu diagnostic import; used the exact declaration handler from the design; logged the published-entry rejection before the existing unavailable result. Receipt-storage handling stays as written.
- Ledger identity for shared combine clearance: `apps/website/src/server/runtime/composition/site-consent.ts` + `catch-reads-error` (base row 473, value 2). Gate confirmation pending; ledger untouched.
- Counts: 0 failure literals renamed; 2 diagnostics added; 0 assertions given messages.
- Combine must retain these diagnostics while resolving the import overlap with `tv-xd5-render`.
- Combine Chrome look owed: none. STOP: none. Incidental changes removed at diff reread: none.

## TV-05 — done

- Files: `apps/website/src/features/site-inspection/index.ts`, `apps/website/src/features/site-inspection/site-profile.ts`.
- Removed the three named barrel export entries; made `MAX_SETTING_VALUE_CHARS` private; deleted the `DEFAULT_SECTION_TIMEOUT_MS` forwarding statement and its two-line doc comment. Kept the local timeout import, value-size doc comment, and leaf `INVENTORY_SAFE_SETTINGS` export.
- Targeted symbol greps found no unlisted production importer. The named test imports `INVENTORY_SAFE_SETTINGS` from its leaf and needs no edit.
- Counts: 0 literals renamed; 0 assertions given messages; 3 barrel entries removed, 1 forwarding statement and its two-line doc comment removed, 1 declaration made private.
- File exceeds 500 lines: `site-profile.ts` is 662 on base, 658 after this sheet. Behaviour identical.
- STOP: none. Incidental changes removed at diff reread: none.

## TV-06 — done

- Files: `apps/website/src/features/site-inspection/index.ts`, `apps/website/src/features/site-inspection/site-capabilities.ts`.
- Removed the two named barrel export entries and made `TOOLS_NOT_WIRED_REASON` private. Kept the leaf `MAX_TOOL_SUMMARY_CHARS` export.
- Targeted symbol greps found no unlisted production importer. The named test imports `MAX_TOOL_SUMMARY_CHARS` from its leaf and needs no edit.
- Counts: 0 literals renamed; 0 assertions given messages; 2 barrel entries removed, 1 declaration made private. Behaviour identical.
- STOP: none. Incidental changes removed at diff reread: none.

## Pending coordinator/combine verification

- DC sheets: verify the named file/rule identities have zero gate findings and perform the culled combine mutation checks before the shared ledger shrink. No executor test additions.
- DC-SEARCH is outside this job: keep merge-6's `reportServerFailure` import and catch alongside the branch's `@jini-ai/search/http-query` import. The coordinator owns row 429.
- Preserve the pushed feed/consent import changes when combining. The shared published-core lock prerequisite belongs to Opus Cloud; this job adds no idiom imports or dependency changes.
- TV sheets: `npm run typecheck`, `typecheck:tests`; `site-profile.unit`, `site-capabilities.unit`, `media/__tests__/library-save-text`, `post/__tests__/post.authorship`, `site-guide/__tests__/facts-profile`, `server/__tests__/routes/site-profile-route`; `check:architecture` API surface no higher than base.
- No Chrome or Electron look is owed by any of these seven sheets.
- Final source diff reread: only the exact culled changes remain. No incidental additions needed deletion. Required source deletions are listed under TV-05 and TV-06.
