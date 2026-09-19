/**
 * @file Task 11 of the publish-content (Publish Content) feature — the architecture check the
 * owner-level ruling behind `features/publish-content/ui/` calls for: **nothing in this folder may
 * reach server code, and nothing in it may reach React.**
 *
 * Modeled on `../../__tests__/post-no-direct-registry-import.boundary.test.ts` (see that file for
 * why a test exists in ADDITION to `.dependency-cruiser.mjs`: `check:boundaries` is already red for
 * unrelated reasons and cannot signal one more violation, and it only covers `apps/website` anyway,
 * where this rule's real victim — the admin build — is not).
 *
 * ## Why each rule exists, concretely
 *
 * 1. **Reachability (`index.ts` closure stays inside `ui/`).** `apps/admin/tsconfig.json` includes
 *    exactly `ui/index.ts` and whatever its imports reach. `planner.ts` transitively imports
 *    `node:crypto` and `#src/...` subpath specifiers; admin has neither `@types/node` nor a `#src`
 *    path mapping. One `import type { … } from "../planner.js"` in a file `index.ts` reaches is
 *    enough to break `npx tsc --noEmit` in `apps/admin` — with an error pointing at a website file,
 *    which is a confusing morning for whoever hits it. `planner-contract-check.ts` deliberately sits
 *    OUTSIDE that closure for exactly this reason, and this test is what keeps it there.
 * 2. **No server value imports, anywhere under `ui/`.** Even a file outside the `index.ts` closure
 *    must not pull `node:*`, a repo, `planner.ts` or `baseline-repo.ts` in at runtime: the whole
 *    folder is shipped into a browser bundle by admin's Vite, and Vite resolves by directory, not by
 *    tsconfig `include`. Type-only edges are exempt — they are erased at compile time and are how
 *    `planner-contract-check.ts` does its job.
 * 3. **No React, not even type-only, and no `.tsx`.** Admin dedupes React across five copies
 *    (`apps/admin/vite.config.ts` `resolve.dedupe`, because each `@jini-ai/*` package bundles its
 *    own); a React dependency declared under `apps/website` would sit outside that dedupe and hand a
 *    component one instance's hooks against another instance's null dispatcher. `apps/website/src`
 *    also contains zero `.tsx` files and the root tsconfig has no `"jsx"` setting, so a component
 *    here would force JSX config and React into the server package permanently.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const UI_ROOT = path.resolve(import.meta.dirname, "..");
const INDEX_FILE = path.join(UI_ROOT, "index.ts");

/** Matches a whole `import ... from "spec"` statement (value or type), capturing whether the `type`
 *  keyword appears immediately after `import`, and the specifier text — copied verbatim from
 *  `post-no-direct-registry-import.boundary.test.ts` (see that file for why the lazy gap needs
 *  comment-stripped input first). */
