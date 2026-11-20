# jy-pa refresh

Base: merge-6 (`d3e78b387`). Sheets J01, J02, J03, J04, J06, J07 and E-J1 completed; no STOPPED anchors or sheets. No importer repoints or unlisted importer/test overlaps; no symbols moved or renamed, so no importer searches were needed. No NOT-YOURS files edited.

Prose verification is static diff review only. Combine must rerun owner-rules-audit; no prose review mutations were applied (CULL). Tests and the E-J1 cloud mutation were not run under the machine rule. E-J1 matches the exact CULL replacement; its test file still has 25 test declarations.

E-J1 cloud-only mutation pending: `packages/cms/src/forms/submission-attempts.ts:178`, `settle(false)` → `settle(true)` must fail the final one-row assertion. Restore the mutation; do not commit it.

Unlisted neighboring references encountered during the required reads were retained under the audited-line restriction, including:

- J01: `packages/cms/src/comments/types.ts:7` (section reference), `packages/cms/src/comments/ports.ts:59` (open-question label).
- J04: `packages/cms/src/seo/types.ts:6` (original-plan citation), `packages/cms/src/seo/sitemap.ts:224` (requirement label).
- J06: `packages/db/src/data-modules/data-module.ts:237` (section reference), `packages/db/src/data-modules/restore.ts:4` (section reference).
- J07: `packages/db/src/recovery/recovery-orchestrator.ts:8`, `:24`, `:195` (requirement/acceptance labels), `packages/db/src/recovery/restore-hooks.ts:70` (requirement/acceptance labels).

These are scope notes, not STOPPED audited anchors. Existing audit record identifiers and finding labels were preserved as history. See COMMIT-PLAN.md for each sheet’s file list, counts, existing files above 500 lines, and draft wording discarded during diff review. No changesets or public-signature changes.
