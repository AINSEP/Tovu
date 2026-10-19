/** Approved round17 B. Baseline RED: import/list tools and their source-union schema absent. */
import assert from "node:assert/strict";
import test from "node:test";
import { parseSiteImportInput, type SiteImportBackend } from "../import-backend.js";
import { buildSiteBackupRegistrations, type SiteBackupToolDeps } from "../tool-registrations.js";

test("B source boundary rejects paths, both/neither sources, credentials and password fields", () => {
  for (const input of [{}, { path: "/tmp/source.zip" }, { url: "https://example.com/site.zip", uploadId: "a" }, { url: "file:///etc/passwd" }, { url: "http://example.com" }, { url: "https://user:pass@example.com" }, { url: "https://example.com", adminPassword: "secret" }]) assert.throws(() => parseSiteImportInput({ input }));
  assert.deepEqual(parseSiteImportInput({ input: { url: "https://example.com/site.tovu.zip", requestId: "retry" } }), { source: { url: "https://example.com/site.tovu.zip" }, requestId: "retry" });
});

test("B import/list authorization happens before any backend effect and binds the principal", async () => {
  let allowed = false;
  const calls: unknown[] = [];
  const backend = {
    importBackup: async (input: unknown) => { calls.push(input); return { state: "needs-owner" }; },
    list: async (input: unknown) => { calls.push(input); return []; },
  } as unknown as SiteImportBackend;
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed, reason: "test" }), siteImportBackend: backend } as unknown as SiteBackupToolDeps;
  const registrations = buildSiteBackupRegistrations(deps, {} as never);
  const run = async (id: string, input: unknown) => {
    const tool = registrations.find(row => row.descriptor.id === id)!;
    assert.ok(tool, "tool is registered");
    return tool.handler({ input, principal: { id: "recipient" }, run: { id: "run" }, executionId: "execution", signal: new AbortController().signal } as never);
  };
  await assert.rejects(run("site_import_backup", { url: "https://example.com/site.tovu.zip" }));
  await assert.rejects(run("site_import_list", {}));
  assert.deepEqual(calls, []);
  allowed = true;
  await run("site_import_backup", { url: "https://example.com/site.tovu.zip" });
  await run("site_import_list", {});
  assert.deepEqual(calls, [{ principalId: "recipient", source: { url: "https://example.com/site.tovu.zip" } }, { principalId: "recipient" }]);
});
