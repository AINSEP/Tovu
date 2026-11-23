import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { HttpClientPort } from "#src/platform/http/index";
import { buildChallengeMessage } from "../challenge.js";
import { PUBLISH_TRUST_ROUTES, isPublishTrustRoute } from "../grant.js";
import { fetchDestinationIdentity, PUBLISH_TRUST_HANDSHAKE_BASE, PublishTrustHandshakeError } from "../handshake-client.js";
import { deriveInstallationId, derivePublishSigningKey, PUBLISH_PRINCIPAL_ID_PREFIX, publishPrincipalIdFor } from "@jini-ai/cms/publish/trust/keys";
import { PUBLISH_TRUST_CONFIG_PATH, PUBLISH_TRUST_ENV_VAR } from "../provisioning.js";
import { mintPublishSession } from "../session.js";
import { createFixedKeyring } from "./support/fixed-keyring.js";

/**
 * @file T-FROZEN and T-D6: values that look like product branding but are DATA.
 *
 * Each literal below is signed, used as a key-derivation input, stored in a sealed record or an
 * audit row, or is a wire path or file name both sides of a publish must agree on. Renaming one
 * "for neutrality" compiles and passes every behaviour test that uses the constant on both sides,
 * and breaks every existing connection or sealed credential in the field. This file is the guard:
 * it pins each value to its literal, so a rename has to change this test on purpose.
 *
 * Where the value is not exported, it is pinned through the behaviour that carries it (the signed
 * message, the recorded derivation request, the failure code on the thrown error). Three values
 * have no behaviour seam a unit test can reach without the vault or the history store, so they are
 * pinned by reading the source; those pins search the two feature folders, not one file path, so
 * they keep working when a file is split.
 */

const FEATURES_DIR = fileURLToPath(new URL("../../", import.meta.url));

/** Production source lines of the two publishing feature folders (tests and UI excluded). */
function productionLines(): { file: string; line: string }[] {
  const lines: { file: string; line: string }[] = [];
  for (const feature of ["publish-content", "publish-trust"]) {
    const dir = path.join(FEATURES_DIR, feature);
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".ts"))) {
      for (const line of readFileSync(path.join(dir, name), "utf8").split("\n")) {
        lines.push({ file: `${feature}/${name}`, line });
      }
    }
  }
  return lines;
}

/** The lines that match `pattern`, with the file they are in. */
function linesMatching(pattern: RegExp): string[] {
  return productionLines().filter(({ line }) => pattern.test(line)).map(({ file, line }) => `${file}: ${line.trim()}`);
}

test("T-FROZEN: the challenge domain tag is the first line of the signed message", () => {
  const message = buildChallengeMessage({
    nonce: "n",
    targetInstallationId: "t",
    sourceInstallationId: "s",
    generation: 3,
    capabilities: ["b", "a"],
  });

  assert.equal(message, "tovu-publish-challenge-v1\nn\nt\ns\n3\na,b");
});

test("T-FROZEN: the three key-derivation purposes and their info strings", async () => {
  const { keyring, derives } = createFixedKeyring({ siteKeyHex: "0b".repeat(32) });

  const sourceInstallationId = await deriveInstallationId({ keyring, workspaceId: "ws" });
  await derivePublishSigningKey({ keyring, workspaceId: "ws", sourceInstallationId, targetOrigin: "https://d.example", generation: 1 });
  await mintPublishSession(
    {
      deps: { keyring, workspaceId: "ws", clock: { nowIso: () => "2026-11-16T00:00:00.000Z" } },
      input: { sourceInstallationId, targetInstallationId: "t", capabilities: [], generation: 1 }
    }
  );

  assert.deepEqual(derives, [
    { workspaceId: "ws", purpose: "publish-trust-installation-id", info: "self" },
    { workspaceId: "ws", purpose: "publish-trust-signing-key", info: `${sourceInstallationId}:https://d.example:v1` },
    { workspaceId: "ws", purpose: "publish-trust-session-key", info: "session-hmac" },
  ]);
});

test("T-FROZEN: the publishing principal id prefix stored in audit rows", () => {
  assert.equal(PUBLISH_PRINCIPAL_ID_PREFIX, "pub:");
  assert.equal(publishPrincipalIdFor({ sourceInstallationId: "abc" }), "pub:abc");
});

test("T-FROZEN: the handshake wire path", async () => {
  const urls: string[] = [];
  const httpClient: HttpClientPort = {
    send: async (request) => {
      urls.push(request.url);
      return { status: 200, headers: {}, bodyText: JSON.stringify({ installationId: "i", workspaceId: "w" }) };
    },
  };

  await fetchDestinationIdentity({ deps: { httpClient }, input: { baseUrl: "https://d.example" } });

  assert.equal(PUBLISH_TRUST_HANDSHAKE_BASE, "/api/publish-trust/v1");
  assert.deepEqual(urls, ["https://d.example/api/publish-trust/v1/identity"]);
});

