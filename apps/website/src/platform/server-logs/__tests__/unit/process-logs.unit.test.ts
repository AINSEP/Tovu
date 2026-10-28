import "../../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { inspect } from "node:util";

import { attachServerLogFile, getServerLogBuffer, installServerLogCapture, isServerLogCaptureInstalled, readProcessServerLogs } from "../../index.js";

// The adjacent log-file suite is being edited by another worker. These tests own only the
// process-wide lifecycle; file serialization/rotation stays covered by that existing suite.
test("default capture is installed once, records server errors and can be uninstalled repeatedly", (t) => {
  const before = process.listenerCount("uncaughtExceptionMonitor");
  const uninstall = installServerLogCapture();
  t.after(uninstall);
  const again = installServerLogCapture({ source: "daemon" });
  assert.equal(isServerLogCaptureInstalled(), true);
  assert.equal(process.listenerCount("uncaughtExceptionMonitor"), before + 1);
  Reflect.apply(process.emit, process, ["uncaughtExceptionMonitor", new Error("process capture fixture"), "uncaughtException"]);
  const entry = readProcessServerLogs().entries.at(-1)!;
  assert.equal(entry.source, "server", "a second install must not replace the first source");
  assert.equal(entry.level, "error");
  assert.match(entry.message, /^\[uncaughtException\] Error: process capture fixture/);
  again();
  uninstall();
  assert.equal(isServerLogCaptureInstalled(), false);
  assert.equal(readProcessServerLogs({}).capturing, false);
  assert.equal(process.listenerCount("uncaughtExceptionMonitor"), before);
});

test("fatal capture never masks a failure while formatting the original error", (t) => {
  const uninstall = installServerLogCapture({});
  t.after(uninstall);
  const seq = getServerLogBuffer().entries().at(-1)?.seq ?? 0;
  const unformattable = { [inspect.custom]() { throw new Error("inspection failed"); } };
  assert.doesNotThrow(() => Reflect.apply(process.emit, process, ["uncaughtExceptionMonitor", unformattable, "uncaughtException"]));
  assert.equal(getServerLogBuffer().entries().at(-1)?.seq ?? 0, seq);
  Reflect.apply(process.emit, process, ["uncaughtExceptionMonitor", new Error("capture still works"), "uncaughtException"]);
  assert.equal(getServerLogBuffer().entries().at(-1)!.seq, seq + 1);
  assert.match(getServerLogBuffer().entries().at(-1)!.message, /^\[uncaughtException\] Error: capture still works/);
});

test("a second file attachment is ignored and repeated detach stops later persistence", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-process-logs-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "server.log");
  const ignored = path.join(dir, "ignored.log");
  const detach = attachServerLogFile({ filePath });
  t.after(detach);
  const again = attachServerLogFile({ filePath: ignored }, {});
  getServerLogBuffer().append({ level: "info", source: "server", message: "before process detach" });
  const saved = readFileSync(filePath, "utf8");
  assert.match(saved, /before process detach/);
  assert.equal(existsSync(ignored), false);
  assert.equal(readProcessServerLogs().capturing, true);
  again();
  detach();
  getServerLogBuffer().append({ level: "info", source: "server", message: "after process detach" });
  assert.equal(readFileSync(filePath, "utf8"), saved);
  assert.deepEqual(readProcessServerLogs().entries, getServerLogBuffer().entries());
});

test("file reads merge out-of-order timestamps stably and tolerate an absent companion file", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-process-logs-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const server = path.join(dir, "server.log");
  const daemon = path.join(dir, "daemon.log");
  const detach = attachServerLogFile({ filePath: server }, { alsoRead: [daemon, path.join(dir, "missing.log")] });
  t.after(detach);
  const row = (seq: number, at: string, source: "server" | "daemon", message: string) => ({ seq, at, source, level: "info", message });
  const early = row(2, "2026-10-01T00:00:00.000Z", "daemon", "early");
  const sameServer = row(3, "2026-10-02T00:00:00.000Z", "server", "same server");
  const sameDaemon = row(4, "2026-10-02T00:00:00.000Z", "daemon", "same daemon");
  const late = row(1, "2026-10-03T00:00:00.000Z", "server", "late");
  writeFileSync(server, [late, sameServer].map(entry => JSON.stringify(entry)).join("\n") + "\n");
  writeFileSync(daemon, [early, sameDaemon].map(entry => JSON.stringify(entry)).join("\n") + "\n");
  assert.deepEqual(readProcessServerLogs(), { entries: [early, sameServer, sameDaemon, late], capturing: true });
  rmSync(server);
  rmSync(daemon);
  assert.deepEqual(readProcessServerLogs(), { entries: [], capturing: false });
});
