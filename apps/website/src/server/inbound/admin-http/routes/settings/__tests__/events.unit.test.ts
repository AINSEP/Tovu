import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import type { SettingDefinitionRecord, SettingRevisionRecord } from "@jini-ai/core/settings";
import { requestThemePreviewRefresh } from "#src/features/theme/index";
import { extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSettingsEventsRoute, type SettingsEventsDeps } from "../events.js";

/**
 * @file Boundary pins for the settings SSE change feed: every admission refusal (exact status and
 * body), the SSE headers, resume-cursor clamping, the poll's cursor/emit rules, theme preview
 * frames, periodic re-authorization and timer cleanup. Intervals run on `t.mock.timers`, so no
 * real timer outlives a test. `settings-events-resume.test.ts` and
 * `settings-events-id-disclosure.test.ts` cover the same route end to end.
 */

const WS = "ws";
const PATH = "/api/admin/v1/workspaces/:workspaceId/settings/events";
const CONNECTED = ": connected\n\n";

function revision(seq: number, overrides: Partial<SettingRevisionRecord> = {}): SettingRevisionRecord {
  return {
    seq, entityKind: "value", settingId: "s-theme", scope: "workspace", workspaceId: WS, principalId: null,
    op: "set", beforeJson: null, afterJson: true, defVersion: 1, actor: "owner", originPluginId: null,
    changeSetId: null, createdAt: "2026-10-20T00:00:00.000Z", ...overrides,
  };
}

function definition(settingId: string, namespace: string): SettingDefinitionRecord {
  return {
    settingId, version: 1, workspaceId: WS, namespace, key: "k", ownerKind: "site", ownerId: null,
    schema: { type: "boolean" }, defaultValue: false, scopes: 2, secret: false, status: "active",
    aliasOfNamespace: null, aliasOfKey: null, coercionTag: null,
    createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
  };
}

/** The three ledger reads the feed makes, with switches for failure and in-flight holds. */
class FakeLedger implements Pick<SettingsEventsDeps["settingsRepo"], "maxRevisionSeq" | "listRevisionsSince" | "findDefinitionBySettingId"> {
  head = 10;
  rows: SettingRevisionRecord[] = [];
  readonly namespaces = new Map<string, string>([["s-theme", "site.theme"], ["s-mail", "site.mail"]]);
  readonly pageReads: number[] = [];
  readonly definitionReads: string[] = [];
  failPages = 0;
  hold: Promise<void> | null = null;
  async maxRevisionSeq(): Promise<number> { return this.head; }
  async listRevisionsSince(required: { sinceSeq: number; limit: number; workspaceId: string }): Promise<SettingRevisionRecord[]> {
    this.pageReads.push(required.sinceSeq);
    if (this.hold) await this.hold;
    if (this.failPages > 0) { this.failPages--; throw new Error("ledger page unavailable"); }
    return this.rows.filter((row) => row.seq > required.sinceSeq && (row.workspaceId === null || row.workspaceId === required.workspaceId))
      .slice(0, required.limit);
  }
  async findDefinitionBySettingId(required: { settingId: string }): Promise<SettingDefinitionRecord | null> {
    this.definitionReads.push(required.settingId);
    const namespace = this.namespaces.get(required.settingId);
    return namespace ? definition(required.settingId, namespace) : null;
  }
}

class FakeRequest extends EventEmitter {
  constructor(
    readonly params: Record<string, string>,
    readonly query: Record<string, unknown>,
    readonly headers: Record<string, string>,
    readonly httpVersionMajor: number,
  ) { super(); }
}

class FakeResponse extends EventEmitter {
  readonly locals: Record<string, unknown> = {};
  readonly frames: string[] = [];
  statusCode = 0;
  jsonBody: unknown;
  head: { status: number; headers: Record<string, string> } | null = null;
  ended = false;
  status(code: number): this { this.statusCode = code; return this; }
  json(body: unknown): this { this.jsonBody = body; return this; }
  writeHead(status: number, headers: Record<string, string>): this { this.head = { status, headers }; return this; }
  write(chunk: string): boolean { this.frames.push(chunk); return true; }
  end(): this { this.ended = true; return this; }
}

type OpenOptions = {
  params?: Record<string, string>; query?: Record<string, unknown>; headers?: Record<string, string>;
  httpVersionMajor?: number; principal?: { id: string } | null; grants?: string[];
  deps?: Partial<SettingsEventsDeps>; prepare?: (ledger: FakeLedger) => void;
};

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

