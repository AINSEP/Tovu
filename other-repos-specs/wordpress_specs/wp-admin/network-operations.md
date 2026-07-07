# WordPress Network Operations - TypeScript Rewrite Specification

**Source files analyzed:**
- `wp-admin/network/admin.php`
- `wp-admin/admin.php`
- `wp-admin/network.php`
- `wp-admin/includes/network.php`
- `wp-admin/network/setup.php`
- `wp-admin/network/update-core.php`
- `wp-admin/network/update.php`
- `wp-admin/update-core.php`
- `wp-admin/update.php`
- `wp-admin/network/menu.php`

---

## Section 1: Overview

This document covers the small set of wp-admin entry points that govern Multisite setup and network-wide update operations. The important pattern is that the network-specific files are mostly wrappers:

- `wp-admin/network/admin.php` switches WordPress into network-admin mode and then delegates to the shared admin bootstrap.
- `wp-admin/network/setup.php` is a thin wrapper around `wp-admin/network.php`.
- `wp-admin/network/update-core.php` is a thin wrapper around the shared core update screen.
- `wp-admin/network/update.php` is a thin wrapper around the shared plugin/theme update router.

The actual runtime behavior is split across:

1. **Bootstrap and context selection** - `wp-admin/network/admin.php` and `wp-admin/admin.php`
2. **Network creation / setup flow** - `wp-admin/network.php` plus helpers in `wp-admin/includes/network.php`
3. **Core update screen** - `wp-admin/update-core.php`
4. **Plugin/theme update router** - `wp-admin/update.php`

The operational contract is:

- network admin screens must only run in multisite
- setup requires `setup_network`
- core and package update actions are still capability-gated per action
- the network wrappers do not reimplement the underlying update logic
- multisite upgrade, setup, and network-admin routing are enforced before screen rendering continues

---

## Section 2: Bootstrap Chain And Context

### 2.1 `wp-admin/network/admin.php`

This file is the network-admin bootstrap. It does three critical things before any screen content runs:

1. Defines `WP_NETWORK_ADMIN = true`.
2. Loads the shared admin bootstrap via `require_once dirname( __DIR__ ) . '/admin.php'`.
3. Enforces multisite and network-admin routing rules.

The post-bootstrap guards are important:

- If `is_multisite()` is false, the file dies with "Multisite support is not enabled."
- It compares `$current_blog->domain` / `$current_blog->path` to `$current_site->domain` / `$current_site->path`.
- If the request is not already in the proper network-admin context, it redirects to `network_admin_url()`.
- The `redirect_network_admin_request` filter can override that redirect decision.

### 2.2 `wp-admin/admin.php`

`wp-admin/admin.php` is the shared admin bootstrap used by both site admin and network admin. Network pages inherit its behavior after `WP_NETWORK_ADMIN` has been defined.

Key effects relevant to this spec:

- defines the admin constants:
  - `WP_ADMIN`
  - `WP_NETWORK_ADMIN`
  - `WP_USER_ADMIN`
  - `WP_BLOG_ADMIN`
- loads `wp-load.php`
- sends nocache headers
- performs the multisite DB-upgrade check
- loads `wp-admin/includes/admin.php`
- calls `auth_redirect()`
- loads the appropriate menu file:
  - `wp-admin/network/menu.php` when `WP_NETWORK_ADMIN` is true
  - `wp-admin/menu.php` for regular site admin

The multisite DB-upgrade path matters here because `admin.php` can trigger the network-wide upgrade routine before any screen code runs. On multisite, if `db_version` is stale, it fires `do_mu_upgrade` and can make an internal HTTP request to `upgrade.php?step=1`.

### 2.3 Network Menu Implications

`wp-admin/network/menu.php` is loaded only after the bootstrap has established network-admin context. It defines the network navigation and exposes the relevant entry points:

- Dashboard
- Updates (`update-core.php`)
- Upgrade Network (`upgrade.php`)
- Sites
- Users
- Themes
- Plugins
- Settings
- Network Setup (`setup.php`) when `MULTISITE` and `WP_ALLOW_MULTISITE` are both enabled

