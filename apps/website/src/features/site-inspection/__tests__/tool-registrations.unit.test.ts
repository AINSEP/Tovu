import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";
import { listToolContributors, registerToolContributor, resetToolContributorsForTests } from "#src/assistant/tool-contribution-registry";
import { listToolCatalogEntries } from "#src/assistant/tool-catalog-query";
import { ADMIN_SCREENS } from "../admin-screens.generated.js";
import { siteInspectionAgentToolCatalog } from "../agent-tools.js";
import { PublishedPagePathError } from "../published-page.js";
import { SITE_CAPABILITIES_SECTION_NAMES } from "../site-capabilities.js";
import { SITE_PROFILE_SECTION_NAMES } from "../site-profile.js";
import {
  buildSiteInspectionRegistrations,
  contributeSiteInspectionTools,
  siteInspectionDerivedRisk,
} from "../tool-registrations.js";

/**
 * @file The agent-tool half of Site Inspection: that the catalog wires, that `site_get_profile`'s
 * five per-section gates really run for the tool caller too (not only for the HTTP route), that
 * `fetch_published_page` enforces its own permission and its same-origin rule, and that a canary
 * planted in a sealed credential store never appears in `JSON.stringify()` of a tool's OUTPUT.
 *
 * The last one matters on its own, separate from the identical assertion on the HTTP response:
 * `development/scripts/check-openapi-secret-leaks.ts` scans HTTP response bodies and covers no
 * agent-tool output at all, so the tool path needs its own standing evidence rather than inheriting
 * the route's.
 */

const SEALED_CANARY = "CANARY_TOOL_SEALED_e41b7";
const ENV_NAME_CANARY = "CANARY_TOOL_ENV_NAME_93cf";
const PAGE_BODY_CANARY = "CANARY_TOOL_PAGE_BODY_20ad";

function ctxFor(principalId: string, input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-site-inspection",
    principal: { id: principalId } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

function registrationFor(registrations: ToolRegistration[], id: string): ToolRegistration {
  const found = registrations.find((registration) => registration.descriptor.id === id);
  assert.ok(found, `expected a registration for '${id}'`);
  return found;
}

test("site inspection: the catalog wires in full, with a published schema and a cross-checked risk class", () => {
  const registrations = buildSiteInspectionRegistrations(createRouteDeps());

  assert.deepEqual(
    registrations.map((registration) => registration.descriptor.id).sort(),
    ["fetch_published_page", "site_describe_capabilities", "site_get_profile"],
  );
  assert.equal(registrations.length, siteInspectionAgentToolCatalog.length, "every catalog entry must be wired");

  for (const registration of registrations) {
    assert.ok(registration.descriptor.inputSchema, `${registration.descriptor.id} must publish an input schema`);
    assert.ok(
      (registration.descriptor.description ?? "").length > 200,
      `${registration.descriptor.id}'s description must tell the model when NOT to call it, not just what it does`,
    );
    assert.ok(siteInspectionDerivedRisk.has(registration.descriptor.id));
  }
});

test("site inspection: the contributor registers under its own domain key", () => {
  resetToolContributorsForTests();
  registerToolContributor(contributeSiteInspectionTools());

  const contributors = listToolContributors();
  assert.equal(contributors.length, 1);
  assert.equal(contributors[0]?.domain, "site-inspection");
  assert.equal(contributors[0]?.risk, siteInspectionDerivedRisk);

  // Idempotent: a double install replaces rather than duplicating, like every other domain.
  registerToolContributor(contributeSiteInspectionTools());
  assert.equal(listToolContributors().length, 1);
  resetToolContributorsForTests();
});

test("site_get_profile: the owner gets every section; a principal with no grants gets every section forbidden", async () => {
  const deps: RouteDeps = createRouteDeps();
  await deps.identityReady;
  await deps.settingsReady;
  const registrations = buildSiteInspectionRegistrations(deps);
  const handler = registrationFor(registrations, "site_get_profile").handler;

  const owner = (await handler(ctxFor(await deps.ownerPrincipalId, {}))) as {
    sections: Record<string, { status: string }>;
    completeness: string;
  };
  for (const name of SITE_PROFILE_SECTION_NAMES) {
    assert.equal(owner.sections[name]?.status, "ok", `${name} should be readable by the owner`);
  }
  assert.equal(owner.completeness, "complete");

  // No blanket gate: the call itself succeeds for an ungranted principal and reports the denial
  // per section, which is what lets a caller entitled to 4 of 5 sections still get those 4.
  const stranger = (await handler(ctxFor("principal-with-no-grants", {}))) as {
    sections: Record<string, { status: string }>;
    completeness: string;
  };
  for (const name of SITE_PROFILE_SECTION_NAMES) {
    assert.equal(stranger.sections[name]?.status, "forbidden");
  }
  assert.equal(stranger.completeness, "partial");
});

test("site_get_profile: an unknown section name is refused with the schema attached, not silently dropped", async () => {
  const deps: RouteDeps = createRouteDeps();
  await deps.identityReady;
  const handler = registrationFor(buildSiteInspectionRegistrations(deps), "site_get_profile").handler;

  await assert.rejects(
    () => handler(ctxFor("anyone", { sections: ["secrets"] })),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /unknown section 'secrets'/);
      // The kit decorates a shape rejection with the published schema so the model can self-correct
      // in one turn rather than guessing the rest of the contract.
      assert.match(err.message, /sections/);
      return true;
    },
  );
});

