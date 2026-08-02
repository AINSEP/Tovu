# Directus Realtime WebSockets And Collab

**Source files analyzed:**
- `other-repos/directus/api/src/server.ts`
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/websocket/controllers/index.ts`
- `other-repos/directus/api/src/websocket/controllers/base.ts`
- `other-repos/directus/api/src/websocket/controllers/rest.ts`
- `other-repos/directus/api/src/websocket/controllers/graphql.ts`
- `other-repos/directus/api/src/websocket/controllers/logs.ts`
- `other-repos/directus/api/src/websocket/handlers/index.ts`
- `other-repos/directus/api/src/websocket/handlers/heartbeat.ts`
- `other-repos/directus/api/src/websocket/handlers/items.ts`
- `other-repos/directus/api/src/websocket/handlers/subscribe.ts`
- `other-repos/directus/api/src/websocket/handlers/logs.ts`
- `other-repos/directus/api/src/websocket/authenticate.ts`
- `other-repos/directus/api/src/websocket/messages.ts`
- `other-repos/directus/api/src/websocket/types.ts`
- `other-repos/directus/api/src/websocket/collab/collab.ts`
- `other-repos/directus/api/src/websocket/collab/room.ts`
- `other-repos/directus/api/src/websocket/collab/messenger.ts`
- `other-repos/directus/api/src/websocket/collab/constants.ts`

---

## 1. Scope

Directus has three distinct realtime surfaces, all mounted from the same boot path:

- a REST-style websocket transport for item CRUD, subscriptions, and heartbeat
- a GraphQL subscription transport
- a logs stream websocket restricted to admins

On top of those transports, collaborative editing adds its own room manager, cross-instance bus, and shared-memory registry.

The important implementation detail is that all of this is runtime-only. None of the websocket endpoints are declared in the packaged OpenAPI document.

---

## 2. Boot Order And Conditional Mounting

The websocket stack is created in `api/src/server.ts`, not in the route controllers themselves.

`createServer()` does the following when `WEBSOCKETS_ENABLED === true`:

1. `createSubscriptionController(server)`
2. `createWebSocketController(server)`
3. `createLogsController(server)`
4. `startWebSocketHandlers()`

That means the transport controllers are created first, then the message handlers are registered.

`api/src/app.ts` does not mount websocket routes directly. It only mounts the normal HTTP routes and the websocket controllers attach through the Node HTTP `upgrade` event.

The handler bootstrap in `api/src/websocket/handlers/index.ts` is also conditional:

- `HeartbeatHandler` only starts when REST websockets and heartbeat are enabled
- `ItemsHandler` starts when REST or GraphQL websockets are enabled
- `SubscribeHandler` starts only for REST websockets
- `LogsHandler` starts only for logs websockets
- `CollabHandler` starts only when collaborative editing is enabled

This is a useful distinction:

- transport availability is controlled by `WEBSOCKETS_*` flags
- collaborative editing is controlled by `WEBSOCKETS_COLLAB_ENABLED` plus the `directus_settings.collaborative_editing_enabled` runtime setting

---

## 3. Transport Controllers

### 3.1 REST websocket transport

`api/src/websocket/controllers/rest.ts` exposes the main websocket transport.

Key runtime behaviors:

- endpoint and auth mode are read from `WEBSOCKETS_REST_*`
- connection auth supports `public`, `handshake`, and `strict`
- the controller registers on HTTP `upgrade`
- successful connections get a `parsed-message` stream that is filtered through `emitter.emitFilter('websocket.message', ...)`
- `websocket.connect`, `websocket.message`, `websocket.error`, and `websocket.close` are emitted as lifecycle events

The base upgrade logic in `api/src/websocket/controllers/base.ts` enforces:

- max connection limits
- auth token extraction from query string or session cookie
- handshake auth timeout
- IP, user-agent, and origin propagation into accountability overrides
- invalid frame shielding so malformed websocket input does not crash the API

### 3.2 GraphQL subscription transport

`api/src/websocket/controllers/graphql.ts` mounts the GraphQL websocket server.

Notable differences from REST:

- only the items scope is actually watched today
- handshake mode is enforced by the `connection_init` flow
- strict mode rejects unauthenticated clients immediately
- `bindPubSub()` hooks the websocket transport into the internal event bus

The controller also uses `GraphQLService` to build the schema dynamically for the current accountability context.

### 3.3 Logs transport

`api/src/websocket/controllers/logs.ts` is the admin-only websocket stream for logs.

Important constraints:

- authentication mode is forced to `strict`
- only admins are allowed through `checkUserRequirements()`
- log level subscriptions are filtered through `getAllowedLogLevels()`

This transport is not a generic debug channel. It is a privileged live feed.

---

## 4. Websocket Message Contracts

`api/src/websocket/messages.ts` defines the main runtime payload shapes.

The important envelopes are:

- `auth` messages, which accept `email/password`, `access_token`, or `refresh_token`
- `ping` and `pong` messages for heartbeat
- `items` messages for CRUD over a websocket transport
- `subscribe` and `unsubscribe` messages for event subscriptions
- `logs` subscribe/unsubscribe messages for the log stream

The item message contract supports:

- `create`
- `read`
- `update`
- `delete`

with optional `id`, `ids`, `query`, and `uid` fields.

That `uid` is used as a client-side correlation key in responses.

---

## 5. Collaborative Editing

Collaborative editing is implemented in `api/src/websocket/collab/*` and is not just another websocket event type.

### 5.1 Initialization and enablement

`CollabHandler` initializes from the system setting `collaborative_editing_enabled` in `directus_settings`.

If the setting flips off at runtime:

- the handler re-initializes
- all active rooms are terminated

The handler also subscribes to the `websocket.event` bus so it can propagate changes across instances.

### 5.2 Join and room lifecycle

`onJoin()` performs a layered permission check before a room can be created:

- rejects shares up front
- validates read access for the target item
- validates read access for the version record, when a versioned room is requested
- validates any initial changes through `validateChanges()`

Only then does it create the room and join the client.

`RoomManager.createRoom()` uses a deterministic room hash based on collection, item, and version so clients on the same resource converge on the same room.

### 5.3 Room state

`api/src/websocket/collab/room.ts` keeps the room state in shared storage:

- `uid`
- `collection`
- `item`
- `version`
- `changes`
- `clients`
- `focuses`

That shared state allows a room to be rehydrated across Directus instances while the shared store remains available.

### 5.4 Broadcast semantics

The collab messenger in `api/src/websocket/collab/messenger.ts` handles:

- local client registration
- cross-instance client registry
- room registration and cleanup
- room and client termination across the bus
- ping/pong instance liveness checks

The bus topic is `websocket.event`, and the collab bus uses its own `COLLAB_BUS` channel for send/error/terminate/room events.

### 5.5 Update flow

The collab handler filters out irrelevant collections such as:

- `directus_activity`
- `directus_notifications`
- `directus_revisions`
- `directus_sessions`
- `directus_shares`

That is a deliberate runtime optimization. Not every Directus mutation is a collab signal.

For relevant update and delete events, the handler:

- resolves the affected keys
- finds matching rooms
- sends room-specific update/delete handlers

Versioned rooms are matched through `directus_versions`, not through the underlying content collection.

---

## 6. Notable Runtime Gaps

- There is no OpenAPI representation for websocket upgrade routes or websocket message schemas.
- The GraphQL websocket transport is limited to the items scope in the current implementation.
- Logs websockets are runtime-only and admin-only.
- Collaborative editing depends on both websocket enablement and the live settings value, so a static config read is not enough to understand whether rooms are actually active.
- Room semantics, client ordering, and event bus propagation are all runtime concerns, not packaged contract concerns.

---

## 7. Tovu Reconstruction Notes

### 7.1 Why this exists

This subsystem exists because real-time admin behavior is not just “open a websocket.” Directus uses realtime for three different jobs:

- data subscriptions
- operator/live log streams
- collaborative editing state

Those concerns share transport machinery but not the same trust model or room semantics.

### 7.2 What Tovu should preserve

- Separate the transport from the collaboration model
- Treat collaboration state as shared runtime state, not just local browser state
- Permission checks must happen before room join, not only on initial page load
- Runtime-only surfaces should not be assumed to exist just because an HTTP contract exists

### 7.3 What Tovu can simplify

- V1 can start with one realtime use case instead of all three
- Collaboration can begin with presence/locking before full delta sharing
- GraphQL subscriptions are optional if the transport seam is already abstracted

### 7.4 Possible Tovu seams

- `src/core/ports/RealtimeTransportPort.ts` for socket/pubsub transport
- `src/core/ports/CollaborationPort.ts` for room and merge semantics
- `src/features/content-item/` should consume collaboration state, not implement it
- `src/core/events/` should stay the source of cross-instance invalidation and fanout

### 7.5 Suggested priority

- `V1`: presence/locking or lightweight realtime invalidation
- `Later`: full collaborative editing rooms, richer realtime streams, multi-scope subscription support
