/** `importSiteArchive`: the child process is faked, so each exit shape is proven without booting a CLI. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { importSiteArchive, stopRunningImports, tidyInterruptedImports } from "./site-archive-import.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** A fake child: the test pushes output and exits it. `exit` also closes stdio, as a real child does. */
function fakeChild() {
  const emitter = new EventEmitter();
  const child = {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), killed: [] as string[],
    once: (event: string, listener: (...args: never[]) => void) => { emitter.once(event, listener as never); return child; },
    kill: (signal?: string) => { child.killed.push(String(signal)); },
    exitOnly: (code: number | null) => emitter.emit("exit", code),
    close: (code: number | null) => emitter.emit("close", code),
    exit: (code: number | null) => { child.exitOnly(code); child.close(code); },
    fail: (error: Error) => emitter.emit("error", error),
  };
  const stdinText: string[] = [];
  child.stdin.on("data", (chunk) => stdinText.push(String(chunk)));
  return { child, stdinText };
}

const RESULT = JSON.stringify({ dir: "/d", name: "d", siteId: "i" });
const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

function run(source: Parameters<typeof importSiteArchive>[0]["source"], optional: { timeoutMs?: number; graceMs?: number; closeWaitMs?: number } = {}) {
  const fake = fakeChild();
  const spawned: { command: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const promise = importSiteArchive({ source, repoRoot: REPO_ROOT, cliMode: "source" }, {
    spawnFn: (command, args, options) => { spawned.push({ command, args, env: options.env }); return fake.child as never; },
    baseEnv: { PATH: "/usr/bin", TOVU_ADMIN_PASSWORD: "deployment-secret", TOVU_ADMIN_USER: "root" },
    ...optional,
  });
  return { ...fake, promise, spawned };
}

test("resolves the child's last output line, ignoring earlier chatter", async () => {
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  child.stdout.write("a library logged this first\n");
  child.stdout.write(`${JSON.stringify({ dir: "/s/site", name: "site", siteId: "id-1", warnings: ["kept off"] })}\n`);
  child.exit(0);
  assert.deepEqual(await promise, { dir: "/s/site", name: "site", siteId: "id-1", warnings: ["kept off"] });
});

test("sends the source on stdin, never argv, and gives the child no deployment credential", async () => {
  const { child, promise, spawned, stdinText } = run({ url: "https://example.com/x.tovu.zip?token=SECRET" });
  child.stdout.write(`${JSON.stringify({ dir: "/d", name: "d", siteId: "i" })}\n`);
  child.exit(0);
  assert.deepEqual((await promise).warnings, []);
  assert.deepEqual(JSON.parse(stdinText.join("")), { url: "https://example.com/x.tovu.zip?token=SECRET" });
  assert.equal(stdinText.join("").endsWith("\n"), true, "one line, so the child can read it without waiting for the end of stdin");
  assert.equal(spawned[0]!.args.join(" ").includes("SECRET"), false);
  assert.equal(spawned[0]!.args.at(-1), "import-local");
  assert.equal("TOVU_ADMIN_PASSWORD" in spawned[0]!.env, false);
  assert.equal("TOVU_ADMIN_USER" in spawned[0]!.env, false);
});

test("a VALIDATION refusal reaches the person in the importer's own words", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  child.stderr.write("tovu: VALIDATION: ZIP size or SHA-256 mismatch.\n");
  child.exit(1);
  await assert.rejects(promise, { message: "ZIP size or SHA-256 mismatch." });
});

test("any other failure says no website was made and keeps the details for copying", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  child.stderr.write("tovu: INTERNAL: disk full\n");
  child.exit(1);
  await assert.rejects(promise, { message: "The import stopped before it finished. No website was created. Details: INTERNAL: disk full" });
});

test("a child that dies with no error line reports its exit code and stderr tail", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  child.stderr.write("segfault-ish noise");
  child.exit(139);
  await assert.rejects(promise, { message: /exit code 139: segfault-ish noise/ });
});

test("a result that is not the expected shape is refused with a way forward", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  child.stdout.write("{\"unexpected\":true}\n");
  child.exit(0);
  await assert.rejects(promise, { message: /did not report where the new website is\. Use Rescan/ });
});

test("a child that runs past the deadline is asked to stop, then killed, and the person is told", async () => {
  const { child, promise } = run({ file: "/a.zip" }, { timeoutMs: 5, graceMs: 15 });
  await tick(10);
  assert.equal(child.stdin.writableEnded, true, "closing stdin is the stop request");
  assert.deepEqual(child.killed, []);
  await tick(40);
  assert.deepEqual(child.killed, ["SIGKILL"], "a child stuck on a read that never returns must not hold the page forever");
  child.exit(null);
  await assert.rejects(promise, { message: /took too long and was stopped\. No website was created/ });
});

test("a child that cannot start rejects with the spawn error", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  child.fail(new Error("spawn ENOENT"));
  await assert.rejects(promise, { message: "spawn ENOENT" });
});

test("stdin stays open while the import runs, because its closing is what stops the child", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  await tick(5);
  assert.equal(child.stdin.writableEnded, false);
  child.stdout.write(`${RESULT}\n`);
  child.exit(0);
  await promise;
});

