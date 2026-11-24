import assert from "node:assert/strict";
import test from "node:test";
import type { Express, Request, Response } from "express";
import { applyDevCors, defaultDevCorsOrigins, isDevCorsEnabled } from "../dev-cors.js";

type Middleware = (req: Request, res: Response, next: () => void) => void;

const DEV_ALLOW = ["http://localhost:3000", "https://127.0.0.1:8080", "http://localhost:5173"];

/** Mounts `applyDevCors` on a fake app; returns the middleware (or undefined when none was mounted). */
function mount(options: Parameters<typeof applyDevCors>[1]): Middleware | undefined {
  let middleware: Middleware | undefined;
  const fakeApp = { use: (fn: Middleware) => { middleware = fn; } } as unknown as Express;
  applyDevCors(fakeApp, options);
  return middleware;
}

/** Runs one request through `middleware`; returns the headers set, the status sent, and whether next() ran. */
function run(middleware: Middleware, { method, origin }: { method: string; origin?: string }) {
  const headers: Record<string, string> = {};
  let sentStatus: number | undefined;
  let nextCalled = false;
  const fakeRes = {
    header: (name: string, value: string) => { headers[name] = value; },
    sendStatus: (code: number) => { sentStatus = code; },
  } as unknown as Response;
  const fakeReq = { method, headers: origin ? { origin } : {} } as unknown as Request;
  middleware(fakeReq, fakeRes, () => { nextCalled = true; });
  return { headers, sentStatus, nextCalled };
}

test("applyDevCors: adds headers for allowed localhost origin", () => {
  const middleware = mount({ isDev: true, allowedOrigins: DEV_ALLOW });
  assert.ok(middleware, "middleware was registered");
  const { headers, sentStatus, nextCalled } = run(middleware, { method: "GET", origin: "http://localhost:3000" });
  assert.equal(nextCalled, true);
  assert.equal(sentStatus, undefined, "sendStatus should not be called for non-OPTIONS");
  assert.equal(headers["Access-Control-Allow-Origin"], "http://localhost:3000");
  assert.equal(headers["Vary"], "Origin");
  assert.equal(headers["Access-Control-Allow-Headers"], "Content-Type");
  assert.equal(headers["Access-Control-Allow-Methods"], "GET,PUT,PATCH,OPTIONS");
});

test("applyDevCors: adds headers for allowed 127.0.0.1 origin", () => {
  const middleware = mount({ isDev: true, allowedOrigins: DEV_ALLOW });
  const { headers, nextCalled } = run(middleware!, { method: "POST", origin: "https://127.0.0.1:8080" });
  assert.equal(nextCalled, true);
  assert.equal(headers["Access-Control-Allow-Origin"], "https://127.0.0.1:8080");
});

test("applyDevCors: does not add headers for disallowed or missing origin", () => {
  const middleware = mount({ isDev: true, allowedOrigins: DEV_ALLOW });
  for (const origin of [undefined, "http://evil.com", "http://localhost", "http://not-localhost:3000"]) {
    const { headers, nextCalled } = run(middleware!, { method: "GET", origin });
    assert.equal(nextCalled, true);
    assert.equal(Object.keys(headers).length, 0, `Headers should be empty for origin: ${origin}`);
  }
});

test("applyDevCors: handles OPTIONS preflight request with 204 status", () => {
  const middleware = mount({ isDev: true, allowedOrigins: DEV_ALLOW });
  const { headers, sentStatus, nextCalled } = run(middleware!, { method: "OPTIONS", origin: "http://localhost:5173" });
  assert.equal(nextCalled, false, "next() must not be called on OPTIONS");
  assert.equal(sentStatus, 204);
  assert.deepEqual(headers, {
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,PUT,PATCH,OPTIONS",
  });
});

test("applyDevCors: production — a localhost origin gets no CORS headers and OPTIONS is not short-circuited", () => {
  const middleware = mount({ env: { NODE_ENV: "production", TOVU_RUNTIME_MODE: "production" } });
  for (const method of ["GET", "OPTIONS"]) {
    if (middleware === undefined) break; // nothing mounted at all is the strongest form of "off"
    const { headers, sentStatus, nextCalled } = run(middleware, { method, origin: "http://localhost:5173" });
    assert.deepEqual(headers, {}, `${method} must carry no CORS headers outside dev`);
    assert.equal(sentStatus, undefined, `${method} must not be answered by the CORS layer outside dev`);
    assert.equal(nextCalled, true);
  }
});

test("applyDevCors: dev — an origin not in the allow-list gets no headers and its OPTIONS falls through", () => {
  const middleware = mount({ isDev: true, allowedOrigins: ["http://localhost:5173"] });
  for (const method of ["GET", "OPTIONS"]) {
    const { headers, sentStatus, nextCalled } = run(middleware!, { method, origin: "http://localhost:9999" });
    assert.deepEqual(headers, {}, `${method} from an unlisted localhost port must carry no CORS headers`);
    assert.equal(sentStatus, undefined);
    assert.equal(nextCalled, true);
  }
});

test("isDevCorsEnabled: only NODE_ENV=development outside production runtime mode counts as dev", () => {
  assert.equal(isDevCorsEnabled({ env: { NODE_ENV: "development" } }), true);
  assert.equal(isDevCorsEnabled({ env: {} }), false);
  assert.equal(isDevCorsEnabled({ env: { NODE_ENV: "production" } }), false);
  assert.equal(isDevCorsEnabled({ env: { NODE_ENV: "development", TOVU_RUNTIME_MODE: "production" } }), false);
});

test("defaultDevCorsOrigins: the admin Vite dev origins, honoring TOVU_ADMIN_DEV_PORT", () => {
  assert.deepEqual(defaultDevCorsOrigins({ env: {} }), [
    "http://localhost:5173", "https://localhost:5173", "http://127.0.0.1:5173", "https://127.0.0.1:5173",
  ]);
  assert.ok(defaultDevCorsOrigins({ env: { TOVU_ADMIN_DEV_PORT: "5274" } }).includes("http://localhost:5274"));
  assert.ok(!defaultDevCorsOrigins({ env: { TOVU_ADMIN_DEV_PORT: "5274" } }).includes("http://localhost:5173"));
});
