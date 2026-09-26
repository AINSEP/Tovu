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
