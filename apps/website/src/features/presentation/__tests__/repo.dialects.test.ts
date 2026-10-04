import assert from "node:assert/strict";
import { test } from "node:test";

import type { PresentationSettingsRecord } from "@jini-ai/cms/presentation";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { presentationSettingsRepoFor } from "../repo.js";

/**
 * @file The presentation-settings repo on every dialect through the kernel's matrix
 * (`describeEachDialect` + ONE factory). Covers every public method: hit, miss, upsert,
 * other-workspace isolation and rollback.
 */

const T0 = "2026-09-28T00:00:00.000Z";
const T1 = "2026-09-28T01:00:00.000Z";

function settings(workspaceId: string, activeThemeId: string, updatedAt = T0): PresentationSettingsRecord {
  return { workspaceId, activeThemeId, updatedAt } as PresentationSettingsRecord;
}

function repos(kernel: ContentKernel) {
  return { kernel, repo: presentationSettingsRepoFor(kernel) };
}

describeEachDialect("presentation settings repo", { tables: ["presentation_settings"], make: repos }, (makeRepos) => {
  test("save then findByWorkspaceId round-trips; unknown workspace misses", async () => {
    const { repo } = makeRepos();
    await repo.save(settings("ws-1", "paper"));
    assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: "ws-1" }), settings("ws-1", "paper"));
    assert.equal(await repo.findByWorkspaceId({ workspaceId: "ws-none" }), null);
  });

  test("save upserts on workspace_id and leaves other workspaces alone", async () => {
    const { repo } = makeRepos();
    await repo.save(settings("ws-1", "paper"));
    await repo.save(settings("ws-2", "ink"));
    await repo.save(settings("ws-1", "ink", T1));
    assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: "ws-1" }), settings("ws-1", "ink", T1));
    assert.deepEqual(await repo.findByWorkspaceId({ workspaceId: "ws-2" }), settings("ws-2", "ink"));
    const all = await repo.listAll();
    assert.deepEqual(
      all.map((r) => r.workspaceId).sort(),
      ["ws-1", "ws-2"]
    );
  });

  test("listAll is empty on a fresh database", async () => {
    const { repo } = makeRepos();
    assert.deepEqual(await repo.listAll(), []);
  });

  test("a save inside a failed transaction rolls back", async () => {
    const { kernel, repo } = makeRepos();
    await repo.save(settings("ws-1", "paper"));
    await assert.rejects(
      kernel.transaction(async () => {
        await repo.save(settings("ws-1", "ink", T1));
        await repo.save(settings("ws-2", "ink"));
        throw new Error("boom");
      }),
      /boom/
    );
    assert.deepEqual(await repo.listAll(), [settings("ws-1", "paper")]);
  });
});
