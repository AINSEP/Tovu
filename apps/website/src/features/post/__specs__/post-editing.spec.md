# Spec: Post Editing

## Problem statement

Tovu needs a first authoring slice that lets admin shells load and save post data while public
content reads remain safely constrained to published content only.

## Scope

This spec covers:

- admin read by post ID
- post update command
- public read by slug for published content

## Non-goals

- revisions history
- collaborative locking
- scheduled publishing
- media workflows

## Required rules

- Title must be non-empty after trimming.
- Slug must match `^[a-z0-9-]+$`.
- Slug is normalized to lowercase before persistence and lookup.
- Slug must be unique.
- `status` must be `draft` or `published`.
- `bodyJson` must remain a JSON object.
- Saving a post increments its version and updates `updatedAt`.

## Read Behavior

- Admin reads can fetch a post by ID regardless of status.
- Content reads can fetch a post by slug only when its status is `published`.

## Failure modes

- Invalid title, slug, status, or body shape throws `PostValidationError`.
- Reusing a slug belonging to another post throws `PostConflictError`.
- Missing admin or content reads throw `PostNotFoundError`.

## Acceptance Checks

- Saving valid input returns the updated post with incremented version.
- Saving valid input persists normalized title/slug changes.
- Duplicate slugs throw `PostConflictError`.
- Invalid title or slug throws `PostValidationError`.
- Invalid `status` or non-object `bodyJson` throws `PostValidationError`.
- Admin read returns a draft post when addressed by ID.
- Published read hides draft posts.
