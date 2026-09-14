import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/cms/identity";
import {
  clear,
  getEffective,
  InMemorySettingsRepo,
  resolveDefinitionRaw,
  set,
  type AuthorizeFn,
  type SettingRevisionRecord,
} from "@jini-ai/cms/settings";
import type { WorkspaceRepoPort } from "@jini-ai/cms/workspace";

import {
  ensureSiteTitleSettingDefinition,
  InMemorySiteTitlePreservationStore,
  preserveLegacySiteTitles,
  resolveSiteTitle,
  SITE_TITLE_KEY,
  SITE_TITLE_NAMESPACE,
} from "../site-title.js";

/**
 * @file SPEC-050 v0.2.0, Wiring Order Step 2, over the in-memory settings ledger: the pin for
 * pre-existing workspaces (REQ-06, REQ-11) and the resolver's no-owner-title value (REQ-03, REQ-05,
 * REQ-07, REQ-09). The same rules over HTTP and a real SQLite database are in
 * `server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts`.
 */

const SYSTEM_PRINCIPAL_ID = "system-settings-migration";
const OWNER_PRINCIPAL_ID = "owner-principal";
const OWNER_TITLE = "Acme Field Notes";
const SITE_DISPLAY_NAME = "My Site";
const WORKSPACE_NAME = "Local Tovu Workspace";

const clock = { nowIso: () => "2026-09-12T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `site-title-id-${++idCounter}` };
const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: "test" });

interface Ledger {
  settingsRepo: InMemorySettingsRepo;
  clock: typeof clock;
  ids: typeof ids;
  principals: InMemoryPrincipalRepo;
  preservationStore: InMemorySiteTitlePreservationStore;
}

