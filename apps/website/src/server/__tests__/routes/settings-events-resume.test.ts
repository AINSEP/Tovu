import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { Express, Request, Response } from "express";
import type { SettingRevisionRecord } from "#src/features/settings/index";
import { registerAdminSettingsEventsRoute } from "../../inbound/admin-http/routes/settings/events.js";
import type { SettingsRouteDeps } from "../../inbound/admin-http/routes/settings/deps.js";

/** sseshare: query resume uses the existing authorized ledger feed, no sockets, DB or timers. */
async function feed({ query = {}, header, allowed = true, previewAllowed = false, workspaceId = "ws" }: {
  query?: Record<string, unknown>; header?: string; allowed?: boolean; previewAllowed?: boolean; workspaceId?: string;
}) {
  let handler!: (req: Request, res: Response) => Promise<void>;
  const ticks = new Map<number, () => void>();
  const reads: number[] = [];
  const writes: string[] = [];
  let status = 200;
  const app = { get: (_path: string, work: typeof handler) => { handler = work; } } as unknown as Express;
  const revision = { seq: 7, settingId: "setting", entityKind: "value", scope: "workspace", workspaceId: "ws", principalId: null } as SettingRevisionRecord;
  const settingsRepo = {
    maxRevisionSeq: async () => 8,
    listRevisionsSince: async ({ sinceSeq }: { sinceSeq: number }) => {
      reads.push(sinceSeq); return sinceSeq < 7 ? [revision] : [];
    },
    findDefinitionBySettingId: async (_input: { settingId: string }): Promise<{ namespace: string } | null> => ({ namespace: "site.hidden-write" }),
  };
  registerAdminSettingsEventsRoute(app, {
    workspaceId: "ws", settingsReady: Promise.resolve(), settingsRepo,
    authorize: async ({ permission }: { permission: string }) => {
      const granted = permission === "theme.set" ? previewAllowed : allowed;
      return { allowed: granted, reason: granted ? "granted" : "revoked" };
    },
    feedTimers: {
      scheduleInterval: ((work: () => void, ms: number) => { ticks.set(ms, work); return ms; }) as unknown as typeof setInterval,
      clearScheduledInterval: ((ms: number) => { ticks.delete(ms); }) as unknown as typeof clearInterval,
    },
  } as unknown as SettingsRouteDeps);
  const req = Object.assign(new EventEmitter(), {
    params: { workspaceId }, query, httpVersionMajor: 1,
    headers: header === undefined ? {} : { "last-event-id": header },
  }) as unknown as Request;
  const res = Object.assign(new EventEmitter(), {
    locals: { principal: { id: "owner" } },
    writeHead: () => {}, write: (frame: string) => { writes.push(frame); }, end: () => {},
    status: (value: number) => { status = value; return res; }, json: () => {},
  }) as unknown as Response;
  await handler(req, res);
  return { reads, writes, status, settingsRepo, revision, async tick() {
    ticks.get(1_000)?.();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }, close() { req.emit("close"); } };
}

test("explicit settings resume replays hidden writes, preserves header precedence, bounds and authorization", async () => {
  const h = await feed({ query: { afterRevision: "6" } });
  await h.tick();
  assert.deepEqual(h.reads, [6]);
  assert.ok(h.writes.includes("id: 7\n"));
  assert.ok(h.writes.includes('data: {"namespaces":["site.hidden-write"]}\n\n'));
  h.close();
  const native = await feed({ query: { afterRevision: "6" }, header: "7" });
  await native.tick();
  assert.deepEqual(native.reads, [7]);
  assert.equal(native.writes.some((frame) => frame.includes("settings-changed")), false);
  native.close();
  for (const afterRevision of ["999", "-1", "NaN", ["6", "7"]]) {
    const h = await feed({ query: { afterRevision } });
    await h.tick();
    assert.deepEqual(h.reads, [8]);
    h.close();
  }
  const denied = await feed({ query: { afterRevision: "0" }, allowed: false });
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.reads, []);
  assert.deepEqual(denied.writes, []);
});

test("settings events refuse a different workspace before opening a stream", async () => {
  const h = await feed({ workspaceId: "other", query: { afterRevision: "6" } });
  assert.equal(h.status, 404);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.reads, []);
  h.close();
});

test("theme-only subscribers receive no settings namespaces even when revisions are available", async (t) => {
  const h = await feed({
    query: { themePreview: "1", afterRevision: "6" }, allowed: false, previewAllowed: true,
  });
  t.after(() => h.close());
  assert.equal(h.status, 200);
  await h.tick();
  assert.deepEqual(h.writes, [": connected\n\n"]);
  assert.deepEqual(h.reads, []);
});

test("overlapping settings polls emit each change only once", async (t) => {
  const h = await feed({ query: { afterRevision: "6" } });
  t.after(() => h.close());
  let release!: (head: number) => void;
  const head = new Promise<number>((resolve) => { release = resolve; });
  // Hold the first poll mid-read while the next interval fires with the same cursor.
  h.settingsRepo.maxRevisionSeq = () => head;
  await h.tick();
  await h.tick();
  release(8);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(h.writes, [
    ": connected\n\n",
    "id: 7\n",
    "event: settings-changed\n",
    'data: {"namespaces":["site.hidden-write"]}\n\n',
  ]);
});

test("cached namespaces and missing definitions keep notifications flowing during a definition lookup outage", async (t) => {
  const h = await feed({ query: { afterRevision: "6" } });
  t.after(() => h.close());
  h.settingsRepo.listRevisionsSince = async () => [
    { ...h.revision, settingId: "deleted" }, { ...h.revision, seq: 8 },
  ];
  h.settingsRepo.findDefinitionBySettingId = async ({ settingId }) =>
    settingId === "deleted" ? null : { namespace: "site.hidden-write" };
  await h.tick();
  assert.deepEqual(h.writes, [
    ": connected\n\n",
    "id: 8\n",
    "event: settings-changed\n",
    'data: {"namespaces":["site.hidden-write"]}\n\n',
  ]);

  // Both the resolved namespace and the absent definition belong to this connection's cache.
  // A later repository outage must not suppress changes for settings it already resolved.
  h.settingsRepo.findDefinitionBySettingId = async () => { throw new Error("definition lookup unavailable"); };
  h.settingsRepo.maxRevisionSeq = async () => 10;
  h.settingsRepo.listRevisionsSince = async () => [
    { ...h.revision, seq: 9, settingId: "deleted" }, { ...h.revision, seq: 10 },
  ];
  await h.tick();
  assert.deepEqual(h.writes.slice(4), [
    "id: 10\n",
    "event: settings-changed\n",
    'data: {"namespaces":["site.hidden-write"]}\n\n',
  ]);
});
