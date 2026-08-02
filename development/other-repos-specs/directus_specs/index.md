# Directus Specs Index

**Repo snapshot inspected:** `other-repos/directus @ 9dcea73`

This corpus is the Directus equivalent of the WordPress spec set in `other-repos/wordpress_specs/`, but organized around Directus's actual monorepo boundaries and product surfaces.

## Current Files

### Top level

- `overview.md` - high-level product and monorepo overview
- `monorepo-map.md` - package and boundary map for the repository
- `coverage-audit.md` - current corpus coverage assessment

### API

- `api/server-bootstrap.md`
- `api/authentication.md`
- `api/content-and-schema.md`
- `api/access-control-and-automation.md`
- `api/files-extensions-and-protocols.md`
- `api/realtime-websockets-and-collab.md`
- `api/activity-comments-notifications-and-revisions.md`
- `api/server-info-health-and-metrics.md`
- `api/graphql-and-spec-generation.md`
- `api/ai-and-mcp.md`
- `api/utilities-import-export-and-versioning.md`

### App

- `app/admin-app.md`
- `app/content-module-and-item-editor.md`
- `app/settings-users-roles-policies-and-access-ui.md`
- `app/ai-assistant-and-context-ui.md`
- `app/deployment-module-ui.md`

### SDK

- `sdk/javascript-sdk.md`
- `sdk/auth-and-realtime-composables.md`

### Packages

- `packages/system-data-and-openapi.md`
- `packages/shared-runtime-libraries.md`

### Distribution

- `distribution/runtime-package-cli-and-self-hosting.md`
- `distribution/deployment-and-cloud.md`

### Contracts

- `contracts/openapi-oas-surface.md`

### Extensions

- `extensions/overview.md`
- `extensions/runtime-installation-and-registry.md`

## Current Status

The tracked Directus backlog captured in this index is now covered.

See [coverage-audit.md](/Users/la/Desktop/Tovu AI CMS/other-repos/directus_specs/coverage-audit.md) for the current assessment and the line between covered surfaces and optional refinement.

## Important Notes

- The SDK still contains a `TODO update for Policies / Access` comment, so SDK parity with the newer access model should be treated as an explicit follow-up concern.
- The OpenAPI package does not appear to cover every runtime surface mounted by the API server. Several advanced runtime surfaces look repo-led rather than fully mirrored in `packages/specs`.

---

## Tovu Reconstruction Notes

### Why this exists

This file exists as the navigation contract for the Directus corpus. It tells us what is covered, where each major subsystem spec lives, and which caveats still matter when translating Directus into Tovu work.

### What Tovu should preserve

- One explicit index for the canonical Directus subsystem docs
- The distinction between covered backlog, summary pages, and follow-up caveats
- Visibility into known mismatch areas like SDK/access parity or incomplete OpenAPI mirroring

### What Tovu can simplify

- Once the corpus stabilizes, some of this index could be generated from a manifest instead of maintained by hand
- Tovu planning should still prefer the subsystem docs themselves over this index for implementation detail

### Possible Tovu seams

- `docs/research/directus/index.md`
- a small docs manifest that tracks canonical docs and known caveats

### Suggested priority

- `V1`: keep the canonical map and caveat list explicit
- `Later`: automate index generation if maintenance cost rises
