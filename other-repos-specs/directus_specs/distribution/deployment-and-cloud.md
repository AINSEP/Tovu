# Directus Deployment And Cloud Distribution Shape

**Source files analyzed:**
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/controllers/deployment.ts`
- `other-repos/directus/api/src/deployment.ts`
- `other-repos/directus/api/src/deployment/deployment.ts`
- `other-repos/directus/api/src/deployment/drivers/netlify.ts`
- `other-repos/directus/api/src/deployment/drivers/vercel.ts`
- `other-repos/directus/api/src/services/deployment.ts`
- `other-repos/directus/api/src/services/deployment-projects.ts`
- `other-repos/directus/api/src/services/deployment-runs.ts`
- `other-repos/directus/api/src/utils/get-service.ts`
- `other-repos/directus/app/src/modules/deployment/index.ts`
- `other-repos/directus/app/src/modules/deployment/routes/overview.vue`
- `other-repos/directus/app/src/modules/deployment/routes/provider/dashboard.vue`
- `other-repos/directus/app/src/modules/deployment/routes/provider/settings.vue`
- `other-repos/directus/app/src/modules/deployment/routes/provider/runs.vue`
- `other-repos/directus/app/src/modules/deployment/routes/provider/run.vue`
- `other-repos/directus/app/src/modules/deployment/config/providers.ts`
- `other-repos/directus/app/src/modules/deployment/composables/use-deployment-navigation.ts`
- `other-repos/directus/packages/system-data/src/fields/deployment.yaml`
- `other-repos/directus/packages/system-data/src/fields/deployment-projects.yaml`
- `other-repos/directus/packages/system-data/src/fields/deployment-runs.yaml`
- `other-repos/directus/api/src/database/migrations/20260204A-add-deployment.ts`
- `other-repos/directus/packages/types/src/deployment.ts`
- `other-repos/directus/sdk/src/rest/commands/read/deployment.ts`
- `other-repos/directus/sdk/src/rest/commands/create/deployment.ts`
- `other-repos/directus/sdk/src/rest/commands/delete/deployment.ts`
- `other-repos/directus/sdk/src/rest/commands/utils/deployment.ts`
- `other-repos/directus/directus/readme.md`
- `other-repos/directus/Dockerfile`
- `other-repos/directus/docker-compose.yml`

---

## 1. Overview

Directus treats deployment management as a first-class distribution surface, not a side feature. The implementation is split across:

- a backend router and service layer under `api/`
- provider-specific drivers for external cloud hosts
- persistent system collections for configs, selected projects, and run history
- an admin app module under `app/`
- SDK commands that expose the same surface to the browser app

The important boundary is that the deployment feature is operator-facing and provider-backed. The system stores configuration and operational history in Directus tables, then fans out to Vercel or Netlify APIs at runtime.

---

## 2. Backend Bootstrap And Provider Wiring

`api/src/app.ts` registers deployment support during server startup:

1. `registerDeploymentDrivers()` is called alongside auth provider registration
2. `/deployments` is mounted as a dedicated router
3. the deployment router is therefore part of the main API, not a separate service

The provider registry in `api/src/deployment.ts` is intentionally narrow:

- supported providers are `vercel` and `netlify`
- `registerDeploymentDrivers()` binds those provider names to concrete driver classes
- `getDeploymentDriver()` resolves the driver instance for a provider
- `isValidProviderType()` and `getSupportedProviderTypes()` are thin registry helpers

This means the deployment feature is modular, but not open-ended by default. Adding a new provider requires code-level driver registration, not just inserting a new config record.

---

## 3. Persistent Model And System Collections

The deployment feature persists into three system tables created by the migration in `api/src/database/migrations/20260204A-add-deployment.ts`:

- `directus_deployments`
- `directus_deployment_projects`
- `directus_deployment_runs`

The schema is simple and intentionally relational:

- deployments are unique per provider
- projects belong to one deployment config and cascade on delete
- runs belong to one selected project and cascade on delete

The migration also makes the key uniqueness rules explicit:

- `directus_deployments.provider` is unique
- `directus_deployment_projects` is unique on `(deployment, external_id)`

The system-data field definitions mirror that model:

- `credentials` is encrypted
- `options` is cast as JSON
- `projects` and `runs` are modeled as `o2m` relationships

The type layer in `packages/types/src/deployment.ts` matches the runtime model:

- `DeploymentConfig` stores provider, encrypted credentials, options, and related projects
- `StoredProject` stores the provider-side project id and display name
- `StoredRun` stores the deployment id, target, status, URL, and timestamp

The service registry also knows about these collections:

- `get-service.ts` routes `directus_deployments` to `DeploymentService`
- `directus_deployment_projects` goes to `DeploymentProjectsService`
- `directus_deployment_runs` goes to `DeploymentRunsService`

So the deployment feature participates in the same internal collection/service dispatch path as other Directus system collections.

---

## 4. Deployment Service Semantics

`api/src/services/deployment.ts` is the main config service. Its behavior is stricter than a generic item service.

### 4.1 Create semantics

On create, the service:

1. requires a provider
2. requires credentials
3. parses credentials and options as JSON when they arrive as strings
4. builds a provider driver from the parsed values
5. calls `testConnection()` before saving
6. stringifies credentials so the payload service can encrypt them on persistence

This gives the create path an operational guarantee: a deployment config is not stored unless the provider credentials can actually connect.

### 4.2 Update semantics

On update, the service:

1. only revalidates if credentials or options are present
2. loads the existing deployment config
3. merges new credentials over the existing decrypted credential set
4. parses and validates options
5. rejects empty options
6. retests the provider connection before persisting

That merge behavior matters operationally. It lets the UI update only the fields it exposed without forcing the operator to re-enter every secret.

### 4.3 Provider read helpers And caching

The service also exposes provider-scoped helpers:

- `readByProvider()`
- `updateByProvider()`
- `deleteByProvider()`
- `getDriver()`
- `listProviderProjects()`
- `getProviderProject()`

The provider project fetch helpers are cached through the deployment cache with a short TTL derived from `CACHE_DEPLOYMENT_TTL` and defaulting to 5 seconds. The cache is used to reduce repeated provider API calls when the UI refreshes project lists and project details.

---

## 5. Controller Workflow

`api/src/controllers/deployment.ts` is the operator-facing HTTP surface. It is mounted under `/deployments` and guarded by admin access.

### 5.1 Access Control

The router:

- binds `useCollection('directus_deployments')`
- rejects any request whose accountability does not have `admin === true`

So deployment management is explicitly admin-only.

### 5.2 Config CRUD

The config endpoints are:

- `POST /deployments`
- `GET /deployments`
- `GET /deployments/:provider`
- `PATCH /deployments/:provider`
- `DELETE /deployments/:provider`

Create and patch both validate provider names against `DEPLOYMENT_PROVIDER_TYPES`. Create and update are executed inside a transaction when they mutate the config record.

Notable behavior:

- create validates provider, credentials, and options with Joi
- create tests connectivity before persisting
- patch updates credentials and/or options by provider
- patch returns `null` if readback is forbidden for the caller
- delete removes the provider config by provider key

### 5.3 Project Selection And Sync

`GET /deployments/:provider/projects` merges provider-side projects with stored selection state:

- it reads the configured deployment record
- it fetches provider projects through the cached provider driver
- it reads selected projects from `directus_deployment_projects`
- it syncs changed project names back into the database when provider names drift
- it returns merged records where `id === null` means “available but not selected”

`PATCH /deployments/:provider/projects` updates project selection:

- it validates the provider
- it validates the payload shape
- it rejects creating non-deployable projects before any mutation happens
- it delegates create/delete selection changes to `DeploymentProjectsService.updateSelection()`

That last check is important: Directus does not let operators attach arbitrary provider projects. The project must be deployable according to the provider metadata.

### 5.4 Dashboard And Run History

`GET /deployments/:provider/dashboard` returns the selected projects for a provider, enriched with live provider details. If no projects are selected, it returns an empty list immediately.

`GET /deployments/:provider/projects/:id/runs`:

- validates the project exists
- returns paginated run rows from `directus_deployment_runs`
- fetches live deployment state for each run from the provider
- returns pagination metadata from the database query

This means the history view is a hybrid of local persistence and live provider state.

### 5.5 Trigger, Inspect, And Cancel Runs

`POST /deployments/:provider/projects/:id/deploy`:

- validates the provider
- validates preview and clear-cache options
- loads the project record from the database
- triggers the provider deployment
- stores a new deployment run record
- returns the stored run merged with the provider status and URL

`GET /deployments/:provider/runs/:id`:

- validates an optional `since` query parameter
- loads the run record
- fetches current deployment details and build logs from the provider
- returns the merged payload with incremental logs support

`POST /deployments/:provider/runs/:id/cancel`:

- loads the run record
- cancels the remote deployment
- re-reads the provider deployment state
- returns the updated merged run payload

Operationally, the database row is the durable anchor, but the provider remains the source of truth for run status and log data.

---

## 6. Provider Drivers

The abstract contract in `api/src/deployment/deployment.ts` defines the provider surface:

- test connection
- list projects
- get project
- list deployments
- get deployment details
- trigger deployment
- cancel deployment
- fetch deployment logs

The concrete drivers implement those same operations differently.

### 6.1 Vercel

`api/src/deployment/drivers/vercel.ts` is a direct HTTP adapter over the Vercel API.

Key traits:

- uses bearer-token auth
- optionally passes `team_id`
- retries rate-limited requests up to three times
- maps provider states into the shared `building | ready | error | canceled` status set
- treats deployability as a function of whether the project has a linked git source
- supports `forceNew=1` when cache clearing is requested

Its logs endpoint maps Vercel events into Directus log entries and can filter by a `since` timestamp.

### 6.2 Netlify

`api/src/deployment/drivers/netlify.ts` is a higher-level adapter built on the Netlify API client.

Key traits:

- supports account-scoped site listing via `account_slug`
- treats deployability as having both a provider and a repo URL in build settings
- maps published deploy state into the shared status set
- triggers builds through the Netlify build API
- gets deployment status after build creation so the returned trigger result includes current state

Its log flow is more operationally involved:

- it opens a WebSocket log stream for a deployment
- it caches connections per deployment id
- it keeps idle connections alive briefly so clients can keep polling
- it strips ANSI color codes from log messages
- it closes the websocket when the build is complete or when the connection times out

That makes the Netlify driver more stateful than the Vercel driver, but both expose the same abstract contract to the rest of Directus.

---

## 7. Admin App Module And UX Surface

The browser-side deployment surface lives in `app/src/modules/deployment/`.

### 7.1 Module Registration

`app/src/modules/deployment/index.ts` registers the module as:

- `id: 'deployments'`
- icon: `rocket_launch`
- admin-only via `preRegisterCheck(user.admin_access === true)`

The module route structure is:

- `/deployments`
- `/deployments/:provider`
- `/deployments/:provider/settings`
- `/deployments/:provider/:projectId/runs`
- `/deployments/:provider/:projectId/runs/:runId`

So the module is not just a settings page. It is a full operational workspace for configuring providers, selecting projects, launching deployments, and inspecting log history.

### 7.2 Provider Setup And Configuration

The provider configuration UI is driven by `config/providers.ts`.

Only two providers are exposed in the app:

- `vercel`
- `netlify`

Each provider config defines:

- credential fields
- option fields
- a token URL for operator guidance
- an optional warning message

The setup drawer creates a deployment config through the SDK, while the settings page edits credentials, options, and selected projects through the same surface.

### 7.3 Navigation And State

`use-deployment-navigation.ts` fetches the configured providers with their selected projects and caches the result in-memory. The navigation component uses that cache to render:

- the deployments overview
- provider entries
- selected project entries
- the settings entry for each provider

This cached navigation data is what lets the module stay responsive while still reflecting the current database state.

### 7.4 Operator Flows

The route files map to a straightforward operator workflow:

- overview: choose a provider and either configure it or open its dashboard
- dashboard: inspect selected projects and their latest deployment state
- settings: manage provider secrets, provider options, and selected projects
- runs: inspect run history, search runs, trigger preview or production deployments
- run detail: tail logs, cancel a build, and download log output

The UI also treats deployment status as a shared visual language through the status chip component.

---

## 8. SDK Surface

The admin app does not talk directly to bespoke HTTP strings. It uses typed SDK commands in `sdk/src/rest/commands/...`.

The deployment commands mirror the backend routes:

- `createDeployment()`
- `readDeployments()`
- `readDeployment()`
- `readDeploymentDashboard()`
- `readDeploymentProjects()`
- `readDeploymentProject()`
- `readDeploymentRuns()`
- `readDeploymentRun()`
- `updateDeployment()`
- `updateDeploymentProjects()`
- `deleteDeployment()`
- `triggerDeployment()`
- `cancelDeployment()`

This is a useful distribution boundary: the browser app, SDK, and backend router all share the same conceptual model of deployment config, selected projects, and run lifecycle.

---

## 9. Cloud And Self-Hosting Consequences

The runtime readme frames Directus as deployable locally, on-premises, or in cloud, and the repository root reinforces that with the Dockerfile and debugging compose file.

The runtime packaging implications are:

- the `directus` package is the installable runtime wrapper
- `Dockerfile` builds a production image that runs `node cli.js bootstrap` before starting `pm2-runtime`
- `docker-compose.yml` is explicitly marked as debugging-oriented, not production guidance

The operational inference from the code is that deployment management is environment-agnostic at the application layer:

- provider credentials are stored in Directus tables
- provider API calls happen at request time through drivers
- run history is persisted in Directus tables
- live status and logs are fetched from the provider when the admin UI asks for them

So the feature is compatible with both self-hosted and managed installs because it depends on the same persistent schema and provider API access in both cases. The difference is operational, not architectural: who hosts the Directus runtime and where the provider credentials come from.

---

## 10. Spec Implication

When translating this subsystem into a Tovu-oriented model, keep these concerns separate:

- runtime bootstrap and driver registration
- persistent deployment config and run history
- provider-specific API behavior
- admin-only operator UX
- cloud/self-hosting packaging and deployment posture

If those are collapsed into one layer, it becomes too easy to miss where the system enforces provider validation, where it stores durable state, and where it merely reflects provider truth back to the operator.

---

## 11. Tovu Reconstruction Notes

### 11.1 Why this exists

This subsystem exists to tie deployment concerns into the platform as a first-class product surface instead of leaving delivery entirely outside the CMS. It combines persistent deployment state, provider adapters, and operator workflows.

### 11.2 What Tovu should preserve

- Durable local records for deployment config and run history
- Separation between provider truth and platform-owned operational state
- Driver registration and provider behavior behind adapters
- Clear distinction between application delivery concerns and core content/runtime concerns

### 11.3 What Tovu can simplify

- V1 can focus on preview environments or one delivery workflow instead of broad provider support
- Self-hosted and cloud posture can share the same internal model with fewer operator-facing variants
- Some Directus persistence tables can map to slimmer Tovu delivery entities

### 11.4 Possible Tovu seams

- `src/features/delivery/` for deployment config/run history logic
- `src/core/ports/DeliveryProviderPort.ts` for provider-specific execution
- `src/core/ports/ReleaseHistoryPort.ts` for durable run history and logs

### 11.5 Suggested priority

- `V1`: preview/release records plus one delivery adapter seam
- `Later`: richer provider catalog, deeper cloud/self-hosted operator differences
