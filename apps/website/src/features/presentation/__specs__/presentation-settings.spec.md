# Spec: Presentation Settings

## Problem statement

Tovu needs the server to own the active theme identity for a workspace so multiple frontend shells
can stay synchronized, while each frontend remains free to implement its own renderer locally.

## Scope

This spec covers reading and updating workspace-scoped presentation settings.

## Required rules

- Theme settings are scoped to a workspace.
- `activeThemeId` must be one of the supported server-known theme IDs.
- Updating theme settings refreshes `updatedAt`.
- Reads return both the current settings and the server-supported theme list.

## Boundary rule

- The server owns theme identity only.
- Frontend shells own how a theme ID is rendered.
- The feature must stay independent from React, Vue, Next.js, or any specific UI framework.

## Failure modes

- Missing workspace settings throw `PresentationSettingsNotFoundError`.
- Unsupported theme IDs throw `PresentationSettingsValidationError`.

## Non-goals

- Theme asset generation
- CSS token storage
- Per-route template selection

## Acceptance Checks

- Reading settings returns the current `activeThemeId` and supported theme IDs.
- Reading a missing workspace fails with `PresentationSettingsNotFoundError`.
- Setting an unsupported theme throws `PresentationSettingsValidationError`.
- Updating a supported theme persists the new value.
- Updating a supported theme returns the refreshed `updatedAt` and supported theme IDs.
