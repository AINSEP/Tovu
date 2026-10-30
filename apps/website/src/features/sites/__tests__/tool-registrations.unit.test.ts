import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createContributionRegistry } from "@jini-ai/core";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";

import { ForbiddenError } from "@jini-ai/cms/core";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InitDirNotEmptyError, SiteDirInvalidError, ValidationError, type SiteListEntry } from "#src/platform/site-dir/index";


import { sitesAgentToolCatalog } from "../agent-tools.js";
import type { SitesToolDeps } from "../deps.js";
import { buildSitesReadRegistrations, buildSitesRegistrations, contributeSitesListTools, contributeSitesTools, sitesDerivedRisk } from "../tool-registrations.js";

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

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
  duplicateSiteId?: string;
}

interface FakeDeps {
  routeDeps: SitesToolDeps;
  duplicateSiteCalls: Array<{ sourceDir: string; targetDir: string; name?: string }>;
}

const fixtureRoots: string[] = [];
afterEach(() => { for (const root of fixtureRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fakeDeps(options: FakeDepsOptions = {}): FakeDeps {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "tovu-duplicate-tools-")));
  fixtureRoots.push(root);
  // The source may be a legacy checkout site; new copies use an isolated shared home/catalog.
  const sitesWorkspace = createSitesWorkspace({}, { homeDir: root, cwd: "/tmp/fake-cwd", platform: "linux", sourceRoots: [], catalogRecovery: false,
    env: { TOVU_SITES_HOME: path.join(root, "shared-home") },
  });
  const duplicateSiteCalls: Array<{ sourceDir: string; targetDir: string; name?: string }> = [];
  const sites = options.sites ?? [
    { name: "source-site", dir: "/tmp/fake-cwd/sites/source-site", displayName: "Source Site", createdAt: "2026-09-05T00:00:00.000Z", active: false },
  ];

  const routeDeps: SitesToolDeps = {
    bundledSourceRoot: bundledAgentPluginsDir(),
    createSite: async () => assert.fail("unexpected site creation"),
    workspaceId: WORKSPACE_ID,
    sitesWorkspace,
    authorize: async () => ({ allowed: options.allow ?? true, reason: options.allow === false ? "denied" : "matched" }),
    isSiteSwitcherEnabled: () => options.switcherEnabled ?? true,
    listSites: () => sites,
    duplicateSite: async (required) => {
      duplicateSiteCalls.push(required);
      return { siteId: options.duplicateSiteId ?? "new-site-id-1234", dir: required.targetDir };
    },
    // The served binding is the ONLY source of the legacy discovery root (`/tmp/fake-cwd/sites`) —
    // there is no `cwd` dep. A test opts into the install-dir (not-switcher-compatible) case explicitly.
    siteBinding: options.switcherCompatible === false
      ? { dir: "/some/site", name: "some-site", dirOverridden: true, switcherCompatible: false }
      : { dir: "/tmp/fake-cwd/sites/served", name: "served", dirOverridden: false, switcherCompatible: true },
  };

  return { routeDeps, duplicateSiteCalls };
}

test("sites: the catalog wires in full, with a published schema and a cross-checked risk class", () => {
  const { routeDeps } = fakeDeps();
  const registrations = buildSitesRegistrations(routeDeps);

  assert.deepEqual(
    registrations.map((registration) => registration.descriptor.id).sort(),
    ["sites_create_site", "sites_duplicate_site", "sites_switch_site"]
  );
  assert.equal(registrations.length, sitesAgentToolCatalog.length, "every catalog entry must be wired");

  for (const registration of registrations) {
    assert.ok(registration.descriptor.inputSchema, `${registration.descriptor.id} must publish an input schema`);
    assert.ok(sitesDerivedRisk.has(registration.descriptor.id));
  }
});

test("sites: the contributor registers under its own domain key, idempotently", () => {
  contributions.contributors.clear({});
  contributions.contributors.register({ contribution: contributeSitesTools() });

  const contributors = contributions.contributors.list({});
  assert.equal(contributors.length, 1);
  assert.equal(contributors[0]?.domain, "sites");
  assert.equal(contributors[0]?.risk, sitesDerivedRisk);

  contributions.contributors.register({ contribution: contributeSitesTools() });
  assert.equal(contributions.contributors.list({}).length, 1, "a double install replaces rather than duplicating");
  contributions.contributors.clear({});
});

