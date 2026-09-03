/**
 * Boots a REAL Tovu server (the same `createApp()` composition root
 * `src/server/__tests__/admin-post-page-delete-routes.test.ts` and friends use) on an ephemeral
 * port, for `check-openapi-contract.ts` and `check-openapi-secret-leaks.ts` to fire real HTTP
 * requests at. Not a test-runner helper (no `node:test` `TestContext`) since both callers are
 * standalone CLI scripts, not `node --test` files — `close()` is explicit instead of `t.after`.
 */
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createApp, createRouteDeps } from "../../../apps/website/src/server/runtime/composition/app.js";

export type TovuRouteDeps = ReturnType<typeof createRouteDeps>;

export interface TovuTestServer {
  readonly baseUrl: string;
  readonly routeDeps: TovuRouteDeps;
  close(): Promise<void>;
}

export async function startTovuServer(): Promise<TovuTestServer> {
  const routeDeps = createRouteDeps();
  const server: Server = createServer(createApp(routeDeps));
  server.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    routeDeps,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Logs in as the seeded dev owner (`admin`/`tovu-dev`) — full grants on the seeded workspace. */
export async function loginOwner(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  if (res.status !== 200) throw new Error(`owner login failed with ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/**
 * Registers a principal with a login but NO role/policy grants, then logs in as it — mirrors
 * `src/server/__tests__/helpers/http-test-server.ts`'s `loginAsBarePrincipal` (25+ route test
 * files already hand-roll this exact pattern for proving the denied side of a permission gate with
 * a real identity-stack login, not a stubbed principal). Kept as a standalone copy here rather than
 * importing the test helper: these scripts are devtool CLI entry points, not `node --test` files,
 * and the helper's `startTestServer` half requires a `node:test` `TestContext` this caller doesn't
 * have.
 */
export async function loginBarePrincipal(routeDeps: TovuRouteDeps, baseUrl: string): Promise<string> {
  await routeDeps.identityReady;
  const suffix = randomUUID().slice(0, 8);
  const username = `contract-probe-bare-${suffix}`;
  const password = "contract-probe-pw";
  const principalId = `bare-${username}`;

  await routeDeps.principalRepo.save({
    id: principalId,
    workspaceId: routeDeps.workspaceId,
    kind: "user",
    displayName: "No Grants (openapi contract probe)",
    status: "active",
    createdAt: routeDeps.clock.nowIso(),
  });
  await routeDeps.userRepo.save({
    principalId,
    workspaceId: routeDeps.workspaceId,
    username,
    passwordHash: await routeDeps.passwordHasher.hash(password),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) throw new Error(`bare-principal login failed with ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}
