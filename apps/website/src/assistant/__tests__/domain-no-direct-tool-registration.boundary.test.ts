/**
 * @file Enforces the Phase 0 restructure invariant (2026-08-27, ADS-memory consensus report
 * `2026-08-27-tovu-apps-website-restructure-consensus-report.md`, Final Recommendation Phase 0 item
 * 2): domain/feature modules contribute their AI tools by RETURNING a `ToolContributor` from their
 * own `contribute<Domain>Tools()`; only `server/tool-catalog-manifest.ts`'s
 * `installFirstPartyToolContributors()` may call `registerToolContributor` on the result.
 *
 * Why a test in ADDITION to `.dependency-cruiser.cjs`'s `domain-no-direct-assistant-tool-registration`:
 * `npm run check:boundaries` reports ~90 violations in other rule families today (deep-import
 * warnings that have not had their per-module triage yet). A gate that is already red cannot tell
 * anyone that violation #91 just landed — the exit code was non-zero before and stays non-zero after.
 * This test asserts EXACTLY ONE invariant and is green, so it can go red for exactly one reason. Same
 * division of labour as `src/features/__tests__/features-no-server-imports.boundary.test.ts` and
 * `src/platform/db/__tests__/pg-fixture-import-boundary.test.ts`.
 *
 * `import type { ToolContributor }` IS exempt (unlike the features-no-server-imports test's stance on
 * `import type { Express }`): a type-only edge cannot call `registerToolContributor`, and every
 * converted `contribute<Domain>Tools()` genuinely needs that type to declare its own return value —
 * this is a runtime-construction boundary, not a "knows-about" one. Heuristic: an import is treated
 * as type-only only when the ENTIRE statement is `import type {...} from "..."` — the one shape all
 * 27 converted contributors use. `src/features/plugins/supabase-mcp/supabase-mcp-plugin.ts` is
 * exempted by name: it value-imports MCP-federation-preset symbols from the same barrel, a different,
 * deliberately-kept seam (see `assistant/index.ts`'s own "E — External MCP Federation" section).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const SRC_ROOT = path.join(REPO_ROOT, "src");
const ASSISTANT_ROOT = path.join(REPO_ROOT, "src", "assistant");

const GUARDED_TOP_LEVEL_DIRS = ["analytics", "features", "identity", "media", "navigation", "origin", "seo", "widgets"];

const EXEMPT_FILES = new Set([path.join(REPO_ROOT, "src", "features", "plugins", "supabase-mcp", "supabase-mcp-plugin.ts")]);

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", "__tests__"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/** Matches a whole `import ... from "spec"` statement (value or type), capturing whether the
 * `type` keyword appears immediately after `import`, and the specifier text. Run only against
 * comment-stripped source (see `stripComments`) — otherwise prose like "a `import type` ... `from`
 * ..." inside a doc comment can serve as a decoy: the lazy gap between `import` and `from` has no
 * semicolon to stop at, so it can span from a comment's mention of "import"/"from" all the way down
 * to the next REAL import statement's quoted specifier, misreporting that real statement's type-only
 * status. Confirmed live against this repo: `features/workspace/tool-registrations.ts` and
 * `navigation/tool-registrations.ts` both discuss "import type"/"from" in prose directly above their
 * own real `import type { ToolContributor } from "#src/assistant/index";` line. */
const IMPORT_STATEMENT_PATTERN = /\bimport\s+(type\s+)?(?:[^;]*?)\bfrom\s*(["'])([^"']+)\2/g;

/** Strips line comments and block comments so `IMPORT_STATEMENT_PATTERN`'s lazy gap can never latch onto
 * prose text discussing import syntax. Comment markers inside a string literal are rare enough in
 * this codebase's import specifiers (bare module names, `#src/*` subpaths) that a byte-for-byte
 * comment stripper is not needed — this only has to be accurate enough to find `import`/`from`
 * keywords, not to reproduce the file. */
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

/** True when `child` is `parent` itself or lives beneath it. */
function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolvesToAssistant(fromFile: string, specifier: string): boolean {
  if (specifier.startsWith("#src/assistant/")) return true;
  if (!specifier.startsWith(".")) return false;
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  return isInside(ASSISTANT_ROOT, resolved);
}

test("no production file under src/{analytics,features,identity,media,navigation,origin,seo,widgets}/ value-imports from src/assistant/ (type-only ToolContributor imports are fine)", () => {
  const files: string[] = [];
  for (const dirName of GUARDED_TOP_LEVEL_DIRS) {
    const dir = path.join(SRC_ROOT, dirName);
    if (fs.existsSync(dir)) collectProductionFiles(dir, files);
  }
  assert.ok(
    files.length > 200,
    `sanity check: expected hundreds of production files across ${GUARDED_TOP_LEVEL_DIRS.join(", ")}, found ${files.length} — a collector that silently walked nothing would make this test pass by scanning zero files`,
  );

  const offenders: string[] = [];
  for (const file of files) {
    if (EXEMPT_FILES.has(file)) continue;
    const source = stripComments(fs.readFileSync(file, "utf8"));
    for (const match of source.matchAll(IMPORT_STATEMENT_PATTERN)) {
      const isTypeOnly = match[1] !== undefined;
      const specifier = match[3];
      if (isTypeOnly) continue;
      if (resolvesToAssistant(file, specifier)) {
        offenders.push(`${path.relative(REPO_ROOT, file)} value-imports "${specifier}"`);
      }
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Domain/feature modules must not call assistant's tool-contribution registry directly — only server/tool-catalog-manifest.ts may. Offending edges:\n  ${offenders.join("\n  ")}`,
  );
});
