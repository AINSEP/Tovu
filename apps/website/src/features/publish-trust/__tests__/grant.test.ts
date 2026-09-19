import assert from "node:assert/strict";
import test from "node:test";

import {
  grantAllowsCapability,
  grantAllowsEntityType,
  isGrantActive,
  isPublishTrustRoute,
  parsePublishTrustGrant,
  PUBLISH_TRUST_GRANT_VERSION,
  PUBLISH_TRUST_ROUTES,
} from "../grant.js";

/**
 * @file Authority-narrowing proofs for the publishing grant.
 *
 * The headline property, and the direct answer to Codex's finding that publishing rides the general
 * auth path on ordinary `content.write`: **a stolen publishing credential must not be able to do
 * more than publish.** The two tests that prove it are "a grant claiming content.write is refused"
 * and "the create-post route is not a publishing route".
 */

function validGrantDoc(overrides: Record<string, unknown> = {}) {
  return {
    version: PUBLISH_TRUST_GRANT_VERSION,
    sourceInstallationId: "src-install",
    publicKeys: [{ publicKeyB64u: "AAAA", generation: 1 }],
    workspaceId: "ws-1",
    entityTypes: ["post", "media"],
    capabilities: ["publish_content.read", "publish_content.apply"],
    notAfter: "2099-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function parseOrThrow(doc: Record<string, unknown>) {
  const result = parsePublishTrustGrant(doc);
  assert.ok(result.ok, `expected a valid grant, got: ${result.ok ? "" : result.reason}`);
  return result.grant;
}

test("a well-formed grant parses", () => {
  const grant = parseOrThrow(validGrantDoc());
  assert.equal(grant.sourceInstallationId, "src-install");
  assert.deepEqual(grant.capabilities, ["publish_content.read", "publish_content.apply"]);
});

test("a grant claiming content.write is REFUSED — publishing authority cannot be widened", () => {
  const result = parsePublishTrustGrant(
    validGrantDoc({ capabilities: ["publish_content.apply", "content.write"] })
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /content\.write.*not a publishing capability/);
});

test("a grant claiming a wildcard capability is REFUSED", () => {
  for (const claimed of ["*", "admin.*", "publish_content.*"]) {
    const result = parsePublishTrustGrant(validGrantDoc({ capabilities: [claimed] }));
    assert.equal(result.ok, false, `'${claimed}' must not parse as a publishing capability`);
  }
});

test("a bad capability is refused outright, never silently filtered down to the good ones", () => {
  // Filtering would report success to whoever provisioned the grant and hide the widening attempt.
  const result = parsePublishTrustGrant(
    validGrantDoc({ capabilities: ["publish_content.read", "admin.security.tokens.manage"] })
  );
  assert.equal(result.ok, false);
});

test("an unknown grant version is refused rather than guessed at", () => {
  const result = parsePublishTrustGrant(validGrantDoc({ version: 99 }));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /unsupported grant version 99/);
});

test("a grant with no public keys is refused", () => {
  assert.equal(parsePublishTrustGrant(validGrantDoc({ publicKeys: [] })).ok, false);
  assert.equal(parsePublishTrustGrant(validGrantDoc({ publicKeys: "AAAA" })).ok, false);
});

test("two public keys claiming the same generation are refused, not de-duplicated", () => {
  const result = parsePublishTrustGrant(
    validGrantDoc({
      publicKeys: [
        { publicKeyB64u: "AAAA", generation: 1 },
        { publicKeyB64u: "BBBB", generation: 1 },
      ],
    })
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /repeats generation 1/);
});

test("a rotation overlap — two keys, two generations — is accepted", () => {
  const grant = parseOrThrow(
    validGrantDoc({
      publicKeys: [
        { publicKeyB64u: "AAAA", generation: 1 },
        { publicKeyB64u: "BBBB", generation: 2 },
      ],
    })
  );
  assert.equal(grant.publicKeys.length, 2);
});

test("entityTypes may not use a wildcard", () => {
  assert.equal(parsePublishTrustGrant(validGrantDoc({ entityTypes: ["*"] })).ok, false);
});

test("an empty entityTypes list grants NOTHING — silence is not 'all'", () => {
  const grant = parseOrThrow(validGrantDoc({ entityTypes: [] }));
  assert.equal(grantAllowsEntityType(grant, "post"), false);
  assert.equal(grantAllowsEntityType(grant, "media"), false);
});

test("an entity type outside the grant is refused", () => {
  const grant = parseOrThrow(validGrantDoc({ entityTypes: ["post"] }));
  assert.equal(grantAllowsEntityType(grant, "post"), true);
  assert.equal(grantAllowsEntityType(grant, "media"), false);
});

