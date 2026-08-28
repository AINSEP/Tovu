# features Overview

Features are vertical slices of business logic.

## What counts as a feature

A folder belongs here when it has BOTH halves of the slice shape:

- a repository (`repo.*.ts`) — it owns persisted state behind a port, and
- an agent surface (`agent-tools.ts` / `tool-registrations.ts`) — it is reachable by the assistant.

Folders that are ports/adapters with no repo and no agent tools are infrastructure and stay
outside (`db/`, `http/`, `routing/`, `mail/`, `export/`, `site-dir/`, `oauth/`). Folders that
compose everything are entry points and stay outside too (`server/`, `cli/`). `core/` is
contracts — it is the one module with `__specs__/`, and nothing here may import upward into it
in the other direction.

## Current modules

Every subdirectory of this folder is a slice; the list is not repeated here because it drifts.
`comments/`, `forms/`, `members/`, `newsletter/`, `redirects/` and `webhooks/` joined on
2026-08-27 — they had the complete slice shape all along but had been left as siblings of
`features/` rather than children of it, so their location said nothing about what they were.

## Rules

- Features can import from `core/*` contracts.
- Features must not import server/framework code — meaning Express, anything under
  `src/server/**`, or `apps/admin`. ENFORCED two ways, and both were verified to fail on a
  planted violation rather than assumed to work:
  - `feature-no-server-or-framework-imports` in `.dependency-cruiser.cjs`, `error` severity.
  - `__tests__/features-no-server-imports.boundary.test.ts`, which fails closed. The cruiser
    run reports 90 pre-existing violations in unrelated deep-import rule families, so its exit
    code cannot signal that a NEW boundary edge just landed; this test is green and so can go
    red for exactly one reason.
  `import type` is not exempt: naming a server type is still a "knows-about" coupling.
  `__tests__/` IS exempt — an integration test that boots a real app to exercise route or tool
  wiring needs the real concrete internals, the same carve-out every other boundary rule in
  `.dependency-cruiser.cjs` already makes.
- Keep each feature independently testable.
