import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { attachServerLogFile, getServerLogBuffer, installServerLogCapture, readProcessServerLogs, serverLogFilePaths, setServerLogTraceReader } from "../../index.js";
import type { ServerLogEntry } from "../../log-buffer.js";
import { createLogBuffer } from '../../log-buffer.js';
import { createRotatingLogFileSink, nodeLogFileFs, readLogFileTail, type LogFileFsPort } from "../../log-file.js";

/** In-memory files; `failAppend` simulates a full disk. */
function memoryFs(options: { failAppend?: boolean } = {}) {
  const files = new Map<string, string>();
  const dirs: string[] = [];
  const port: LogFileFsPort = {
    appendFile: (p, data) => {
      if (options.failAppend) throw new Error("ENOSPC");
      files.set(p, (files.get(p) ?? "") + data);
    },
    size: p => (files.has(p) ? Buffer.byteLength(files.get(p)!) : null),
    rename: (from, to) => { files.set(to, files.get(from)!); files.delete(from); },
    mkdirp: dir => { dirs.push(dir); },
    readTail: (p, maxBytes) => {
      const text = files.get(p);
      if (text === undefined) return null;
      const bytes = Buffer.from(text);
      return bytes.subarray(Math.max(0, bytes.length - maxBytes)).toString("utf8");
    },
  };
  return { files, dirs, port };
}

const entry = (seq: number, message = `line ${seq}`): ServerLogEntry => ({ seq, at: "2026-10-05T12:00:00.000Z", level: "error", source: "server", message });
const lineBytes = Buffer.byteLength(`${JSON.stringify(entry(1))}\n`);

test('each rotated record retains release/environment and its own active trace IDs', () => {
  const mem = memoryFs();
  const filePath = '/site/daemon.log';
  let trace: { traceId: string; spanId: string } | undefined;
  const logs = createLogBuffer({ redact: text => text }, { metadata: () => ({ release: 'tovu@1.2.3+abcdef0', environment: 'desktop', ...trace }) });
  const sink = createRotatingLogFileSink({ filePath }, { fs: mem.port, maxBytes: 1 });
  logs.subscribe(value => sink.write(value));
  logs.append({ level: 'info', source: 'daemon', message: 'boot' });
  trace = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) };
  logs.append({ level: 'error', source: 'daemon', message: 'active' });
  trace = undefined;
  logs.append({ level: 'info', source: 'daemon', message: 'outside' });
  const records = readLogFileTail({ filePath }, { fs: mem.port })!;
  assert.deepEqual(records.map(value => value.message), ['active', 'outside']);
  assert.deepEqual(records.map(value => [value.release, value.environment]), [
    ['tovu@1.2.3+abcdef0', 'desktop'], ['tovu@1.2.3+abcdef0', 'desktop'],
  ]);
  assert.equal(records[0]!.traceId, 'a'.repeat(32));
  assert.equal(records[0]!.spanId, 'b'.repeat(16));
  assert.equal(records[1]!.traceId, undefined);
  assert.equal(records[1]!.spanId, undefined);
});

test("the sink writes JSON lines and creates the log directory first", () => {
  const mem = memoryFs();
  const sink = createRotatingLogFileSink({ filePath: "/site/ops/logs/server.log" }, { fs: mem.port });
  sink.write(entry(1));
  sink.write(entry(2));
  assert.deepEqual(mem.dirs, ["/site/ops/logs"]);
  assert.deepEqual(mem.files.get("/site/ops/logs/server.log")!.trimEnd().split("\n").map(l => JSON.parse(l).seq), [1, 2]);
});

test("rotation moves the full file to .1 (replacing the older .1) before exceeding the cap", () => {
  const mem = memoryFs();
  const file = "/l/server.log";
  const sink = createRotatingLogFileSink({ filePath: file }, { fs: mem.port, maxBytes: lineBytes * 2 });
  for (let seq = 1; seq <= 5; seq += 1) sink.write(entry(seq));
  const seqs = (p: string) => mem.files.get(p)!.trimEnd().split("\n").map(l => JSON.parse(l).seq);
  assert.deepEqual(seqs(`${file}.1`), [3, 4]);
  assert.deepEqual(seqs(file), [5]);
});

test("rotation counts an existing file's size from before this process started", () => {
  const mem = memoryFs();
  mem.files.set("/l/server.log", `${JSON.stringify(entry(1))}\n`);
  const sink = createRotatingLogFileSink({ filePath: "/l/server.log" }, { fs: mem.port, maxBytes: lineBytes * 1 });
  sink.write(entry(2));
  assert.equal(JSON.parse(mem.files.get("/l/server.log.1")!).seq, 1);
  assert.equal(JSON.parse(mem.files.get("/l/server.log")!).seq, 2);
});

test("a failed write disables the sink silently instead of throwing", () => {
  const mem = memoryFs({ failAppend: true });
  const sink = createRotatingLogFileSink({ filePath: "/l/server.log" }, { fs: mem.port });
  assert.doesNotThrow(() => sink.write(entry(1)));
  assert.equal(sink.isHealthy(), false);
});

