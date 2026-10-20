/**
 * @file Pins `content_post_create`'s "not-image" featuredImage refusal when the resolver reports no
 * content type. `FeaturedImageResolution` (`featured-image.ts`) declares `contentType` optional on
 * that arm, and the tool's refusal text falls back to "not an image" for it. The real resolver only
 * answers "not-image" after reading a recorded type, so no media fake reaches this arm: the resolver
 * module itself is replaced with a fake typed against its real result union.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";

import type { ToolExecutionContext } from "@jini-ai/core";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryMediaRepo } from "../../media/index.js";
import type { FeaturedImageResolution } from "../featured-image.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import type { PostToolDeps } from "../tool-registrations.js";

const WS = "workspace-1";

const resolveFeaturedImageRef = async (): Promise<FeaturedImageResolution> => ({ ok: false, reason: "not-image" });
mock.module("../featured-image.js", { namedExports: { resolveFeaturedImageRef } });
const { buildPostRegistrations } = await import("../tool-registrations.js");

test("content_post_create: a not-image refusal with no recorded content type says 'not an image' and writes nothing", async () => {
  const postRepo = new InMemoryPostRepo();
  const deps: PostToolDeps = {
    workspaceId: WS,
    authorize: async () => ({ allowed: true, reason: "fixture grant" }),
    clock: { nowMs: () => Date.parse("2026-10-20T12:00:00.000Z") },
    idGen: { newId: () => "id-1" },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    postSearch: { search: async () => [] },
    pluginBeforeSaveHook: async () => ({}),
    slugChangeCapture: () => undefined,
    removePost: async () => ({ ok: false, reason: "not-found" }),
    forgetRemovedPost: async () => {},
    mediaRepo: new InMemoryMediaRepo({}),
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const create = buildPostRegistrations(deps, { surfaceExchanges }).find((registration) => registration.descriptor.id === "content_post_create");
  assert.ok(create, "content_post_create is registered");
  const ctx: ToolExecutionContext = { executionId: "e", principal: { id: "agent" }, run: { id: "r" }, input: { kind: "post", title: "Fresh", featuredImage: " doc-1 " }, signal: new AbortController().signal };

  await assert.rejects(create.handler(ctx), { message: "featuredImage: media asset 'doc-1' is not an image, not an image. A featured image must be an image." });
  assert.deepEqual(await postRepo.list({ workspaceId: WS }), []);
});
