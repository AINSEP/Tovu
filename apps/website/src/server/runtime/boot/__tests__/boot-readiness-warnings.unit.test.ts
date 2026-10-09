import assert from "node:assert/strict";
import test from "node:test";

import { collectBootReadinessWarnings, detectDeploymentSignals, warnOnBootReadinessGaps } from "../boot-readiness-warnings.js";
import { resolveAgentPermissionMode } from "#src/contracts/core/agent-permission-mode";

/**
 * @file Boot-readiness WARNINGS (2026-10-08 hardwiring audit #4/#5). Pure collectors plus the
 * never-throwing emitter, all over injected env / file-probe / log ports — no real filesystem,
 * console or process env is read.
 */

const DEPLOYED_LOCAL =
  '[boot-readiness] WARNING: this server looks deployed (NODE_ENV=production, container (/.dockerenv)) but TOVU_RUNTIME_MODE is not "production": ' +
  'production boot checks are off and the assistant agent runs with permission mode "bypass". Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).';
const SALT_UNSET =
  "[boot-readiness] WARNING: COMMENTS_IP_SALT is not set: comment IP hashes are salted with a value derived from the site key, " +
  "so rotating the site key changes them. Set COMMENTS_IP_SALT to a long random value to pin it.";

const noFiles = () => false;

test("detectDeploymentSignals: a plain dev shell and a desktop-spawned site report nothing", () => {
  assert.deepEqual(detectDeploymentSignals({ env: {} }, { pathExists: noFiles }), []);
  assert.deepEqual(detectDeploymentSignals({ env: { NODE_ENV: "development" } }, { pathExists: noFiles }), []);
});

test("detectDeploymentSignals: names every deployment fact it found, in a fixed order", () => {
  const probed: string[] = [];
  const signals = detectDeploymentSignals(
    { env: { NODE_ENV: "production", KUBERNETES_SERVICE_HOST: "10.0.0.1", FLY_APP_NAME: "tovu" } },
    { pathExists: (path) => { probed.push(path); return true; } }
  );
  assert.deepEqual(signals, ["NODE_ENV=production", "container (/.dockerenv)", "container (/run/.containerenv)", "Kubernetes (KUBERNETES_SERVICE_HOST)", "Fly.io (FLY_APP_NAME)"]);
  assert.deepEqual(probed, ["/.dockerenv", "/run/.containerenv"]);
});

test("collectBootReadinessWarnings: deployed + local mode warns, naming the bypass agent mode", () => {
  assert.deepEqual(
    collectBootReadinessWarnings({ env: {}, mode: "local", deploymentSignals: ["NODE_ENV=production", "container (/.dockerenv)"], agentPermissionMode: "bypass" }),
    [DEPLOYED_LOCAL]
  );
});

test("collectBootReadinessWarnings: an explicitly restricted agent drops only the bypass clause", () => {
  assert.deepEqual(
    collectBootReadinessWarnings({ env: {}, mode: "local", deploymentSignals: ["Fly.io (FLY_APP_NAME)"], agentPermissionMode: "restricted" }),
    ['[boot-readiness] WARNING: this server looks deployed (Fly.io (FLY_APP_NAME)) but TOVU_RUNTIME_MODE is not "production": production boot checks are off. Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).']
  );
});

test("collectBootReadinessWarnings: local dev (no signals) is silent, whatever COMMENTS_IP_SALT is", () => {
  assert.deepEqual(collectBootReadinessWarnings({ env: {}, mode: "local", deploymentSignals: [], agentPermissionMode: "bypass" }), []);
});

test("collectBootReadinessWarnings: production without COMMENTS_IP_SALT warns once; a pinned salt or deploy signals in production add nothing", () => {
  assert.deepEqual(collectBootReadinessWarnings({ env: {}, mode: "production", deploymentSignals: ["NODE_ENV=production"], agentPermissionMode: "restricted" }), [SALT_UNSET]);
  assert.deepEqual(collectBootReadinessWarnings({ env: { COMMENTS_IP_SALT: "   " }, mode: "production", deploymentSignals: [], agentPermissionMode: "restricted" }), [SALT_UNSET]);
  assert.deepEqual(collectBootReadinessWarnings({ env: { COMMENTS_IP_SALT: "pinned-salt-fixture" }, mode: "production", deploymentSignals: ["NODE_ENV=production"], agentPermissionMode: "restricted" }), []);
});

test("warnOnBootReadinessGaps: wires the real mode and agent resolvers over the injected env", () => {
  const lines: string[] = [];
  warnOnBootReadinessGaps({ env: { NODE_ENV: "production" }, pathExists: (path) => path === "/.dockerenv", log: (line) => lines.push(line) });
  assert.deepEqual(lines, [DEPLOYED_LOCAL]);

  const production: string[] = [];
  warnOnBootReadinessGaps({ env: { NODE_ENV: "production", TOVU_RUNTIME_MODE: "production" }, pathExists: noFiles, log: (line) => production.push(line) });
  assert.deepEqual(production, [SALT_UNSET]);
});

test("warnOnBootReadinessGaps: never throws, even when the probe and the log sink both throw", () => {
  assert.doesNotThrow(() => warnOnBootReadinessGaps({
    env: { NODE_ENV: "production" },
    pathExists: () => { throw new Error("probe failed"); },
    log: () => { throw new Error("stderr closed"); },
  }));
  assert.doesNotThrow(() => warnOnBootReadinessGaps({ env: { NODE_ENV: "production" }, pathExists: noFiles, log: () => { throw new Error("stderr closed"); } }));
});

test("resolveAgentPermissionMode: explicit override wins either way; otherwise bypass unless production", () => {
  assert.equal(resolveAgentPermissionMode({ env: {} }), "bypass");
  assert.equal(resolveAgentPermissionMode({ env: { NODE_ENV: "production" } }), "bypass", "NODE_ENV never changes the mode (INV-02)");
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_RUNTIME_MODE: "production" } }), "restricted");
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_RUNTIME_MODE: "production", TOVU_AGENT_PERMISSION_MODE: "bypass" } }), "bypass");
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_AGENT_PERMISSION_MODE: "restricted" } }), "restricted");
});
