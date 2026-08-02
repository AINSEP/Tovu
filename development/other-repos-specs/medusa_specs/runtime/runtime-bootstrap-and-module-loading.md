# Runtime Bootstrap And Module Loading

## 1. Summary of the Subsystem

Medusa's runtime bootstrap is centered in `packages/medusa/src/loaders/`.

The assembled application does not hardcode one static system. It initializes a shared container, resolves configured modules and plugins, loads policies and links, then mounts entrypoints for:

- HTTP APIs
- admin
- workflows
- subscribers
- jobs

This is the composition root for the whole platform.

## 2. Key Primitives / Contracts

Visible bootstrap pieces include:

- container initialization
- config loading
- feature flag loading
- policy loading
- shared Postgres connection loading
- plugin resolution
- module merging and validation
- link loading
- workflow loading
- subscriber loading
- job loading
- API entrypoint loading
- admin entrypoint loading

Key evidence:

- `packages/medusa/src/loaders/index.ts`
- `packages/medusa/src/loaders/api.ts`
- `packages/medusa/src/loaders/admin.ts`
- `packages/core/modules-sdk/src/medusa-app.ts`

Important runtime traits:

- request-scoped containers are created per request
- worker mode can be `worker`, `shared`, or `server`
- plugins are resolved and merged into config before module load
- plugin routes are intentionally loaded before core routes for precedence
- policies are loaded from core, project root, and each plugin

## 3. Boundaries and Constraints

The bootstrap layer enforces several useful rules:

- module names are validated before load
- provider or external module implementations are selected by config, not by hardcoded imports inside the app layer
- background processors can be enabled or skipped based on worker mode
- admin is mounted as its own surface with path validation
- plugins contribute through named directories such as `api`, `admin`, `jobs`, `links`, `workflows`, and `subscribers`

This gives Medusa a clear composition-root pattern:

- framework owns loading mechanics
- modules own business capabilities
- plugins and providers plug into well-known attachment points

## 4. Operational Implications

- Worker mode separation allows process-role specialization.
- Plugin route precedence gives plugins controlled override power, which is flexible but must be governed carefully.
- Request-scoped containers help isolate request context and injected dependencies.
- A misconfigured plugin or module can affect startup centrally, so composition-time validation matters.

## 5. Tovu Reconstruction Notes

### Why this exists

This subsystem matters because it shows how a modular platform becomes a running product without collapsing module seams during startup.

### What Tovu should preserve

- one explicit composition root
- config-driven module and adapter selection
- request-scoped dependency injection where needed
- role-based process modes for API, worker, and shared workloads
- plugin contributions through named, auditable entrypoints

### What Tovu can simplify

- fewer loader types if Tovu's runtime surface is narrower
- less package indirection where the seam does not need to be public
- a simpler plugin precedence policy if Tovu wants stricter override safety

### Possible Tovu seams

- `RuntimeCompositionRoot`
- `ModuleRegistryPort`
- `PluginContributionLoader`
- `PolicyLoader`
- `ProcessRoleMode`

### Suggested priority

- `V1`: explicit composition root and config-driven loading
- `V2`: more sophisticated worker-mode and plugin precedence policies
