import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { loginAsBarePrincipal, startTestServer } from "./helpers/http-test-server.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { createServingFormPullTrigger, FORM_PULL_FAILED_LINE } from "../runtime/composition/form-pull-triggers.js";
import { registerAuthRoutes, requireAdminSession, type AdminSignInPort } from "../inbound/admin-http/dev-auth.js";
import { resolveLocalOwnerSignIn } from "../runtime/boot/local-owner-signin.js";
import { mintBootSessionToken } from "../../features/identity/boot-session-token.js";
import type { RouteDeps } from "../routes/types.js";

/**
 * @file Security pins (phase A) for the sign-in form pull trigger: only an owner or built-in admin
 * sign-in triggers it, on every real sign-in path (password, desktop boot session, local dev
 * owner sign-in); a non-admin or a failed sign-in never does; sign-in never waits on the pull, and a
 * failing pull never changes the sign-in response.
 */

const dev = { NODE_ENV: "development", TOVU_DEV_OWNER_SIGNIN: "1", TOVU_HOST: "127.0.0.1", TOVU_DEV_SUPERVISOR_PID: "42" };

/** Auth routes with a counting sign-in port, and a record of which principals' role checks finished. */
function site({ port, env }: { port?: AdminSignInPort; env?: Record<string, string> } = {}) {
  const deps: RouteDeps = createRouteDeps();
  let signals = 0;
  const roleChecks: string[] = [];
  const listRoles = deps.principalRoleRepo.listByPrincipalId.bind(deps.principalRoleRepo);
  deps.principalRoleRepo.listByPrincipalId = async (input) => {
    const rows = await listRoles(input);
    roleChecks.push(input.principalId);
    return rows;
  };
  const localOwnerSignIn = resolveLocalOwnerSignIn({ env: env ?? {} }, { pathExists: () => false });
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps, { localOwnerSignIn, onAdminSignIn: port ?? { signedIn: () => { signals += 1; } } });
  app.use("/api/admin", requireAdminSession(deps, { localOwnerSignIn }));
  return { app, deps, signals: () => signals, roleChecks };
}

/** Lets background promise chains that already resolved run to completion. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function until(condition: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 200 && !condition(); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), `timed out waiting for ${what}`);
}

const login = (base: string, username: string, password: string) => fetch(`${base}/api/admin/v1/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }),
});

/** A user with no grants and no session yet; `admin` gives it the built-in admin role. */
async function makeUser(deps: RouteDeps, { username, admin }: { username: string; admin: boolean }): Promise<string> {
  await deps.identityReady;
  const id = `user-${username}`;
  await deps.principalRepo.save({ id, workspaceId: deps.workspaceId, kind: "user", displayName: username, status: "active", createdAt: deps.clock.nowIso() });
  await deps.userRepo.save({ principalId: id, workspaceId: deps.workspaceId, username, passwordHash: await deps.passwordHasher.hash({ password: `${username}-pw` }) });
  if (admin) {
    const role = await deps.roleRepo.findByName({ workspaceId: deps.workspaceId, name: "admin" });
    assert.ok(role?.isBuiltin, "seedIdentity creates the built-in admin role");
    await deps.principalRoleRepo.save({ id: `link-${username}`, workspaceId: deps.workspaceId, principalId: id, roleId: role.id });
  }
  return id;
}

test("security: the owner's password sign-in triggers the pull once", async (t) => {
  const s = site();
  const base = await startTestServer(s.app, t);
  assert.equal((await login(base, "admin", "tovu-dev")).status, 200);
  await until(() => s.signals() === 1, "the owner's sign-in signal");
  await flush();
  assert.equal(s.signals(), 1);
});

test("security: a built-in admin's password sign-in triggers the pull", async (t) => {
  const s = site();
  const base = await startTestServer(s.app, t);
  await makeUser(s.deps, { username: "role-admin", admin: true });
  assert.equal((await login(base, "role-admin", "role-admin-pw")).status, 200);
  await until(() => s.signals() === 1, "the admin's sign-in signal");
});

test("security: a signed-in user who is neither owner nor admin never triggers the pull", async (t) => {
  const s = site();
  const base = await startTestServer(s.app, t);
  const id = await makeUser(s.deps, { username: "plain-editor", admin: false });
  assert.equal((await login(base, "plain-editor", "plain-editor-pw")).status, 200);
  await until(() => s.roleChecks.includes(id), "the editor's role check");
  await flush();
  assert.equal(s.signals(), 0);
});

