import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { mintBootSessionToken } from "@jini-ai/user-management/identity/boot-session-token";
import { startTestServer } from "../../../__tests__/helpers/http-test-server.js";
import { createRouteDeps } from "../../../runtime/composition/app.js";
import { captureRouteError } from "../../shared/observability-middleware.js";
import { parseAuthenticatedJsonBody } from "../../shared/json-body-parsers.js";
import { registerAuthRoutes } from "../dev-auth.js";

// U-AUTH-T1 / OD-2 pins, written against the pre-K1 `dev-auth.ts` and kept unchanged across the
// cutover: a repository that throws inside boot-session, local-boot-session, /auth/me and
// /auth/me/password-status reaches Express's error chain (`next(error)`), so the answer is the
// app's closing error handler's, not an auth envelope. B6/B13 pin the Set-Cookie order, and the
// router facts (case-insensitive path, trailing slash, HEAD for GET) stay Express's.

type Deps = ReturnType<typeof createRouteDeps>;
const repositoryDown = new Proxy({}, { get: () => async () => { throw new Error("fixture repository down"); } });

async function serve(t: TestContext, { override = () => ({}), local = false }: { override?: (deps: Deps) => Partial<Deps>; local?: boolean } = {}) {
  const deps = createRouteDeps();
  await deps.identityReady;
  t.mock.method(console, "error", () => {});
  t.mock.method(console, "warn", () => {});
  const app = express();
  app.use(parseAuthenticatedJsonBody);
  registerAuthRoutes({ app, deps: { ...deps, ...override(deps) } }, local ? { localOwnerSignIn: { enabled: true } } : {});
  // The wire answer of a forwarded error and of the auth envelope coincide for an anonymous caller,
  // so the pin also records what reached Express's error chain (observability reads it there).
  const forwarded: unknown[] = [];
  app.use((error: unknown, _req: express.Request, _res: express.Response, next: express.NextFunction) => { forwarded.push(error); next(error); });
  app.use(captureRouteError);
  return { baseUrl: await startTestServer(app, t), deps, forwarded };
}