const IMPORT_STATEMENT_PATTERN = /\bimport\s+(type\s+)?(?:[^;]*?)\bfrom\s*(["'])([^"']+)\2/g;
/** `export … from "spec"` re-exports are module edges too — `index.ts` is built almost entirely out
 *  of them, so a reachability walk that only looked at `import` would walk nothing at all. */
const EXPORT_STATEMENT_PATTERN = /\bexport\s+(type\s+)?(?:[^;]*?)\bfrom\s*(["'])([^"']+)\2/g;

const REACT_SPECIFIER_PATTERN = /^react(-dom)?(\/|$)/;

/** Value-import specifiers that would put server-only code into a browser bundle. Checked as
 *  prefixes/patterns rather than a resolved-path test so a specifier this repo cannot resolve from
 *  a test process (`#src/...`) is still caught. */
const SERVER_VALUE_IMPORT_PATTERNS: ReadonlyArray<{ readonly label: string; readonly test: (spec: string) => boolean }> = [
  { label: "a node: builtin", test: (s) => s.startsWith("node:") },
  { label: "a #src/… server subpath", test: (s) => s.startsWith("#src/") },
  { label: "better-sqlite3", test: (s) => s === "better-sqlite3" || s.startsWith("better-sqlite3/") },
  { label: "a @jini-ai/… package", test: (s) => s.startsWith("@jini-ai/") },
];
// A RELATIVE specifier leaving `ui/` (planner.ts, baseline-repo.ts, run-repo.ts, apply-loop.ts —
// every one of them server code) is caught by the resolved-path branch below instead, which does
// not need a pattern.

interface ModuleEdge {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function edgesOf(file: string): readonly ModuleEdge[] {
  const source = stripComments(fs.readFileSync(file, "utf8"));
  const edges: ModuleEdge[] = [];
  for (const pattern of [IMPORT_STATEMENT_PATTERN, EXPORT_STATEMENT_PATTERN]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      edges.push({ specifier: match[3], typeOnly: Boolean(match[1]) });
    }
  }
  return edges;
}

/** Resolves a relative `.js` specifier back to the `.ts` file it was written against (both TS
 *  programs that compile this folder use `.js` extensions — the root's `moduleResolution: nodenext`
 *  requires them, admin's `bundler` tolerates them). Returns `null` for a bare specifier. */
function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const joined = path.resolve(path.dirname(fromFile), specifier);
  return joined.endsWith(".js") ? `${joined.slice(0, -".js".length)}.ts` : `${joined}.ts`;
}

function collectUiFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectUiFiles(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
}

const UI_FILES = (() => {
  const out: string[] = [];
  collectUiFiles(UI_ROOT, out);
  return out;
})();

function relative(file: string): string {
  return path.relative(UI_ROOT, file);
}

test("the boundary test actually found this folder's source files", () => {
  // Without this, every assertion below would vacuously pass on an empty list — the exact failure
  // mode a sibling agent shipped tonight.
  assert.ok(UI_FILES.length >= 4, `expected features/publish-content/ui/ to hold source files, found ${UI_FILES.length}`);
  assert.ok(UI_FILES.includes(INDEX_FILE), "features/publish-content/ui/index.ts must exist — it is the admin package's entrypoint");
});

test("features/publish-content/ui/ contains no .tsx file", () => {
  const tsx = UI_FILES.filter((file) => file.endsWith(".tsx")).map(relative);
  assert.deepEqual(
    tsx,
    [],
    `features/publish-content/ui/ must stay pure TypeScript — React components belong in apps/admin. Found: ${tsx.join(", ")}`
  );
});

test("no file under features/publish-content/ui/ imports React, not even type-only", () => {
  const offenders: string[] = [];
  for (const file of UI_FILES) {
    for (const edge of edgesOf(file)) {
      if (REACT_SPECIFIER_PATTERN.test(edge.specifier)) offenders.push(`${relative(file)} -> ${edge.specifier}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "features/publish-content/ui/ must never depend on React: apps/admin dedupes React across five copies " +
      "(vite.config.ts resolve.dedupe) and a copy declared under apps/website would sit outside that dedupe. " +
      `Found: ${offenders.join(", ")}`
  );
});

test("no file under features/publish-content/ui/ takes a VALUE import on server code", () => {
  const offenders: string[] = [];
  for (const file of UI_FILES) {
    for (const edge of edgesOf(file)) {
      if (edge.typeOnly) continue;
      const resolved = resolveRelative(file, edge.specifier);
      if (resolved !== null) {
        if (!resolved.startsWith(`${UI_ROOT}${path.sep}`)) {
          offenders.push(`${relative(file)} -> ${edge.specifier} (a module outside features/publish-content/ui/)`);
        }
        continue;
      }
      const hit = SERVER_VALUE_IMPORT_PATTERNS.find((rule) => rule.test(edge.specifier));
      if (hit) offenders.push(`${relative(file)} -> ${edge.specifier} (${hit.label})`);
      else offenders.push(`${relative(file)} -> ${edge.specifier} (an unvetted bare package)`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "features/publish-content/ui/ is bundled into the admin SPA by Vite, which resolves by directory rather than " +
      `by tsconfig include — a value edge out of this folder ships server code to a browser. Found: ${offenders.join(", ")}`
  );
});

test("everything reachable from index.ts — type edges included — stays inside features/publish-content/ui/", () => {
  const visited = new Set<string>();
  const escapes: string[] = [];
  const queue = [INDEX_FILE];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const edge of edgesOf(file)) {
      const resolved = resolveRelative(file, edge.specifier);
      if (resolved === null || !resolved.startsWith(`${UI_ROOT}${path.sep}`)) {
        escapes.push(`${relative(file)} -> ${edge.specifier}`);
        continue;
      }
      queue.push(resolved);
    }
  }

  assert.deepEqual(
    escapes,
    [],
    "apps/admin's tsconfig includes exactly features/publish-content/ui/index.ts and whatever it reaches. " +
      "planner.ts transitively imports node:crypto and #src/… specifiers, which apps/admin can resolve neither of — " +
      `so ANY edge (value or type) out of this closure breaks the admin typecheck. Found: ${escapes.join(", ")}`
  );
  assert.ok(visited.size >= 3, `expected index.ts to reach this folder's modules, walked only ${visited.size}`);
});

test("planner-contract-check.ts is deliberately OUTSIDE the index.ts closure, and still type-checks the planner", () => {
  const checkFile = path.join(UI_ROOT, "planner-contract-check.ts");
  assert.ok(fs.existsSync(checkFile), "planner-contract-check.ts is the only thing stopping ui/contract.ts drifting from planner.ts");

  const edges = edgesOf(checkFile);
  const plannerEdge = edges.find((edge) => edge.specifier === "../planner.js");
  assert.ok(plannerEdge, "planner-contract-check.ts must import the planner's own types — that is its entire job");
  assert.equal(plannerEdge.typeOnly, true, "planner-contract-check.ts's planner edge must stay `import type` — a value edge would bundle node:crypto");

  const reachedFromIndex = edgesOf(INDEX_FILE).some((edge) => resolveRelative(INDEX_FILE, edge.specifier) === checkFile);
  assert.equal(reachedFromIndex, false, "index.ts must never re-export planner-contract-check.ts — it would drag planner.ts into the admin program");
});
