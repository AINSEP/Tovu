import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { attachServerLogFile, getServerLogBuffer, installServerLogCapture, readProcessServerLogs, serverLogFilePaths } from "../../index.js";
import type { ServerLogEntry } from "../../log-buffer.js";
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
  const uninstall = installServerLogCapture({ source: "daemon" });
  try {
    process.emit("uncaughtExceptionMonitor", new Error(`fatal-${process.pid}`), "uncaughtException");
  } finally {
    uninstall();
  }
  const last = getServerLogBuffer().entries().at(-1)!;
  assert.equal(last.level, "error");
  assert.equal(last.source, "daemon");
  assert.match(last.message, new RegExp(`^\\[uncaughtException\\] Error: fatal-${process.pid}`));
  assert.equal(process.listenerCount("uncaughtExceptionMonitor"), listenersBefore);
});
