import assert from "node:assert/strict";
import test from "node:test";

import type { GatewayDeps } from "#src/contracts/core/gated-mutations/gateway";
import { withPublishTrustAuthorize, withPublishTrustContentAuthorize } from "#src/server/inbound/admin-http/publish-trust-auth";

/**
 * @file Bounded publish-trust apply authorization.
 *
 * This is deliberately a test of the per-type apply authorization rather than the handshake: a
 * session is allowed to carry `publish_content.apply` for a grant that names only some content
 * types. The common `content.write` permission is too coarse on its own, so the attenuation must
 * retain the type narrowing at this call site.
 */

type Authorize = (params: { permission: string; entityType?: string; publishType?: string }) => Promise<{ allowed: boolean; reason: string }>;

function publishingResponse(entityTypes: readonly string[]) {
  return {
    locals: {
      publishTrust: {
        sourceInstallationId: "source-install",
        capabilities: ["publish_content.apply"],
        entityTypes,
        generation: 1,
      },
    },
  };
}

// Pins publish-trust-auth.ts:352 — human ceremony deps retain identity; publishing deps deny content.write.
test("ceremony authorization preserves the human deps bag and replaces it only for a publishing context", async () => {
  const ordinaryAuthorize: GatewayDeps["authorize"] = async ({ permission }) => {
    assert.equal(permission, "content.write");
    return { allowed: true, reason: "ordinary RBAC grant" };
  };
  const deps = { authorize: ordinaryAuthorize } as GatewayDeps;

  const human = withPublishTrustAuthorize({ locals: {} } as never, deps);

  assert.equal(human, deps);
  assert.equal(human.authorize, ordinaryAuthorize);
  assert.deepEqual(await human.authorize({ principalId: "human-owner", workspaceId: "workspace-local", permission: "content.write" }), {
    allowed: true,
    reason: "ordinary RBAC grant",
  });

  const publishing = withPublishTrustAuthorize(publishingResponse(["post"]) as never, deps);

  assert.notEqual(publishing, deps);
  assert.notEqual(publishing.authorize, ordinaryAuthorize);
  assert.deepEqual(await publishing.authorize({ principalId: "pub:source-install", workspaceId: "workspace-local", permission: "content.write" }), {
    allowed: false,
    reason: "'content.write' is outside this publishing grant",
  });
  assert.equal(deps.authorize, ordinaryAuthorize);
});

// Pins publish-trust-auth.ts:399 — human APPLY deps and their authorize function retain identity.
test("content authorization returns the identical human deps bag and original authorize function", async () => {
  const ordinaryAuthorize: Authorize = async ({ permission, publishType }) => {
    assert.equal(permission, "content.write");
    assert.equal(publishType, "post");
    return { allowed: true, reason: "ordinary RBAC grant" };
  };
  const deps = { authorize: ordinaryAuthorize };

  const result = withPublishTrustContentAuthorize(
    { locals: {} } as never,
    deps,
    new Map([["post", ["content.write"]]])
  );

  assert.equal(result, deps);
  assert.equal(result.authorize, ordinaryAuthorize);
  assert.deepEqual(await result.authorize({ permission: "content.write", publishType: "post" }), {
    allowed: true,
    reason: "ordinary RBAC grant",
  });
});

test("a publishing grant authorizes only the registered entity types it names", async () => {
  const ordinaryAuthorize: Authorize = async () => ({
    allowed: true,
    reason: "ordinary RBAC grant",
  });
  const deps = { authorize: ordinaryAuthorize };
  const authorize = withPublishTrustContentAuthorize(
    publishingResponse(["post"]) as never,
    deps,
    new Map([
      ["post", ["content.post.write"]],
      ["media", ["content.media.write"]],
    ])
  ).authorize;

  assert.ok(authorize, "publishing context must replace the ordinary authorization function");

  const refused = await authorize({ permission: "content.media.write", publishType: "media" });
  assert.deepEqual(refused, {
    allowed: false,
    reason: "this publishing grant does not cover 'media'",
  });

  const allowed = await authorize({ permission: "content.post.write", publishType: "post" });
  assert.deepEqual(allowed, {
    allowed: true,
    reason: "granted by the publishing grant for 'post'",
  });
});

