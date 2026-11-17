import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";

import type { Express } from "express";

import { createApp, createRouteDeps } from "../app.js";

/**
 * @file Characterization pin (design 02, step 0): the ORDER of everything `createApp` registers on
 * the Express app, per option variant. Registration order is behaviour here (the site catch-all is
 * last; the admin session gate precedes the admin routes; the oversized-body responder answers
 * last), so the extraction of `createApp`'s helpers and mounts into `http-app/*` must leave this
 * table byte-identical.
 *
 * Each row is `index | kind | method(s) path | handler names`. It pins ORDER and shape only —
 * behaviour is pinned separately (`create-app-lifecycle.pin.test.ts`, `create-app-precedence.pin.test.ts`).
 * To regenerate after an INTENDED change: `UPDATE_ROUTE_TABLE_PIN=1` then review the diff.
 */

const SNAPSHOT_URL = new URL("./fixtures/create-app-route-table.snapshot.json", import.meta.url);

interface RouterLayer {
  name: string;
  regexp: { source: string; fast_slash?: boolean };
  route?: { path: unknown; methods: Record<string, boolean>; stack: { name: string }[] };
  handle: { stack?: RouterLayer[] };
}

/** Flatten one router stack into stable rows; nested routers are walked in place, indented. */
function describeStack(stack: RouterLayer[], depth = 0): string[] {
  const rows: string[] = [];
  stack.forEach((layer, index) => {
    const pad = "  ".repeat(depth);
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).sort().join(",");
      const handlers = layer.route.stack.map((entry) => entry.name || "<anonymous>").join(">");
      rows.push(`${pad}${index} route ${methods} ${String(layer.route.path)} [${handlers}]`);
      return;
    }
    const pattern = layer.regexp.fast_slash ? "/" : layer.regexp.source;
    rows.push(`${pad}${index} use ${layer.name || "<anonymous>"} ${pattern}`);
    if (layer.handle.stack) rows.push(...describeStack(layer.handle.stack, depth + 1));
  });
  return rows;
}

function routeTable(app: Express): string[] {
  const router = (app as unknown as { _router: { stack: RouterLayer[] } })._router;
  return describeStack(router.stack);
}

/** The in-memory root has no cookie-consent publication; `consentAudit` only matters when one exists. */
function withCookieConsent(deps: ReturnType<typeof createRouteDeps>): ReturnType<typeof createRouteDeps> {
  deps.cookieConsent = { regionResolvers: async () => [] } as unknown as typeof deps.cookieConsent;
  return deps;
}

type Variant = { name: string; build: () => Express };

const VARIANTS: Variant[] = [
  { name: "default", build: () => createApp(createRouteDeps()) },
  { name: "activateAssistantFederation", build: () => createApp(createRouteDeps(), { activateAssistantFederation: true }) },
  { name: "adminAssistantOff", build: () => {
    const deps = createRouteDeps();
    deps.adminAssistantEnabled = false;
    return createApp(deps);
  } },
  { name: "themeIdOverride", build: () => createApp(createRouteDeps(), { themeIdOverride: "route-table-probe" }) },
  { name: "cookieConsentPresent", build: () => createApp(withCookieConsent(createRouteDeps())) },
  { name: "consentAudit", build: () => createApp(withCookieConsent(createRouteDeps()), { consentAudit: true }) },
  { name: "stopForIdle", build: () => createApp(createRouteDeps(), { stopForIdle: () => undefined }) },
];

const tables = Object.fromEntries(VARIANTS.map((variant) => [variant.name, routeTable(variant.build())]));

if (process.env.UPDATE_ROUTE_TABLE_PIN === "1") {
  writeFileSync(SNAPSHOT_URL, `${JSON.stringify(tables, null, 1)}\n`);
}
const pinned = JSON.parse(readFileSync(SNAPSHOT_URL, "utf8")) as Record<string, string[]>;

for (const { name } of VARIANTS) {
  test(`createApp route table (${name}) keeps its pinned registration order`, () => {
    assert.deepEqual(tables[name], pinned[name]);
  });
}

test("the route table is deterministic: building the same variant twice yields the same table", () => {
  assert.deepEqual(routeTable(VARIANTS[0]!.build()), tables.default);
});

test("the option variants really differ from the default (the pin can see each option)", () => {
  for (const name of ["activateAssistantFederation", "adminAssistantOff", "themeIdOverride", "cookieConsentPresent", "stopForIdle"]) {
    assert.notDeepEqual(tables[name], tables.default, `${name} must change the table`);
  }
  assert.notDeepEqual(tables.consentAudit, tables.cookieConsentPresent, "consentAudit must drop the consent middleware");
  assert.deepEqual(tables.consentAudit, tables.default, "with consentAudit the table is the no-consent table");
});

test("the site catch-all and the closing error handlers are the last registrations", () => {
  const rows = tables.default!;
  const siteRoute = rows.findIndex((row) => row.includes("route get /:slug"));
  assert.ok(siteRoute > 0, "the site /:slug catch-all is registered");
  assert.ok(siteRoute > rows.findIndex((row) => row.includes("route post /forms/:slug/submit")), "after the public visitor routes");
  assert.deepEqual(rows.slice(siteRoute + 1).map((row) => row.replace(/^\d+ /, "")), ["use respondToOversizedBody /", "use captureRouteError /"]);
});
