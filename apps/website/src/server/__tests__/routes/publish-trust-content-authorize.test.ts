import assert from "node:assert/strict";
import test from "node:test";

import { withPublishTrustContentAuthorize } from "#src/server/inbound/admin-http/publish-trust-auth";

/**
 * @file Bounded publish-trust apply authorization.
 *
 * This is deliberately a test of the per-type apply authorization rather than the handshake: a
 * session is allowed to carry `publish_content.apply` for a grant that names only some content
 * types. The common `content.write` permission is too coarse on its own, so the attenuation must
 * retain the type narrowing at this call site.
 */

type Authorize = (params: { permission: string }) => Promise<{ allowed: boolean; reason: string }>;

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
      ["content.post.write", "post"],
      ["content.media.write", "media"],
    ])
  ).authorize;

  assert.ok(authorize, "publishing context must replace the ordinary authorization function");

  const refused = await authorize({ permission: "content.media.write" });
  assert.deepEqual(refused, {
    allowed: false,
    reason: "this publishing grant does not cover 'media'",
  });

  const allowed = await authorize({ permission: "content.post.write" });
  assert.deepEqual(allowed, {
    allowed: true,
    reason: "granted by the publishing grant for 'post'",
  });
});
