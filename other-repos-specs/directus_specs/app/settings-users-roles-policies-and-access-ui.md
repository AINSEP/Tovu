# Directus Settings Users Roles Policies And Access UI

**Source files analyzed:**
- `other-repos/directus/app/src/main.ts`
- `other-repos/directus/app/src/router.ts`
- `other-repos/directus/app/src/hydrate.ts`
- `other-repos/directus/app/src/modules/index.ts`
- `other-repos/directus/app/src/modules/settings/index.ts`
- `other-repos/directus/app/src/modules/settings/components/navigation.vue`
- `other-repos/directus/app/src/modules/settings/routes/roles/collection.vue`
- `other-repos/directus/app/src/modules/settings/routes/roles/item.vue`
- `other-repos/directus/app/src/modules/settings/routes/roles/public-item.vue`
- `other-repos/directus/app/src/modules/settings/routes/roles/add-new.vue`
- `other-repos/directus/app/src/modules/settings/routes/roles/use-save.ts`
- `other-repos/directus/app/src/modules/settings/routes/roles/role-info-sidebar-detail.vue`
- `other-repos/directus/app/src/modules/settings/routes/policies/collection.vue`
- `other-repos/directus/app/src/modules/settings/routes/policies/item.vue`
- `other-repos/directus/app/src/modules/settings/routes/policies/add-new.vue`
- `other-repos/directus/app/src/modules/settings/routes/policies/use-save.ts`
- `other-repos/directus/app/src/modules/settings/routes/policies/policy-info-sidebar-detail.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/system-permissions.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/detail/permissions-detail.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/detail/components/actions.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/detail/components/fields.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/detail/components/permissions.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/detail/components/presets.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/detail/components/validation.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/detail/components/app-minimal.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/permissions-row.vue`
- `other-repos/directus/app/src/interfaces/_system/system-permissions/permissions-header.vue`
- `other-repos/directus/app/src/stores/permissions.ts`
- `other-repos/directus/app/src/stores/fields.ts`
- `other-repos/directus/app/src/stores/collections.ts`
- `other-repos/directus/app/src/app-permissions.ts`

---

## 1. Overview

The settings module is the administrative configuration surface of the Directus app. It is a module subtree under the app router, but the important behavior is not just route exposure. It is the place where Directus mutates the platform itself:

- collection metadata
- field metadata
- roles
- policies
- permission bindings
- system access defaults

For this spec, the important scope is the users/roles/policies/access UI path. That path is built from:

- the settings module route tree
- the roles and policies list/detail routes
- the public-role access editor
- the system-permissions interface for policy permissions
- the permissions and fields stores that back the UI

The resulting contract is a hybrid of list pages, item editors, and nested permission-drawer editors.

---

## 2. Boot And Router Integration

The settings module is mounted dynamically like other internal modules:

1. `main.ts` boots the app shell
2. the global router is installed after extensions load
3. `modules/index.ts` registers the internal module routes
4. `modules/settings/index.ts` mounts settings under `/settings`

This means the settings UI is not a standalone app. It is a module subtree living inside the same permission-aware shell as content, visual editing, and other admin surfaces.

The settings module root routes include:

- `project`
- `appearance`
- `data-model`
- `roles`
- `policies`
- `presets`
- `ai`
- `flows`
- `extensions`
- `marketplace`
- `system-logs`
- `translations`

The navigation component reflects those same route families, which keeps the route tree and sidebar in sync.

---

## 3. Settings Navigation And Module Shape

`modules/settings/components/navigation.vue` is the canonical index of the settings UI.

It groups links into functional clusters:

- data model and flows
- roles and access policies
- project and appearance
- presets and translations
- AI, marketplace, extensions, and logs

The navigation is data-driven from `serverStore.info` and `settingsStore.settings`:

- AI appears only when the server reports `ai_enabled` or `mcp_enabled`
- system logs appear only when websocket logs are available
- bug/feature links come from project settings or default URLs

This is a runtime contract, not a static menu.

---

## 4. Roles List And Editor Flow

`routes/roles/collection.vue` is the roles index page.

