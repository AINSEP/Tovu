# headless Overview

Shared headless contracts live here.

## Purpose

- Define framework-agnostic TypeScript DTOs for Tovu's versioned HTTP surfaces.
- Give server adapters and frontend adapters one contract source instead of duplicating payload types.
- Keep these contracts outside `server/` and outside any specific frontend framework package.

## Current scope

- Assistant permanent-delete and tool-approval policy (host product policy: tool ids, admin paths, guidance copy)
- Secret form card definitions
- Plugin install source schema and ports

## Wiring

- Jini owns the neutral wire contracts that used to live here: admin/content post and presentation
  payloads (`@jini-ai/core/contracts/headless/contracts`), the chart provider snapshot
  (`.../chart-providers`), chat attachment ref/result types (`.../chat-attachment`) and the member
  OIDC route template (`.../member-login`). Importers use those subpaths directly; `index.ts` does
  not forward them.
- The permanent-delete policy types come from `@jini-ai/core/contracts/site/headless-assistant-permanent-deletes-policy`;
  the host keeps every value (tool list, admin paths, guidance copy) in `assistant-permanent-deletes-policy.ts`.

## Boundary rule

- `server/` adapters may serialize into these contracts.
- Frontend adapters like `nextjs/` may consume these contracts.
- `core/` and `features/` should not depend on `headless/`.
