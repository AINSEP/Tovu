# Spec: Create Workspace

## Problem statement

Tovu needs a minimal operator-facing workspace creation slice that can validate input, enforce
slug uniqueness, persist the workspace, and emit a follow-up domain event without coupling the
feature to HTTP or infrastructure details.

## Scope

This spec covers the `createWorkspace` command slice only.

## Inputs and dependencies

- Input fields: `name`, `slug`
- Required dependencies:
  - `WorkspaceRepoPort`
  - `OutboxPort`
  - `ClockPort`
  - `IdGeneratorPort`

## Required rules

- Name must be non-empty after trimming.
- Slug must match `^[a-z0-9-]+$`.
- Slug is normalized to lowercase before uniqueness checks and persistence.
- Slug must be unique.
- Successful writes generate a workspace ID and creation timestamp.

## Side effects and async contract

- On success, enqueue `workspace.created` event to outbox.
- The event payload must include the created workspace identity and normalized slug.
- The command slice itself does not publish the event to external subscribers.

## Failure modes

- Invalid name or slug throws `WorkspaceValidationError`.
- Reusing an existing slug throws `WorkspaceConflictError`.

## Non-goals

- Workspace editing
- Multi-tenant authorization
- External provisioning or webhook delivery

## Acceptance checks

- Valid input returns workspace ID.
- Valid input persists the normalized workspace record.
- Duplicate slug throws `WorkspaceConflictError`.
- Invalid slug throws `WorkspaceValidationError`.
- Successful creation enqueues exactly one `workspace.created` outbox event.
