import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { DomainEvent } from "@jini-ai/core/contracts/events";
import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteChangeSetRepo } from "#src/platform/db/sqlite/change-set-repo.sqlite";
import { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { createCapturingResponse } from "#src/server/__tests__/helpers/http-test-server";
import { lastRouteHandler } from "#src/server/__tests__/helpers/last-route-handler";
import { buildPostRegistrations } from "../tool-registrations.js";
import type { PostToolDeps } from "../post-tool-deps.js";

/**
 * @file P10-H2 witness: every mutation's change set and its `change-set.applied` outbox event say
 * WHO made it — `agent` for an assistant edit, `user` for a human admin save — read back through
 * the real SQLite change-set repo and outbox on a migrated `content.db` (so a missing
 * `change_sets.actor_kind` column, an unmapped column, or an unstamped envelope all fail here).
 * The human arm drives the real `POST .../posts` admin route; the agent arm drives the real
 * `content_post_create` tool handler; both share the composition root's route deps.
 */

const WS = "workspace-local";
const PATH = "/api/admin/v1/workspaces/:workspaceId/posts";

async function harness() {
  const deps = createRouteDeps();
  await deps.identityReady;
  // Swap the in-memory change-set store for the site wiring (`site-deps/content-stores.ts` builds the same two).
  const db = openContentDb(":memory:");
  const changeSets = new SqliteChangeSetRepo({ store: db });
  deps.changeSets = changeSets;
  deps.outbox = new SqliteOutboxAdapter({ store: db });
  const owner = await deps.userRepo.findByUsername({ workspaceId: WS, username: "admin" });
  assert.ok(owner);
  const principal = await deps.principalRepo.findById({ workspaceId: WS, id: owner.principalId });
  assert.ok(principal);
  return { deps, db, changeSets, principal };
}

function postTool(deps: PostToolDeps): ToolRegistration {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const found = buildPostRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "content_post_create");
  assert.ok(found, "expected content_post_create to be wired");
  return found;
}

/** The `change-set.applied` events co-persisted with the change sets, read straight from `outbox_events`:
 *  the composition root's dispatcher may already have delivered them, so a claim could come back empty. */
function appliedEvents(db: ContentDb): DomainEvent[] {
  const rows = db.$client.prepare("SELECT event_json FROM outbox_events ORDER BY created_at").all() as Array<{ event_json: string }>;
  return rows.map((row) => JSON.parse(row.event_json) as DomainEvent).filter((event) => event.name === "change-set.applied");
}

test("an assistant (agent-tool) post create persists a change set and outbox event whose actor kind reads back 'agent'", async () => {
  const { deps, db, changeSets, principal } = await harness();
  const ctx: ToolExecutionContext = {
    executionId: "exec-actor-kind",
    principal: { id: principal.id },
    run: { id: "run-actor-kind" },
    input: { title: "Written by the assistant" },
    signal: new AbortController().signal,
  };
  await postTool(deps as unknown as PostToolDeps).handler(ctx);

  const [record] = await changeSets.listByWorkspace({ workspaceId: WS });
  assert.ok(record, "expected the agent create to persist a change set");
  assert.equal(record.actorKind, "agent");
  assert.equal(record.actorId, principal.id);
  const [event] = appliedEvents(db);
  assert.ok(event, "expected a co-persisted change-set.applied event");
  assert.equal(event.actorKind, "agent");
  assert.equal(event.changeSetId, record.id);
});

test("a human admin post create persists a change set and outbox event whose actor kind reads back 'user'", async () => {
  const { deps, db, changeSets, principal } = await harness();
  const handler = lastRouteHandler(createApp(deps), "post", PATH);
  const response = createCapturingResponse();
  response.res.locals.principal = principal;
  await handler({ params: { workspaceId: WS }, body: { title: "Written by a person" }, get: () => undefined }, response.res);
  assert.equal(response.capture.statusCode, 201);

  const [record] = await changeSets.listByWorkspace({ workspaceId: WS });
  assert.ok(record, "expected the human create to persist a change set");
  assert.equal(record.actorKind, "user");
  const [event] = appliedEvents(db);
  assert.ok(event, "expected a co-persisted change-set.applied event");
  assert.equal(event.actorKind, "user");
});
