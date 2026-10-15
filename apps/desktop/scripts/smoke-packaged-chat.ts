#!/usr/bin/env node
/** Local, model-backed release gate. Run after packaging/notarization and before creating a draft.
 * Uses only the shipped server/native SQLite module; requires a logged-in Claude CLI on this Mac.
 * Never mirrors child output, response bodies, cookies, tokens, or transcript evidence.
 */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { Writable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { collectProcessTreePids, listProcessSnapshots, stopProcesses } from "@jini-ai/platform/process";
import { resolveSmokeTargets } from "../src/smoke-native.ts";
import { allocatePort, buildServeEnv, startTovuServer } from "../src/tovu-server.ts";
import { initSiteDir } from "../src/site-dir-store.ts";
import { buildPackagedChatServerPlan, PackagedChatSmokeError,
  runPackagedChatSmoke, selectPackagedChatModel, PACKAGED_CHAT_PROMPT } from "../src/smoke-packaged-chat.ts";
import type { PackagedChatEvidence } from "../src/smoke-packaged-chat.ts";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const scratchRoot = path.join(repoRoot, "ADS-memory/.local-artifacts");
const lockPath = path.join(scratchRoot, "test-lock");
const controller = new AbortController();
const interrupt = () => controller.abort();
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

/** Atomic mkdir interoperates with the machine's shell-based test runners; never steal a lock. */
async function acquireLock(): Promise<() => Promise<void>> {
  await mkdir(scratchRoot, { recursive: true });
  while (true) {
    controller.signal.throwIfAborted();
    try { await mkdir(lockPath); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await delay(1_000, undefined, { signal: controller.signal });
    }
  }
  try { await writeFile(path.join(lockPath, "owner"), `smoke-packaged-chat ${process.pid}\n`); }
  catch (error) { await rm(lockPath, { recursive: true, force: true }); throw error; }
  return () => rm(lockPath, { recursive: true, force: true });
}

/** Check the whole POSIX group, including descendants surviving an early server exit. */
function groupAlive(pid: number): boolean {
  try { process.kill(-pid, 0); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    // macOS answers EPERM for a group whose members are all zombies (0.1.18's gate run hit it), so
    // ask ps whether any live member is left instead of failing the teardown.
    if ((error as NodeJS.ErrnoException).code === "EPERM") return liveGroupMember(pid);
    throw error;
  }
}

function liveGroupMember(pgid: number): boolean {
  const ps = spawnSync("ps", ["-axo", "pgid=,stat="], { encoding: "utf8" });
  if (ps.status !== 0) throw new PackagedChatSmokeError("Could not list processes to verify teardown.");
  return ps.stdout.split("\n").some(line => {
    const [group, stat] = line.trim().split(/\s+/);
    return Number(group) === pgid && !stat?.startsWith("Z");
  });
}

/** The daemon owns a separate process group. Its private scratch registry survives parent death. */
async function findDaemonRoot(snapshots: Awaited<ReturnType<typeof listProcessSnapshots>>, siteDir: string):
  Promise<{ pid?: number; registryFailed: boolean }> {
  try {
    const registry = JSON.parse(await readFile(path.join(siteDir, "ops/assistant-daemon.json"), "utf8")) as { pid: number };
    const daemon = snapshots.find(item => item.pid === registry.pid);
    const isDaemon = daemon && /(?:^|[ /])agent-daemon-server\.js(?:\s|$)/.test(daemon.command);
    return { pid: isDaemon ? daemon.pid : undefined, registryFailed: false };
  } catch (error) { return { registryFailed: (error as NodeJS.ErrnoException).code !== "ENOENT" }; }
}

/** SIGTERM, then SIGKILL, each followed by a bounded wait for the whole group to exit. */
async function signalGroupUntilGone(pid: number): Promise<void> {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    if (!groupAlive(pid)) return;
    try { process.kill(-pid, signal); }
    catch (error) { if (!["ESRCH", "EPERM"].includes(String((error as NodeJS.ErrnoException).code))) throw error; }
    for (let attempt = 0; attempt < 50; attempt++) {
      if (!groupAlive(pid)) return;
      await delay(100);
    }
  }
  throw new PackagedChatSmokeError("Packaged server process group survived teardown.");
}

/** SIGTERM permits the server's own daemon/CLI drain; SIGKILL is a bounded final backstop. */
async function stopGroup(pid: number, siteDir: string): Promise<void> {
  const snapshots = await listProcessSnapshots();
  const daemon = await findDaemonRoot(snapshots, siteDir);
  const pids = collectProcessTreePids(snapshots, daemon.pid === undefined ? [pid] : [pid, daemon.pid]);
  try {
    await signalGroupUntilGone(pid);
  } finally {
    const stopped = await stopProcesses(pids);
    if (daemon.registryFailed || stopped.remainingPids.length || !snapshots.some(item => item.pid === process.pid)) {
      throw new PackagedChatSmokeError("Packaged process tree teardown could not be verified.");
    }
  }
}

