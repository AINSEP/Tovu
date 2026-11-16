# audit:D08 published-types / registry drift -> existing `@jini-ai/devops/checks/published-types` (template T-HARDEN, one slice)

Written 2026-11-16 from Tovu `refactor/terra` b28d38c6 / Jini `refactor/terra` b7666092 (unattended planning run; nothing executed).
untangle_overlap: none (no `*.repoint.tsv` row names these three scripts or `packages/devops/src/checks/**`; no `wave-b/*` branch touches `packages/devops`). Runs before or after the wave-B merge.
Published check (npm, 2026-11-16): `@jini-ai/devops@0.7.0` already ships `./checks/published-types` (`check`, `diagnosePublishedTypes`, `parseDiagnosticBlocks`, `registryDependencies`) and `./checks/node` (`createNodeFilesystem`, `createNodeProcessRunner`, `createNpmInstaller`). Only the two NEW options below (`pins`, `keepScratch`) need the next coordinated publish; until then `--pin` is honoured only in a linked (D1) checkout — see risk R1.
Tier: Sonnet 5.5 high executor + Opus review of the Tovu report mapping (~55k).

## Label correction
Audit kind DEDUPE; it is a **HARDEN**: Jini lacks two Tovu capabilities (P1 `--pin`, P2 keep-scratch debugging). Everything else in Jini is a superset (sequential projects, refuses to overwrite an existing shadow scope, rejects linked scoped installs, CRLF, global `error TS` lines, a non-diagnostic compiler failure never passes).

