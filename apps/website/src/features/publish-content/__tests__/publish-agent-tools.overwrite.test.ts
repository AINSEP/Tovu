import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

/**
 * @file S8 of `ADS-memory/.local-artifacts/publish-overwrite-live-plan-2026-09-24.md` §3 Assistant
 * chat — the "Overwrite on live" ticks in the `publish_content_publish` MCP-UI dialog.
 *
 * A separate file from the sibling `publish-agent-tools.test.ts` rather than an addition to it,
 * because these tests need `mock.module()` on `peer-transport.ts`/`export-bundle.ts`/
 * `destination-credential.ts` registered BEFORE `tool-registrations.ts` is ever imported (the same
 * "each is imported only once, dynamically" idiom `tool-registrations.plugins-set-enabled-busy.
 * test.ts` documents). The sibling file already imports `tool-registrations.js` statically at its
 * top, so a mock registered later in that same module graph would never take effect — ES module
 * imports are hoisted and evaluated before any later top-level statement, mock.module() included.
 *
 * What is proved here:
 * 1. A plan that would write nothing still raises the dialog when live can overwrite something.
 * 2. Answering with no ticks runs the pre-existing confirm/execute path, unchanged.
 * 3. A tick re-pushes and re-executes with exactly that key.
 * 4. A key the dialog never offered is dropped, never forwarded.
 * 5. Live moving between the shown plan and the re-plan refuses the publish outright.
 * 6. An older live (no `overwrite-live` feature) offers no choices and takes today's early return —
 *    no exchange is ever opened.
 */

const WORKSPACE_ID = "ws-publish-overwrite";
const PRINCIPAL_ID = "principal-under-test";

// ---------------------------------------------------------------------------
// Module mocks — registered before ANY dynamic import of the module under test.
// ---------------------------------------------------------------------------

const realPeerTransport = await import("#src/features/publish-content/peer-transport");
const realExportBundle = await import("#src/features/publish-content/export-bundle");
const realDestinationCredential = await import("#src/features/publish-content/destination-credential");

interface ScriptedPushResult {
  bundleId: string;
  blobsUploaded: readonly string[];
  blobsUnavailable: readonly string[];
  plan: { planId: string; planHash: string; details: { refused: boolean; rows: unknown[] } };
  notSupportedByLive: readonly unknown[];
  liveCanOverwrite: boolean;
}

const pushCalls: Array<{ overwriteEntityKeys?: readonly string[] }> = [];
const executeCalls: Array<{ bundleId: string; confirmationToken: string; overwriteEntityKeys?: readonly string[] }> = [];
let confirmCalls = 0;
let pushQueue: ScriptedPushResult[] = [];
let executeQueue: Array<Record<string, unknown>> = [];

mock.module("#src/features/publish-content/peer-transport", {
  namedExports: {
    ...realPeerTransport,
    pushBundleToPeer: async (_deps: unknown, required: { overwriteEntityKeys?: readonly string[] }) => {
      pushCalls.push({ overwriteEntityKeys: required.overwriteEntityKeys });
      const next = pushQueue.shift();
      if (!next) throw new Error("test bug: no scripted push result queued");
      return next;
    },
    confirmPeerImport: async () => {
      confirmCalls += 1;
      return { confirmationToken: `token-${confirmCalls}` };
    },
    executePeerImport: async (
      _deps: unknown,
      required: { bundleId: string; confirmationToken: string; overwriteEntityKeys?: readonly string[] }
    ) => {
      executeCalls.push(required);
      const next = executeQueue.shift();
      if (!next) throw new Error("test bug: no scripted execute result queued");
      return next;
    },
  },
});

mock.module("#src/features/publish-content/export-bundle", {
  namedExports: {
    ...realExportBundle,
    buildExportBundle: async () => ({ entities: [], blobManifest: [], artifactFormatVersion: 1, hashVersion: 1, sourceLabel: "test" }) as never,
  },
});

mock.module("#src/features/publish-content/destination-credential", {
  namedExports: {
    ...realDestinationCredential,
    resolvePublishDestinationCredential: async () => ({ apiKey: "fake-api-key", baseUrl: "https://example.com", remoteWorkspaceId: "ws-remote" }) as never,
  },
});

