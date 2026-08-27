# contracts Overview

Shared contracts. Types, DTOs, invariants, and the executable specs that pin them down — the
vocabulary every other bucket speaks, and nothing else.

## What counts as a contract module

A folder belongs here when it has **no repository and no agent surface** and its job is to
*describe* rather than to *do*: type declarations, port interfaces nobody in here implements, and
`__specs__/`. Both members hold the marker: `core/` and `headless/` are the only two top-level
modules that carry `__specs__/` without also carrying behavior. (`server/`, `features/post`,
`features/presentation` and `features/workspace` have `__specs__/` too — they are specs *for*
behavior that lives in the same folder, which is what makes them not contracts.)

## Current modules

- `core/` — the kernel contracts: commands, events, entry-refs, gated mutations, embeds, ports.
- `headless/` — framework-agnostic DTOs for Tovu's versioned HTTP surfaces, so server adapters and
  frontend adapters share one payload source instead of duplicating it. Joined 2026-08-27; it had
  said "keep these contracts outside `server/` and outside any specific frontend framework
  package" in its own INFO.md since it was written, but sat as a sibling of the thing it was
  outside of.

## Rules

- Nothing here may import `src/server/**`, `apps/**`, a feature slice, or a concrete
  infrastructure adapter. ENFORCED by `contracts-no-server-or-app-imports` in
  `.dependency-cruiser.cjs`, `error` severity. `__tests__/` is exempt — a contract test needs a
  concrete implementation to test the contract against.
- The dependency direction is one-way: every other bucket may import `contracts/`; `contracts/`
  imports none of them.
