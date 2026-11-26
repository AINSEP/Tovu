import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import type { ChangeSetRecord, DomainEvent } from "@jini-ai/core/contracts/events";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";
import { InMemoryEventBus, InMemoryOutbox } from "@jini-ai/infra/events/memory-bus";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/platform/system";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { InMemoryPostRepo } from "../repo.memory.js";
import { buildPostRegistrations } from "../tool-registrations.js";
import { removeVia } from "./remove-post-double.js";
import { type PostToolDeps } from "../tool-registrations.js";

/**
 * @file P10-H2.T attribution at the assistant tool binding. The CLI executor (daemon tool-RPC
 * route) and the BYOK executor run the SAME `buildPostRegistrations` handlers through one shared
 * tool surface, so this one binding is what both origins stamp. An assistant acting for an owner
 * does not turn the action into an owner click: the change set and its outbox event say `agent`,
 * while the principal id — the acting user's, which authorization runs on — is kept unchanged.
 */

const WORKSPACE_ID = "ws-post-actor";
const OWNER_ID = "owner-under-test";

/** Records every change set written and the event handed over atomically with it. */
class RecordingChangeSetRepo extends InMemoryChangeSetRepo {
  readonly written: { record: ChangeSetRecord; event: DomainEvent | undefined }[] = [];
  override async insert(required: Parameters<InMemoryChangeSetRepo["insert"]>[0], optional?: Parameters<InMemoryChangeSetRepo["insert"]>[1]): Promise<void> {
    this.written.push({ record: required.record, event: optional?.event });
    await super.insert(required, optional);
  }
}

function harness() {
  let counter = 0;
  const changeSets = new RecordingChangeSetRepo();
  const postRepo = new InMemoryPostRepo({});
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowMs: () => Date.parse("2026-11-25T00:00:00.000Z") },
    idGen: { newId: () => `id-${++counter}` },
    changeSets,
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    pluginBeforeSaveHook: async () => ({}),
    slugChangeCapture: () => undefined,
    removePost: removeVia(postRepo),
    forgetRemovedPost: async () => {},
    authorize: async ({ principalId }: { principalId: string }) => ({ allowed: principalId === OWNER_ID, reason: "matched" }),
  } as unknown as PostToolDeps;
  const surfaces = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) };
  const registrations = new Map(buildPostRegistrations(deps, surfaces).map((r): [string, ToolRegistration] => [r.descriptor.id, r]));
  const call = (id: string, input: unknown) => {
    const registration = registrations.get(id);
    assert.ok(registration, `expected '${id}' to be wired`);
    const ctx: ToolExecutionContext = { executionId: `exec-${id}`, principal: { id: OWNER_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
    return registration.handler(ctx);
  };
  return { changeSets, call };
}

test("an assistant post create, update and trash record kind agent under the acting owner's principal id", async () => {
  const { changeSets, call } = harness();
  const created = (await call("content_post_create", { kind: "post", title: "From the assistant" })) as { post: { id: string } };
  await call("content_post_update", { id: created.post.id, title: "Edited by the assistant" });
  await call("content_post_delete", { id: created.post.id });

  assert.equal(changeSets.written.length, 3);
  for (const { record, event } of changeSets.written) {
    // Attribution from the channel; the principal id (authorization identity) is the owner's.
    assert.deepEqual(record.actor, { id: OWNER_ID, kind: "agent" }, record.summary);
    assert.equal(record.actorId, OWNER_ID);
    assert.deepEqual([event?.actorId, event?.actor], [OWNER_ID, { id: OWNER_ID, kind: "agent" }], record.summary);
  }
});
