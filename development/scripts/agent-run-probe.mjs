#!/usr/bin/env node
/**
 * @file Drives ONE real assistant run headlessly, through the exact path the admin composer uses, and
 * reports what the agent actually did.
 *
 * Exists for the Agent Plugin A/B measurement (`ADS-memory/reports/continuity/
 * 2026-08-22-handoff-capability-slice-shipped-next-is-the-measurement.md` §3.1), where the question is
 * always behavioural — did the agent CALL the thing, did it READ the files — and never "does the code
 * compile". Unit tests cannot answer that; only a live run can.
 *
 * Not browser automation on purpose. `POST /api/runs` + `GET /api/runs/:id/events` is byte-for-byte
 * what `apps/admin/src/lib/assistant-transport.ts`'s Local CLI branch sends, so this drives the real
 * product path with none of Playwright's flake, and an arm of the A/B is one reproducible command.
 * The session cookie comes from `POST /api/admin/v1/auth/login` with the seeded owner
 * (`identity/wiring.ts`'s defaults unless the host overrides them) — the login route is the only
 * ungated admin route, which is why no fixture or test-only auth bypass is needed here.
 *
 * DEV ONLY. Nothing imports this; it is never bundled, and it defaults to localhost.
 *
 * usage:
 *   node development/scripts/agent-run-probe.mjs --label control --prompt-file p.txt
 *   node development/scripts/agent-run-probe.mjs --label injected --prompt-file p.txt --plugin ui-ux-design
 *
 * Writes `<label>.events.jsonl` (every daemon event) and `<label>.summary.json` (tool_use histogram,
 * every Read path, turn count, cost, final text) into `$PROBE_OUT`.
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync, renameSync, readdirSync, rmdirSync, openSync, appendFileSync, closeSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.TOVU_BASE ?? "http://localhost:3000";
const OUT_DIR = process.env.PROBE_OUT ?? ".";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const label = arg("label", "probe");
const promptFile = arg("prompt-file");
const plugin = arg("plugin");
const model = arg("model");
const timeoutMs = Number(arg("timeout", "900")) * 1000;
const isolateMemory = process.argv.includes("--isolate-memory");

/**
 * `--isolate-memory` — move this project's Claude Code memory store aside for the duration of the run.
 *
 * NOT optional hygiene. The agent Tovu spawns is Claude Code in this same project directory, so it
 * inherits the operator's own memory store, `MEMORY.md` index and all. Measured 2026-08-22: on a run
 * whose entire prompt was "create a landing page for a coffee roastery", one arm read the very memory
 * file describing the experiment it was inside (which names the known-null control), and another arm
 * `Edit`ed one. A subject that has read the experiment's notes is not a measurement, and a subject
 * that can rewrite them is not even a record.
 *
 * The restore is the part worth getting right, and it is why this lives in the harness instead of in
 * each caller's shell. The harness process recreates `memory/` on its own the moment something writes
 * there, so a naive `mv hold memory` after the fact does not restore anything — it buries the real
 * store at `memory/memory.hold/`. That happened once, by hand. Restore therefore MERGES into whatever
 * is at the path now rather than assuming it is absent, and runs from a `finally` plus the fatal
 * signals, so an aborted probe still puts the operator's memory back.
 */
function memoryStorePath() {
  const key = process.cwd().replace(/\//g, "-");
  return path.join(os.homedir(), ".claude", "projects", key, "memory");
}

let heldMemoryPath;
function holdMemory() {
  const live = memoryStorePath();
  if (!existsSync(live) || readdirSync(live).length === 0) return;
  const held = `${live}.probe-hold-${label}`;
  if (existsSync(held)) throw new Error(`refusing to isolate: ${held} already exists from an earlier run — restore it by hand first`);
  renameSync(live, held);
  heldMemoryPath = held;
  console.error(`[${label}] memory store held aside -> ${held}`);
}
function restoreMemory() {
  if (!heldMemoryPath || !existsSync(heldMemoryPath)) return;
  const live = memoryStorePath();
  if (existsSync(live)) {
    // Recreated while we held it. Merge, do not nest.
    for (const entry of readdirSync(heldMemoryPath)) {
      const from = path.join(heldMemoryPath, entry);
      const to = path.join(live, entry);
      if (!existsSync(to)) renameSync(from, to);
    }
    if (readdirSync(heldMemoryPath).length === 0) rmdirSync(heldMemoryPath);
  } else {
    renameSync(heldMemoryPath, live);
  }
  console.error(`[${label}] memory store restored`);
  heldMemoryPath = undefined;
}
if (isolateMemory) {
  holdMemory();
  // `exit` covers every normal and `process.exit()` path, including the several early `process.exit(1)`
  // bailouts below; `renameSync` is synchronous so it is legal in an exit handler. Signals do not fire
  // `exit` on their own, hence the explicit re-exit. Only SIGKILL can now strand the store, and the
  // `refusing to isolate` guard in holdMemory() turns that into a loud error next run rather than a
  // silent second rename that would bury it.
  process.on("exit", restoreMemory);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => process.exit(130));
}

if (!promptFile) {
  console.error("--prompt-file is required");
  process.exit(2);
}
const prompt = readFileSync(promptFile, "utf8");

const username = process.env.TOVU_PROBE_USER ?? "admin";
const password = process.env.TOVU_PROBE_PASSWORD ?? "tovu-dev";

