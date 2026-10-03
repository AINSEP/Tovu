import assert from "node:assert/strict";
import test from "node:test";

import express from "express";
import { ACTIVE_CONTEXT_TTL_MS } from "@jini-ai/daemon/http";
import { getActiveContextTool } from "@jini-ai/mcp";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { AGENT_DAEMON_TOKEN_ENV_VAR, requireAgentDaemonToken } from "../daemon-auth.js";
import { ACTIVE_CONTEXT_PATH, createRunActiveContextStore, registerRunActiveContextRoute } from "../run-active-context.js";
import type { RunPageContext } from "../run-page-context.js";

/**
 * @file `run-active-context.ts` — the agent daemon's `GET /api/active`, which `@jini-ai/mcp`'s
 * `get_active_context` tool (and its active resource) call. The daemon never served it, so every
 * call answered 404 (tool-gaps report gap #8). The route now answers from the admin screen each
 * live run was started from.
 */

const PAGE_EDITOR: RunPageContext = {
  path: "/pages/7b42dba9",
  section: "pages",
  view: "page-editor",
  entry: { kind: "page", id: "7b42dba9", title: "Landing sample", slug: "landing", status: "draft" },
};
const MEDIA_INDEX: RunPageContext = { path: "/media", section: "media" };

function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return { now: () => current, advance: (ms) => (current += ms) };
}

test("STORE: nothing recorded reads as inactive", () => {
  assert.deepEqual(createRunActiveContextStore().read(), { active: false });
});

test("STORE: a live run's screen is the active resource, its entry id the resourceRef", () => {
  const time = clock();
  const store = createRunActiveContextStore({ now: time.now });
  store.record("run-1", PAGE_EDITOR);
  time.advance(250);

  assert.deepEqual(store.read(), {
    active: true,
    resourceRef: "7b42dba9",
    resourceName: "Landing sample",
    detail: "/pages/7b42dba9",
    ts: 1_000_000,
    ageMs: 250,
    pageContext: PAGE_EDITOR,
  });
});

test("STORE: a screen with no open entry uses its path as the resourceRef and has no name", () => {
  const store = createRunActiveContextStore({ now: () => 5 });
  store.record("run-1", MEDIA_INDEX);

  assert.deepEqual(store.read(), {
    active: true,
    resourceRef: "/media",
    resourceName: null,
    detail: "/media",
    ts: 5,
    ageMs: 0,
    pageContext: MEDIA_INDEX,
  });
});

test("STORE: a finished run's screen is forgotten", () => {
  const store = createRunActiveContextStore();
  store.record("run-1", PAGE_EDITOR);
  store.forget("run-1");

  assert.deepEqual(store.read(), { active: false });
});

test("STORE: a screen older than http-kit's active-context TTL reads as inactive", () => {
  const time = clock();
  const store = createRunActiveContextStore({ now: time.now });
  store.record("run-1", PAGE_EDITOR);

  time.advance(ACTIVE_CONTEXT_TTL_MS);
  assert.equal(store.read().active, true);
  time.advance(1);
  assert.deepEqual(store.read(), { active: false });
});

test("STORE: two live runs on DIFFERENT screens are ambiguous — inactive, never the wrong screen", () => {
  const store = createRunActiveContextStore();
  store.record("run-1", PAGE_EDITOR);
  store.record("run-2", MEDIA_INDEX);

  assert.deepEqual(store.read(), { active: false });
});

test("STORE: two live runs on the SAME screen agree, and the newer recording wins", () => {
  const time = clock();
  const store = createRunActiveContextStore({ now: time.now });
  store.record("run-1", PAGE_EDITOR);
  time.advance(100);
  store.record("run-2", { ...PAGE_EDITOR, entry: { ...PAGE_EDITOR.entry!, title: "Landing sample (renamed)" } });

  const answer = store.read();
  assert.equal(answer.active, true);
  if (!answer.active) return;
  assert.equal(answer.resourceName, "Landing sample (renamed)");
  assert.equal(answer.ts, 1_000_100);
});

test("STORE: a stale run on another screen does not make a fresh one ambiguous", () => {
  const time = clock();
  const store = createRunActiveContextStore({ now: time.now });
  store.record("run-old", MEDIA_INDEX);
  time.advance(ACTIVE_CONTEXT_TTL_MS + 1);
  store.record("run-new", PAGE_EDITOR);

  const answer = store.read();
  assert.equal(answer.active, true);
  if (answer.active) assert.equal(answer.resourceRef, "7b42dba9");
});

test("MCP: get_active_context against the daemon route returns the run's screen instead of a 404", async (t) => {
  const token = "test-daemon-token";
  const store = createRunActiveContextStore({ now: () => 42 });
  store.record("run-1", PAGE_EDITOR);
  const app = express();
  app.use(requireAgentDaemonToken({ env: { [AGENT_DAEMON_TOKEN_ENV_VAR]: token } }));
  registerRunActiveContextRoute(app, store);
  const baseUrl = await startTestServer(app, t);

  const answer = await getActiveContextTool.handler({ args: {}, ctx: { baseUrl, fetchImpl: fetch, authHeaders: { Authorization: `Bearer ${token}` } } });

  assert.deepEqual(answer, {
    active: true,
    resourceRef: "7b42dba9",
    resourceName: "Landing sample",
    detail: "/pages/7b42dba9",
    ts: 42,
    ageMs: 0,
    pageContext: PAGE_EDITOR,
  });
  assert.equal(ACTIVE_CONTEXT_PATH, "/api/active");
});
