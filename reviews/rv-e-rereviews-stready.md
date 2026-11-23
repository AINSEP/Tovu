REVIEW r62t-rv-e PARTIAL

SEC-4 and the Tovu halves pass static review for linked integration. C043 needs a compatible worker API and an explicit package boundary. Storage needs fixes to backup selection, pass scheduling, and symlink handling before its Jini half clears review.

## `codex/sec4-jini` — APPROVE

All four prior FIXes are **DONE** against the lane report’s wording.

1. `packages/admin/src/security/adapters/http.ts:84` preserves an empty `envVarName` and omits an absent one. Both cases are pinned in `http.test.ts:151`.
2. `packages/admin/src/security/adapters/memory.ts:59` rebuilds the file-backed status on activation. The test at `memory.test.ts:103` pins removal of the stale environment and refusal fields.
3. `packages/admin/src/security/__tests__/http.test.ts:170` covers an echoed key on refusal and retry through the controller, including the console checks. The test explicitly accounts for the operator’s input field during retry.
4. `.changeset/p9-sec-4.md:2` declares an Admin patch. The two changed API signatures match the Admin baseline delta and use existing package exports.

The methods, paths, serialized request bodies, and status fields match the Tovu base for the scoped calls, and the stock Jini defaults are pinned. No import migration applies to this wire-parity slice. The report records killed mutations and a passing Admin suite. Its XP3 run lacked the declaration snapshot. The source diff adds no production import edges.

## `codex/ex2-tovu-halves` — APPROVE for linked integration

**K4-i18n-common.T prior FIX — DONE.** `apps/admin/src/lib/i18n-common.ts:59` builds the dictionary inline. The host locale order, host-wins precedence, and missing-locale failure are tested. The retired helper and host dictionary export have zero code hits.

The source comparison matched all 21 branded translations and the shared base, extra, draft-recovery, code-wrap, and Built-in entries. The approval contract is type-only in Jini, with the six host rules and their rationale in Tovu. The settings refusal body and 1 MiB cap match the Tovu base, and the route mounts retain their existing host ports. The AdminKit supplies the UI translator and components by injection. The removed approval and refusal names have zero code importers, and all nine cap imports point to the CMS export. The report records a killed mutation for each of the four steps.

The registry handoff remains open. The inspected root and Admin lockfiles still pin `0.7.3-next.2`, and the lane’s verification used linked merge-14 packages.

## `codex/ex2-holds-tovu-jini` — FIX

**C043 prior FIX 4 — DONE as a move.** Jini owns the Node policy, and Tovu injects its aliases and exact trusted entry. Tovu’s SDK resolver is byte-identical to merge-13. The old policy helper and option have zero remaining code hits. The pre-move Tovu code supplied the package and path guards. The Jini version deliberately adds exact-entry trust and changes setup error handling. Jini has policy and registration tests, and Tovu retains real-worker coverage with recorded killed mutations. The paired Tovu source also shows FIXes 1–3 applied and the requested C026 edits for FIXes 5–6 present.

1. **Preserve the published worker call contract.** `packages/plugins/src/host/worker/start.ts:37` makes `importPolicy` mandatory on an existing public function. Existing TypeScript hosts fail to compile, and existing JavaScript hosts on the real-import path receive an import-stage failure. Make policy configuration additive for existing callers and keep Tovu’s policy explicit in `apps/website/src/server/runtime/plugin-tier2/worker.ts:62`. Add a regression test for the old call shape alongside the policy-order test.
2. **Use the host’s actual package root.** `packages/plugins/src/host/worker/import-policy.ts:95` assumes every entry is two levels below its package root. The Tovu content analyzer’s entry sits directly in its declared `sourceDir`, so the current policy treats the whole `built-ins` directory as one package. Pass the canonical package root from host registration, validate that the entry is inside it, and keep extra trust keyed to the exact entry. Pin both the installed-package and built-in layouts.
3. **Update the public API records.** The existing export map reaches `packages/plugins/src/host/worker/index.ts:2`, but `api-baseline/jini-ai__plugins.json:364` lacks the new exports and still records the old worker signatures. Regenerate the baseline after fixes 1–2 and add a Plugins changeset describing the shipped API.

