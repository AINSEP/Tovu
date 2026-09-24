import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  rootKeyBootNoticeLines,
  warnIfNoRootKeyAtBoot,
} from "../root-key-boot-notice.js";
import type { RootKeyStatus } from "#src/features/webhooks/keyring.env";

/**
 * @file Coverage for `root-key-boot-notice.ts` — the local-mode "this server has no root key"
 * warning.
 *
 * The defect it exists for is a DELAY, not a wrong value (2026-09-18: a site server booted with no
 * root key, behaved normally, and failed hours later on a deploy with an opaque 500). So what is
 * pinned here is mostly WHEN it speaks and WHEN it does not:
 *
 *   - local mode, no usable key  → warns, naming the cause and every remedy;
 *   - local mode, usable key     → silent (a false alarm is how a real one gets ignored);
 *   - production                 → silent, because `runProductionReadinessGateOrExit` has already
 *                                  refused the boot for this exact condition;
 *   - anything failing           → still silent-ish and NEVER thrown, because this is a boot path.
 *
 * Every dependency is injected: no real environment, no real `~/.tovu`, no real console. Nothing
 * below contains or asserts on a key VALUE — `RootKeyStatus` has no field that can hold one.
 */

const KEY_FILE = "/fake/home/.tovu/integrations-root-key.hex";

function status(over: Partial<RootKeyStatus> = {}): RootKeyStatus {
  return { active: false, source: "none", keyFilePath: KEY_FILE, ...over };
}

/** Collects the lines a run would print. */
function run(over: {
  inspect?: () => RootKeyStatus;
  mode?: () => "production" | "local";
  log?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const lines: string[] = [];
  warnIfNoRootKeyAtBoot({
    mode: over.mode ?? (() => "local"),
    inspect: over.inspect ?? (() => status()),
    log: over.log ?? ((line) => lines.push(line)),
    env: over.env,
  });
  return lines;
}

test("a local boot with no root key warns", () => {
  assert.notEqual(run().length, 0, "booting silently is the whole defect");
});

test("the warning names the env var, the key file, and the launcher that loads .env", () => {
  const text = run().join("\n");
  assert.match(text, /TOVU_INTEGRATIONS_ROOT_KEY/);
  assert.ok(text.includes(KEY_FILE), "the operator must be told where a key file would go");
  assert.match(text, /npm run desktop/);
  assert.match(text, /repo root/i);
  assert.match(text, /npm run dev/, "the other launcher needs its own line — it DOES load .env");
});

test("the warning says the failure will arrive far from this cause", () => {
  assert.match(run().join("\n"), /credential/i);
});

test("the warning does not promise that a new key recovers old credentials", () => {
  assert.match(run().join("\n"), /will not recover them/i);
});

test("a usable key is silent", () => {
  const lines = run({ inspect: () => status({ active: true, source: "env", fingerprint: "0123456789ab" }) });
  assert.deepEqual(lines, []);
});

test("a key from a FILE is a usable key, not a missing one", () => {
  const lines = run({ inspect: () => status({ active: true, source: "file", fingerprint: "0123456789ab" }) });
  assert.deepEqual(lines, []);
});

test("a configured-but-broken key is described as broken, not as missing", () => {
  const text = run({ inspect: () => status({ invalid: true, source: "env", reason: "too-short" }) }).join("\n");
  assert.match(text, /present but not usable/);
  assert.match(text, /too-short/);
});

test("a broken key FILE points at the file, not at the env var", () => {
  const text = run({ inspect: () => status({ invalid: true, source: "file", reason: "not-hex" }) }).join("\n");
  assert.match(text, /key file at \/fake\/home/);
  assert.match(text, /not-hex/);
});

test("production is silent — the readiness gate has already refused the boot", () => {
  const lines = run({ mode: () => "production" });
  assert.deepEqual(lines, [], "warning immediately before process.exit(1) helps nobody");
});

test("TOVU_ROOT_KEY_NOTICE=off silences the wall even for an inactive status", () => {
  const lines = run({ env: { TOVU_ROOT_KEY_NOTICE: "off" } });
  assert.deepEqual(lines, [], "start.mjs already spoke — this function must not repeat it");
});

test("TOVU_ROOT_KEY_NOTICE=off does not even probe", () => {
  let probed = false;
  run({
    env: { TOVU_ROOT_KEY_NOTICE: "off" },
    inspect: () => {
      probed = true;
      return status();
    },
  });
  assert.equal(probed, false);
});

test("any other TOVU_ROOT_KEY_NOTICE value leaves the wall unchanged", () => {
  for (const value of ["on", "1", "", "OFF"]) {
    const lines = run({ env: { TOVU_ROOT_KEY_NOTICE: value } });
    assert.notEqual(lines.length, 0, `value ${JSON.stringify(value)} must not be treated as "off"`);
  }
});

test("production does not even probe", () => {
  let probed = false;
  run({
    mode: () => "production",
    inspect: () => {
      probed = true;
      return status();
    },
  });
  assert.equal(probed, false);
});

test("a probe that throws is reported, never propagated onto the boot path", () => {
  const lines = run({
    inspect: () => {
      throw new Error("EACCES");
    },
  });
  assert.notEqual(lines.length, 0);
  assert.match(lines.join("\n"), /could not determine/i);
});

test("a log sink that throws cannot take the boot down with it", () => {
  assert.doesNotThrow(() =>
    warnIfNoRootKeyAtBoot({
      mode: () => "local",
      inspect: () => status(),
      log: () => {
        throw new Error("no stderr");
      },
    })
  );
});

test("the notice reads its paths from the status, never from a literal of its own", () => {
  const text = rootKeyBootNoticeLines(status({ keyFilePath: "/elsewhere/key.hex" })).join("\n");
  assert.ok(text.includes("/elsewhere/key.hex"));
  assert.equal(text.includes(KEY_FILE), false, "a hardcoded path sends the operator to the wrong file");
});

test("the notice never carries a fingerprint or any other key-derived value", () => {
  const text = rootKeyBootNoticeLines(status({ invalid: true, source: "env", reason: "too-short" })).join("\n");
  assert.equal(/[0-9a-f]{12,}/.test(text), false, "nothing key-derived belongs in a boot log");
});

// ---------------------------------------------------------------------------------------------
// Wiring. The check is worthless unless BOTH real top-level boot paths call it — the same
// "must run identically in both entrypoints" property `boot-readiness-gate.ts` exists to hold, and
// the same source-text technique `boot-readiness-gate.unit.test.ts` uses (neither `index.ts` nor
// `serve.ts` is importable by a test: they run real boot side effects at module scope).
//
// Comment-stripped, because both files' own comments name this function while explaining it.
// ---------------------------------------------------------------------------------------------

function bootPathSource(...parts: string[]) {
  const raw = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "..", "..", ...parts), "utf8");
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

