import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { UIResource } from "#src/assistant/index";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from "#src/contracts/core/tool-surface-exchanges";

import type { DuplicateSiteResult, SiteListEntry } from "#src/platform/site-dir/index";
import { listToolContributors, registerToolContributor, resetToolContributorsForTests } from "#src/assistant/tool-contribution-registry";

import { sitesAgentToolCatalog } from "../agent-tools.js";
import type { SitesToolDeps } from "../deps.js";
import { buildSitesRegistrations, contributeSitesTools, sitesDerivedRisk } from "../tool-registrations.js";

/**
 * @file `sites_duplicate_site` — TDD certification for the assistant-tool half of `duplicateSite`
 * (the function itself is certified separately, at the filesystem/database level, by
 * `platform/site-dir/__tests__/integration/duplicate-site.integration.test.ts`).
 *
 * Deliberately tests `buildSitesRegistrations` directly with a FAKE `SitesToolDeps`, never
 * `buildAssistantToolRegistrations(createRouteDeps())` — this domain's own narrow deps type is the
 * seam worth proving; the full 26-domain assembler is `assistant/tool-registrations.ts`'s own test
 * suite's job, and a real `createRouteDeps()` boot would also make this suite depend on
 * `server/deps.ts`, which another agent owns this session.
 *
 * Every refusal case asserts NOT ONLY that the call throws, but that `duplicateSite` (the
 * side-effecting fake) was never invoked — "it threw" alone would also pass a handler that checked
 * the gate AFTER already creating the site.
 */

const WORKSPACE_ID = "ws-sites-tools";
const PRINCIPAL_ID = "principal-under-test";

function ctxFor(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-sites",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

/** Runs the tool and clicks Confirm on its dialog — the gate itself is certified by
 *  `duplicate-site-confirmation.unit.test.ts`. */
async function callConfirmed(routeDeps: SitesToolDeps, input: unknown): Promise<unknown> {
  const surfaceExchanges = createSurfaceExchangeStore();
  const tool = registrationFor(buildSitesRegistrations(routeDeps, { surfaceExchanges }), "sites_duplicate_site");
  const emitted: unknown[] = [];
  const pending = tool.handler({ ...ctxFor(input), emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))![1]!;
  surfaceExchanges.deliver({ exchangeId, toolId: "sites_duplicate_site", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  return pending;
}

function registrationFor(registrations: ToolRegistration[], id: string): ToolRegistration {
  const found = registrations.find((registration) => registration.descriptor.id === id);
  assert.ok(found, `expected a registration for '${id}'`);
  return found;
}

interface FakeDepsOptions {
  allow?: boolean;
  switcherEnabled?: boolean;
  switcherCompatible?: boolean;
  sites?: readonly SiteListEntry[];
  duplicateSiteResult?: DuplicateSiteResult;
}

interface FakeDeps {
  routeDeps: SitesToolDeps;
  duplicateSiteCalls: Array<{ sourceDir: string; targetDir: string; name?: string }>;
}

function fakeDeps(options: FakeDepsOptions = {}): FakeDeps {
  const duplicateSiteCalls: Array<{ sourceDir: string; targetDir: string; name?: string }> = [];
  const sites = options.sites ?? [
    { name: "source-site", dir: "/tmp/fake-cwd/sites/source-site", displayName: "Source Site", createdAt: "2026-09-05T00:00:00.000Z", active: false },
  ];

  const routeDeps: SitesToolDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: options.allow ?? true, reason: options.allow === false ? "denied" : "matched" }),
    isSiteSwitcherEnabled: () => options.switcherEnabled ?? true,
    listSites: () => sites,
    duplicateSite: (required) => {
      duplicateSiteCalls.push(required);
      return options.duplicateSiteResult ?? { siteId: "new-site-id-1234", dir: required.targetDir };
    },
    cwd: "/tmp/fake-cwd",
    // Omitted entirely unless a test explicitly opts into the install-dir (not-switcher-compatible)
    // case below — `resolveSitesDeps` defaults `switcherCompatible` to `true` when `siteBinding` is
    // absent, matching every other test in this file that never touches this field.
    ...(options.switcherCompatible === false
      ? { siteBinding: { dir: "/some/site", name: "some-site", dirOverridden: true, switcherCompatible: false } }
      : {}),
  };

  return { routeDeps, duplicateSiteCalls };
}

test("sites: the catalog wires in full, with a published schema and a cross-checked risk class", () => {
  const { routeDeps } = fakeDeps();
  const registrations = buildSitesRegistrations(routeDeps);

  assert.deepEqual(
    registrations.map((registration) => registration.descriptor.id).sort(),
    ["sites_duplicate_site"]
  );
  assert.equal(registrations.length, sitesAgentToolCatalog.length, "every catalog entry must be wired");

  for (const registration of registrations) {
    assert.ok(registration.descriptor.inputSchema, `${registration.descriptor.id} must publish an input schema`);
    assert.ok(sitesDerivedRisk.has(registration.descriptor.id));
  }
});

test("sites: the contributor registers under its own domain key, idempotently", () => {
  resetToolContributorsForTests();
  registerToolContributor(contributeSitesTools());

  const contributors = listToolContributors();
  assert.equal(contributors.length, 1);
  assert.equal(contributors[0]?.domain, "sites");
  assert.equal(contributors[0]?.risk, sitesDerivedRisk);

  registerToolContributor(contributeSitesTools());
  assert.equal(listToolContributors().length, 1, "a double install replaces rather than duplicating");
  resetToolContributorsForTests();
});