test("site_get_profile: a canary in a sealed credential store never appears in the tool's serialized output", async () => {
  const deps: RouteDeps = createRouteDeps();
  await deps.identityReady;
  await deps.settingsReady;
  const now = deps.clock.nowIso();

  await deps.externalMcpServerRepo.upsert({
    workspaceId: deps.workspaceId,
    serverId: "canary-mcp",
    label: "Canary MCP",
    transport: "stdio",
    enabled: true,
    command: "node",
    args: null,
    allowedToolNames: null,
    envNames: JSON.stringify([ENV_NAME_CANARY]),
    sealedEnv: { keyId: "k", ciphertext: SEALED_CANARY, nonce: "n", alg: "aes-256-gcm" },
    createdAt: now,
    updatedAt: now,
  });
  await deps.postRepo.save({
    workspaceId: deps.workspaceId,
    id: "canary-tool-page",
    title: "Canary Tool Page",
    slug: "canary-tool-page",
    kind: "page",
    status: "published",
    bodyFormat: "json",
    bodyJson: { text: PAGE_BODY_CANARY },
    bodyHtml: null,
    updatedAt: now,
    version: 1,
  } as never);

  const handler = registrationFor(buildSiteInspectionRegistrations(deps), "site_get_profile").handler;
  const output = await handler(ctxFor(await deps.ownerPrincipalId, {}));
  const serialized = JSON.stringify(output);

  for (const canary of [SEALED_CANARY, ENV_NAME_CANARY, PAGE_BODY_CANARY]) {
    assert.ok(!serialized.includes(canary), `'${canary}' leaked into site_get_profile's output`);
  }
  // Not a vacuous sweep: the seeded page really was read, only its body was dropped.
  assert.ok(serialized.includes("canary-tool-page"));
});

test("fetch_published_page: enforces its own permission before doing any work", async () => {
  const deps: RouteDeps = createRouteDeps();
  await deps.identityReady;
  const handler = registrationFor(buildSiteInspectionRegistrations(deps), "fetch_published_page").handler;

  await assert.rejects(
    () => handler(ctxFor("principal-with-no-grants", { path: "/" })),
    (err: unknown) => err instanceof Error && /not authorized for 'content.read'/.test(err.message),
  );
});

test("fetch_published_page: refuses an off-site path even for a fully granted principal", async () => {
  const deps: RouteDeps = createRouteDeps();
  await deps.identityReady;
  const handler = registrationFor(buildSiteInspectionRegistrations(deps), "fetch_published_page").handler;
  const owner = await deps.ownerPrincipalId;

  for (const candidate of ["https://evil.example/x", "//evil.example/x", "/a/../../etc/passwd", "/api/admin/v1/x"]) {
    await assert.rejects(
      () => handler(ctxFor(owner, { path: candidate })),
      (err: unknown) => err instanceof Error && /path/.test(err.message),
      `should refuse '${candidate}'`,
    );
  }
});

