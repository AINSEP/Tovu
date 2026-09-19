/**
 * @file Task 2 of the content-transport (Publish Content) feature — the architecture check plan §3
 * calls for: no runtime import edge from `features/post` into `type-registry.ts`.
 *
 * Modeled directly on `assistant/__tests__/domain-no-direct-tool-registration.boundary.test.ts` (see
 * that file's own header for the full rationale of "a test in ADDITION to `.dependency-cruiser.mjs`",
 * since `check:boundaries` is already red for unrelated reasons and cannot signal one more violation).
 *
 * Why this edge matters here specifically: plan §3's own stated trap is that `features/post ->
 * assistant` VALUE edges have previously closed real module cycles and had to be removed by
 * injecting the dependency instead (`duplicate-resource-registry.ts`'s header tells that exact
 * story). `contributePostTransport()`/`contributePageTransport()` (`features/post/content-transport.ts`)
 * must return DATA (a `ContentTransportContributor`) for the composition root to register — if
 * `features/post` ever calls `registerContentTransportContributor` itself, it reopens the identical
 * cycle risk this feature was designed from the start to avoid.
 *
 * `import type { ... } from "../type-registry.js"` IS exempt, for the same reason the tool-contribution
 * boundary test exempts `import type { ToolContributor }`: a type-only edge is erased at compile time
 * (no runtime module edge — `check:architecture`'s own module-cycle metric is computed on the
 * runtime-only graph) and every `contribute*Transport()` genuinely needs the type to declare its own
 * return value.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../..");
const SRC_ROOT = path.join(REPO_ROOT, "apps", "website", "src");
const POST_ROOT = path.join(SRC_ROOT, "features", "post");
const REGISTRY_FILE = path.join(SRC_ROOT, "features", "content-transport", "type-registry.ts");

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", "__tests__"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/** Matches a whole `import ... from "spec"` statement (value or type), capturing whether the
 *  `type` keyword appears immediately after `import`, and the specifier text — copied verbatim from
 *  `domain-no-direct-tool-registration.boundary.test.ts` (see that file's own doc for why the lazy
 *  gap needs comment-stripped input first). */
const IMPORT_STATEMENT_PATTERN = /\bimport\s+(type\s+)?(?:[^;]*?)\bfrom\s*(["'])([^"']+)\2/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function collectProductionFiles(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectProductionFiles(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
}

/** True when a specifier from `fromFile` resolves to exactly `type-registry.ts` (not merely
 *  somewhere under `features/content-transport/`) — a value import of, say, a future
 *  `content-transport/blob-manifest.ts` helper is a different, unrestricted edge. */
function resolvesToRegistryFile(fromFile: string, specifier: string): boolean {
  if (specifier.startsWith("#src/features/content-transport/type-registry")) return true;
  if (!specifier.startsWith(".")) return false;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return resolved === REGISTRY_FILE || resolved === REGISTRY_FILE.replace(/\.ts$/, "");
}

test("no production file under src/features/post/ value-imports type-registry.ts (type-only ContentTransportContributor/Handler imports are fine)", () => {
  const files: string[] = [];
  collectProductionFiles(POST_ROOT, files);
  assert.ok(files.length > 5, `sanity check: expected several production files under features/post, found ${files.length}`);

  const offenders: string[] = [];
  for (const file of files) {
    const source = stripComments(fs.readFileSync(file, "utf8"));
    for (const match of source.matchAll(IMPORT_STATEMENT_PATTERN)) {
      const isTypeOnly = match[1] !== undefined;
      const specifier = match[3];
      if (isTypeOnly) continue;
      if (resolvesToRegistryFile(file, specifier)) {
        offenders.push(`${path.relative(REPO_ROOT, file)} value-imports "${specifier}"`);
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `features/post must not call the content-transport registry directly — only a composition root may. Offending edges:\n  ${offenders.join("\n  ")}`,
  );
});