// The type is the registry's `publishType` stamp, never the domain's own `entityType`: a form's write
// says `form_definition`, and reading that refused every form on live (2026-09-26).
test("a publishing grant answers by the publish-type stamp, and refuses what no registered type declares", async () => {
  const deps = { authorize: (async () => ({ allowed: true, reason: "ordinary RBAC grant" })) as Authorize };
  const authorize = withPublishTrustContentAuthorize(
    publishingResponse(["form"]) as never,
    deps,
    new Map([["form", ["admin.forms.manage"]]])
  ).authorize!;

  assert.deepEqual(await authorize({ permission: "admin.forms.manage", entityType: "form_definition", publishType: "form" }), {
    allowed: true,
    reason: "granted by the publishing grant for 'form'",
  });
  assert.deepEqual(await authorize({ permission: "admin.forms.manage", entityType: "form" }), {
    allowed: false,
    reason: "'admin.forms.manage' is outside this publishing grant",
  });
  assert.deepEqual(await authorize({ permission: "admin.users.manage", publishType: "form" }), {
    allowed: false,
    reason: "'admin.users.manage' is not a permission 'form' publishes with",
  });
  assert.deepEqual(await authorize({ permission: "admin.forms.manage", publishType: "forms" }), {
    allowed: false,
    reason: "'forms' is not a registered publish type",
  });
});

// F6 fix wave (L12 Stryker top-1, publish-trust-auth.ts:423): a raw backstop type is applied only when
// the grant opts in with publish_content.backstop. Each case breaks exactly one clause of the allow.
function grantResponse(capabilities: readonly string[], entityTypes: readonly string[]) {
  return { locals: { publishTrust: { sourceInstallationId: "source-install", capabilities, entityTypes, generation: 1 } } };
}
const RAW_TYPES = new Map([["raw-row", ["content.write"]], ["raw-file", ["media.write"]], ["post", ["content.write"]]]);
const humanAuthorize: Authorize = async () => assert.fail("a publishing request must never reach the human authorize");

for (const [entityType, permission] of [["raw-row", "content.write"], ["raw-file", "media.write"]] as const) {
  test(`${entityType}: allowed only with apply + backstop + the type named in the grant`, async () => {
    const decide = (capabilities: readonly string[], entityTypes: readonly string[]) =>
      withPublishTrustContentAuthorize(grantResponse(capabilities, entityTypes) as never, { authorize: humanAuthorize }, RAW_TYPES)
        .authorize({ permission, publishType: entityType });
    assert.deepEqual(await decide(["publish_content.apply", "publish_content.backstop"], [entityType]),
      { allowed: true, reason: `granted by the publishing grant for '${entityType}'` });
    const denied = { allowed: false, reason: `this publishing grant does not cover '${entityType}'` };
    assert.deepEqual(await decide(["publish_content.apply"], [entityType]), denied, "no backstop opt-in");
    assert.deepEqual(await decide(["publish_content.backstop"], [entityType]), denied, "backstop without apply");
    assert.deepEqual(await decide(["publish_content.apply", "publish_content.backstop"], ["post"]), denied, "type not named");
  });
}

test("an ordinary type needs no backstop opt-in, and a backstop opt-in never widens it to unnamed types", async () => {
  const decide = (capabilities: readonly string[], entityTypes: readonly string[]) =>
    withPublishTrustContentAuthorize(grantResponse(capabilities, entityTypes) as never, { authorize: humanAuthorize }, RAW_TYPES)
      .authorize({ permission: "content.write", publishType: "post" });
  assert.deepEqual(await decide(["publish_content.apply"], ["post"]), { allowed: true, reason: "granted by the publishing grant for 'post'" });
  assert.equal((await decide(["publish_content.apply", "publish_content.backstop"], ["raw-row"])).allowed, false);
  assert.equal((await decide(["publish_content.read"], ["post"])).allowed, false);
});
