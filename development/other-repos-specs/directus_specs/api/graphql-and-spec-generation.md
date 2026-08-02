# Directus GraphQL And Spec Generation

**Source files analyzed:**
- `other-repos/directus/api/src/controllers/graphql.ts`
- `other-repos/directus/api/src/middleware/graphql.ts`
- `other-repos/directus/api/src/services/graphql/index.ts`
- `other-repos/directus/api/src/services/graphql/schema/index.ts`
- `other-repos/directus/api/src/services/graphql/schema/read.ts`
- `other-repos/directus/api/src/services/graphql/schema/write.ts`
- `other-repos/directus/api/src/services/graphql/schema-cache.ts`
- `other-repos/directus/api/src/services/graphql/subscription.ts`
- `other-repos/directus/api/src/services/graphql/resolvers/query.ts`
- `other-repos/directus/api/src/services/graphql/resolvers/mutation.ts`
- `other-repos/directus/api/src/services/graphql/resolvers/system.ts`
- `other-repos/directus/api/src/services/graphql/resolvers/system-global.ts`
- `other-repos/directus/api/src/services/graphql/resolvers/system-admin.ts`
- `other-repos/directus/api/src/services/graphql/errors/*.ts`
- `other-repos/directus/api/src/services/graphql/utils/*.ts`
- `other-repos/directus/api/src/services/specifications.ts`
- `other-repos/directus/api/src/controllers/server.ts`
- `other-repos/directus/api/src/websocket/controllers/graphql.ts`
- `other-repos/directus/api/src/websocket/controllers/index.ts`
- `other-repos/directus/api/src/middleware/respond.ts`
- `other-repos/directus/packages/specs/src/openapi.yaml`

---

## 1. Scope

Directus has three related GraphQL-facing behaviors:

- the HTTP GraphQL API at `/graphql` and `/graphql/system`
- runtime GraphQL SDL generation through `/server/specs/graphql/:scope?`
- websocket GraphQL subscriptions through the realtime controller

The important architectural point is that the runtime GraphQL schema is generated from the live project schema and accountability context. It is not a static schema file baked into the package.

---

## 2. HTTP GraphQL Surface

`api/src/controllers/graphql.ts` exposes two routes:

- `GET|POST /graphql`
- `GET|POST /graphql/system`

Both routes use the same `parseGraphQL` middleware and the same `GraphQLService.execute(...)` path. The only difference is the scope passed into the service:

- `/graphql` -> `scope: 'items'`
- `/graphql/system` -> `scope: 'system'`

### 2.1 Request parsing

`api/src/middleware/graphql.ts` accepts only `GET` and `POST`.

Behavior:

- `GET` requests read `query`, `variables`, and `operationName` from the query string
- `POST` requests read the same fields from the JSON body
- missing `query` throws `InvalidPayloadError`
- malformed `variables` on `GET` throws `InvalidQueryError`
- the parser uses `GRAPHQL_QUERY_TOKEN_LIMIT` when parsing the document

The middleware also inspects the parsed operation:

- `GET` requests cannot execute mutations
- mutation operations set `res.locals.cache = false`

That means GraphQL queries can participate in the normal HTTP cache layer, but mutations are explicitly marked as non-cacheable.

### 2.2 Response handling

The controller executes the parsed params, stores the result in `res.locals.payload`, and passes control to `respond`.

If the payload contains errors, the controller also sets `res.locals.cache = false`.

So the HTTP behavior is:

- successful query responses may be cached if the normal cache conditions are met
- mutation responses are not cached
- error responses are not cached

`api/src/middleware/respond.ts` treats any URL that starts with `/graphql` as eligible for the cache path, but only when the rest of the cache rules pass and `res.locals.cache !== false`.

---

## 3. GraphQLService Execution Model

`api/src/services/graphql/index.ts` is the core executor.

It does three things:

1. builds or retrieves the schema for the current scope and accountability
2. validates the incoming document against the generated schema
3. executes the operation and formats errors

### 3.1 Validation

Validation uses the standard GraphQL rules plus an optional introspection ban.