test("fetch_published_page: renders a real route of this site through the real composition root", async () => {
  const deps: RouteDeps = createRouteDeps();
  await deps.identityReady;
  await deps.settingsReady;
  const handler = registrationFor(buildSiteInspectionRegistrations(deps), "fetch_published_page").handler;

  const result = (await handler(ctxFor(await deps.ownerPrincipalId, { path: "/", maxBytes: 20_000 }))) as {
    path: string;
    status: number;
    headers: Record<string, string>;
    cookies: unknown[];
    body: string;
  };

  assert.equal(result.path, "/");
  assert.equal(typeof result.status, "number");
  assert.ok(result.status >= 200 && result.status < 500, `unexpected status ${result.status}`);
  assert.ok(typeof result.body === "string");
  assert.ok(Array.isArray(result.cookies));
  assert.equal(result.headers["set-cookie"], undefined, "raw set-cookie must never survive into the result");
});

/** `PublishedPagePathError` is exported so a caller can branch on it; assert it is the class the
 *  handler actually surfaces rather than a bare Error someone could not distinguish. */
test("fetch_published_page: a refused path really is a PublishedPagePathError under the decoration", async () => {
  const deps: RouteDeps = createRouteDeps();
  await deps.identityReady;
  await assert.rejects(
    async () => {
      const { fetchPublishedPage } = await import("../published-page.js");
      await fetchPublishedPage(deps, { path: "//evil.example" });
    },
    PublishedPagePathError,
  );
});

/** This domain's registrations over a real composition root, wired to a real registry the way both
 *  composition roots wire it: `listCatalogTools` reads the same registry the registrations go into. */
async function capabilitiesHandlerOverRealRegistry() {
  const deps: RouteDeps = createRouteDeps();
  await deps.identityReady;
  await deps.settingsReady;
  const registry = createToolRegistry();
  const registrations = buildSiteInspectionRegistrations(
    Object.assign(deps, { listCatalogTools: () => listToolCatalogEntries(registry) }),
  );
  for (const registration of registrations) registry.register(registration);
  return { deps, registry, handler: registrationFor(registrations, "site_describe_capabilities").handler };
}

test("site_describe_capabilities: the owner gets all three sections, with tools read from the live registry", async () => {
  const { deps, registry, handler } = await capabilitiesHandlerOverRealRegistry();

  const owner = (await handler(ctxFor(await deps.ownerPrincipalId, {}))) as {
    completeness: string;
    sections: Record<string, { status: string; data?: unknown }> & {
      tools: { data: { total: number; domains: { domain: string; tools: { id: string }[] }[] } };
      adminScreens: { data: { screens: unknown[] } };
    };
  };

  for (const name of SITE_CAPABILITIES_SECTION_NAMES) {
    assert.equal(owner.sections[name]?.status, "ok", `${name} should be readable by the owner`);
  }
  assert.equal(owner.completeness, "complete");
  assert.equal(owner.sections.tools.data.total, registry.list().length);
  const siteDomain = owner.sections.tools.data.domains.find((domain) => domain.domain === "site");
  assert.ok(siteDomain?.tools.some((tool) => tool.id === "site_describe_capabilities"));
  assert.deepEqual(owner.sections.adminScreens.data.screens, ADMIN_SCREENS);
});

test("site_describe_capabilities: no blanket gate — a principal with no grants gets every section forbidden", async () => {
  const { handler } = await capabilitiesHandlerOverRealRegistry();

  const stranger = (await handler(ctxFor("principal-with-no-grants", {}))) as {
    completeness: string;
    sections: Record<string, { status: string }>;
  };

  for (const name of SITE_CAPABILITIES_SECTION_NAMES) {
    assert.equal(stranger.sections[name]?.status, "forbidden");
  }
  assert.equal(stranger.completeness, "partial");
});

test("site_describe_capabilities: an unknown section name is refused with the valid names, not silently dropped", async () => {
  const { handler } = await capabilitiesHandlerOverRealRegistry();

  // `pages` is a real site_get_profile section — the refusal proves each tool validates against its
  // OWN vocabulary.
  await assert.rejects(
    () => handler(ctxFor("anyone", { sections: ["pages"] })),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /unknown section 'pages'/);
      assert.match(err.message, /tools, adminScreens, contentTypes/);
      return true;
    },
  );
});

test("site_describe_capabilities: side-effect free and published read-only", () => {
  const registration = registrationFor(buildSiteInspectionRegistrations(createRouteDeps()), "site_describe_capabilities");

  assert.equal(siteInspectionDerivedRisk.get("site_describe_capabilities"), "none");
  assert.equal(registration.descriptor.readOnly, true);
});
