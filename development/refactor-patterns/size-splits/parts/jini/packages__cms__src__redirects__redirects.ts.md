### jini:packages/cms/src/redirects/redirects.ts
- **Over:** file 518 lines (no function over 100)
- **Phase:** now · **Batch:** size-19
- **Package entry:** not an exports target; `./redirects` → `src/redirects/index.ts`, which has `export * from "./redirects.js"` → ADD `export * from "./redirects-validation.js"` beside it (entry keeps every public name).
- **Tests:** `src/redirects/__tests__/redirects.test.ts`, `redirects.chain-loop.test.ts`, `redirects.reserved-target.test.ts`, `redirects.write-boundaries.test.ts`, `entries.test.ts`, `open-redirect.matrix.test.ts`, `phase-handler.read-path-target.test.ts`; helper `__tests__/remove-redirect-double.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A validation | `MIN_TARGET_LENGTH`, `MAX_TARGET_LENGTH`, `MIN_PRIORITY`, `MAX_PRIORITY`, `VALID_STATUS_CODES`, `VALID_STATUSES`, `isAbsoluteOrProtocolRelative`, `RemoveRedirectFn`, `RedirectsWriteDeps`, `validateStatusCode`, `validateStatus`, `validateToTargetLength`, `validatePriority`, `resolveCollapsedTarget`, `collapseOneHop`, `assertChainDoesNotReturn`, `siteRelativeRefusalReason`, `assertRedirectSourceAllowed`, `siteRelativeTargetReason`, `assertTargetAllowed`, `assertNoDuplicate`, `WriteValidatedFields`, `validateWriteFields`, `checkRedirectFieldsWouldWrite` | what a redirect rule may say (shape, target safety, chains) |
| B (stays) | `DEFAULT_PRIORITY`, `MAX_IMPORT_BATCH_SIZE`, `enqueueMutatedEvent`, create/update/restore/tombstone/list/import functions + their request types | redirect writes |

- **Splits:**
  1. NEW `redirects-validation.ts` — unit A verbatim, source order (every refusal-reason comment moves; the "Exported (unchanged values) so agent-tools.ts…" comment moves with the constants). Exports the names redirects.ts uses plus the already-exported ones. Imports nothing from redirects.ts.
  2. redirects.ts imports from it; does not re-export (index.ts does).
- **Importers to update:** `src/redirects/index.ts` (add `export *`); `src/redirects/capture.ts` and the tests above — re-point only names that moved (`rg -n "/redirects\.js[\"']" src`), e.g. `assertRedirectSourceAllowed`, `siteRelativeTargetReason`, `checkRedirectFieldsWouldWrite`, `RedirectsWriteDeps`, `RemoveRedirectFn`, the `MIN_/MAX_` constants (`agent-tools.ts` imports them — check its path).
- **After:** redirects.ts ~290; redirects-validation ~240.
- **Risks / notes:** `resolver.ts` L143 comment refers to "redirects.ts's `enqueueMutatedEvent`" — still true (it stays).
