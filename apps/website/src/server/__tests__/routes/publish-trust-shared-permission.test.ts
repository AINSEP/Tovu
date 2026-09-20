import assert from "node:assert/strict";
import test from "node:test";

import { withPublishTrustContentAuthorize } from "#src/server/inbound/admin-http/publish-trust-auth";

/**
 * @file Regression cover for sol's 2026-09-20 review, Medium finding 6 — "permission-to-entity
 * mapping loses post/page because all types share one permission".
 *
 * The sibling file `publish-trust-content-authorize.test.ts` proves the type narrowing works when
 * each type declares its OWN permission. No registered type does. `features/post/publish-content.
 * ts` returns `permission: "content.write"` for BOTH `post` and `page`, and
 * `features/media/publish-content.ts` declares the same string — so the real registry has three
 * types and one permission between them.
 *
 * A lookup keyed by permission cannot represent that: building it by walking the contributors in
 * registration order (post, page, media) leaves exactly one entry, `content.write -> media`, and
 * every post and page write resolves to the wrong type. `publish-trust-auth.ts`'s own comment
 * promises "a grant limited to `post` cannot write `media` even though both declare
 * `content.write`" — the narrowing has to survive the shared permission for that to be true.
 *
 * These cases use the real permission string deliberately. A fixture that gives each type its own
 * permission tests a registry this codebase does not have.
 */

type Authorize = (params: { permission: string }) => Promise<{ allowed: boolean; reason: string }>;

const CONTENT_WRITE = "content.write";

/** The registry as it actually is: three types, one permission, registered in manifest order. */
const REGISTERED: readonly (readonly [string, string])[] = [
  ["post", CONTENT_WRITE],
  ["page", CONTENT_WRITE],
  ["media", CONTENT_WRITE],
];

/** Mirrors `routes/publish-content/import.ts`'s `registeredTypePermissions`. Keyed by entity type,
 *  which is unique per contributor — keying by permission collapses all three onto one entry. */
function registeredTypePermissions(): ReadonlyMap<string, string> {
  return new Map(REGISTERED.map(([entityType, permission]) => [entityType, permission]));
}

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

function authorizeFor(grantedTypes: readonly string[]) {
  const ordinaryAuthorize: Authorize = async () => ({ allowed: false, reason: "principal_disabled" });
  const wrapped = withPublishTrustContentAuthorize(
    publishingResponse(grantedTypes) as never,
    { authorize: ordinaryAuthorize },
    registeredTypePermissions()
  ).authorize as unknown as (params: {
    permission: string;
    entityType?: string;
  }) => Promise<{ allowed: boolean; reason: string }>;
  assert.ok(wrapped, "a publishing context must replace the ordinary authorization function");
  return wrapped;
}

test("a post-only grant may write a post, even though page and media declare the same permission", async () => {
  const authorize = authorizeFor(["post"]);

  assert.deepEqual(await authorize({ permission: CONTENT_WRITE, entityType: "post" }), {
    allowed: true,
    reason: "granted by the publishing grant for 'post'",
  });
});

test("a post-only grant may NOT write a page or media through the shared permission", async () => {
  const authorize = authorizeFor(["post"]);

  assert.deepEqual(await authorize({ permission: CONTENT_WRITE, entityType: "page" }), {
    allowed: false,
    reason: "this publishing grant does not cover 'page'",
  });
  assert.deepEqual(await authorize({ permission: CONTENT_WRITE, entityType: "media" }), {
    allowed: false,
    reason: "this publishing grant does not cover 'media'",
  });
});

test("each granted type is answered for itself — the narrowing is per type, not per permission", async () => {
  const postAndPage = authorizeFor(["post", "page"]);

  assert.equal((await postAndPage({ permission: CONTENT_WRITE, entityType: "post" })).allowed, true);
  assert.equal((await postAndPage({ permission: CONTENT_WRITE, entityType: "page" })).allowed, true);
  assert.equal((await postAndPage({ permission: CONTENT_WRITE, entityType: "media" })).allowed, false);
});

test("an entity type with no registered handler falls through to the grant's own capability check, which denies", async () => {
  const authorize = authorizeFor(["post", "widget"]);

  // `PUBLISHING_CAPABILITIES` does not contain `content.write` and `grant.ts` refuses a grant
  // naming it at parse, so the fall-through path denies by construction.
  assert.deepEqual(
    await authorize({ permission: CONTENT_WRITE, entityType: "widget" }),
    { allowed: false, reason: `'${CONTENT_WRITE}' is outside this publishing grant` },
    "a grant naming a type this instance does not publish must not be answered by the type narrowing"
  );
});

test("a caller that states no entity type is not answered by the grant — the permission alone is too coarse", async () => {
  const authorize = authorizeFor(["post"]);

  assert.deepEqual(
    await authorize({ permission: CONTENT_WRITE }),
    { allowed: false, reason: `'${CONTENT_WRITE}' is outside this publishing grant` },
    "without an entity type there is no exact pairing to authorize, so this must fail closed"
  );
});

test("a read-only grant authorizes no write for a type it names", async () => {
  const ordinaryAuthorize: Authorize = async () => ({ allowed: false, reason: "principal_disabled" });
  const wrapped = withPublishTrustContentAuthorize(
    {
      locals: {
        publishTrust: {
          sourceInstallationId: "source-install",
          capabilities: ["publish_content.read"],
          entityTypes: ["post"],
          generation: 1,
        },
      },
    } as never,
    { authorize: ordinaryAuthorize },
    registeredTypePermissions()
  ).authorize as unknown as (params: {
    permission: string;
    entityType?: string;
  }) => Promise<{ allowed: boolean; reason: string }>;

  assert.deepEqual(await wrapped({ permission: CONTENT_WRITE, entityType: "post" }), {
    allowed: false,
    reason: "this publishing grant does not cover 'post'",
  });
});
