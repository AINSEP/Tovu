import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createFakeSiteUpdate } from "@jini-ai/devops/deploy";
import { buildSiteUpdateRegistrations, type SiteUpdateToolDeps } from "../tools.js";

/** @file `site_update_check`: read-only, plain words, feed injected, nothing is ever applied. */

function deps(over: Partial<SiteUpdateToolDeps> & { running?: string; latest?: { version: string; notes: string } } = {}) {
  const fake = createFakeSiteUpdate({ runningVersion: over.running ?? "1.2.0", latest: over.latest ?? { version: "1.3.0", notes: "Faster pages." } });
  const authorized: string[] = [];
  const toolDeps: SiteUpdateToolDeps = {
    authorize: async ({ permission }) => void authorized.push(permission),
    readOwnerId: async () => "owner-1",
    runtime: { feed: fake.feed, site: fake.ports.site, backup: fake.ports.backup, readiness: fake.ports.readiness, ids: fake.ports.ids, runningVersion: async () => over.running ?? "1.2.0" },
    ...over,
  };
  return { fake, toolDeps, authorized };
}

function find(registrations: ToolRegistration[], id: string): ToolRegistration {
  const found = registrations.find((r) => r.descriptor.id === id);
  assert.ok(found, `expected ${id}`);
  return found;
}

const call = (tool: ToolRegistration, input: unknown = {}) =>
  tool.handler({ executionId: "e", principal: { id: "owner-1" }, run: { id: "r" }, input, signal: new AbortController().signal } as ToolExecutionContext, {});

const surfaces = {} as never;

test("a newer release is reported in plain words with its notes", async () => {
  const { toolDeps, authorized } = deps();
  const result = (await call(find(buildSiteUpdateRegistrations(toolDeps, surfaces), "site_update_check"))) as { available: boolean; message: string };
  assert.equal(result.available, true);
  assert.equal(result.message, "Version 1.3.0 is available: Faster pages.");
  assert.deepEqual(authorized, ["system.read"]);
});

test("the same version says you are on the latest", async () => {
  const { toolDeps } = deps({ running: "1.3.0" });
  const result = (await call(find(buildSiteUpdateRegistrations(toolDeps, surfaces), "site_update_check"))) as { available: boolean; message: string };
  assert.equal(result.available, false);
  assert.equal(result.message, "You are on the latest version (1.3.0).");
});

test("checking is read-only: no backup, apply, or rollback call is made", async () => {
  const { toolDeps, fake } = deps();
  await call(find(buildSiteUpdateRegistrations(toolDeps, surfaces), "site_update_check"));
  assert.deepEqual(fake.calls, []);
  assert.equal(find(buildSiteUpdateRegistrations(toolDeps, surfaces), "site_update_check").descriptor.readOnly, true);
});

test("a denied permission stops before the feed is asked", async () => {
  const { toolDeps } = deps();
  let asked = 0;
  toolDeps.runtime = { ...toolDeps.runtime!, feed: { latestRelease: async () => { asked += 1; return null; } } };
  toolDeps.authorize = async () => { throw new Error("no permission"); };
  await assert.rejects(call(find(buildSiteUpdateRegistrations(toolDeps, surfaces), "site_update_check")), /no permission/);
  assert.equal(asked, 0);
});

test("a feed that cannot be reached is explained in plain words, not thrown", async () => {
  const { toolDeps } = deps();
  toolDeps.runtime = { ...toolDeps.runtime!, feed: { latestRelease: async () => { throw new Error("offline"); } } };
  const result = (await call(find(buildSiteUpdateRegistrations(toolDeps, surfaces), "site_update_check"))) as { checked: boolean; message: string };
  assert.equal(result.checked, false);
  assert.match(result.message, /^Could not check for updates: offline/);
});

test("this tool takes no input", async () => {
  const { toolDeps } = deps();
  await assert.rejects(call(find(buildSiteUpdateRegistrations(toolDeps, surfaces), "site_update_check"), { force: true }), /no arguments/);
});
