/**
 * check-openapi-contract.ts — do live routes actually return the status codes `openapi/*.yaml`
 * documents for them?
 *
 * Boots a REAL Tovu server (`createApp()`, the same composition root
 * `admin-post-page-delete-routes.test.ts` and friends use) against real in-memory repos, then
 * fires real HTTP requests designed to land on each documented error status and asserts the real
 * response status matches. Every probe below is GENERIC (derived mechanically from the spec, not
 * hand-written per route) except the three `IDEMPOTENCY_409` probes, which mirror the
 * `Idempotency-Key`-replay pattern `src/server/__tests__/admin-post-page-delete-routes.test.ts` /
 * `forms-admin-crud.test.ts` already established for those exact three routes.
 *
 * ## What is (and isn't) probed, and why
 *
 * - **401** (Unauthenticated): every op documenting 401 whose spec requires auth — real request
 *   with no session cookie at all.
 * - **403** (Forbidden): every op documenting 403 whose spec requires auth — real request from a
 *   REAL logged-in principal with zero role/policy grants (mirrors 25+ existing route tests'
 *   `loginAsBarePrincipal` pattern), not a stubbed 403.
 * - **404 (workspace)**: every op with a `{workspaceId}` path param documenting 404 — real request
 *   against a workspace id that does not exist.
 * - **404 (resource)**: every op with 2+ path params documenting 404 — real request with a valid
 *   workspace but a nonexistent id in the last path segment.
 * - **400 (create-body validation)**: every `POST`/`PUT`/`PATCH` op whose ONLY path param is
 *   `workspaceId` (i.e. a collection-create, not an update-by-id) with a required body and a
 *   documented 400 — real request with an empty `{}` body.
 * - **409 (idempotency replay)**: hardcoded to the 3 routes with an existing test precedent for
 *   this exact mechanism (`create_post`, `create_page`, `create_form_definition`) — replays the
 *   same `Idempotency-Key` twice and asserts the second response is 409.
 *
 * Explicitly OUT OF SCOPE for this v1 (see the Coverage Report the run prints — reasons are
 * per-operation, not blanket):
 * - **413** (payload-too-large) — would need each route's real byte ceiling to craft a safely
 *   oversized-but-not-huge body; not derivable from the spec alone.
 * - **500** (internal error) — deliberately not forced; there is no safe, generic way to make a
 *   real handler throw without either mocking internals (defeats the point of a REAL contract
 *   check) or exploiting a specific known bug per route.
 * - **400/409 on update-by-id routes** (`PUT`/`PATCH .../{id}`) — reaching real validation/conflict
 *   logic on these needs a real pre-existing resource seeded first; deferred to a v2 that adds
 *   per-feature fixture builders.
 * - **422/429/503/410/416** — each is route-specific (e.g. rate limiting, range requests) rather
 *   than a mechanically derivable probe; not attempted here.
 *
 * All requests run against `createRouteDeps()`'s in-memory repos (see `src/server/app.ts`) — the
 * server is thrown away when the script exits, so nothing here touches a persisted database.
 *
 * Usage: npx tsx development/scripts/check-openapi-contract.ts
 */
import path from "node:path";

import { buildUrl, loadOpenApiOperations, type OpenApiOperation } from "./lib/openapi-operations.js";
import { loginBarePrincipal, loginOwner, startTovuServer } from "./lib/tovu-test-server.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const OPENAPI_DIR = path.join(REPO_ROOT, "openapi");
const WORKSPACE_ID = "workspace-local";

type ProbeType = "AUTH_401" | "PERM_403" | "WORKSPACE_404" | "RESOURCE_404" | "VALIDATION_400" | "IDEMPOTENCY_409";

interface ProbeResult {
  readonly probeType: ProbeType;
  readonly file: string;
  readonly operationId: string;
  readonly method: string;
  readonly requestedUrl: string;
  readonly expectedStatus: string;
  readonly actualStatus: number;
  readonly pass: boolean;
  readonly bodySnippet?: string;
}