This matters operationally because the setup screen is not a general-purpose admin page; it is surfaced only through the network-admin menu when the installation is configured to allow it.

---

## Section 3: Network Setup Flow

### 3.1 `wp-admin/network/setup.php`

This file contains no independent setup logic. It only:

1. loads `wp-admin/network/admin.php`
2. requires `wp-admin/network.php`

So the setup screen behavior lives entirely in `wp-admin/network.php`, with `setup.php` acting as the network-admin entry point.

### 3.2 `wp-admin/network.php`

`network.php` is the actual controller for enabling a Multisite network and for showing the archived network setup panel after Multisite already exists.

It begins by defining `WP_INSTALLING_NETWORK = true`, then loads the shared admin bootstrap through `admin.php`.

The access and routing rules are:

- `current_user_can( 'setup_network' )` is required
- if `is_multisite()` is true and `is_network_admin()` is false, the request redirects to `network_admin_url( 'setup.php' )`
- if `is_multisite()` is true but `MULTISITE` is not defined, it dies because the panel is not for legacy MU networks
- it requires `WP_ALLOW_MULTISITE` or an existing `network_domain_check()` before permitting a fresh network creation flow

The screen uses the helpers in `wp-admin/includes/network.php` to render the step-by-step UI.

### 3.3 Setup Phases

The controller behaves like a simple state machine:

| Condition | Result |
|---|---|
| `$_POST` present | Process the setup submission |
| already multisite or `network_domain_check()` returns truthy | Show step 2, the code/config output screen |
| otherwise | Show step 1, the network configuration form |

#### Submission path

When the form is submitted, `network.php`:

1. checks nonce `install-network-1`
2. loads `wp-admin/includes/upgrade.php`
3. calls `install_network()` to create the network tables
4. computes `$base` from the current home URL path
5. resolves `$subdomain_install` from `allow_subdomain_install()` and the submitted checkbox
6. if no network already exists, calls `populate_network(...)`
7. routes errors back to `network_step1()` or `network_step2()` depending on the error type

The `populate_network()` call is the point where the network identity is written. It uses:

- network ID `1`
- the cleaned base domain from `get_clean_basedomain()`
- the submitted admin email
- the submitted site/network name
- the installation base path
- the subdomain vs subdirectory choice

### 3.4 Helper-Driven Rendering

`wp-admin/includes/network.php` provides the user-facing render helpers used by `network.php`.

Important helper behaviors:

- `network_step1()` renders the initial setup form
- `network_step2()` renders the code block / instructions for the generated config changes
- `allow_subdomain_install()` and `allow_subdirectory_install()` gate which topology options can be offered
- `network_domain_check()` detects whether the network tables already exist
- `get_clean_basedomain()` derives the default base domain for the network

Two setup-specific operational checks matter here:

- `DO_NOT_UPGRADE_GLOBAL_TABLES` is a hard blocker for creating a network
- active plugins trigger a warning and stop the setup flow until they are deactivated

The file is also opinionated about the topology choice:

- subdomain installs are only available when the host and runtime conditions allow them
- subdirectory installs are only offered when the site age and filters permit them
- the screen warns that the choice cannot be changed later

---

## Section 4: Core Update Entry Point

### 4.1 `wp-admin/network/update-core.php`

This file is a wrapper only:

1. load `wp-admin/network/admin.php`
2. require the shared `wp-admin/update-core.php`

There is no separate network-only core update controller. The network wrapper exists so the shared screen runs with network-admin bootstrap and menu state already established.

### 4.2 Shared `wp-admin/update-core.php` Behavior

The shared screen adds the multisite redirect and capability gate:

- if `is_multisite()` and `! is_network_admin()`, redirect to `network_admin_url( 'update-core.php' )`
- if the current user lacks all of:
  - `update_core`
  - `update_themes`
  - `update_plugins`
  - `update_languages`
  then the request dies

That means the network wrapper is not a permission bypass. It just ensures the screen is reached through the correct multisite path.

### 4.3 Screen Semantics

`update-core.php` is the core update dashboard. It does not perform the upgrade inline. Instead it:

- enqueues update-related assets
- renders the available core updates
- renders language, theme, and plugin update status
- posts to the appropriate core-upgrade action handled by the same screen and upgrader plumbing

The network-specific implication is that the updates screen in Network Admin is the same data source and action surface as the single-site screen, but the multisite redirect forces the network-admin URL when needed.

---

## Section 5: Plugin And Theme Update Router

### 5.1 `wp-admin/network/update.php`

This file is also a wrapper:

1. if `$_GET['action']` is one of `update-selected`, `activate-plugin`, or `update-selected-themes`, define `IFRAME_REQUEST = true`
2. load `wp-admin/network/admin.php`
3. require the shared `wp-admin/update.php`

The `IFRAME_REQUEST` definition happens before bootstrap because the bulk update and reactivation flows rely on iframe-style rendering.

### 5.2 Shared `wp-admin/update.php` Behavior

`update.php` is the action router for plugin and theme install/update operations. It is not network-specific code, but the network wrapper ensures the request is executed in network-admin context where appropriate.

The router branches by `$_GET['action']` and performs an action-specific capability check before any download or filesystem work begins. The core branches include:

- `update-selected`
- `upgrade-plugin`
- `activate-plugin`
- `install-plugin`
- `upload-plugin`
- `upload-plugin-cancel-overwrite`
- `upgrade-theme`
- `update-selected-themes`
- `install-theme`
- `upload-theme`
- `upload-theme-cancel-overwrite`

The important operational point is that the wrapper does not alter the update mechanics. It only changes the context in which the shared router runs.

### 5.3 Capability Gates

Each branch in `update.php` is gated independently:

- plugin bulk/single update and plugin reactivation require `update_plugins`
- plugin installs require `install_plugins`
- plugin uploads require `upload_plugins`
- theme update branches require `update_themes`
- theme installs require `install_themes`
- theme uploads require `upload_themes`

That means the multisite wrapper is not a substitute for per-action capability checks. Those checks still happen in the shared router.

### 5.4 Network-Specific Implication

In multisite, the network admin menu exposes the updates and package-management screens through `network/menu.php`, but the underlying router remains shared. The practical difference is contextual:

- the page loads with network-admin navigation and screen state
- bulk update actions use iframe rendering
- all package operations still go through the same upgrader classes and filesystem helpers as single-site admin

---

## Section 6: Operational Contracts

1. `wp-admin/network/admin.php` is the network-admin switch. It is the earliest place where the request becomes network-admin aware.
2. `wp-admin/admin.php` remains the shared bootstrap for both single-site and network-admin screens.
3. `wp-admin/network.php` owns the setup flow, but `wp-admin/network/setup.php` is only the network-admin wrapper that reaches it.
4. `wp-admin/network/update-core.php` and `wp-admin/network/update.php` do not fork the update logic; they only route into the shared screens under network-admin bootstrap.
5. Setup requires `setup_network`, and package/core updates still require their own per-action capabilities.
6. The multisite DB-upgrade path can run from admin bootstrap before any screen renders, so setup/update screens inherit that global upgrade behavior.
7. The network setup screen is intentionally conservative: it warns about active plugins, blocks unsupported global-table states, and treats the subdomain/subdirectory decision as effectively permanent.

---

## Tovu Reconstruction Notes

### Why this exists

These flows exist to bootstrap, upgrade, and maintain the multisite/network runtime. They are operational surfaces where long-running or irreversible tenancy decisions are made.

### What Tovu should preserve

- Network-aware setup and upgrade flows separated from normal content/admin screens
- Capability-per-operation gates even when a request is already in network-admin context
- Batch or background processing for long-running upgrade work

### What Tovu can simplify

- Tovu can replace chained browser redirects and iframe-era update flows with job-backed progress reporting
- Setup and update routing can be cleaner as long as the operator boundaries remain explicit

### Possible Tovu seams

- `src/features/tenant-setup/`
- `src/features/update/`
- `src/core/ports/TenantProvisioningPort.ts`
- `src/core/ports/BackgroundJobRunnerPort.ts`

### Suggested priority

- `V1`: only if Tovu ships tenant/network setup and upgrade flows
- `Later`: WordPress-style wrapper-screen parity