```
id: HD-published-types-1
feature: audit:D08 development/scripts (published-types repoint)
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base
tovu_files:
  - development/scripts/check-jini-registry-drift.mjs | blob 6d2dc87bcc374d2d625220cb5008224a6517f84a | reduce-to-binding
  - development/scripts/check-no-linked-jini.mjs | blob 4ddeebe422d690a49913001f205a65163ad0b7b8 | reduce-to-binding
  - development/scripts/diagnose-jini-typecheck-failure.mjs | blob fb3591248bc5133cdcf8b2f4cbbf65363d8cf243 | reduce-to-binding
  - development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts | blob 1159778f559654d3e392128a7150a575801c2900 | add failing test T1
jini_guards:
  - packages/devops/src/checks/published-types/index.ts | blob 9672acc5fa2e1a14401c6037cd3329e419f53125
  - packages/devops/src/checks/published-types/__tests__/published-types.test.ts | blob 489e2f2aa25145db8b82a670a327eb754a48e2a4
jini_survivor: @jini-ai/devops/checks/published-types {check, diagnosePublishedTypes, parseDiagnosticBlocks, PublishedTypesResult} at packages/devops/src/checks/published-types/index.ts:186,211,53,25 ; @jini-ai/devops/checks/node {createNodeFilesystem, createNodeProcessRunner, createNpmInstaller} at packages/devops/src/checks/node.ts:13,45,59
parity:
  - P1: `--pin name=version` adds/replaces a registry spec for the compile run (used to prove the gate catches a known-bad version, header l.29-31) | Tovu check-jini-registry-drift.mjs:295 (`{ ...readJiniDependencies(project.dir), ...pinOverrides }`) + parseArgs l.388 | Jini absent | generic? yes -> `check` optional `pins`
  - P2: keep the scratch install for debugging | Tovu l.~372 `if (!process.env.DEBUG_KEEP_SCRATCH) rmSync(scratchRoot…)` | Jini absent (always removes) | generic? yes -> `check` optional `keepScratch` (env NAME stays in Tovu, rule 8)
  - P3 (doc only): why one-or-two quote characters | Tovu diagnose-jini-typecheck-failure.mjs:27-29 comment | Jini diagnosePublishedTypes l.214 has the regex, no why | moves to Jini (rule 12)
behaviour_diff (Tovu -> Jini, adopted; none changes the PASS/FAIL verdict on a healthy run):
  - B1 tsconfig: Tovu type-checks a generated absolutized copy (compilerOptions/include/exclude only, written into the scratch dir) / Jini runs the host's compiler request against the REAL config (`tsc --noEmit -p <dir>/tsconfig.json`). Both tsconfigs have no `extends`/`references`/`files` (checked: root keys esModuleInterop…types, include, exclude; admin adds paths), so the generated copy was equivalent; drift compares baseline vs registry on the same config either way. Proof owed by the cloud run: R2.
  - B2 projects run sequentially (Tovu `Promise.all`) / slower, output order unchanged (PROJECTS order).
  - B3 scratch dir: Tovu fixed `<dir>/node_modules/.tovu-jini-registry-check` (rm first) / Jini `mkdtemp` under `scratchParent` = `<dir>/node_modules`, prefix `published-types-`.
  - B4 shadow: Tovu deletes-and-replaces existing `<anchor>/node_modules/@jini-ai/<pkg>` dirs / Jini refuses (operation-error) if the scope dir already exists. Today neither `apps/website/node_modules` nor `apps/admin/src/node_modules` exists, so no change on a clean tree; a leftover from a killed run now fails loudly instead of being overwritten.
  - B5 non-diagnostic failure: Tovu reports PASS when the registry tsc fails with no `file(l,c): error TS` blocks (e.g. only a global `error TS5xxx`) / Jini `typecheck-error` (FAIL). Fixes a false pass; Jini test "non-diagnostic compiler failure … never passes" pins it.
  - B6 new FAIL statuses printed by Tovu: `operation-error` (unreadable manifest, invalid name, shadow conflict, cleanup error), `typecheck-error`, `prerequisite-error` (none configured), `linked` (installed scope is a symlink). Tovu today crashes into `[check-jini-registry-drift] unexpected failure:` for the first; T1 pins the new output.
  - B7 npm install args: Tovu `install --no-audit --no-fund --no-package-lock --workspaces=false` / Jini default adds `--ignore-scripts` -> Tovu passes its own args (same as today).
  - B8 process timeout: Tovu none / Jini runner default 300 s -> Tovu passes `timeoutMs: 0` (no timeout, same as today).
  - B9 no-linked: Jini `links` mode reads dependencies+devDependencies and skips `workspace:`/`link:` specs; Tovu also reads optional/peer deps and checks `workspace:`/`link:` names. Checked all four Tovu manifests: no `@jini-ai/*` optional/peer dependency and no workspace:/link: spec exists -> unreachable. Missing package.json: Tovu passes / Jini `operation-error` -> binding keeps Tovu's early return.
  - B10 diagnose: same regexes, same hit text and order (export hits before module hits); Tovu reads the log files and keeps every console line.
wire_drift: -   (status names are new output only; no saved data or client reads them)
```

## Jini (commit 1)

### jini_failing_tests (append to packages/devops/src/checks/published-types/__tests__/published-types.test.ts; add `readdirSync` to its `node:fs` import)
```ts
test('pins add or replace scoped registry specs for compile projects', async () => {
  const f = fixture();
  f.installer.install.mockImplementation(async ({ directory }) => {
    const manifest = JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8'));
    expect(manifest.dependencies).toEqual({ '@example/core': '1.0.0', '@example/extra': '2.0.0' });
    for (const name of ['core', 'extra']) {
      const dir = path.join(directory, 'node_modules', '@example', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'package.json'), '{"version":"9.9.9"}');
    }
    return pass;
  });
  const report = await check(f.args, { pins: { '@example/core': '1.0.0', '@example/extra': '2.0.0' } });
  expect(report.projects[0]?.versions).toEqual({ '@example/core': '9.9.9', '@example/extra': '9.9.9' });
});

test('a pin outside the scope is a caller error', async () => {
  const f = fixture();
  await expect(check(f.args, { pins: { 'other/core': '1.0.0' } })).rejects.toThrow(TypeError);
  expect(f.installer.install).not.toHaveBeenCalled();
});

test('keepScratch leaves the scratch install for inspection; the default removes it', async () => {
  const scratchDirs = (dir: string) => readdirSync(dir).filter((name) => name.startsWith('published-types-'));
  const f = fixture();
  await check(f.args);
  expect(scratchDirs(f.directory)).toEqual([]);
  await check(f.args, { keepScratch: true });
  expect(scratchDirs(f.directory)).toHaveLength(1);
});
```

### jini_change (packages/devops/src/checks/published-types/index.ts; exact)
1. After `validateScope` (l.36-39) add:
```ts
/** Pins must name packages inside the checked scope; anything else is a caller error, not a project failure. */
function validatePins(pins: Readonly<Record<string, string>>, scope: string): void {
  const name = new RegExp(`^${escapeRegex(scope)}/[a-z0-9][a-z0-9._-]*$`);
  for (const pinned of Object.keys(pins)) if (!name.test(pinned)) throw new TypeError(`pin outside scope ${scope}: ${pinned}`);
}
```
2. `check` signature: `}, { logger }: { logger?: CheckLoggerPort } = {}): Promise<PublishedTypesReport> {` ->
```ts
}, { logger, pins = {}, keepScratch = false }: {
  logger?: CheckLoggerPort;
  /** Registry specs that add to or replace the manifest's scoped dependencies for compile projects (e.g. to prove the gate fails on a known-bad version). */
  pins?: Readonly<Record<string, string>>;
  /** Leave each scratch install on disk for inspection instead of removing it. */
  keepScratch?: boolean;
} = {}): Promise<PublishedTypesReport> {
```
   and after `validateScope(scope);` in `check` add `validatePins(pins, scope);`.
3. In the loop: `const deps = registryDependencies({ manifest, scope });` -> `const deps = { ...registryDependencies({ manifest, scope }), ...(project.mode === 'links' ? {} : pins) };`
   and `await checkCompile(project, manifest, deps, scope, fs, runner, installer)` -> `await checkCompile(project, manifest, deps, scope, fs, runner, installer, keepScratch)`.
4. `checkCompile` gains a last parameter `keepScratch: boolean` (internal, unexported; rule 10 binds exported functions) and its `finally { fs.removeDirectory({ path: scratch }); }` -> `finally { if (!keepScratch) fs.removeDirectory({ path: scratch }); }`. If eslint `max-params` errors on the changed line, instead pass `{ keepScratch }` as an options object `checkCompile(…, installer, { keepScratch })`.
5. P3: above `const missingExport = …` (l.214) add: `// tsc wraps a module specifier in its own single quotes around the source's double quotes ('"@scope/pkg"'), so match one or two quote characters on each side.`
Defaults: `pins = {}` and `keepScratch = false` reproduce today's Jini behaviour for every existing caller (no other caller in Jini: `rg -n "published-types" packages --glob '!packages/devops/**'` must print nothing; else STOP).

```
new_options:
  - check optional.pins: Readonly<Record<string,string>> default {} (no added specs)
  - check optional.keepScratch: boolean default false (scratch removed, as today)
changeset: .changeset/devops-published-types-pins.md -> `"@jini-ai/devops": minor` | "`check` from `@jini-ai/devops/checks/published-types` accepts `pins` (add or replace scoped registry specs for compile projects) and `keepScratch`."
jini_msg: "feat(devops): published-types check takes pins and keepScratch"
```

## Tovu (commit 2)

### tovu_binding_or_repoint
**check-jini-registry-drift.mjs** — keep header l.1-69 verbatim (the REDIRECTION MECHANISM and SCOPE sections still describe what the shadow anchors do). Replace l.70-460 with (re-read l.402-460 and copy every quoted console string byte for byte; the strings below are those strings):
```js
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { check, parseDiagnosticBlocks } from "@jini-ai/devops/checks/published-types";
import { createNodeFilesystem, createNodeProcessRunner, createNpmInstaller } from "@jini-ai/devops/checks/node";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** CI type-checks exactly these two projects; `shadowAnchor` is the closer ancestor described in the header. */
const PROJECTS = [
  { key: "root", directory: REPO_ROOT, label: "root (apps/website, tsconfig.json)", shadowAnchor: path.join(REPO_ROOT, "apps", "website") },
  { key: "admin", directory: path.join(REPO_ROOT, "apps", "admin"), label: "apps/admin", shadowAnchor: path.join(REPO_ROOT, "apps", "admin", "src") },
];
const NPM_INSTALL_ARGS = ["install", "--no-audit", "--no-fund", "--no-package-lock", "--workspaces=false"];

function compileProject({ key, directory, shadowAnchor }) {
  return {
    key, directory, shadowAnchor, mode: "drift", prerequisites: [],
    manifestPath: path.join(directory, "package.json"),
    scratchParent: path.join(directory, "node_modules"),
    compiler: { command: path.join(directory, "node_modules", ".bin", "tsc"), args: ["--noEmit", "-p", path.join(directory, "tsconfig.json")], cwd: directory },
  };
}
```
then KEEP `indent` (l.377-383) and `parseArgs` (l.388-400) unchanged, then:
```js
function reportVersions(result) {
  return Object.entries(result.versions).map(([name, version]) => `    ${name}@${version}`).join("\n");
}

function reportRegistryResult({ result, label }, _options = {}) {
  console.log(`\n--- ${label} ---`);
  if (result.status === "skipped") {
    console.log("  SKIP  no registry-resolved @jini-ai/* dependencies");
    return false;
  }
  if (result.status === "install-error") {
    console.log("  FAIL  could not install the pinned @jini-ai/* versions from the registry:");
    console.log(indent(result.output));
    return true;
  }
  if (result.status === "pass") {
    console.log(`  PASS  ${Object.keys(result.versions).length} package(s) type-check clean against the registry:`);
    console.log(reportVersions(result));
    const preexisting = parseDiagnosticBlocks({ output: result.output }).length;
    if (preexisting > 0) console.log(`  (note: ${preexisting} pre-existing local tsc error(s) unrelated to @jini-ai/* (identical against the real, local Jini checkout))`);
    return false;
  }
  if (result.status === "drift") {
    console.log("  FAIL  source uses a @jini-ai/* symbol not present in the registry-published version:");
    console.log(reportVersions(result));
    console.log("");
    console.log(indent(result.diagnostics.join("\n\n")));
    return true;
  }
  console.log(`  FAIL  ${result.status}:`);
  console.log(indent(result.output));
  return true;
}

async function main() {
  const pins = parseArgs(process.argv.slice(2));
  const runner = createNodeProcessRunner({}, { timeoutMs: 0 });
  const projects = PROJECTS.map(compileProject);
  const report = await check({
    projects, scope: "@jini-ai", fs: createNodeFilesystem({}), runner,
    installer: createNpmInstaller({ runner, command: "npm" }, { args: NPM_INSTALL_ARGS }),
  }, { pins, keepScratch: Boolean(process.env.DEBUG_KEEP_SCRATCH) });
  let failed = false;
  report.projects.forEach((result, index) => {
    if (reportRegistryResult({ result, label: PROJECTS[index].label })) failed = true;
  });
  console.log("");
  // (keep the existing `if (failed) { console.error(…5 deploys…); process.exitCode = 1; } else { console.log(…all pinned…) }` block l.~443-455 verbatim)
}
```
A missing `node_modules` is NOT pre-checked: Jini reports `operation-error` from `createTempDirectory` and the generic FAIL branch prints it. Keep the existing `main().catch(…)` tail (l.457-460) verbatim. The note line keeps Tovu's previous text: "pre-existing" count is the registry run's diagnostic blocks, all of which the baseline also had (status pass), exactly as Tovu computed `registryBlocks.length`.

**check-no-linked-jini.mjs** — keep header l.1-17 and the `registryDependencyNames` doc l.22-26. Replace the body from l.19 with:
```js
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { check } from "@jini-ai/devops/checks/published-types";
import { createNodeFilesystem, createNodeProcessRunner, createNpmInstaller } from "@jini-ai/devops/checks/node";

function readManifest(packageDir) {
  try {
    return JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
}

// (doc l.22-26 here)
function rejectFileSpecs(manifest) {
  const specs = { ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies, ...manifest.devDependencies };
  const local = Object.entries(specs).filter(([name, spec]) => name.startsWith("@jini-ai/") && spec.startsWith("file:"));
  if (local.length) {
    // (copy the existing console.error(...) + process.exit(1) lines l.36-39 verbatim)
  }
}

const cwd = process.cwd();
const manifest = readManifest(cwd);
if (manifest) {
  rejectFileSpecs(manifest);
  const runner = createNodeProcessRunner({});
  const report = await check({
    projects: [{ key: "build", mode: "links", directory: cwd, manifestPath: path.join(cwd, "package.json") }],
    scope: "@jini-ai", fs: createNodeFilesystem({}), runner, installer: createNpmInstaller({ runner, command: "npm" }),
  });
  const [result] = report.projects;
  if (result.status === "linked") {
    // (existing console.error block l.61-69, with `linked.length` -> `result.linkedPackages.length` and
    //  `linked.map((name) => \`  - @jini-ai/${name}\`)` -> `result.linkedPackages.map((name) => \`  - ${name}\`)`; the printed text is identical)
    process.exit(1);
  }
  if (result.status !== "pass") {
    console.error(`\nBuild blocked: could not check ${cwd} for npm-linked @jini-ai/* packages: ${result.output}\n`);
    process.exit(1);
  }
}
```
(The runner/installer are required by the `check` signature and unused in links mode.) `development/scripts/__tests__/check-no-linked-jini.test.ts` (blob cf98589a342d1e219ae89c16805beefa43afed47) is unchanged and must stay green: its three cases (file / linked / registry) keep the same exit codes and stderr matches.

**diagnose-jini-typecheck-failure.mjs** — keep header l.1-20, `parseArgs`, every console line in `main`. Delete `SIGNATURE_PATTERNS` (l.23-40) and `findSignatureHits` (l.42-49) — their why-comment moved to Jini (P3). Import `import { diagnosePublishedTypes } from "@jini-ai/devops/checks/published-types";`. In `main`, replace the `hitsByFile` computation with:
```js
  const logs = failing.map(({ exitCode, logFile }) => {
    let log = "";
    try {
      log = readFileSync(logFile, "utf8");
    } catch {
      // Missing log file (e.g. an earlier step never ran) — nothing to scan, no hits.
    }
    return { projectKey: logFile, exitCode, stdout: log, stderr: "" };
  });
  const hitsByFile = diagnosePublishedTypes({ scope: "@jini-ai", logs }).failures
    .filter((entry) => entry.hits.length > 0)
    .map((entry) => ({ logFile: entry.projectKey, hits: entry.hits }));
```
The banner loop `for (const { logFile, hits } of hitsByFile)` is unchanged.

### tovu failing test FIRST — T1 (append to development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts, beside "registry drift CLI skips projects…")
```ts
test('registry drift CLI reports an unreadable manifest as a project failure, not a crash', t => {
  const f = fixture(t, ['check-jini-registry-drift.mjs']);
  f.write('apps/admin/package.json', '{not json');
  const result = f.run('check-jini-registry-drift.mjs');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /--- apps\/admin ---\n  FAIL  operation-error:/);
  assert.doesNotMatch(result.stderr, /unexpected failure/);
});
```
RED on the parent (old script throws -> `unexpected failure` on stderr), GREEN on the commit. The existing "skips projects with no registry Jini dependencies" test must stay green unchanged (both manifests `{"type":"module"}` -> two `SKIP  no registry-resolved @jini-ai/* dependencies`).

```
tovu_tests: af-cli-characterization (T1 added, existing registry-drift test unchanged); check-no-linked-jini.test.ts unchanged; no Tovu unit test exists for diagnose-jini-typecheck-failure.mjs (Jini "diagnoses missing scoped exports/modules…" covers the matcher)
census: rg -n "check-jini-registry-drift|check-no-linked-jini|diagnose-jini-typecheck-failure" -g '!node_modules' . | allowed: [package.json:32,80; apps/admin/package.json:12; apps/site-chat/package.json:9; apps/desktop/package.json:22; knip.json:31,33,47; .github/workflows/jini-published-typecheck.yml:53,102,107; development/scripts/__tests__/check-no-linked-jini.test.ts:9; development/scripts/__tests__/unit/af-cli-characterization.unit.test.ts; the three scripts' own headers; development/scripts/README.md if present] — paths are unchanged, so no edits outside the four files.
checks: node --check on the three .mjs
tovu_msg: "refactor(scripts): Jini publish-drift guards run on @jini-ai/devops/checks/published-types" | body "Registry drift now fails (instead of passing) when the registry compile errors without per-file diagnostics, refuses to overwrite a leftover shadow scope, runs the two projects one after the other, and reports an unreadable manifest as a project failure."
```

## Risks / owed proofs (cloud run)
- R1 `--pin` needs the Jini `pins` option: in a registry-only checkout on `@jini-ai/devops@0.7.x` the option is silently ignored. The Tovu commit must land in the same batch as the next coordinated Jini publish, or the cloud run verifies with the D1 link. Do not bump Tovu's `^0.7.0` pin here (lockfile rule).
- R2 Gate proof (the header's own method, l.29-31): `npm run check:jini-registry-drift -- --pin @jini-ai/agent-runtime=0.3.1` must FAIL with a `reasoningInModelId` drift block; without `--pin` it must report the same PASS/SKIP lines as the parent commit. Record both outputs.
- R3 `check-no-linked-jini.mjs` is the first line of every `build` script; it now imports `@jini-ai/devops`, which the ROOT manifest declares. It resolves from the script's own location (root `node_modules`), so `apps/admin` / `apps/site-chat` builds work only where the root install exists — true for the Dockerfile (`COPY . .` then root `npm install`) and CI. If the cloud run finds any build that runs without a root install, SKIP this file's edit and report.
