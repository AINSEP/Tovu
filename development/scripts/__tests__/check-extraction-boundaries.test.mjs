// Gate B extraction-boundary ratchet fixtures (P12 GATE-B). Each test copies the passing fixture
// workspace into a temporary git repository (the temp-workspace pattern from
// dependency-cruiser.test.ts), applies a small override, and runs the real CLI against it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join(REPO_ROOT, "development/scripts/check-extraction-boundaries.mjs");
const FIXTURE = path.join(import.meta.dirname, "fixtures/extraction-boundaries");
const DEPCRUISE = path.join(REPO_ROOT, "node_modules/dependency-cruiser/bin/dependency-cruise.mjs");
const DEBT = "development/boundaries/extraction-debt.json";
const INVENTORY = "development/boundaries/extraction-inventory.json";
const W = "apps/website/src";
const A = "apps/admin/src";

function git(dir, ...args) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function write(dir, files) {
  for (const [rel, source] of Object.entries(files)) {
    const file = path.join(dir, rel);
    if (source === null) { fs.rmSync(file, { force: true }); continue; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
}

function commitAll(dir, message) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", message);
}

function workspace(t, overrides = {}) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "extraction-boundaries-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(FIXTURE, "workspace"), dir, { recursive: true });
  // The fixture's public Jini export map lives outside node_modules so it is committable.
  fs.cpSync(path.join(FIXTURE, "jini-exports"), path.join(dir, "node_modules/@jini-ai"), { recursive: true });
  write(dir, overrides);
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "fixture@example.invalid");
  git(dir, "config", "user.name", "fixture");
  commitAll(dir, "fixture base");
  return dir;
}

function run(dir, args = [], env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: dir, encoding: "utf8", timeout: 120_000, env: { ...process.env, EXTRACTION_BASE_REF: "HEAD", ...env },
  });
}

function findings(dir) {
  const result = run(dir, ["--print-baseline"]);
  assert.equal(result.status, 0, `--print-baseline must succeed: ${result.stderr}`);
  return JSON.parse(result.stdout).entries.map((e) => `${e.rule} ${e.source} -> ${e.target} [${e.kind}] x${e.count}`);
}

