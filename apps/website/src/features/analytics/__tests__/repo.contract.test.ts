import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteBufferSink } from "#src/platform/db/sqlite/analytics-sink.sqlite";
import { LocalBufferSink } from "../repo.memory.js";
import type { AnalyticsSinkPort } from "../ports.js";
import type { NormalizedHit } from "../types.js";

/**
 * @file ADR-046 Phase 1 (final capability slice) — shared contract-test suite for
 * `AnalyticsSinkPort`, run against BOTH `LocalBufferSink` and `SqliteBufferSink` (rule-of-two,
 * ADR-006). Same pattern as every other rule-of-two contract suite in this codebase.
 */

const WORKSPACE_ID = "workspace-1";

function makeHit(overrides: Partial<NormalizedHit> = {}): NormalizedHit {
  return {
    workspaceId: WORKSPACE_ID,
    occurredAt: "2026-07-16T00:00:00.000Z",
    kind: "pageview",
    path: "/a",
    referrerHost: null,
    utm: { source: null, medium: null, campaign: null, term: null, content: null },
    country: null,
    region: null,
    deviceClass: "desktop",
    browserFamily: "chrome",
    osFamily: "windows",
    visitorHash: "hash-1",
    sessionId: "session-1",
    eventName: null,
    eventProps: null,
    ...overrides,
  };
}

function runSuite(label: string, makeSink: () => AnalyticsSinkPort) {
  test(`[${label}] accept() then list() round-trips`, async () => {
    const sink = makeSink();
    await sink.accept(makeHit());
    const found = sink.list();
    assert.deepEqual(found, [makeHit()]);
  });

  test(`[${label}] list() returns hits newest-first`, async () => {
    const sink = makeSink();
    await sink.accept(makeHit({ path: "/a" }));
    await sink.accept(makeHit({ path: "/b" }));
    await sink.accept(makeHit({ path: "/c" }));
    assert.deepEqual(
      sink.list().map((h) => h.path),
      ["/c", "/b", "/a"]
    );
  });

  test(`[${label}] acceptBatch() persists every hit in the batch`, async () => {
    const sink = makeSink();
    await sink.acceptBatch([makeHit({ path: "/a" }), makeHit({ path: "/b" })]);
    assert.equal(sink.list().length, 2);
  });

  test(`[${label}] list() honors an explicit limit`, async () => {
    const sink = makeSink();
    for (let i = 0; i < 10; i += 1) {
      await sink.accept(makeHit({ path: `/p${i}` }));
    }
    assert.equal(sink.list({ limit: 3 }).length, 3);
  });

  test(`[${label}] a hit with a populated eventProps bag round-trips`, async () => {
    const sink = makeSink();
    await sink.accept(makeHit({ kind: "event", eventName: "signup", eventProps: { plan: "pro" } }));
    const found = sink.list();
    assert.deepEqual(found[0].eventProps, { plan: "pro" });
  });
}

runSuite("memory", () => new LocalBufferSink());
runSuite("sqlite", () => new SqliteBufferSink({ db: openContentDb(":memory:"), workspaceId: WORKSPACE_ID }));

test("SqliteBufferSink reports durable: true, LocalBufferSink reports durable: false", () => {
  const sqlite = new SqliteBufferSink({ db: openContentDb(":memory:"), workspaceId: WORKSPACE_ID });
  const memory = new LocalBufferSink();
  assert.equal(sqlite.capabilities().durable, true);
  assert.equal(memory.capabilities().durable, false);
});

test("ADR-046 Phase 1: analytics_events survives a simulated process restart (real on-disk file)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-analytics-restart-test-"));
  const dbPath = join(dir, "content.db");
  try {
    const db1 = openContentDb(dbPath);
    await new SqliteBufferSink({ db: db1, workspaceId: WORKSPACE_ID }).accept(makeHit({ path: "/restart-check" }));

    // "Restart": a brand-new content.db handle against the SAME on-disk file — the
    // process-local array this replaces would have lost the row entirely.
    const db2 = openContentDb(dbPath);
    const found = new SqliteBufferSink({ db: db2, workspaceId: WORKSPACE_ID }).list();
    assert.equal(found.length, 1);
    assert.equal(found[0].path, "/restart-check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
