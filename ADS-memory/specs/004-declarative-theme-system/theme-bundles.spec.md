# Theme bundles and consented plugin dependencies

Version: 0.1.0 · Date: 2026-10-17 · Status: DRAFT standalone slice for SPEC-004 OQ-06 / TRIAGE s4-31 (original TODO line 1356).

Parent reference: SPEC-004 v1.1.0 records `sha256:1f07ca7501f8e5f7b8f3c8b8a5816107cdcdd93e5fe99e82bf8a7758c280cd66`; quoted as recorded provenance, not revalidated approval of this new slice.

Inputs: accepted ADR-019, ADR-020 amendments, SPEC-004 OQ-02/04/06 and SPEC-005 plugin contracts; current theme loader, theme admin hooks, and Jini plugin/registry package boundaries. This document specifies the owed slice; it is not approval, a new plugin-identity ADR, or an active strict package. Promotion must assign its delivery identity, package/read set, canonical hash and provider preflight. No executable behavior changes here.

## Intent and reuse decision

An authorized operator can choose a theme with companion plugins, inspect the combined permission request and activate it without searching for each plugin separately. A theme remains presentation data. Executable behavior belongs to plugins, including when the artifact contains both.

ADR-019 owns the packaging/trust decision and its requires shape. The current `apps/website/src/features/theme/theme.ts` loader owns theme validation; the plugin runtime owns install, trust, enable/disable and permissions. Tovu supplies theme activation and site scope. Jini’s existing plugin/registry mechanisms must be called or extended for generic dependency planning and validation; no theme-owned plugin loader is allowed. Search found no implemented theme requires/versionRange planner in those plausible owners. Package/registry binding details need Architect review before a generic API is added, not a copied lifecycle in Tovu.

Actors: operator with existing theme + plugin installation authority, plugin publisher, and public reader. Resources: theme artifact, required plugin artifacts, resolved versions, consent and active theme binding. Non-goals: marketplace implementation, publisher-ID migration, general package manager, arbitrary scripts inside data themes, plugin removal on theme switch, and new dependency solver/library selection.

## Manifest contract

Preserve ADR-019’s field names:

```json
{
  "requires": [
    { "pluginId": "acme/mega-nav", "versionRange": "^1.2", "optional": false },
    { "pluginId": "acme/seo", "versionRange": "^0.4", "optional": true }
  ]
}
```

Missing requires means no companion plugins. pluginId is a lookup identity in the existing approved plugin catalog contract, never a filesystem path, module specifier or executable expression. This slice does not decide the separately open publisher-qualified identity migration. An unresolvable id is an unavailable dependency, not permission to substitute a similar name. Version ranges use the platform’s semver contract; no handwritten range evaluator. Reject malformed entries and contradictory duplicate constraints before consent.

Referenced artifacts come through the existing registry/provenance mechanism. Vendored artifacts are permitted for approved first-party/offline bundles and enter **the same** plugin pipeline; bundle location never grants trust, permissions or autoexecution. A vendored artifact with failed provenance is not rescued by a valid theme manifest.

## Lifecycle and requirements

