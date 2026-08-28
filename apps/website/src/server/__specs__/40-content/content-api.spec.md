# Spec: Content API Surfaces

## Goal

Define the server-side API shape for content reads and admin mutations without mirroring raw database tables or coupling the core to a single frontend framework.

This is the typed, versioned Tovu alternative to:

- WordPress `wp-json` resource surfaces
- Directus's generated admin/data APIs

## API Families

Tovu should separate at least two API families:

- `/api/content/v1` for public or delivery-oriented reads
- `/api/admin/v1` for authenticated operator reads and mutations

The public content API and admin API must not be treated as the same trust boundary.

## Route Design Rules

- Routes are versioned.
- Resources are expressed in domain language, not raw table names.
- Every route declares auth requirements, workspace/system scope, and pagination/filter semantics.
- Every mutation route has an explicit permission callback.

## Read Features

The content API should support:

- typed list and detail reads
- filtering
- sorting
- pagination
- sparse field selection where appropriate
- preview-aware reads through explicit preview credentials

## Admin Features

The admin API should support:

- content mutation commands
- revision access
- workflow state transitions
- lookup endpoints needed for admin UX
- extension-safe admin integrations

## Response Principles

- Public read models are optimized for delivery use, not admin convenience.
- Admin read models are optimized for operator workflows, not raw DB mirroring.
- Embed/expand behavior is explicit and bounded.
- Batch surfaces are optional and must opt in route-by-route.

## Acceptance Checks

- Public read routes can be consumed without exposing admin-only state.
- Admin mutations are impossible without authenticated and authorized context.
- The API contract can be served by Express now and another transport later.

## Non-goals (current)

- Defining the entire content schema model
- Choosing GraphQL over REST or vice versa as the only future interface
- Exposing database-first generic CRUD as the primary product contract
