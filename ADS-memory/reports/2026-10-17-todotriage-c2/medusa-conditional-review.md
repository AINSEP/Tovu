# Medusa conditional research review

Software Architect + Spec (Direct): review of TRIAGE s4-77 (original TODO line 1621), completed 2026-10-17.

Inputs: `development/other-repos-specs/medusa_specs/TODO.md:3`–7, README, coverage-audit, admin/admin-dashboard-and-extension-surface and the current surface-descriptor task. This is a local corpus review, not a fresh Medusa source audit or current upstream verification. No deeper Medusa research, network access or Shopify work was undertaken.

The TODO is conditional, not a requirement to complete all five research branches. Existing composition-level admin, HTTP-convention and workflow notes already cover the level needed by this dispatch. `coverage-audit.md` explicitly labels design-system and telemetry coverage partial and hosted internals out of scope; those limitations must remain visible.

| Conditional branch | Trigger in the TODO | Decision for this dispatch | Existing material / future narrow question |
|---|---|---|---|
| Smaller admin-extension authoring note | Tovu wants a stricter extension SDK model | **Defer deeper work pending owner contract.** The admin surface task identifies admission/lifecycle/identity as a decision, not authorization to adopt Medusa’s SDK. | Existing admin extension note describes routes, menus, widgets, form/display/i18n zones and build aggregation. If a stricter SDK is selected, research only identity binding, admission, disable/uninstall and isolation relevant to that contract. |
| Route-by-route DTO inventory | Medusa HTTP parity required | **Not triggered.** No assigned item requests Medusa HTTP parity. | Reuse runtime/http-contracts-and-route-conventions.md and http-surfaces.md; do not generate hundreds of DTOs without a named consumer. |
| @medusajs/ui design-system note | Tovu needs that component layer itself | **Not triggered.** Tovu/Jini already own their shared admin/UI layer. | This task needs accessibility and ownership contracts, not a replacement toolkit. Current corpus marks internals partial. |
| Telemetry/operations note | Medusa runtime-operability posture needed as reference | **Not triggered.** No assigned slice depends on copying Medusa operations. | Retain bootstrap-level notes and the declared partial coverage. |
| Cloud public-doc capture | Optional hosted reference requested | **Not triggered; no network authorized.** | Hosted control-plane internals remain unknown/inferential. Public documentation, if later requested, must be kept separate from inspected OSS behavior. |

Completion evidence: each TODO branch was evaluated against the current brief and existing corpus. No conditional item was deleted or falsely checked as researched. **ITEM 1621 DONE** means review-before-deeper-work, not completion of the optional research itself.

Output: bounded go/no-go decisions above. Risk: local notes may be stale and are not a current upstream authority; no claim about present Medusa APIs is made. Next assignee: Coordinator if an extension SDK decision activates the first branch; otherwise no further Medusa work for these items. TODO and source corpus remain unmodified.