function snippet(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

function cookieHeader(op: OpenApiOperation, cookie: string): Record<string, string> {
  return op.requiresAuth ? { cookie } : {};
}

async function runProbe(
  probeType: ProbeType,
  op: OpenApiOperation,
  expectedStatus: string,
  baseUrl: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined
): Promise<ProbeResult> {
  const init: RequestInit = { method: op.method.toUpperCase(), headers };
  if (body !== undefined) init.body = body;
  const res = await fetch(`${baseUrl}${url}`, init);
  const bodyText = await res.text();
  const pass = String(res.status) === expectedStatus;
  return {
    probeType,
    file: op.file,
    operationId: op.operationId,
    method: op.method.toUpperCase(),
    requestedUrl: url,
    expectedStatus,
    actualStatus: res.status,
    pass,
    bodySnippet: pass ? undefined : snippet(bodyText),
  };
}

function jsonBody(op: OpenApiOperation, headers: Record<string, string>): { headers: Record<string, string>; body: string | undefined } {
  if (!op.requestBodyRequired) return { headers, body: undefined };
  return { headers: { ...headers, "content-type": "application/json" }, body: "{}" };
}

async function probeAuth401(op: OpenApiOperation, baseUrl: string): Promise<ProbeResult> {
  const url = buildUrl(op, { workspaceId: WORKSPACE_ID });
  const { headers, body } = jsonBody(op, {});
  return runProbe("AUTH_401", op, "401", baseUrl, url, headers, body);
}

async function probePerm403(op: OpenApiOperation, baseUrl: string, bareCookie: string): Promise<ProbeResult> {
  const url = buildUrl(op, { workspaceId: WORKSPACE_ID });
  const { headers, body } = jsonBody(op, { cookie: bareCookie });
  return runProbe("PERM_403", op, "403", baseUrl, url, headers, body);
}

async function probeWorkspace404(op: OpenApiOperation, baseUrl: string, ownerCookie: string): Promise<ProbeResult> {
  const url = buildUrl(op, { workspaceId: "does-not-exist-workspace" });
  const { headers, body } = jsonBody(op, cookieHeader(op, ownerCookie));
  return runProbe("WORKSPACE_404", op, "404", baseUrl, url, headers, body);
}

async function probeResource404(op: OpenApiOperation, baseUrl: string, ownerCookie: string): Promise<ProbeResult> {
  const lastParam = op.pathParams[op.pathParams.length - 1];
  const url = buildUrl(op, { workspaceId: WORKSPACE_ID, [lastParam]: "does-not-exist-resource-id" });
  const { headers, body } = jsonBody(op, cookieHeader(op, ownerCookie));
  return runProbe("RESOURCE_404", op, "404", baseUrl, url, headers, body);
}

async function probeValidation400(op: OpenApiOperation, baseUrl: string, ownerCookie: string): Promise<ProbeResult> {
  const url = buildUrl(op, { workspaceId: WORKSPACE_ID });
  const headers = { ...cookieHeader(op, ownerCookie), "content-type": "application/json" };
  return runProbe("VALIDATION_400", op, "400", baseUrl, url, headers, "{}");
}

interface IdempotencyTarget {
  readonly operationId: string;
  readonly file: string;
  readonly url: string;
  readonly body: Record<string, unknown>;
}

const IDEMPOTENCY_PROBES: readonly IdempotencyTarget[] = [
  {
    operationId: "create_post",
    file: "002-content-entry-authoring.yaml",
    url: `/api/admin/v1/workspaces/${WORKSPACE_ID}/posts`,
    body: { title: "OpenAPI Contract Probe Post" },
  },
  {
    operationId: "create_page",
    file: "002-content-entry-authoring.yaml",
    url: `/api/admin/v1/workspaces/${WORKSPACE_ID}/pages`,
    body: { title: "OpenAPI Contract Probe Page" },
  },
  {
    operationId: "create_form_definition",
    file: "010-forms.yaml",
    url: `/api/admin/v1/workspaces/${WORKSPACE_ID}/forms`,
    body: {
      name: "OpenAPI Contract Probe Form",
      slug: "openapi-contract-probe-form",
      fields: [{ id: "name", label: "Name", type: "text", required: true }],
    },
  },
];

async function probeIdempotency409(target: IdempotencyTarget, baseUrl: string, ownerCookie: string): Promise<ProbeResult> {
  const idempotencyKey = `openapi-contract-probe-${target.operationId}`;
  const headers = { "content-type": "application/json", cookie: ownerCookie, "Idempotency-Key": idempotencyKey };
  const send = () => fetch(`${baseUrl}${target.url}`, { method: "POST", headers, body: JSON.stringify(target.body) });

  const first = await send();
  if (first.status !== 201) {
    console.warn(`  [setup] ${target.operationId}: first create returned ${first.status}, not 201 — the 409 replay below is still meaningful but its setup was unexpected`);
  }
  const second = await send();
  const bodyText = await second.text();
  const pass = second.status === 409;
  return {
    probeType: "IDEMPOTENCY_409",
    file: target.file,
    operationId: target.operationId,
    method: "POST",
    requestedUrl: target.url,
    expectedStatus: "409",
    actualStatus: second.status,
    pass,
    bodySnippet: pass ? undefined : snippet(bodyText),
  };
}

/**
 * Best-effort human-readable hint for WHY a mismatch happened, printed alongside the raw
 * expected/actual so a reader doesn't have to re-derive it. This is a hint, not a suppression —
 * the mismatch still counts as a failure (a human should look at it), it's just pre-annotated with
 * the most common known cause: several handlers validate the request body before checking
 * authorization or resource existence, so a `PERM_403`/`RESOURCE_404` probe sent against a
 * body-required route with an empty `{}` body lands on a 400 instead of the status being probed —
 * that by itself doesn't prove the documented 403/404 is unreachable, only that this probe's empty
 * body can't isolate the path being tested for THIS operation.
 */
function mismatchHint(f: ProbeResult): string | undefined {
  if ((f.probeType === "PERM_403" || f.probeType === "RESOURCE_404") && f.actualStatus === 400) {
    return "likely probe limitation: this handler validates the request body before checking auth/resource-existence, so the empty probe body short-circuits before reaching the path being tested — not proof the documented status is wrong, re-check with a schema-valid body";
  }
  return undefined;
}

interface CoverageGap {
  readonly key: string;
  readonly reason: string;
}

function coverageGaps(operations: readonly OpenApiOperation[], touched: ReadonlySet<string>): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const op of operations) {
    const key = `${op.file}#${op.operationId}`;
    if (touched.has(key)) continue;
    const errorCodes = op.statusCodes.filter((s) => Number(s) >= 400);
    if (errorCodes.length === 0) {
      gaps.push({ key, reason: "no documented error status — nothing to contract-check" });
      continue;
    }
    gaps.push({ key, reason: `documents ${errorCodes.join(",")} but none are covered by a v1 probe (see file header for why)` });
  }
  return gaps;
}