### 4.1 Role List Data

The page fetches `/roles` with `fetchAll()` and requests:

- role identity and display fields
- child roles
- user counts grouped by role

It then injects a synthetic public role entry with:

- id `public`
- public icon
- localized name and description

That makes the public role visible in the same table but handled as a special case in navigation.

### 4.2 Role Detail Editor

`routes/roles/item.vue` uses `useItem('directus_roles', primaryKey)` and a `VForm` bound to the role record.

The save path intentionally hydrates `userStore` after changes. That is because the current user may be part of the role being edited, so the client needs to refresh its own role information after the save.

The editor supports:

- save and stay
- save and add new
- save and quit
- delete
- unsaved-change navigation protection
- revisions refresh
- user invite modal when default auth is enabled

### 4.3 Public Role Editor

`routes/roles/public-item.vue` is not a normal role item editor. It edits the public role's policy assignments through the access junction.

Key details:

- it clones the `directus_roles.policies` field definition from the fields store
- it overrides the field options so the public role can see policies attached through null role/null user access records
- it reads and writes `/access`, not `/roles/:id`
- it stages create/update/delete alterations against the `directus_access` relation

That is a strong runtime contract: the public role is represented as a special access-binding editor, not as a normal role document.

### 4.4 Role Creation

`routes/roles/add-new.vue` is a modal route. It posts to `/roles` and redirects to the new role item view.

---

## 5. Policies List And Editor Flow

`routes/policies/collection.vue` and `routes/policies/item.vue` are the policy management screens.

### 5.1 Policy List Data

The list page fetches `/policies` with counts for both attached users and attached roles.

It displays:

- policy icon
- policy name
- user count
- role count
- description

### 5.2 Policy Creation

`routes/policies/add-new.vue` captures:

- name
- app access
- admin access

`useSave()` posts the new policy to `/policies`. If the policy enables app access without admin access, it immediately seeds the minimum app permissions from `appAccessMinimalPermissions` into `/permissions`.

That seed step is important: app access is not just a toggle. It brings a minimum permission set with it.

### 5.3 Policy Detail Editor

`routes/policies/item.vue` uses `useItem('directus_policies', primaryKey)` and a standard `VForm`.

After save, it hydrates `userStore` again for the same reason as the role editor: policy changes can affect the current user’s effective access.

The item editor supports:

- save and stay
- save and add new
- save and quit
- delete
- revisions
- unsaved-change navigation protection

### 5.4 Policy Metadata Sidebar

`policy-info-sidebar-detail.vue` exposes the policy primary key and supports clipboard copy when the browser allows it.

---

## 6. Access And Permission UI

The permission editor is the deepest part of the settings access UI. It lives in the system-permissions interface and is used from the policy editor as a nested relation editor.

### 6.1 Data Model

`system-permissions.vue` manages permission records for a policy through the `directus_permissions` relation.

It works with:

- a policy primary key
- current staged alterations
- relation metadata from `useRelationO2M()`
- collection metadata from `collectionsStore`
- app-access seed permissions from `appAccessMinimalPermissions`
- recommended defaults from `appRecommendedPermissions`
- disabled action constraints from `app-permissions.ts`

### 6.2 Permission Table Contract

The main permissions view groups permissions by collection and splits system collections from regular collections.

Per collection, it supports:

- row-level full access
- row-level no access
- per-action full access
- per-action no access
- edit row details
- remove row

The actions rendered are the editable permission actions:

- `create`
- `read`
- `update`
- `delete`
- `share`

### 6.3 Permission Detail Drawer

`permissions-detail.vue` opens a drawer for one permission at a time.

It fetches the policy and permission record when editing an existing item, or uses staged edits when adding a new one. The drawer builds its tabs from the action type:

- item permissions for read/update/delete/share
- field permissions for create/read/update
- field validation for create/update
- field presets for create/update

The drawer persists only through emitted updates back to the parent, which keeps the parent list as the source of truth for pending alterations.

### 6.4 Item Permissions Tab

`detail/components/permissions.vue` exposes the permission rule filter as a JSON-backed `system-filter` form field. It also shows the app-minimal warning block when the current policy has minimum app permissions attached.