async function open(t: test.TestContext, options: OpenOptions = {}) {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const ledger = new FakeLedger();
  options.prepare?.(ledger);
  const grants = new Set(options.grants ?? ["settings.read"]);
  const authorizeCalls: string[] = [];
  const control = { failAuthorize: false, authorizeHold: null as Promise<void> | null };
  const deps: SettingsEventsDeps = {
    workspaceId: WS, settingsReady: Promise.resolve(), settingsRepo: ledger,
    authorize: async ({ permission, principalId, workspaceId, entityType }) => {
      authorizeCalls.push(`${principalId}:${workspaceId}:${permission}:${entityType}`);
      if (control.authorizeHold) await control.authorizeHold;
      if (control.failAuthorize) throw new Error("authorizer unavailable");
      return { allowed: grants.has(permission), reason: grants.has(permission) ? "granted" : "missing_grant" };
    },
    ...options.deps,
  };
  const app = express();
  registerAdminSettingsEventsRoute(app, deps);
  const req = new FakeRequest(options.params ?? { workspaceId: WS }, options.query ?? {}, options.headers ?? {}, options.httpVersionMajor ?? 1);
  const res = new FakeResponse();
  if (options.principal !== null) res.locals.principal = options.principal ?? { id: "owner" };
  await extractRouteHandler(app, "get", PATH)(req, res);
  return {
    ledger, req, res, grants, control, authorizeCalls,
    async advance(ms: number) { t.mock.timers.tick(ms); await flush(); },
  };
}

// ---- admission ----

test("a request without a workspace segment is refused 404 before authentication", async (t) => {
  const h = await open(t, { params: {} });
  assert.equal(h.res.statusCode, 404);
  assert.deepEqual(h.res.jsonBody, { error: "workspace was not found" });
  assert.equal(h.res.head, null);
  assert.deepEqual(h.authorizeCalls, []);
});

test("another workspace is refused 404 without opening a stream", async (t) => {
  const h = await open(t, { params: { workspaceId: "other" } });
  assert.equal(h.res.statusCode, 404);
  assert.deepEqual(h.res.jsonBody, { error: "workspace was not found" });
  assert.deepEqual(h.res.frames, []);
});

test("a settings store that never became ready is refused 401", async (t) => {
  const settingsReady = Promise.reject(new Error("settings boot failed"));
  settingsReady.catch(() => {});
  const h = await open(t, { deps: { settingsReady } });
  assert.equal(h.res.statusCode, 401);
  assert.deepEqual(h.res.jsonBody, { error: "unauthenticated", code: "UNAUTHENTICATED" });
  assert.deepEqual(h.authorizeCalls, []);
});

test("a request with no authenticated principal is refused 401", async (t) => {
  const h = await open(t, { principal: null });
  assert.equal(h.res.statusCode, 401);
  assert.deepEqual(h.res.jsonBody, { error: "unauthenticated", code: "UNAUTHENTICATED" });
});

test("a principal without settings.read is refused 403 with the authorizer's reason", async (t) => {
  const h = await open(t, { grants: [] });
  assert.equal(h.res.statusCode, 403);
  assert.deepEqual(h.res.jsonBody, {
    error: "principal 'owner' is not authorized for 'settings.read' (missing_grant)",
    code: "FORBIDDEN", details: { permission: "settings.read", reason: "missing_grant" },
  });
  assert.deepEqual(h.authorizeCalls, ["owner:ws:settings.read:setting-value"]);
  assert.equal(h.res.head, null);
});

test("asking for theme preview without theme.set or settings.read is still refused 403", async (t) => {
  const h = await open(t, { grants: [], query: { themePreview: "1" } });
  assert.equal(h.res.statusCode, 403);
  assert.deepEqual(h.authorizeCalls, ["owner:ws:settings.read:setting-value", "owner:ws:theme.set:theme"]);
});

// ---- stream opening ----

test("an HTTP/1.1 stream opens 200 with keep-alive SSE headers and a connected comment", async (t) => {
  const h = await open(t);
  assert.deepEqual(h.res.head, { status: 200, headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive", "X-Accel-Buffering": "no",
  } });
  assert.deepEqual(h.res.frames, [CONNECTED]);
});

test("an HTTP/2 stream omits the Connection header", async (t) => {
  const h = await open(t, { httpVersionMajor: 2 });
  assert.deepEqual(h.res.head, { status: 200, headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
  } });
});

// ---- resume cursor ----

test("a fresh subscriber starts at the ledger head", async (t) => {
  const h = await open(t);
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [10]);
});

test("Last-Event-ID resumes from its position and beats afterRevision", async (t) => {
  const h = await open(t, { headers: { "last-event-id": "7" }, query: { afterRevision: "3" } });
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [7]);
});

