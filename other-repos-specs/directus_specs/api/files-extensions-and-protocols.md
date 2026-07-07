# Directus Files, Extensions, GraphQL, And MCP

**Source files analyzed:**
- `other-repos/directus/api/src/controllers/files.ts`
- `other-repos/directus/api/src/controllers/extensions.ts`
- `other-repos/directus/api/src/controllers/graphql.ts`
- `other-repos/directus/api/src/controllers/mcp.ts`
- `other-repos/directus/api/src/ai/mcp/server.ts`
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/services/server.ts`

---

## 1. Overview

These surfaces show Directus as more than a CRUD API:

- it ingests and stores files
- it installs and serves extension bundles
- it exposes GraphQL alongside REST
- it exposes an MCP server when enabled

This is where Directus starts to look like a programmable platform, not only a headless CMS.

---

## 2. Files Surface

`controllers/files.ts` mounts against `directus_files`.

### 2.1 Multipart upload contract

The multipart handler is unusually strict.

Important rules:

- only handles multipart when `req.is('multipart/form-data') === true`
- all non-file fields are expected before file streams
- the comment in source explicitly states field order matters

Why this matters:

- Directus needs storage and metadata fields resolved before streaming the file into `FilesService.uploadOne(...)`

### 2.2 Upload constraints

The handler enforces:

- file size limits from `FILES_MAX_UPLOAD_SIZE`
- MIME allow-list using `FILES_MIME_TYPE_ALLOW_LIST`
- filename presence

Rejected uploads throw `InvalidPayloadError`.

### 2.3 Storage selection

Storage location is resolved from:

1. multipart field `storage`, if present
2. otherwise first configured storage location from env

The per-file payload includes:

- inferred or provided title
- `filename_download`
- `type`
- `storage`

### 2.4 Create routes

`POST /files`

Behavior:

- multipart requests upload one or more binary files
- non-multipart requests create a file record via `createOne(req.body)`
- after write, controller re-reads stored records
- for multi-upload, payload returns many records
- for single upload, payload returns one record

### 2.5 Import-by-URL route

`POST /files/import`

Requires:

- `url`

Optional:

- `data`

Behavior:

- validates with Joi
- imports external resource with `FilesService.importOne(url, data)`
- re-reads the resulting file record

### 2.6 Read / update / delete

Supported routes:

- `GET /files`
- `SEARCH /files`
- `GET /files/:pk`
- `PATCH /files`
- `PATCH /files/:pk`
- `DELETE /files`
- `DELETE /files/:pk`

Special note:

- `PATCH /files/:pk` still runs through `multipartHandler`, so the single-file update path can also accept multipart uploads

### 2.7 Resumable uploads

In `app.ts`, TUS routes are mounted at:

- `/files/tus`

only when `TUS_ENABLED === true`.

Server info also reports TUS capability and chunk size when resumable uploads are enabled.

---

## 3. Extensions Surface

`controllers/extensions.ts` serves both installed-extension state and registry interactions.

### 3.1 Installed extensions

Routes:

- `GET /extensions`
- `PATCH /extensions/:pk`
- `DELETE /extensions/:pk`

Installed extension mutation is admin-only.

### 3.2 Marketplace / registry routes

Routes:

- `GET /extensions/registry`
- `GET /extensions/registry/account/:pk`
- `GET /extensions/registry/extension/:pk`
- `POST /extensions/registry/install`
- `POST /extensions/registry/reinstall`
- `DELETE /extensions/registry/uninstall/:pk`

All inspected registry routes require:

- `req.accountability.admin === true`

Registry list supports filtered query parameters including:

- search
- limit
- offset
- sort
- filter by publisher (`by`)
- filter by extension `type`

Marketplace behavior is also env-sensitive:

- registry URL can be overridden
- marketplace trust mode can force sandbox results

### 3.3 App extension source serving

Special route:

- `GET /extensions/sources/:chunk`

Behavior:

- `index.js` resolves to app extension chunk entry
- other chunk names resolve via extension manager
- missing source -> `RouteNotFoundError`
- served as JavaScript
- cache header depends on `EXTENSIONS_CACHE_TTL`

This route is the API-side bridge that lets the admin app load built app extensions.

---

## 4. GraphQL Surface

`controllers/graphql.ts` defines two scopes:

- `/graphql/system`
- `/graphql`

Both routes:

1. run `parseGraphQL`
2. instantiate `GraphQLService`
3. execute parsed params
4. disable cache when payload contains errors

Scope difference:

- `/graphql/system` -> `scope: 'system'`
- `/graphql` -> `scope: 'items'`

This is a direct structural split between:

- GraphQL for system metadata
- GraphQL for user collections and content

---

## 5. MCP Surface

`controllers/mcp.ts` mounts at `/mcp` when `MCP_ENABLED` is truthy.

Supported HTTP methods:

- `GET /mcp`
- `POST /mcp`

### 5.1 Settings-gated enablement

Before constructing the MCP server, the controller reads settings fields:

- `mcp_enabled`
- `mcp_allow_deletes`
- `mcp_prompts_collection`
- `mcp_system_prompt`
- `mcp_system_prompt_enabled`

If `mcp_enabled` is false:

- `ForbiddenError`

### 5.2 Request constraints

From `DirectusMCP.handleRequest(...)`:

- caller must have user, role, or admin accountability
- request must accept `application/json`
- `text/event-stream` is explicitly not supported by current implementation

### 5.3 Capabilities

The MCP server advertises:

- tools
- prompts

Prompt behavior:

- prompts are read from the configured prompts collection
- system prompt and messages are template-rendered with arguments

Tool behavior:

- tool list is filtered by admin visibility and system-prompt settings
- delete capability is configurable

This makes Directus MCP a data-driven tool and prompt server, not only a hardcoded protocol adapter.

---

## 6. Protocol Observations

From the inspected files:

- REST, GraphQL, and MCP are all first-class runtime surfaces
- GraphQL has separate `system` and `items` scopes
- extensions are both:
  - admin-managed records
  - external registry artifacts
  - app-source bundles served by the API
- files are both:
  - metadata records
  - binary ingress pipeline
  - resumable upload surface

---

## 7. Follow-Up Areas

Still needed in later specs:

- assets transformation endpoint internals
- TUS service and locker internals
- AI chat router internals
- websocket REST / GraphQL realtime internals
- extension manager internals and reload lifecycle

---

## 8. Tovu Reconstruction Notes

### 8.1 Why this exists

This file groups the “boundary protocols” that turn Directus from a CRUD API into a platform: binary file ingestion, extension-facing transport surfaces, GraphQL, and MCP-style protocol exposure.

### 8.2 What Tovu should preserve

- Binary content should be treated as more than metadata rows
- Protocol surfaces should remain explicit adapters, not bleed into core content logic
- External-facing machine protocols need their own auth and capability gates
- File ingress, API metadata, and extension/protocol surfaces should remain composable, not collapsed into one monolithic controller

### 8.3 What Tovu can simplify

- V1 does not need every Directus protocol surface
- TUS, MCP, and multiple query protocols can arrive incrementally if their seams are explicit
- File handling can start with a simpler adapter set than Directus as long as metadata/binary separation remains intact

### 8.4 Possible Tovu seams

- `src/features/media/` for file metadata and binary ingress orchestration
- `src/core/ports/BlobStoragePort.ts` for binary storage
- `src/core/ports/ProtocolAdapterPort.ts` for GraphQL/MCP/other machine-facing adapters
- `src/features/extensions/` should consume protocol hooks through ports rather than owning upload/media rules

### 8.5 Suggested priority

- `V1`: media metadata + binary ingress + one primary API protocol
- `Later`: resumable upload, external protocol expansion, richer extension/protocol lifecycle