const loginRes = await fetch(`${BASE}/api/admin/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!loginRes.ok) {
  console.error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
  process.exit(1);
}
const setCookie = loginRes.headers.get("set-cookie") ?? "";
const token = /tovu_session=([^;]+)/.exec(setCookie)?.[1];
if (!token) {
  console.error("no tovu_session cookie in login response");
  process.exit(1);
}
const cookie = `tovu_session=${token}`;

const contextRef = { prompt };
if (model) contextRef.model = model;
if (plugin) contextRef.pluginRefIds = [plugin];

const startRes = await fetch(`${BASE}/api/runs`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ contextRef: JSON.stringify(contextRef), agentId: "claude" }),
});
if (!startRes.ok) {
  console.error(`start failed: ${startRes.status} ${await startRes.text()}`);
  process.exit(1);
}
const { run } = await startRes.json();
console.error(`[${label}] runId=${run.id}`);

mkdirSync(OUT_DIR, { recursive: true });
const eventsPath = path.join(OUT_DIR, `${label}.events.jsonl`);
const events = [];

/**
 * Events are appended to disk AS THEY ARRIVE, not buffered and written once at the end.
 *
 * The end-of-run write lost a whole measurement on 2026-08-22: a run that had already streamed
 * 455KB of events died on `UND_ERR_SOCKET` when the API restarted under it, and because nothing had
 * been flushed yet, every one of those events went with the process. The daemon's own run registry
 * is in-memory per process, so the restart destroyed the server-side copy too — the usual
 * `GET /api/runs/<id>/events` recovery had nothing left to replay. Two independent copies, both
 * gone, for want of a flush.
 *
 * Cheap insurance: one small synchronous append per SSE frame, against a run that costs minutes and
 * dollars. A partial `.events.jsonl` from a died-mid-stream run is still worth reading.
 */
const eventsFd = openSync(eventsPath, "w");

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

const streamRes = await fetch(`${BASE}/api/runs/${encodeURIComponent(run.id)}/events`, {
  headers: { Cookie: cookie, Accept: "text/event-stream" },
  signal: controller.signal,
});
if (!streamRes.ok || !streamRes.body) {
  console.error(`stream failed: ${streamRes.status}`);
  process.exit(1);
}

const decoder = new TextDecoder();
let buffer = "";
let done = false;

function handleFrame(frame) {
  const dataLines = frame
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  if (dataLines.length === 0) return;
  const raw = dataLines.join("\n");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { _unparsed: raw };
  }
  events.push(parsed);
  appendFileSync(eventsFd, `${JSON.stringify(parsed)}\n`);
  // `kind` is the daemon's own event discriminator (`start` | `stdout` | `agent` | `end`); `type`
  // is checked first only so a future protocol change that renames it still logs something useful.
  const kind = parsed.kind ?? parsed.type ?? "?";
  if (kind === "end") {
    console.error(`[${label}] end: ${JSON.stringify(parsed.payload ?? {})}`);
    done = true;
  }
}

try {
  for await (const chunk of streamRes.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      handleFrame(buffer.slice(0, idx));
      buffer = buffer.slice(idx + 2);
    }
    if (done) break;
  }
} catch (error) {
  if (error.name !== "AbortError") throw error;
  console.error(`[${label}] TIMED OUT after ${timeoutMs / 1000}s`);
} finally {
  clearTimeout(timer);
  closeSync(eventsFd);
}

/**
 * The daemon's `stdout` frames carry the spawned CLI's own stream-JSON verbatim, so the tool_use
 * histogram and the final assistant text are both recoverable from the run's own event log. This is
 * deliberately NOT a grep of `~/.claude/projects/<sessionId>.jsonl` (the technique the 2026-08-21
 * measurement used): that file is written by whichever session id the CLI picked, which the caller
 * does not know in advance and which is not scoped to this run.
 */
const rawStdout = events.filter((e) => e.kind === "stdout").map((e) => e.payload?.chunk ?? "").join("");
const cliObjects = [];
for (const line of rawStdout.split("\n")) {
  if (!line.trim()) continue;
  try {
    cliObjects.push(JSON.parse(line));
  } catch {
    /* a chunk boundary split a JSON line — the next chunk carries its remainder */
  }
}

const toolUse = {};
const calls = [];
for (const obj of cliObjects) {
  const content = obj?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const block of content) {
    if (block.type !== "tool_use") continue;
    toolUse[block.name] = (toolUse[block.name] ?? 0) + 1;
    calls.push({ name: block.name, input: block.input });
  }
}
const fileReads = calls.filter((c) => c.name === "Read").map((c) => c.input?.file_path).filter(Boolean);
const result = cliObjects.filter((o) => o.type === "result").pop();

const summary = {
  label,
  runId: run.id,
  status: events.find((e) => e.kind === "end")?.payload?.status ?? "unknown",
  eventCount: events.length,
  toolUse,
  toolCallCount: calls.length,
  fileReadCount: fileReads.length,
  fileReads,
  numTurns: result?.num_turns ?? null,
  costUsd: result?.total_cost_usd ?? null,
  eventsPath,
};
writeFileSync(path.join(OUT_DIR, `${label}.summary.json`), JSON.stringify({ ...summary, calls, finalText: result?.result ?? null }, null, 2));
console.error(`[${label}] ${events.length} events -> ${eventsPath}`);
console.log(JSON.stringify(summary, null, 2));
