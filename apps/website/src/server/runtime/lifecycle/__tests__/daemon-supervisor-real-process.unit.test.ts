import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureToolExecToken } from "#src/assistant/daemon-access";
import {
  ensureAssistantDaemonReady,
  isAssistantDaemonReady,
  resetAssistantDaemonSingletonForTests,
  shutdownAssistantDaemon,
  startAssistantDaemon,
} from "../daemon-supervisor.js";

/**
 * @file The site-local daemon wrapper over its PRODUCTION process ports: the module's own process
 * control, the default port refresh and the default discovery read of the site's registry file.
 * Only the program behind the native spawn seam is swapped for a real, short-lived idle `node -e`
 * process (launched with the supervisor's own spawn options), which then really gets stopped.
 */

const IDLE = "setInterval(() => {}, 1000)";
const isAlive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test("a site-local daemon is found through the site's registry record, and shutdown resolves only after its real process stopped", { timeout: 30_000 }, async (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "ds-real-"));
  const savedSiteDir = process.env.TOVU_SITE_DIR;
  delete process.env.TOVU_SITE_DIR;
  const children: ChildProcess[] = [];
  t.after(async () => {
    // Stops the supervisor's pending readiness/respawn work too, so a failing run cannot keep the file alive.
    await shutdownAssistantDaemon().catch(() => {});
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    if (savedSiteDir === undefined) delete process.env.TOVU_SITE_DIR; else process.env.TOVU_SITE_DIR = savedSiteDir;
    resetAssistantDaemonSingletonForTests();
    fs.rmSync(siteDir, { recursive: true, force: true });
  });
  resetAssistantDaemonSingletonForTests();
  ensureToolExecToken({ env: {} }, {});
  const nativeSpawn = ({ options }: { options: Parameters<typeof spawn>[2] }) => {
    const child = spawn(process.execPath, ["-e", IDLE], options);
    children.push(child);
    // The real daemon publishes this record only after it listens; readiness trusts nothing else.
    fs.mkdirSync(path.join(siteDir, "ops"), { recursive: true });
    fs.writeFileSync(path.join(siteDir, "ops/assistant-daemon.json"), JSON.stringify({
      url: "http://127.0.0.1:4790", host: "127.0.0.1", port: 4790, pid: child.pid, startedAt: "2026-11-28T00:00:00.000Z" }));
    return child;
  };

  startAssistantDaemon({ workspaceId: "ws-real", siteDir, siteApiOrigin: "http://127.0.0.1:4780" },
    { parentIpc: false, registerProcessSignalHandlers: false, nativeSpawn });
  assert.equal(children.length, 0, "registration is cold: nothing spawns before demand");
  // Bounded, so a readiness regression fails here instead of waiting on the supervisor's own budget.
  const outcome = await Promise.race([ensureAssistantDaemonReady({}, {}).then(() => "ready"),
    new Promise(resolve => setTimeout(resolve, 10_000, "not ready")).then(value => value)]);
  assert.equal(outcome, "ready");

  assert.equal(children.length, 1);
  const pid = children[0].pid!;
  assert.equal(isAssistantDaemonReady(), true, "ready once the registry names the spawned pid");
  assert.equal(isAlive(pid), true);

  await shutdownAssistantDaemon();

  assert.equal(isAlive(pid), false, "the returned promise is the package's tree stop, not an early resolve");
  assert.equal(children.length, 1, "shutdown never respawns");
});
