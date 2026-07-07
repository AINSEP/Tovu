# Spec: Shared Headless Contracts

## Goal

Define one reusable TypeScript contract surface for framework adapters that consume Tovu's headless HTTP APIs.

## Rules

- Shared contracts must not live inside `server/` or any frontend package.
- Shared contracts must describe versioned HTTP payloads, not raw repository records.
- Public content payloads should stay narrower than admin payloads when admin-only fields are not required.
- Server serializers must type against these contracts.
- Frontend adapters may re-export or consume these contracts directly.
- Core and feature modules must remain independent from these adapter-facing contracts.

## Acceptance Checks

- The Express headless server can serialize admin and content payloads using the shared contracts.
- The Next.js shell can consume the same types without duplicating payload definitions.
- Adding another frontend adapter should not require redefining the existing admin/content DTOs.
