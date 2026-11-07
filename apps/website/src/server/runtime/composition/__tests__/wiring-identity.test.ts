// Deps-first import order, the same order every `tovu` CLI command loads the composition graph in
// (see `sqlite-create-site-app-module-identity.integration.test.ts`'s header for why it matters).
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";
import { createApp } from "#src/server/runtime/composition/app";

import { createContributionRegistry, type DerivedToolContributor, type ToolContributor } from "@jini-ai/core";
import { SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { bootSiteDir, initSite } from "#src/server/runtime/composition/site-dir";
import { removeFrozenPackageTree } from "#src/features/agent-plugins/lifecycle";
import { MCP_UI_TOOL_CALLS_PATH, createByokToolSurface } from "#src/assistant/index";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { installFirstPartyToolContributors } from "#src/server/runtime/composition/tool-catalog-manifest";
import type { NewsletterRouteDeps } from "#src/server/inbound/admin-http/routes/newsletter/deps";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import * as vaultBySubpath from "#src/features/external-mcp/external-mcp-vault";
import * as vaultByRelativePath from "../../../../features/external-mcp/external-mcp-vault.js";

/**
 * @file Wiring identity: the shared-instance pairs a host must keep ONE of, asserted with `===` on
 * the real SQLite composition (`createSiteRouteDeps` + `createApp`, the roots `tovu serve <dir>`
 * builds), built once for the whole file. It must stay green, unedited, while generic code moves
 * out of this repository: a move that wires a second instance of any pair turns it red.
 *
 * `===` proves wiring, not effect, so each pair also names the behavior test that proves the effect
 * (here when cheap, otherwise the existing test file is named next to the assertion).
 *
 * Pairs whose code does not exist in this repository yet (one kernel per `<domain>/sql` binding,
 * the repo-keyed hook cache, the theme engine, the Post and Newsletter services) are not faked here;
 * the batch that introduces each adds its row.
 */

type SiteDeps = Awaited<ReturnType<typeof createSiteRouteDeps>>;
type ComposedStore = { content: unknown; close(): Promise<void> };

let deps: SiteDeps;
let composed: ComposedStore | undefined;
let closeAll: () => Promise<void> = async () => {};

/** Every boot-readiness promise `cli/commands/serve.ts` settles before it considers the site up. */
async function drainBootReadiness(siteDeps: NewsletterRouteDeps): Promise<void> {
  await Promise.all([
    siteDeps.identityReady, siteDeps.settingsReady, siteDeps.seoReady, siteDeps.commentsReady,
    siteDeps.commentsSettingsReady, siteDeps.executionSettingsReady, siteDeps.settingsUiTabsReady,
    siteDeps.analyticsSettingsReady, siteDeps.siteTitleReady,
  ]).catch(() => undefined);
}

before(async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "wiring-identity-"));
  const dir = path.join(parent, "site");
  await initSite({ dir, name: "Wiring Identity Site" });
  const boot = await bootSiteDir({ dir });
  deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
    db: boot.db,
    workspaceId: boot.workspaceId,
    onStoreOpened: (store) => { composed = store as unknown as ComposedStore; },
    uploadsDir: path.join(dir, "uploads"),
    themesDir: path.join(dir, "themes"),
    siteBinding: { dir, name: "Wiring Identity Site", dirOverridden: true, switcherCompatible: false },
  });
  await drainBootReadiness(deps);
  closeAll = async () => {
    try { await closeSiteDirBoot(boot, composed); }
    finally { await removeFrozenPackageTree({ root: parent }); }
  };
});

after(() => closeAll());

/** The kernel a SQL repo was built over. Repos keep it as a protected field (`kernel`, or
 *  `required.kernel` for the `(required, optional)` classes); reading it is a test-only probe. */
function kernelOf(repo: unknown): unknown {
  const probe = repo as { kernel?: unknown; required?: { kernel?: unknown } };
  return probe.kernel ?? probe.required?.kernel;
}

/** The first-party tool contributions `createAssistantByokModule` installs before it builds its
 *  default surface (the same helper `assistant-byok-routes.test.ts` uses). */
