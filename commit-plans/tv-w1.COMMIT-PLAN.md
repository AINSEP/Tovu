# COMMIT-PLAN

Base for every sheet: `integ/merge-8` `8d613439cc36f9093e7487f3ed9e698adc77acd6` (branch `codex/tv-w1`). No tests, builds, installs, type checks, linters, or Git writes run, per dispatch. Coordinator stages and commits; published lockfiles remain the combine's responsibility.

## TV-ES1 — done

- Files: `apps/admin/src/features/auth/{Login.tsx,OwnerRecoverySignIn.tsx,auth-i18n.ts,__tests__/Login.unit.test.tsx,__tests__/OwnerRecoverySignIn.unit.test.tsx}`.
- Test-first, read-confirmed before source edits: changed Login case to `shows the error ID without Copy details for an anonymous sign-in failure`; added recovery case `shows the error ID without Copy details for an anonymous recovery failure`. Red reason: old notices default to full disclosure, rendering Copy details and omitting the ID-only report line. Tests were not executed. Final read corrected recovery disclosure setup by opening its existing details container and used text queries so even hidden Copy details controls are rejected.
- Updated existing recovery rate-limit case to expect no Copy details; preserved explanation and secret-redaction assertions. Replaced Login's obsolete clipboard exercise with the ID-only translated notice case; removed its clipboard setup/cleanup.
- Jini disclosure prop and Login → Login.hooks → auth-i18n translator verified. Appended the key and translations to all 21 existing non-English DETAILS_COPY arrays (sheet says 20; all arrays retained).
- Combine owes mutation dropping Login's `disclosure="id-only"`, red/green auth suites and test-safety gate, and Chrome failed sign-in showing the ID line without details.
- Deletions: obsolete full-disclosure test expectations/scaffolding above. Diff re-read deletions: none beyond the sheet-required deletions recorded above.

## E-O-T — done

- File: `development/scripts/dev.mjs`; added only `env: process.env` to the existing selector input. Existing import retained.
- Verified Jini RuntimeInput is `{ searchFrom; nodePath; env }`; named grep finds this sole production call, plus a documentation mention in `development/open-bugs.md`.
- File-size note: `development/scripts/dev.mjs` remains 990 lines; the one-line input edit adds no lines. Per owner, file size is not a STOP.
- Tests: none changed; Jini probe-map test supplies mutation proof. Combine owes Electron-as-Node dev launch and Node fallback launch.
- Deletions: none. Diff re-read deletions: none beyond the sheet-required deletions recorded above.

## K-04b-T — done

- Files: `apps/website/src/features/seo/{__tests__/cover-image-defaults.test.ts,__tests__/cover-image-resolve.test.ts,__tests__/cover-image-source.test.ts,page-head-contributor.ts,index.ts}` and `apps/website/src/server/inbound/admin-http/routes/seo/{get-entry-analyze.ts,get-entry.ts,put-entry.ts}`. Deleted `apps/website/src/features/seo/cover-image.ts` and its forwarding export.
- Repointed the three suites first, import-only, retaining all cases, assertions, symbol order and Tovu fixtures. Then repointed the four production importers. Jini leaf export present; named grep found exactly the sheet's importer set.
- Combine owes mutations admitting trashed media, dropping stored override precedence, and admitting an external image into JSON-LD; existing resolve/source/head pins retained. Chrome: body cover, explicit override, no cover.
- Combine must STOP deletion if `worker-import-graph.test.ts` or either worker budget fails. Sheet assigns the deleted `features/seo/cover-image.ts` debt row (sheet anchor 1273) to combine's `check:errors --update` shrink. Exact-path read of this clone's debt JSON finds no matching row; record this refresh for combine verification. Debt file untouched.
- Deletions: duplicate cover-image implementation and forwarding export only. Diff re-read deletions: none beyond the sheet-required deletions recorded above.

## L15.8 — done

- Files: `apps/website/src/features/seo/index.ts`, `apps/website/src/server/inbound/public-http/routes/site/pages/extra-head.ts`. Added the named public hook export and repointed the route import after K-04b-T.
- Read `page-head-contributor.ts`: imports only Jini SEO and the Jini cover-image leaf; no `#src/server/` import/cycle prerequisite. No test edits; direct import in `cover-image-head.test.ts` retained.
- Combine owes deep-import restoration mutation for the boundary gate and dropped-cover mutation in existing OG/JSON-LD pin; worker import graph and both budgets must pass. Shares K-04b-T Chrome checks. No debt edit.
- Deletions at final diff re-read: removed one redundant blank line introduced while replacing the cover-image export. No other deletions.

## T1 — done

- Files under `apps/website/src/features/theme/`: `__tests__/{template-applicability.unit.test.ts,declared-scripts.unit.test.ts}`, `validation/{validate-theme-package.ts,markup.ts,references.ts,structure.ts,webmcp-markup.ts,profiles.ts}`, `index.ts`, `theme-manifest.ts`; also `development/scripts/coverage-integrity-baseline.json`.
- Deleted `validation/manifest-v2.ts`, `template-applicability-errors.ts`, `validation/__tests__/manifest-v2.test.ts`. Deleted only the manifest validator's coverage baseline entry, its local issue declaration/associated doc comment and forwarding type members.
- Tests first: repointed retained theme suites to Jini, supplying real `validateScripts` and `isSourceDirGeneratedConflict`; retained invalid templateFor and unknown consent-category assertions. Added messages to assertions changed by dependency injection.
- Deleted exactly the three Jini-ported cases: `templateFor: filters by kind in manifest order, sharing omitted and explicitly dual-kind entries`; `templateFor: inherited object names remain unlisted and apply to both kinds`; `templateFor without any declared templates: an empty mapping parses, any named template is refused`. Deleted ported manifest-v2 suite as directed.
- Jini manifest validator, issue type, template rejection export and manifest dependency shape verified from merge-9 objects. Named grep found no unlisted production importer or extra test importer.
- Combine owes mutations skipping templateFor validation and returning no script problems; existing worker and bundled-theme pins, test-safety and validation suites. Sheet assigns the deleted `features/theme/validation/manifest-v2.ts` error-gate row to combine shrink. Exact-path read of this clone's debt JSON finds no matching row; combine must verify its merged baseline. Debt file untouched. No separate Chrome look specified.
- Diff re-read deletions: none beyond the sheet-required deletions recorded above.