If `GRAPHQL_INTROSPECTION === false`, the service adds `NoSchemaIntrospectionCustomRule`.

So introspection is environment-controlled rather than hard-coded.

### 3.2 Error formatting

The service converts validation and execution failures into Directus-specific errors:

- `GraphQLValidationError`
- `GraphQLExecutionError`

During execution, result errors are post-processed through `processError(...)`.

That formatting has a notable contract:

- Directus errors keep their original code and message
- admin callers can see raw unexpected GraphQL errors
- non-admin callers get a generic `An unexpected error occurred.`

This keeps the GraphQL API usable without leaking internal exception detail to regular users.

---

## 4. Schema Generation

The schema generator lives in `api/src/services/graphql/schema/index.ts`.

It is scope-aware, permission-aware, and cached.

### 4.1 Live schema sanitation

Before type generation, the service sanitizes the schema with `sanitizeGraphqlSchema(...)`.

This removes invalid collection and relation names that would break GraphQL schema construction, including:

- names that do not match the GraphQL identifier regex
- names that start with `__`
- reserved names like `Query`, `Mutation`, `String`, `Int`, and other GraphQL footguns

Invalid relations are also dropped when they point at removed or invalid collections.

### 4.2 Permission reduction

For non-admin callers, the schema is reduced per action:

- read
- create
- update
- delete

The reduction uses:

- `fetchAllowedFieldMap(...)`
- `fetchInconsistentFieldMap(...)`
- `reduceSchema(...)`

That means the generated GraphQL schema is not just shaped by the database schema. It is also shaped by the caller's permissions and field consistency for each action.

### 4.3 Scope filtering

The generated schema is further filtered by scope:

- `items` scope excludes system collections
- `system` scope includes only system collections
- `SYSTEM_DENY_LIST` removes collections like `directus_collections`, `directus_fields`, `directus_relations`, `directus_migrations`, `directus_sessions`, and `directus_extensions`

There is also a read-only set:

- `directus_activity`
- `directus_revisions`

Those collections are read-only in GraphQL mutation generation.

### 4.4 Resolver assembly

The schema generator builds four sets of collection types:

- read types
- create types
- update types
- delete types

For readable collections it adds:

- the base collection field
- `collection_by_id` for non-singletons
- `collection_aggregated` for non-singletons
- `collection_by_version` in `items` scope only

For writable collections it adds mutation fields like:

- `create_<collection>_items`
- `create_<collection>_item`
- `update_<collection>_item`
- `update_<collection>_items`
- `update_<collection>_batch`
- `delete_<collection>_item`
- `delete_<collection>_items`

Singleton collections are handled specially through upsert behavior.

---

## 5. Query And Mutation Resolution

The resolver layer translates GraphQL AST into Directus service calls.

### 5.1 Query resolution

`api/src/services/graphql/resolvers/query.ts` does the GraphQL-to-Directus translation.

It:

- resolves the collection name from the field name
- strips the `directus_` prefix in `system` scope
- expands fragments and nested selection sets
- converts aliases into Directus query aliases
- converts nested args into Directus `deep` query structure
- converts aggregate fields into aggregate queries

Important behaviors:

- `_func` fields are transformed into function-call fields like `sum(count)`
- `count(a.b.c)` style paths are normalized through `parseFilterFunctionPath(...)`
- many-to-any relations are rewritten with `filterReplaceM2A(...)`
- nested arguments are sanitized before being embedded in the query

The result is executed through `GraphQLService.read(...)`, which chooses between:

- `readSingleton(...)`
- `readOne(...)`
- `readByQuery(...)`

### 5.2 Mutation resolution

`api/src/services/graphql/resolvers/mutation.ts` routes GraphQL mutations into service calls.

It supports:

- create-one
- create-many
- update-one
- update-many
- batch update
- delete-one
- delete-many
- singleton upsert

Return shape depends on whether the selection set asked for fields:

- if fields were selected, the resolver re-reads the affected records
- if no fields were selected, it often returns `true`

That is an intentional contract: GraphQL mutation output is normalized through the same read path clients use elsewhere.

### 5.3 Singleton behavior

