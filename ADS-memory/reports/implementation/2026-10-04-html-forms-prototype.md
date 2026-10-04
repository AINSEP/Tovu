# HTML forms prototype

Inputs: owner dispatch 2026-10-04; development/todos.md raw-HTML embed/authoring notes; architecture
sections 13 and 14; current Jini cms-forms API and Tovu form/widget/page adapters.

Acceptance: both form and widget markers use contact-form resolution; html render mode emits semantic
unstyled HTML with a server-owned POST endpoint and honeypot; browser redirects retain confirmations;
authored form names become the submission allowlist at save time; admin editor switches Builder/HTML,
seeds a starter, copies an embed, and translates all new UI strings. Tests must be written, never run.

Decision: compose existing ports and Jini audited commands, no provider coupling or migrations. Store
HTML mode/body/derived fields together in the existing fields_json text column, decoding legacy arrays.
The framework-free renderer stays isolated for Jini extraction, deferred explicitly by the owner.
A dedicated /forms/:formId/authoring PUT avoids the already-modified shared-tree update route. Raw
HTML uses pages.edit_html authority plus admin.forms.manage, matching HTML Pages' admin/owner trust.
Builder writes preserve their existing endpoint. HTML supports scalar text/email/textarea/checkbox
answers, single selects and radio groups; password/file/multiple select controls are rejected.

Output: renderer, persistence adapter, authoring route, editor hooks/UI and unexecuted contract tests.
Risk: no runtime/typecheck/build validation permitted in this dispatch. Coordinator must run tests.
Next assignee: coordinator/TestRunner for validation, then owner for visual prototype review.

Validation handoff: no tests/typecheck/build/dev server executed, as explicitly required. Read-only
`git diff --check` completed without whitespace findings. The already-modified
`apps/website/src/features/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts`
contains an obsolete expectation that `form` has no resolver (test near line 180); left untouched
for the concurrent test-rigor wave/coordinator. New integration coverage proves the restored path.
The untouched reference index still does not index direct `form` markers; restoring/normalizing
form id and slug references for where-used protection is follow-up work beyond the requested rendering
prototype. Scalar field restrictions remain Jini's existing 1-20 lowercase ASCII field names, optional
underscores; file/password/multiple selection controls need future package contracts.

Validation (2026-10-04, coordinator verify pass): all 10 TESTS TO RUN files plus html-embeds.unit pass
through the memory gate; forms code is clean under root `tsc` and admin typecheck (remaining errors are
other jobs' media/plugin files). Fixes: aligned the HTML renderer's default success message with the
contact-form widget's; rewrote the obsolete resolver test to pin `form` (by id and slug) to identical
IR as the widget; dropped an invalid `exact` testing-library option; gated the authoring PUT on
`admin.forms.manage` before any lookup (same as `update.ts`, f07a92dcb). Browser walkthrough
(create in HTML mode, Copy HTML embed, paste into an HTML page, submit, see the submission) passed;
screenshots in `.local-artifacts/verification/2026-10-04-html-forms/`.
