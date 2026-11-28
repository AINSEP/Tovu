import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { BootRefusalFailure, RunProductionReadinessGateOptions } from "../production-readiness-gate.js";

/**
 * @file In-process check of the warning lines `runProductionReadinessGateOrExit` prints for each
 * readiness failure. The sibling `boot-readiness-gate.unit.test.ts` runs the real gate in child
 * processes; this file replaces only the assessment (`runProductionReadinessGate`) so it can hand the
 * adapter each failure shape the gate produces and read back the exact line and the snapshot it sent.
 */

const gateCalls: RunProductionReadinessGateOptions[] = [];
let failures: BootRefusalFailure[] = [];
const gateUrl = new URL("../production-readiness-gate.ts", import.meta.url).href;
const realGate = await import(gateUrl);
mock.module(gateUrl, { namedExports: {
  ...realGate,
  runProductionReadinessGate: async (options: RunProductionReadinessGateOptions) => {
    gateCalls.push(options);
    return failures.length === 0 ? { ok: true } : { ok: false, failures };
  },
} });
const { runProductionReadinessGateOrExit } = await import("../boot-readiness-gate.js");

const failure = ({ code, message, details }: Pick<BootRefusalFailure, "code" | "message" | "details">): BootRefusalFailure =>
  ({ code, message, details, occurredAt: "2026-01-01T00:00:00.000Z", correlationId: null });

async function gateLines(env: Record<string, string | undefined>): Promise<string[]> {
  const saved = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
  const lines: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  for (const [name, value] of Object.entries(env)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  try {
    await runProductionReadinessGateOrExit();
  } finally {
    console.warn = realWarn;
    for (const [name, value] of Object.entries(saved)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  return lines.filter((line) => line.startsWith("[production-readiness-gate]"));
}

test("production boot: each failure is named by its check, else its capability, else its code, with the known remedy or the gate's own message", async () => {
  gateCalls.length = 0;
  failures = [
    failure({ code: "PRODUCTION_BOOT_UNSAFE_DEFAULT", message: "Refusing to boot in production mode: default-owner-password detected.", details: { checkName: "default-owner-password" } }),
    failure({ code: "PRODUCTION_CAPABILITY_NOT_DURABLE", message: "Refusing to boot in production mode: capability \"media-store\" has no durable adapter configured.",
      details: { capabilityName: "media-store", missingRequirement: "durable-adapter" } }),
    failure({ code: "SHARP_READINESS_FAILED", message: "Media transform routes disabled: sharp readiness check failed.", details: {} }),
  ];
  const lines = await gateLines({ TOVU_RUNTIME_MODE: "production", TOVU_ADMIN_PASSWORD: undefined, ANALYTICS_ROOT_KEY_SEED: undefined });

  assert.deepEqual(lines, [
    "[production-readiness-gate] WARNING PRODUCTION_BOOT_UNSAFE_DEFAULT (default-owner-password): TOVU_ADMIN_PASSWORD is unset or the default. If you already changed the owner password in Admin, set this variable to match or ignore this warning. Otherwise change the owner password in Admin. Boot continues.",
    "[production-readiness-gate] WARNING PRODUCTION_CAPABILITY_NOT_DURABLE (media-store): capability \"media-store\" has no durable adapter configured. Check this capability's deployment configuration. Boot continues.",
    "[production-readiness-gate] WARNING SHARP_READINESS_FAILED (SHARP_READINESS_FAILED): Media transform routes disabled: sharp readiness check failed. Check this capability's deployment configuration. Boot continues.",
  ]);
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0]!.mode, "production");
  assert.equal(gateCalls[0]!.envSnapshot.hasDefaultOwnerPassword, true, "an unset owner password is the seeded default");
  assert.equal(gateCalls[0]!.envSnapshot.hasDevSecretPlaceholder, true, "an unset analytics seed falls back to the dev placeholder");
});

test("production boot with a changed owner password and an analytics seed reports neither unsafe default, and a passing gate prints nothing", async () => {
  gateCalls.length = 0;
  failures = [];
  const lines = await gateLines({ TOVU_RUNTIME_MODE: "production", TOVU_ADMIN_PASSWORD: "owner-changed-a", ANALYTICS_ROOT_KEY_SEED: "seed-a" });

  assert.deepEqual(lines, []);
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0]!.envSnapshot.hasDefaultOwnerPassword, false);
  assert.equal(gateCalls[0]!.envSnapshot.hasDevSecretPlaceholder, false);
});

test("a local-mode boot never runs the production assessment", async () => {
  gateCalls.length = 0;
  failures = [failure({ code: "PRODUCTION_BOOT_UNSAFE_DEFAULT", message: "Refusing to boot in production mode: x detected.", details: { checkName: "x" } })];
  const lines = await gateLines({ TOVU_RUNTIME_MODE: "local" });

  assert.deepEqual(lines, []);
  assert.equal(gateCalls.length, 0);
});
