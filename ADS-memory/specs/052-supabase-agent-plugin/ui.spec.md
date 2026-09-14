# UI Contract Spec: supabase-agent-plugin

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/ui.spec.md`

- Spec ID: `SPEC-052`
- Feature: `FEAT-052-supabase-agent-plugin`
- Version: `1.0.0`
- Content Hash: `sha256:0000000000000000000000000000000000000000000000000000000000000`
- Last Edited: `2026-09-13T00:00:00Z`

## Purpose

Defines the two new in-chat MCP-UI form surfaces this feature introduces (project scope + fallback access token). Both are rendered inside the existing `@jini-ai/chat` `McpUiSurfaceCard` host via the existing `@jini-ai/ui` `buildFormSurface`/`renderFormDocument` mechanism — this file specifies only the new surface content, not the rendering engine (which is out of scope; see `feature.spec.md` Scope).

## 1) Component Registry

| Component | Responsibility | Inputs Ref | Events Ref |
|---|---|---|---|
| `SupabaseConnectLink` | Plain chat-message link the agent sends to start OAuth login or, in fallback, to the Supabase token-creation page | Section 2.1 | n/a (rendered as markdown text, not an interactive component) |
| `ProjectScopeForm` | MCP-UI surface: pick one Supabase project + read-only toggle | Section 2.2 | Section 3.2 |
| `AccessTokenForm` | MCP-UI surface (fallback only): masked personal-access-token field | Section 2.3 | Section 3.3 |
| `SupabaseConnectionStatus` | Existing generic External MCP connection row in the admin Integrations page — reused unmodified to show this connection's status | Section 2.4 | n/a |

## 2) Input Contracts (Props/Inputs)

### 2.1 SupabaseConnectLink

Not a rendered UI component — a plain markdown link inside the agent's chat message, built from the URL returned by `external_mcp_oauth_connect` (primary path) or a static link to `https://supabase.com/dashboard/account/tokens` (fallback path). No props table applies; documented here only to name it in the Composition Rules below.

### 2.2 ProjectScopeForm

| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `connectionId` | yes | `string` | none | The External MCP server id this scope applies to (`supabase`) |
| `projects` | yes | `array<{ ref: string, name: string, organizationName: string }>` | none | Populated server-side from the OAuth-authorized account before the form is emitted; empty array is a valid input (see EC-02 handling below) |
| `selectedProjectRef` | no | `string \| null` | `null` | Pre-selection; null forces an explicit choice |
| `readOnly` | yes | `boolean` | `true` | Must default to `true` per REQ-06 — the server sets this default when building the surface, not the client |
| `submitLabel` | no | `string` | `"Connect"` | |
| `cancelLabel` | no | `string` | `"Cancel"` | |

### 2.3 AccessTokenForm

| Input | Required | Type | Default | Notes |
|---|---|---|---|---|
| `connectionId` | yes | `string` | none | The External MCP server id this token applies to (`supabase`) |
| `tokenField` | yes | `{ kind: "string", secret: true, required: true, placeholder: string }` | none | Modeled 1:1 on `custom-credential-set-token-ui.ts`'s single masked field; the raw value is never echoed back into the form on re-render |
| `helpLinkUrl` | yes | `string` | `"https://supabase.com/dashboard/account/tokens"` | Rendered as static text above the field |
| `submitLabel` | no | `string` | `"Save token"` | |
| `cancelLabel` | no | `string` | `"Cancel"` | |

### 2.4 SupabaseConnectionStatus

Reused unmodified from the existing generic External MCP admin list (Settings → Integrations). No new props — out of scope for this feature beyond ensuring the Supabase connection's `oauthStatus`/`enabled`/allowlist fields render through the existing generic component like any other connection.

## 3) Event Contracts (Outputs)