async function makeLedger(pendingWorkspaceIds: string[] = [], options: { register?: boolean } = {}): Promise<Ledger> {
  const ledger: Ledger = {
    settingsRepo: new InMemorySettingsRepo(),
    clock,
    ids,
    principals: new InMemoryPrincipalRepo([]),
    preservationStore: new InMemorySiteTitlePreservationStore(pendingWorkspaceIds),
  };
  if (options.register !== false) {
    await ensureSiteTitleSettingDefinition(ledger, { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  }
  return ledger;
}

function preserve(ledger: Ledger) {
  return preserveLegacySiteTitles(ledger, { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
}

function ownerWriteDeps(ledger: Ledger) {
  return { repo: ledger.settingsRepo, clock, ids, authorize: allowAll, principals: ledger.principals };
}

async function ownerSet(ledger: Ledger, workspaceId: string, value: string): Promise<void> {
  await set({
    deps: ownerWriteDeps(ledger),
    input: { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scope: "workspace", workspaceId, value, callerPrincipalId: OWNER_PRINCIPAL_ID },
  });
}

async function ownerClear(ledger: Ledger, workspaceId: string): Promise<void> {
  await clear({
    deps: ownerWriteDeps(ledger),
    input: { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scope: "workspace", workspaceId, callerPrincipalId: OWNER_PRINCIPAL_ID },
  });
}

async function systemPinRevisions(ledger: Ledger, workspaceId: string): Promise<SettingRevisionRecord[]> {
  const definition = await resolveDefinitionRaw(
    { repo: ledger.settingsRepo },
    { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, workspaceId: null }
  );
  assert.ok(definition, "core.site/title must be registered");
  const revisions = await ledger.settingsRepo.listRevisions({ settingId: definition.settingId });
  return revisions.filter((rev) => rev.op === "set" && rev.workspaceId === workspaceId && rev.actor === SYSTEM_PRINCIPAL_ID);
}

async function effectiveTitle(ledger: Ledger, workspaceId: string) {
  const resolved = await getEffective(
    { repo: ledger.settingsRepo },
    { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scopeContext: { workspaceId } }
  );
  return { value: resolved?.value, sourceLayer: resolved?.sourceLayer };
}

function resolveDeps(
  ledger: Ledger,
  options: { siteDisplayName?: string; workspaceRepo?: Pick<WorkspaceRepoPort, "findById"> } = {}
) {
  const workspaceRepo: Pick<WorkspaceRepoPort, "findById"> = options.workspaceRepo ?? {
    findById: async (id) => ({ id, name: WORKSPACE_NAME, slug: id, createdAt: "2026-04-06T00:00:00.000Z" }),
  };
  return {
    settingsRepo: ledger.settingsRepo,
    preservationStore: ledger.preservationStore,
    workspaceRepo,
    siteDisplayName: { read: () => options.siteDisplayName },
  };
}

function silenceConsoleError(t: TestContext): unknown[][] {
  const calls: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    calls.push(args);
  });
  return calls;
}

// ---------------------------------------------------------------------------
// The pin (REQ-06, REQ-11)
// ---------------------------------------------------------------------------

test("AC-07 (REQ-06, REQ-11): a pending workspace is pinned to Tovu Demo Site through set, with exactly one system revision", async () => {
  const ledger = await makeLedger(["ws-pre"]);

  const result = await preserve(ledger);

  assert.deepEqual(result, { pinnedWorkspaceIds: ["ws-pre"], skippedWorkspaceIds: [], failedWorkspaceIds: [] });
  assert.deepEqual(await effectiveTitle(ledger, "ws-pre"), { value: "Tovu Demo Site", sourceLayer: "workspace" });
  assert.equal((await systemPinRevisions(ledger, "ws-pre")).length, 1);
  assert.equal(await ledger.preservationStore.isPending("ws-pre"), false, "a pinned workspace is no longer pending");
});

test("AC-08 (REQ-06): after an owner reset, later preservation runs append no system revision, and the site renders its no-owner-title value", async () => {
  const ledger = await makeLedger(["ws-pre"]);
  await preserve(ledger);
  await ownerClear(ledger, "ws-pre");

  await preserve(ledger);
  await preserve(ledger);

  assert.equal((await systemPinRevisions(ledger, "ws-pre")).length, 1, "the reset must never be re-pinned");
  assert.equal(
    await resolveSiteTitle(resolveDeps(ledger, { siteDisplayName: SITE_DISPLAY_NAME }), { workspaceId: "ws-pre" }),
    "My Site"
  );
});

test("INV-02 (REQ-06): a still-pending workspace whose value row is cleared (the pin wrote, then the process died before marking it) is skipped, never re-pinned", async () => {
  const ledger = await makeLedger(["ws-pre"]);
  await ownerSet(ledger, "ws-pre", OWNER_TITLE);
  await ownerClear(ledger, "ws-pre");

  const result = await preserve(ledger);

  assert.deepEqual(result, { pinnedWorkspaceIds: [], skippedWorkspaceIds: ["ws-pre"], failedWorkspaceIds: [] });
  assert.equal((await systemPinRevisions(ledger, "ws-pre")).length, 0);
  assert.equal(await ledger.preservationStore.isPending("ws-pre"), false, "a skipped workspace is resolved, not retried");
});

test("AC-09 (REQ-06, INV-02): an owner title set before preservation runs is kept, and the workspace is reported skipped", async () => {
  const ledger = await makeLedger(["ws-pre"]);
  await ownerSet(ledger, "ws-pre", OWNER_TITLE);

  const result = await preserve(ledger);

  assert.deepEqual(result, { pinnedWorkspaceIds: [], skippedWorkspaceIds: ["ws-pre"], failedWorkspaceIds: [] });
  assert.deepEqual(await effectiveTitle(ledger, "ws-pre"), { value: OWNER_TITLE, sourceLayer: "workspace" });
  assert.equal((await systemPinRevisions(ledger, "ws-pre")).length, 0);
});

test("AC-17 (REQ-11, REQ-07): a pin write that throws for one of two workspaces fails only that one, logs its id, and it keeps rendering Tovu Demo Site", async (t) => {
  const ledger = await makeLedger(["ws-a", "ws-b"]);
  const saveWorkspaceValue = ledger.settingsRepo.saveWorkspaceValue.bind(ledger.settingsRepo);
  ledger.settingsRepo.saveWorkspaceValue = async (record) => {
    if (record.workspaceId === "ws-b") throw new Error("injected pin write failure");
    return saveWorkspaceValue(record);
  };
  const errors = silenceConsoleError(t);

  const result = await preserve(ledger);

  assert.deepEqual(result, { pinnedWorkspaceIds: ["ws-a"], skippedWorkspaceIds: [], failedWorkspaceIds: ["ws-b"] });
  assert.ok(
    errors.some((args) => args.some((arg) => String(arg).includes("ws-b"))),
    "each failed workspace id is logged"
  );
  assert.equal(await ledger.preservationStore.isPending("ws-b"), true, "a failed pin stays pending, so the next boot retries it");
  assert.equal(
    await resolveSiteTitle(resolveDeps(ledger, { siteDisplayName: SITE_DISPLAY_NAME }), { workspaceId: "ws-b" }),
    "Tovu Demo Site"
  );
});

test("REQ-11: with core.site/title not registered, every pending workspace is reported failed and stays pending", async (t) => {
  const ledger = await makeLedger(["ws-a"], { register: false });
  const errors = silenceConsoleError(t);

  const result = await preserve(ledger);

  assert.deepEqual(result, { pinnedWorkspaceIds: [], skippedWorkspaceIds: [], failedWorkspaceIds: ["ws-a"] });
  assert.equal(await ledger.preservationStore.isPending("ws-a"), true);
  assert.ok(errors.some((args) => args.some((arg) => String(arg).includes("ws-a"))), "the failed workspace id is logged");
});

test("REQ-06: with nothing pending, preservation writes nothing", async () => {
  const ledger = await makeLedger();
  const revisionsBefore = await ledger.settingsRepo.maxRevisionSeq();

  assert.deepEqual(await preserve(ledger), { pinnedWorkspaceIds: [], skippedWorkspaceIds: [], failedWorkspaceIds: [] });
  assert.equal(await ledger.settingsRepo.maxRevisionSeq(), revisionsBefore);
});

// ---------------------------------------------------------------------------
// The resolver (REQ-03, REQ-05, REQ-07, REQ-09)
// ---------------------------------------------------------------------------

test("REQ-05 (AC-06): a workspace that was never pending, with no owner title, renders the site display name", async () => {
  const ledger = await makeLedger();
  assert.equal(
    await resolveSiteTitle(resolveDeps(ledger, { siteDisplayName: SITE_DISPLAY_NAME }), { workspaceId: "ws-new" }),
    "My Site"
  );
});

test("REQ-05 (EC-03): with no site directory, the no-owner-title value falls back to workspaces.name", async () => {
  const ledger = await makeLedger();
  assert.equal(await resolveSiteTitle(resolveDeps(ledger), { workspaceId: "ws-new" }), "Local Tovu Workspace");
});

test("REQ-07 (AC-12): a pending workspace with no owner title renders Tovu Demo Site, never its display name", async () => {
  const ledger = await makeLedger(["ws-pre"]);
  assert.equal(
    await resolveSiteTitle(resolveDeps(ledger, { siteDisplayName: SITE_DISPLAY_NAME }), { workspaceId: "ws-pre" }),
    "Tovu Demo Site"
  );
});

test("REQ-07: before core.site/title is registered, a workspace renders Tovu Demo Site", async () => {
  const ledger = await makeLedger([], { register: false });
  assert.equal(
    await resolveSiteTitle(resolveDeps(ledger, { siteDisplayName: SITE_DISPLAY_NAME }), { workspaceId: "ws-new" }),
    "Tovu Demo Site"
  );
});

test("REQ-03 (AC-04): an owner title wins over a pending marker and over the display name", async () => {
  const ledger = await makeLedger(["ws-pre"]);
  await ownerSet(ledger, "ws-pre", OWNER_TITLE);
  await ownerSet(ledger, "ws-new", OWNER_TITLE);
  const deps = resolveDeps(ledger, { siteDisplayName: SITE_DISPLAY_NAME });

  assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-pre" }), OWNER_TITLE);
  assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-new" }), OWNER_TITLE);
});

test("REQ-09: an unusable owner value renders the no-owner-title value: the display name when resolved, Tovu Demo Site while pending", async () => {
  for (const unusable of ["", "   ", "x".repeat(201)]) {
    const ledger = await makeLedger(["ws-pre"]);
    await ownerSet(ledger, "ws-pre", unusable);
    await ownerSet(ledger, "ws-new", unusable);
    const deps = resolveDeps(ledger, { siteDisplayName: SITE_DISPLAY_NAME });
    const label = JSON.stringify(unusable.slice(0, 8));

    assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-new" }), "My Site", `resolved workspace, value ${label}`);
    assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-pre" }), "Tovu Demo Site", `pending workspace, value ${label}`);
  }
});

test("REQ-09: a blank display name falls back to workspaces.name, and a blank workspace name to Tovu Demo Site", async () => {
  const ledger = await makeLedger();
  const blankWorkspace: Pick<WorkspaceRepoPort, "findById"> = {
    findById: async (id) => ({ id, name: "  ", slug: id, createdAt: "2026-04-06T00:00:00.000Z" }),
  };
  const missingWorkspace: Pick<WorkspaceRepoPort, "findById"> = { findById: async () => null };

  assert.equal(await resolveSiteTitle(resolveDeps(ledger, { siteDisplayName: "  " }), { workspaceId: "ws-new" }), "Local Tovu Workspace");
  assert.equal(await resolveSiteTitle(resolveDeps(ledger, { workspaceRepo: blankWorkspace }), { workspaceId: "ws-new" }), "Tovu Demo Site");
  assert.equal(await resolveSiteTitle(resolveDeps(ledger, { workspaceRepo: missingWorkspace }), { workspaceId: "ws-new" }), "Tovu Demo Site");
});

test("REQ-09 (AC-16): a settings read, a marker read, or a name read that throws resolves Tovu Demo Site", async (t) => {
  silenceConsoleError(t);

  const settingsThrows = await makeLedger();
  settingsThrows.settingsRepo.getWorkspaceValue = async () => {
    throw new Error("injected settings read failure");
  };
  assert.equal(
    await resolveSiteTitle(resolveDeps(settingsThrows, { siteDisplayName: SITE_DISPLAY_NAME }), { workspaceId: "ws-new" }),
    "Tovu Demo Site"
  );

  const markerThrows = await makeLedger();
  markerThrows.preservationStore.isPending = async () => {
    throw new Error("injected marker read failure");
  };
  assert.equal(
    await resolveSiteTitle(resolveDeps(markerThrows, { siteDisplayName: SITE_DISPLAY_NAME }), { workspaceId: "ws-new" }),
    "Tovu Demo Site"
  );

  const nameThrows = await makeLedger();
  const throwingWorkspaceRepo: Pick<WorkspaceRepoPort, "findById"> = {
    findById: async () => {
      throw new Error("injected workspace read failure");
    },
  };
  assert.equal(
    await resolveSiteTitle(resolveDeps(nameThrows, { workspaceRepo: throwingWorkspaceRepo }), { workspaceId: "ws-new" }),
    "Tovu Demo Site"
  );
});

test("REQ-07: the pending marker is read before the value, so a pin that lands mid-render still renders Tovu Demo Site", async () => {
  const ledger = await makeLedger(["ws-pre"]);
  // Lands the whole pin (value written, marker resolved) between the resolver's two reads. A
  // resolver that read the value first would see no value and then a resolved marker, and render
  // the display name for this one request.
  const getWorkspaceValue = ledger.settingsRepo.getWorkspaceValue.bind(ledger.settingsRepo);
  let armed = true;
  ledger.settingsRepo.getWorkspaceValue = async (required) => {
    const row = await getWorkspaceValue(required);
    if (armed) {
      armed = false;
      await preserve(ledger);
    }
    return row;
  };
  const isPending = ledger.preservationStore.isPending.bind(ledger.preservationStore);
  ledger.preservationStore.isPending = async (workspaceId) => {
    const pending = await isPending(workspaceId);
    if (armed) {
      armed = false;
      await preserve(ledger);
    }
    return pending;
  };

  assert.equal(
    await resolveSiteTitle(resolveDeps(ledger, { siteDisplayName: SITE_DISPLAY_NAME }), { workspaceId: "ws-pre" }),
    "Tovu Demo Site"
  );
  assert.equal(armed, false, "the pin must have landed during the render");
});

// ---------------------------------------------------------------------------
// The live display name (REQ-13)
// ---------------------------------------------------------------------------

test("REQ-13 (AC-22): the display name is read at every resolution, so a rename renders with the same deps, and a pending pin or an owner title still wins", async () => {
  const ledger = await makeLedger(["ws-pre"]);
  let configuredName = SITE_DISPLAY_NAME;
  let reads = 0;
  const deps = {
    ...resolveDeps(ledger),
    siteDisplayName: {
      read: () => {
        reads += 1;
        return configuredName;
      },
    },
  };

  assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-new" }), "My Site");
  configuredName = "Renamed Site";
  assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-new" }), "Renamed Site", "the rename renders without rebuilding deps");
  assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-pre" }), "Tovu Demo Site", "a pending pin still wins over the renamed display name");

  await ownerSet(ledger, "ws-new", OWNER_TITLE);
  configuredName = "Renamed Again";
  assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-new" }), OWNER_TITLE, "an owner title still wins over a later rename");
  assert.equal(reads, 2, "only a render that reaches the display-name tier reads the name");
});

test("REQ-09 (REQ-13): a display-name read that throws resolves Tovu Demo Site", async (t) => {
  silenceConsoleError(t);
  const ledger = await makeLedger();
  const deps = {
    ...resolveDeps(ledger),
    siteDisplayName: {
      read: (): string | undefined => {
        throw new Error("injected display-name read failure");
      },
    },
  };

  assert.equal(await resolveSiteTitle(deps, { workspaceId: "ws-new" }), "Tovu Demo Site");
});
