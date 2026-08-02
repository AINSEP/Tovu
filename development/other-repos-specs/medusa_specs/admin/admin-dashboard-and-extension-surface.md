# Admin Dashboard And Extension Surface

## 1. Summary of the Subsystem

Medusa's admin is a separate extensible product surface built from:

- `packages/admin/dashboard`
- `packages/admin/admin-sdk`
- `packages/admin/admin-vite-plugin`
- `packages/admin/admin-bundler`
- `packages/admin/admin-shared`

The admin is not just a fixed internal dashboard. It is designed to accept extension contributions from plugins.

## 2. Key Primitives / Contracts

Inside the dashboard app, plugin contributions are aggregated into several extension families:

- routes
- menu items
- widgets
- custom form fields
- display extensions
- i18n resources

The visible `DashboardApp` contract composes plugin outputs into:

- route maps
- navigation structures
- widget registries by injection zone
- form-field registries by model and zone
- display registries
- translation resource bundles

The Vite plugin scans admin sources and generates virtual modules for:

- routes
- menu items
- widgets
- custom field links
- custom field forms
- custom field displays
- i18n resources

The server-side admin loader also distinguishes:

- local admin sources
- plugin admin bundles
- development vs production serving modes

## 3. Boundaries and Constraints

Medusa's admin extension model is constrained rather than arbitrary.

Extensions are allowed to contribute through known shapes:

- route modules
- widget modules
- menu items
- field and display zones
- translations

The admin loader also guards path choices:

- `/auth`
- `/store`
- `/admin`

are treated as disallowed values for the configurable admin mount path.

This means Medusa is protecting the host surface even while allowing plugin-driven UI extension.

## 4. Operational Implications

- Admin plugins can add operator features without forking the host dashboard.
- Build-time discovery plus virtual modules makes extension composition systematic.
- Hot reload can watch extension source folders directly.
- The host keeps control over extension types and layout zones, which is safer than unrestricted DOM takeover.

## 5. Tovu Reconstruction Notes

### Why this exists

This subsystem matters because Tovu needs an operator UI that can be extended safely without recreating the plugin-era chaos of unrestricted admin mutation.

### What Tovu should preserve

- explicit extension contribution types
- controlled injection zones for widgets and custom fields
- route and menu contribution with host-owned constraints
- build-time or registry-time extension discovery instead of arbitrary runtime mutation

### What Tovu can simplify

- fewer extension types initially
- a smaller number of injection zones
- one extension SDK instead of multiple packaging layers if the seam remains clear

### Possible Tovu seams

- `AdminRouteContributionPort`
- `AdminWidgetZonePort`
- `AdminFieldExtensionPort`
- `AdminTranslationContributionPort`
- `AdminExtensionBuildRegistry`

### Suggested priority

- `V1`: controlled routes, widgets, and field extensions
- `V2`: richer display and localization extension layers