### 6.5 Field Permissions Tab

`detail/components/fields.vue` renders a checkbox tree over the field hierarchy from `useFieldTree()`.

Important contract details:

- app-minimal fields are preselected and cannot be removed
- the tree can expand and collapse grouped fields
- the field set is normalized to `null` when empty

### 6.6 Validation And Presets Tabs

The validation tab writes the `validation` JSON filter for create/update permissions.

The presets tab writes the `presets` JSON payload and warns when relational fields receive array syntax that app interfaces will not render correctly.

### 6.7 Reset Paths

For policies with app access, the permission table exposes reset actions that can:

- reset system permissions to the app minimum
- reset system permissions to the recommended defaults

The reset flow removes current system collection permissions and optionally re-seeds the recommended app permissions.

---

## 7. Runtime Contracts With API And System Data

The access UI depends heavily on API shape and on system data definitions.

### 7.1 API Endpoints

The settings role/policy/access flow relies on:

- `/roles`
- `/roles/:id`
- `/policies`
- `/policies/:id`
- `/access`
- `/permissions`
- `/permissions/:id`
- `/permissions/me`
- `/collections`
- `/fields`

### 7.2 Store Contracts

The permission and access UI depends on hydrated stores to stay coherent:

- `collectionsStore` provides collection names, system collection flags, and group structure
- `fieldsStore` provides the cloned `directus_roles.policies` field and collection/field metadata for editors
- `permissionsStore` loads the current user’s effective permissions from `/permissions/me`

`permissionsStore` also parses preset expressions and inspects nested dynamic variables. If presets reference `$CURRENT_USER` or `$CURRENT_ROLE`, it asks the user store to hydrate additional fields so the UI can resolve those values.

### 7.3 System Data Contracts

The access UI relies on system constants and seeded permission sets:

- `appAccessMinimalPermissions` for minimum app access
- `appRecommendedPermissions` for reset defaults
- `disabledActions` for collections that cannot expose all actions

Those structures are not visual-only hints. They alter what the editor allows the user to edit and what gets seeded into the API.

---

## 8. What This Module Is Architecturally

The settings users/roles/policies/access area is a configuration system with a lot of implicit coupling, but the implementation keeps that coupling explicit through stores, route trees, and permission-editing composables.

It is:

- a router subtree under the app shell
- a set of CRUD list/detail editors for roles and policies
- a special-case editor for the public role
- a nested permission system editor built around staged alterations
- a bridge between system data definitions and the API

It is not:

- a simple admin form bundle
- a static permission matrix
- a direct wrapper around `/permissions` without app-level policy context

---

## 9. Follow-Up Areas

Later specs could inspect:

- the data model settings subtree and field-detail editor
- the policy relation schema for `directus_access` and `directus_permissions`
- the `useFieldTree()` and `system-filter` behavior in the permission drawer
- the user invite flow and its relation to role changes

---

## 10. Tovu Reconstruction Notes

### 10.1 Why this exists

This UI exists because access control is not just a backend policy engine. Operators need a coherent place to inspect roles, policies, public access, and permission edits without reverse-engineering the data model.

### 10.2 What Tovu should preserve

- Access configuration needs a dedicated operator workflow
- Public/default access should be modeled explicitly, not hidden in special-case code
- Permission editing must stay grounded in current collection/field metadata
- Effective access for the current operator should be available to the UI as data

### 10.3 What Tovu can simplify

- V1 does not need Directus’s full role/policy/access split if the concepts remain clean
- Permission editors can start narrower than Directus
- Invite and user-management edges can follow later if core access semantics are sound

### 10.4 Possible Tovu seams

- `src/features/access/` for roles, policies, and effective capability evaluation
- `src/admin-shell/settings/access/` for operator-facing access configuration
- `src/core/ports/AccessEditorPort.ts` if multiple admin shells or editors need the same mutation contract

### 10.5 Suggested priority

- `V1`: explicit roles/policies model and an operator-facing access editor
- `Later`: richer public-role tooling, deeper preset editing, broader user/invite integration
