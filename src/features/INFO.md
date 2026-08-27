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
- Features should not import server/framework code. Partially enforced today:
  `feature-no-express-or-admin-imports` in `.dependency-cruiser.cjs` fails
  `npm run check:boundaries` at `error` severity, but its `to` covers only Express,
  `src/server/routes/**`, and `apps/admin` — the rest of `src/server/**` is unpoliced.
- Keep each feature independently testable.