function firstPartyContributions() {
  const contributions = {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
  installFirstPartyToolContributors({ contributions });
  return contributions;
}

// Row 1: one SurfaceExchangeStore for the tools that open cards and the route that answers them.
// The surface is built with the production factory and handed to `createApp` through its own
// `assistantToolSurface` seam (the default path builds the same surface inside the BYOK module,
// where no test can read it); `app.ts` must then hand that surface's store to the answer route.
test("row 1: the MCP-UI answer route delivers into the SAME exchange store the BYOK tools open cards on, and the answer wakes the waiting call", async (t) => {
  const toolSurface = createByokToolSurface(deps, { contributions: firstPartyContributions() });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps, { assistantToolSurface: toolSurface }), t);
  const ownerId = await deps.ownerPrincipalId;
  const store = toolSurface.surfaceExchanges;
  const exchange = store.open({ binding: { toolId: "assistant_ask_choice", principalId: ownerId }, emit: async () => {} });
  t.after(() => exchange.close({}));
  const receivers: unknown[] = [];
  const deliver = store.deliver;
  t.mock.method(store, "deliver", function (this: unknown, ...args: Parameters<typeof deliver>) {
    receivers.push(this);
    return deliver.apply(store, args);
  });
  const answered = exchange.receive({});

  const response = await fetch(`${baseUrl}${MCP_UI_TOOL_CALLS_PATH}`, {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ toolName: "assistant_ask_choice", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, choice: "blue" } }),
  });

  assert.equal(response.status, 202, `the route must find the card in the tools' store: ${await response.clone().text()}`);
  assert.equal(receivers.length, 1, "the route delivered exactly once");
  assert.ok(receivers[0] === store, "the route's store === toolSurface.surfaceExchanges");
  const message = await answered;
  assert.equal((message as { params?: { choice?: unknown } }).params?.choice, "blue", "the answer reaches the call waiting on the card");
});

// Row 2: one content kernel under every SQL repo, so a nested transaction joins the caller's.
// Behavior (a failing change-set rolls back rows and outbox) waits for the `<domain>/sql`
// bindings (S lane); this asserts the composition's own repos today.
test("row 2: every reachable SQL repo and the boot modules share ONE content kernel", () => {
  assert.ok(composed, "the composition reported its opened store");
  const kernel = composed.content;
  assert.ok(kernel, "the store has a content kernel");
  assert.ok(deps.contentKernel === kernel, "deps.contentKernel === store.content");
  const repos: Record<string, unknown> = {
    settingsRepo: deps.settingsRepo,
    entryRepo: deps.entryRepo,
    menuRepo: deps.menuRepo,
    formDeliveryStatus: deps.formDeliveryStatus,
  };
  for (const [name, repo] of Object.entries(repos)) {
    assert.ok(kernelOf(repo) !== undefined, `${name} exposes the kernel it was built over`);
    assert.ok(kernelOf(repo) === kernel, `${name}'s kernel === store.content`);
  }
});

// Row 5: one API connection host per site: the connect tool and the public callback route both read
// `deps.apiConnections`, the executable plugin tools read the host's own connections, and the
// admin-surface handlers are the ones the tool projection carries. A second `createApp` over the
// same deps must not build another host. Behavior (the callback completes a tool-started sign-in):
// `agent-plugin-connections.vertical-slice.test.ts`, first two tests.
test("row 5: one API connection host per site, shared by the tool projection, the admin surfaces and every app over the composition", () => {
  const apiConnections = deps.apiConnections as { host: { toolConnections: unknown } } | undefined;
  const tools = deps.agentPluginTools as { connections: unknown; adminSurfaces?: { host: unknown } } | undefined;
  assert.ok(apiConnections?.host, "deps.apiConnections.host is composed");
  assert.ok(tools, "deps.agentPluginTools is composed");
  assert.ok(tools.connections === apiConnections.host.toolConnections, "plugin tools' connections === the host's toolConnections");
  assert.ok(tools.adminSurfaces?.host === deps.adminSurfaceHost, "tool projection's admin-surface host === deps.adminSurfaceHost");
  const host = apiConnections.host;
  createApp(deps);
  createApp(deps);
  assert.ok((deps.apiConnections as { host: unknown }).host === host, "building apps over the composition keeps the one host");
});

