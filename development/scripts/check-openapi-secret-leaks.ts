/**
 * check-openapi-secret-leaks.ts — do any real API response bodies leak secret-shaped material?
 *
 * Boots a REAL Tovu server (same `createApp()` composition root `check-openapi-contract.ts` uses)
 * and fires real HTTP requests, then scans every real response body for the credential-shaped
 * patterns in `lib/secret-patterns.ts`. Two complementary techniques:
 *
 * 1. **Canary injection** (deterministic, zero false positives): PUT a unique, unmistakable fake
 *    secret into the ONE route this repo's own OpenAPI docs explicitly promise is safe —
 *    `replace_media_providers` / `get_media_providers` in `openapi/021-media-assets.yaml`, whose
 *    `200` response literally says "no API key material is returned." This generalizes the
 *    ALREADY-PASSING Tovu test `src/server/__tests__/admin-media-provider-routes.test.ts`'s "a key
 *    PUT over HTTP round-trips through GET as markers, and never appears in any body" assertion —
 *    that test only checks the immediate PUT/GET pair; this check greps the canary against EVERY
 *    response body collected during the whole run, so an unrelated route accidentally serializing
 *    the same credential store would also be caught.
 * 2. **Generic pattern sweep**: every response body collected while probing every `GET` operation
 *    (idempotent, safe to call broadly) and every collection-create `POST`/`PUT`/`PATCH` operation
 *    (workspace-only path, sent an empty `{}` body — same reachable-without-fixtures set
 *    `check-openapi-contract.ts`'s `VALIDATION_400` probe uses) is scanned for the credential-shaped
 *    regexes in `lib/secret-patterns.ts`.
 *
 * A pattern match is reported at HIGH severity when the operation's own documented success
 * response explicitly claims no secret material is returned (a broken promise, not just a
 * possible leak) and at MEDIUM severity otherwise (still worth a human look, but the docs never
 * claimed otherwise).
 *
 * Deferred for v1 (see the Coverage section the run prints):
 * - Update-by-id (`PUT`/`PATCH .../{id}`) operations that need a real pre-existing resource before
 *   they return anything scannable — same fixture-seeding gap `check-openapi-contract.ts` defers.
 * - Response HEADERS (only bodies are scanned, per the brief) and Set-Cookie session tokens, which
 *   are a different, already-well-trodden concern (httpOnly/secure cookie flags), not a body leak.
 *
 * Usage: npx tsx development/scripts/check-openapi-secret-leaks.ts
 */
import { randomUUID } from "node:crypto";
import path from "node:path";

import { buildUrl, loadOpenApiOperations, type OpenApiOperation } from "./lib/openapi-operations.js";
import { scanForSecrets, type SecretMatch } from "./lib/secret-patterns.js";
import { loginOwner, startTovuServer } from "./lib/tovu-test-server.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const OPENAPI_DIR = path.join(REPO_ROOT, "openapi");
const WORKSPACE_ID = "workspace-local";

/** Words that, present anywhere in an operation's documented success-response description, count
 *  as an explicit "nothing sensitive is returned" contract claim — matched loosely on purpose
 *  (these are hand-written prose, not a controlled vocabulary; see `021-media-assets.yaml`'s "no
 *  API key material is returned" and "Provider markers" for the two real phrasings that exist
 *  today). A false negative here just downgrades a finding from HIGH to MEDIUM, never hides it. */
const NO_SECRET_CLAIM_PATTERN = /no api key material|markers[ -]?only|no secret material|redacted/i;

interface CapturedResponse {
  readonly op: OpenApiOperation;
  readonly requestedUrl: string;
  readonly status: number;
  readonly body: string;
}

interface Finding {
  readonly severity: "HIGH" | "MEDIUM";
  readonly captured: CapturedResponse;
  readonly match: SecretMatch;
  readonly reason: string;
}

async function capture(op: OpenApiOperation, baseUrl: string, cookie: string, jsonBody: string | undefined): Promise<CapturedResponse> {
  const url = buildUrl(op, { workspaceId: WORKSPACE_ID });
  const headers: Record<string, string> = op.requiresAuth ? { cookie } : {};
  const init: RequestInit = { method: op.method.toUpperCase(), headers };
  if (jsonBody !== undefined) {
    init.headers = { ...headers, "content-type": "application/json" };
    init.body = jsonBody;
  }
  const res = await fetch(`${baseUrl}${url}`, init);
  const body = await res.text();
  return { op, requestedUrl: url, status: res.status, body };
}

function isCollectionCreate(op: OpenApiOperation): boolean {
  return ["post", "put", "patch"].includes(op.method) && op.requestBodyRequired && op.pathParams.length <= 1;
}

function classify(captured: CapturedResponse, match: SecretMatch): Finding {
  const description = captured.op.successResponse?.description ?? "";
  const claimsSafe = NO_SECRET_CLAIM_PATTERN.test(description);
  return {
    severity: claimsSafe ? "HIGH" : "MEDIUM",
    captured,
    match,
    reason: claimsSafe
      ? `documented response explicitly claims no secret material is returned ("${description}") — this is a broken promise`
      : "no explicit no-secrets claim in the docs, but the response body matches a credential-shaped pattern",
  };
}