test("T-FROZEN: the failure code callers switch on when the other side is not a peer site", async () => {
  const httpClient: HttpClientPort = { send: async () => ({ status: 404, headers: {}, bodyText: "" }) };

  await assert.rejects(
    fetchDestinationIdentity({ deps: { httpClient }, input: { baseUrl: "https://d.example" } }),
    (error: unknown) => error instanceof PublishTrustHandshakeError && error.failure === "not-a-tovu-site"
  );
});

test("T-FROZEN: the provisioning environment variable and config file names", () => {
  assert.equal(PUBLISH_TRUST_ENV_VAR, "TOVU_PUBLISH_TRUST");
  assert.equal(PUBLISH_TRUST_CONFIG_PATH, "deploy/publish-trust.json");
});

test("T-FROZEN: the vault scope bound into every sealed peer credential", () => {
  assert.deepEqual(linesMatching(/const peerScope = /), [
    'publish-content/peers.ts: const peerScope = { kind: "publish-peer" as const, ownerKey: "tovu", principalId: null, provider: null };',
  ]);
  // The read side refuses a record of any other kind or owner; it must name the same two literals.
  assert.deepEqual(linesMatching(/const wrongKind = /), [
    'publish-content/peers.ts: const wrongKind = record.kind !== "publish-peer" || record.ownerKey !== "tovu";',
  ]);
});

test("T-FROZEN: the history row kind already saved for a publish to a peer site", () => {
  // Value lines only: the row's `readonly kind: "tovu-peer"` type declaration names the same literal.
  const rows = linesMatching(/(?<!readonly )kind: "tovu-peer"/);

  assert.equal(rows.length, 1, rows.join("\n"));
  assert.match(rows[0] ?? "", /^publish-content\/peer-transport\.ts: kind: "tovu-peer", target: deps\.credential\.id,/);
});

test("T-FROZEN: the deploy-config key that names a site's public address", () => {
  assert.deepEqual(linesMatching(/const PUBLIC_URL_KEY = /), ['publish-trust/connect.ts: const PUBLIC_URL_KEY = "TOVU_PUBLIC_URL";']);
});

/**
 * T-D6. The set of routes a publishing session may call. A session token carries no route list on
 * purpose; this list is the whole surface. A route cannot join it without changing this test.
 */
const PINNED_ROUTES_2026_11_16 = [
  "PUT /api/admin/v1/workspaces/:workspaceId/site-shares/artifacts/:token/:file",
  "DELETE /api/admin/v1/workspaces/:workspaceId/site-shares/artifacts/:token/:file",
  "GET /api/admin/v1/workspaces/:workspaceId/publish-content/export",
  "GET /api/admin/v1/workspaces/:workspaceId/publish-content/capabilities",
  "POST /api/admin/v1/workspaces/:workspaceId/publish-content/blobs/probe",
  "PUT /api/admin/v1/workspaces/:workspaceId/publish-content/blobs/:sha",
  "GET /api/admin/v1/workspaces/:workspaceId/publish-content/blobs/:sha",
  "POST /api/admin/v1/workspaces/:workspaceId/publish-content/bundles",
  "POST /api/admin/v1/workspaces/:workspaceId/publish-content/import/plan",
  "POST /api/admin/v1/workspaces/:workspaceId/publish-content/import/confirm",
  "POST /api/admin/v1/workspaces/:workspaceId/publish-content/import/execute",
];

test("T-D6: the trusted-route list is exactly the pinned set", () => {
  assert.deepEqual(PUBLISH_TRUST_ROUTES.map((route) => `${route.method} ${route.path}`), PINNED_ROUTES_2026_11_16);
});

test("T-D6: a route outside the list, another method, or a dot segment is not a trusted route", () => {
  const base = "/api/admin/v1/workspaces/ws-1/publish-content";

  assert.equal(isPublishTrustRoute({ method: "post", path: `${base}/bundles?x=1` }), true);
  assert.equal(isPublishTrustRoute({ method: "GET", path: `${base}/bundles` }), false);
  assert.equal(isPublishTrustRoute({ method: "POST", path: `${base}/peers` }), false);
  assert.equal(isPublishTrustRoute({ method: "POST", path: `${base}/bundles/extra` }), false);
  assert.equal(isPublishTrustRoute({ method: "GET", path: `${base}/blobs/..` }), false);
  assert.equal(isPublishTrustRoute({ method: "GET", path: "/api/admin/v1/workspaces//publish-content/export" }), false);
});
