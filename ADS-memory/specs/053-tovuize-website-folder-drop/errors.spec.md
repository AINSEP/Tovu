# Error Code Registry Spec: tovuize-website-folder-drop

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-053`
- Feature: `FEAT-053-tovuize-website-folder-drop`
- Version: `1.0.0`
- Content Hash: `sha256:0000000000000000000000000000000000000000000000000000000000000`
- Last Edited: `2026-09-13T00:00:00Z`

## Purpose

Canonical error registry for the folder-drop-to-custom-root wiring and the theme/Page conversion guidance this feature adds. Codes that already exist in the generic `fs-files` feature (e.g., denylist refusals, size-cap refusals) are reused unmodified and are not redefined here.

## 1) Error Envelope (Base Payload)

Reuses the existing assistant/tool error envelope unchanged:

```yaml
code: string
message: string
occurredAt: string   # ISO-8601 UTC
correlationId: string|null
details: object|null
```

## 2) Error Code Registry

| Code | Category | Layer (`api\|orchestrator\|ui\|integration`) | HTTP Status | Retryable | User Message Guidance |
|---|---|---|---:|---|---|
| `DROPPED_PATH_NOT_A_DIRECTORY` | validation | `ui` | 400 | yes (drop a different item) | "That's not a folder — drop a folder to set it as the working directory." |
| `DROPPED_PATH_NOT_FOUND` | validation | `ui` | 404 | yes (retry once the path exists) | "That folder couldn't be found. Make sure it still exists and try again." |
| `CUSTOM_ROOT_ENDPOINT_UNREACHABLE` | dependency | `integration` | 502 | yes | "Couldn't set the working folder right now. Try again in a moment." |
| `TOVUIZE_PLUGIN_UNAVAILABLE` | dependency | `integration` | 503 | yes | "The website-conversion plugin isn't available right now." |
| `BINARY_ASSETS_NOT_COPIED` | validation | `orchestrator` | 200 (not a failure — a completion caveat) | n/a | "These files need to be copied by hand: <list>." |
| `CONVERSION_TARGET_AMBIGUOUS` | validation | `orchestrator` | 200 (not a failure — a clarification prompt) | n/a | "Do you want this as a whole theme or a single page?" |

## 3) Per-Code Details Schema

```yaml
DROPPED_PATH_NOT_A_DIRECTORY:
  details:
    path: string

DROPPED_PATH_NOT_FOUND:
  details:
    path: string

BINARY_ASSETS_NOT_COPIED:
  details:
    files:
      type: array
      items: string

CONVERSION_TARGET_AMBIGUOUS:
  details:
    detectedShape: "multi-page-with-nav" | "single-page" | "unknown"
```

## 4) Ownership and Source Rules

| Code | Produced By | Surfaced By | Notes |
|---|---|---|---|
| `DROPPED_PATH_NOT_A_DIRECTORY` / `DROPPED_PATH_NOT_FOUND` | Existing `setCustomFsRoot` validation (unmodified), called by the new drop-handler wiring | `FolderDropError` (ui.spec.md §2.2) | These are the existing validation's own failure modes, given feature-specific names here only for this registry's clarity — no new validation logic is written |
| `CUSTOM_ROOT_ENDPOINT_UNREACHABLE` | New drop-handler wiring's HTTP call | `FolderDropError` | Distinguishes "the request never reached the server" from a validation rejection |
| `TOVUIZE_PLUGIN_UNAVAILABLE` | Agent runtime, when the plugin's content cannot be read | Agent chat response | Matches feature.spec.md Dependencies row for `content/agent-plugins/tovuize-site/` |
| `BINARY_ASSETS_NOT_COPIED` | Guidance-driven agent behavior at the end of a conversion (REQ-08) | Agent chat response | Not an error in the HTTP sense — a mandatory completion caveat; included here so it is not silently dropped from any future automated check of "does the agent always mention this" |
| `CONVERSION_TARGET_AMBIGUOUS` | Guidance-driven agent behavior (EC-07) | Agent chat response | Also not an HTTP error — a required clarification prompt |

## 5) Acceptance Checklist

- [x] Every error this feature's new code can emit appears in Section 2.
- [x] Every code has clear retry behavior.
- [x] No `api.spec.md` exists for this feature (see `spec-manifest.md`); codes here are cross-checked against `feature.spec.md`'s Edge Cases instead.
- [x] User-safe message guidance is provided for every code.