test("afterRevision resumes when no Last-Event-ID is sent, including from zero", async (t) => {
  const h = await open(t, { query: { afterRevision: "0" } });
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [0]);
});

test("a resume point past the head is clamped to the head", async (t) => {
  const h = await open(t, { headers: { "last-event-id": "99" } });
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [10]);
});

test("negative, non-numeric and non-string resume points start at the head", async (t) => {
  for (const query of [{ afterRevision: "-1" }, { afterRevision: "soon" }, { afterRevision: ["3"] }]) {
    const h = await open(t, { query });
    await h.advance(1_000);
    assert.deepEqual(h.ledger.pageReads, [10]);
    h.req.emit("close");
    t.mock.timers.reset();
  }
});

// ---- polling ----

test("a visible change emits its workspace-scoped id, not the ledger head", async (t) => {
  const h = await open(t, { query: { afterRevision: "5" }, prepare: (ledger) => { ledger.rows = [revision(7)]; ledger.head = 12; } });
  await h.advance(1_000);
  assert.deepEqual(h.res.frames, [CONNECTED, "id: 7\n", "event: settings-changed\n", 'data: {"namespaces":["site.theme"]}\n\n']);
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [5, 12]);
});

test("a page with nothing visible emits nothing but still advances to the head", async (t) => {
  const h = await open(t, {
    query: { afterRevision: "5" },
    prepare: (ledger) => { ledger.rows = [revision(8, { scope: "user", principalId: "someone-else" })]; },
  });
  await h.advance(1_000);
  await h.advance(1_000);
  assert.deepEqual(h.res.frames, [CONNECTED]);
  assert.deepEqual(h.ledger.pageReads, [5, 10]);
});

test("a full page advances only to its last row, and the short page after it to the head", async (t) => {
  const h = await open(t, {
    query: { afterRevision: "0" },
    prepare: (ledger) => { ledger.head = 300; ledger.rows = Array.from({ length: 250 }, (_, i) => revision(i + 1)); },
  });
  await h.advance(1_000);
  await h.advance(1_000);
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [0, 200, 300]);
  assert.deepEqual(h.res.frames.filter((frame) => frame.startsWith("id:")), ["id: 200\n", "id: 250\n"]);
});

test("namespaces, including unresolvable ones, are looked up once per connection", async (t) => {
  const h = await open(t, {
    query: { afterRevision: "0" },
    prepare: (ledger) => { ledger.rows = [revision(1), revision(2, { settingId: "gone" }), revision(3, { settingId: "s-mail" })]; },
  });
  await h.advance(1_000);
  h.ledger.rows.push(revision(11), revision(12, { settingId: "gone" }));
  h.ledger.head = 12;
  await h.advance(1_000);
  assert.deepEqual(h.ledger.definitionReads, ["s-theme", "gone", "s-mail"]);
  assert.deepEqual(h.res.frames.filter((frame) => frame.startsWith("data:")), [
    'data: {"namespaces":["site.theme","site.mail"]}\n\n', 'data: {"namespaces":["site.theme"]}\n\n',
  ]);
});

test("a failed poll is logged, keeps the stream and re-reads the same window next tick", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const h = await open(t, { query: { afterRevision: "4" }, prepare: (ledger) => { ledger.failPages = 1; ledger.rows = [revision(6)]; } });
  await h.advance(1_000);
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(errors.mock.calls[0]!.arguments[0], "[settings] change feed poll failed");
  assert.equal((errors.mock.calls[0]!.arguments[1] as Error).message, "ledger page unavailable");
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [4, 4]);
  assert.ok(h.res.frames.includes("id: 6\n"));
  assert.equal(h.res.ended, false);
});

test("a poll still in flight makes the next interval skip instead of re-reading the window", async (t) => {
  let release!: () => void;
  const h = await open(t, { query: { afterRevision: "4" }, prepare: (ledger) => {
    ledger.rows = [revision(6)];
    ledger.hold = new Promise<void>((resolve) => { release = resolve; });
  } });
  await h.advance(1_000);
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [4]);
  h.ledger.hold = null;
  release();
  await flush();
  assert.deepEqual(h.res.frames, [CONNECTED, "id: 6\n", "event: settings-changed\n", 'data: {"namespaces":["site.theme"]}\n\n']);
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [4, 10]);
});

test("a stream closed while its poll is in flight writes nothing when the poll returns", async (t) => {
  let release!: () => void;
  const h = await open(t, { query: { afterRevision: "4" }, prepare: (ledger) => {
    ledger.rows = [revision(6)];
    ledger.hold = new Promise<void>((resolve) => { release = resolve; });
  } });
  await h.advance(1_000);
  h.req.emit("close");
  release();
  await flush();
  assert.deepEqual(h.res.frames, [CONNECTED]);
});

