/** Shared evidence lifecycle; callers supply only measurements and fixed, capability-free errors. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluateMemoryFloors, type MemoryCheckpoint } from "@jini-ai/devops/checks/memory-soak";

/** Create incremental JSON and the final verdict. O(samples) per checkpoint, at most six checkpoints.
 * @param input Fixed workload and suite identity. @returns Recording and final enforcement methods.
 * @throws RangeError for bad limits/readings; Error for functional/instrumentation failure or growth.
 * @example const evidence = createMemoryEvidence({ suite: 'server', warmup: 500, workload: 3000 });
 */
export function createMemoryEvidence({ suite, warmup, workload }: { suite: "server" | "desktop"; warmup: number; workload: number }, _options = {}) {
  const limit = Number(process.env.TOVU_SOAK_LIMIT_PCT ?? 15) / 100;
  const recordOnly = process.env.TOVU_SOAK_RECORD_ONLY === "1";
  const directory = path.resolve(import.meta.dirname, "../../test-results/memory-soak", suite);
  const checkpoints: MemoryCheckpoint[] = [];
  const raw: Array<{ completed: number; readings: unknown }> = [];
  let baselineSamples: number[] = [];
  let verdict: ReturnType<typeof evaluateMemoryFloors> | undefined;
  const metadata = { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    os: os.platform(), arch: os.arch(), node: process.versions.node, electron: null as string | null,
    limit, warmup, workload, recordOnly };
  /** Rewrite after every checkpoint, retaining the last valid measurement if instrumentation fails. */
  function write({ error, status = "IN_PROGRESS" }: { error?: string; status?: string }, _options = {}) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "samples.json"), JSON.stringify({ ...metadata, status, raw, baselineSamples, checkpoints, verdict, error }, null, 2));
  }
  write({});
  return {
    metadata,
    checkpoint({ completed, samples, readings }: { completed: number; samples: number[]; readings: unknown }, _options = {}) {
      raw.push({ completed, readings });
      if (completed === 0) baselineSamples = samples;
      else checkpoints.push({ completed, samples });
      const measured = checkpoints.length ? checkpoints : [{ completed: 0, samples: baselineSamples }];
      verdict = evaluateMemoryFloors({ baselineSamples, checkpoints: measured }, { limit, checkSlope: suite === "server" });
      write({});
    },
    fail({ reason }: { reason: string }, _options = {}) { write({ error: reason, status: "ERROR" }); console.log(`ERROR ${suite} ${reason}`); },
    finish(_required = {}, _options = {}) {
      if (!verdict || !checkpoints.length) throw new Error("Missing soak measurements");
      const status = recordOnly ? `RECORD_ONLY wouldFail=${!verdict.pass}` : verdict.pass ? "PASS" : "FAIL";
      write({ status });
      console.log(`${status} ${suite} workload=${workload} baselineMiB=${(verdict.baselineFloor / 2 ** 20).toFixed(1)} endMiB=${(verdict.floors.at(-1)! / 2 ** 20).toFixed(1)} growth=${(verdict.growth * 100).toFixed(1)}% tailGrowth=${(verdict.tailGrowth * 100).toFixed(1)}% limit=${limit * 100}%`);
      if (!recordOnly && !verdict.pass) throw new Error(`Memory growth: ${verdict.failures.join(", ")}`);
    },
  };
}
