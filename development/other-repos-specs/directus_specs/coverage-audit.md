# Directus Spec Coverage Audit

**Audit date:** 2026-04-17

**Audit baseline:**
- Source tree: `other-repos/directus/`
- Spec corpus: `other-repos/directus_specs/`

This file records the current corpus state after the deeper Directus decomposition pass.

---

## 1. Working Conclusion

The tracked Directus backlog is now covered.

The corpus includes dedicated specs for:

- API bootstrap, auth, content/schema, access/automation, files/protocols
- realtime and collaboration
- activity, comments, notifications, and revisions
- server info, health, metrics, GraphQL/spec generation, and AI/MCP
- admin app shell
- content module and item editor
- AI assistant/context UI
- settings access UI
- deployment module UI
- SDK overview plus auth/realtime composables
- system-data/OpenAPI and shared runtime packages
- runtime/self-hosting and deployment/cloud distribution
- contracts/OpenAPI surface
- extensions overview and runtime installation/registry
- utility/import/export/versioning workflows

That clears the missing-file backlog previously tracked in the index.

---

## 2. Area Matrix

### Top level and monorepo map

Status: `Covered`

Covered by:

- `overview.md`
- `monorepo-map.md`

### `api/`

Status: `Covered`

Covered by:

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

### `app/`

Status: `Covered`

Covered by:

- `app/admin-app.md`
- `app/content-module-and-item-editor.md`
- `app/ai-assistant-and-context-ui.md`
- `app/settings-users-roles-policies-and-access-ui.md`
- `app/deployment-module-ui.md`

### `sdk/`

Status: `Covered`

Covered by:

- `sdk/javascript-sdk.md`
- `sdk/auth-and-realtime-composables.md`

### `packages/` and contracts

Status: `Covered`

Covered by:

- `packages/system-data-and-openapi.md`
- `packages/shared-runtime-libraries.md`
- `contracts/openapi-oas-surface.md`

### `distribution/`

Status: `Covered`

Covered by:

- `distribution/runtime-package-cli-and-self-hosting.md`
- `distribution/deployment-and-cloud.md`

### `extensions/`

Status: `Covered`

Covered by:

- `extensions/overview.md`
- `extensions/runtime-installation-and-registry.md`

---

## 3. Residual Notes

- Some docs remain intentionally broad, especially `overview.md`, `monorepo-map.md`, and `sdk/javascript-sdk.md`.
- Those files now function as cross-reference or umbrella docs rather than evidence of missing subsystem coverage.
- The corpus is stronger on runtime architecture and operator product surfaces than on every individual package-internal helper module.

---

## 4. Current Assessment

The tracked Directus coverage backlog is cleared.

If further work is desired later, it would be optional refinement:

- splitting broad SDK or package docs into narrower follow-on files
- adding deeper package-level specs for especially important shared libraries
- adding provider-driver deep dives for deployment or AI backends if the team wants implementation-level runbooks

---

## Tovu Reconstruction Notes

### Why this exists

This audit exists to prevent false completeness. The Directus corpus is only useful for Tovu if it states clearly what is covered, what is intentionally broad, and what would count as optional refinement rather than a missing core spec.

### What Tovu should preserve

- A live audit that distinguishes true gaps from broad-but-sufficient coverage
- Explicit statements about which docs are umbrella/reference docs rather than missing work
- Re-auditing after major documentation passes instead of assuming the corpus is done

### What Tovu can simplify

- The audit can stay lightweight; it does not need to become a heavyweight process artifact
- Future updates can be driven by Tovu implementation surprises rather than another full repo sweep unless new risk appears

### Possible Tovu seams

- `docs/research/directus/coverage-audit.md` as the current status ledger
- implementation planning can reference this audit before reopening decomposition work

### Suggested priority

- `V1`: keep it current while Tovu is still translating Directus into modules and constraints
- `Later`: maintenance mode once the research corpus stabilizes
