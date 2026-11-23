import assert from "node:assert/strict";
import test from "node:test";
import { RecordVersionConflictError } from "@jini-ai/core/optimistic-concurrency";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { listExternalMcpServerViews, saveExternalMcpServer } from "../external-mcp-store.js";
import { applyExternalMcpAccess, externalMcpAccessSnapshot } from "@jini-ai/mcp/federation/hosted";
import type { SaveExternalMcpServerInput } from "../contracts.js";

/**
 * @file Lost updates on the external-MCP form save (design S1): the edit write compares the version
 * the person loaded, so a save from an old screen is refused instead of restoring what changed since.
 */

const WORKSPACE = "workspace-1";
const SERVER = "linear";
const NOW = "2026-11-17T12:00:00.000Z";

function harness() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const deps = { repo, sealer: new AesGcmSecretSealer(keyring), keyring, clock: { nowMs: () => Date.parse(NOW) } };
  const form = (overrides: Partial<SaveExternalMcpServerInput> = {}): SaveExternalMcpServerInput => ({ workspaceId: WORKSPACE, serverId: SERVER, label: "Linear", transport: "streamable_http",
    authMode: "none", enabled: true, command: "", url: "https://mcp.example/mcp", args: "", allowedToolNames: "read", writeAllowedToolNames: "", principalId: "owner", ...overrides });
  const row = async () => (await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER }))!;
  return { repo, deps, form, row, save: (input: SaveExternalMcpServerInput) => saveExternalMcpServer(deps, input) };
}

test("a created server starts at version 1 and every edit advances it; the view carries the version", async () => {
  const h = harness();
  assert.equal((await h.save(h.form())).version, 1);
  assert.equal((await h.save(h.form({ label: "Renamed" }))).version, 2);
  assert.deepEqual((await listExternalMcpServerViews({ deps: h.deps, workspaceId: WORKSPACE })).map(view => view.version), [2]);
});

test("T-stale: a form saved from an old screen is refused with both versions and the first save stays", async () => {
  const h = harness();
  await h.save(h.form());
  await h.save(h.form({ label: "Writer 1", expectedVersion: 1 }));
  await assert.rejects(h.save(h.form({ label: "Writer 2", expectedVersion: 1 })), (error: unknown) => {
    assert.ok(error instanceof RecordVersionConflictError);
    assert.equal(error.expectedVersion, 1);
    assert.equal(error.currentVersion, 2);
    return true;
  });
  assert.equal((await h.row()).label, "Writer 1");
});

test("access-revoked-then-stale-save: the revoke advances the version, so the old form is refused and the grants stay revoked", async () => {
  const h = harness();
  await h.save(h.form());
  const loaded = await h.row();
  await applyExternalMcpAccess({ repo: h.repo, clock: h.deps.clock, workspaceId: WORKSPACE, serverId: SERVER, expected: externalMcpAccessSnapshot({ record: loaded }),
    access: { enabled: false, allowedToolNames: [], writeAllowedToolNames: [] }, principalId: "admin" });
  await assert.rejects(h.save(h.form({ expectedVersion: loaded.version })), RecordVersionConflictError);
  const now = await h.row();
  assert.equal(now.enabled, false);
  assert.equal(now.allowedToolNames, "[]");
});

test("T-cas: a competing save that lands after this save's own read still stops it (the compare is in the write)", async () => {
  const h = harness();
  await h.save(h.form());
  const loaded = await h.row();
  const realFind = h.repo.findByServerId.bind(h.repo);
  let raced = false;
  h.repo.findByServerId = async (input) => {
    const found = await realFind(input);
    if (!raced) { raced = true; await saveExternalMcpServer(h.deps, h.form({ label: "Competitor", expectedVersion: 1 })); }
    return found;
  };
  await assert.rejects(h.save(h.form({ label: "Me", expectedVersion: loaded.version })), RecordVersionConflictError);
  assert.equal((await h.row()).label, "Competitor");
});

test("a save that names a version for a server that no longer exists is a conflict with currentVersion null", async () => {
  const h = harness();
  await assert.rejects(h.save(h.form({ expectedVersion: 1 })), (error: unknown) => error instanceof RecordVersionConflictError && error.currentVersion === null);
});

test("a save with no basis still works (until every caller sends one) and advances the version", async () => {
  const h = harness();
  await h.save(h.form());
  await h.save(h.form({ label: "No basis" }));
  const now = await h.row();
  assert.equal(now.label, "No basis");
  assert.equal(now.version, 2);
});
