/** `importSiteArchive`: the child process is faked, so each exit shape is proven without booting a CLI. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { importSiteArchive, stopRunningImports } from "./site-archive-import.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** A fake child: the test pushes output and exits it. */
function fakeChild() {
  const emitter = new EventEmitter();
  const child = {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), killed: [] as string[],
    once: (event: string, listener: (...args: never[]) => void) => { emitter.once(event, listener as never); return child; },
    kill: (signal?: string) => { child.killed.push(String(signal)); },
    exit: (code: number | null) => emitter.emit("exit", code),
    fail: (error: Error) => emitter.emit("error", error),
  };
  const stdinText: string[] = [];
  child.stdin.on("data", (chunk) => stdinText.push(String(chunk)));
  return { child, stdinText };
}

function run(source: Parameters<typeof importSiteArchive>[0]["source"], optional: { timeoutMs?: number } = {}) {
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

test("a child that runs past the deadline is stopped and the person is told", async () => {
  const { child, promise } = run({ file: "/a.zip" }, { timeoutMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(child.killed, ["SIGTERM"]);
  child.exit(null);
  await assert.rejects(promise, { message: /took too long and was stopped\. No website was created/ });
});

test("a child that cannot start rejects with the spawn error", async () => {
  const { child, promise } = run({ file: "/a.zip" });
  child.fail(new Error("spawn ENOENT"));
  await assert.rejects(promise, { message: "spawn ENOENT" });
});

test("quitting stops a running import with SIGTERM, waits for it to exit, and the import fails in plain words", async () => {
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  const settled = promise.then(() => "resolved", (error: Error) => error.message);
  const stopped = stopRunningImports();
  assert.deepEqual(child.killed, ["SIGTERM"]);
  let done = false;
  void stopped.then(() => { done = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(done, false, "must wait for the child to finish removing its partial site");
  child.exit(1);
  await stopped;
  assert.match(String(await settled), /stopped|quit/i);
});

test("stopping when nothing is importing resolves at once, and a finished import is no longer tracked", async () => {
  await stopRunningImports();
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  child.stdout.write(`${JSON.stringify({ dir: "/d", name: "d", siteId: "i" })}\n`);
  child.exit(0);
  await promise;
  await stopRunningImports();
  assert.deepEqual(child.killed, []);
});

test("a child that ignores SIGTERM is killed after the grace period", async () => {
  const { child, promise } = run({ file: "/a/b.tovu.zip" });
  void promise.catch(() => undefined);
  const stopped = stopRunningImports({}, { graceMs: 5 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(child.killed, ["SIGTERM", "SIGKILL"]);
  child.exit(null);
  await stopped;
});
