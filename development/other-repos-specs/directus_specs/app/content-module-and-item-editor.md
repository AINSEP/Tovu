# Directus Content Module And Item Editor

**Source files analyzed:**
- `other-repos/directus/app/src/main.ts`
- `other-repos/directus/app/src/router.ts`
- `other-repos/directus/app/src/hydrate.ts`
- `other-repos/directus/app/src/modules/index.ts`
- `other-repos/directus/app/src/modules/content/index.ts`
- `other-repos/directus/app/src/modules/content/composables/use-navigation.ts`
- `other-repos/directus/app/src/modules/content/components/navigation.vue`
- `other-repos/directus/app/src/modules/content/routes/collection.vue`
- `other-repos/directus/app/src/modules/content/routes/collection-or-item.vue`
- `other-repos/directus/app/src/modules/content/routes/item.vue`
- `other-repos/directus/app/src/modules/content/routes/no-collections.vue`
- `other-repos/directus/app/src/modules/content/routes/not-found.vue`
- `other-repos/directus/app/src/modules/content/routes/preview.vue`
- `other-repos/directus/app/src/composables/use-item/index.ts`
- `other-repos/directus/app/src/composables/use-permissions/index.ts`
- `other-repos/directus/app/src/composables/use-permissions/item/use-item-permissions.ts`
- `other-repos/directus/app/src/composables/use-permissions/collection/use-collection-permissions.ts`
- `other-repos/directus/app/src/stores/collections.ts`
- `other-repos/directus/app/src/stores/fields.ts`
- `other-repos/directus/app/src/stores/permissions.ts`
- `other-repos/directus/app/src/views/private/components/live-preview.vue`

---

## 1. Overview

The Directus content module is the runtime data-management surface of the admin app. It is not a static route tree with hard-coded models. Instead, it binds the app shell, store hydration, route guards, collection metadata, permission state, versioning, and editor widgets into a collection-driven workspace.

At a high level, the content module is responsible for:

- rendering the collection navigation tree
- choosing the initial collection when the module opens
- switching between collection list and item editor views
- preserving collection, bookmark, and archive state in the route
- enforcing system-collection redirects and permission-derived editor behavior
- coordinating live preview, versions, collab, and manual flows in the item editor

This module is only meaningful after the app has booted, the user has been hydrated, and the core stores have been populated from the API.

---

## 2. Boot And Module Integration

`main.ts` installs the app shell, then loads extensions, then installs the router. That ordering matters because module routes are injected only after extension loading has completed.

`modules/index.ts` then mounts internal modules under `/${module.id}` by:

1. discovering module definitions via `import.meta.glob`
2. filtering them through `preRegisterCheck` when present
3. adding each registered module as a router subtree wrapped in `RouterPass`

The content module itself has no `preRegisterCheck`, so it is always eligible once the app is hydrated. Its actual usefulness still depends on the stores hydrated by `hydrate.ts`:

- `useUserStore()` for the authenticated user
- `usePermissionsStore()` for collection access
- `useCollectionsStore()` for visible collections
- `useFieldsStore()` for field metadata
- `useRelationsStore()` for relation wiring used by the editor
- `usePresetsStore()` for saved list state

Hydration order is important:

1. hydrate the current user first
2. hydrate permissions and fields next when `app_access` is enabled
3. hydrate the remaining stores
4. hydrate extensions

That ordering is what makes the content module route logic and item editor contract stable on first load.

---

## 3. Route Topology

`modules/content/index.ts` registers the content routes under `/content`.

### 3.1 Route Map

The module defines these routes:

- `content` root route with a `no-collections` fallback
- `content-collection` at `/:collection`
- `content-item` at `/:collection/:primaryKey`
- `content-item-preview` at `/:collection/:primaryKey/preview`
- `content-item-not-found` as a catch-all inside the module

### 3.2 Initial Collection Selection

The root route does not always stay on an empty landing page. Its `beforeEnter` logic picks the first usable collection when visible collections exist.

Selection order is:

1. last accessed collection from `localStorage`
2. first root collection with schema
3. first root collection found after reopening closed groups

The route logic uses `useCollectionsStore().visibleCollections` plus the module-local group expansion state from `useNavigation()`.

### 3.3 System Collection Guard

The `checkForSystem` guard redirects content routes to dedicated system routes when the target collection is a system collection.

If the route points at a system collection:

- collection paths are redirected to the system collection route
- item paths are redirected to the system item route

The guard also preserves `bookmark` when drilling from a collection list to an item inside the same collection.

---

## 4. Navigation Model

`useNavigation()` is a module-scoped navigation state helper, not a per-view state machine.

It keeps two shared refs:

- `activeGroups`
- `showHidden`

The first time it runs, `activeGroups` is seeded from collections whose meta collapse state is `open` or `locked`. When a current collection is provided, the helper walks up parent groups and opens any ancestor group that is currently collapsed.

The content navigation component then uses that state to:

- render only visible collections by default
- optionally reveal hidden collections
- search the collection tree
- surface a creation shortcut for admins when there are no collections at all

This is a UI contract with the collection store, not a purely presentational sidebar.

---

## 5. Collection List Flow

`routes/collection.vue` is the list view for a selected collection.

### 5.1 Collection And Layout Binding

The list view binds several runtime sources together:

- `useCollection(collection)` for collection metadata
- `useLayout(layout)` for the active view implementation
- `usePreset(collection, bookmarkID)` for saved layout/filter/search state
- `useCollectionPermissions(collection)` for collection-level access
- `usePermissionsStore()` for field-level archive permission checks
- `useFlows()` for manual flow execution attached to the collection

The active layout defaults to `tabular` when no preset is present.

### 5.2 Archive State

Archive handling is not a display concern only. The list computes a separate system filter when:

