import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import { InMemoryDeploymentsReadRepo } from "#src/features/deployments/index";
import type { DeploymentRunRecord, DeploymentTargetRecord, EnvironmentRecord, ReleaseRecord } from "#src/features/deployments/index";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file Admin Deployment panel → Full Site tab — `GET /api/admin/v1/workspaces/:workspaceId/
 * deployments`. Same bare-principal-vs-owner + workspace-id-404 shape as
 * `deployment-overview-route.test.ts`; see that file's header. The 200 case seeds a fresh
 * `InMemoryDeploymentsReadRepo` (overriding `createRouteDeps()`'s empty default) with one row per
 * table, plus one row scoped to a DIFFERENT workspace, so the response is proven to be both REAL
 * (not fabricated) and workspace-FILTERED (not a global dump).
 */

const OTHER_WORKSPACE_ID = "some-other-workspace";

function seededRepo(workspaceId: string): InMemoryDeploymentsReadRepo {
  const environment: EnvironmentRecord = {
    workspaceId,
    id: "env-1",
    name: "Production",
    slug: "production",
    isProduction: true,
    createdAtIso: "2026-08-01T00:00:00.000Z",
    version: 1,
  };
  const target: DeploymentTargetRecord = {
    workspaceId,
    id: "target-1",
    environmentId: "env-1",
    providerId: "github",
    label: "GitHub Pages",
    config: { repoOwner: "acme", repoName: "site" },
    enabled: true,
    createdAtIso: "2026-08-01T00:00:00.000Z",
    version: 1,
  };
  const release: ReleaseRecord = {
    workspaceId,
    id: "release-1",
    label: "v1",
    source: { kind: "git-revision", repoUrl: "https://github.com/acme/site", commitSha: "abc123" },
    createdByPrincipalId: "owner-principal",
    createdAtIso: "2026-08-01T00:00:00.000Z",
    version: 1,
  };
  const run: DeploymentRunRecord = {
    workspaceId,
    id: "run-1",
    providerId: "github",
    targetId: "target-1",
    environmentId: "env-1",
    releaseId: "release-1",
    status: "succeeded",
    providerRunRef: "gh-run-1",
    reconciliation: "poll",
    requestedByPrincipalId: "owner-principal",
    requestedAtIso: "2026-08-01T00:00:00.000Z",
    startedAtIso: "2026-08-01T00:00:01.000Z",
    finishedAtIso: "2026-08-01T00:00:02.000Z",
    errorSummary: null,
    version: 1,
  };

  return new InMemoryDeploymentsReadRepo({
    environments: [environment, { ...environment, workspaceId: OTHER_WORKSPACE_ID, id: "env-other" }],
    targets: [target, { ...target, workspaceId: OTHER_WORKSPACE_ID, id: "target-other" }],
    releases: [release, { ...release, workspaceId: OTHER_WORKSPACE_ID, id: "release-other" }],
    runs: [run, { ...run, workspaceId: OTHER_WORKSPACE_ID, id: "run-other" }],
  });
}

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-deployments-list";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-deployments-list",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-deployments-list", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("deployments-list: an unauthorized principal (no grants) gets 403", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/deployments`, { headers: { cookie } });
  assert.equal(res.status, 403);
});

test("deployments-list: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/deployments`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("deployments-list: the seeded owner gets 200 with real rows, filtered to this workspace only", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  deps.deploymentsReadRepo = seededRepo(deps.workspaceId);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/deployments`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.environments.length, 1);
  assert.equal(body.environments[0].id, "env-1");
  assert.equal(body.targets.length, 1);
  assert.equal(body.targets[0].id, "target-1");
  assert.deepEqual(body.targets[0].config, { repoOwner: "acme", repoName: "site" });
  assert.equal(body.releases.length, 1);
  assert.equal(body.releases[0].id, "release-1");
  assert.equal(body.runs.length, 1);
  assert.equal(body.runs[0].id, "run-1");
  assert.equal(body.runs[0].status, "succeeded");

  // Never a global dump — the other workspace's rows must never appear here.
  const allIds = [...body.environments, ...body.targets, ...body.releases, ...body.runs].map((r: { id: string }) => r.id);
  assert.ok(!allIds.some((id) => id.endsWith("-other")));
});

test("deployments-list: no rows in any table reports empty lists, never an error", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/deployments`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { environments: [], targets: [], releases: [], runs: [] });
});
