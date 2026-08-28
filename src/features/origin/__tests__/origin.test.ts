import assert from "node:assert/strict";
import test from "node:test";

import { OriginRegistry } from "../origin.js";
import { InMemoryOriginSettingRepo } from "../repo.memory.js";
import { OriginNotVerifiedError, createVerifiedOrigin, InsecureOriginSourceError } from "../types.js";

const WORKSPACE = "workspace-1";

function makeRegistry(options?: {
  redirectAllowlist?: string[];
  egressAllowlist?: string[];
}) {
  const repo = new InMemoryOriginSettingRepo([
    {
      workspaceId: WORKSPACE,
      origin: {
        scheme: "https",
        host: "good.com",
        verifiedAt: "2026-07-10T00:00:00.000Z",
        source: "workspace-setting",
      },
      redirectAllowlist: options?.redirectAllowlist,
      egressAllowlist: options?.egressAllowlist,
    },
  ]);
  return new OriginRegistry({ repo });
}

// --- VerifiedOrigin scheme/source invariant --------------------------------

test("createVerifiedOrigin allows https for a workspace-setting origin", () => {
  const origin = createVerifiedOrigin({
    scheme: "https",
    host: "good.com",
    verifiedAt: "2026-07-10T00:00:00.000Z",
    source: "workspace-setting",
  });
  assert.equal(origin.scheme, "https");
});

test("createVerifiedOrigin allows http only for dev-capability", () => {
  const origin = createVerifiedOrigin({
    scheme: "http",
    host: "localhost",
    port: 3000,
    verifiedAt: "2026-07-10T00:00:00.000Z",
    source: "dev-capability",
  });
  assert.equal(origin.scheme, "http");
});

test("createVerifiedOrigin rejects http for a workspace-setting origin", () => {
  assert.throws(
    () =>
      createVerifiedOrigin({
        scheme: "http",
        host: "good.com",
        verifiedAt: "2026-07-10T00:00:00.000Z",
        source: "workspace-setting",
      }),
    InsecureOriginSourceError
  );
});

test("InMemoryOriginSettingRepo seeding rejects an insecure workspace-setting origin", () => {
  assert.throws(
    () =>
      new InMemoryOriginSettingRepo([
        {
          workspaceId: WORKSPACE,
          origin: {
            scheme: "http",
            host: "good.com",
            verifiedAt: "2026-07-10T00:00:00.000Z",
            source: "workspace-setting",
          },
        },
      ]),
    InsecureOriginSourceError
  );
});

// --- canonicalOrigin --------------------------------------------------------

test("canonicalOrigin resolves the registered origin for a workspace", async () => {
  const registry = makeRegistry();
  const origin = await registry.canonicalOrigin({ workspaceId: WORKSPACE });
  assert.equal(origin.host, "good.com");
  assert.equal(origin.scheme, "https");
});

test("canonicalOrigin fails closed for an unregistered workspace", async () => {
  const registry = makeRegistry();
  await assert.rejects(
    () => registry.canonicalOrigin({ workspaceId: "unknown-workspace" }),
    OriginNotVerifiedError
  );
});

// --- isAllowedRedirectTarget: happy paths -----------------------------------

test("isAllowedRedirectTarget allows the exact canonical origin", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://good.com/path"), true);
});

test("isAllowedRedirectTarget allows an allowlisted cross-origin host", async () => {
  const registry = makeRegistry({ redirectAllowlist: ["partner.com"] });
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://partner.com/x"), true);
});

test("isAllowedRedirectTarget rejects a non-allowlisted cross-origin host", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://elsewhere.com"), false);
});

// --- isAllowedRedirectTarget: ADR-040 F3 bypass strings ---------------------

test("isAllowedRedirectTarget rejects protocol-relative //evil.com", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "//evil.com"), false);
});

test("isAllowedRedirectTarget rejects userinfo bypass https://good.com@evil.com", async () => {
  const registry = makeRegistry();
  assert.equal(
    await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://good.com@evil.com"),
    false
  );
});

