TDD(Direct): Loaded the TDD persona for behavior-focused coverage tests.

Extended 11 existing suites. Production code and git state are unchanged. `git diff --check` passed. Tests and coverage were not run, as instructed.

**CHANGED FILES:**

```text
/Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/media-byte-size.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/media-html-attributes.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/media-order-by.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/media/__tests__/use-media.hooks.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/skills/__tests__/use-skills.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/credentialed-request.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/navigation/__tests__/footer-page-links.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/navigation/__tests__/repo.sqlite.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/newsletter/__tests__/errors.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/site-guide/__tests__/facts.test.ts
```

**PER FILE:** These are intended execution paths; verification remains pending.

| Source | Added scenarios |
|---|---|
| navigation/repo.ts | Trash-blind lookup misses and workspace isolation; propagation of non-unique storage failures without changing persisted data. |
| media/rules.ts | Line 494 equal-key sorting; error fallbacks and precedence; unsafe URL schemes; trailing malformed attributes; empty locale options. |
| skills/use-skills.hooks.ts | Lines 122, 126–127; picker refs present/absent; inspection close; collapse; empty file selection; non-Error failures and retry; refresh failures after accepted writes; completion after unmount. |
| custom-credentials/credential-save-tool.ts | Absent publish prefill, default handler options, publish cross-kind fields, media provider alias rejection. |
| custom-credentials/credentialed-request.ts | Storage and scheme-registry error identity; no transport after scheme-loading failure. Existing suites already exercise most request behaviors. |
| navigation/migrate-footer-page-links.ts | Missing snapshots, preserved snapshots, authored targets, missing pages, complete refs, empty children, no-conversion menus, zero-row update with unchanged watermark. |
| newsletter/errors.ts | Message-less lookup/authorization errors. Existing tests exercise all explicit constructors; the reported 12 branch gaps need instrumentation review. |
| site-guide/facts.ts | Unknown topics, authorization exceptions, profile-only/registry-only failures, and denial during the second authorization check. |

**UNREACHABLE:**

Under current implementations and native API contracts:

- `credential-save-tool.ts:101`: preceding kind validation excludes the switch default.
- `credentialed-request.ts:770`: current Jini callers never pass redirect options.
- `credentialed-request.ts:798`: the empty-string alternative follows a successful identical egress-error predicate.
- `facts.ts:44,64`: requested profile sections never produce `truncated: true`.
- `facts.ts:63,65`: requested theme/plugin topics always have a prior profile section.
- `media/rules.ts:264`: string iteration always supplies a nonempty character, so `codePointAt(0)` is defined.
- `media/rules.ts:405,407,409`: native FileReader errors supply an error; successful data-URL loads supply a non-null result containing a comma.

These remain unchanged for owner disposition.

**NOT DONE:**

Tests, typecheck, builds, package scripts, and coverage measurement were intentionally not executed. **100% coverage is not confirmed.** The verifier must run the suites and reconcile remaining branch IDs, particularly newsletter’s source-map/instrumentation gaps.