async function main(): Promise<void> {
  const operations = loadOpenApiOperations(OPENAPI_DIR);
  const server = await startTovuServer();
  const ownerCookie = await loginOwner(server.baseUrl);
  console.log(`check:openapi-secret-leaks — real server booted at ${server.baseUrl}`);

  // --- Technique 1: canary injection into the one route that promises safety ------------------
  const canary = `CANARY-SECRET-${randomUUID()}`;
  const providersUrl = `/api/admin/v1/workspaces/${WORKSPACE_ID}/media/providers`;
  const putRes = await fetch(`${server.baseUrl}${providersUrl}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ openai: { apiKey: canary, baseUrl: "https://api.openai.com/v1", model: "dall-e-3" } }),
  });
  const putBody = await putRes.text();
  console.log(`check:openapi-secret-leaks — canary PUT to ${providersUrl}: ${putRes.status}`);
  if (putRes.status !== 200) {
    console.warn(`  [setup] canary PUT did not return 200 (got ${putRes.status}) — canary technique may not have taken effect: ${putBody.slice(0, 200)}`);
  }
  const getRes = await fetch(`${server.baseUrl}${providersUrl}`, { headers: { cookie: ownerCookie } });
  const getBody = await getRes.text();

  const captured: CapturedResponse[] = [
    { op: operations.find((o) => o.operationId === "replace_media_providers")!, requestedUrl: providersUrl, status: putRes.status, body: putBody },
    { op: operations.find((o) => o.operationId === "get_media_providers")!, requestedUrl: providersUrl, status: getRes.status, body: getBody },
  ];

  // --- Technique 2: generic sweep across every GET and every collection-create --------------
  // Skips the 2 media-provider ops: already captured above via the canary technique, and an
  // empty-body PUT sweep pass would clear the just-injected canary before technique 1 could be
  // fully evaluated (see `admin-media-provider-routes.test.ts`'s "an empty map clears everything
  // over the wire").
  const mediaProviderOps = new Set(["get_media_providers", "replace_media_providers"]);
  for (const op of operations) {
    if (mediaProviderOps.has(op.operationId)) continue;
    if (op.method === "get") {
      captured.push(await capture(op, server.baseUrl, ownerCookie, undefined));
    } else if (isCollectionCreate(op)) {
      captured.push(await capture(op, server.baseUrl, ownerCookie, "{}"));
    }
  }

  await server.close();
  console.log(`check:openapi-secret-leaks — collected ${captured.length} real response bodies (1 GET/create-eligible pass + the canary pair)\n`);

  // --- Scan everything collected for the literal canary, anywhere -----------------------------
  const canaryLeaks = captured.filter((c) => c.body.includes(canary));
  // --- Scan everything collected for generic secret-shaped patterns ---------------------------
  const findings: Finding[] = [];
  for (const c of captured) {
    for (const match of scanForSecrets(c.body)) findings.push(classify(c, match));
  }

  console.log("=".repeat(78));
  console.log(`CANARY CHECK — injected via PUT ${providersUrl}, searched all ${captured.length} captured bodies`);
  console.log("=".repeat(78));
  if (canaryLeaks.length === 0) {
    console.log("OK: the injected canary secret never appeared in any captured response body.");
  } else {
    console.log(`LEAK: the injected canary secret appeared in ${canaryLeaks.length} response(s):`);
    for (const c of canaryLeaks) {
      console.log(`  - ${c.op.file} :: ${c.op.operationId} (${c.op.method.toUpperCase()} ${c.requestedUrl}, status ${c.status})`);
    }
  }

  console.log(`\n${"=".repeat(78)}`);
  console.log(`GENERIC PATTERN SWEEP — ${findings.length} finding(s) across ${captured.length} captured bodies`);
  console.log("=".repeat(78));
  const high = findings.filter((f) => f.severity === "HIGH");
  const medium = findings.filter((f) => f.severity === "MEDIUM");
  console.log(`${high.length} HIGH severity (documented no-secrets claim, pattern matched anyway)`);
  console.log(`${medium.length} MEDIUM severity (pattern matched, no explicit doc claim either way)`);
  for (const f of [...high, ...medium]) {
    console.log(`\n[${f.severity}] ${f.captured.op.file} :: ${f.captured.op.operationId} (${f.captured.op.method.toUpperCase()} ${f.captured.requestedUrl}, status ${f.captured.status})`);
    console.log(`  pattern: ${f.match.patternName}`);
    console.log(`  matched: ${f.match.matchedText}`);
    console.log(`  ${f.reason}`);
  }

  const notCovered = operations.filter((op) => !mediaProviderOps.has(op.operationId) && op.method !== "get" && !isCollectionCreate(op));
  console.log(`\n${"=".repeat(78)}`);
  console.log(`COVERAGE — ${captured.length} of ${operations.length} operations produced a captured body (GETs + collection-creates + the 2 canary-technique media-provider ops); ${notCovered.length} update/delete-by-id operations deferred (need a real pre-existing resource first, same gap check-openapi-contract.ts documents)`);
  console.log("=".repeat(78));

  if (canaryLeaks.length > 0 || high.length > 0) {
    process.exitCode = 1;
  } else if (medium.length > 0) {
    console.log("\ncheck:openapi-secret-leaks — MEDIUM findings only: review, but not failing the build for v1 (no confirmed broken doc promise or canary leak).");
  } else {
    console.log("\ncheck:openapi-secret-leaks — OK: no canary leak and no credential-shaped pattern found in any captured response.");
  }
}

main().catch((err) => {
  console.error("check:openapi-secret-leaks — crashed:", err);
  process.exitCode = 1;
});