function inventoryWith(dir, rows) {
  const inventory = JSON.parse(fs.readFileSync(path.join(dir, INVENTORY), "utf8"));
  inventory.rows.push(...rows);
  inventory.rows.sort((a, b) => (a.path < b.path ? -1 : 1));
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

function seed(dir) {
  const result = run(dir, ["--print-baseline"]);
  assert.equal(result.status, 0, `seed must print: ${result.stderr}`);
  write(dir, { [DEBT]: result.stdout });
  commitAll(dir, "seed debt");
}

test("the passing fixture has zero findings and the check exits 0", (t) => {
  const dir = workspace(t);
  assert.deepEqual(findings(dir), [], "neutral port, public Jini entries, host binder, host contracts use and in-root platform imports all pass");
  const result = run(dir);
  assert.equal(result.status, 0, `check must pass on the fixture: ${result.stdout}${result.stderr}`);
});

test("direct host edges: relative and #src aggregate refs incl. Pick<RouteDeps>, and route-deps slices fail", (t) => {
  const dir = workspace(t, {
    [`${W}/features/billing/direct.ts`]: [
      'import type { RouteDeps } from "../../server/routes/types.js";',
      'import type { RouteDeps as Same } from "#src/server/routes/types";',
      'import { credentialsDeps } from "#src/server/routes/route-deps/credentials-deps";',
      'export type Slice = Pick<RouteDeps, "a"> & Pick<Same, "b">;',
      "export const slice = credentialsDeps.slice;",
      "",
    ].join("\n"),
  });
  assert.deepEqual(findings(dir), [
    `bound-host-edge ${W}/features/billing/direct.ts -> ${W}/server/routes/route-deps/credentials-deps.ts [import] x1`,
    `bound-host-edge ${W}/features/billing/direct.ts -> ${W}/server/routes/types.ts [import-type] x2`,
  ]);
});

test("admin @/ imports into the transport root fail directly and through a barrel with a witness", (t) => {
  const dir = workspace(t, {
    [`${A}/features/owner/owner-http.ts`]: 'import { request } from "@/lib/admin-http/request";\nexport const get = request;\n',
    [`${A}/features/owner/owner-barrel.ts`]: 'import { request } from "@/lib/transport";\nexport const viaBarrel = request;\n',
  });
  assert.deepEqual(findings(dir), [
    `bound-host-edge ${A}/features/owner/owner-http.ts -> ${A}/lib/admin-http/request.ts [import] x1`,
    `bound-indirect-host-edge ${A}/features/owner/owner-barrel.ts -> ${A}/lib/transport.ts [import] x1`,
  ]);
  const check = run(dir);
  assert.notEqual(check.status, 0, "new findings must fail the check");
  assert.match(check.stdout + check.stderr,
    new RegExp(`${A}/features/owner/owner-barrel.ts -> ${A}/lib/transport.ts -> ${A}/lib/admin-http/request.ts`),
    "the indirect finding prints its witness path");
});

test("named mutation B-wrapper-to-composition: port redirected through wrapper.ts to jini-kits fails with the two-hop witness, revert passes", (t) => {
  const dir = workspace(t);
  const original = fs.readFileSync(path.join(dir, `${A}/lib/ports/kit-port.ts`), "utf8");
  write(dir, {
    [`${A}/lib/ports/kit-port.ts`]: 'export type { KitPort } from "./wrapper";\n',
    [`${A}/lib/ports/wrapper.ts`]: 'import { kit } from "@/integrations/jini-kits";\nexport type KitPort = typeof kit;\n',
  });
  assert.deepEqual(findings(dir), [
    `bound-indirect-host-edge ${A}/features/owner/owner-entry.ts -> ${A}/lib/ports/kit-port.ts [import-type] x1`,
  ], "the entry keeps its import spelling, so the finding is keyed at the wrapper entrance");
  const check = run(dir);
  assert.notEqual(check.status, 0, "the mutation must fail the check");
  assert.match(check.stdout + check.stderr,
    new RegExp(`owner-entry.ts -> ${A}/lib/ports/kit-port.ts -> ${A}/lib/ports/wrapper.ts -> ${A}/integrations/jini-kits.ts`),
    "two-hop witness path");
  write(dir, { [`${A}/lib/ports/kit-port.ts`]: original, [`${A}/lib/ports/wrapper.ts`]: null });
  assert.equal(run(dir).status, 0, "reverting the mutation passes again");
});

test("an unresolved protected local alias from a bound file is a finding", (t) => {
  const dir = workspace(t, {
    [`${W}/features/billing/ghost.ts`]: 'import { gone } from "#src/server/routes/missing";\nexport const g = gone;\n',
  });
  assert.deepEqual(findings(dir), [
    `unresolved-protected-alias ${W}/features/billing/ghost.ts -> #src/server/routes/missing [import] x1`,
  ]);
});

test("root overlap: a bound platform row may import within platform, a bound file outside may not", (t) => {
  const dir = workspace(t, {
    [`${W}/features/billing/uses-platform.ts`]: 'import { inner } from "../../platform/html/inner.js";\nexport const x = inner;\n',
  });
  assert.deepEqual(findings(dir), [
    `bound-host-edge ${W}/features/billing/uses-platform.ts -> ${W}/platform/html/inner.ts [import] x1`,
  ]);
});

test("@tovu/contracts and private Jini entries fail from bound files (type, value and workspace alias)", (t) => {
  const dir = workspace(t, {
    [`${W}/features/billing/contracts-user.ts`]: [
      'import type { Key } from "@tovu/contracts/keys";',
      'import { values } from "@tovu/contracts/values";',
      'import { w } from "../../../../../packages/contracts/src/w.js";',
      'import { secret } from "@jini-ai/core/internal/secret";',
      'import { kitA } from "@jini-ai/core/kits/a";',
      "export const all = [values, w, secret, kitA] as unknown as Key;",
      "",
    ].join("\n"),
  });
  assert.deepEqual(findings(dir), [
    `bound-private-jini ${W}/features/billing/contracts-user.ts -> @jini-ai/core/internal/secret [import] x1`,
    `bound-tovu-contracts ${W}/features/billing/contracts-user.ts -> @tovu/contracts/keys [import-type] x1`,
    `bound-tovu-contracts ${W}/features/billing/contracts-user.ts -> @tovu/contracts/values [import] x1`,
    `bound-tovu-contracts ${W}/features/billing/contracts-user.ts -> packages/contracts/src/w.ts [import] x1`,
  ], "host-owned server/routes/types.ts imports @tovu/contracts too and is not reported");
});

test("mixed scope: imports used only by host symbols pass, ones a moved symbol reaches fail", (t) => {
  const base = workspace(t);
  const mixed = `${W}/features/billing/mixed.ts`;
  const dir = workspace(t, {
    [mixed]: [
      'import { credentialsDeps } from "#src/server/routes/route-deps/credentials-deps";',
      'import type { RouteDeps } from "../../server/routes/types.js";',
      "const helper = (d: RouteDeps) => d.a;",
      "export function movedFn(d: { a: string }) { return helper(d as RouteDeps); }",
      "export const hostOnly = credentialsDeps.slice;",
      "",
    ].join("\n"),
    [INVENTORY]: inventoryWith(base, [{
      path: mixed, step: "s5", area: "billing", dest: "packages/billing/src/mixed.ts", k: ["mixed"], scope: "mixed",
      disposition: "split", owner: "billing", hostSymbols: ["hostOnly"], movedSymbols: ["movedFn"],
    }]),
  });
  assert.deepEqual(findings(dir), [
    `bound-host-edge ${mixed} -> ${W}/server/routes/types.ts [import-type] x1`,
  ], "the moved symbol reaches RouteDeps through the local helper; the host-only slice import passes");
});

test("desktop NodeNext config resolves .ts specifiers and flags an edge into a host row", (t) => {
  const dir = workspace(t, {
    "apps/desktop/src/main/sync/sync.ts": 'import { clean } from "./clean.ts";\nimport { store } from "../host-store.ts";\nexport const synced = [clean, store];\n',
  });
  assert.deepEqual(findings(dir), [
    "bound-host-edge apps/desktop/src/main/sync/sync.ts -> apps/desktop/src/main/host-store.ts [import] x1",
  ]);
});

test("a new bound file starts with zero allowance; a new file under a theme root is host-owned", (t) => {
  const dir = workspace(t);
  seed(dir);
  write(dir, { [`${W}/features/theme/new-theme.ts`]: 'import type { RouteDeps } from "#src/server/routes/types";\nexport type T = RouteDeps;\n' });
  assert.equal(run(dir).status, 0, "theme-root files are host-owned and may import the host aggregate");
  write(dir, { [`${W}/features/billing/new-file.ts`]: 'import type { RouteDeps } from "#src/server/routes/types";\nexport type T = RouteDeps;\n' });
  const result = run(dir);
  assert.notEqual(result.status, 0, "a new bound file has no allowance");
  assert.match(result.stdout + result.stderr, /new finding.*new-file\.ts/);
});

test("occurrences and shrink: frozen passes, repeat increments, same-change growth fails, removal needs update, --write-shrink is exact and idempotent", (t) => {
  const file = `${W}/features/billing/frozen.ts`;
  const twoSites = 'import type { RouteDeps } from "#src/server/routes/types";\nimport type { RouteDeps as R2 } from "../../server/routes/types.js";\nexport type F = [RouteDeps, R2];\n';
  const dir = workspace(t, { [file]: twoSites });
  seed(dir);
  const seeded = fs.readFileSync(path.join(dir, DEBT), "utf8");
  assert.match(seeded, /"count":2/, "both physical sites are counted");
  assert.equal(run(dir).status, 0, "a frozen edge passes");

  write(dir, { [file]: `${twoSites}import type { RouteDeps as R3 } from "#src/server/routes/types";\nexport type G = R3;\n` });
  const repeated = run(dir);
  assert.notEqual(repeated.status, 0, "a repeated occurrence increments the count above the allowance");
  assert.match(repeated.stdout + repeated.stderr, /above allowance/);

  write(dir, { [DEBT]: seeded.replace('"count":2', '"count":3') });
  const grown = run(dir);
  assert.notEqual(grown.status, 0, "raising the allowance in the same change fails against the trusted base");
  assert.match(grown.stdout + grown.stderr, /allowance growth/);
  assert.equal(run(dir, ["--write-shrink"]).status === 0, false, "--write-shrink refuses higher counts");

  write(dir, { [DEBT]: seeded, [file]: 'import type { RouteDeps } from "#src/server/routes/types";\nexport type F = RouteDeps;\n' });
  const stale = run(dir);
  assert.notEqual(stale.status, 0, "a lower live count leaves a stale allowance");
  assert.match(stale.stdout + stale.stderr, /update baseline/);
  assert.equal(run(dir, ["--write-shrink"]).status, 0);
  const shrunk = fs.readFileSync(path.join(dir, DEBT), "utf8");
  assert.match(shrunk, /"count":1/, "exact lower count");
  assert.equal(run(dir, ["--write-shrink"]).status, 0);
  assert.equal(fs.readFileSync(path.join(dir, DEBT), "utf8"), shrunk, "repeating --write-shrink produces identical bytes");
  assert.equal(run(dir).status, 0, "a shrink passes against the base");

  write(dir, { [file]: "export type F = string;\n" });
  assert.notEqual(run(dir).status, 0, "a removed edge needs a baseline update");
  assert.equal(run(dir, ["--write-shrink"]).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, DEBT), "utf8")).entries.length, 0, "zero rows are removed");
  assert.equal(run(dir).status, 0);
});

