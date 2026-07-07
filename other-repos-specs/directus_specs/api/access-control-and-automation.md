# Directus Access Control And Automation

**Source files analyzed:**
- `other-repos/directus/api/src/controllers/permissions.ts`
- `other-repos/directus/api/src/controllers/policies.ts`
- `other-repos/directus/api/src/controllers/flows.ts`
- `other-repos/directus/api/src/controllers/operations.ts`
- `other-repos/directus/packages/system-data/src/collections/collections.yaml`
- `other-repos/directus/packages/system-data/src/fields/policies.yaml`
- `other-repos/directus/packages/system-data/src/fields/flows.yaml`
- `other-repos/directus/packages/system-data/src/fields/operations.yaml`

---

## 1. Overview

This group of surfaces defines two of Directus's strongest non-trivial capabilities:

1. fine-grained access control through permissions and policies
2. event-driven automation through flows and operations

These are not side features. The system-data model treats them as first-class system collections:

- `directus_permissions`
- `directus_policies`
- `directus_flows`
- `directus_operations`
- `directus_access`

---

## 2. Permissions Surface

`controllers/permissions.ts` mounts against `directus_permissions`.

### 2.1 CRUD pattern

The permissions controller follows the standard Directus admin CRUD pattern:

- create one or many
- read list or keyed selection
- read one
- update batch or one
- delete batch or one

Like other controllers, it re-reads created or updated records after write.

### 2.2 Temporary query behavior

The read handler contains an explicit temporary workaround:

- it clones `req.sanitizedQuery` and forces `limit: -1`

The comment references a missing-permissions issue and labels this as a temporary fix.

That is important spec material because it means current behavior is not a pure pass-through of the sanitized query contract.

### 2.3 Self-inspection endpoints

Permissions exposes two user-centric introspection routes:

#### `GET /permissions/me`

Behavior:

- requires `req.accountability.user`, `role`, or `share`
- calls `fetchAccountabilityCollectionAccess(...)`
- returns the caller's collection-level access profile

#### `GET /permissions/me/:collection/:pk?`

Behavior:

- uses `PermissionsService.getItemPermissions(collection, pk)`
- returns per-item permission data

This means Directus does not only store permission rules. It also exposes "what can I do?" resolution endpoints.

---

## 3. Policies Surface

`controllers/policies.ts` mounts against `directus_policies`.

### 3.1 CRUD pattern

The controller follows the same standard pattern:

- create one or many
- read list or keyed selection
- read one
- update batch or one
- delete batch or one

### 3.2 `GET /policies/me/globals`

This is the key special route.

Behavior:

- requires authenticated user or role
- calls `fetchAccountabilityPolicyGlobals(...)`

Special nuance:

- if the underlying result is forbidden, the controller does not throw that error to the client
- instead, it returns:
  - `{ data: { app_access: false } }`

So the route is designed to answer capability state even in denied contexts.

### 3.3 Difference from permissions

From the inspected controllers:

- permissions are about access records and collection/item capabilities
- policies are about global policy-derived state, including app access

The existence of both surfaces suggests Directus now separates low-level permission rules from higher-level policy assignment and evaluation.

---

## 4. Flows Surface

`controllers/flows.ts` mounts against `directus_flows`.

### 4.1 CRUD routes

The controller supports:

- `POST /flows`
- `GET /flows`
- `SEARCH /flows`
- `GET /flows/:pk`
- `PATCH /flows`
- `PATCH /flows/:pk`
- `DELETE /flows`
- `DELETE /flows/:pk`

Writes use the same create/update then re-read pattern as other controllers.

### 4.2 Webhook trigger endpoint

Special route:

- `GET /flows/trigger/:pk`
- `POST /flows/trigger/:pk`

with UUID-only primary key matching.

Behavior:

1. call `flowManager.runWebhookFlow(...)`
2. use composite key `${req.method}-${req.params.pk}` as trigger identity
3. pass request path, query, body, method, and headers
4. pass accountability and schema
5. receive `{ result, cacheEnabled }`
6. disable cache for the response if `cacheEnabled` is false
7. return `result` directly as payload

This is an important distinction:

- normal flow CRUD manages flow definitions
- trigger routes execute a flow as a live webhook endpoint

---

## 5. Operations Surface

`controllers/operations.ts` mounts against `directus_operations`.

It exposes the same CRUD pattern as flows, but without a trigger endpoint.

That matches the product model:

- flows are orchestration graphs
- operations are reusable executable nodes within those graphs

The controller behavior suggests operations are administered like content records, but executed through flows rather than directly through an operations runtime endpoint.

---

## 6. Architectural Shape

From these controllers and the inspected system-data metadata:

- access control is not one table and one route
- app-access eligibility can be resolved separately from raw permissions
- automation is stored in database-backed system collections
- flow execution can be triggered through HTTP webhooks
- cache participation is part of flow execution result semantics

This means Directus treats both authorization and automation as data-driven subsystems, not hardcoded service configuration.

---

## 7. Follow-Up Work Still Needed

Second-pass specs should inspect:

- `PermissionsService`
- `PoliciesService`
- `AccessService`
- flow manager internals
- operation execution internals
- `api/src/operations/*`
- how `directus_access` participates in runtime evaluation

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

Directus separates authorization from automation because both shape what the platform is allowed to do, but they are different problems:

- access answers what the actor may see or mutate
- automation answers what the system may execute in response to events or webhooks

The UI and runtime both depend on explicit capability resolution rather than hidden server-side assumptions.

### 8.2 What Tovu should preserve

- A first-class capability evaluation surface for the admin shell
- Clear separation between policy assignment, effective access, and execution-time automation
- Data-driven automation definitions rather than hardcoded one-off workflows in controllers
- The ability for UI behavior to follow permission results instead of duplicating policy logic locally

### 8.3 What Tovu can simplify

- V1 does not need the full Directus permission/policy/access table split if the conceptual seams remain separate
- Flow graphs and operation catalogs can start smaller than Directus
- Webhook-triggered automation can arrive after event-driven internal automation if the port boundary is already in place

### 8.4 Possible Tovu seams

- `src/features/access/` for policy evaluation and capability reads
- `src/features/automation/` for flow/workflow orchestration
- `src/core/ports/AccessPolicyPort.ts` for effective access resolution
- `src/core/ports/AutomationRuntimePort.ts` for event/webhook execution

### 8.5 Suggested priority

- `V1`: effective capability API, permission-aware admin shell, internal event automation seam
- `Later`: full flow graph authoring, webhook-triggered automations, richer policy composition
