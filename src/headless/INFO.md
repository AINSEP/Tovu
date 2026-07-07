# headless Overview

Shared headless contracts live here.

## Purpose

- Define framework-agnostic TypeScript DTOs for Tovu's versioned HTTP surfaces.
- Give server adapters and frontend adapters one contract source instead of duplicating payload types.
- Keep these contracts outside `server/` and outside any specific frontend framework package.

## Current scope

- Admin post payloads
- Admin presentation payloads
- Content post payloads

## Boundary rule

- `server/` adapters may serialize into these contracts.
- Frontend adapters like `nextjs/` may consume these contracts.
- `core/` and `features/` should not depend on `headless/`.
