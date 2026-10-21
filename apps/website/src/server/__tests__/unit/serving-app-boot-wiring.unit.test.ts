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
      lines.some((line) => /(?:\bcreateServingApp|\(optional\.createServingApp \?\? createServingApp\))\(deps\)/.test(line)),
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
  assert.deepEqual(filesCalling(/(?<!function )(?:\bcreateServingApp\(|\(optional\.createServingApp \?\? createServingApp\)\()/), ["cli/commands/serve.ts", "index.ts"]);
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

test("the theme watcher starts only in the website's serving composition", () => {
  assert.deepEqual(filesCalling(/(?<!function )\bstartThemeWatcher\(/), ["server/runtime/composition/serving-app.ts"]);
});

for (const bootPath of ["index.ts", "cli/commands/serve.ts"]) {
  test(`${bootPath} owns the theme watcher through shutdown and listener closure`, () => {
    const source = readCodeLines(bootPath).join("\n");
    assert.match(source, /const \{[^}]*\bthemeWatcher\b[^}]*\} = (?:createServingApp|\(optional\.createServingApp \?\? createServingApp\))\(deps\)/);
    assert.match(source, /workers: \[[\s\S]*?\bthemeWatcher\b[\s\S]*?\]/);
    assert.match(source, /server\.once\("close", \(\) => \{\s*void themeWatcher\.stop\(\)/);
  });
}

test("cli/commands/serve.ts stops the trash sweeper on shutdown", () => {
  assert.ok(readCodeLines("cli/commands/serve.ts").some((line) => /\btrashSweeper\.stop\(\{\}\)/.test(line)));
});

/**
 * The Trash routes are mounted in exactly one place, and it is the `createApp()` both composition
 * roots go through — the hermetic one (`app.ts`'s own `createRouteDeps`) and the durable one
 * (`index.ts` -> `createSiteRouteDeps()` -> `createServingApp` -> `createApp`). `RouteDeps.trash`
 * is a required field, so tsc already makes each root supply a port; what it cannot see is a SECOND
 * mount somewhere, built over a different deps bag, which is how two surfaces of the same feature
 * start disagreeing about permissions. That the single mount really answers requests is proven over
 * HTTP in `server/__tests__/admin-trash-routes.test.ts`.
 */
test("createTrashModule is mounted by exactly one composition, and it is app.ts", () => {
  assert.deepEqual(filesCalling(/(?<!function )\bcreateTrashModule\(/), ["server/runtime/composition/app.ts"]);
});

/**
 * The default boot's store close waits for the boot work the composition started and never
 * awaited (2026-10-05), as `tovu serve`'s does: the legacy publish-credential tail and
 * `createServingApp`'s `bootWork` (the BYOK pass). Without it a site stopped seconds after boot
 * closed the store under them. `closeStoreOnShutdown`'s own suite proves the wait
 * (`close-store-on-shutdown-boot-work.test.ts`); this pins that index.ts feeds it both passes.
 */
test("index.ts hands the legacy tail and createServingApp's bootWork to the store close", () => {
  const source = readCodeLines("index.ts").join("\n");
  assert.match(source, /closeStoreOnShutdown\([^;]*\bbootWork: \(\) => bootWork\b/, "the store close must read the boot work list");
  assert.match(source, /bootWork\.push\(deps\.legacyPublishCredentialsReady\)/, "the legacy publish-credential tail must be awaited");
  // Other destructured fields (the drainer/sweeper handed to stopServing) may sit beside these two.
  assert.match(source, /const \{[^}]*\bbootWork: servingBootWork\b[^}]*\} = createServingApp\(deps\);/);
  assert.match(source, /bootWork\.push\(\.\.\.servingBootWork\)/, "createApp's BYOK pass must be awaited");
});

/**
 * Same "only there" rule for the automatic form pull (forms multi-destination P2): it imports a
 * static site's stored submissions and enqueues their events. A pull from the exporter, the CLI
 * outside `serve` or the enqueue-only agent daemon would run where no subscriber is attached and
 * nobody asked for it. Startup and owner/admin sign-in in a serving process are its only triggers.
 */
test("the automatic form pull trigger is built only by createServingApp, the only runner of autoPull", () => {
  assert.deepEqual(filesCalling(/(?<!function )\bcreateServingFormPullTrigger\(/), ["server/runtime/composition/serving-app.ts"]);
  assert.deepEqual(filesCalling(/(?<!function )\bcreateFormPullTrigger\(/), ["server/runtime/composition/form-pull-triggers.ts"]);
  assert.deepEqual(filesCalling(/\.formSubmissionsAutoPull\b/), ["server/runtime/composition/deps.ts", "server/runtime/composition/serving-app.ts"]);
  assert.deepEqual(filesCalling(/\bonAdminSignIn: formPull\.signIn\b/), ["server/runtime/composition/serving-app.ts"]);
});

test("createServingApp pulls once at startup, after createApp attached the subscribers", () => {
  const lines = readCodeLines("server/runtime/composition/serving-app.ts");
  const created = lines.findIndex((line) => /\bcreateApp\(routeDeps,/.test(line));
  const pulls = lines.flatMap((line, index) => (/\bformPull\.pullNow\(\)/.test(line) ? [index] : []));
  assert.equal(pulls.length, 1, "exactly one startup pull");
  assert.ok(created >= 0 && pulls[0]! > created, "the startup pull must follow createApp");
});

for (const bootPath of ["index.ts", "cli/commands/serve.ts"]) {
  test(`${bootPath} stops the automatic form pull trigger at shutdown`, () => {
    const source = readCodeLines(bootPath).join("\n");
    assert.match(source, /const \{[^}]*\bformPullTrigger\b[^}]*\} = (?:createServingApp|\(optional\.createServingApp \?\? createServingApp\))\(deps\)/);
    assert.match(source, /workers: \[[^\]]*\bformPullTrigger\b[^\]]*\]/);
  });
}

/**
 * The post go-live sweep (2026-10-21) enqueues `entry.published` for scheduled posts, so it has the
 * drainer's ownership rule: started only by `createServingApp`, after `createApp` subscribed the
 * handlers, and stopped by both serving boot paths before the store closes.
 */
test("the post go-live sweep is started only by createServingApp, after createApp", () => {
  assert.deepEqual(filesCalling(/(?<!function )\bstartPostGoLiveSweep\(/), ["server/runtime/composition/serving-app.ts"]);
  const lines = readCodeLines("server/runtime/composition/serving-app.ts");
  const created = lines.findIndex((line) => /\bcreateApp\(routeDeps,/.test(line));
  const started = lines.findIndex((line) => /\bstartPostGoLiveSweep\(/.test(line));
  assert.ok(created >= 0 && started > created, "the sweep must start after createApp");
});

for (const bootPath of ["index.ts", "cli/commands/serve.ts"]) {
  test(`${bootPath} stops the post go-live sweep at shutdown`, () => {
    const source = readCodeLines(bootPath).join("\n");
    assert.match(source, /const \{[^}]*\bpostGoLiveSweep\b[^}]*\} = (?:createServingApp|\(optional\.createServingApp \?\? createServingApp\))\(deps\)/);
    assert.match(source, /workers: \[[^\]]*\bpostGoLiveSweep\b[^\]]*\]/);
  });
}