// ---- theme preview channel ----

function themesDir(t: test.TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "settings-events-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a theme-only subscriber gets preview frames and never reads the settings ledger", async (t) => {
  const dir = themesDir(t);
  requestThemePreviewRefresh({ themesDir: dir }, { revision: "r1" });
  const h = await open(t, { grants: ["theme.set"], query: { themePreview: "1" }, deps: { themesDir: dir } });
  await h.advance(1_000);
  assert.deepEqual(h.res.frames, [CONNECTED]);
  requestThemePreviewRefresh({ themesDir: dir }, { revision: "r2" });
  await h.advance(1_000);
  assert.deepEqual(h.res.frames, [CONNECTED, 'event: theme-preview-refresh\ndata: {"revision":"r2"}\n\n']);
  assert.deepEqual(h.ledger.pageReads, []);
});

test("themeRevision resumes the preview channel, replaying a newer marker", async (t) => {
  const dir = themesDir(t);
  requestThemePreviewRefresh({ themesDir: dir }, { revision: "r1" });
  const h = await open(t, { grants: ["theme.set"], query: { themePreview: "1", themeRevision: "r0" }, deps: { themesDir: dir } });
  await h.advance(1_000);
  assert.deepEqual(h.res.frames, [CONNECTED, 'event: theme-preview-refresh\ndata: {"revision":"r1"}\n\n']);
});

test("without a themes directory the preview channel stays silent", async (t) => {
  const h = await open(t, { grants: ["theme.set"], query: { themePreview: "1" } });
  await h.advance(1_000);
  assert.deepEqual(h.res.frames, [CONNECTED]);
});

test("theme preview is not requested unless themePreview is exactly 1", async (t) => {
  const h = await open(t, { grants: ["settings.read", "theme.set"], query: { themePreview: "true" } });
  assert.deepEqual(h.authorizeCalls, ["owner:ws:settings.read:setting-value"]);
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [10]);
});

// ---- keepalive, re-authorization, cleanup ----

test("an idle stream sends a keepalive comment every 25 seconds", async (t) => {
  const h = await open(t);
  await h.advance(25_000);
  assert.deepEqual(h.res.frames, [CONNECTED, ": keepalive\n\n"]);
});

test("re-authorization keeps a stream whose grant still holds", async (t) => {
  const h = await open(t);
  await h.advance(30_000);
  assert.equal(h.authorizeCalls.length, 2);
  assert.equal(h.res.ended, false);
});

test("re-authorization ends the stream and its timers once settings.read is revoked", async (t) => {
  const h = await open(t);
  h.grants.clear();
  await h.advance(30_000);
  assert.equal(h.res.ended, true);
  const reads = h.ledger.pageReads.length;
  const frames = h.res.frames.length;
  await h.advance(60_000);
  assert.equal(h.ledger.pageReads.length, reads);
  assert.equal(h.res.frames.length, frames);
  assert.equal(h.authorizeCalls.length, 2);
});

test("revoking settings.read but keeping theme.set keeps the stream and stops ledger reads", async (t) => {
  const h = await open(t, { grants: ["settings.read", "theme.set"], query: { themePreview: "1" } });
  h.grants.delete("settings.read");
  await h.advance(30_000);
  const reads = h.ledger.pageReads.length;
  await h.advance(5_000);
  assert.equal(h.res.ended, false);
  assert.equal(h.ledger.pageReads.length, reads);
});

test("an authorizer error during re-authorization is logged and closes the stream", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const h = await open(t);
  h.control.failAuthorize = true;
  await h.advance(30_000);
  assert.equal(h.res.ended, true);
  const reauthErrors = errors.mock.calls.filter((call) => call.arguments[0] === "[settings] change feed re-authorization failed");
  assert.equal(reauthErrors.length, 1);
  assert.equal((reauthErrors[0]!.arguments[1] as Error).message, "authorizer unavailable");
  h.ledger.rows = [revision(11)];
  h.ledger.head = 11;
  await h.advance(1_000);
  assert.equal(h.res.frames.includes("id: 11\n"), false);
});

test("a stream closed while re-authorization is in flight is not ended again", async (t) => {
  const h = await open(t);
  let release!: () => void;
  h.control.authorizeHold = new Promise<void>((resolve) => { release = resolve; });
  h.grants.clear();
  await h.advance(30_000);
  h.res.emit("close");
  release();
  await flush();
  assert.equal(h.res.ended, false);
});

