import assert from "node:assert/strict";
import test from "node:test";

import { createInMemoryToolAttemptAuditSink } from "../../features/tool-audit/repo.memory.js";
import type { ToolAttemptAuditSink } from "../../features/tool-audit/types.js";
import {
  appendToolCatalogAttempt,
  describeToolAuditDetail,
  DESCRIBE_TOOL_TOOL_ID,
  searchToolsAuditDetail,
  SEARCH_TOOLS_TOOL_ID,
  withToolCatalogAudit,
} from "../tool-catalog-audit.js";
import { buildToolCatalogQuery } from "../tool-catalog-query.js";

/**
 * @file `tool-catalog-audit.ts` — the 2026-09-01 incident fix.
 *
 * `search_tools`/`describe_tool` never reached `ToolExecutor`, so `withToolAttemptAudit`
 * (`tool-executor-audit.ts`) never recorded them: an agent's `search_tools` query for
 * `custom_credential_verify` was concluded to have found nothing, and because neither the query text
 * nor the ranked hits were recorded anywhere, nobody could tell afterward whether that was bad query
 * vocabulary, a `limit` cutoff, or a ranking bug. The first test below is the one this file exists
 * for: it asserts a `search_tools` call leaves a row recording the exact query, limit, and ranked hit
 * ids — the reconstruction that incident had none of.
 */

const WORKSPACE_ID = "ws-catalog-audit";
const RUN_ID = "run-catalog-audit";
const PRINCIPAL_ID = "principal-catalog-audit";

const DESCRIPTORS = [
  { id: "forms_create_definition", description: "Creates a new form definition from a name, a URL slug, and fields." },
  { id: "forms_update_definition", description: "Updates an existing form definition's name, field list, or notify config." },
  { id: "identity_user_create", description: "Creates a new human operator user." },
];

function fakeRegistry() {
  return { list: () => DESCRIPTORS };
}

function wrap(sink: ToolAttemptAuditSink) {
  let sequence = 0;
  return withToolCatalogAudit(
    buildToolCatalogQuery(fakeRegistry(), { includeSearchKeywords: false }),
    sink,
    { workspaceId: WORKSPACE_ID, runId: RUN_ID, principalId: PRINCIPAL_ID },
    { now: () => `2026-09-01T00:00:0${sequence++}.000Z`, newAttemptId: () => "attempt-catalog-1" },
  );
}

test("INCIDENT FIX: a search_tools call is durably recorded with its exact query, limit, and ranked hit ids", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const catalog = wrap(sink);

  // "form definition" is unambiguous: both terms appear only in the two `forms_*` descriptions, not
  // in `identity_user_create`'s ("Creates a new human operator user.") — unlike a bare "create",
  // which FTS5's porter stemming also matches against "Creates".
  const hits = catalog.search("form definition", 5);

  // The wrapper must not alter what the caller sees.
  assert.deepEqual(hits.map((h) => h.id).sort(), ["forms_create_definition", "forms_update_definition"]);

  await Promise.resolve(); // let the fire-and-forget append settle
  assert.equal(sink.events.length, 1);
  const [event] = sink.events;
  assert.equal(event.toolId, SEARCH_TOOLS_TOOL_ID);
  assert.equal(event.phase, "completed");
  assert.equal(event.workspaceId, WORKSPACE_ID);
  assert.equal(event.runId, RUN_ID);
  assert.equal(event.principalId, PRINCIPAL_ID);
  assert.equal(event.executionId, null);
  assert.deepEqual(JSON.parse(String(event.detail)), {
    query: "form definition",
    limit: 5,
    resultIds: hits.map((h) => h.id),
    resultCount: hits.length,
  });
});

test("a search_tools call that matches nothing still records the query and limit, with an empty resultIds array", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const catalog = wrap(sink);

  const hits = catalog.search("zzzzqqqwwwnothingmatchesthis", 10);

  assert.deepEqual(hits, []);
  await Promise.resolve();
  assert.deepEqual(JSON.parse(String(sink.events[0].detail)), { query: "zzzzqqqwwwnothingmatchesthis", limit: 10, resultIds: [], resultCount: 0 });
});

test("a describe_tool call records the requested id and whether it resolved", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  const catalog = wrap(sink);

  const found = catalog.describe("forms_create_definition");
  const missing = catalog.describe("nonexistent_tool");

  assert.ok(found);
  assert.equal(missing, null);
  await Promise.resolve();
  assert.equal(sink.events.length, 2);
  assert.equal(sink.events[0].toolId, DESCRIBE_TOOL_TOOL_ID);
  assert.deepEqual(JSON.parse(String(sink.events[0].detail)), { id: "forms_create_definition", found: true });
  assert.deepEqual(JSON.parse(String(sink.events[1].detail)), { id: "nonexistent_tool", found: false });
});

test("ADVERSARIAL: a sink that throws cannot break a search or describe call — audit is observation, not a gate", async () => {
  const errors: unknown[] = [];
  const hostileSink: ToolAttemptAuditSink = {
    append: async () => {
      throw new Error("disk full");
    },
  };
  const catalog = withToolCatalogAudit(
    buildToolCatalogQuery(fakeRegistry()),
    hostileSink,
    { workspaceId: WORKSPACE_ID, runId: RUN_ID, principalId: PRINCIPAL_ID },
    { onSinkError: (e) => errors.push(e) },
  );

  const hits = catalog.search("form", 5);
  const entry = catalog.describe("forms_create_definition");

  assert.ok(hits.length > 0);
  assert.ok(entry);
  await Promise.resolve();
  assert.equal(errors.length, 2, "both appends failed and both were reported — loud, but not fatal");
});

test("searchToolsAuditDetail/describeToolAuditDetail are pure JSON builders", () => {
  assert.equal(searchToolsAuditDetail("q", 10, [{ id: "a", description: "", source: "s", score: 1 }]), JSON.stringify({ query: "q", limit: 10, resultIds: ["a"], resultCount: 1 }));
  assert.equal(describeToolAuditDetail("a", null), JSON.stringify({ id: "a", found: false }));
});

test("appendToolCatalogAttempt appends exactly the fields it is given, plus a minted attemptId/executionId/phase/at", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  appendToolCatalogAttempt(
    sink,
    { workspaceId: WORKSPACE_ID, runId: RUN_ID, principalId: PRINCIPAL_ID, toolId: SEARCH_TOOLS_TOOL_ID, detail: "d" },
    { now: () => "2026-09-01T00:00:00.000Z", newAttemptId: () => "attempt-x" },
  );
  await Promise.resolve();
  assert.deepEqual(sink.events[0], {
    attemptId: "attempt-x",
    executionId: null,
    workspaceId: WORKSPACE_ID,
    runId: RUN_ID,
    toolId: SEARCH_TOOLS_TOOL_ID,
    principalId: PRINCIPAL_ID,
    phase: "completed",
    at: "2026-09-01T00:00:00.000Z",
    detail: "d",
  });
});
