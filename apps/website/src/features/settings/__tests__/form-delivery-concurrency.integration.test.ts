import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { AdminSurfaceActionError, type AdminSurfaceDeliveryBindingDraft } from "@jini-ai/agent-plugins/admin-surfaces";
import type { FormDeliveryBinding } from "@jini-ai/cms/forms";
import { deriveApiConnectionKey } from "@jini-ai/integrations/api-connections";

import { createSurfaceDeliveryBindings, type FormDeliveryBindingsStore } from "#src/features/agent-plugins/admin-surfaces/delivery-bindings";
import { ensureFormDeliverySettings, FormDeliveryBindingsConflictError, readFormDeliveryBindings, writeFormDeliveryBindings } from "../index.js";
import { SqliteSettingsRepo } from "../repo.sqlite.js";
import { workspaces } from "#src/platform/db/schema.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

/**
 * @file forms-multidest-owned / G15 T3: two panels share one bindings setting. Real settings
 * validation, authorization, revision append and SQLite transactions protect stale merges;
 * a read barrier forces the losing panel to retain its old snapshot until the other commits.
 */
const WORKSPACE = "ws-bindings";
const PLUGIN = "acme-office";
const ADAPTER = "acme-office-rows";
const REF = deriveApiConnectionKey({ workspaceId: WORKSPACE, pluginId: PLUGIN, connectionId: "account" });
const binding = (bindingId: string): FormDeliveryBinding => ({ bindingId, adapterId: ADAPTER, connectionRef: REF, enabled: true, config: {} });
const draft = (bindingId?: string): AdminSurfaceDeliveryBindingDraft => ({
  ...(bindingId === undefined ? {} : { bindingId }), adapterId: ADAPTER, connectionId: "account", enabled: false, allForms: true, config: {},
});

/** A test-controlled barrier, with no timer or scheduler assumption. */
function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

/** Real owner and storage; only contribution discovery and form listing are fixed test inputs. */
async function fixture(required: { t: TestContext; initial?: readonly FormDeliveryBinding[] }, _optional: Record<string, never> = {}) {
  const db = openContentDb(":memory:");
  required.t.after(() => db.$client.close());
  const repo = new SqliteSettingsRepo(db);
  const clock = { nowIso: () => "2026-10-20T10:00:00.000Z", nowMs: () => Date.parse("2026-10-20T10:00:00.000Z") };
  let nextId = 0;
  const ids = { newId: () => `id-${++nextId}` };
  const principals = { findActiveById: async () => null };
  const settings = { repo, clock, ids, principals, authorize: async () => ({ allowed: true, reason: "test admin" }) };
  db.insert(workspaces).values({ id: WORKSPACE, name: WORKSPACE, slug: WORKSPACE, createdAt: clock.nowIso() }).run();
  await ensureFormDeliverySettings({ deps: { settingsRepo: repo, clock, ids, principals }, systemPrincipalId: "system" });
  const write = (input: { value: readonly FormDeliveryBinding[] }, optional: { expectedValue?: readonly FormDeliveryBinding[] } = {}) =>
    writeFormDeliveryBindings({ deps: settings, workspaceId: WORKSPACE, callerPrincipalId: "admin", value: input.value }, optional);
  await write({ value: required.initial ?? [] });
  const read = () => readFormDeliveryBindings({ settingsRepo: repo, workspaceId: WORKSPACE });
  let pendingRead: { captured: ReturnType<typeof barrier>; resume: ReturnType<typeof barrier> } | undefined;
  const bindings: FormDeliveryBindingsStore = {
    isConflict: ({ error }) => error instanceof FormDeliveryBindingsConflictError,
    async read() {
      const snapshot = await read();
      const paused = pendingRead;
      if (paused) {
        pendingRead = undefined;
        paused.captured.release();
        await paused.resume.promise;
      }
      return snapshot;
    },
    async write({ value, expectedValue }) { await write({ value }, { expectedValue }); },
  };
  const panel = () => createSurfaceDeliveryBindings({
    workspaceId: WORKSPACE, siteWorkspaceId: WORKSPACE, pluginId: PLUGIN, principalId: "admin",
    declaredConnectionIds: async () => ["account"], contributedAdapterIds: async () => [ADAPTER],
    forms: { list: async () => [] }, bindings, newBindingId: () => ids.newId(),
  });
  return { repo, read, write, panel, pauseNextRead() {
    const paused = { captured: barrier(), resume: barrier() };
    pendingRead = paused;
    required.t.after(() => paused.resume.release());
    return paused;
  } };
}

test("G15 T3: B removes while A holds a stale save snapshot; A's save keeps B's removal", async (t) => {
  const site = await fixture({ t, initial: [binding("a"), binding("b")] });
  const paused = site.pauseNextRead();
  const saving = site.panel().save(draft("a"));
  await paused.captured.promise;
  await site.panel().remove({ bindingId: "b" });
  paused.resume.release();
  await saving;
  assert.deepEqual(await site.read(), [{ ...binding("a"), enabled: false }]);
});

test("G15 T3: concurrent adds merge both bindings after the stale writer retries", async (t) => {
  const site = await fixture({ t });
  const paused = site.pauseNextRead();
  const savingA = site.panel().save(draft());
  await paused.captured.promise;
  const savedB = await site.panel().save(draft());
  paused.resume.release();
  const savedA = await savingA;
  assert.notEqual(savedA.bindingId, savedB.bindingId);
  assert.deepEqual(await site.read(), [savedB, savedA].map(({ bindingId }) => ({ ...binding(bindingId), enabled: false })));
});

test("G15 T3: retrying an edit of the binding B removed refuses instead of resurrecting it", async (t) => {
  const site = await fixture({ t, initial: [binding("a")] });
  const paused = site.pauseNextRead();
  const saving = site.panel().save(draft("a"));
  const refused = assert.rejects(saving, (error: unknown) => error instanceof AdminSurfaceActionError && error.code === "binding-not-found");
  await paused.captured.promise;
  await site.panel().remove({ bindingId: "a" });
  paused.resume.release();
  await refused;
  assert.deepEqual(await site.read(), []);
});

test("G15 T3: a stale removal keeps the binding another panel added", async (t) => {
  const site = await fixture({ t, initial: [binding("a")] });
  const paused = site.pauseNextRead();
  const removing = site.panel().remove({ bindingId: "a" });
  await paused.captured.promise;
  const saved = await site.panel().save(draft());
  paused.resume.release();
  await removing;
  assert.deepEqual(await site.read(), [{ ...binding(saved.bindingId), enabled: false }]);
});

test("G15 T3: a stale owner write rolls back its revision and leaves the committed value intact", async (t) => {
  const site = await fixture({ t });
  const stale = await site.read();
  await site.write({ value: [binding("b")] });
  const revisionSeq = await site.repo.maxRevisionSeq();
  await assert.rejects(site.write({ value: [binding("a")] }, { expectedValue: stale }), FormDeliveryBindingsConflictError);
  assert.deepEqual(await site.read(), [binding("b")]);
  assert.equal(await site.repo.maxRevisionSeq(), revisionSeq);
});
