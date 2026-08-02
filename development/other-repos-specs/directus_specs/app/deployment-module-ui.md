# Directus Deployment Module UI

**Source files analyzed:**
- `other-repos/directus/app/src/modules/deployment/index.ts`
- `other-repos/directus/app/src/modules/deployment/composables/use-deployment-navigation.ts`
- `other-repos/directus/app/src/modules/deployment/config/providers.ts`
- `other-repos/directus/app/src/modules/deployment/components/navigation.vue`
- `other-repos/directus/app/src/modules/deployment/components/provider-setup-drawer.vue`
- `other-repos/directus/app/src/modules/deployment/components/deployment-status.vue`
- `other-repos/directus/app/src/modules/deployment/routes/overview.vue`
- `other-repos/directus/app/src/modules/deployment/routes/provider/dashboard.vue`
- `other-repos/directus/app/src/modules/deployment/routes/provider/settings.vue`
- `other-repos/directus/app/src/modules/deployment/routes/provider/runs.vue`
- `other-repos/directus/app/src/modules/deployment/routes/provider/run.vue`

---

## 1. Overview

The deployment module is the admin-app frontend for the Directus deployment runtime described in the backend distribution docs. It is not a generic DevOps shell. It is a narrowly-scoped operator UI for:

- configuring provider credentials
- selecting deployable provider projects
- viewing provider dashboards
- triggering deployments
- browsing deployment history
- inspecting logs and canceling active runs

The app surface is tightly constrained to the provider model and deployment records already persisted by the backend.

---

## 2. Module Registration And Access Gating

`modules/deployment/index.ts` registers the module under `/deployments` with these named routes:

- `deployments-overview`
- `deployments-provider-dashboard`
- `deployments-provider-settings`
- `deployments-provider-runs`
- `deployments-provider-run`

The route tree is guarded by `preRegisterCheck(user)`, which returns true only when `user.admin_access === true`.

So unlike ordinary collection modules, deployment UI availability is decided before the module is even registered in the router.

---

## 3. Shared Navigation State

`useDeploymentNavigation()` is the shared state seam for the module.

It owns:

- cached provider configs
- loading state
- open provider groups in the sidebar
- current provider key from the route
- current project id from the route
- current project lookup derived from the cached provider/project graph

Its `fetch()` method calls `readDeployments()` with a narrow field selection:

- `provider`
- `projects.id`
- `projects.name`

That tells you the navigation tree is intentionally small and route-oriented. It does not try to preload full provider config detail everywhere.

---

## 4. Provider Configuration Metadata

`config/providers.ts` is the UI contract for supported deployment providers.

The provider set is fixed to:

- `vercel`
- `netlify`

For each provider, the config layer defines:

- credentials fields
- options fields
- token acquisition URL
- optional warning copy

The field definitions are standard Directus form metadata, which lets both setup and edit surfaces render through `VForm` instead of hand-coded forms.

The config is sensitive to context:

- `hasExistingCredentials` changes whether token fields are required
- `isEdit` changes field notes and placeholders

That means the same provider metadata drives both first-run configuration and later edits.

---

## 5. Overview And Initial Setup Flow

`routes/overview.vue` is the entry page for `/deployments`.

It reads the configured provider set from `useDeploymentNavigation()` and merges that with the static provider list from `availableProviders`.

Each provider row is reduced to:

- provider type
- whether a config exists
- how many projects are currently selected

Click behavior is intentionally branchy:

- configured provider with no selected projects -> go to provider settings
- configured provider with selected projects -> go to provider dashboard
- unconfigured provider -> open setup drawer

### 5.1 Setup drawer

`provider-setup-drawer.vue` handles first-run provider creation.

It:

- renders provider-defined credentials and option fields
- validates required credentials client-side
- builds a payload of `{ provider, credentials, options? }`
- calls `createDeployment(...)`
- emits `complete` on success

The overview route then forces a navigation refresh and pushes the operator to `/:provider/settings`, because initial setup creates a provider config but does not yet select any projects.

---

## 6. Sidebar Navigation Structure

`components/navigation.vue` is the persistent module sidebar.

It renders:

- a top-level overview link
- one expandable group per configured provider
- one child link per selected project
- a provider settings link when the provider has projects

Important route behavior:

- providers with zero selected projects link directly to settings
- providers with selected projects link to their dashboard
- the current provider is auto-expanded on mount