Singleton collections are not treated like normal collections.

For singleton updates, `GraphQLService.upsertSingleton(...)` is used instead of the regular update flow.

---

## 6. System Scope

`/graphql/system` is not just a namespace variant. It adds a large set of system-level resolvers on top of the generated schema.

### 6.1 Global system queries and mutations

`api/src/services/graphql/resolvers/system-global.ts` injects global operations such as:

- `auth_login`
- `auth_refresh`
- `auth_logout`
- `auth_password_request`
- `auth_password_reset`
- `users_me_tfa_generate`
- `users_me_tfa_enable`
- `users_me_tfa_disable`

It also exposes system-facing reads like:

- `server_info`
- `server_health`
- `server_ping`
- `server_specs_oas`
- `server_specs_graphql`

These are the GraphQL equivalents of the server introspection and spec routes.

### 6.2 Admin-only system mutations

`api/src/services/graphql/resolvers/system-admin.ts` only registers when the caller is an admin.

It adds mutation support for:

- collections
- fields
- relations

Notable guardrails:

- system field updates are restricted to `schema.is_indexed` unless the field is not a core system field
- `concurrentIndexCreation` is supported and defaults to `false`
- mutation results are re-read after write

### 6.3 System query conveniences

`api/src/services/graphql/resolvers/system.ts` also exposes convenience reads like:

- `collections`
- `collections_by_name`
- `fields`
- `fields_in_collection`
- `fields_by_name`
- `relations`
- `relations_in_collection`
- `relations_by_name`
- `users_me`
- `permissions_me`
- `roles_me`
- `policies_me_globals`
- `import_file`
- `users_invite`
- `update_users_me`

These resolvers are direct service wrappers, but they are only attached when the relevant system collections exist in the current schema.

---

## 7. Runtime Caching

GraphQL has two distinct caching layers.

### 7.1 Schema cache

`api/src/services/graphql/schema-cache.ts` stores generated schemas in an LRU map.

Keying:

- scope
- return type (`schema` or `sdl`)
- role
- user

The cache is cleared when the bus emits `schemaChanged`.

Cache size is controlled by `GRAPHQL_SCHEMA_CACHE_CAPACITY`.

### 7.2 HTTP response cache

The GraphQL controller participates in the shared HTTP response cache system through `respond`.

Relevant behavior:

- GET requests can cache if normal cache rules pass
- `/graphql` requests are treated as cache-eligible by the middleware
- mutations disable cache
- GraphQL execution errors disable cache

This is runtime response caching, not schema caching. The two concerns are separate.

### 7.3 Generation concurrency

Schema generation is guarded by a semaphore.

`GRAPHQL_SCHEMA_GENERATION_MAX_CONCURRENT` limits how many schema builds can run at once.

That matters because GraphQL schema generation is not free. It is live, permission-sensitive work.

---

## 8. GraphQL Subscriptions And WebSockets

`api/src/websocket/controllers/graphql.ts` mounts the GraphQL websocket server when GraphQL websockets are enabled.

The websocket controller is tightly related to the GraphQL service, but it does not expose the full schema family equally.

### 8.1 Current subscription scope

The controller currently builds a GraphQL service with:

- `scope: 'items'`

The source comment makes the limitation explicit:

- only items are watched for now
- system events are still TBD

### 8.2 Pub/Sub bridge

`api/src/services/graphql/subscription.ts` binds the websocket bus to GraphQL subscription events.

Flow:

1. websocket events are published on `websocket.event`
2. the subscription layer maps them into `<collection>_mutated` events
3. GraphQL subscriptions stream create/update/delete payloads from that event feed

The subscription generator:

- parses the requested field selection
- filters by `event` if the subscription asked for a specific event type
- suppresses permission errors rather than leaking them to subscribers

Delete events only carry keys and null data. Create and update events attempt to re-read payloads through the same GraphQL payload path used elsewhere.

### 8.3 Relationship to HTTP GraphQL

The websocket GraphQL transport shares the same schema generation and resolver machinery as the HTTP API.

So the subscription layer is not a separate GraphQL implementation. It is a transport wrapper over the same live schema system.

