import { LEGACY_SITE_KEY_FILENAME } from "#src/features/webhooks/site-key-sources";
import { LEGACY_SITE_KEY_ENV_VAR_NAME, SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

import {
  siteKeyBootNoticeLines,
  warnIfNoSiteKeyAtBoot,
} from "../site-key-boot-notice.js";
import type { SiteKeyStatus } from "#src/features/webhooks/keyring.env";

/**
 * @file Coverage for `site-key-boot-notice.ts` — the local-mode "this server has no site key"
 * warning.
 *
 * The defect it exists for is a DELAY, not a wrong value (2026-09-18: a site server booted with no
 * site key, behaved normally, and failed hours later on a deploy with an opaque 500). So what is
 * pinned here is mostly WHEN it speaks and WHEN it does not:
 *
 *   - local mode, no usable key  → warns, naming the cause and every remedy;
 *   - local mode, usable key     → silent (a false alarm is how a real one gets ignored);
 *   - production                 → silent, because `runProductionReadinessGateOrExit` has already
 *                                  refused the boot for this exact condition;
 *   - anything failing           → still silent-ish and NEVER thrown, because this is a boot path.
 *
 * Every dependency is injected: no real environment, no real `~/.tovu`, no real console. Nothing
 * below contains or asserts on a key VALUE — `SiteKeyStatus` has no field that can hold one.
 */

const KEY_FILE = `/fake/home/.tovu/${LEGACY_SITE_KEY_FILENAME}`;

function status(over: Partial<SiteKeyStatus> = {}): SiteKeyStatus {
  return { active: false, source: "none", keyFilePath: KEY_FILE, ...over };
}

/** Collects the lines a run would print. */
function run(over: {
  inspect?: () => SiteKeyStatus;
  mode?: () => "production" | "local";
  log?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const lines: string[] = [];
  warnIfNoSiteKeyAtBoot({
    mode: over.mode ?? (() => "local"),
    inspect: over.inspect ?? (() => status()),
    log: over.log ?? ((line) => lines.push(line)),
    env: over.env ?? {},
  });
  return lines;
}

test("a local boot with no site key warns", () => {
  assert.notEqual(run().length, 0, "booting silently is the whole defect");
});

test("the warning names the env var, the key file, and the launcher that loads .env", () => {
  const text = run().join("\n");
  assert.match(text, /TOVU_SITE_KEY/);
  assert.ok(text.includes(KEY_FILE), "the operator must be told where a key file would go");
  assert.match(text, /npm run desktop/);
  assert.match(text, /repo root/i);
  assert.match(text, /npm run dev/, "the other launcher needs its own line — it DOES load .env");
});

test("the warning says the failure will arrive far from this cause", () => {
  const text = run().join("\n").replace(/\s+/g, " ");
  assert.match(text, /THIS SERVER HAS NO USABLE SITE KEY/);
  assert.ok(text.includes("Anything that READS a stored credential — a deploy, a saved API key, a custom credential request — will fail, far from this cause."), "the missing boot key must be connected to later credential failures");
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

test("TOVU_SITE_KEY_NOTICE=off silences the wall even for an inactive status", () => {
  const lines = run({ env: { TOVU_SITE_KEY_NOTICE: "off" } });
  assert.deepEqual(lines, [], "start.mjs already spoke — this function must not repeat it");
});

test("C4: the retired notice switch does not silence the site-key notice", () => {
  const retiredSwitch = ["TOVU", "ROOT", "KEY", "NOTICE"].join("_");
  const lines = run({ env: { [retiredSwitch]: "off" } });
  assert.notEqual(lines.length, 0, "the renamed notice switch has no compatibility alias");
});

test("TOVU_SITE_KEY_NOTICE=off still probes for conflict and deprecation", () => {
  let probed = false;
  run({
    env: { TOVU_SITE_KEY_NOTICE: "off" },
    inspect: () => {
      probed = true;
      return status();
    },
  });
  assert.equal(probed, true);
});

test("any other TOVU_SITE_KEY_NOTICE value leaves the wall unchanged", () => {
  for (const value of ["on", "1", "", "OFF"]) {
    const lines = run({ env: { TOVU_SITE_KEY_NOTICE: value } });
    assert.notEqual(lines.length, 0, `value ${JSON.stringify(value)} must not be treated as "off"`);
  }
});

test("production still probes for deprecation", () => {
  let probed = false;
  run({
    mode: () => "production",
    inspect: () => {
      probed = true;
      return status();
    },
  });
  assert.equal(probed, true);
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
    warnIfNoSiteKeyAtBoot({
      env: {},
      mode: () => "local",
      inspect: () => status(),
      log: () => {
        throw new Error("no stderr");
      },
    })
  );
});

test("the notice reads its paths from the status, never from a literal of its own", () => {
  const text = siteKeyBootNoticeLines(status({ keyFilePath: "/elsewhere/key.hex" })).join("\n");
  assert.ok(text.includes("/elsewhere/key.hex"));
  assert.equal(text.includes(KEY_FILE), false, "a hardcoded path sends the operator to the wrong file");
});

test("the notice never carries a fingerprint or any other key-derived value", () => {
  const text = siteKeyBootNoticeLines(status({ invalid: true, source: "env", reason: "too-short" })).join("\n");
  assert.equal(/[0-9a-f]{12,}/.test(text), false, "nothing key-derived belongs in a boot log");
});

// ---------------------------------------------------------------------------------------------
// Wiring. The check is worthless unless BOTH real top-level boot paths call it — the same
// "must run identically in both entrypoints" property `boot-readiness-gate.ts` exists to hold, and
// the same source-text technique `boot-readiness-gate.unit.test.ts` uses (neither `index.ts` nor
// `serve.ts` is importable by a test: they run real boot side effects at module scope).
//
// Parsed, not regex-matched: a text match accepted `if (false) warnIfNoSiteKeyAtBoot();` (the call,
// its newline and its ordering all survive) while the boot warning never fired. A real boot cannot
// run here (`serve-command*.integration` suites hang on this machine and orphan servers), so the
// AST pins the call's LOCATION instead: an unconditional statement of the boot function's own body,
// the very next statement after the production gate, before anything that binds or announces a
// server. Comments are not AST nodes, so the files' own prose naming this function cannot match.
// ---------------------------------------------------------------------------------------------

function bootPathAst(...parts: string[]): ts.SourceFile {
  const file = path.join(import.meta.dirname, "..", "..", "..", "..", ...parts);
  return ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function isBareCallStatement(node: ts.Node, callee: string, { awaited }: { awaited: boolean }): boolean {
  if (!ts.isExpressionStatement(node)) return false;
  let expression = node.expression;
  if (awaited) {
    if (!ts.isAwaitExpression(expression)) return false;
    expression = expression.expression;
  }
  return ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === callee && expression.arguments.length === 0;
}

function findAll(root: ts.Node, match: (node: ts.Node) => boolean): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (match(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

for (const [label, parts, bootFunction] of [
  ["index.ts", ["index.ts"], "main"],
  ["cli/commands/serve.ts", ["cli", "commands", "serve.ts"], "runServeCommand"],
] as const) {
  test(`${label} imports warnIfNoSiteKeyAtBoot from site-key-boot-notice`, () => {
    const source = bootPathAst(...parts);
    const imports = source.statements.filter(ts.isImportDeclaration).filter((statement) =>
      ts.isStringLiteral(statement.moduleSpecifier) && /site-key-boot-notice\.js$/.test(statement.moduleSpecifier.text));
    assert.equal(imports.length, 1);
    const bindings = imports[0].importClause?.namedBindings;
    assert.ok(bindings && ts.isNamedImports(bindings));
    assert.deepEqual(bindings.elements.map((element) => element.name.text), ["warnIfNoSiteKeyAtBoot"]);
  });

  test(`${label} calls warnIfNoSiteKeyAtBoot unconditionally in ${bootFunction}(), as the statement right after the production gate`, () => {
    const source = bootPathAst(...parts);
    const warnCalls = findAll(source, (node) => isBareCallStatement(node, "warnIfNoSiteKeyAtBoot", { awaited: false }));
    assert.equal(warnCalls.length, 1, "exactly one call statement, and nowhere else");
    const gates = findAll(source, (node) => isBareCallStatement(node, "runProductionReadinessGateOrExit", { awaited: true }));
    assert.equal(gates.length, 1);

    const warn = warnCalls[0];
    const body = warn.parent;
    // A Block directly owned by the boot function: not an if/try/loop body, not a nested callback.
    assert.ok(ts.isBlock(body), `the call must sit in a plain block, not under ${ts.SyntaxKind[body.kind]}`);
    assert.ok(ts.isFunctionDeclaration(body.parent) && body.parent.name?.text === bootFunction,
      `the call must be a top-level statement of ${bootFunction}()`);
    assert.equal(gates[0].parent, body, "the gate and the warning share one block");
    const index = body.statements.indexOf(warn as ts.Statement);
    assert.equal(body.statements[index - 1], gates[0], "the warning is the statement right after the production gate");
  });
}

// ---------------------------------------------------------------------------------------------
// The DEFAULT dependencies. Every test above injects `mode` and `inspect`, which left the
// `?? resolveRuntimeMode` / `?? inspectSiteKeyMaterial` fallbacks unexercised — a mutation sweep
// (2026-09-18) dropped both and nothing failed. Those defaults are the ONLY ones the two real boot
// paths use, so an unwired default is the whole check quietly reading nothing. Each test below
// sets up and tears down exactly the environment it reads, so neither asserts on this machine's
// own key state.
// ---------------------------------------------------------------------------------------------

test("with no injected mode, production is read from the REAL runtime mode", () => {
  const before = process.env.TOVU_RUNTIME_MODE;
  const beforeNotice = process.env.TOVU_SITE_KEY_NOTICE;
  const lines: string[] = [];
  try {
    delete process.env.TOVU_SITE_KEY_NOTICE;
    process.env.TOVU_RUNTIME_MODE = "production";
    warnIfNoSiteKeyAtBoot({ inspect: () => status(), log: (l) => lines.push(l) });
    assert.deepEqual(lines, [], "the real resolveRuntimeMode must be what silences production");
  } finally {
    if (beforeNotice === undefined) delete process.env.TOVU_SITE_KEY_NOTICE;
    else process.env.TOVU_SITE_KEY_NOTICE = beforeNotice;
    if (before === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = before;
  }
});

test("with no injected probe, the REAL inspectSiteKeyMaterial is what decides", () => {
  const before = process.env[SITE_KEY_ENV_VAR_NAME];
  const beforeLegacy = process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
  const beforeNotice = process.env.TOVU_SITE_KEY_NOTICE;
  const lines: string[] = [];
  try {
    delete process.env.TOVU_SITE_KEY_NOTICE;
    // Use the preferred name alone: legacy material intentionally emits a deprecation notice.
    delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
    // Throwaway synthetic material, never written to disk — only its presence is asserted on.
    process.env[SITE_KEY_ENV_VAR_NAME] = "a".repeat(64);
    warnIfNoSiteKeyAtBoot({ mode: () => "local", log: (l) => lines.push(l) });
    assert.deepEqual(lines, [], "a real, usable key must silence this — a false alarm trains it away");

    process.env[SITE_KEY_ENV_VAR_NAME] = "nope";
    lines.length = 0;
    warnIfNoSiteKeyAtBoot({ mode: () => "local", log: (l) => lines.push(l) });
    assert.notEqual(lines.length, 0, "a real, unusable key must warn");
  } finally {
    if (beforeNotice === undefined) delete process.env.TOVU_SITE_KEY_NOTICE;
    else process.env.TOVU_SITE_KEY_NOTICE = beforeNotice;
    if (before === undefined) delete process.env[SITE_KEY_ENV_VAR_NAME];
    else process.env[SITE_KEY_ENV_VAR_NAME] = before;
    if (beforeLegacy === undefined) delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
    else process.env[LEGACY_SITE_KEY_ENV_VAR_NAME] = beforeLegacy;
  }
});

test("legacy site-key env emits exactly one deprecation line, including quiet startup", () => {
  const lines: string[] = [];
  warnIfNoSiteKeyAtBoot({ mode: () => "local", env: { TOVU_SITE_KEY_NOTICE: "off" },
    inspect: () => ({ active: true, source: "env", keyFilePath: "", envVarName: "legacy", deprecated: true }),
    log: line => lines.push(line) });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /deprecated.*TOVU_SITE_KEY/);
});
test("conflicting site-key env warns locally even when quiet startup is enabled", () => {
  const lines: string[] = [];
  warnIfNoSiteKeyAtBoot({ mode: () => "local", env: { TOVU_SITE_KEY_NOTICE: "off" },
    inspect: () => ({ active: false, source: "env", keyFilePath: "", invalid: true, reason: "env-conflict" }),
    log: line => lines.push(line) });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /conflict/);
});

// F3588: every test above injects `log` (or the AST pins only the call site), so nothing proved the
// DEFAULT sink actually reaches the operator's terminal. A child process with no key anywhere — no
// env names, an empty HOME, an empty cwd — calls the real export with no injected dependency at all
// and must print the wall on stderr (stdout stays clean for anything that parses it).
test("F3588: a real no-key local boot call prints the notice on stderr, from the default sink", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-key-notice-"));
  try {
    // cwd is the empty HOME, so every path handed to the child is absolute.
    const tsconfig = process.env.TSX_TSCONFIG_PATH;
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: home, ...(tsconfig ? { TSX_TSCONFIG_PATH: path.resolve(tsconfig) } : {}) };
    const moduleUrl = new URL("../site-key-boot-notice.ts", import.meta.url).href;
    const child = spawnSync(
      process.execPath,
      ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", `const m = await import(${JSON.stringify(moduleUrl)}); m.warnIfNoSiteKeyAtBoot();`],
      { cwd: home, env, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(child.status, 0, `child failed: ${child.stderr}`);
    assert.equal(child.stdout, "", "the notice belongs on stderr, never stdout");
    assert.match(child.stderr, new RegExp(SITE_KEY_ENV_VAR_NAME), "the no-key notice must reach stderr and name the env var");
    assert.deepEqual(fs.readdirSync(home), [], "warning about a missing key must never create one");
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
