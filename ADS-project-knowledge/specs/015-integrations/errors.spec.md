# Error Code Registry Spec: integrations

SPEC PACKAGE FILE: `framework/spec-providers/speckit/templates/spec-system/errors.spec.md`

- Spec ID: `SPEC-015`
- Feature: `FEAT-015-integrations`
- Version: `1.0.0`
- Content Hash: anchored in `feature.spec.md`
- Last Edited: `2026-07-13T00:00:00Z`

**As-built note:** the shipped routes do not emit the idealized structured envelope this template shows for most cases — only the 403 (`FORBIDDEN`) path emits `code`/`details`. This registry names logical codes for traceability (matching this package's `api.spec.md` §6), each annotated with the ACTUAL wire shape the route returns, not an idealized one.

## Purpose
Canonical error registry for the `integrations` feature's admin API surface, independent of stack/language.

## 1) Error Envelope (Base Payload) — as actually returned

**403 (FORBIDDEN) responses** (every route, when `authorize()` denies):
```yaml
error: string    # e.g. "principal 'x' is not authorized for 'integration.manage' (reason)"
code: "FORBIDDEN"
details:
  permission: "integration.manage"
  reason: string   # the authorize() denial reason
```

**Every other error response** (400s, 404s, 500):
```yaml
error: string    # human-readable message; for validation errors this is the thrown Error's .message verbatim
```

No response includes `occurredAt` or `correlationId` — the template's idealized envelope fields are not implemented on this route surface. This is a real, disclosed gap (see `feature.spec.md`'s Constitution Compliance, Article VIII note) rather than an assumed match to the template.

## 2) Error Code Registry

| Code | Category | Layer | HTTP Status | Retryable | Produced By | User Message Guidance |
|---|---|---|---:|---|---|---|
| `WORKSPACE_NOT_FOUND` | resource | `api` | 404 | no | Every route's leading `:workspaceId` check | "Workspace not found." |
| `INTEGRATIONS_SUBSCRIPTION_NOT_FOUND` | resource | `api` | 404 | no | `pause.ts`/`delete.ts` (via `WebhookSubscriptionNotFoundError`), `deliveries.ts` (direct `findById` null check) | "This webhook subscription no longer exists." |
| `INTEGRATIONS_VALIDATION_ERROR` | validation | `api` | 400 | no | `create.ts`/`pause.ts` (via `WebhookSubscriptionValidationError`) | "Please correct the highlighted fields." |
| `FORBIDDEN` | authz | `api` | 403 | no | Every route's `authorize()` check | "You do not have permission to manage integrations." |
| `INTERNAL_ERROR` | internal | `api` | 500 | maybe | The catch-all `catch` block in every route | "Unexpected server error." |

**As-built note:** the actual `error` string bodies do not literally say `"WORKSPACE_NOT_FOUND"` or `"INTEGRATIONS_VALIDATION_ERROR"` — those are this registry's logical names for traceability. The wire body for e.g. a workspace mismatch is literally `{ "error": "workspace was not found" }` with no `code` field at all; only the 403 case carries an explicit `code: "FORBIDDEN"`. This asymmetry is real and documented, not simplified away.

## 3) Per-Code Details Schema

```yaml
FORBIDDEN:
  details:
    permission: "integration.manage"
    reason: string   # authorize()'s AuthResult.reason

# No other code carries a `details` object in the shipped routes.
```

## 4) Ownership and Source Rules

| Code | Produced By (file) | Surfaced By | Notes |
|---|---|---|---|
| `WORKSPACE_NOT_FOUND` | Every route in `src/server/routes/admin/integrations/*.ts` | API only | Checked before authorization on every route — an unrelated workspace id never reveals whether a subscription id exists |
| `INTEGRATIONS_SUBSCRIPTION_NOT_FOUND` | `pause.ts`, `delete.ts` (catch `WebhookSubscriptionNotFoundError` from `src/integrations/subscriptions.ts`), `deliveries.ts` (explicit `findById` null check) | API only | `create.ts` cannot produce this code — there is no subscription id in a create request |
| `INTEGRATIONS_VALIDATION_ERROR` | `create.ts`, `pause.ts` (catch `WebhookSubscriptionValidationError`) | API only | `delete.ts`/`deliveries.ts` never throw this — deletion and delivery-log reads have no validated input fields |
| `FORBIDDEN` | Every route, via a direct `authorize()` call (not the SPEC-001 command gateway) | API only | Identical shape/wording across all five routes — verified by grep across the route files |
| `INTERNAL_ERROR` | Every route's catch-all | API only | Swallows any error not explicitly type-checked above (including a thrown, unexpected repo error) |

## 5) Acceptance Checklist
- [x] Every error emitted by the routes this pass ships appears in Section 2.
- [x] Every code has a documented (in this case: uniformly non-retryable) retry behavior.
- [x] Every code used in `api.spec.md` §6 appears here.
- [x] The real (non-idealized) envelope shape is documented, not assumed to match the template.
