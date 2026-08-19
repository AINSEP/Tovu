import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryTransformDefinitionRepo, registerTransform } from "@jini-ai/cms/media";
import type { TransformDefinitionRepoPort } from "@jini-ai/cms/media";

import { CORE_PUBLIC_TRANSFORM_NAME, ensureCoreMediaTransform } from "../bootstrap.js";

/**
 * @file `ensureCoreMediaTransform` — the boot-time find-or-create guard `server/deps.ts` chains
 * into its `Ready` sequence. The property under test is entirely about idempotency: this is the
 * ONE guard standing between a normal `tsx watch` restart and a `transform_registry` that grows a
 * new "public" version on every file save (see `bootstrap.ts`'s own file header for the disclosed
 * hazard). A test suite that only proves "the first call registers something" would pass even if
 * the find-existing check were deleted — every case below proves the SECOND call specifically.
 */

const WORKSPACE_ID = "workspace-1";
const OTHER_WORKSPACE_ID = "workspace-2";

function fakeDeps(transformRepo: TransformDefinitionRepoPort = new InMemoryTransformDefinitionRepo()) {
  let counter = 0;
  return {
    transformRepo,
    clock: { nowIso: () => "2026-08-05T00:00:00.000Z" },
    idGen: { newId: () => `id-${++counter}` },
  };
}

test("ensureCoreMediaTransform: on an empty registry, registers a new 'public' definition (format-only, no resize)", async () => {
  const deps = fakeDeps();
  const { definition } = await ensureCoreMediaTransform({ deps, input: { workspaceId: WORKSPACE_ID } });
  assert.equal(definition.name, CORE_PUBLIC_TRANSFORM_NAME);
  assert.equal(definition.version, 1);
  assert.equal(definition.owner, "core");
  assert.deepEqual(definition.params, { format: "webp" });

  const rows = await deps.transformRepo.listByName({ workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME });
  assert.equal(rows.length, 1, "exactly one row minted on first call");
});

test("ensureCoreMediaTransform: called again, returns the SAME definition and does NOT mint a second version (the idempotency property this guard exists for)", async () => {
  const deps = fakeDeps();
  const first = await ensureCoreMediaTransform({ deps, input: { workspaceId: WORKSPACE_ID } });

  // Mirrors a real `tsx watch` restart: same process boots this function again against the same
  // (persistent) repo.
  const second = await ensureCoreMediaTransform({ deps, input: { workspaceId: WORKSPACE_ID } });

  assert.equal(second.definition.id, first.definition.id, "same row, not a freshly minted one");
  assert.equal(second.definition.version, 1, "must not have incremented to version 2");

  const rows = await deps.transformRepo.listByName({ workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME });
  assert.equal(rows.length, 1, "a second boot must not add a second row");
});

test("ensureCoreMediaTransform: ten repeated calls (a tight restart loop) still leave exactly one 'public' row", async () => {
  const deps = fakeDeps();
  for (let i = 0; i < 10; i += 1) {
    await ensureCoreMediaTransform({ deps, input: { workspaceId: WORKSPACE_ID } });
  }
  const rows = await deps.transformRepo.listByName({ workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME });
  assert.equal(rows.length, 1);
});

test("ensureCoreMediaTransform: an existing higher version (simulating a prior manual redefinition) is returned as-is, never re-registered under it", async () => {
  const deps = fakeDeps();
  await registerTransform({ deps, input: { workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME, params: { format: "jpeg" }, owner: "core" } });
  const { definition: v2 } = await registerTransform({
    deps,
    input: { workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME, params: { format: "webp" }, owner: "core" },
  });
  assert.equal(v2.version, 2);

  const { definition } = await ensureCoreMediaTransform({ deps, input: { workspaceId: WORKSPACE_ID } });
  assert.equal(definition.version, 2, "finds the LATEST version, not the first-ever row");
  assert.equal(definition.id, v2.id);

  const rows = await deps.transformRepo.listByName({ workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME });
  assert.equal(rows.length, 2, "must not have minted a version 3");
});

test("ensureCoreMediaTransform: an unrelated transform name in the same workspace does not satisfy the find-existing check — 'public' still gets created", async () => {
  const deps = fakeDeps();
  await registerTransform({ deps, input: { workspaceId: WORKSPACE_ID, name: "thumb", params: { width: 100, height: 100, format: "jpeg" }, owner: "core" } });

  const { definition } = await ensureCoreMediaTransform({ deps, input: { workspaceId: WORKSPACE_ID } });
  assert.equal(definition.name, CORE_PUBLIC_TRANSFORM_NAME);
  assert.equal(definition.version, 1);
});

test("ensureCoreMediaTransform: workspaces are isolated — registering 'public' in one workspace does not satisfy the guard for another", async () => {
  const deps = fakeDeps();
  await ensureCoreMediaTransform({ deps, input: { workspaceId: WORKSPACE_ID } });

  const { definition } = await ensureCoreMediaTransform({ deps, input: { workspaceId: OTHER_WORKSPACE_ID } });
  assert.equal(definition.version, 1, "the other workspace gets its own fresh v1, not a shared row");

  const rowsA = await deps.transformRepo.listByName({ workspaceId: WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME });
  const rowsB = await deps.transformRepo.listByName({ workspaceId: OTHER_WORKSPACE_ID, name: CORE_PUBLIC_TRANSFORM_NAME });
  assert.equal(rowsA.length, 1);
  assert.equal(rowsB.length, 1);
});
