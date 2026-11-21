# Refresh items

- CRED-T1 STOP: `apps/website/src/server/runtime/composition/modules/__tests__/site-search.unit.test.ts:494–547`, required callback is 54 lines. Refresh the sheet to resolve the hard function-size conflict without unnamed refactoring. All draft edits were removed.
- GH-T1 STOP: `apps/website/src/features/agent-plugins/__tests__/unit/bundled-github-commit-site.unit.test.ts:911–997`, required callback is 87 lines (75 nonempty non-comment lines). Refresh the sheet to resolve the hard function-size conflict. All draft edits were removed. DEPENDS: `jx-gh GH-J1`; exact packed-candidate and sandbox proof remain owed.
- Targeted `resolveMailCredential` search found only `resolve-mailer.ts` as production importer. No test importer repoint was needed. The existing cost-counter fixture is unchanged.
- Targeted `defaultCredentialLabel` search also found the unlisted test `apps/website/src/contracts/core/__tests__/extract-s3-host-source.unit.test.ts:8`. It pins the parser documentation, which is unchanged, so no repoint or edit was needed.
- Targeted `commitSiteToSourceControl` searches found additional characterization, preview-parity and gates tests. No signature/import change or repoint was made because GH-T1 stopped. Production references outside the listed tool binding were comments, not additional importers.
- FED-T1 refreshed checks for `/api/federation/reload`, `FEDERATION_RELOAD_PATH` and `registerFederationReloadRoute` found only the standalone route declaration/body and tests. No production mount/caller blocks deletion. Route and run-scoped tests remain intact.
- CRED-T2/CRED-T3 still require combine execution, named mutations, cost-counter verification and Chrome upgrade/save checks. No test, build, install, type-check or lint command was run here.
