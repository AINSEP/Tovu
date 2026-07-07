# UI Contract Spec: Declarative Theme System — Manifest, Hierarchy Resolver, Activation

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-004`
- Feature: `FEAT-004-declarative-theme-system`
- Version: `1.0.0`
- Content Hash: `sha256:see feature.spec.md (package hash of record)`
- Last Edited: `2026-07-07T02:35:00Z`

## Purpose
Framework-independent contracts for the Appearance section changes (REQ-11). Today's `apps/admin/src/sections/Appearance.tsx` offers the 3 hardcoded themes; it generalizes to the discovery-driven list.

## 1) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `AppearanceSection` | Loads `THEMES_LIST`, renders groups, hosts activation | Section 2.1 | Section 3.1 |
| `ThemeCard` | One theme: name, version, source badge, status, activate control | Section 2.2 | Section 3.2 |
| `ThemeErrorList` | Validation errors of an invalid theme | Section 2.3 | n/a |
| `ErrorBanner` | Recoverable API errors (shared contract with SPEC-002 ui) | SPEC-002 ui §2.6 | SPEC-002 ui §3.6 |

## 2) Input Contracts (Props/Inputs)

### 2.1 AppearanceSection
| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `workspaceId` | yes | `string` | none | |
| `themes` | yes | `array<ThemeListItem>` | none | server order preserved (TB-01: built-ins, then site themes) |
| `isLoading` | yes | `boolean` | none | |
| `errorMessage` | no | `string\|null` | `null` | |

### 2.2 ThemeCard
| Input | Required | Type | Notes |
|---|---|---|---|
| `theme` | yes | `ThemeListItem` | `{id, name, version, source, status, errors, active}` per api.spec.md §5 |
| `isActivating` | yes | `boolean` | disables the control while a PATCH is in flight |

### 2.3 ThemeErrorList
| Input | Required | Type | Notes |
|---|---|---|---|
| `errors` | yes | `array<{code, file, message}>` | rendered verbatim; codes are developer-facing |

## 3) Event Contracts (Outputs)

### 3.1 AppearanceSection
| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onActivated` | `themeId` | 200 from `PRESENTATION_PATCH` | list refetched; exactly one card shows active |
| `onError` | `{message, code}` | non-2xx | `ErrorBanner` shows; on 422 `THEME_INVALID` the card's error list is refreshed from `details` |

### 3.2 ThemeCard
| Event | Payload | Trigger |
|---|---|---|
| `onActivateRequest` | `themeId` | activate control on a valid, non-active card |

## 4) Rendering and Interaction Rules

- [ ] Themes render in server order, grouped with headings: "Built-in" then "Installed" (site source); the Installed group is omitted when empty (legacy mode).
- [ ] The active theme's card is visually marked and has no activate control.
- [ ] Invalid themes render with a status badge and `ThemeErrorList`; they never render an activate control (REQ-11).
- [ ] At most one activation request is in flight; all activate controls disable during it.
- [ ] After activation failure the previous active card remains marked (server state is authoritative — refetch on any failure).
- [ ] An empty Installed group in a served install dir may show a hint: drop a theme folder into `themes/` (copy is shell-owned).

## 5) Accessibility Requirements

| Area | Requirement |
|---|---|
| Semantic roles | Cards in a `list`; activate controls are `button`s with accessible names including the theme name. |
| Labels | Status badges have text equivalents (not color-only); source groups are labelled headings. |
| Keyboard | Cards and activate controls fully keyboard-operable with visible focus. |
| Status updates | Activation success/failure announced via ARIA live region. |
| Error clarity | Validation errors are plain text associated with their theme card. |

## 6) Composition Rules

- `AppearanceSection` is the only public entry component; `ThemeCard`/`ThemeErrorList` render only within it.
- API access goes through the shell api client (`apps/admin/src/lib/api.ts` gains `listThemes`); activation reuses the existing presentation patch call.
- The existing `Appearance.tsx` satisfies this by replacing its hardcoded id list with the fetched `themes` array.

## 7) Acceptance Checklist

- [x] Each public component has explicit input and event contracts
- [x] Rendering conditions are deterministic
- [x] Accessibility requirements are testable
- [x] Entity names and statuses align with api.spec.md (`ThemeListItem`) and state.spec.md (`ThemeDiscoveryRecord` serialization)