test("the tail reader joins .1 then the current file, oldest first, and skips torn lines", () => {
  const mem = memoryFs();
  mem.files.set("/l/server.log.1", `${JSON.stringify(entry(1))}\n${JSON.stringify(entry(2))}\n`);
  mem.files.set("/l/server.log", `${JSON.stringify(entry(3))}\n{"seq":4,"at":"2026`);
  assert.deepEqual(readLogFileTail({ filePath: "/l/server.log" }, { fs: mem.port })!.map(e => e.seq), [1, 2, 3]);
  assert.deepEqual(readLogFileTail({ filePath: "/l/server.log" }, { fs: mem.port, maxEntries: 2 })!.map(e => e.seq), [2, 3]);
});

test("the tail reader honors the byte budget and drops the partial first line", () => {
  const mem = memoryFs();
  mem.files.set("/l/server.log.1", [1, 2, 3].map(s => `${JSON.stringify(entry(s))}\n`).join(""));
  mem.files.set("/l/server.log", [4, 5].map(s => `${JSON.stringify(entry(s))}\n`).join(""));
  // Budget covers the 2 current lines plus 1.5 rotated lines: the half line is dropped.
  const result = readLogFileTail({ filePath: "/l/server.log" }, { fs: mem.port, maxBytes: Math.floor(lineBytes * 3.5) });
  assert.deepEqual(result!.map(e => e.seq), [3, 4, 5]);
});

test("the tail reader returns null when no log file exists", () => {
  assert.equal(readLogFileTail({ filePath: "/none/server.log" }, { fs: memoryFs().port }), null);
});

test("serverLogFilePaths puts both processes' logs under <site>/ops/logs", () => {
  assert.deepEqual(serverLogFilePaths({ siteDir: "/sites/acme" }), {
    server: path.join("/sites/acme", "ops", "logs", "server.log"),
    daemon: path.join("/sites/acme", "ops", "logs", "daemon.log"),
  });
});

test("attach flushes already-buffered lines, then persists new ones; reads merge both processes' files by time", () => {
  const mem = memoryFs();
  const marker = `attach-${process.pid}`;
  getServerLogBuffer().append({ level: "warn", source: "server", message: `${marker} before attach` });
  mem.files.set("/site/daemon.log", `${JSON.stringify({ seq: 1, at: "2000-01-01T00:00:00.000Z", level: "error", source: "daemon", message: `${marker} from the daemon` })}\n`);
  const detach = attachServerLogFile({ filePath: "/site/server.log" }, { alsoRead: ["/site/daemon.log"], fs: mem.port });
  try {
    getServerLogBuffer().append({ level: "error", source: "server", message: `${marker} after attach` });
    const written = mem.files.get("/site/server.log")!;
    assert.ok(written.includes(`${marker} before attach`) && written.includes(`${marker} after attach`));
    const read = readProcessServerLogs({ fs: mem.port });
    assert.equal(read.capturing, true);
    assert.deepEqual(read.entries.filter(e => e.message.startsWith(marker)).map(e => [e.source, e.message]), [
      ["daemon", `${marker} from the daemon`],
      ["server", `${marker} before attach`],
      ["server", `${marker} after attach`],
    ]);
  } finally {
    detach();
  }
  assert.deepEqual(readProcessServerLogs({ fs: mem.port }).entries, getServerLogBuffer().entries());
});

test("through the real filesystem: files are owner-only, and a missing pair of files reads as not capturing", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-server-logs-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = serverLogFilePaths({ siteDir: dir });
  createRotatingLogFileSink({ filePath: files.daemon }).write(entry(7, "written by the daemon"));
  const detach = attachServerLogFile({ filePath: files.server }, { alsoRead: [files.daemon], fs: nodeLogFileFs });
  try {
    assert.ok(readProcessServerLogs().entries.some(e => e.message === "written by the daemon"));
    assert.equal((fs.statSync(files.daemon).mode & 0o777).toString(8), "600");
  } finally {
    detach();
  }
  const missing = attachServerLogFile({ filePath: path.join(dir, "none", "server.log") }, { alsoRead: [path.join(dir, "none", "daemon.log")], fs: { ...nodeLogFileFs, mkdirp: () => {} } });
  try {
    assert.deepEqual(readProcessServerLogs(), { entries: [], capturing: false });
  } finally {
    missing();
  }
});

