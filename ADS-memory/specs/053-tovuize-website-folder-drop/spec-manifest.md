# Spec Manifest: tovuize-website-folder-drop

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/spec-manifest.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-053 |
| feature_name | FEAT-053-tovuize-website-folder-drop |
| version | 1.0.0 |
| last_edited | 2026-09-13T00:00:00Z |
| spec_naming | standard |
| spec_root | ADS-memory/specs/053-tovuize-website-folder-drop |
| spec_entrypoint | feature.spec.md |
| spec_readiness_artifact | spec-dod.md |

**Purpose:** This manifest is the package index for the strict Speckit compatibility flow.

---

## Package Applicability Matrix

| Logical File | Status (`PRESENT|OMITTED`) | Actual Filename | Why Present / Why Omitted |
|---|---|---|---|
| `feature.spec.md` | PRESENT | `feature.spec.md` | Canonical primary requirements spec |
| `api.spec.md` | OMITTED | `—` | No new HTTP endpoint is introduced. The drop handler calls the existing `PUT /api/admin/v1/workspaces/:workspaceId/fs-files/custom-root` route unmodified. |
| `state.spec.md` | OMITTED | `—` | No new durable state shape is introduced; the feature writes into the existing per-site `.fs-custom-root.json` and the existing `activations.json` record, both unmodified. |
| `orchestrator.spec.md` | OMITTED | `—` | No new coordinator/orchestration layer is introduced; the change is one wiring call plus agent guidance content. |
| `ui.spec.md` | PRESENT | `ui.spec.md` | Two small new UI elements (drop confirmation, drop error) need explicit contracts, even though they sit alongside otherwise-unmodified existing UI. |
| `errors.spec.md` | PRESENT | `errors.spec.md` | New feature-specific failure/caveat states (invalid dropped path, unreachable endpoint, unnamed binary assets, ambiguous conversion target) need a canonical registry. |
| `behavior.spec.md` | PRESENT | `behavior.spec.md` | Genuine precedence rules apply: conversion-target routing (explicit instruction > shape inference > ask) and custom-root replacement (most recent write wins). |
| `traceability.spec.md` | PRESENT | `traceability.spec.md` | Seeds REQ/AC/INV/EC/error-code/behavior-rule coverage mapping before TDD |
| `spec-manifest.md` | PRESENT | `spec-manifest.md` | Required package index for downstream stages |
| `spec-dod.md` | PRESENT | `spec-dod.md` | Readiness gate and quality proof |

---

## Stage Read Set

| Stage | Must Read |
|---|---|
| `architect` | `feature.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md` |
| `tdd` | `feature.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, `spec-dod.md`, ADR, tasks |
| `programmer` | `feature.spec.md`, `ui.spec.md`, `errors.spec.md`, `behavior.spec.md`, `traceability.spec.md`, ADR, certified tests |

---

## Brownfield / Reverse-Spec References

| Evidence / Touchpoint | Type | Why It Matters |
|---|---|---|
| `apps/desktop/src/renderer/folder-drop.ts` and `apps/desktop/src/renderer/App.tsx:1076-1111` (`WorkspaceChatPane`, `onDropCapture`) | source touchpoint | The existing, already-shipped folder-path-insertion behavior this feature must not regress (REQ-01) and must extend, not replace (REQ-02). |
| `apps/desktop/src/preload/preload.mts:115` | source touchpoint | Bridges Electron's main-process-only `webUtils.getPathForFile` into the renderer; the reason this capability is desktop-only (EC-05). |
| `apps/website/src/features/fs-files/{agent-tools.ts,fs-files.ts,layout.ts,custom-root-store.ts,tool-registrations.ts}` | source touchpoint | The entire existing sandboxed folder-read mechanism (denylist, listing exclusions, size cap, `custom` root) this feature wires into rather than rebuilding (REQ-02, REQ-03, REQ-10). |
| `apps/website/src/server/inbound/admin-http/routes/fs-files/custom-root.ts` | source touchpoint | The existing admin-HTTP endpoint the new desktop wiring calls (REQ-02, REQ-04). |
| `apps/admin/src/components/AssistantDock/FsFolderIndicator.{tsx,hooks.ts}` | source touchpoint | The existing manual/admin-only UI this feature's new desktop-specific UI (ui.spec.md) is explicitly kept independent from. |
| `content/agent-plugins/tovuize-site/skills/tovuize-site/{SKILL.md,references/theme-v2-contract.md,references/kuinetic-worked-example.md}` | source touchpoint | The already-working theme-conversion capability this feature makes discoverable (REQ-06), rather than building a new one. |
| `apps/website/src/features/agent-plugins/seed-bundled.ts` and `apps/website/src/features/agent-plugins/activation.ts` | source touchpoint | Confirms every bundled plugin, including `tovuize-site`, ships `{enabled:false}` by deliberate product-wide design — the root cause of the owner's "not among the installed plugins" observation (worklist §3 item 15), and the reason REQ-06 is a discoverability fix, not a default-flip. |
| `apps/website/src/features/agent-plugins/tool-registrations.ts:584-739` (`search_agent_plugin_local`) | source touchpoint | Confirms an inactive plugin can already be discovered by the agent independent of activation — the mechanism REQ-06 relies on. |
| `apps/website/src/features/pages/{skeleton.ts,agent-tools.ts,html-document-store.sqlite.ts}` and `apps/website/src/platform/db/schema.ts:63,69` | source touchpoint | The existing Page data model ("inner content only," `bodyFormat: "html"`) and write path REQ-07's Page-conversion route reuses unmodified. |
| `ADS-memory/specs/047-pages-vibecoding/spec.md` | source touchpoint | Governing spec for the Pages model this feature's Page-conversion route must remain consistent with. |
| `ADS-memory/specs/004-declarative-theme-system/feature.spec.md` and `development/docs/themes/theme-authoring-guide-v2.md` | source touchpoint | Governing theme-package contracts; confirms the existing `tovuize-site` plugin targets the live `static` tier rather than spec 004's narrower `declarative` tier — a pre-existing, documented drift this feature does not attempt to resolve. |
| `ADS-memory/.local-artifacts/owner-worklist.md` §3 and §12 item 15 | source touchpoint | Owner's verbatim request this spec implements. |

---

## Validation Notes

- Validator last run: pending — run `python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/053-tovuize-website-folder-drop --phase spec --update-hash` before handoff.
- Validator result: PENDING
- Validator manual waiver: N/A
- Canonical hash verified at: pending
- Notes: This is a brownfield spec. Two of its three moving parts (folder-path drop insertion, the sandboxed folder-read tool) are already fully implemented; the third (the `tovuize-site` conversion plugin) is already implemented but undiscoverable by default. The net new work is one wiring call, one small UI addition, and guidance content — no new authentication, encryption, storage, or filesystem-sandboxing mechanism is introduced.
