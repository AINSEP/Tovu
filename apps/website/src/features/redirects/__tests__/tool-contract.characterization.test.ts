/**
 * @file Characterization of the Redirects agent-tool contract, built THROUGH THE HOST CONTRIBUTOR
 * (`contributeRedirectsTools().build(deps, surfaces)`), so it pins what the assistant's composition
 * root receives regardless of which package the catalog and handlers live in. It must stay green,
 * unedited, across the move of the tool catalog and handlers into `@jini-ai/cms/redirects`.
 *
 * Pinned: registration ids and their order (saved in permissions and audit rows), every descriptor
 * byte-for-byte against a committed golden (including `metadata`: the host's search vocabulary and
 * the `redirects_tombstone` confirmation policy), the derived-risk map, the per-tool permission
 * refusal, and one success view per tool.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { redirectMatcher, InMemoryRedirectRepo, createRedirect, updateRedirect, type RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import type { RedirectDbHandle } from "@jini-ai/cms/redirects/sql";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "@jini-ai/core/contracts/server/verified-origin";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
import { contributeRedirectsTools, redirectsDerivedRisk, type RedirectsToolDeps } from "../tool-registrations.js";
import { removeVia, restoreVia } from "./remove-redirect-double.js";

const WORKSPACE_ID = "ws-redirects-contract";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

const TOOL_IDS = [
  "redirects_list",
  "redirects_get",
  "redirects_get_hits",
  "redirects_create",
  "redirects_update",
  "redirects_tombstone",
  "redirects_import",
] as const;

const DERIVED_RISK: ReadonlyArray<readonly [string, string]> = [
  ["redirects_list", "none"],
  ["redirects_get", "none"],
  ["redirects_get_hits", "none"],
  ["redirects_create", "mutates-durable-state"],
  ["redirects_update", "mutates-durable-state"],
  ["redirects_tombstone", "mutates-durable-state"],
  ["redirects_import", "mutates-durable-state"],
];

const GOLDEN = JSON.parse(readFileSync(new URL("./tool-contract.characterization.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

interface Fixture {
  deps: RedirectsToolDeps;
  redirectRepo: InMemoryRedirectRepo;
  trashedIds: Set<string>;
}

function makeFixture(options: { allow?: boolean } = {}): Fixture {
  const allow = options.allow ?? true;
  const redirectRepo = new InMemoryRedirectRepo();
  const trashedIds = new Set<string>();
  const originRepo = new InMemoryOriginSettingRepo({ seeds: [
    { workspaceId: WORKSPACE_ID, origin: createVerifiedOrigin({ scheme: "https", host: "trusted.example", verifiedAt: NOW, source: "workspace-setting" }), redirectAllowlist: [] },
  ] });
  let clockTick = 0;
  let idTick = 0;
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    remove: removeVia(redirectRepo as unknown as Parameters<typeof removeVia>[0]),
    isInTrash: async ({ id }) => trashedIds.has(id),
    restore: restoreVia(redirectRepo as unknown as Parameters<typeof removeVia>[0]),
    db: redirectRepo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    reservedSegments: RESERVED_SEGMENTS,
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: {
      nowMs: () => {
        const second = clockTick;
        clockTick += 1;
        return Date.parse(`2026-07-29T00:00:${String(second).padStart(2, "0")}.000Z`);
      },
    },
    idGen: {
      newId: () => {
        idTick += 1;
        return `redirect-${idTick}`;
      },
    },
    outbox: new InMemoryOutbox(),
  };
  const deps = {
    workspaceId: WORKSPACE_ID,
    redirectRepo,
    redirectHitSink: { record: async () => undefined, getStats: async () => null, listStats: async () => [] },
    redirectsWriteDeps,
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  } as unknown as RedirectsToolDeps;
  return { deps, redirectRepo, trashedIds };
}

function buildThroughContributor(deps: RedirectsToolDeps): ToolRegistration[] {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  return contributeRedirectsTools().build(deps, { surfaceExchanges });
}

function toolById(registrations: ToolRegistration[], id: string): ToolRegistration {
  const found = registrations.find((registration) => registration.descriptor.id === id);
  assert.ok(found, `expected '${id}' to be wired`);
  return found;
}

function ctx(input: unknown): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

async function seed(fixture: Fixture, fromPattern: string, toTarget: string) {
  const { record } = await createRedirect({
    deps: fixture.deps.redirectsWriteDeps,
    input: { workspaceId: WORKSPACE_ID, matchType: "exact", fromPattern, toTarget, statusCode: 301, actorId: PRINCIPAL_ID },
  });
  return record;
}

test("(a) registration ids, in order, are the seven redirects tools", () => {
  const ids = buildThroughContributor(makeFixture().deps).map((registration) => registration.descriptor.id);
  assert.deepEqual(ids, [...TOOL_IDS]);
});

test("(b) every descriptor equals the committed golden, metadata included", () => {
  for (const registration of buildThroughContributor(makeFixture().deps)) {
    const descriptor = JSON.parse(JSON.stringify(registration.descriptor));
    assert.deepStrictEqual(descriptor, GOLDEN[registration.descriptor.id], registration.descriptor.id);
  }
  assert.deepEqual(Object.keys(GOLDEN), [...TOOL_IDS]);
});

test("(c) the derived-risk map is the seven authored entries", () => {
  assert.deepEqual([...redirectsDerivedRisk.entries()], DERIVED_RISK.map(([id, risk]) => [id, risk]));
  assert.equal(contributeRedirectsTools().risk, redirectsDerivedRisk);
});

for (const toolId of TOOL_IDS) {
  test(`(d) ${toolId}: a principal without the permission is refused with the model-facing forbidden error`, async () => {
    const registrations = buildThroughContributor(makeFixture({ allow: false }).deps);
    await assert.rejects(toolById(registrations, toolId).handler(ctx({ id: "r1", rules: [] })), (error: unknown) => {
      assert.ok(error instanceof ToolInputError, `got ${(error as Error)?.constructor?.name}`);
      assert.equal(error.message, "REDIRECTS_FORBIDDEN: principal 'principal-under-test' is not authorized for 'admin.redirects.manage' (insufficient_permission)");
      return true;
    });
  });
}

test("(e) one success call per tool returns the model-facing view", async () => {
  const fixture = makeFixture();
  const registrations = buildThroughContributor(fixture.deps);
  const call = (id: string, input: unknown) => toolById(registrations, id).handler(ctx(input));
  const created = (await call("redirects_create", { matchType: "exact", fromPattern: "/old", toTarget: "/new", statusCode: 301 })) as { rule: Record<string, unknown> };
  const expectedView = {
    id: "redirect-1", matchType: "exact", fromPattern: "/old", toTarget: "/new", statusCode: 301, status: "active", override: false, priority: 0,
    source: "manual", createdAt: created.rule.createdAt, updatedAt: created.rule.updatedAt, version: 1,
  };
  assert.deepEqual(created, { rule: expectedView });
  assert.deepEqual(await call("redirects_list", {}), { rules: [expectedView] });
  assert.deepEqual(await call("redirects_get", { id: "redirect-1" }), { rule: expectedView });
  assert.deepEqual(await call("redirects_get_hits", { id: "redirect-1" }), { stats: { redirectId: "redirect-1", workspaceId: WORKSPACE_ID, hitCount: 0, lastHitAt: undefined } });
  const updated = (await call("redirects_update", { id: "redirect-1", priority: 5 })) as { rule: { priority: number; version: number } };
  assert.equal(updated.rule.priority, 5);
  assert.equal(updated.rule.version, 2);
  const imported = (await call("redirects_import", { rules: [{ matchType: "exact", fromPattern: "/a", toTarget: "/b", statusCode: 302 }] })) as { created: unknown[]; failed: unknown[] };
  assert.equal(imported.created.length, 1);
  assert.deepEqual(imported.failed, []);
  const tombstoned = (await call("redirects_tombstone", { id: "redirect-1" })) as { tombstoned: boolean; cancelled: boolean; rule: unknown };
  assert.equal(tombstoned.tombstoned, true);
  assert.equal(tombstoned.cancelled, false);
  assert.ok(tombstoned.rule);
});

test("(f) redirects_list leaves out a rule whose isInTrash is true", async () => {
  const fixture = makeFixture();
  const live = await seed(fixture, "/live", "/live-target");
  const trashed = await seed(fixture, "/gone", "/gone-target");
  // A rule in the Trash is a switched-off one with a Trash index row; `isInTrash` alone only matters for a disabled rule.
  await updateRedirect({ deps: fixture.deps.redirectsWriteDeps, input: { workspaceId: WORKSPACE_ID, id: trashed.id, status: "disabled", actorId: PRINCIPAL_ID } });
  fixture.trashedIds.add(trashed.id);
  const listed = (await toolById(buildThroughContributor(fixture.deps), "redirects_list").handler(ctx({}))) as { rules: Array<{ id: string }> };
  assert.deepEqual(listed.rules.map((rule) => rule.id), [live.id]);
});

test("(g) redirects_tombstone carries the host confirmation policy in its descriptor metadata", () => {
  const descriptor = toolById(buildThroughContributor(makeFixture().deps), "redirects_tombstone").descriptor;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(descriptor.metadata)), (GOLDEN.redirects_tombstone as { metadata: unknown }).metadata);
  assert.deepEqual((descriptor.metadata as { approval: unknown }).approval, { class: "trash", confirmation: "policy" });
});
