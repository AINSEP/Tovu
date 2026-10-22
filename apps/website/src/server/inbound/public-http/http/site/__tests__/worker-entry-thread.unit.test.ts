import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";

/**
 * @file The two theme worker entry scripts, run as real `worker_threads` Workers straight from
 * source (tsx ESM loader, no precompiled bundle): each posts exactly one reply — its engine's
 * render result for the given `workerData` — and exits. Malformed input is used so the reply is
 * the entry's own controlled refusal, independent of any theme fixture.
 */

async function runEntry(file: string, workerData: unknown): Promise<{ messages: unknown[]; exitCode: number }> {
  const worker = new Worker(new URL(file, import.meta.url), { workerData, execArgv: ["--import", "tsx"] });
  const messages: unknown[] = [];
  worker.on("message", (message) => messages.push(message));
  const exitCode = await new Promise<number>((resolve, reject) => { worker.once("exit", resolve); worker.once("error", reject); });
  return { messages, exitCode };
}

test("the Liquid worker entry posts one controlled reply for malformed workerData and exits cleanly", async () => {
  assert.deepEqual(await runEntry("../liquid-worker.ts", null), {
    messages: [{ ok: false, error: "liquid-worker received malformed workerData" }], exitCode: 0,
  });
});

test("the Handlebars worker entry posts one controlled reply for malformed workerData and exits cleanly", async () => {
  assert.deepEqual(await runEntry("../handlebars-worker.ts", { source: 42 }), {
    messages: [{ ok: false, error: "handlebars-worker received malformed workerData" }], exitCode: 0,
  });
});