test("sites_duplicate_site: happy path resolves sourceName/targetName to real dirs and calls duplicateSite", async () => {
  const { routeDeps, duplicateSiteCalls } = fakeDeps({
    duplicateSiteId: "minted-id-9999",
  });
  const targetDir = path.join(routeDeps.sitesWorkspace!.home({}), "new-client");
  const handler = registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler;

  const result = await handler(ctxFor({ sourceName: "source-site", targetName: "new-client", displayName: "New Client" }));

  assert.deepEqual(duplicateSiteCalls, [
    { sourceDir: "/tmp/fake-cwd/sites/source-site", targetDir, name: "New Client" },
  ]);
  assert.deepEqual(result, {
    name: "new-client",
    dir: targetDir,
    siteId: "minted-id-9999",
    sourceName: "source-site",
  });
  assert.deepEqual(routeDeps.sitesWorkspace!.registry({}).list({}).map(({ id, name, path, createdBy }) => ({ id, name, path, createdBy })),
    [{ id: "minted-id-9999", name: "New Client", path: targetDir, createdBy: "Web" }]);
});

test("sites_duplicate_site: displayName is optional — omitting it passes undefined through, not a default string", async () => {
  const { routeDeps, duplicateSiteCalls } = fakeDeps();
  const targetDir = path.join(routeDeps.sitesWorkspace!.home({}), "new-client");
  const handler = registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler;

  const result = await handler(ctxFor({ sourceName: "source-site", targetName: "new-client" }));

  assert.equal(duplicateSiteCalls[0]?.name, undefined);
  assert.deepEqual(duplicateSiteCalls, [{ sourceDir: "/tmp/fake-cwd/sites/source-site", targetDir, name: undefined }]);
  assert.deepEqual(result, { name: "new-client", dir: targetDir, siteId: "new-site-id-1234", sourceName: "source-site" });
  assert.equal(routeDeps.sitesWorkspace!.registry({}).list({})[0]?.name, "new-client");
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
  const requests: unknown[] = [];
  routeDeps.authorize = async (request) => {
    requests.push(request);
    return { allowed: request.permission === "content.read", reason: "read-only principal" };
  };
  const handler = registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler;

  await assert.rejects(() => handler(ctxFor({ sourceName: "source-site", targetName: "new-client" })), (error: unknown) => { assert.ok(error instanceof ForbiddenError); assert.equal(error.message, `principal '${PRINCIPAL_ID}' is not authorized for 'system.write' (read-only principal)`); return true; });
  assert.deepEqual(requests, [{ principalId: PRINCIPAL_ID, workspaceId: WORKSPACE_ID, permission: "system.write", entityType: "site-registry" }]);
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

test("sites_duplicate_site: an absent capability reader defaults to disabled before authorization", async () => {
  const { routeDeps, duplicateSiteCalls } = fakeDeps();
  delete routeDeps.isSiteSwitcherEnabled;
  const authorization: unknown[] = [];
  routeDeps.authorize = async request => { authorization.push(request); return { allowed: true, reason: "matched" }; };
  await assert.rejects(registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler(
    ctxFor({ sourceName: "source-site", targetName: "new-client" })),
    { name: "SiteSwitchingDisabledError", message: "site switching is disabled on this deployment — sites_duplicate_site is unavailable" });
  assert.deepEqual(authorization, []);
  assert.deepEqual(duplicateSiteCalls, []);
});

for (const ErrorClass of [ValidationError, InitDirNotEmptyError, SiteDirInvalidError]) {
  test(`sites_duplicate_site: ${ErrorClass.name} is returned as a schema-decorated input error`, async () => {
    const { routeDeps } = fakeDeps();
    const message = `${ErrorClass.name}: cannot copy this source to this target`;
    routeDeps.duplicateSite = async () => { throw new ErrorClass(message); };
    await assert.rejects(registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler(
      ctxFor({ sourceName: "source-site", targetName: "new-client" })), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.name, "ToolInputError");
      assert.ok(error.message.includes(message));
      assert.ok(error.message.includes("sourceName"));
      return true;
    });
    assert.deepEqual(routeDeps.sitesWorkspace!.registry({}).list({}), []);
  });
}