- the collection defines `meta.archive_field`
- the collection defines `meta.archive_app_filter`
- read access exists for the archive field

The archive filter is then merged with the user filter via `mergeFilters`.

### 5.3 Batch Actions

The list view supports:

- batch delete
- batch archive / unarchive
- batch refresh
- selection clearing when the collection changes

Deletes use `DELETE /items/:collection` with the selected primary keys in the request body. Archive updates use `PATCH /items/:collection` with `keys` plus the archive field payload.

### 5.4 Bookmarks

Bookmark creation is driven by the active preset state. Saving a bookmark returns a collection bookmark identifier, and the router is pushed back to the collection route with `?bookmark=...`.

That query string becomes part of the module route contract and is preserved when drilling into an item from the same collection.

---

## 6. Item Editor Flow

`routes/item.vue` is the full item editor and is the main integration point for item-level data, permissions, versions, collab, preview, and AI tool refresh hooks.

### 6.1 Item Loading Contract

The editor uses `useItem(collection, primaryKey, query)` as its core state engine. That composable is responsible for:

- fetching the item from the API
- exposing `edits`, `item`, `loading`, `saving`, `deleting`, and `archiving`
- validating before save
- clearing hidden fields when save rules require it
- creating copies through GraphQL when requested

It chooses the endpoint based on collection shape:

- singleton collections read from `/items/:collection`
- normal collections read from `/items/:collection/:primaryKey`

### 6.2 Permission Contract

`useItem()` composes `usePermissions()` which itself combines:

- collection-level permissions from `useCollectionPermissions()`
- item-level permissions from `useItemPermissions()`

The item editor consumes the resulting computed access flags to decide:

- whether save is allowed
- whether update/delete/share/archive actions are enabled
- which fields are visible or editable
- whether the revisions and version UI should be active

### 6.3 Versioning And Collaboration

The item editor layers on:

- `useVersions()` for version list and version CRUD
- `useCollab()` for collaborative editing state
- `useEditsGuard()` for unsaved-change navigation protection
- `useVisualEditing()` for preview integration
- `useFlows()` for manual flows triggered from the editor
- `useShortcut()` for keyboard save actions

The active version changes the data path:

- main record mode saves through the item endpoint
- version mode saves through the versions API path and uses version-specific permissions

### 6.4 Live Preview

Preview URL generation is driven by collection metadata:

- `meta.preview_url` defines the preview template
- `useTemplateData()` resolves the template variables
- `renderStringTemplate()` produces the final URL

The preview view then mounts `LivePreview`, optionally enabling visual editing when the preview origin is allowed.

### 6.5 Save And Copy

The save path is intentionally strict:

1. merge default values with current item edits
2. clear hidden fields whose conditions require clearing
3. validate client-side
4. submit `POST` for new records or `PATCH` for existing records
5. refresh the local item state from the API response

Copy creation uses GraphQL instead of a plain REST clone because it needs to gather the fields declared by `item_duplication_fields` and preserve relational shape before the new item is cleared of its primary key.

---

## 7. Runtime Contracts With API And System Data

The content module is tightly coupled to the API shape, but the coupling is mediated through stores and composables.

### 7.1 Store Contracts

- `collectionsStore.hydrate()` reads `/collections` and prepares display names, types, icons, colors, and translations
- `fieldsStore.hydrate()` reads `/fields` and appends the fake `$thumbnail` field used by file rendering
- `permissionsStore.hydrate()` reads `/permissions/me`, parses presets, and can request extra user fields for dynamic variables

### 7.2 System Data Contracts

The content module depends on system metadata such as:

- `meta.singleton`
- `meta.archive_field`
- `meta.archive_value`
- `meta.preview_url`
- `meta.display_template`
- `meta.item_duplication_fields`
- `meta.group`
- `meta.collapse`

Those values determine list behavior, editor shape, route choice, and preview generation.

### 7.3 API Contracts

The main content flows rely on these endpoints:

- `/collections`
- `/fields`
- `/items/:collection`
- `/items/:collection/:primaryKey`
- `/versions`
- `/permissions/me`
- `/graphql` and `/graphql/system` for copy flows

The important architectural point is that the UI does not hard-code the schema; it derives behavior from store state hydrated from these endpoints.

---

## 8. Follow-Up Areas

Later specs could drill into:

- the layout and preset state machine used by `usePreset()`
- the live preview / visual editing transport
- the `useFlows()` manual run contract
- the AI tool refresh hooks that invalidate the content editor after system tool results

---

## 9. Tovu Reconstruction Notes

### 9.1 Why this exists

This module exists to turn metadata and permissions into an actual operator workspace. The important lesson is not “Directus has these exact routes.” It is that the editor, list views, preview, and actions are all driven by content-model metadata rather than hardcoded page types.

### 9.2 What Tovu should preserve

- Metadata-driven list/editor behavior
- A stable route and state contract between collection navigation, list state, and item editing
- Permission-aware editing rather than static client assumptions
- Preview integration as part of the editor workflow, not as an afterthought

### 9.3 What Tovu can simplify

- V1 does not need every Directus layout, bookmark, archive, version, and collab feature
- Copy flows can be simpler than Directus as long as relational duplication rules are explicit
- System-collection redirects may map to Tovu module-specific routes instead of Directus-style system collections

### 9.4 Possible Tovu seams

- `src/features/content-item/` for item read/write use cases
- `src/features/content-model/` for metadata and collection/type semantics
- `src/admin-shell/content/` for navigation, list, editor, and preview host surfaces
- `src/core/ports/PreviewPort.ts` for preview URL/render integration

### 9.5 Suggested priority

- `V1`: list + item editor + preview against metadata-backed content types
- `Later`: advanced layouts, versioning UI, collaboration, archive workflows, richer preset/bookmark state