/** Status, the body with its per-incident id masked, and the headers the auth policy writes. */
async function shape(response: Response) {
  const text = await response.text();
  const body = text ? JSON.parse(text.replace(/"errorId":"[^"]+"/g, '"errorId":"<id>"').replace(/ERR-[0-9A-F-]+/g, "ERR-<id>")) as unknown : null;
  return { status: response.status, body, cacheControl: response.headers.get("cache-control"),
    setCookie: response.headers.getSetCookie().map((value) => value.replace(/=[^;]+;/, "=<v>;")) };
}

/** The closing error handler's answers at base (`captureRouteError` → `sendAdminFailure`); an auth
 * envelope (`sendAuthFailure`, "Sign-in could not finish.") here would mean the error was not forwarded. */
const LOAD_FAILED = { code: "INTERNAL_ERROR", errorId: "<id>", error: "The sign-in information could not be loaded. Try loading them again. If it still fails, Report this error ID. (error ERR-<id>)" };
const OPERATION_FAILED = { code: "INTERNAL_ERROR", errorId: "<id>", error: "The sign-in operation could not be completed. Check the result before repeating this operation. Report this error ID. (error ERR-<id>)" };
const FORWARDED = { status: 500, cacheControl: null, setCookie: [] } as const;
const within = () => ({ signal: AbortSignal.timeout(5_000) });

test("OD-2: a session repository that throws in GET /auth/me reaches Express's error chain", async (t) => {
  const { baseUrl, forwarded } = await serve(t, { override: () => ({ sessionRepo: repositoryDown as Deps["sessionRepo"] }) });
  const got = await shape(await fetch(`${baseUrl}/api/admin/v1/auth/me`, { ...within(), headers: { cookie: "tovu_session=fixture" } }));
  assert.deepEqual(got, { ...FORWARDED, body: LOAD_FAILED });
  assert.deepEqual(forwarded.map((error) => (error as Error).message), ["fixture repository down"]);
  assert.doesNotMatch(JSON.stringify(got.body), /fixture repository down/);
});

test("OD-2: a session repository that throws in GET /auth/me/password-status reaches Express's error chain", async (t) => {
  const { baseUrl, forwarded } = await serve(t, { override: () => ({ sessionRepo: repositoryDown as Deps["sessionRepo"] }) });
  const got = await shape(await fetch(`${baseUrl}/api/admin/v1/auth/me/password-status`, { ...within(), headers: { cookie: "tovu_session=fixture" } }));
  assert.deepEqual(got, { ...FORWARDED, body: LOAD_FAILED });
  assert.deepEqual(forwarded.map((error) => (error as Error).message), ["fixture repository down"]);
});

test("OD-2: a principal repository that throws during boot-session redemption reaches Express's error chain", async (t) => {
  const { baseUrl, forwarded } = await serve(t, { override: () => ({ principalRepo: repositoryDown as Deps["principalRepo"] }) });
  const token = mintBootSessionToken();
  const got = await shape(await fetch(`${baseUrl}/api/admin/v1/auth/boot-session`, {
    ...within(), method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }));
  assert.deepEqual(got, { ...FORWARDED, body: OPERATION_FAILED });
  assert.deepEqual(forwarded.map((error) => (error as Error).message), ["fixture repository down"]);
});

test("OD-2: a session repository that throws in local-boot-session reaches Express's error chain, after no-store", async (t) => {
  const { baseUrl, forwarded } = await serve(t, { local: true, override: () => ({ sessionRepo: repositoryDown as Deps["sessionRepo"] }) });
  const origin = new URL(baseUrl).origin;
  const got = await shape(await fetch(`${baseUrl}/api/admin/v1/auth/local-boot-session`, {
    ...within(), method: "POST", headers: { origin, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", cookie: "tovu_session=fixture" } }));
  assert.deepEqual(got, { ...FORWARDED, cacheControl: "no-store", body: OPERATION_FAILED });
  assert.deepEqual(forwarded.map((error) => (error as Error).message), ["fixture repository down"]);
});

async function signIn(baseUrl: string, path = "/api/admin/v1/auth/login", cookie = "") {
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }) });
}

test("B6: login with a local cookie present sets the session cookie, then clears the local one, in that order", async (t) => {
  const { baseUrl } = await serve(t);
  const port = new URL(baseUrl).port;
  const got = await shape(await signIn(baseUrl, undefined, `tovu_session_local_${port}=stale`));
  assert.equal(got.status, 200);
  assert.equal(got.cacheControl, "no-store");
  assert.equal(got.setCookie.length, 2);
  assert.match(got.setCookie[0], /^tovu_session=<v>;/);
  assert.match(got.setCookie[1], new RegExp(`^tovu_session_local_${port}=; .*Expires=Thu, 01 Jan 1970`));
});

test("B13: logout answers {ok:true} and clears both cookies in order", async (t) => {
  const { baseUrl } = await serve(t);
  const port = new URL(baseUrl).port;
  const response = await fetch(`${baseUrl}/api/admin/v1/auth/logout`, { method: "POST", headers: { cookie: `tovu_session=x; tovu_session_local_${port}=y` } });
  const got = await shape(response);
  assert.deepEqual({ status: got.status, body: got.body }, { status: 200, body: { ok: true } });
  assert.deepEqual(got.setCookie.map((value) => value.split("=")[0]), ["tovu_session", `tovu_session_local_${port}`]);
});

test("router facts stay Express's: case-insensitive path, trailing slash, HEAD for GET", async (t) => {
  const { baseUrl } = await serve(t);
  assert.equal((await signIn(baseUrl, "/API/ADMIN/V1/AUTH/LOGIN")).status, 200);
  assert.equal((await signIn(baseUrl, "/api/admin/v1/auth/login/")).status, 200);
  const head = await fetch(`${baseUrl}/api/admin/v1/auth/me`, { method: "HEAD" });
  assert.equal(head.status, 401);
  assert.equal(await head.text(), "");
});
