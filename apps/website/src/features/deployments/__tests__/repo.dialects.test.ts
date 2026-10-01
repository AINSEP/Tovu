import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { deploymentsReadRepoFor } from "../repo.js";

/** @file The deployments read repo's one Kysely body on SQLite and PGlite (storage plan §4). */

const WS = "ws-1";
const OTHER = "ws-2";

async function seed(kernel: ContentKernel): Promise<void> {
  await kernel.run(async (db) => {
    await db
      .insertInto("workspaces")
      .values([WS, OTHER].map((id) => ({ id, name: id, slug: id, created_at: "2026-09-01T00:00:00.000Z" })))
      .execute();
    await db
      .insertInto("deployment_environments")
      .values([
        { id: "env-old", workspace_id: WS, name: "Staging", slug: "staging", is_production: 0, created_at: "2026-09-01T00:00:00.000Z" },
        { id: "env-new", workspace_id: WS, name: "Prod", slug: "prod", is_production: 1, created_at: "2026-09-02T00:00:00.000Z" },
        { id: "env-other", workspace_id: OTHER, name: "X", slug: "x", is_production: 0, created_at: "2026-09-03T00:00:00.000Z" },
      ])
      .execute();
    await db
      .insertInto("deployment_targets")
      .values({
        id: "tgt-1",
        workspace_id: WS,
        environment_id: "env-new",
        provider_id: "fly",
        label: "Fly",
        config_json: '{"app":"site"}',
        enabled: 1,
        created_at: "2026-09-02T00:00:00.000Z",
      })
      .execute();
    await db.insertInto("deployment_targets").values({ id: "tgt-other", workspace_id: OTHER, environment_id: "env-other", provider_id: "github", label: "Other target", config_json: '{"repo":"private"}', enabled: 0, created_at: "2026-09-04T00:00:00.000Z" }).execute();
    await db
      .insertInto("releases")
      .values([
        {
          id: "rel-git",
          workspace_id: WS,
          label: "v1",
          source_kind: "git-revision",
          source_repo_url: "https://git.example/repo",
          source_commit_sha: "abc",
          created_by_principal_id: "p1",
          created_at: "2026-09-02T00:00:00.000Z",
        },
        {
          id: "rel-art",
          workspace_id: WS,
          label: "v2",
          source_kind: "external-artifact",
          source_uri: "s3://bucket/a.tgz",
          source_checksum: "sha256:1",
          created_by_principal_id: "p1",
          created_at: "2026-09-03T00:00:00.000Z",
        },
      ])
      .execute();
    await db.insertInto("releases").values({ id: "rel-other", workspace_id: OTHER, label: "Private release", source_kind: "git-revision", source_repo_url: "https://private.example/repo", source_commit_sha: "other-sha", created_by_principal_id: "p2", created_at: "2026-09-04T00:00:00.000Z" }).execute();
    await db
      .insertInto("deployment_runs")
      .values({
        id: "run-1",
        workspace_id: WS,
        provider_id: "fly",
        target_id: "tgt-1",
        environment_id: "env-new",
        release_id: "rel-git",
        status: "succeeded",
        provider_run_ref: null,
        reconciliation: "poll",
        requested_by_principal_id: "p1",
        requested_at: "2026-09-03T00:00:00.000Z",
      })
      .execute();
    await db.insertInto("deployment_runs").values({ id: "run-other", workspace_id: OTHER, provider_id: "github", target_id: "tgt-other", environment_id: "env-other", release_id: "rel-other", status: "queued", provider_run_ref: "other-ref", reconciliation: "poll", requested_by_principal_id: "p2", requested_at: "2026-09-04T00:00:00.000Z" }).execute();
  });
}

describeEachDialect(
  "deployments read repo",
  {
    tables: ["workspaces", "deployment_environments", "deployment_targets", "releases", "deployment_runs"],
    make: (kernel) => ({ repo: deploymentsReadRepoFor(kernel), seeded: seed(kernel) }),
  },
  (make) => {
    test("lists are workspace scoped, newest first, with booleans and JSON mapped", async () => {
      const { repo, seeded } = make();
      await seeded;
      const envs = await repo.listEnvironments({ workspaceId: WS });
      assert.deepEqual(envs.map((e) => [e.id, e.isProduction, e.version]), [["env-new", true, 1], ["env-old", false, 1]]);
      assert.deepEqual(await repo.listTargets({ workspaceId: WS }), [
        {
          workspaceId: WS,
          id: "tgt-1",
          environmentId: "env-new",
          providerId: "fly",
          label: "Fly",
          config: { app: "site" },
          enabled: true,
          createdAtIso: "2026-09-02T00:00:00.000Z",
          version: 1,
        },
      ]);
      assert.deepEqual((await repo.listReleases({ workspaceId: WS })).map((r) => r.source), [
        { kind: "external-artifact", uri: "s3://bucket/a.tgz", checksum: "sha256:1" },
        { kind: "git-revision", repoUrl: "https://git.example/repo", commitSha: "abc" },
      ]);
      const runs = await repo.listRuns({ workspaceId: WS });
      assert.deepEqual(runs.map((r) => [r.id, r.status, r.releaseId, r.startedAtIso]), [["run-1", "succeeded", "rel-git", null]]);
      assert.deepEqual((await repo.listRuns({ workspaceId: OTHER })).map((r) => r.id), ["run-other"]);
      assert.deepEqual((await repo.listTargets({ workspaceId: OTHER })).map((r) => r.id), ["tgt-other"]);
      assert.deepEqual((await repo.listReleases({ workspaceId: OTHER })).map((r) => r.id), ["rel-other"]);
      assert.deepEqual((await repo.listEnvironments({ workspaceId: OTHER })).map((e) => e.id), ["env-other"]);
    });
  }
);