| ID | Requirement / invariant | Observable acceptance |
|---|---|---|
| TB-01 | A dependency plan resolves required plugins to exact artifacts/versions before install consent. Installed compatible plugins are reused. No downgrade or replacement of an incompatible installed plugin is automatic. | A compatible enabled plugin yields reuse; an incompatible installed version produces a blocker identifying id, installed version and required range. No files, enablement or theme binding change while planning. |
| TB-02 | Required unavailable/invalid/incompatible plugins block activation. Optional dependencies do not. | Required failure leaves the previous theme active and lists remediation. Optional missing plugin appears as a disclosed omission with the theme’s existing safe component fallback; no silent network/code fetch occurs during rendering. |
| TB-03 | One consent view lists each new/changed plugin, exact version, provenance/trust class, requested permissions and whether it is required or optional. | Cancelling changes no plugin or theme state. A bundle containing code is labeled “Theme + plugins — requests permissions”; a pure data theme with no dependencies is labeled “Pure theme — no code.” The label is derived from the plan, not publisher copy. |
| TB-04 | Consent binds to the reviewed plan. Re-resolving a different artifact, permission set or version invalidates it. | Change a dependency between review and confirmation: installation refuses to use the stale consent and presents the changed plan. No broader permission set is accepted implicitly. |
| TB-05 | Each plugin install/enable uses the normal permission, provenance, conflict and lifecycle gates. Theme activation happens only after required dependencies are ready. | Inject a required-plugin failure: old active theme remains selected; no partial theme activation; completed plugin installs are reported by id/version. No new theme-side import() path exists. |
| TB-06 | Recovery is explicit and respects existing plugin transactions/side effects. Do not promise cross-plugin atomic rollback. | On interruption/failure, report the completed/reused/pending steps and use the plugin owner’s recovery status. Retrying reconciles actual installed state; it does not execute completed steps blindly. Newly installed but inactive plugins are retained/recoverable rather than deleted along with their data. |
| TB-07 | Switching/removing a theme never automatically disables or uninstalls a plugin. | Two themes share a plugin; switching either leaves it installed. Uninstall/disable uses the existing plugin screen and warns/blocks according to existing dependency/reference policy for the active theme. |
| TB-08 | Required dependency loss prevents later activation and degrades safely on an already-active theme. | Disable/unavailable plugin: show needs-plugins in admin; component resolution yields existing safe fallback, never arbitrary JS or a whole-site failure. Restoring a compatible plugin makes readiness recomputable. |
| TB-09 | Bundle metadata cannot evade tier and asset validation. | A data theme containing executable payload is rejected under existing tier/asset rules; pointing requires at that file never causes it to load. Tier-3 restrictions remain separate. |
| TB-10 | Shared requests and site boundaries are preserved. | An install plan created for site A cannot activate site B’s theme. A stale active-theme version/state must be rechecked at activation. Existing authorized install APIs remain the enforcement boundary, regardless of UI or agent caller. |

States: discovered → planned (ready / blocked) → awaiting consent → installing through the plugin owner → ready to activate → active. Cancellation before installation is mutation-free. Failure after a plugin step yields a recoverable plan plus the old active theme; it is not falsely labeled rolled back. Concurrent plans re-read actual plugin/theme state through existing owners before any effect.

Errors are conditions to map onto the existing theme/plugin envelope during package promotion: invalid manifest; unresolved dependency; incompatible installed version; trust/provenance refusal; authorization denied; changed plan; install/enable failure; stale activation state. Each identifies the affected plugin and next action without exposing credentials, artifact auth URLs or internal paths. Existing theme statuses are retained; needs-plugins is the readiness concept required by ADR-019, with its wire representation to be ratified in the implementation contract.

## UI and verification contract

Catalog/readiness → plan details → one permission confirmation → progress by plugin → activation result. Keyboard and screen-reader names, focus return and recoverable errors use the shared admin controls. Optional plugins are explicitly selectable and have visible omission consequences; required ones cannot be silently unchecked. Agents use the same authorized plan/consent path, not an ambient bypass.

Future test-first coverage belongs next to theme validation/activation tests in Tovu and the owning plugin planner/lifecycle tests in Jini: pure theme; required/optional missing; compatible reuse; incompatible version; duplicate/malformed requires; vendored provenance failure; denied authority; consent mutation; partial failure/interruption/retry; shared dependency theme switch; cross-site plan replay. Integration tests must verify actual activation state and plugin effects, not only a successful UI response. No tests were written or run for this documentation-only slice.

NFRs: use existing artifact/dependency size bounds, serializable plan data and bounded registry lookups; renderer performs no dependency installation or registry I/O. No solver performance number is asserted before a delivery scope exists.

Constitution: I uses existing registry/semver/plugin machinery; II/V require later certified boundary tests; III/IV avoid a new package manager/port absent a real contract; VI independently applies plugin trust/permissions; VII package version/hash/preflight required before implementation; VIII existing plugin audit events plus activation outcome/correlation, without a second audit store. No exception or ownership override proposed.

Output: standalone bundle slice closing the missing written requirements. Risks: artifact envelope and publisher-ID evolution remain owned by their existing decisions; generic API placement must be confirmed by Coordinator/Architect. Next assignee: Coordinator to bind the slice to the approved plugin/artifact contracts, then Spec package promotion → review → test-first delivery.
