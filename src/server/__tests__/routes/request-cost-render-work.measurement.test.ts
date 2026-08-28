import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerSiteRoutes } from "../../routes/site/pages.js";
import { registerProductRoutes } from "../../routes/site/products.js";
import { createSeoModule } from "../../runtime/composition/modules/seo.js";
import type { RouteDeps } from "../../routes/types.js";
import { startTestServer } from "../helpers/http-test-server.js";

/**
 * @file Measurement instrument — deliverable B of the public-site request-cost audit. What does one
 * render actually DO: how many calls land on each repo/port, and how long does the whole request
 * take end to end. MEASUREMENT-ONLY, NOT a correctness test. Run with:
 * `node --import tsx --test src/server/__tests__/routes/request-cost-render-work.measurement.test.ts`
 *
 * Method: wrap every object-with-methods on `RouteDeps` in a counting `Proxy` BEFORE handing it to
 * the route registrars, so every real call any helper function makes — `postRepo.listPublished`,
 * `presentationRepo.get`, `menuRepo.list`, whatever `resolveWidgetsForRender`/`buildExtraHead`/
 * `resolveStaticMenusForRender`/`tryRedirectPhase` touch internally — gets counted without needing
 * to trace each helper by hand or guess which deps matter. Real request through the real Express
 * app + `startTestServer`'s real `node:http` server (same harness as deliverable A).
 */

interface CallLog {
  counts: Record<string, number>;
  total: number;
}

/** Wraps every function-bearing object value on `target` in a counting `Proxy`. Shallow (one level
 *  — `RouteDeps`'s own top-level fields) because that is exactly where every repo/port lives; going
 *  deeper would also wrap plain data objects that happen to have methods (e.g. `Promise`s) and
 *  produce noise instead of signal. */
function instrumentDeps(deps: RouteDeps): CallLog {
  const log: CallLog = { counts: {}, total: 0 };
  for (const key of Object.keys(deps) as (keyof RouteDeps)[]) {
    const value = (deps as unknown as Record<string, unknown>)[key as string];
    if (value === null || typeof value !== "object") continue;
    if (value instanceof Promise) continue;
    const hasMethod = Object.getOwnPropertyNames(Object.getPrototypeOf(value) ?? {}).some(
      (p) => typeof (value as Record<string, unknown>)[p] === "function"
    ) || Object.values(value as Record<string, unknown>).some((v) => typeof v === "function");
    if (!hasMethod) continue;
    (deps as unknown as Record<string, unknown>)[key as string] = new Proxy(value, {
      get(target, prop, receiver) {
        const orig = Reflect.get(target, prop, receiver);
        if (typeof orig !== "function") return orig;
        return (...args: unknown[]) => {
          const label = `${String(key)}.${String(prop)}`;
          log.counts[label] = (log.counts[label] ?? 0) + 1;
          log.total += 1;
          return orig.apply(target, args);
        };
      },
    });
  }
  return log;
}

function buildInstrumentedApp(): { app: express.Express; log: CallLog } {
  const deps: RouteDeps = createRouteDeps();
  const log = instrumentDeps(deps);
  const app = express();
  createSeoModule(deps).registerRoutes?.(app);
  registerProductRoutes(app, deps);
  registerSiteRoutes(app, deps);
  return { app, log };
}

function logWork(route: string, log: CallLog, wallMs: number) {
  const sorted = Object.entries(log.counts).sort((a, b) => b[1] - a[1]);
  // eslint-disable-next-line no-console
  console.log(`WORK\t${route}\ttotal_repo_calls=${log.total}\twall_ms=${wallMs.toFixed(2)}\t${JSON.stringify(sorted)}`);
}

test("B: GET / (home) — repo/port call count and wall time", async (t) => {
  const { app, log } = buildInstrumentedApp();
  const baseUrl = await startTestServer(app, t);

  const start = performance.now();
  const res = await fetch(`${baseUrl}/`);
  const wallMs = performance.now() - start;
  await res.text();
  assert.equal(res.status, 200);
  logWork("GET /", log, wallMs);
  assert.ok(log.total > 0, "expected at least some repo/port calls for a real page render");
});

test("B: GET /:slug (real post, dynamic render) — repo/port call count and wall time", async (t) => {
  const { app, log } = buildInstrumentedApp();
  const baseUrl = await startTestServer(app, t);

  const start = performance.now();
  const res = await fetch(`${baseUrl}/the-weight-of-type`);
  const wallMs = performance.now() - start;
  await res.text();
  assert.equal(res.status, 200);
  logWork("GET /:slug (post)", log, wallMs);
});

test("B: GET /:slug (static-theme page, short-circuit path) — repo/port call count and wall time", async (t) => {
  const { app, log } = buildInstrumentedApp();
  const baseUrl = await startTestServer(app, t);

  const start = performance.now();
  const res = await fetch(`${baseUrl}/about`);
  const wallMs = performance.now() - start;
  await res.text();
  assert.equal(res.status, 200);
  logWork("GET /:slug (static theme page)", log, wallMs);
});

test("B: GET /products — repo/port call count and wall time", async (t) => {
  const { app, log } = buildInstrumentedApp();
  const baseUrl = await startTestServer(app, t);

  const start = performance.now();
  const res = await fetch(`${baseUrl}/products`);
  const wallMs = performance.now() - start;
  await res.text();
  logWork("GET /products", log, wallMs);
});

test("B: 10 sequential GET / requests — does repeat-visit work look any cheaper than the first (no memoization would mean no)?", async (t) => {
  const { app, log } = buildInstrumentedApp();
  const baseUrl = await startTestServer(app, t);

  const perRequestTotals: number[] = [];
  const perRequestBreakdowns: Record<string, number>[] = [];
  for (let i = 0; i < 10; i++) {
    const before = log.total;
    const beforeCounts = { ...log.counts };
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${baseUrl}/`);
    // eslint-disable-next-line no-await-in-loop
    await res.text();
    perRequestTotals.push(log.total - before);
    const delta: Record<string, number> = {};
    for (const [k, v] of Object.entries(log.counts)) delta[k] = v - (beforeCounts[k] ?? 0);
    perRequestBreakdowns.push(delta);
  }
  // eslint-disable-next-line no-console
  console.log(`WORK\tGET / x10 sequential\tper-request repo-call counts=${JSON.stringify(perRequestTotals)}`);
  // eslint-disable-next-line no-console
  console.log(`WORK\tGET / request #1 breakdown\t${JSON.stringify(perRequestBreakdowns[0])}`);
  // eslint-disable-next-line no-console
  console.log(`WORK\tGET / request #2 breakdown\t${JSON.stringify(perRequestBreakdowns[1])}`);
  assert.ok(perRequestTotals.every((n) => n > 0), "sanity: every request did real work");
});