const { buildPublishContentRegistrations } = await import("#src/features/publish-content/tool-registrations");
const { PUBLISH_CONTENT_PUBLISH_TOOL_ID } = await import("#src/features/publish-content/agent-tools");
const { entityKey } = await import("#src/features/publish-content/planner");
const { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } = await import("#src/contracts/core/tool-surface-exchanges");
const { registerPublishContentContributor, resetPublishContentContributorsForTests } = await import("#src/features/publish-content/type-registry");
type PublishContentToolDeps = import("#src/features/publish-content/tool-registrations").PublishContentToolDeps;
type PublishContentPeerRecord = import("#src/features/publish-content/peers").PublishContentPeerRecord;

test.beforeEach(() => {
  pushCalls.length = 0;
  executeCalls.length = 0;
  confirmCalls = 0;
  pushQueue = [];
  executeQueue = [];
  // Readiness requires at least one registered publish-content contributor, or the tool returns
  // `nothing-publishable` before ever reaching a peer — same fixture the sibling test file uses.
  resetPublishContentContributorsForTests();
  registerPublishContentContributor({ entityType: "post", dependsOn: [], build: () => null as never });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KEY_ABOUT = entityKey("page", "about-local");

/** A resolvable slug clash: the local "About" page collides with live's `post-about`. */
const CLASH_ROW = {
  entityType: "page",
  entityId: "about-local",
  entityLabel: "About",
  outcome: "blocked" as const,
  writes: false,
  reason: "slug 'about' is already held by a different page ('post-about')",
  canOverwrite: true,
  retires: { entityType: "post", entityId: "post-about", entityLabel: "About Tovu", hash: "hash-about" },
};

/** The same row once the operator has ticked it and the destination honoured the tick. */
const CLASH_ROW_FORCED = {
  ...CLASH_ROW,
  outcome: "forced" as const,
  writes: true,
  canOverwrite: false,
};

/** A header-nav conflict — offered, but not the row these tests tick. */
const NAV_ROW = {
  entityType: "menu",
  entityId: "menu-header-nav",
  entityLabel: "header-nav",
  outcome: "conflict" as const,
  writes: false,
  reason: "no prior sync baseline for menu 'menu-header-nav' with this peer — the destination already holds different content",
  canOverwrite: true,
  retires: null,
};

function pushResult(overrides: Partial<ScriptedPushResult> & { rows: unknown[] }): ScriptedPushResult {
  return {
    bundleId: "bundle-1",
    blobsUploaded: [],
    blobsUnavailable: [],
    plan: { planId: "plan-1", planHash: "hash-1", details: { refused: false, rows: overrides.rows } },
    notSupportedByLive: [],
    liveCanOverwrite: true,
    ...overrides,
  };
}

function peerRow(overrides: Partial<PublishContentPeerRecord> = {}): PublishContentPeerRecord {
  return {
    workspaceId: WORKSPACE_ID,
    id: "dest-1",
    label: "example.com",
    baseUrl: "https://example.com",
    remoteWorkspaceId: "ws-remote",
    sealed: null,
    masked: null,
    aadVersion: 1,
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    ...overrides,
  } as PublishContentPeerRecord;
}

function toolDeps(overrides: Partial<PublishContentToolDeps> = {}): PublishContentToolDeps {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true }),
    clock: { nowIso: () => "2026-09-24T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    postRepo: null as never,
    pluginBeforeSaveHook: undefined as never,
    outbox: null as never,
    mediaRepo: null as never,
    assetBlobRepo: null as never,
    blobStore: {} as never,
    redirectsWriteDeps: null as never,
    menuRepo: null as never,
    navLocationBindingRepo: null as never,
    workspaceRepo: { findById: async () => ({ name: "Test Site" }) },
    publishContentPeerRepo: {
      listByWorkspace: async () => [peerRow()],
      insert: async () => undefined as never,
      update: async () => undefined as never,
      findById: async () => null,
      delete: async () => undefined,
    } as unknown as PublishContentToolDeps["publishContentPeerRepo"],
    publishContentPeerHttpClient: null as never,
    siteAssistantSecretSealer: null as never,
    siteAssistantSecretKeyring: null as never,
    findPublishCandidate: async () => null,
    publishTrustProvisioning: null as never,
    ...overrides,
  } as PublishContentToolDeps;
}

