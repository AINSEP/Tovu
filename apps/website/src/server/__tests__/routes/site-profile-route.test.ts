import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated, loginAsBarePrincipal, startTestServer } from "../helpers/http-test-server.js";
import { SITE_PROFILE_SECTION_NAMES } from "../../../features/site-inspection/index.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file `GET /api/admin/v1/workspaces/:workspaceId/site/profile` — the admin frontend's half of the
 * shared `buildSiteProfile()` service.
 *
 * Two things this file proves that the service's own unit tests cannot:
 *
 * 1. **Per-section authorization survives the transport.** A real logged-in principal with zero
 *    grants gets a 200 whose every section is `forbidden` — not a blanket 403, and not a 200 with
 *    sections silently missing. The seeded owner gets the same request answered with real data.
 * 2. **The honeytoken sweep runs against real credential stores.** Canaries are written into the
 *    actual sealed-credential repos this composition root wires (`externalMcpServerRepo`'s
 *    `sealedEnv`, `siteAssistantCredentialRepo`'s `sealed`, `adminExecutionCredentialRepo`'s
 *    `sealed`, `vendorCredentialSetRepo`'s `sealed`) plus a page body, and the assertion is made
 *    against the raw HTTP response TEXT — so it holds regardless of how the payload is shaped.
 *
 * The canaries are deliberately planted in stores `buildSiteProfile` has no dependency on at all.
 * That is the point: the test states the property ("a credential cannot reach this response") and
 * the architecture is what makes it true, so the test keeps passing for the right reason and starts
 * failing the moment someone widens the service's dependency surface.
 */

const SEALED_CANARY = "CANARY_SEALED_CIPHERTEXT_b7f31c9a";
const ENV_NAME_CANARY = "CANARY_ENV_NAME_44d2";
const SITE_KEY_CANARY = "CANARY_SITE_ASSISTANT_KEY_8e10";
const EXECUTION_KEY_CANARY = "CANARY_EXECUTION_KEY_5c72";
const VENDOR_KEY_CANARY = "CANARY_VENDOR_TOKEN_19ab";
const PAGE_BODY_CANARY = "CANARY_PAGE_BODY_6d40";

const ALL_CANARIES = [
  SEALED_CANARY,
  ENV_NAME_CANARY,
  SITE_KEY_CANARY,
  EXECUTION_KEY_CANARY,
  VENDOR_KEY_CANARY,
  PAGE_BODY_CANARY,
];

/**
 * Writes a canary into every credential store this composition root wires, plus a page whose BODY
 * carries one (the profile lists pages, so that row really is read — its body just must not travel).
 *
 * @param deps - A live `createRouteDeps()` bag.
 * @complexity O(1) — a fixed number of repo writes.
 */
async function seedHoneytokens(deps: RouteDeps): Promise<void> {
  const now = deps.clock.nowIso();
  const sealed = { keyId: "canary-key", ciphertext: SEALED_CANARY, nonce: "canary-nonce", alg: "aes-256-gcm" };

  await deps.externalMcpServerRepo.upsert({
    workspaceId: deps.workspaceId,
    serverId: "canary-mcp",
    label: "Canary MCP",
    transport: "stdio",
    enabled: true,
    command: "node",
    args: JSON.stringify(["server.js"]),
    allowedToolNames: null,
    envNames: JSON.stringify([ENV_NAME_CANARY]),
    sealedEnv: sealed,
    createdAt: now,
    updatedAt: now,
  });

  await deps.siteAssistantCredentialRepo.upsert({
    workspaceId: deps.workspaceId,
    provider: "openai",
    baseUrl: "https://api.example.test",
    model: "gpt-x",
    sealed: { ...sealed, ciphertext: SITE_KEY_CANARY },
    masked: "••••nary",
    createdAt: now,
    updatedAt: now,
  });

  await deps.adminExecutionCredentialRepo.upsert({
    workspaceId: deps.workspaceId,
    principalId: await deps.ownerPrincipalId,
    protocol: "anthropic",
    providerId: null,
    baseUrl: null,
    model: null,
    maxTokens: null,
    sealed: { ...sealed, ciphertext: EXECUTION_KEY_CANARY },
    masked: "••••nary",
    createdAt: now,
    updatedAt: now,
  });

  await deps.vendorCredentialSetRepo.insert({
    workspaceId: deps.workspaceId,
    id: "canary-vendor-row",
    vendorId: "github",
    label: "Canary GitHub",
    sealed: { ...sealed, ciphertext: VENDOR_KEY_CANARY },
    tokenTail: "nary",
    isDefault: true,
    accountLabel: null,
    createdAt: now,
    updatedAt: now,
  });

  await deps.postRepo.save({
    workspaceId: deps.workspaceId,
    id: "canary-page",
    title: "Canary Page",
    slug: "canary-page",
    kind: "page",
    status: "published",
    bodyFormat: "json",
    bodyJson: { text: PAGE_BODY_CANARY },
    bodyHtml: null,
    updatedAt: now,
    version: 1,
  } as never);
}

const PROFILE_PATH = (workspaceId: string): string => `/api/admin/v1/workspaces/${workspaceId}/site/profile`;

test("site profile route: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${PROFILE_PATH("not-the-real-workspace")}`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("site profile route: an unauthenticated request never reaches the handler", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}${PROFILE_PATH(deps.workspaceId)}`);
  assert.equal(res.status, 401);
});

