# Directus Activity, Comments, Notifications, And Revisions

**Source files analyzed:**
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/controllers/activity.ts`
- `other-repos/directus/api/src/controllers/comments.ts`
- `other-repos/directus/api/src/controllers/notifications.ts`
- `other-repos/directus/api/src/controllers/revisions.ts`
- `other-repos/directus/api/src/controllers/utils.ts`
- `other-repos/directus/api/src/services/activity.ts`
- `other-repos/directus/api/src/services/comments.ts`
- `other-repos/directus/api/src/services/notifications.ts`
- `other-repos/directus/api/src/services/revisions.ts`
- `other-repos/directus/api/src/services/meta.ts`
- `other-repos/directus/packages/system-data/src/collections/collections.yaml`
- `other-repos/directus/packages/system-data/src/app-access-permissions/app-access-permissions.yaml`
- `other-repos/directus/packages/system-data/src/fields/activity.yaml`
- `other-repos/directus/packages/system-data/src/fields/comments.yaml`
- `other-repos/directus/packages/system-data/src/fields/notifications.yaml`
- `other-repos/directus/packages/system-data/src/fields/revisions.yaml`

---

## 1. Scope

These four system collections are tightly coupled in runtime behavior:

- `directus_activity`
- `directus_comments`
- `directus_notifications`
- `directus_revisions`

They are mounted as ordinary REST resources, but they are not ordinary content collections. Activity is read-only. Comments and notifications have side effects. Revisions can be read through their controller and reverted through the utilities route.

The packaged OpenAPI corpus covers activity, comments, and revisions, but it does not include notifications.

---

## 2. Shared Patterns

All four controllers are mounted from `api/src/app.ts` under their collection names.

They all use the same Directus controller shape:

- `useCollection('directus_*')` to bind the system collection context
- `respond` to serialize the payload
- `validateBatch()` when batch read/update/delete is supported
- `MetaService` when list responses need metadata

The service layer follows the same inheritance pattern too:

- `ActivityService`, `CommentsService`, `NotificationsService`, and `RevisionsService` all extend `ItemsService`

That means the controllers mostly express route semantics, while the business rules live in the service classes.

---

## 3. Activity

`api/src/controllers/activity.ts` is read-only.

Mounted routes:

- `GET /activity`
- `SEARCH /activity`
- `GET /activity/:pk`

Behavior:

- list routes can read by query, by keys, or as a singleton if the collection is marked singleton
- list responses include `meta` from `MetaService`
- detail responses return `data` or `null`

`api/src/services/activity.ts` adds no custom business logic beyond binding to `directus_activity`.

The system-data definition marks activity as a normal system collection with `accountability: null`, which matches its audit-log nature.

---

## 4. Comments

`api/src/controllers/comments.ts` is the busiest of the four controllers.

Mounted routes:

- `POST /comments`
- `GET /comments`
- `SEARCH /comments`
- `GET /comments/:pk`
- `PATCH /comments`
- `PATCH /comments/:pk`
- `DELETE /comments`
- `DELETE /comments/:pk`

### 4.1 Read and mutation shape

The list routes support:

- query reads
- keyed reads
- metadata enrichment

The update and delete routes support:

- batch arrays
- explicit `keys`
- query-based mutation after `sanitizeQuery()`

### 4.2 Side effects

`CommentsService.createOne()` is where the interesting behavior lives.

It enforces:

- authenticated user requirement
- required `comment`, `collection`, and `item` fields
- read access to the target item before the comment can be created

After creation, it scans the comment text for `@<uuid>` mentions. For each mention:

- it loads the sender and mentioned user
- it checks whether the mentioned user can actually read the referenced item
- it creates a notification for the mentioned user

If the notification path is forbidden for a mentioned user, the service logs a warning and keeps going.

This is an important runtime contract:

- the comment write succeeds independently of mention delivery
- notification delivery is best-effort, not transactional with the original comment write

`CommentsService.updateOne()` and `deleteOne()` also require an authenticated user.

---

## 5. Notifications

`api/src/controllers/notifications.ts` mirrors the comments controller shape, but it is less visible in the OpenAPI corpus.

Mounted routes:

- `POST /notifications`
- `GET /notifications`
- `SEARCH /notifications`
- `GET /notifications/:pk`
- `PATCH /notifications`
- `PATCH /notifications/:pk`
- `DELETE /notifications`
- `DELETE /notifications/:pk`

### 5.1 Read semantics

List reads support the same query/key/singleton flow as comments, with `MetaService` for list metadata.

### 5.2 Email side effect

`NotificationsService.createOne()` overrides the base item create path to send email after persisting the notification.

The mail flow is conditional:

- the recipient must exist
- the recipient must have an email address
- `email_notifications` must be enabled

The rendered email body also depends on whether the recipient has app access, so the service uses global access checks before selecting the mail template data.

This makes notifications a data record plus a delivery workflow, not just a table write.

### 5.3 OpenAPI gap

There is no `notifications` path family in `packages/specs/src/openapi.yaml` or in the packaged path tree. Runtime supports it; the static OpenAPI corpus does not.

---

## 6. Revisions

`api/src/controllers/revisions.ts` is read-only at the controller layer.

Mounted routes:

- `GET /revisions`
- `SEARCH /revisions`
- `GET /revisions/:pk`

`RevisionsService` adds two important behaviors:

- `revert(pk)` re-applies the stored revision data to the target collection item
- create and update operations force `autoPurgeCache: false` and `bypassLimits: true`

Those options matter because revisions are created by system machinery, not by a normal user workflow.

### 6.1 Where revert is actually exposed

`revert()` is not exposed on the revisions controller. It is wired through `POST /utils/revert/:revision` in `api/src/controllers/utils.ts`, and it is also available through the GraphQL system mutation path.

That means the controller file and the operational capability are split across two surfaces.

### 6.2 Data model

`directus_revisions` stores:

- `activity`
- `collection`
- `item`
- `data`
- `delta`
- `parent`
- `version`

The field YAML marks `data` and `delta` as hidden JSON fields, which lines up with the service treating revisions as structured payload snapshots rather than user-facing content.

---

## 7. Notable Contract Edges

- Activity and revisions are read-only at the REST controller level.
- Comments are permission-sensitive and can create notifications as a side effect.
- Notifications can trigger email delivery, so they are not just persistence records.
- The app-access permission data has a hardcoded filter note for activity, comments, fields, presets, relations, and revisions, which is why these collections behave specially in the UI and API.
- Notifications are runtime-supported but missing from the packaged OpenAPI document.

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

These surfaces exist because platform activity, collaboration comments, operator notifications, and revision history are operational records, not ordinary content. They explain what happened, who did it, and what can be recovered.

### 8.2 What Tovu should preserve

- A clear distinction between user content and system audit/revision records
- Notification side effects as explicit workflow behavior rather than hidden persistence hooks
- Revision and activity history as first-class recovery and traceability primitives
- Read-heavy operational records with carefully scoped mutation paths

### 8.3 What Tovu can simplify

- V1 does not need every Directus record family
- Comments and notifications can start narrower than Directus as long as audit and recovery semantics stay explicit
- OpenAPI/spec parity for operational records can come later if the runtime/data model is sound

### 8.4 Possible Tovu seams

- `src/features/activity/` for audit/event timeline records
- `src/features/revisions/` for revision history and revert behavior
- `src/features/notifications/` for operator-facing notifications and delivery workflows
- `src/core/ports/NotificationDeliveryPort.ts` for email or other delivery adapters

### 8.5 Suggested priority

- `V1`: activity timeline, revisions/recovery, minimal operator notifications
- `Later`: richer comments, expanded delivery channels, deeper system-record APIs