for (const [label, parts] of [
  ["index.ts", ["index.ts"]],
  ["cli/commands/serve.ts", ["cli", "commands", "serve.ts"]],
] as const) {
  test(`${label} calls warnIfNoRootKeyAtBoot on its boot path`, () => {
    const src = bootPathSource(...parts);
    assert.match(src, /import \{ warnIfNoRootKeyAtBoot \} from "[^"]*root-key-boot-notice\.js";/);
    assert.match(src, /\n\s*warnIfNoRootKeyAtBoot\(\);/);
  });

  test(`${label} warns beside the production gate, not somewhere else`, () => {
    const src = bootPathSource(...parts);
    const gate = src.indexOf("await runProductionReadinessGateOrExit();");
    const warn = src.indexOf("warnIfNoRootKeyAtBoot();");
    assert.notEqual(gate, -1);
    assert.notEqual(warn, -1);
    assert.ok(warn > gate, "the local warning belongs after the production gate has declined to act");
  });
}

// ---------------------------------------------------------------------------------------------
// The DEFAULT dependencies. Every test above injects `mode` and `inspect`, which left the
// `?? resolveRuntimeMode` / `?? inspectRootKeyMaterial` fallbacks unexercised — a mutation sweep
// (2026-09-18) dropped both and nothing failed. Those defaults are the ONLY ones the two real boot
// paths use, so an unwired default is the whole check quietly reading nothing. Each test below
// sets up and tears down exactly the environment it reads, so neither asserts on this machine's
// own key state.
// ---------------------------------------------------------------------------------------------

test("with no injected mode, production is read from the REAL runtime mode", () => {
  const before = process.env.TOVU_RUNTIME_MODE;
  const lines: string[] = [];
  try {
    process.env.TOVU_RUNTIME_MODE = "production";
    warnIfNoRootKeyAtBoot({ inspect: () => status(), log: (l) => lines.push(l) });
    assert.deepEqual(lines, [], "the real resolveRuntimeMode must be what silences production");
  } finally {
    if (before === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = before;
  }
});

test("with no injected probe, the REAL inspectRootKeyMaterial is what decides", () => {
  const before = process.env.TOVU_INTEGRATIONS_ROOT_KEY;
  const lines: string[] = [];
  try {
    // Throwaway synthetic material, never written to disk — only its presence is asserted on.
    process.env.TOVU_INTEGRATIONS_ROOT_KEY = "a".repeat(64);
    warnIfNoRootKeyAtBoot({ mode: () => "local", log: (l) => lines.push(l) });
    assert.deepEqual(lines, [], "a real, usable key must silence this — a false alarm trains it away");

    delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
    process.env.TOVU_INTEGRATIONS_ROOT_KEY = "nope";
    lines.length = 0;
    warnIfNoRootKeyAtBoot({ mode: () => "local", log: (l) => lines.push(l) });
    assert.notEqual(lines.length, 0, "a real, unusable key must warn");
  } finally {
    if (before === undefined) delete process.env.TOVU_INTEGRATIONS_ROOT_KEY;
    else process.env.TOVU_INTEGRATIONS_ROOT_KEY = before;
  }
});
