import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Wiring proof that the background outbox drainer starts in every site-serving runtime, and
 * only there (2026-09-14).
 *
 * Runtimes: `src/index.ts` serves the dev API and the container image (`Dockerfile` CMD
 * `node dist/src/index.js`); `cli/commands/serve.ts` is `tovu serve`, which the desktop app spawns
 * for every site window. Neither file can be imported by a test (both boot a real server), so this
 * reads their source. What the drainer does is proven by
 * `server/__tests__/integration/serving-app-outbox-drain.integration.test.ts`.
 *
 * "Only there" matters as much as "there": a drain in a process without the site's subscribers
 * (the agent daemon, the export CLI, `app.ts`'s eager module-level app) marks rows delivered that no
 * real subscriber saw. So `createServingApp` may be called only by the two boot paths, and
 * `startOutboxDrainer` only by `createServingApp`.
 */

const SRC_ROOT = path.join(import.meta.dirname, "../../..");

/** Code lines only: doc comments throughout `src/` mention these functions in prose. */
function codeLines(source: string): string[] {
  return source.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

function readCodeLines(relativePath: string): string[] {
  return codeLines(readFileSync(path.join(SRC_ROOT, relativePath), "utf8"));
}

/** Every production `.ts` file under `src/`, relative and `/`-separated; test files excluded. */
function productionSourceFiles(dir = SRC_ROOT): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") files.push(...productionSourceFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(path.relative(SRC_ROOT, full).split(path.sep).join("/"));
    }
  }
  return files;
}

function filesCalling(pattern: RegExp): string[] {
  return productionSourceFiles()
    .filter((file) => readCodeLines(file).some((line) => pattern.test(line)))
    .sort();
}

for (const bootPath of ["index.ts", "cli/commands/serve.ts"]) {
  test(`${bootPath} builds its app with createServingApp, never a bare createApp`, () => {
    const lines = readCodeLines(bootPath);
    assert.ok(
      lines.some((line) => /\bcreateServingApp\(deps\)/.test(line)),
      `${bootPath} must call createServingApp(deps) so the outbox drainer starts after createApp's subscribers`,
    );
    assert.deepEqual(
      lines.filter((line) => /\bcreateApp\(/.test(line)),
      [],
      `a bare createApp() in ${bootPath} would serve the site with nothing draining the outbox`,
    );
  });
}

test("cli/commands/serve.ts stops the outbox drainer on shutdown", () => {
  assert.ok(readCodeLines("cli/commands/serve.ts").some((line) => /\boutboxDrainer\.stop\(\)/.test(line)));
});

test("createServingApp is called only by the two site-serving boot paths", () => {
  assert.deepEqual(filesCalling(/(?<!function )\bcreateServingApp\(/), ["cli/commands/serve.ts", "index.ts"]);
});

test("startOutboxDrainer is called only by createServingApp", () => {
  assert.deepEqual(filesCalling(/(?<!function )\bstartOutboxDrainer\(/), ["server/runtime/composition/serving-app.ts"]);
});

/**
 * Same "only there" rule for the Trash auto-purge sweeper (2026-09-20), for a sharper reason than
 * the drainer's: a sweep HARD-DELETES rows. Started in the exporter, in `app.ts`'s eager
 * module-level app or in the agent daemon, it would permanently delete a site's content from a
 * process nobody is watching and nobody asked to run.
 */
test("startTrashSweeper is called only by createServingApp", () => {
  assert.deepEqual(filesCalling(/(?<!function )\bstartTrashSweeper\(/), ["server/runtime/composition/serving-app.ts"]);
});

test("cli/commands/serve.ts stops the trash sweeper on shutdown", () => {
  assert.ok(readCodeLines("cli/commands/serve.ts").some((line) => /\btrashSweeper\.stop\(\)/.test(line)));
});

/**
 * The Trash routes are mounted in exactly one place, and it is the `createApp()` both composition
 * roots go through — the hermetic one (`app.ts`'s own `createRouteDeps`) and the durable one
 * (`index.ts` -> `createSqliteRouteDeps()` -> `createServingApp` -> `createApp`). `RouteDeps.trash`
 * is a required field, so tsc already makes each root supply a port; what it cannot see is a SECOND
 * mount somewhere, built over a different deps bag, which is how two surfaces of the same feature
 * start disagreeing about permissions. That the single mount really answers requests is proven over
 * HTTP in `server/__tests__/admin-trash-routes.test.ts`.
 */
test("createTrashModule is mounted by exactly one composition, and it is app.ts", () => {
  assert.deepEqual(filesCalling(/(?<!function )\bcreateTrashModule\(/), ["server/runtime/composition/app.ts"]);
});