test("closing both request and response stops every interval", async (t) => {
  const h = await open(t);
  h.req.emit("close");
  h.res.emit("close");
  await h.advance(60_000);
  assert.deepEqual(h.ledger.pageReads, []);
  assert.deepEqual(h.res.frames, [CONNECTED]);
  assert.equal(h.authorizeCalls.length, 1);
});

test("injected timers are used, and a callback firing after close does nothing", async (t) => {
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  const h = await open(t, { deps: { feedTimers: {
    scheduleInterval: (work, ms) => { callbacks.set(ms, work); return setInterval(() => {}, ms); },
    clearScheduledInterval: () => { cleared.push(cleared.length); },
  } } });
  assert.deepEqual([...callbacks.keys()].sort((a, b) => a - b), [1_000, 25_000, 30_000]);
  h.req.emit("close");
  assert.equal(cleared.length, 3);
  for (const work of callbacks.values()) work();
  await flush();
  assert.deepEqual(h.ledger.pageReads, []);
  assert.deepEqual(h.res.frames, [CONNECTED]);
  assert.equal(h.authorizeCalls.length, 1);
});

test("an empty feedTimers object falls back to the global interval functions", async (t) => {
  const h = await open(t, { deps: { feedTimers: {} } });
  await h.advance(1_000);
  assert.deepEqual(h.ledger.pageReads, [10]);
});

// ---- TW4 emission characterization: recorded before extracting the wire writer ----

test("a settings frame contains only visible namespace names and the examined workspace id", async (t) => {
  const h = await open(t, { query: { afterRevision: "0" }, prepare: (ledger) => {
    ledger.head = 50;
    ledger.rows = [revision(2), revision(3, { scope: "user", principalId: "other" }), revision(4, { settingId: "s-mail" })];
  } });
  await h.advance(1_000);
  assert.deepEqual(h.res.frames, [CONNECTED, "id: 4\n", "event: settings-changed\n", 'data: {"namespaces":["site.theme","site.mail"]}\n\n']);
});

test("an unresolvable batch advances the cursor without emitting an empty settings frame", async (t) => {
  const h = await open(t, { query: { afterRevision: "0" }, prepare: (ledger) => {
    ledger.rows = [revision(3, { settingId: "missing" })];
  } });
  await h.advance(1_000);
  await h.advance(1_000);
  assert.deepEqual(h.res.frames, [CONNECTED]);
  assert.deepEqual(h.ledger.pageReads, [0, 10]);
});

test("revoking settings access during a held poll suppresses its frame while preview keeps the stream open", async (t) => {
  let release!: () => void;
  const h = await open(t, {
    grants: ["settings.read", "theme.set"], query: { themePreview: "1", afterRevision: "0" },
    prepare: (ledger) => {
      ledger.rows = [revision(3)];
      ledger.hold = new Promise<void>((resolve) => { release = resolve; });
    },
  });
  await h.advance(1_000);
  h.grants.delete("settings.read");
  await h.advance(29_000);
  const frames = [...h.res.frames];
  release();
  await flush();
  assert.equal(h.res.ended, false);
  assert.deepEqual(h.res.frames, frames);
  assert.equal(h.res.frames.some((frame) => frame.startsWith("id:")), false);
});

test("closing the response during a held visible batch suppresses all settings frame writes", async (t) => {
  let release!: () => void;
  const h = await open(t, { query: { afterRevision: "0" }, prepare: (ledger) => {
    ledger.rows = [revision(3)];
    ledger.hold = new Promise<void>((resolve) => { release = resolve; });
  } });
  await h.advance(1_000);
  h.res.emit("close");
  release();
  await flush();
  assert.deepEqual(h.res.frames, [CONNECTED]);
});

test("a definition namespace change keeps emitting the cached old namespace (reported, not fixed)", async (t) => {
  const h = await open(t, { query: { afterRevision: "0" }, prepare: (ledger) => {
    ledger.rows = [revision(3)];
  } });
  await h.advance(1_000);
  h.ledger.namespaces.set("s-theme", "site.renamed");
  h.ledger.rows.push(revision(11, { entityKind: "definition", scope: null, op: "alias" }));
  h.ledger.head = 11;
  await h.advance(1_000);
  assert.deepEqual(h.res.frames.filter((frame) => frame.startsWith("data:")), [
    'data: {"namespaces":["site.theme"]}\n\n', 'data: {"namespaces":["site.theme"]}\n\n',
  ]);
  assert.deepEqual(h.ledger.definitionReads, ["s-theme"]);
});