// Row 6: one issued-token memory and one frozen-account map. The tool side is reachable here; the
// admin-surface side is held inside `createAgentPluginAdminSurfaceHandlers`' closure and has no
// public read (no production change to expose it). Its effect is pinned by
// `agent-plugin-connections.vertical-slice.test.ts` ("one token memory across seams" x2 and "ONE
// frozen-account map"), which runs `composeAgentPluginConnections`, the function `deps.ts` calls.
test("row 6: the tool projection carries one issued-token memory and one frozen-account map for the site", () => {
  const tools = deps.agentPluginTools as { issuedTokens?: unknown; frozen?: unknown } | undefined;
  assert.ok(tools?.issuedTokens, "issuedTokens is composed");
  assert.ok(tools.frozen, "frozen is composed");
  createApp(deps);
  const again = deps.agentPluginTools as { issuedTokens?: unknown; frozen?: unknown };
  assert.ok(again.issuedTokens === tools.issuedTokens, "issuedTokens is per site, not per app");
  assert.ok(again.frozen === tools.frozen, "frozen is per site, not per app");
});

// Row 4: one `external-mcp-vault` module. Its envelope context rides on a module-private symbol, so
// a second copy of the module (a dual package, a shim that re-implements instead of re-exporting)
// fails closed: nothing opens. Both specifier forms the codebase uses must reach one instance, and an
// envelope one makes must be readable by the other. The packed-run and P8g halves wait for H0.
test("row 4: both import forms reach ONE external-mcp-vault module, so an envelope made through one is read through the other", () => {
  assert.ok(vaultBySubpath === vaultByRelativePath, "one module namespace");
  assert.ok(vaultBySubpath.externalMcpVaultEnvelope === vaultByRelativePath.externalMcpVaultEnvelope, "envelope factory ===");
  assert.ok(vaultBySubpath.externalMcpVaultRecord === vaultByRelativePath.externalMcpVaultRecord, "record reader ===");
  const record = {
    id: "vault-1", workspaceId: "ws-1", kind: "mcp-env" as const, ownerKey: "server-1", principalId: null, binding: null,
    provider: null, label: "env", isDefault: false, revision: 1, last4: null, tokenLength: null, meta: {},
    createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z",
    sealed: { keyId: "k1", ciphertext: "c", nonce: "n", alg: "aes-256-gcm" },
  };
  const sealed = vaultBySubpath.externalMcpVaultEnvelope({ record: record as never });
  assert.ok(sealed);
  const read = vaultByRelativePath.externalMcpVaultRecord({ sealed, identity: { workspaceId: "ws-1", serverId: "server-1" }, kind: "mcp-env" });
  assert.equal(read.id, "vault-1", "the other import form recognizes the envelope's context");
});

// Row 7: one activation queue per lifecycle owner. Writes from different owners are serialized by
// the activations file lock (Jini `agent-plugins/lifecycle/activation.ts`, `lockedActivationsWrite`),
// the in-process queue only orders one owner's writes. The gate: no new file builds an owner or a
// queue. Baseline (2026-11-07): the files below; a file may leave this list, none may join it.
const SRC_ROOT = path.resolve(import.meta.dirname, "../../../..");
const OWNER_BUILDERS = /\b(createAgentPluginLifecycle|createAgentPluginActivations|createActivationModule|createTovuAgentPluginLifecycle)\(/;
const BASELINE_OWNER_FILES = new Set([
  "features/agent-plugins/install-upload.ts",
  "features/agent-plugins/lifecycle.ts",
  "features/agent-plugins/set-enabled.ts",
  "features/site-backup/archive-extensions.ts",
  "features/site-backup/import-plugin-state.ts",
  "server/runtime/composition/app.ts",
  "server/runtime/composition/deps.ts",
  "server/runtime/composition/plugin-credential-cards.ts",
  "server/runtime/composition/site-guide.ts",
  "server/runtime/composition/site-mailer.ts",
  "server/runtime/composition/vault-boot.ts",
]);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" || entry.name === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|tsx|mts)$/.test(entry.name) && !/\.test\.|\.d\.ts$/.test(entry.name) ? [full] : [];
  });
}

test("row 7: no file outside the baseline builds an agent-plugin lifecycle owner or activation queue", () => {
  const builders = sourceFiles(SRC_ROOT)
    .filter((file) => OWNER_BUILDERS.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(SRC_ROOT, file).split(path.sep).join("/"));
  assert.ok(builders.length > 0, "the scan reached the source tree");
  assert.deepEqual(builders.filter((file) => !BASELINE_OWNER_FILES.has(file)), [], "a new owner or queue builder appeared");
});