## `codex/st-ready-jini` — FIX

1. **ST-5 can select a retained copy under an equivalent path.** `packages/db/src/sqlite/backup-policy.ts:94` compares the verified anchor by resolved path, then counts and slices raw rows. An alias of a retained copy can land in the removal candidates, and a relative protected path can fail to protect an absolute candidate. Normalize candidate and protected identities before counting, reject or collapse duplicate identities, and exclude the verified identity from the result explicitly. Add selector tests for both cases. Keep the live pruner’s existing behavior.
2. **ST-4 can overlap passes or strand the queue.** `packages/platform/src/retention/runner.ts:138` invokes injected work before publishing `running`, so a callback that synchronously requests another pass can start one. The queue advances only on fulfillment. A thrown `clock.now()` at line 182 leaves `running` rejected and an opposite-mode waiter pending. Publish the in-flight state before invoking collaborators, advance or settle the queue on both outcomes, and handle scheduled rejection through the injected reporter. Test synchronous re-entry and recovery after a throwing clock.
3. **ST-4 imports runtime collaborators across packages.** `packages/platform/src/retention/runner.ts:17` imports the Core error formatter and console logger. Use the injected reporter and fixed safe outcome text, or inject those capabilities through the existing args. Keep failure isolation when the reporter itself throws.
4. **ST-14’s symlink check can go stale.** `packages/platform/src/retention/measure-tree.ts:102` checks directory type, then `:117` later enumerates the pathname. A directory replaced during the walk can cause bytes outside the site to be counted. Use an anchored, no-follow read port for enumeration and child metadata, and report the affected tallies as unknown when the directory identity cannot be maintained. Add a deterministic test for a directory changing between inspection and enumeration.
5. **Add release metadata.** The Platform export at `packages/platform/package.json:234` and the DB SQLite selector match their API baseline entries. Neither public addition has a lane changeset. Add changeset entries for Platform and DB after the final signatures settle.

The storage diff adds no production deletion call or cleanup wiring. The existing pruner retains its sort, keep, protect, and remove sequence. The checked-in mutation logs show that the verified-copy, serialization, and symlink guards each caught the named mutation. Those mutations do not cover the edge cases above.

## `codex/st-ready-tovu` — APPROVE for linked integration after the Jini fixes

`apps/website/src/features/storage/measure.ts:73` supplies Tovu’s categories and database sidecar targets. Jini supplies the walk. The adapter has no serving caller, and the lane adds no routes, approvals, or cleanup wiring. The tests cover category totals, separate WAL sizes, symlink skipping, unknown amounts, and read-only behavior. The recorded mutations failed as intended. Registry integration depends on the released Platform export.

## MERGE-ORDER

- Land the C043 Jini API and baseline fixes before the paired Tovu worker branch. Include both sides in the linked integration check.
- Land the storage Jini fixes before the Tovu storage adapter. Before a registry-backed integration, publish the required Jini artifacts and update Tovu’s affected ranges and lockfiles. The Tovu halves also need merge-14’s Admin, Core, and CMS exports.
- The only shared changed path across the reviewed diffs and the C043 Tovu counterpart is `development/why-comments-debt.json:2744`. Both Tovu branches append at the same location. Keep all six entries. Coordinated registry updates may also overlap in the manifests and lockfiles.
- Theme implementation and assets are untouched. The Tovu halves repoint a type import in theme metadata. The holds counterpart changes a theme-related test and the UI/UX overlay guidance.

**NOT-CHECKED** — The three original prior-review files and `P11-storage-check-v2.md` were unavailable on the supplied local refs. Prior FIX wording came from the lane reports, and storage was checked against the v2 plan and available v1 check. Fewer than five whole-file moves were eligible in the requested slices, so the verbatim checks covered the available split sources, policy predecessor, and related moves. The review stopped at 160 targeted lookups. No files were changed, and no tests, builds, installs, or type-checks were run.