test("site profile route: the seeded owner gets every section, with real data", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.settingsReady;

  const res = await fetch(`${baseUrl}${PROFILE_PATH(deps.workspaceId)}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.schemaVersion, "1");
  assert.deepEqual(Object.keys(body.sections).sort(), [...SITE_PROFILE_SECTION_NAMES].sort());
  for (const name of SITE_PROFILE_SECTION_NAMES) {
    assert.equal(body.sections[name].status, "ok", `${name} should be readable by the owner`);
  }
  assert.equal(body.completeness, "complete");
  // Real boot-discovered themes, not a placeholder.
  assert.ok(Array.isArray(body.sections.theme.data.installed));
  assert.ok(body.sections.theme.data.installed.length > 0);
  assert.ok(Array.isArray(body.sections.pages.data.items));
});

test("site profile route: a principal with no grants gets 200 with EVERY section forbidden — not a blanket 403", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl, { username: "bare-site-profile" });

  const res = await fetch(`${baseUrl}${PROFILE_PATH(deps.workspaceId)}`, { headers: { cookie } });
  assert.equal(res.status, 200, "per-section authorization means the CALL succeeds; the sections carry the denial");
  const body = await res.json();

  for (const name of SITE_PROFILE_SECTION_NAMES) {
    assert.equal(body.sections[name].status, "forbidden", `${name} should be forbidden for a bare principal`);
    assert.equal(body.sections[name].data, undefined);
    assert.ok(typeof body.sections[name].reason === "string" && body.sections[name].reason.length > 0);
  }
  assert.equal(body.completeness, "partial");
});

test("site profile route: '?sections=' scopes the response to exactly what was asked for", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}${PROFILE_PATH(deps.workspaceId)}?sections=theme,contentTypes`, {
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(Object.keys(body.sections), ["theme", "contentTypes"]);
});

test("site profile route: an unknown section or a bad pageLimit is a 400, never a silent default", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const unknownSection = await fetch(`${baseUrl}${PROFILE_PATH(deps.workspaceId)}?sections=secrets`, {
    headers: { cookie },
  });
  assert.equal(unknownSection.status, 400);
  const unknownBody = await unknownSection.json();
  assert.equal(unknownBody.code, "VALIDATION_ERROR");
  assert.match(unknownBody.error, /unknown section 'secrets'/);

  for (const badLimit of ["0", "-1", "9999", "abc", "1.5"]) {
    const res = await fetch(`${baseUrl}${PROFILE_PATH(deps.workspaceId)}?pageLimit=${badLimit}`, { headers: { cookie } });
    assert.equal(res.status, 400, `pageLimit='${badLimit}' should be rejected`);
  }

  const good = await fetch(`${baseUrl}${PROFILE_PATH(deps.workspaceId)}?pageLimit=5&sections=pages`, {
    headers: { cookie },
  });
  assert.equal(good.status, 200);
});

test("site profile route: no canary seeded in any credential store reaches the response body", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.settingsReady;
  await seedHoneytokens(deps);

  const res = await fetch(`${baseUrl}${PROFILE_PATH(deps.workspaceId)}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const raw = await res.text();

  for (const canary of ALL_CANARIES) {
    assert.ok(!raw.includes(canary), `'${canary}' leaked into the site profile response`);
  }

  // Proof the sweep is meaningful rather than vacuous: the page whose BODY carries a canary really
  // was read and really is listed — only its body was dropped.
  const body = JSON.parse(raw);
  const slugs = (body.sections.pages.data.items as { slug: string }[]).map((item) => item.slug);
  assert.ok(slugs.includes("canary-page"), "the seeded page must actually be in the profile");
});
