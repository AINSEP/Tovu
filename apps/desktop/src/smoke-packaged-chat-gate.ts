/**
 * @file The effect-wiring half of `scripts/smoke-packaged-chat.ts` — the owner's local, model-backed
 * release gate, run after packaging/notarization and before a draft is created. It uses only the
 * shipped server and the shipped native SQLite module, requires a logged-in Claude CLI on the
 * owner's Mac, and never mirrors child output, response bodies, cookies, tokens, or transcript
 * evidence.
 *
 * `./smoke-packaged-chat.ts` owns the gate's DECISIONS (server plan, model choice, evidence
 * assertions, teardown ordering). This module owns the ADAPTERS those decisions run against: the
 * shared test lock, the scratch home, process-group teardown, the authenticated HTTP session, and
 * reading evidence with the packaged SQLite. Every OS, network, clock and child-process effect is an
 * injected {@link ChatGateDeps} member; the script binds the real ones.
 */
import path from "node:path";
import { Writable } from "node:stream";
import type { ChildProcess, SpawnOptions, SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";
import type * as platformProcess from "@jini-ai/platform/process";

import { PackagedGateIsolationError } from "./packaged-gate-isolation.ts";
import type { withIsolatedSmokeTargets } from "./packaged-gate-isolation.ts";
import type { initSiteDir } from "./site-dir-store.ts";
import type { resolveSmokeTargets } from "./smoke-native.ts";
import { buildPackagedChatServerPlan, PackagedChatSmokeError, readPackagedChatModel, runPackagedChatSmoke,
  signalPackagedChatGroup, PACKAGED_CHAT_PROMPT } from "./smoke-packaged-chat.ts";
import type { PackagedChatEvidence, PackagedChatSmokePorts } from "./smoke-packaged-chat.ts";
import type { allocatePort, buildServeEnv, startTovuServer } from "./tovu-server.ts";

type SmokeTargets = ReturnType<typeof resolveSmokeTargets>;
type ProcessSnapshot = Awaited<ReturnType<typeof platformProcess.listProcessSnapshots>>[number];

/** The `node:fs/promises` surface the gate uses. */
interface GateFs {
  mkdir(target: string, options?: { recursive?: boolean }): Promise<unknown>;
  mkdtemp(prefix: string): Promise<string>;
  readFile(target: string, encoding: "utf8"): Promise<string>;
  readdir(target: string): Promise<string[]>;
  rm(target: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  symlink(target: string, linkPath: string): Promise<void>;
  writeFile(target: string, data: string): Promise<void>;
}

/** Every effect the gate performs. The script binds node's own modules and `process`. */
interface ChatGateDeps {
  desktopRoot: string;
  /** `ADS-memory/.local-artifacts`, where the machine-wide `test-lock` directory lives. */
  scratchRoot: string;
  argv: readonly string[];
  platform: NodeJS.Platform;
  pid: number;
  env: NodeJS.ProcessEnv;
  /** Aborted on SIGINT/SIGTERM; every wait and request observes it. */
  signal: AbortSignal;
  fs: GateFs;
  userInfo(): { homedir: string };
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcess;
  spawnSync(command: string, args: string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string>;
  kill: typeof process.kill;
  fetch: typeof fetch;
  delay(ms: number, value?: undefined, options?: { signal?: AbortSignal }): Promise<unknown>;
  setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(handle: NodeJS.Timeout | undefined): void;
  randomUUID(): string;
  processes: Pick<typeof platformProcess, "collectProcessTreePids" | "listProcessSnapshots" | "stopProcesses">;
  allocatePort: typeof allocatePort;
  buildServeEnv: typeof buildServeEnv;
  startTovuServer: typeof startTovuServer;
  initSiteDir: typeof initSiteDir;
  resolveSmokeTargets: typeof resolveSmokeTargets;
  withIsolatedSmokeTargets: typeof withIsolatedSmokeTargets;
  stdout: { write(text: string): unknown };
  stderr: { write(text: string): unknown };
}

/** Mutable per-run HTTP state: set by `start`/`chat`, read by every request. */
interface ChatSession {
  origin: string;
  bootToken: string;
  cookie: string;
  requestSignal: AbortSignal;
  runTimer?: NodeJS.Timeout;
}

/** Everything one gate run's adapters share. */
interface GateContext {
  deps: ChatGateDeps;
  targets: SmokeTargets;
  gateEnv: NodeJS.ProcessEnv;
  session: ChatSession;
}

const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;

/** Atomic mkdir interoperates with the machine's shell-based test runners; never steal a lock. */
async function acquireLock(deps: ChatGateDeps): Promise<() => Promise<void>> {
  const lockPath = path.join(deps.scratchRoot, "test-lock");
  const release = () => deps.fs.rm(lockPath, { recursive: true, force: true });
  await deps.fs.mkdir(deps.scratchRoot, { recursive: true });
  while (true) {
    deps.signal.throwIfAborted();
    try { await deps.fs.mkdir(lockPath); break; }
    catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      await deps.delay(1_000, undefined, { signal: deps.signal });
    }
  }
  try { await deps.fs.writeFile(path.join(lockPath, "owner"), `smoke-packaged-chat ${deps.pid}\n`); }
  catch (error) { await release(); throw error; }
  return release;
}

/** Check the whole POSIX group, including descendants surviving an early server exit. */
function groupAlive(deps: ChatGateDeps, pid: number): boolean {
  try { deps.kill(-pid, 0); return true; }
  catch (error) {
    if (errorCode(error) === "ESRCH") return false;
    // macOS answers EPERM for a group whose members are all zombies (0.1.18's gate run hit it), so
    // ask ps whether any live member is left instead of failing the teardown.
    if (errorCode(error) === "EPERM") return liveGroupMember(deps, pid);
    throw error;
  }
}

function liveGroupMember(deps: ChatGateDeps, pgid: number): boolean {
  const ps = deps.spawnSync("ps", ["-axo", "pgid=,stat="], { encoding: "utf8" });
  if (ps.status !== 0) throw new PackagedChatSmokeError("Could not list processes to verify teardown.");
  return ps.stdout.split("\n").some(line => {
    const [group, stat] = line.trim().split(/\s+/);
    return Number(group) === pgid && !stat?.startsWith("Z");
  });
}

/** The daemon owns a separate process group. Its private scratch registry survives parent death. */
async function findDaemonRoot(deps: ChatGateDeps, snapshots: ProcessSnapshot[], siteDir: string):
  Promise<{ pid?: number; registryFailed: boolean }> {
  try {
    const registry = JSON.parse(await deps.fs.readFile(path.join(siteDir, "ops/assistant-daemon.json"), "utf8")) as { pid: number };
    const daemon = snapshots.find(item => item.pid === registry.pid);
    const isDaemon = daemon && /(?:^|[ /])agent-daemon-server\.js(?:\s|$)/.test(daemon.command);
    return { pid: isDaemon ? daemon.pid : undefined, registryFailed: false };
  } catch (error) { return { registryFailed: errorCode(error) !== "ENOENT" }; }
}

/** SIGTERM, then SIGKILL, each followed by a bounded wait for the whole group to exit. */
async function signalGroupUntilGone(deps: ChatGateDeps, pid: number): Promise<void> {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    if (!groupAlive(deps, pid)) return;
    signalPackagedChatGroup({ pid, signal, kill: deps.kill });
    for (let attempt = 0; attempt < 50; attempt++) {
      if (!groupAlive(deps, pid)) return;
      await deps.delay(100);
    }
  }
  throw new PackagedChatSmokeError("Packaged server process group survived teardown.");
}

/** SIGTERM permits the server's own daemon/CLI drain; SIGKILL is a bounded final backstop. */
async function stopGroup(deps: ChatGateDeps, pid: number, siteDir: string): Promise<void> {
  const snapshots = await deps.processes.listProcessSnapshots();
  const daemon = await findDaemonRoot(deps, snapshots, siteDir);
  const pids = deps.processes.collectProcessTreePids(snapshots, daemon.pid === undefined ? [pid] : [pid, daemon.pid]);
  try {
    await signalGroupUntilGone(deps, pid);
  } finally {
    const stopped = await deps.processes.stopProcesses(pids);
    if (daemon.registryFailed || stopped.remainingPids.length || !snapshots.some(item => item.pid === deps.pid)) {
      throw new PackagedChatSmokeError("Packaged process tree teardown could not be verified.");
    }
  }
}

/** Keep all raw boot/daemon output private, including diagnostics that could echo credentials. */
function silentStream(): Writable {
  return new Writable({ write(_chunk, _encoding, callback) { callback(); } });
}

/** `--platform-dir` names either the parent of `mac*` outputs or one `mac*` directory itself. */
async function resolveGateTargets(deps: ChatGateDeps): Promise<SmokeTargets> {
  // This is the owner's local gate, not a CI/Windows handshake smoke (Layer 2).
  if (deps.platform !== "darwin") throw new PackagedChatSmokeError("Packaged chat smoke requires the owner's Mac and a logged-in Claude CLI.");
  const flag = deps.argv.indexOf("--platform-dir");
  const value = flag < 0 ? undefined : deps.argv[flag + 1];
  if (!value || value.startsWith("--")) throw new PackagedChatSmokeError("Usage: npm run smoke:packaged-chat -- --platform-dir release/mac-arm64");
  const platformDir = path.resolve(deps.desktopRoot, value);
  // resolveSmokeTargets expects the parent of mac*; accept an individual mac* directory as well
  // so a release folder containing both CPU builds never silently tests the wrong one.
  const entries = await deps.fs.readdir(platformDir);
  if (entries.includes("Tovu.app")) return deps.resolveSmokeTargets(path.dirname(platformDir), [path.basename(platformDir)]);
  if (entries.filter(entry => entry.startsWith("mac")).length > 1) {
    throw new PackagedChatSmokeError("Choose a single native mac* output with --platform-dir.");
  }
  return deps.resolveSmokeTargets(platformDir, entries);
}

/** A scratch HOME for every Tovu/CLI write; on macOS it borrows only the user's Keychains. */
async function prepareGateHome(deps: ChatGateDeps, directory: string): Promise<NodeJS.ProcessEnv> {
  // withIsolatedSmokeTargets removes this profile with the copied app after all children stop.
  const homeDir = path.join(directory, "home");
  await deps.fs.mkdir(path.join(homeDir, "Documents"), { recursive: true });
  if (deps.platform === "darwin") {
    // Claude CLI login lives in the user's Keychain; everything Tovu writes stays in the temp home.
    const libraryDir = path.join(homeDir, "Library");
    await deps.fs.mkdir(libraryDir, { recursive: true });
    await deps.fs.symlink(path.join(deps.userInfo().homedir, "Library", "Keychains"), path.join(libraryDir, "Keychains"));
  }
  return { ...deps.env,
    HOME: homeDir, USERPROFILE: homeDir,
    APPDATA: path.join(homeDir, "AppData", "Roaming"),
    XDG_DATA_HOME: path.join(homeDir, ".local", "share"),
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    TOVU_DESKTOP_USER_DATA_DIR: path.join(homeDir, "desktop-profile"),
    TOVU_SITES_HOME: path.join(homeDir, "Documents", "Tovu"), TOVU_SITE_ROOTS: "",
  };
}

/** One authenticated request; any status but `expected` is a fixed, body-free diagnostic. */
async function request(ctx: GateContext, route: string, { method = "GET", body, expected = 200 }: {
  method?: string; body?: unknown; expected?: number;
} = {}): Promise<Response> {
  const { session } = ctx;
  const response = await ctx.deps.fetch(new URL(route, session.origin), { method,
    headers: { "content-type": "application/json", origin: session.origin, ...(session.cookie ? { cookie: session.cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.any([session.requestSignal, AbortSignal.timeout(15_000)]), redirect: "error" });
  if (response.status !== expected) {
    await response.body?.cancel();
    throw new PackagedChatSmokeError(`Packaged chat HTTP ${response.status} at ${route.split("?")[0]}.`);
  }
  return response;
}

/** The boot line precedes daemon startup and its background CLI inventory discovery. */
async function waitForClaudeModel(ctx: GateContext): Promise<string | undefined> {
  const { session } = ctx;
  for (let attempt = 0; attempt < 60; attempt++) {
    session.requestSignal.throwIfAborted();
    const response = await ctx.deps.fetch(new URL("/api/agents", session.origin), {
      headers: { cookie: session.cookie }, signal: AbortSignal.any([session.requestSignal, AbortSignal.timeout(15_000)]) });
    const model = await readPackagedChatModel({ response });
    if (model !== undefined) return model;
    await ctx.deps.delay(500, undefined, { signal: session.requestSignal });
  }
  return undefined;
}

async function waitForRunSuccess(ctx: GateContext, runId: string): Promise<string> {
  while (true) {
    const status = await (await request(ctx, `/api/runs/${encodeURIComponent(runId)}`)).json() as { run: { state: string } };
    if (status.run.state === "succeeded") return runId;
    if (["failed", "cancelled"].includes(status.run.state)) throw new PackagedChatSmokeError("The packaged Claude run failed or was canceled.");
    await ctx.deps.delay(500, undefined, { signal: ctx.session.requestSignal });
  }
}

/** Read with the shipped Electron ABI and shipped SQLite, never the checkout's native module. */
function readEvidence(ctx: GateContext, siteDir: string, runId: string): PackagedChatEvidence | null {
  const script = `const Database = require(${JSON.stringify(path.join(ctx.targets.nodeModulesDir, "better-sqlite3"))});
      const db = new Database(${JSON.stringify(path.join(siteDir, "data.nosync/chat.db"))}, { readonly: true });
      try { console.log(JSON.stringify(db.prepare(\`SELECT m.run_id, m.run_status, m.content,
        a.attempt_base_json, m.events_json FROM assistant_run_attempts a
        JOIN ai_chat_messages m ON m.id = a.message_id WHERE m.run_id = ?\`).get(${JSON.stringify(runId)}) ?? null)); }
      finally { db.close(); }`;
  const result = ctx.deps.spawnSync(ctx.targets.executablePath, ["-e", script], {
    env: { ...ctx.gateEnv, ELECTRON_RUN_AS_NODE: "1" },
    cwd: siteDir, encoding: "utf8", timeout: 10_000, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new PackagedChatSmokeError("Unable to read chat.db with packaged SQLite.");
  try { return JSON.parse(result.stdout) as PackagedChatEvidence | null; }
  catch { throw new PackagedChatSmokeError("Packaged SQLite returned invalid evidence JSON."); }
}

/** Boot the shipped server against a fresh scratch site; partial-start children are torn down here. */
async function startServer(ctx: GateContext, siteDir: string): Promise<{ stop(): Promise<void> }> {
  const { deps, targets, session } = ctx;
  const payloadRoot = path.dirname(targets.nodeModulesDir);
  // serve's public contract rejects 0. Use the shell's existing free-port allocator.
  const port = await deps.allocatePort();
  const plan = buildPackagedChatServerPlan({ ...targets, siteDir, port,
    serveEnv: deps.buildServeEnv({ repoRoot: payloadRoot, siteDir, baseEnv: ctx.gateEnv }, { warn() {} }) });
  let childPid: number | undefined;
  try {
    // serve validates a real site; an empty mkdtemp directory needs the shipped init first.
    await deps.initSiteDir({ repoRoot: payloadRoot, dir: siteDir, cliMode: "compiled", baseEnv: plan.env,
      adminPassword: deps.randomUUID(),
      spawnFn(_command, args, options) {
        const child = deps.spawn(plan.command, args, { ...options, cwd: siteDir, detached: true,
          stdio: "pipe", timeout: 60_000, killSignal: "SIGKILL", signal: deps.signal });
        childPid = child.pid;
        return child;
      },
    });
    if (childPid !== undefined) await stopGroup(deps, childPid, siteDir);
    childPid = undefined;
    const server = await deps.startTovuServer({ repoRoot: payloadRoot, siteDir, port, cliMode: "compiled",
      emitBootToken: true, baseEnv: plan.env, mirror: { stdout: silentStream(), stderr: silentStream() },
      spawnFn(_command, _args, options) {
        const child = deps.spawn(plan.command, plan.args, { ...options, cwd: siteDir });
        childPid = child.pid;
        return child;
      },
    });
    if (!server.bootToken) throw new PackagedChatSmokeError("Packaged server emitted no boot token.");
    deps.signal.throwIfAborted();
    session.origin = server.origin;
    session.bootToken = server.bootToken;
    return { async stop() {
      // Parent exit alone proves nothing about the detached daemon and its CLI children.
      await stopGroup(deps, server.pid, siteDir);
      await server.stop();
    } };
  } catch (error) {
    if (childPid !== undefined) await stopGroup(deps, childPid, siteDir);
    throw error;
  }
}

/** Redeem the boot token, wait for Claude, start one run, and wait for it to succeed. */
async function chat(ctx: GateContext): Promise<string> {
  const { deps, session } = ctx;
  const deadline = new AbortController();
  session.runTimer = deps.setTimeout(() => deadline.abort(), 180_000);
  session.requestSignal = AbortSignal.any([deps.signal, deadline.signal]);
  const auth = await request(ctx, "/api/admin/v1/auth/boot-session", { method: "POST", body: { token: session.bootToken } });
  session.cookie = auth.headers.getSetCookie().map(item => item.split(";")[0]).join("; ");
  await auth.body?.cancel();
  if (!session.cookie) throw new PackagedChatSmokeError("Boot-session redemption set no session cookie.");
  const model = await waitForClaudeModel(ctx);
  if (!model) throw new PackagedChatSmokeError("Packaged Claude discovery did not become ready.");
  const conversation = await (await request(ctx, "/api/assistant/chats", { method: "POST", body: {}, expected: 201 })).json() as { conversation: { id: string } };
  const contextRef = JSON.stringify({ prompt: PACKAGED_CHAT_PROMPT, model,
    conversationId: conversation.conversation.id, assistantMessageId: deps.randomUUID(),
    userMessage: { id: deps.randomUUID(), role: "user", content: PACKAGED_CHAT_PROMPT, createdAt: Date.now() } });
  const accepted = await (await request(ctx, "/api/runs", { method: "POST", expected: 201,
    body: { agentId: "claude", contextRef } })).json() as { run: { id: string } };
  return waitForRunSuccess(ctx, accepted.run.id);
}

/** The durable finalizer settles asynchronously after the daemon publishes its terminal state. */
async function settledEvidence(ctx: GateContext, siteDir: string, runId: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    ctx.session.requestSignal.throwIfAborted();
    const row = readEvidence(ctx, siteDir, runId);
    if (row && !["queued", "running"].includes(row.run_status)) {
      const daemonLog = await ctx.deps.fs.readFile(path.join(siteDir, "ops/logs/daemon.log"), "utf8");
      return { row, daemonLog };
    }
    await ctx.deps.delay(250, undefined, { signal: ctx.session.requestSignal });
  }
  throw new PackagedChatSmokeError("The smoke run did not settle in chat.db.");
}

/** The plugin package store writes read-only directories, which rm alone cannot empty. */
async function removeSite(deps: ChatGateDeps, siteDir: string): Promise<void> {
  const chmod = deps.spawnSync("chmod", ["-R", "u+w", siteDir], { encoding: "utf8" });
  if (chmod.status !== 0) throw new PackagedChatSmokeError("Could not make the temporary site writable.");
  await deps.fs.rm(siteDir, { recursive: true, force: true });
}

/** One full gate inside the isolated copy of the packaged app at `directory`. */
async function runGate(deps: ChatGateDeps, targets: SmokeTargets, directory: string): Promise<void> {
  const ctx: GateContext = { deps, targets, gateEnv: await prepareGateHome(deps, directory),
    session: { origin: "", bootToken: "", cookie: "", requestSignal: deps.signal } };
  const ports: PackagedChatSmokePorts = {
    acquireLock: () => acquireLock(deps),
    createSite: () => deps.fs.mkdtemp(path.join(directory, "packaged-chat-")),
    start: (siteDir) => startServer(ctx, siteDir),
    chat: () => chat(ctx),
    evidence: (siteDir, runId) => settledEvidence(ctx, siteDir, runId),
    removeSite: (siteDir) => removeSite(deps, siteDir),
  };
  try {
    await runPackagedChatSmoke({ ports });
  } finally { deps.clearTimeout(ctx.session.runTimer); }
  deps.stdout.write("smoke-packaged-chat: PASS (jini connected, site_guide overview returned, DONE; teardown complete)\n");
}

/** Only our fixed diagnostics are safe to print. Upstream errors may contain raw child output. */
function safeDiagnostic(item: unknown): string {
  return item instanceof PackagedChatSmokeError || item instanceof PackagedGateIsolationError
    ? item.message
    : "Gate or teardown failed; no draft may be created.";
}

/**
 * Run the whole gate and report it.
 *
 * @returns 0 after a PASS (evidence verified and every resource torn down), 1 after printing one
 *   fixed `smoke-packaged-chat:` diagnostic per failure.
 */
export async function smokePackagedChatCli(deps: ChatGateDeps): Promise<0 | 1> {
  try {
    const targets = await resolveGateTargets(deps);
    await deps.withIsolatedSmokeTargets({ targets, run: (isolated, directory) => runGate(deps, isolated, directory) });
    return 0;
  } catch (error) {
    const errors: unknown[] = error instanceof AggregateError ? error.errors : [error];
    for (const item of errors) deps.stderr.write(`smoke-packaged-chat: ${safeDiagnostic(item)}\n`);
    return 1;
  }
}

/**
 * Abort `run`'s signal on SIGINT/SIGTERM, and always detach both handlers once it settles.
 *
 * @param input.events the `process`-shaped emitter the signals arrive on.
 */
export async function withInterruptSignal<T>(
  { events }: { events: { on(event: NodeJS.Signals, listener: () => void): unknown; off(event: NodeJS.Signals, listener: () => void): unknown } },
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  events.on("SIGINT", interrupt);
  events.on("SIGTERM", interrupt);
  try {
    return await run(controller.signal);
  } finally {
    events.off("SIGINT", interrupt);
    events.off("SIGTERM", interrupt);
  }
}

export type { ChatGateDeps, GateFs };