test("a capability outside the grant is refused", () => {
  const grant = parseOrThrow(validGrantDoc({ capabilities: ["publish_content.read"] }));
  assert.equal(grantAllowsCapability(grant, "publish_content.read"), true);
  assert.equal(grantAllowsCapability(grant, "publish_content.apply"), false);
  assert.equal(grantAllowsCapability(grant, "content.write"), false);
});

test("an EXPIRED grant is well-formed but inactive — revocation is target-side", () => {
  const grant = parseOrThrow(validGrantDoc({ notAfter: "2020-01-01T00:00:00.000Z" }));
  assert.equal(isGrantActive(grant, "2026-09-19T00:00:00.000Z"), false);
  assert.equal(isGrantActive(grant, "2019-01-01T00:00:00.000Z"), true);
});

test("a grant expires exactly at notAfter, not a moment later", () => {
  const grant = parseOrThrow(validGrantDoc({ notAfter: "2026-09-19T00:00:00.000Z" }));
  assert.equal(isGrantActive(grant, "2026-09-18T23:59:59.999Z"), true);
  assert.equal(isGrantActive(grant, "2026-09-19T00:00:00.000Z"), false);
});

test("an unparseable clock is treated as inactive, never as valid", () => {
  const grant = parseOrThrow(validGrantDoc());
  assert.equal(isGrantActive(grant, "not-a-timestamp"), false);
});

test("a non-object grant is refused", () => {
  for (const bad of [null, undefined, "grant", 42, ["grant"]]) {
    assert.equal(parsePublishTrustGrant(bad).ok, false);
  }
});

test("every publishing route is reachable by a publishing credential", () => {
  for (const route of PUBLISH_TRUST_ROUTES) {
    const concrete = route.path.replace(":workspaceId", "ws-1").replace(":sha", "a".repeat(64));
    assert.equal(isPublishTrustRoute(route.method, concrete), true, `${route.method} ${concrete}`);
  }
});

test("the create-post route is NOT a publishing route — a stolen publish credential cannot write posts", () => {
  // Codex's finding: `routes/posts/create.ts` accepts ordinary `content.write`, the same capability
  // the publish adapter asks for. This is the structural reason a publishing credential cannot
  // reach it regardless of what any grant claims.
  assert.equal(isPublishTrustRoute("POST", "/api/admin/v1/workspaces/ws-1/posts"), false);
  assert.equal(isPublishTrustRoute("PUT", "/api/admin/v1/workspaces/ws-1/posts/post-1"), false);
  assert.equal(isPublishTrustRoute("POST", "/api/admin/v1/workspaces/ws-1/api-keys"), false);
  assert.equal(isPublishTrustRoute("GET", "/api/admin/v1/system/site-token"), false);
});

test("the peers routes are NOT reachable — a publishing credential cannot edit publishing config", () => {
  assert.equal(isPublishTrustRoute("GET", "/api/admin/v1/workspaces/ws-1/publish-content/peers"), false);
  assert.equal(isPublishTrustRoute("POST", "/api/admin/v1/workspaces/ws-1/publish-content/peers"), false);
  assert.equal(isPublishTrustRoute("DELETE", "/api/admin/v1/workspaces/ws-1/publish-content/peers/p-1"), false);
});

test("the wrong method on a publishing path is refused", () => {
  assert.equal(isPublishTrustRoute("DELETE", "/api/admin/v1/workspaces/ws-1/publish-content/bundles"), false);
  assert.equal(isPublishTrustRoute("POST", "/api/admin/v1/workspaces/ws-1/publish-content/export"), false);
});

test("a :param matches exactly one real segment — no traversal, no empty, no swallowing", () => {
  const base = "/api/admin/v1/workspaces";
  assert.equal(isPublishTrustRoute("PUT", `${base}/ws-1/publish-content/blobs/..`), false);
  assert.equal(isPublishTrustRoute("PUT", `${base}/ws-1/publish-content/blobs/.`), false);
  assert.equal(isPublishTrustRoute("PUT", `${base}/ws-1/publish-content/blobs/`), false);
  assert.equal(isPublishTrustRoute("PUT", `${base}/ws-1/publish-content/blobs/a/b`), false);
  assert.equal(isPublishTrustRoute("POST", `${base}/ws-1/publish-content/bundles/extra`), false);
});

test("a path that merely starts with a publishing route is refused", () => {
  assert.equal(
    isPublishTrustRoute("POST", "/api/admin/v1/workspaces/ws-1/publish-content/bundles-and-more"),
    false
  );
});

test("a query string does not smuggle a path past the check", () => {
  assert.equal(
    isPublishTrustRoute("POST", "/api/admin/v1/workspaces/ws-1/publish-content/bundles?x=1"),
    true
  );
  assert.equal(isPublishTrustRoute("POST", "/api/admin/v1/workspaces/ws-1/posts?x=/publish-content/bundles"), false);
});