function registrationsFor(deps: PublishContentToolDeps) {
  const surfaceExchanges = createSurfaceExchangeStore();
  const registrations = new Map(buildPublishContentRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
  const publishTool = registrations.get(PUBLISH_CONTENT_PUBLISH_TOOL_ID);
  assert.ok(publishTool, `${PUBLISH_CONTENT_PUBLISH_TOOL_ID} was not built`);
  return { surfaceExchanges, publishTool };
}

function call(registration: ToolRegistration, options: { input?: unknown; emitSurface?: (s: unknown) => Promise<void> } = {}) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  } as ToolExecutionContext;
  return registration.handler(ctx);
}

function exchangeIdFromSurface(surface: unknown): string {
  const html = (surface as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id, or the human's answer has nothing to name");
  return match[1]!;
}

async function raiseDialog(registration: ToolRegistration) {
  const emitted: unknown[] = [];
  const pending = call(registration, { emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  return { pending, emitted };
}

// ---------------------------------------------------------------------------
// 1. A no-op plan still opens the dialog when live can overwrite something.
// ---------------------------------------------------------------------------

test("a plan that would write nothing still opens the dialog when live can overwrite the clash and the nav", async () => {
  pushQueue = [pushResult({ rows: [CLASH_ROW, NAV_ROW], liveCanOverwrite: true })];
  const { surfaceExchanges, publishTool } = registrationsFor(toolDeps());

  const { pending, emitted } = await raiseDialog(publishTool);
  assert.equal(emitted.length, 1, "the dialog must be raised even though this plan writes nothing");
  const exchangeId = exchangeIdFromSurface(emitted[0]);

  surfaceExchanges.deliver({ exchangeId, toolId: PUBLISH_CONTENT_PUBLISH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  const result = (await pending) as { published: boolean };
  assert.equal(result.published, false);
});

// ---------------------------------------------------------------------------
// 2. No ticks — today's path, unchanged.
// ---------------------------------------------------------------------------

test("confirming with no ticks runs the pre-existing confirm/execute path, never re-pushing", async () => {
  pushQueue = [pushResult({ rows: [CLASH_ROW], liveCanOverwrite: true })];
  executeQueue = [{ changeSetIds: [], retiredChangeSetIds: [] }];
  const { surfaceExchanges, publishTool } = registrationsFor(toolDeps());

  const { pending, emitted } = await raiseDialog(publishTool);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({ exchangeId, toolId: PUBLISH_CONTENT_PUBLISH_TOOL_ID, principalId: PRINCIPAL_ID, params: { decision: "confirm" } });

  const result = (await pending) as { published: boolean };
  assert.equal(result.published, true);
  assert.equal(pushCalls.length, 1, "no re-push when nothing was ticked");
  assert.equal(executeCalls.length, 1);
  assert.equal(executeCalls[0]!.overwriteEntityKeys, undefined);
  assert.equal(confirmCalls, 1);
});

// ---------------------------------------------------------------------------
// 3. A tick re-pushes and re-executes with exactly that key.
// ---------------------------------------------------------------------------

test("ticking the clash re-pushes with that key and executes with the same key", async () => {
  pushQueue = [
    pushResult({ rows: [CLASH_ROW], liveCanOverwrite: true }),
    pushResult({ rows: [CLASH_ROW_FORCED], liveCanOverwrite: true, plan: { planId: "plan-2", planHash: "hash-2", details: { refused: false, rows: [CLASH_ROW_FORCED] } } }),
  ];
  executeQueue = [{ changeSetIds: ["cs-1"], retiredChangeSetIds: ["cs-retire-1"] }];
  const { surfaceExchanges, publishTool } = registrationsFor(toolDeps());

  const { pending, emitted } = await raiseDialog(publishTool);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: PUBLISH_CONTENT_PUBLISH_TOOL_ID,
    principalId: PRINCIPAL_ID,
    params: { decision: "confirm", overwrite: [KEY_ABOUT] },
  });

  const result = (await pending) as { published: boolean; message: string };
  assert.equal(result.published, true);
  assert.equal(pushCalls.length, 2, "the tick must re-push");
  assert.deepEqual(pushCalls[1]!.overwriteEntityKeys, [KEY_ABOUT]);
  assert.equal(executeCalls.length, 1);
  assert.deepEqual(executeCalls[0]!.overwriteEntityKeys, [KEY_ABOUT]);
  assert.match(result.message, /1 old version was moved to example\.com's Trash/);
});

// ---------------------------------------------------------------------------
// 4. An unoffered key is dropped, never forwarded.
// ---------------------------------------------------------------------------

test("an id the dialog never offered is dropped before it ever reaches the peer", async () => {
  pushQueue = [
    pushResult({ rows: [CLASH_ROW], liveCanOverwrite: true }),
    pushResult({ rows: [CLASH_ROW_FORCED], liveCanOverwrite: true, plan: { planId: "plan-2", planHash: "hash-2", details: { refused: false, rows: [CLASH_ROW_FORCED] } } }),
  ];
  executeQueue = [{ changeSetIds: ["cs-1"], retiredChangeSetIds: [] }];
  const { surfaceExchanges, publishTool } = registrationsFor(toolDeps());

  const { pending, emitted } = await raiseDialog(publishTool);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: PUBLISH_CONTENT_PUBLISH_TOOL_ID,
    principalId: PRINCIPAL_ID,
    // A model-shaped injection attempt: a key this dialog never rendered a box for, riding along
    // with a real one. Only the real one may reach the peer (publish-overwrite-live-plan §7).
    params: { decision: "confirm", overwrite: ["page:not-offered-by-this-dialog", KEY_ABOUT] },
  });

  await pending;
  assert.deepEqual(pushCalls[1]!.overwriteEntityKeys, [KEY_ABOUT], "the unoffered key must never be forwarded");
  assert.deepEqual(executeCalls[0]!.overwriteEntityKeys, [KEY_ABOUT]);
});

// ---------------------------------------------------------------------------
// 5. Live moved between the shown plan and the re-plan.
// ---------------------------------------------------------------------------

test("a re-plan where the ticked row is not forced refuses the publish outright", async () => {
  pushQueue = [
    pushResult({ rows: [CLASH_ROW], liveCanOverwrite: true }),
    // The re-plan still shows it blocked — the live holder moved again, or something else changed.
    pushResult({ rows: [CLASH_ROW], liveCanOverwrite: true, plan: { planId: "plan-2", planHash: "hash-2", details: { refused: false, rows: [CLASH_ROW] } } }),
  ];
  const { surfaceExchanges, publishTool } = registrationsFor(toolDeps());

  const { pending, emitted } = await raiseDialog(publishTool);
  const exchangeId = exchangeIdFromSurface(emitted[0]);
  surfaceExchanges.deliver({
    exchangeId,
    toolId: PUBLISH_CONTENT_PUBLISH_TOOL_ID,
    principalId: PRINCIPAL_ID,
    params: { decision: "confirm", overwrite: [KEY_ABOUT] },
  });

  const result = (await pending) as { published: boolean; message: string; nextStep: string | null };
  assert.equal(result.published, false);
  assert.equal(result.message, "Something on example.com changed while you were deciding, so nothing was published.");
  assert.equal(result.nextStep, "Ask again.");
  assert.equal(confirmCalls, 0, "must never confirm a plan the operator did not actually see");
  assert.equal(executeCalls.length, 0, "must never execute a plan the operator did not actually see");
});

// ---------------------------------------------------------------------------
// 6. An older live: no choices, today's early return, no exchange opened.
// ---------------------------------------------------------------------------

test("an older live that cannot overwrite offers no choices and takes today's early return, without opening an exchange", async () => {
  pushQueue = [pushResult({ rows: [CLASH_ROW, NAV_ROW], liveCanOverwrite: false })];
  const { surfaceExchanges, publishTool } = registrationsFor(toolDeps());

  const emitted: unknown[] = [];
  const result = (await call(publishTool, { emitSurface: async (s) => void emitted.push(s) })) as { published: boolean };

  assert.equal(result.published, false);
  assert.equal(emitted.length, 0, "no dialog may be raised for a live that cannot overwrite anything this plan needs it to");
  assert.equal(surfaceExchanges.size(), 0);
  assert.equal(pushCalls.length, 1, "no re-push ever happens when nothing was offered");
});