### 3.2 ProjectScopeForm Events

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSubmit` | `{ __exchangeId, projectRef: string, readOnly: boolean }` posted as tool-call params for the `supabase_set_project_scope` redeemable tool id | Submit control activation with a project selected | Server validates `projectRef` is in the account's project list, persists it plus the read-only choice, replaces the form surface with a success outcome resource, and resolves the parked agent tool call via `askThenReport` |
| `onCancel` | `{ __exchangeId }` posted for the paired cancel tool id | Cancel control activation | The parked agent tool call resolves as cancelled; no project is persisted; the connection remains disabled |
| `onSubmitNoProjectSelected` | n/a (client-side guard) | Submit attempted with `selectedProjectRef == null` | Form does not submit; inline validation message shown; no network call made |

### 3.3 AccessTokenForm Events

| Event | Payload | Trigger | Expected Outcome |
|---|---|---|---|
| `onSubmit` | `{ __exchangeId, token: string }` posted as tool-call params for the `supabase_set_access_token` redeemable tool id | Submit control activation with a non-empty token | Server performs a lightweight authenticated probe against Supabase, seals the token on success, replaces the form with a success/failure outcome resource, and resolves the parked agent tool call via `askThenReport` — mirrors `custom_credential_set_token`'s `handleSetTokenAnswer` exactly |
| `onCancel` | `{ __exchangeId }` posted for the paired cancel tool id | Cancel control activation | The parked agent tool call resolves as cancelled; no token is stored |
| `onSubmitEmptyToken` | n/a (client-side guard) | Submit attempted with an empty field | Form does not submit; inline validation message shown |

## 4) Rendering and Interaction Rules

- [ ] `ProjectScopeForm` is rendered only after `oauthStatus == "connected"` and before any Supabase tool is enabled (REQ-05, INV-04).
- [ ] `ProjectScopeForm`'s read-only toggle renders as "on" on first paint with no user interaction (REQ-06, AC-06).
- [ ] `AccessTokenForm` is rendered only when the OAuth self-configuration path has failed or is not attempted (REQ-08) — it must never be offered as a first-choice alternative to OAuth when OAuth is available.
- [ ] Neither form ever pre-fills a previously submitted secret value; a resubmission always starts from an empty field.
- [ ] On successful submit, the form surface is replaced in place (same `ui://` URI) with a success or failure outcome — the form is never left showing a stale "submit" state after the server has already processed the answer.
- [ ] Both forms' submit tool ids MUST be present in `MCP_UI_REDEEMABLE_TOOL_IDS` before either form is shipped (REQ-07); this is a release gate, not a rendering condition, but its absence is directly observable as every submission returning 403.

## 5) Accessibility Requirements

| Area | Requirement |
|---|---|
| Semantic roles | `ProjectScopeForm`'s project picker uses a native `<select>`/listbox role; the read-only toggle uses `role="switch"` with `aria-checked` reflecting state. |
| Labels | The token field in `AccessTokenForm` has an accessible name distinct from its placeholder (placeholder text alone is not an accessible label). |
| Keyboard | Both forms are fully operable by keyboard: tab order follows visual order, Enter submits, Escape triggers cancel. |
| Status updates | The switch from "form" to "outcome" resource (success/failure) is announced via an ARIA live region, consistent with the existing `custom_credential_set_token` outcome pattern. |
| Error clarity | Client-side validation errors (no project selected, empty token) and server-side errors (invalid token, project mismatch) are both associated with the relevant field, not shown only as a floating banner. |

## 6) Composition Rules

- `SupabaseConnectLink` is plain chat text, never a form — it must not be implemented as an MCP-UI resource.
- `ProjectScopeForm` and `AccessTokenForm` are mutually exclusive for a given connect attempt: a single connect flow renders at most one of the two, never both at once (see `behavior.spec.md` §1 for the OAuth-vs-fallback precedence rule).
- Both forms are rendered through the existing generic `McpUiSurfaceCard`/`McpUiHost` — no plugin-specific rendering component is introduced.
- `SupabaseConnectionStatus` remains entirely the existing generic External MCP admin component; this feature must not fork it.

## 7) Acceptance Checklist

- [x] Each public component has explicit input and event contracts.
- [x] Rendering conditions are deterministic (Section 4).
- [x] Accessibility requirements are testable (Section 5).
- [x] Entity/field names (`connectionId`, `projectRef`, `readOnly`, `oauthStatus`) match the names used in `feature.spec.md` and `behavior.spec.md` — no state/orchestrator contract file exists for this feature (see `spec-manifest.md`), so no additional projection check applies.
