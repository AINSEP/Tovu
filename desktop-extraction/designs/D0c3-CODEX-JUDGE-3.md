VERDICT: REJECT

Option C and Q2-a remove the previous package and telemetry-migration blockers. V3 still changes startup ordering and packaged checkout behavior, and its shared gate can accept failures. This was a static, read-only review within the lookup cap. Test execution, release resolution, and some census counts remain unverified.

| ID | Severity | Sheet | Claim vs evidence | Fix |
|---|---|---|---|---|
| G1 | Blocker | COMMON | `COMMON.md:39–56` requires green under `set -e`, but T2:22 requires retaining known failing tests. With tests unavailable, neither baseline nor mutations can run. The architecture exception accepts any nonzero exit carrying an equal or lower count, including a different regression. At :75, failed `npm pkg get` with empty stdout satisfies `test "" != "{}"`. | Separate edit readiness from proof. Require CI proof, compare regression identities, and check command status before parsing output. |
| G2 | Blocker | COMMON, T1/T2/T4/T7 | `COMMON.md:21–25` requires a sibling Jini build and links only existing desktop entries. T1 introduces a desktop dependency missing from `apps/desktop/package.json:28–56`. `link-jini.mjs:61–98` already replaces installed copies for discovered consumers. The extra `ln` loop has no removal step for a real directory. | Have the coordinator supply published pins and clean locks, or specify a verified link order after dependency changes. |
| G3 | Major | COMMON | `dist-import-check.test.ts:123–135` scans selected TypeScript extensions and skips tests. `stage-website-shared.ts:45–53` silently discards missing targets. Neither proves archive resolution. G also has no explicit 50-line or suppression check. | Enforce owner limits on changed code. Use exact staged inventories per base and verify resolution from the archive. |
| J1 | Minor | J1/T1 | Revision :29 cites `presetRouteHost` at :80. It starts at `packages/server/src/route-host.ts:34`. T1:25 omits removal of the request-facts computation itself (`jini-routes.ts:33–37`), while Jini adds registration and validation (`mount-routes.ts:21–23,36–44`). | Correct the anchor, provide the test context fixture, and pin desktop route and error parity. |
| J2 | Major | J2/T2 | J2:14 orders verbatim TSDoc and neutral wording. `process-error-guards.ts:64–70,89–94` names website boot wiring and describes outdated callers. J2:7 also reads a second checkout. | Supply exact neutral comments that retain the rationale, a pinned source excerpt, and explicit debt edits. |
| S1 | Blocker | J3/T4 | Original `startup-secrets.ts:19–33` assigns inherited credentials **before** starting IPC and returns an already fulfilled promise without IPC. T4:16–20 starts IPC first and adds a `.then` turn. J3:19–24 accepts arbitrary key casing, but copying the original uppercase comparison misses lowercase declared keys that `supervisor-node.ts:307–315` recognizes. J3 omits API-baseline and release edits. | Preserve website ordering and promise timing, normalize both sides of scrubbing, and list the release artifacts. |
| S2 | Major | T3/T5 | T3:13 leaves a direct type dependency undeclared and lists only the root lockfile. T5:14–16 changes dependencies of desktop’s `file:` package (`apps/desktop/package.json:29`) without specifying regeneration after both manifest edits. | Declare direct dependencies and regenerate both consumer locks from the final manifests. |
| O1 | Blocker | T6 | T6:26 claims packaged checkout parity. An archive built under the checkout can still find `apps/website` and `.git` within the old walk (`product-root.ts:17,35–44,137–138`, `observability-export.ts:35–45`). `deployedProduction` also has no `!development` condition. T6 replaces an acknowledged baseline result. | Preserve the old origin and probe, and characterize packaged launches inside and outside a checkout. |
| H1 | Blocker | J4/T7 | J4:17 exports two functions. T7:31–32 imports `parseHostSignalDeclaration` too (`features/agent-plugins/host-signals.ts:15`). T7:26 changes the fallback walk origin to desktop source, which can select a different marked ancestor (`product-root.ts:86–100`). T7:17–18 also exports/imports the walk limit mostly for documentation. | Specify the parser’s public path or keep its tests in Jini, preserve the fallback origin, and keep the limit private. |

**Dispatch readiness**

- **NEEDS-FIX:** J1 fixture and gate; J2 comments and source inputs; J3 semantics and release inventory; J4 parser export; T1 linked dependency setup; T2 baseline and mocks; T3 dependencies and locks; T4 ordering; T5 lock sequencing and gate; T6 checkout parity; T7 exports and root parity.
- **NOT-CODEX:** T8 and T9 are outlines under Q2-a.
- **Parallel:** J1–J4 can run independently once API, changeset, and debt ownership is explicit. Tovu sheets share `dist-import-check.test.ts`. T2/T6 also share desktop telemetry boot, T3/T6 share website telemetry, T4/T5 share daemon supervisor, and T6/T7 share product root. Serialize T1–T7 as written. Jini-dependent T sheets also require their matching Jini release or verified link.

**Earlier findings**

- **Judge 1 C1–C4:** Old count and line errors retired. Archive output remains unverified.
- **Judge 1 B1:** SDK build-order issue removed. First-use install setup remains open.
- **Judge 1 B2:** Resolved in scope. Loader and consent stay.
- **Judge 1 B3:** Trailer, `mapfile`, and multiline defects removed. Gate failures remain.
- **Judge 1 B4:** Deferred with staging deletion. Archive proof remains owed.
- **Judge 1 parity:** Loader search and lazy failures resolved in scope. Signals fallback remains open.
- **Judge 1 owner/characterization:** Runtime-mode signature and checkout call list addressed. Cross-package mocking remains, and packaged checkout parity fails.
- **Judge 1 overlap:** Old lanes superseded by the pinned base. V3 sheet overlaps require serialization.
- **Judge 1 minor:** Scrub-root migration deferred with T8.
- **Judge 1 over-engineering:** Full registry move and duplicate verifier inventory removed.
- **Judge 1 unverified:** Execution budgets, snapshots, and packaged proof remain open.
- **Judge 2 C1–C4:** Bad revision counts retired. Historical build facts do not establish v3 proof.
- **Judge 2 B1:** Trailer and Bash constructs removed. Baseline execution remains blocked.
- **Judge 2 B2:** Dependency and architecture false greens remain.
- **Judge 2 B3:** Walker callers and checkout fixtures listed. Checkout parity remains open.
- **Judge 2 B4:** Type moves deferred with T8.
- **Judge 2 B5:** Published pins and clean locks remain open. Staging comments deferred.
- **Judge 2 lazy:** Resolved in scope. Loader stays lazy.
- **Judge 2 owner/overlap:** Singleton stays with telemetry. Retired-name alias repointed. New overlaps listed above.
- **Judge 2 minors:** Extension mutation deferred. T7 uses `path.join`.
- **Judge 2 over-engineering:** `hasMethods` and checkout probe seam removed.
- **Judge 2 unverified:** Published inputs, archive placement, smokes, and budgets remain open.