test("inventory validation runs against the trusted base and fails closed on an unreadable base", (t) => {
  const dir = workspace(t);
  const inventory = JSON.parse(fs.readFileSync(path.join(dir, INVENTORY), "utf8"));
  inventory.boundRoots = inventory.boundRoots.slice(1);
  inventory.rows = inventory.rows.slice(1);
  write(dir, { [INVENTORY]: `${JSON.stringify(inventory, null, 2)}\n` });
  assert.notEqual(run(dir).status, 0, "an unexplained dropped row or narrowed root fails");
  write(dir, { [INVENTORY]: null });
  assert.notEqual(run(dir).status, 0, "a missing inventory fails closed");
  git(dir, "checkout", "--", INVENTORY);
  assert.notEqual(run(dir, [], { EXTRACTION_BASE_REF: "no-such-ref" }).status, 0, "an unreadable base fails closed");
  assert.equal(run(dir, [], { EXTRACTION_BASE_REF: "0000000000000000000000000000000000000000" }).status, 0,
    "the zero SHA falls back to the previous or first commit");
});

test("GB.3: --with-report prints the website dependency-cruiser report byte-for-byte before the extraction section", (t) => {
  const dir = workspace(t, {
    ".dependency-cruiser.mjs": fs.readFileSync(path.join(REPO_ROOT, ".dependency-cruiser.mjs"), "utf8"),
    "development/boundaries/feature-ranks.json": fs.readFileSync(path.join(REPO_ROOT, "development/boundaries/feature-ranks.json"), "utf8"),
  });
  const old = spawnSync(process.execPath, [DEPCRUISE, "--config", ".dependency-cruiser.mjs", "apps/website/src"], { cwd: dir, encoding: "utf8" });
  const next = run(dir, ["--with-report"]);
  assert.equal(next.status, old.status, `exit behavior is preserved: ${next.stderr}`);
  const marker = next.stdout.indexOf("\n== extraction boundaries ==");
  assert.ok(marker >= 0, "the extraction section follows the report");
  assert.equal(next.stdout.slice(0, marker), old.stdout, "stdout before the extraction section is the old report, byte for byte");
});