test("quitting closes stdin, sends no signal, waits for the exit, and the import fails in plain words", async () => {
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  const settled = promise.then(() => "resolved", (error: Error) => error.message);
  const stopped = stopRunningImports();
  assert.equal(child.stdin.writableEnded, true);
  assert.deepEqual(child.killed, [], "SIGTERM cannot run the child's cleanup on Windows");
  let done = false;
  void stopped.then(() => { done = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, false, "must wait for the child to finish removing its partial site");
  child.exit(1);
  await stopped;
  assert.match(String(await settled), /Tovu was closing\. No website was created/);
});

test("stopping when nothing is importing resolves at once, and a finished import is no longer tracked", async () => {
  await stopRunningImports();
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  child.stdout.write(`${RESULT}\n`);
  child.exit(0);
  await promise;
  await stopRunningImports();
  assert.deepEqual(child.killed, []);
  assert.equal(child.stdin.writableEnded, false, "a finished import is not stopped");
});

test("a child that ignores the stop is killed after the grace period", async () => {
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  void promise.catch(() => undefined);
  const stopped = stopRunningImports({}, { graceMs: 5 });
  await tick();
  assert.deepEqual(child.killed, ["SIGKILL"]);
  child.exit(null);
  await stopped;
});

test("a child that exits in time is not killed afterwards", async () => {
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  void promise.catch(() => undefined);
  const stopped = stopRunningImports({}, { graceMs: 5 });
  child.exit(1);
  await stopped;
  await tick();
  assert.deepEqual(child.killed, []);
});

test("an import that finished as the stop arrived still returns its site: it exists on disk", async () => {
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  const stopped = stopRunningImports();
  child.stdout.write(`${RESULT}\n`);
  child.exit(0);
  await stopped;
  assert.equal((await promise).siteId, "i");
});

test("Cancel resolves with no site, and a second stop reason does not change that", async () => {
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  const stopped = stopRunningImports({}, { reason: "cancel" });
  void stopRunningImports();
  child.exit(1);
  await stopped;
  assert.equal(await promise, null);
});

test("output that arrives between exit and close is still read", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  child.exitOnly(0);
  child.stdout.write(`${RESULT}\n`);
  await tick(5);
  child.close(0);
  assert.equal((await promise).siteId, "i");
});

test("a refusal that arrives between exit and close is not lost", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  child.exitOnly(1);
  child.stderr.write("tovu: VALIDATION: ZIP size or SHA-256 mismatch.\n");
  await tick(5);
  child.close(1);
  await assert.rejects(promise, { message: "ZIP size or SHA-256 mismatch." });
});

test("a grandchild that holds stdout open cannot keep the import pending after the child exits", async () => {
  const { child, promise } = run({ file: "/a.zip" }, { closeWaitMs: 5 });
  child.stdout.write(`${RESULT}\n`);
  await tick(1);
  child.exitOnly(0);
  assert.equal((await promise).siteId, "i");
});

for (const [name, files, spawns] of [
  ["a clean launch starts no child", ["0.json", "readme.txt"], 0],
  ["a missing folder starts no child", null, 0],
  ["a leftover stage starts one tidy request", ["0.stage"], 1],
  ["a leftover upload starts one tidy request", ["0.upload.zip", "1.upload.zip"], 1],
] as const) test(`startup tidy: ${name}`, async () => {
  const fake = fakeChild();
  const spawned: string[][] = [];
  const done = tidyInterruptedImports({ appData: "/profile", repoRoot: REPO_ROOT, cliMode: "source" }, {
    readDir: (dir: string) => { if (dir === tmpdir()) return []; assert.equal(dir, path.join("/profile", "site-imports", "local")); if (files === null) throw new Error("ENOENT"); return [...files]; },
    spawnFn: (_command, args) => { spawned.push(args); return fake.child as never; },
    baseEnv: { PATH: "/usr/bin" },
  });
  await tick(1);
  if (spawns) {
    assert.deepEqual(JSON.parse(fake.stdinText.join("")), { tidy: true });
    fake.child.exit(0);
  }
  await done;
  assert.equal(spawned.length, spawns);
});

test("startup tidy never fails the launch: a child that fails is only ignored", async () => {
  const fake = fakeChild();
  const done = tidyInterruptedImports({ appData: "/profile", repoRoot: REPO_ROOT, cliMode: "source" }, { readDir: () => ["0.stage"], spawnFn: () => fake.child as never, baseEnv: { PATH: "/usr/bin" } });
  await tick(1);
  fake.child.exit(1);
  await done;
});


for (const missing of [false, true]) test(`startup tidy checks database temp folders when the registry is ${missing ? "missing" : "clean"}`, async () => {
  const fake = fakeChild();
  const reads: string[] = [];
  let spawns = 0;
  const done = tidyInterruptedImports({ appData: "/profile", repoRoot: REPO_ROOT, cliMode: "source" }, {
    readDir: dir => {
      reads.push(dir);
      if (dir === tmpdir()) return ["tovu-import-db-example"];
      if (missing) throw new Error("ENOENT");
      return ["0.json"];
    },
    spawnFn: () => { spawns++; return fake.child as never; },
    baseEnv: { PATH: "/usr/bin" },
  });
  await tick(1);
  try {
    assert.equal(spawns, 1);
    assert.deepEqual(reads, [path.join("/profile", "site-imports", "local"), tmpdir()]);
    assert.deepEqual(JSON.parse(fake.stdinText.join("")), { tidy: true });
  } finally { fake.child.exit(0); await done; }
});