---

## 9. Live Spec Generation

Directus exposes live spec generation from the server controller and from GraphQL system resolvers.

### 9.1 GraphQL SDL generation

`api/src/controllers/server.ts` exposes:

- `GET /server/specs/graphql/:scope?`

The route:

- accepts `items` or `system`
- defaults to `items`
- rejects other scope values with `RouteNotFoundError`
- returns a `.graphql` attachment named from the project and current date

The implementation uses `SpecificationService.graphql.generate(scope)`, which delegates directly to `GraphQLService.getSchema('sdl')`.

### 9.2 GraphQL spec through GraphQL

`api/src/services/graphql/resolvers/system.ts` exposes the same live generation via:

- `server_specs_graphql`
- `server_specs_oas`

That is the clearest sign that spec generation is a first-class runtime capability, not an admin-only convenience route.

### 9.3 No packaged GraphQL spec corpus

Unlike OpenAPI, the Directus package corpus does not contain a static GraphQL SDL file.

The runtime SDL is generated directly from the live schema, accountability, and scope.

---

## 10. Runtime Vs Packaged Specs

This is the contract boundary that matters most.

### 10.1 Packaged OpenAPI corpus

`packages/specs/src/openapi.yaml` is the curated contract corpus.

It is the source of truth for the runtime OAS generator, but it is not itself the runtime spec.

### 10.2 Runtime OAS generation

`SpecificationService.oas.generate(...)` builds a live OpenAPI document from:

- the current schema
- current permissions
- current accountability
- host context

It filters non-admin callers down to allowed fields and permissions, rewrites generic item paths for live collections, and hashes the version using current time plus user id.

### 10.3 What runtime OAS cannot express

The runtime OAS generator inherits the limits of the static corpus.

It does not represent everything the server can do, including:

- websocket upgrade routes
- GraphQL transport endpoints
- GraphQL subscription behavior
- runtime spec endpoints themselves
- other runtime-only controllers not present in the static corpus

### 10.4 Why GraphQL is different

GraphQL lives in a split model:

- the HTTP API is live and scope-aware
- the SDL is generated live from the schema service
- the static package does not ship a GraphQL spec document

So GraphQL is more dynamic than the packaged OpenAPI contract and should be treated as a runtime projection of the current Directus project state.

---

## 11. Notable Gaps

- The HTTP GraphQL routes are runtime surfaces and are not documented in the packaged OpenAPI corpus.
- The GraphQL websocket transport is currently limited to the items scope.
- Schema generation is live and permission-aware, so the generated SDL can vary per user and per role.
- The runtime OAS projection cannot describe transport-only surfaces like websocket subscriptions.
- Caching behavior depends on both GraphQL operation type and the shared HTTP cache middleware.
- Static packaged specs remain the contract corpus, but the live GraphQL SDL is generated from the current project schema rather than from a bundled artifact.

---

## 12. Tovu Reconstruction Notes

### 12.1 Why this exists

This subsystem exists because a data platform needs more than REST CRUD. GraphQL and live spec generation let the current schema become queryable and introspectable without freezing the product into one transport shape.

### 12.2 What Tovu should preserve

- Runtime query surfaces should derive from the current content model, not a stale baked artifact
- Public contract generation should stay tied to real schema/capability state
- Transport concerns and contract concerns should stay separate
- Permission-aware schema projection matters if Tovu exposes dynamic query surfaces

### 12.3 What Tovu can simplify

- V1 does not need GraphQL if the headless REST/HTTP contract is strong
- Live SDL/spec generation can come later
- Tovu should avoid adopting GraphQL just to match Directus unless it solves a real product need

### 12.4 Possible Tovu seams

- `src/headless/` for transport-neutral contract definitions
- `src/core/ports/QuerySurfacePort.ts` if Tovu later supports multiple query transports
- `src/core/ports/SpecGenerationPort.ts` for generated contract/docs output

### 12.5 Suggested priority

- `V1`: strong explicit headless contract, no mandatory GraphQL
- `Later`: dynamic query transport, generated SDL/spec views, richer introspection surfaces