test("package lookup is Node-style from the importer; installed @tovu workspace packages are external, missing @tovu aliases are protected", (t) => {
  const dir = workspace(t, {
    [`${A}/features/owner/owner-packages.ts`]: [
      'import { Shell } from "@jini-ai/admin/react";',
      'import { open } from "@jini-ai/admin/panels";',
      'import { hidden } from "@jini-ai/admin/private/x";',
      'import { sdk } from "@tovu/sdk";',
      'import { headless } from "@tovu/headless";',
      "export const all = [Shell, open, hidden, sdk, headless];",
      "",
    ].join("\n"),
  });
  // An app-local install, as apps/admin/node_modules/@jini-ai/admin is on the real tree.
  fs.cpSync(path.join(FIXTURE, "jini-exports-admin-app"), path.join(dir, "apps/admin/node_modules/@jini-ai"), { recursive: true });
  fs.mkdirSync(path.join(dir, "node_modules/@tovu/sdk"), { recursive: true });
  assert.deepEqual(findings(dir), [
    `bound-private-jini ${A}/features/owner/owner-packages.ts -> @jini-ai/admin/private/x [import] x1`,
    `unresolved-protected-alias ${A}/features/owner/owner-packages.ts -> @tovu/headless [import] x1`,
  ], "public app-local Jini entries and the installed @tovu/sdk workspace package pass");
});