test("security: a failed sign-in never triggers the pull", async (t) => {
  const s = site();
  const base = await startTestServer(s.app, t);
  assert.equal((await login(base, "admin", "wrong-password")).status, 401);
  await flush();
  assert.equal(s.signals(), 0);
});

test("security: the desktop boot-session sign-in (the owner) triggers the pull", async (t) => {
  const s = site();
  const base = await startTestServer(s.app, t);
  const res = await fetch(`${base}/api/admin/v1/auth/boot-session`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: mintBootSessionToken() }),
  });
  assert.equal(res.status, 200);
  await until(() => s.signals() === 1, "the boot-session signal");
});

test("security: a refused boot-session token never triggers the pull", async (t) => {
  const s = site();
  const base = await startTestServer(s.app, t);
  const res = await fetch(`${base}/api/admin/v1/auth/boot-session`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "not-a-real-token" }),
  });
  assert.equal(res.status, 401);
  await flush();
  assert.equal(s.signals(), 0);
});

const localBootstrap = (base: string, cookie?: string) => fetch(`${base}/api/admin/v1/auth/local-boot-session`, {
  method: "POST", headers: { origin: base, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", ...(cookie ? { cookie } : {}) },
});

test("security: the local dev owner sign-in triggers the pull; keeping an existing non-owner session does not", async (t) => {
  const s = site({ env: dev });
  const base = await startTestServer(s.app, t);
  assert.equal((await localBootstrap(base)).status, 200);
  await until(() => s.signals() === 1, "the local owner sign-in signal");

  const other = site({ env: dev });
  const otherBase = await startTestServer(other.app, t);
  const cookie = await loginAsBarePrincipal(other.deps, otherBase, { username: "local-editor" });
  await until(() => other.roleChecks.includes("bare-local-editor"), "the editor's role check");
  const kept = await localBootstrap(otherBase, cookie);
  assert.equal(kept.status, 200);
  assert.equal(kept.headers.has("set-cookie"), false, "no new session was started");
  await flush();
  assert.equal(other.signals(), 0);
});

test("security: sign-in answers while the pull it started is still running", async (t) => {
  let finish!: () => void;
  const running = new Promise<void>((resolve) => { finish = resolve; });
  let started = 0;
  const trigger = createServingFormPullTrigger({ autoPull: { run: async () => { started += 1; await running; } }, workspaceId: "ws" });
  t.after(async () => { finish(); await trigger.stop(); });
  const s = site({ port: trigger.signIn });
  const base = await startTestServer(s.app, t);
  assert.equal((await login(base, "admin", "tovu-dev")).status, 200);
  await until(() => started === 1, "the pull to start");
  // The pull is still pending here; a second sign-in also answers at once.
  assert.equal((await login(base, "admin", "tovu-dev")).status, 200);
});

test("security: a failing pull or a throwing sign-in port never changes the sign-in response, and logs no detail", async (t) => {
  const warned: string[] = [];
  t.mock.method(console, "warn", (line: string) => { warned.push(line); });
  const secretDetail = `https://user:pw@receiver.example/forms?key=${"k".repeat(43)} answers: jane@example.com`;
  const trigger = createServingFormPullTrigger({ autoPull: { run: async () => { throw new Error(secretDetail); } }, workspaceId: "ws" }, { warn: (line) => warned.push(line) });
  t.after(() => trigger.stop());
  const failing = site({ port: trigger.signIn });
  const base = await startTestServer(failing.app, t);
  const res = await login(base, "admin", "tovu-dev");
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { user: { username: string } }).user.username, "admin");
  await until(() => warned.length === 1, "the failed pull's log line");
  assert.deepEqual(warned, [FORM_PULL_FAILED_LINE]);

  const throwing = site({ port: { signedIn: () => { throw new Error(secretDetail); } } });
  const throwingBase = await startTestServer(throwing.app, t);
  assert.equal((await login(throwingBase, "admin", "tovu-dev")).status, 200);
  await until(() => warned.length === 2, "the throwing port's log line");
  assert.equal(warned[1], "[admin-auth] post-sign-in form pull check failed; sign-in is unaffected");
  assert.ok(warned.every((line) => !line.includes("receiver.example") && !line.includes("k".repeat(43)) && !line.includes("jane@")));
});