/** Keep all raw boot/daemon output private, including diagnostics that could echo credentials. */
function silentStream(): Writable {
  return new Writable({ write(_chunk, _encoding, callback) { callback(); } });
}

async function main(): Promise<void> {
  // This is the owner's local gate, not a CI/Windows handshake smoke (Layer 2).
  if (process.platform !== "darwin") throw new PackagedChatSmokeError("Packaged chat smoke requires the owner's Mac and a logged-in Claude CLI.");
  const flag = process.argv.indexOf("--platform-dir");
  const value = flag < 0 ? undefined : process.argv[flag + 1];
  if (!value || value.startsWith("--")) throw new PackagedChatSmokeError("Usage: npm run smoke:packaged-chat -- --platform-dir release/mac-arm64");
  const platformDir = path.resolve(desktopRoot, value);
  // resolveSmokeTargets expects the parent of mac*; accept an individual mac* directory as well
  // so a release folder containing both CPU builds never silently tests the wrong one.
  let targets: ReturnType<typeof resolveSmokeTargets>;
  const entries = await readdir(platformDir);
  if (entries.includes("Tovu.app")) targets = resolveSmokeTargets(path.dirname(platformDir), [path.basename(platformDir)]);
  else {
    if (entries.filter(entry => entry.startsWith("mac")).length > 1) {
      throw new PackagedChatSmokeError("Choose a single native mac* output with --platform-dir.");
    }
    targets = resolveSmokeTargets(platformDir, entries);
  }

  let server: Awaited<ReturnType<typeof startTovuServer>>;
  let cookie = "";
  let requestSignal: AbortSignal = controller.signal;
  let runTimer: ReturnType<typeof setTimeout> | undefined;

  async function request(route: string, { method = "GET", body, expected = 200 }: {
    method?: string; body?: unknown; expected?: number;
  } = {}): Promise<Response> {
    const response = await fetch(new URL(route, server.origin), { method,
      headers: { "content-type": "application/json", origin: server.origin, ...(cookie ? { cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.any([requestSignal, AbortSignal.timeout(15_000)]), redirect: "error" });
    if (response.status !== expected) {
      await response.body?.cancel();
      throw new PackagedChatSmokeError(`Packaged chat HTTP ${response.status} at ${route.split("?")[0]}.`);
    }
    return response;
  }

  /** The boot line precedes daemon startup and its background CLI inventory discovery. */
  async function waitForClaudeModel(): Promise<string | undefined> {
    for (let attempt = 0; attempt < 60; attempt++) {
      requestSignal.throwIfAborted();
      const response = await fetch(new URL("/api/agents", server.origin), {
        headers: { cookie }, signal: AbortSignal.any([requestSignal, AbortSignal.timeout(15_000)]) });
      if (response.ok) {
        const inventory = await response.json() as Parameters<typeof selectPackagedChatModel>[0];
        const claude = inventory.agents.find(agent => agent.id === "claude");
        if (claude && !claude.discoveryPending) return selectPackagedChatModel(inventory);
      } else {
        await response.body?.cancel();
        if (response.status !== 503) throw new PackagedChatSmokeError("Packaged agent inventory is unavailable.");
      }
      await delay(500, undefined, { signal: requestSignal });
    }
    return undefined;
  }

  async function waitForRunSuccess(runId: string): Promise<string> {
    while (true) {
      const status = await (await request(`/api/runs/${encodeURIComponent(runId)}`)).json() as { run: { state: string } };
      if (status.run.state === "succeeded") return runId;
      if (["failed", "cancelled"].includes(status.run.state)) throw new PackagedChatSmokeError("The packaged Claude run failed or was canceled.");
      await delay(500, undefined, { signal: requestSignal });
    }
  }

  /** Read with the shipped Electron ABI and shipped SQLite, never the checkout's native module. */
  function readEvidence(siteDir: string, runId: string): PackagedChatEvidence | null {
    const script = `const Database = require(${JSON.stringify(path.join(targets.nodeModulesDir, "better-sqlite3"))});
      const db = new Database(${JSON.stringify(path.join(siteDir, "data.nosync/chat.db"))}, { readonly: true });
      try { console.log(JSON.stringify(db.prepare(\`SELECT m.run_id, m.run_status, m.content,
        a.attempt_base_json, m.events_json FROM assistant_run_attempts a
        JOIN ai_chat_messages m ON m.id = a.message_id WHERE m.run_id = ?\`).get(${JSON.stringify(runId)}) ?? null)); }
      finally { db.close(); }`;
    const result = spawnSync(targets.executablePath, ["-e", script], {
      env: { ELECTRON_RUN_AS_NODE: "1", PATH: process.env.PATH, HOME: process.env.HOME },
      cwd: siteDir, encoding: "utf8", timeout: 10_000, killSignal: "SIGKILL", maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) throw new PackagedChatSmokeError("Unable to read chat.db with packaged SQLite.");
    try { return JSON.parse(result.stdout) as PackagedChatEvidence | null; }
    catch { throw new PackagedChatSmokeError("Packaged SQLite returned invalid evidence JSON."); }
  }

  try {
    await runPackagedChatSmoke({ ports: {
      acquireLock,
      createSite: () => mkdtemp(path.join(scratchRoot, "packaged-chat-")),
      async start(siteDir) {
        const payloadRoot = path.dirname(targets.nodeModulesDir);
        // serve's public contract rejects 0. Use the shell's existing free-port allocator.
        const port = await allocatePort();
        const plan = buildPackagedChatServerPlan({ ...targets, siteDir, port,
          serveEnv: buildServeEnv({ repoRoot: payloadRoot, siteDir, baseEnv: process.env }, { warn() {} }) });
        let childPid: number | undefined;
        try {
          // serve validates a real site; an empty mkdtemp directory needs the shipped init first.
          await initSiteDir({ repoRoot: payloadRoot, dir: siteDir, cliMode: "compiled", baseEnv: plan.env,
            adminPassword: randomUUID(),
            spawnFn(_command, args, options) {
              const child = spawn(plan.command, args, { ...options, cwd: siteDir, detached: true,
                stdio: "pipe", timeout: 60_000, killSignal: "SIGKILL", signal: controller.signal });
              childPid = child.pid;
              return child;
            },
          });
          if (childPid !== undefined) await stopGroup(childPid, siteDir);
          childPid = undefined;
          server = await startTovuServer({ repoRoot: payloadRoot, siteDir, port, cliMode: "compiled",
            emitBootToken: true, baseEnv: plan.env, mirror: { stdout: silentStream(), stderr: silentStream() },
            spawnFn(_command, _args, options) {
              const child = spawn(plan.command, plan.args, { ...options, cwd: siteDir });
              childPid = child.pid;
              return child;
            },
          });
          if (!server.bootToken) throw new PackagedChatSmokeError("Packaged server emitted no boot token.");
          controller.signal.throwIfAborted();
          return { async stop() {
            // Parent exit alone proves nothing about the detached daemon and its CLI children.
            await stopGroup(server.pid, siteDir);
            await server.stop();
          } };
        } catch (error) {
          if (childPid !== undefined) await stopGroup(childPid, siteDir);
          throw error;
        }
      },
      async chat() {
        const deadline = new AbortController();
        runTimer = setTimeout(() => deadline.abort(), 180_000);
        requestSignal = AbortSignal.any([controller.signal, deadline.signal]);
        const auth = await request("/api/admin/v1/auth/boot-session", { method: "POST", body: { token: server.bootToken } });
        cookie = auth.headers.getSetCookie().map(item => item.split(";")[0]).join("; ");
        await auth.body?.cancel();
        if (!cookie) throw new PackagedChatSmokeError("Boot-session redemption set no session cookie.");
        const model = await waitForClaudeModel();
        if (!model) throw new PackagedChatSmokeError("Packaged Claude discovery did not become ready.");
        const conversation = await (await request("/api/assistant/chats", { method: "POST", body: {}, expected: 201 })).json() as { conversation: { id: string } };
        const contextRef = JSON.stringify({ prompt: PACKAGED_CHAT_PROMPT, model,
          conversationId: conversation.conversation.id, assistantMessageId: randomUUID(),
          userMessage: { id: randomUUID(), role: "user", content: PACKAGED_CHAT_PROMPT, createdAt: Date.now() } });
        const accepted = await (await request("/api/runs", { method: "POST", expected: 201,
          body: { agentId: "claude", contextRef } })).json() as { run: { id: string } };
        return waitForRunSuccess(accepted.run.id);
      },
      async evidence(siteDir, runId) {
        // The durable finalizer settles asynchronously after the daemon publishes its terminal state.
        for (let attempt = 0; attempt < 20; attempt++) {
          requestSignal.throwIfAborted();
          const row = readEvidence(siteDir, runId);
          if (row && !["queued", "running"].includes(row.run_status)) {
            const daemonLog = await readFile(path.join(siteDir, "ops/logs/daemon.log"), "utf8");
            return { row, daemonLog };
          }
          await delay(250, undefined, { signal: requestSignal });
        }
        throw new PackagedChatSmokeError("The smoke run did not settle in chat.db.");
      },
      // The plugin package store writes read-only directories, which rm alone cannot empty.
      async removeSite(siteDir) {
        const chmod = spawnSync("chmod", ["-R", "u+w", siteDir], { encoding: "utf8" });
        if (chmod.status !== 0) throw new PackagedChatSmokeError("Could not make the temporary site writable.");
        await rm(siteDir, { recursive: true, force: true });
      },
    } });
  } finally { clearTimeout(runTimer); }
  process.stdout.write("smoke-packaged-chat: PASS (jini connected, site_guide overview returned, DONE; teardown complete)\n");
}

main().catch(error => {
  // Only our fixed diagnostics are safe to print. Upstream errors may contain raw child output.
  const errors: unknown[] = error instanceof AggregateError ? error.errors : [error];
  for (const item of errors) {
    process.stderr.write(`smoke-packaged-chat: ${item instanceof PackagedChatSmokeError ? item.message : "Gate or teardown failed; no draft may be created."}\n`);
  }
  process.exitCode = 1;
}).finally(() => {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
});
