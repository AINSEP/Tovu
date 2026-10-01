import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlBufferSink } from "#src/platform/db/repos/analytics-sink";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteBufferSink } from "#src/platform/db/sqlite/analytics-sink.sqlite";
import { LocalBufferSink } from "../repo.memory.js";
import type { AnalyticsSinkPort } from "../ports.js";
import type { NormalizedHit } from "../types.js";

/**
 * @file ADR-046 Phase 1 (final capability slice) — shared contract-test suite for
 * `AnalyticsSinkPort`, run against BOTH `LocalBufferSink` and `SqlBufferSink` (rule-of-two,
 * ADR-006), the latter on every dialect (SQLite + PGlite, storage plan §4). Same pattern as every other rule-of-two contract suite in this codebase.
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
    const found = await sink.list();
    assert.deepEqual(found, [makeHit()]);
  });

  test(`[${label}] list() returns hits newest-first`, async () => {
    const sink = makeSink();
    // "Newest" means acceptance order (SQL id), including delayed/out-of-order timestamps.
    await sink.accept(makeHit({ path: "/a", occurredAt: "2026-07-16T00:03:00.000Z" }));
    await sink.accept(makeHit({ path: "/b", occurredAt: "2026-07-16T00:01:00.000Z" }));
    await sink.accept(makeHit({ path: "/c", occurredAt: "2026-07-16T00:02:00.000Z" }));
    assert.deepEqual(
      (await sink.list()).map((h) => h.path),
      ["/c", "/b", "/a"]
    );
  });

  test(`[${label}] acceptBatch() persists every hit in the batch`, async () => {
    const sink = makeSink();
    const hits = [makeHit({ path: "/a", visitorHash: "visitor-a", referrerHost: "referrer.example" }), makeHit({ path: "/b", visitorHash: "visitor-b", kind: "event", eventName: "signup", eventProps: { plan: "pro" } })];
    await sink.acceptBatch(hits);
    assert.equal((await sink.list()).length, 2);
    assert.deepEqual(await sink.list(), [...hits].reverse());
  });

  test(`[${label}] list() honors an explicit limit`, async () => {
    const sink = makeSink();
    for (let i = 0; i < 10; i += 1) {
      await sink.accept(makeHit({ path: `/p${i}` }));
    }
    assert.equal((await sink.list({ limit: 3 })).length, 3);
    assert.deepEqual((await sink.list({ limit: 3 })).map(hit => hit.path), ["/p9", "/p8", "/p7"]);
  });

  test(`[${label}] a hit with a populated eventProps bag round-trips`, async () => {
    const sink = makeSink();
    await sink.accept(makeHit({ kind: "event", eventName: "signup", eventProps: { plan: "pro" } }));
    const found = await sink.list();
    assert.deepEqual(found[0].eventProps, { plan: "pro" });
  });
}

runSuite("memory", () => new LocalBufferSink());
describeEachDialect("AnalyticsSinkPort (SQL)", { tables: ["analytics_events"], make: (kernel) => new SqlBufferSink({ kernel, workspaceId: WORKSPACE_ID }) }, (makeSink, dialect) => {
  runSuite(dialect, makeSink);

  test(`[${dialect}] list() reads back only this sink's workspace`, async () => {
    const sink = makeSink();
    await sink.accept(makeHit({ workspaceId: "workspace-2", path: "/other" }));
    await sink.accept(makeHit({ path: "/mine" }));
    assert.deepEqual((await sink.list()).map((h) => h.path), ["/mine"]);
  });
});

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
    const found = await new SqliteBufferSink({ db: db2, workspaceId: WORKSPACE_ID }).list();
    assert.equal(found.length, 1);
    assert.equal(found[0].path, "/restart-check");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