test("sites_duplicate_site: happy path resolves sourceName/targetName to real dirs and calls duplicateSite", async () => {
  const { routeDeps, duplicateSiteCalls } = fakeDeps({
    duplicateSiteResult: { siteId: "minted-id-9999", dir: "/tmp/fake-cwd/sites/new-client" },
  });
  const result = await callConfirmed(routeDeps, { sourceName: "source-site", targetName: "new-client", displayName: "New Client" });

  assert.deepEqual(duplicateSiteCalls, [
    { sourceDir: "/tmp/fake-cwd/sites/source-site", targetDir: "/tmp/fake-cwd/sites/new-client", name: "New Client" },
  ]);
  assert.deepEqual(result, {
    duplicated: true,
    name: "new-client",
    dir: "/tmp/fake-cwd/sites/new-client",
    siteId: "minted-id-9999",
    sourceName: "source-site",
  });
});

test("sites_duplicate_site: displayName is optional — omitting it passes undefined through, not a default string", async () => {
  const { routeDeps, duplicateSiteCalls } = fakeDeps();
  await callConfirmed(routeDeps, { sourceName: "source-site", targetName: "new-client" });

  assert.equal(duplicateSiteCalls[0]?.name, undefined);
});

test("sites_duplicate_site: refuses when site switching is disabled, without ever calling duplicateSite or authorize", async () => {
  let authorizeCalled = false;
  const { routeDeps, duplicateSiteCalls } = fakeDeps({ switcherEnabled: false });
  const spiedDeps: SitesToolDeps = {
    ...routeDeps,
    authorize: async (args) => {
      authorizeCalled = true;
      return routeDeps.authorize(args);
    },
  };
  const handler = registrationFor(buildSitesRegistrations(spiedDeps), "sites_duplicate_site").handler;

  await assert.rejects(
    () => handler(ctxFor({ sourceName: "source-site", targetName: "new-client" })),
    (err: unknown) => err instanceof Error && err.name === "SiteSwitchingDisabledError"
  );
  assert.equal(authorizeCalled, false, "the capability flag must be checked BEFORE authorize is ever called");
  assert.equal(duplicateSiteCalls.length, 0);
});

test("sites_duplicate_site: refuses when siteBinding.switcherCompatible is false (install-dir boot), without ever calling duplicateSite or authorize", async () => {
  let authorizeCalled = false;
  const { routeDeps, duplicateSiteCalls } = fakeDeps({ switcherCompatible: false });
  const spiedDeps: SitesToolDeps = {
    ...routeDeps,
    authorize: async (args) => {
      authorizeCalled = true;
      return routeDeps.authorize(args);
    },
  };
  const handler = registrationFor(buildSitesRegistrations(spiedDeps), "sites_duplicate_site").handler;

  await assert.rejects(
    () => handler(ctxFor({ sourceName: "source-site", targetName: "new-client" })),
    (err: unknown) => err instanceof Error && err.name === "SiteBindingNotSwitchableError"
  );
  assert.equal(authorizeCalled, false, "the binding check must be checked BEFORE authorize is ever called");
  assert.equal(duplicateSiteCalls.length, 0);
});

test("sites_duplicate_site: refuses when the caller lacks system.write, without ever calling duplicateSite", async () => {
  const { routeDeps, duplicateSiteCalls } = fakeDeps({ allow: false });
  const handler = registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler;

  await assert.rejects(() => handler(ctxFor({ sourceName: "source-site", targetName: "new-client" })));
  assert.equal(duplicateSiteCalls.length, 0);
});

test("sites_duplicate_site: refuses a targetName outside the folder-name pattern, without calling listSites or duplicateSite", async () => {
  let listSitesCalled = false;
  const { routeDeps, duplicateSiteCalls } = fakeDeps();
  const spiedDeps: SitesToolDeps = {
    ...routeDeps,
    listSites: (...args) => {
      listSitesCalled = true;
      return routeDeps.listSites!(...args);
    },
  };
  const handler = registrationFor(buildSitesRegistrations(spiedDeps), "sites_duplicate_site").handler;

  await assert.rejects(
    () => handler(ctxFor({ sourceName: "source-site", targetName: "../escape" })),
    (err: unknown) => err instanceof Error && err.name === "SitesInputError"
  );
  assert.equal(listSitesCalled, false, "an invalid name must be refused before any lookup or write");
  assert.equal(duplicateSiteCalls.length, 0);
});

test("sites_duplicate_site: refuses a sourceName that does not name a real site, without calling duplicateSite", async () => {
  const { routeDeps, duplicateSiteCalls } = fakeDeps({ sites: [] });
  const handler = registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler;

  // This rejection happens INSIDE withSchemaOnRejection's wrapped callback (the source lookup
  // needs authorize/the switcher check to have already passed), so the kit re-wraps our
  // SourceSiteNotFoundError into its own ToolInputError, schema attached — unlike the folder-name
  // pattern check above, which runs before withSchemaOnRejection and surfaces unwrapped.
  await assert.rejects(
    () => handler(ctxFor({ sourceName: "does-not-exist", targetName: "new-client" })),
    (err: unknown) =>
      err instanceof Error && err.name === "ToolInputError" && err.message.includes("does not name a real site")
  );
  assert.equal(duplicateSiteCalls.length, 0);
});
