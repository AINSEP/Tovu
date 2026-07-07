# Spec: Settings And Admin Signals

## Goal

Define the server contract for typed settings, scoped configuration, critical-setting confirmation flows, and a unified admin signal surface.

This replaces a large portion of what WordPress spreads across the Settings API, admin notices, and user-specific preferences, while explicitly avoiding admin clutter and upsell noise.

## Settings Scopes

The server must support at least these setting scopes:

- system
- workspace
- user

Each setting must declare:

- scope
- schema/type
- default behavior
- sanitization rules
- authorization requirements
- audit requirements

## Save Rules

Settings writes must be:

- schema-validated
- sanitized before commit
- auditable
- authorized per scope

Critical settings may require confirmation or delayed activation.

## Admin Signals

The server must expose a unified signal or notification surface for operators.

Signals should support:

- severity / priority
- source
- workspace or system scope
- deduplication
- acknowledgment or dismissal state
- actor targeting where appropriate

Signals must not degrade into uncontrolled notice spam.

## User Preferences

User-scoped admin preferences may include:

- locale
- dashboard layout
- editor preferences
- notification preferences

These are still server-managed settings, even if a UI adapter stores client hints as well.

## Acceptance Checks

- Settings are schema-driven and scope-aware.
- Critical settings can require stronger guardrails than routine settings.
- Admin alerts are unified and prioritized rather than emitted as arbitrary noise.

## Non-goals (current)

- Final admin UI layout
- Final settings screen navigation
