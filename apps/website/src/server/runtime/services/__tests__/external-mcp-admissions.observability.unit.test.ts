import assert from "node:assert/strict";
import test from "node:test";
import { createInMemoryOtel } from "#src/platform/observability/__tests__/fixtures/in-memory-otel";
import { readServerAdmissions } from "../external-mcp-admissions.js";

// The loopback fetch no longer exists. Remote connection spans stay with federation's transport.
test("server admissions waits for admission without making a daemon HTTP request", async t => {
  const { exporter } = createInMemoryOtel();
  let calls = 0; let release!: () => void; let reads = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("no daemon request"); });
  const ready = new Promise<void>(resolve => { release = resolve; });
  const pending = readServerAdmissions({ awaitFederation: async timeoutMs => {
    assert.equal(timeoutMs, 5000); await ready; return { settled: true };
  }, readAdmissions: async () => { reads++; return { connections: [], configFailures: [{ connectionId: "bad", reason: "cannot resolve" }] }; } });
  assert.equal(reads, 0);
  release();
  assert.deepEqual(await pending, { ok: true, connections: [], configFailures: [{ connectionId: "bad", reason: "cannot resolve" }] });
  assert.equal(calls, 0);
  assert.equal(exporter.getFinishedSpans().length, 0);
});

for (const mode of ["unwired", "connecting", "failed"] as const) {
  test(`server admissions ${mode} is unavailable, never an empty success`, async () => {
    const result = await readServerAdmissions(mode === "unwired" ? {} : {
      awaitFederation: async () => ({ settled: mode !== "connecting" }),
      readAdmissions: async () => { throw new Error("private-provider-token"); },
    });
    assert.equal(result.ok, false);
    assert.equal("connections" in result, false);
    assert.equal(JSON.stringify(result).includes("private-provider-token"), false);
  });
}

test("server admissions preserves omission of optional configFailures", async () => {
  assert.deepEqual(await readServerAdmissions({ awaitFederation: async () => ({ settled: true }), readAdmissions: async () => ({ connections: [] }) }), { ok: true, connections: [] });
});
