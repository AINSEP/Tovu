# Directus Admin App

**Source files analyzed:**
- `other-repos/directus/app/src/main.ts`
- `other-repos/directus/app/src/router.ts`
- `other-repos/directus/app/src/extensions.ts`
- `other-repos/directus/app/src/modules/index.ts`
- `other-repos/directus/app/package.json`

---

## 1. Overview

The Directus admin app is a Vue application that behaves like a configurable Studio shell.

It is not just a fixed SPA with static routes. It supports:

- public auth and setup flows
- dynamic route registration for modules
- extension-loaded UI types
- user- and permission-aware module registration
- TFA enforcement at router level

---

## 2. App Boot Sequence

`app/src/main.ts` performs the following steps in order:

1. create Vue app from `App`
2. install i18n
3. install Pinia
4. install head manager
5. set global Vue error handler
6. register directives
7. register components
8. register views
9. `await loadExtensions()`
10. `registerExtensions(app)`
11. install router
12. initialize system-level app injection via `useSystem(app)`
13. mount app to `#app`
14. install drag/drop prevention listeners on `window`

Important ordering rule in source:

- router is added after extension loading so extension routes are registered first

---

## 3. Public Routes

The inspected router defines these public or semi-public routes:

- `/setup`
- `/login`
- `/reset-password`
- `/register`
- `/accept-invite`
- `/tfa-setup`
- `/logout`
- `/shared/:id`

There is also root redirection logic:

- `/` redirects to `/login` when setup is complete
- `/` redirects to `/setup` when setup is incomplete

---

## 4. Router Guard Behavior

The `beforeEach` hook in `router.ts` is one of the app's most important contracts.

### 4.1 First load behavior

On the first navigation only:

- attempt `refresh({ navigate: false })`
- ignore refresh errors

This means the app tries silent token refresh before deciding the user is logged out.

### 4.2 Server hydration

If server project info has not yet been loaded:

- call `serverStore.hydrate()`
- assign app-level error if hydration fails

### 4.3 Setup gate

If setup is incomplete:

- every route except `/setup` redirects to `/setup`

### 4.4 Private-route auth gate

For non-public routes:

- if app not hydrated and user is authenticated:
  - run `hydrate()`
  - possibly redirect around TFA setup
  - otherwise continue to requested route
- if not authenticated:
  - redirect to `/login`
  - preserve redirect target in query string when available

### 4.5 TFA enforcement

If the current user is not a share user, the guard can force navigation to `/tfa-setup` when:

- role/user enforcement requires TFA and the user has no TFA secret
- local storage indicates the user initiated TFA setup and has not completed it

If the user already has TFA configured:

- navigating to `/tfa-setup` redirects back to `last_page` or `/login`

### 4.6 Route tracking

The `afterEach` hook schedules page tracking for non-public routes after 500ms.

This uses `userStore.trackPage(to)`.

---

## 5. Extension Loading

`app/src/extensions.ts` is the app-side extension integration hub.

### 5.1 Loading

`loadExtensions()` attempts to import:

- `@directus-extensions` during development
- `${rootPath}extensions/sources/index.js` in built/runtime mode

If extension loading fails:

- it logs warnings
- the app continues booting

### 5.2 Registered extension families

The app collects internal definitions plus optional custom extensions for:

- interfaces
- displays
- layouts
- modules
- panels
- operations
- themes

### 5.3 Translation-aware registration

For several extension families, the app watches locale changes and re-publishes translated extension metadata.

This means extension metadata is part of the reactive app state, not a one-time bootstrap artifact.

---

## 6. Module Registration

`app/src/modules/index.ts` shows how private app modules are mounted.

### 6.1 Discovery

Internal modules are discovered through:

- `import.meta.glob('./*/index.ts', { import: 'default', eager: true })`

Then sorted by module `id`.

### 6.2 Permission-aware registration

On hydration:

1. require current user
2. fetch permissions from stores
3. for each module:
   - if it has no `preRegisterCheck`, include it
   - otherwise await `preRegisterCheck(user, permissions)`
4. register allowed modules only
5. add one route per module:
   - path `/${module.id}`
   - component `RouterPass`
   - module child routes

On dehydrate:

- remove all module routes
- clear registered module list

So module availability is session-sensitive and permission-sensitive.

---

## 7. What The Admin App Is Architecturally

From the inspected code, the Directus admin app is:

- a booted shell served by the API
- a permission-aware route host
- an extension-driven UI type registry
- a dynamic module loader
- a reactive, localized control plane

This is materially different from a static admin SPA with all routes and UI widgets compiled in permanently.

---

## 8. Follow-Up Areas

Later specs should inspect:

- `hydrate.ts`
- `auth.ts`
- `sdk.ts`
- module-specific route trees
- stores used for permissions, user, and server hydration
- extension UI contracts for interfaces, displays, layouts, panels, operations, and themes

---

## 9. Tovu Reconstruction Notes

### 9.1 Why this exists

This shell exists because a serious CMS/admin platform is not just “some routes plus forms.” It needs a boot sequence, auth/setup gating, permission-aware module availability, and extension-aware UI registration before feature modules become reliable.

### 9.2 What Tovu should preserve

- A clear admin-shell bootstrap order
- Session- and permission-aware module registration
- Auth/setup guards owned by the shell rather than duplicated inside modules
- Extension/module metadata loaded before feature routing depends on it

### 9.3 What Tovu can simplify

- V1 can ship fewer public routes and fewer special-case flows than Directus
- TFA, invite, and share-specific edges can come later if the shell keeps explicit guard seams
- The shell can stay thinner than Directus as long as it remains a dynamic host rather than a hardcoded admin SPA

### 9.4 Possible Tovu seams

- `src/admin-shell/` for shell metadata, module registry, and shared navigation state
- `src/features/auth/` for auth/setup guards and session hydration dependencies
- `src/core/ports/AdminModuleRegistryPort.ts` for module registration and filtering
- `src/server/` should expose only the transport surface the shell needs, not own shell policy itself

### 9.5 Suggested priority

- `V1`: dynamic admin shell, auth/setup guards, permission-aware module registry
- `Later`: richer public flows, advanced shell analytics, more sophisticated extension UI families