async function main(): Promise<void> {
  const operations = loadOpenApiOperations(OPENAPI_DIR);
  console.log(`check:openapi-contract — parsed ${operations.length} operations from ${OPENAPI_DIR}`);

  const server = await startTovuServer();
  const ownerCookie = await loginOwner(server.baseUrl);
  const bareCookie = await loginBarePrincipal(server.routeDeps, server.baseUrl);
  console.log(`check:openapi-contract — real server booted at ${server.baseUrl}\n`);

  const results: ProbeResult[] = [];
  const touched = new Set<string>();

  for (const op of operations) {
    const key = `${op.file}#${op.operationId}`;
    if (op.requiresAuth && op.statusCodes.includes("401")) {
      results.push(await probeAuth401(op, server.baseUrl));
      touched.add(key);
    }
    if (op.requiresAuth && op.statusCodes.includes("403")) {
      results.push(await probePerm403(op, server.baseUrl, bareCookie));
      touched.add(key);
    }
    if (op.pathParams.includes("workspaceId") && op.statusCodes.includes("404")) {
      results.push(await probeWorkspace404(op, server.baseUrl, ownerCookie));
      touched.add(key);
    }
    if (op.pathParams.length >= 2 && op.statusCodes.includes("404")) {
      results.push(await probeResource404(op, server.baseUrl, ownerCookie));
      touched.add(key);
    }
    if (
      ["post", "put", "patch"].includes(op.method) &&
      op.requestBodyRequired &&
      op.pathParams.length <= 1 &&
      op.statusCodes.includes("400")
    ) {
      results.push(await probeValidation400(op, server.baseUrl, ownerCookie));
      touched.add(key);
    }
  }

  for (const target of IDEMPOTENCY_PROBES) {
    results.push(await probeIdempotency409(target, server.baseUrl, ownerCookie));
    touched.add(`${target.file}#${target.operationId}`);
  }

  await server.close();

  const byType = new Map<ProbeType, ProbeResult[]>();
  for (const r of results) byType.set(r.probeType, [...(byType.get(r.probeType) ?? []), r]);

  console.log("=".repeat(78));
  console.log("RESULTS BY PROBE TYPE");
  console.log("=".repeat(78));
  for (const [type, rs] of byType) {
    const pass = rs.filter((r) => r.pass).length;
    console.log(`${type}: ${pass}/${rs.length} passed`);
  }

  const failures = results.filter((r) => !r.pass);
  const hinted = failures.filter((f) => mismatchHint(f) !== undefined);
  console.log(`\nTOTAL: ${results.length - failures.length}/${results.length} passed`);
  if (failures.length > 0) {
    console.log(`  ${failures.length - hinted.length} likely confirmed contract mismatch(es), ${hinted.length} flagged as a probable probe limitation (see hints below) — both still need a human look`);
  }
  console.log();

  if (failures.length > 0) {
    console.log("=".repeat(78));
    console.log(`MISMATCHES (${failures.length}) — spec says one status, live server returned another`);
    console.log("=".repeat(78));
    for (const f of failures) {
      console.log(`\n[${f.probeType}] ${f.file} :: ${f.operationId} (${f.method} ${f.requestedUrl})`);
      console.log(`  expected ${f.expectedStatus}, got ${f.actualStatus}`);
      if (f.bodySnippet) console.log(`  body: ${f.bodySnippet}`);
      const hint = mismatchHint(f);
      if (hint) console.log(`  hint: ${hint}`);
    }
    console.log();
  }

  const gaps = coverageGaps(operations, touched);
  console.log("=".repeat(78));
  console.log(`COVERAGE — ${touched.size}/${operations.length} operations touched by at least one probe`);
  console.log("=".repeat(78));
  const noErrorContract = gaps.filter((g) => g.reason.startsWith("no documented"));
  const deferredContract = gaps.filter((g) => !g.reason.startsWith("no documented"));
  console.log(`${noErrorContract.length} operations document no error status at all (nothing to check)`);
  console.log(`${deferredContract.length} operations have a documented error status this v1 doesn't probe (413/500/422/429/503/410/416, or 400/409 on update-by-id routes needing a seeded fixture):`);
  for (const g of deferredContract) console.log(`  - ${g.key}: ${g.reason}`);

  if (failures.length > 0) {
    process.exitCode = 1;
  } else {
    console.log("\ncheck:openapi-contract — OK: every probed operation's live status matched its documented contract.");
  }
}

main().catch((err) => {
  console.error("check:openapi-contract — crashed:", err);
  process.exitCode = 1;
});
