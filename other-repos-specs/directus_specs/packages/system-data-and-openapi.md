# Directus System Data And OpenAPI Metadata

**Source files analyzed:**
- `other-repos/directus/packages/specs/src/openapi.yaml`
- `other-repos/directus/packages/system-data/src/collections/collections.yaml`
- `other-repos/directus/packages/system-data/src/fields/index.ts`
- `other-repos/directus/packages/system-data/src/fields/*.yaml` inventory

---

## 1. Why These Packages Matter

If the API controllers tell you how requests are handled, these packages tell you what Directus considers canonical:

- `packages/specs/` describes the public API contract
- `packages/system-data/` describes the system-owned collections, fields, and relations

Ignoring these packages would miss the platform's own declared contract surface.

---

## 2. OpenAPI Package

The inspected OpenAPI root document declares:

- `openapi: 3.0.1`
- product title `Directus`
- external docs at `https://docs.directus.io`

### 2.1 Tag families

The top-level tags include:

- Activity
- Assets
- Authentication
- Presets
- Collections
- Comments
- Extensions
- Fields
- Files
- Flows
- Folders
- Items
- Operations
- Permissions
- Relations
- Revisions
- Roles
- Schema
- Server
- Settings
- Users
- Utilities
- Versions

Several tags include `x-collection` metadata tying the API family back to a system collection.

### 2.2 Path families

The inspected OpenAPI paths cover:

- auth login / refresh / logout / password
- items
- collections
- comments
- extensions
- fields
- files
- flows
- folders
- operations
- permissions
- relations
- revisions
- roles
- schema snapshot / apply / diff
- server info / ping
- settings
- users
- versions

This package is therefore the API-side index of the Directus product surface.

---

## 3. System Collections Package

`packages/system-data/src/collections/collections.yaml` defines the built-in system collections, including defaults such as:

- hidden
- singleton
- icon
- note
- display template
- accountability mode

This is not documentation only. It is product-owned metadata.

### 3.1 Examples from inspected data

- `directus_settings` is a singleton
- `directus_users` has archive semantics and a display template
- `directus_activity` sets `accountability: null`
- `directus_access`, `directus_permissions`, and `directus_policies` are explicit system collections
- `directus_flows`, `directus_operations`, and `directus_versions` are first-class system collections

---

## 4. System Fields Package

The field inventory under `packages/system-data/src/fields/` includes YAML for:

- access
- activity
- collections
- comments
- dashboards
- deployment*
- extensions
- fields
- files
- flows
- folders
- notifications
- operations
- panels
- permissions
- policies
- presets
- relations
- revisions
- roles
- sessions
- settings
- shares
- translations
- users
- versions

`fields/index.ts` imports and processes these field YAML definitions.

This means system field definitions are centrally assembled from declarative sources rather than being implied only by migrations or services.

---

## 5. Why This Belongs In The Spec Corpus

These packages answer questions that controller-only inspection cannot:

- which resources are truly product-owned
- which API families are first-class and versioned
- which resources are singleton vs regular collection
- which UI metadata belongs to system collections
- which fields exist on important system tables such as policies, flows, versions, and settings

For Tovu, these files are especially useful because they show how a data platform can declare its own internal schema in structured metadata instead of burying it inside service code.

---

## 6. Follow-Up Depth Needed

Second-pass specs should inspect:

- the `paths/` files referenced by OpenAPI
- `relations/relations.yaml`
- important field YAML files individually:
  - `policies.yaml`
  - `users.yaml`
  - `roles.yaml`
  - `flows.yaml`
  - `operations.yaml`
  - `versions.yaml`
  - `settings.yaml`

---

## 7. Tovu Reconstruction Notes

### 7.1 Why this exists

This metadata exists so the platform can declare its own internal schema and public contract surfaces explicitly instead of burying that information inside migrations and service code.

### 7.2 What Tovu should preserve

- Internal system entities should be declared as product-owned metadata, not inferred only from runtime code
- Public contract artifacts should have an explicit source of truth
- System collection/field semantics should be inspectable by the admin shell and operational tooling

### 7.3 What Tovu can simplify

- V1 does not need as much declarative inventory as Directus
- Tovu can begin with structured metadata for the most important internal entities only
- OpenAPI or other contract artifacts can remain smaller as long as they are explicit

### 7.4 Possible Tovu seams

- `src/admin-shell/` for consuming shared internal metadata
- `src/headless/` for public contract definitions
- `src/core/` for internal system entity metadata and invariants

### 7.5 Suggested priority

- `V1`: explicit metadata for core system entities and public contracts
- `Later`: broader declarative inventory, generated system-data tooling, richer contract emission