test("capture records a fatal uncaught exception without handling it, tagged with this process's source", () => {
  const listenersBefore = process.listenerCount("uncaughtExceptionMonitor");
  const trace = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) };
  setServerLogTraceReader({ traceIds: () => trace });
  const uninstall = installServerLogCapture({ source: "daemon", release: 'tovu@1.2.3+abcdef0', environment: 'desktop' });
  try {
    Reflect.apply(process.emit, process, ["uncaughtExceptionMonitor", new Error(`fatal-${process.pid}`), "uncaughtException"]);
  } finally {
    uninstall();
    setServerLogTraceReader({ traceIds: () => undefined });
  }
  const last = getServerLogBuffer().entries().at(-1)!;
  assert.equal(last.level, "error");
  assert.equal(last.source, "daemon");
  assert.equal(last.release, 'tovu@1.2.3+abcdef0');
  assert.equal(last.environment, 'desktop');
  assert.equal(last.traceId, trace.traceId);
  assert.equal(last.spanId, trace.spanId);
  assert.match(last.message, new RegExp(`^\\[uncaughtException\\] Error: fatal-${process.pid}`));
  assert.equal(process.listenerCount("uncaughtExceptionMonitor"), listenersBefore);
});

test("a disabled sink drops later entries even if the filesystem recovers", () => {
  const options = { failAppend: true };
  const mem = memoryFs(options);
  const sink = createRotatingLogFileSink({ filePath: "/l/server.log" }, { fs: mem.port });
  sink.write(entry(1));
  options.failAppend = false;
  sink.write(entry(2));
  assert.equal(sink.isHealthy(), false);
  assert.deepEqual([...mem.files], []);
  assert.deepEqual(mem.dirs, ["/l"]);
});

test("the tail reader ignores non-entries without losing valid adjacent entries", () => {
  const mem = memoryFs();
  const invalid = [null, 7, { ...entry(2), seq: "2" }, { ...entry(3), at: 3 },
    { ...entry(4), level: false }, { ...entry(5), source: null }, { ...entry(6), message: [] }];
  mem.files.set("/l/server.log", [entry(1), ...invalid, entry(7)].map(value => JSON.stringify(value)).join("\n"));
  assert.deepEqual(readLogFileTail({ filePath: "/l/server.log" }, { fs: mem.port }), [entry(1), entry(7)]);
});

test("the tail reader can recover a rotated file when the current file is absent", () => {
  const mem = memoryFs();
  mem.files.set("/l/server.log.1", `${JSON.stringify(entry(1))}\n`);
  assert.deepEqual(readLogFileTail({ filePath: "/l/server.log" }, { fs: mem.port }), [entry(1)]);
});

test("a current file that fills the byte budget excludes the rotated file and its own first fragment", () => {
  const mem = memoryFs();
  mem.files.set("/l/server.log.1", `${JSON.stringify(entry(1))}\n`);
  mem.files.set("/l/server.log", [2, 3, 4].map(seq => `${JSON.stringify(entry(seq))}\n`).join(""));
  assert.deepEqual(readLogFileTail({ filePath: "/l/server.log" }, { fs: mem.port, maxBytes: Math.floor(lineBytes * 1.5) }), [entry(4)]);
});

test("files disappearing between stat and read are treated as empty tails", () => {
  const mem = memoryFs();
  mem.files.set("/l/server.log", `${JSON.stringify(entry(2))}\n`);
  mem.files.set("/l/server.log.1", `${JSON.stringify(entry(1))}\n`);
  const disappearing: LogFileFsPort = { ...mem.port, readTail: () => null };
  assert.deepEqual(readLogFileTail({ filePath: "/l/server.log" }, { fs: disappearing }), []);
});

test("the default filesystem reader returns null for an absent log pair", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-missing-logs-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(readLogFileTail({ filePath: path.join(dir, "missing.log") }), null);
  assert.equal(nodeLogFileFs.readTail(path.join(dir, "missing.log"), 100), null);
});

test("through the real filesystem: rotation renames the full file to .1 and starts a fresh current file", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-rotate-logs-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "logs", "server.log");
  const sink = createRotatingLogFileSink({ filePath: file }, { maxBytes: lineBytes * 2 });
  for (let seq = 1; seq <= 3; seq += 1) sink.write(entry(seq));
  const seqs = (p: string) => fs.readFileSync(p, "utf8").trimEnd().split("\n").map(l => JSON.parse(l).seq);
  assert.deepEqual({ rotated: seqs(`${file}.1`), current: seqs(file) }, { rotated: [1, 2], current: [3] });
});

test("an empty current file contributes nothing and leaves the whole byte budget to the rotated file", () => {
  const mem = memoryFs();
  mem.files.set("/l/server.log.1", [1, 2].map(seq => `${JSON.stringify(entry(seq))}\n`).join(""));
  mem.files.set("/l/server.log", "");
  assert.deepEqual(readLogFileTail({ filePath: "/l/server.log" }, { fs: mem.port, maxBytes: lineBytes * 2 }), [entry(1), entry(2)]);
});

test("a byte budget that starts exactly on a line boundary retains that whole first line", () => {
  const mem = memoryFs();
  mem.files.set("/l/server.log", [1, 2, 3].map(seq => `${JSON.stringify(entry(seq))}\n`).join(""));
  assert.deepEqual(readLogFileTail({ filePath: "/l/server.log" }, { fs: mem.port, maxBytes: lineBytes * 2 }), [entry(2), entry(3)]);
});