test("isAllowedRedirectTarget rejects a subdomain-confusable host not on the allowlist", async () => {
  const registry = makeRegistry();
  assert.equal(
    await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://good.com.evil.com"),
    false
  );
});

test("isAllowedRedirectTarget rejects a backslash scheme-separator bypass", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https:/\\evil.com"), false);
});

test("isAllowedRedirectTarget allows the canonical host with a trailing dot stripped", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://good.com./path"), true);
});

test("isAllowedRedirectTarget matches the canonical host case-insensitively", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://GOOD.COM/path"), true);
});

test("isAllowedRedirectTarget rejects non-https schemes (http, javascript, data)", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "http://good.com"), false);
  assert.equal(
    await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "javascript:alert(1)"),
    false
  );
  assert.equal(
    await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "data:text/html,evil"),
    false
  );
});

test("isAllowedRedirectTarget allows http same-origin against a dev-capability canonical origin (R2-005 fix)", async () => {
  const repo = new InMemoryOriginSettingRepo([
    {
      workspaceId: WORKSPACE,
      origin: {
        scheme: "http",
        host: "localhost",
        port: 3000,
        verifiedAt: "2026-07-10T00:00:00.000Z",
        source: "dev-capability",
      },
    },
  ]);
  const registry = new OriginRegistry({ repo });
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "http://localhost:3000/foo"), true);
});

test("isAllowedRedirectTarget still rejects a cross-origin http target against a dev-capability canonical origin", async () => {
  const repo = new InMemoryOriginSettingRepo([
    {
      workspaceId: WORKSPACE,
      origin: {
        scheme: "http",
        host: "localhost",
        port: 3000,
        verifiedAt: "2026-07-10T00:00:00.000Z",
        source: "dev-capability",
      },
      redirectAllowlist: ["other.com"],
    },
  ]);
  const registry = new OriginRegistry({ repo });
  // "other.com" is on the allowlist, but only as an https target — the dev-capability http
  // exception applies to the same-origin comparison only, never to the cross-origin allowlist.
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "http://other.com"), false);
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://other.com"), true);
});

test("isAllowedRedirectTarget rejects a malformed URL instead of throwing", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "not a url"), false);
});

test("isAllowedRedirectTarget rejects whitespace-embedded bypass attempts", async () => {
  const registry = makeRegistry();
  assert.equal(
    await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://good.com\t.evil.com"),
    false
  );
});

test("isAllowedRedirectTarget fails closed when the workspace has no verified origin", async () => {
  const registry = makeRegistry();
  assert.equal(
    await registry.isAllowedRedirectTarget({ workspaceId: "unregistered-workspace" }, "https://good.com"),
    false
  );
});

// --- isAllowedEgressTarget: distinct allowlist from redirects ---------------

test("isAllowedEgressTarget allows the canonical origin", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedEgressTarget({ workspaceId: WORKSPACE }, "https://good.com"), true);
});

test("isAllowedEgressTarget uses a separate allowlist from redirects", async () => {
  const registry = makeRegistry({
    redirectAllowlist: ["redirect-partner.com"],
    egressAllowlist: ["egress-partner.com"],
  });

  assert.equal(
    await registry.isAllowedEgressTarget({ workspaceId: WORKSPACE }, "https://egress-partner.com"),
    true
  );
  assert.equal(
    await registry.isAllowedEgressTarget({ workspaceId: WORKSPACE }, "https://redirect-partner.com"),
    false
  );
  assert.equal(
    await registry.isAllowedRedirectTarget({ workspaceId: WORKSPACE }, "https://egress-partner.com"),
    false
  );
});

test("isAllowedEgressTarget rejects the same bypass strings as redirects", async () => {
  const registry = makeRegistry();
  assert.equal(await registry.isAllowedEgressTarget({ workspaceId: WORKSPACE }, "https://good.com@evil.com"), false);
  assert.equal(await registry.isAllowedEgressTarget({ workspaceId: WORKSPACE }, "//evil.com"), false);
});