test("sites_duplicate_site: an unexpected copy failure propagates unchanged and never registers a target", async () => {
  const { routeDeps } = fakeDeps();
  const fault = new Error("disk disconnected during copy");
  routeDeps.duplicateSite = async () => { throw fault; };
  await assert.rejects(registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler(
    ctxFor({ sourceName: "source-site", targetName: "new-client" })), error => error === fault);
  assert.deepEqual(routeDeps.sitesWorkspace!.registry({}).list({}), []);
});

test("sites_duplicate_site: the default workspace stores copies in the isolated home catalog", async t => {
  const { routeDeps, duplicateSiteCalls } = fakeDeps();
  delete routeDeps.sitesWorkspace;
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "tovu-default-workspace-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const previousHome = process.env.TOVU_SITES_HOME;
  process.env.TOVU_SITES_HOME = path.join(root, "shared-home");
  t.after(() => { if (previousHome === undefined) delete process.env.TOVU_SITES_HOME; else process.env.TOVU_SITES_HOME = previousHome; });
  const workspace = createSitesWorkspace({}, { cwd: "/tmp/fake-cwd" });
  const targetDir = path.join(workspace.home({}), "default-copy");
  const result = await registrationFor(buildSitesRegistrations(routeDeps), "sites_duplicate_site").handler(
    ctxFor({ sourceName: "source-site", targetName: "default-copy" }));
  assert.deepEqual(result, { name: "default-copy", dir: targetDir, siteId: "new-site-id-1234", sourceName: "source-site" });
  assert.deepEqual(duplicateSiteCalls, [{ sourceDir: "/tmp/fake-cwd/sites/source-site", targetDir, name: undefined }]);
  assert.deepEqual(workspace.registry({}).list({}).map(({ id, name, path }) => ({ id, name, path })),
    [{ id: "new-site-id-1234", name: "default-copy", path: targetDir }]);
});

test("sites_list: default capability and persisted choice readers use the binding's tree", async t => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "tovu-read-sites-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const previousFlag = process.env.TOVU_ENABLE_SITE_SWITCHER;
  delete process.env.TOVU_ENABLE_SITE_SWITCHER;
  t.after(() => { if (previousFlag === undefined) delete process.env.TOVU_ENABLE_SITE_SWITCHER; else process.env.TOVU_ENABLE_SITE_SWITCHER = previousFlag; });
  writeFileSync(path.join(root, ".env"), "OTHER=private\nTOVU_SITE=queued\n");
  const siteBinding = { dir: path.join(root, "sites", "absent"), name: "absent", dirOverridden: false, switcherCompatible: true };
  const deps = { workspaceId: WORKSPACE_ID, siteBinding, authorize: async () => ({ allowed: true, reason: "matched" }), listSites: () => [] };
  const result = await registrationFor(buildSitesReadRegistrations(deps), "sites_list").handler(ctxFor({}));
  assert.deepEqual(result, { switchingEnabled: false, sites: [], currentSite: { ...siteBinding, listed: false }, persistedSiteName: "queued" });
});

test("sites_list: an install-directory binding has no persisted switcher choice", async t => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "tovu-installed-site-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const siteBinding = { dir: path.join(root, "absent"), name: "absent", dirOverridden: true, switcherCompatible: false };
  const deps = { workspaceId: WORKSPACE_ID, siteBinding, authorize: async () => ({ allowed: true, reason: "matched" }),
    isSiteSwitcherEnabled: () => true, readPersistedActiveSite: () => { assert.fail("install directories have no switcher tree"); } };
  const contributor = contributeSitesListTools();
  const registrations = contributor.build(deps as unknown as Parameters<typeof contributor.build>[0], {
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
      idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
  });
  const result = await registrationFor(registrations, "sites_list").handler(ctxFor({}));
  assert.deepEqual(result, { switchingEnabled: true, sites: [], currentSite: { ...siteBinding, listed: false }, persistedSiteName: null });
});