The sidebar therefore reflects persisted project selection, not the provider’s full remote project inventory.

---

## 7. Provider Settings Workflow

`routes/provider/settings.vue` is the heaviest page in the module because it is where configuration editing and project selection converge.

### 7.1 Data load

On mount, the page loads:

- the provider config via `readDeployment(provider, { fields: ['id', 'provider', 'options', 'credentials'] })`
- the provider project inventory via `readDeploymentProjects(provider)`

The project response is then split into:

- `availableProjects`
- `selectedProjectIds`
- `initialProjectIds`

Selection state uses `external_id`, while persisted deletion requests later convert back to stored Directus ids where needed.

### 7.2 Edit detection

The page computes `hasEdits` from three independent sources:

- new credentials entered into form fields
- option changes compared with stored config
- changes to selected project ids

An edits guard prevents accidental navigation away from unsaved changes.

### 7.3 Save behavior

Saving is split into two mutations:

1. update provider credentials/options through `updateDeployment(...)`
2. update project selection through `updateDeploymentProjects(...)`

Project changes are translated into:

- `create` entries for newly-selected provider projects
- `delete` entries for deselected stored project rows

If projects are being removed, the UI shows a confirmation dialog before mutating.

### 7.4 Delete behavior

Deleting a provider calls `deleteDeployment(provider)`, refreshes shared navigation, and returns to `/deployments`.

This page is therefore both the configuration editor and the only project-selection surface.

---

## 8. Dashboard And Run History

### 8.1 Dashboard

`routes/provider/dashboard.vue` is the provider landing page once projects exist.

It calls `readDeploymentDashboard(provider)` and displays:

- selected projects
- latest deployment status
- deploy timestamp relative to now
- project URL when available

Clicking a project drills into `/deployments/:provider/:projectId/runs`.

### 8.2 Runs list

`routes/provider/runs.vue` mixes SDK and raw API usage:

- `triggerDeployment(...)` uses the SDK
- run history listing uses `api.get('/deployments/:provider/projects/:projectId/runs')`

The page supports:

- pagination via `offset`
- search
- manual refresh
- production deploy trigger
- preview deploy trigger

The run table computes human-readable duration and relative start time client-side.

### 8.3 Run detail

`routes/provider/run.vue` displays a single run through `readDeploymentRun(provider, runId, params)`.

It also:

- appends logs incrementally using the `since` timestamp
- polls every 3 seconds while the run is non-terminal
- performs one final delayed fetch after completion to catch late-arriving logs
- filters logs by level and search text
- allows canceling active runs through `cancelDeployment(...)`
- supports log download and “open deployment” when a URL exists

This route is effectively the operational incident/detail view for a single deployment run.

---

## 9. UI Constraints And Product Assumptions

- The entire module is admin-only at route-registration time.
- The provider set is code-defined rather than dynamically extensible in the UI.
- Project navigation only shows selected projects, not every provider-side project.
- Provider credentials are edited through field metadata, which keeps the UI thin but ties it to backend provider config definitions.
- The setup flow assumes “configure first, select projects second.”
- The run-history UI assumes a hybrid backend contract where local run persistence and provider-live status can diverge temporarily.

---

## 10. Tovu Reconstruction Notes

### 10.1 Why this exists

This UI exists because deployment is an operator workflow, not just a background API feature. The product needs a place to configure providers, choose targets, inspect runs, and react to failures.

### 10.2 What Tovu should preserve

- Deployment should be an explicit operator surface, not a hidden settings toggle
- The UI should reflect durable local state plus live provider state
- Credential setup, target selection, and run inspection are separate concerns
- Admin-only operational tools should be gated before they become routable

### 10.3 What Tovu can simplify

- V1 does not need multiple providers or all Directus dashboard views
- Deployment UI can start around preview environments or one release workflow
- Tovu can keep the provider set internal at first as long as the seam remains adapter-based

### 10.4 Possible Tovu seams

- `src/features/delivery/` for deployment/release use cases
- `src/admin-shell/delivery/` for operator-facing deployment UX
- `src/core/ports/DeliveryProviderPort.ts` for provider-specific deploy behavior
- `src/core/ports/PreviewEnvironmentPort.ts` if previews become the primary workflow

### 10.5 Suggested priority

- `V1`: preview/release operator workflow with visible run history and target config
- `Later`: multi-provider dashboards, richer logs, deeper deployment controls
