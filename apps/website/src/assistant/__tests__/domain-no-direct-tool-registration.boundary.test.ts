/**
 * @file Enforces the Phase 0 restructure invariant (2026-08-27, ADS-memory consensus report
 * `2026-08-27-tovu-apps-website-restructure-consensus-report.md`, Final Recommendation Phase 0 item
 * 2): domain/feature modules contribute their AI tools by RETURNING a `ToolContributor` from their
 * own `contribute<Domain>Tools()`; only `server/tool-catalog-manifest.ts`'s
 * `installFirstPartyToolContributors()` may call `registerToolContributor` on the result.
 *
 * Why a test in ADDITION to `.dependency-cruiser.mjs`'s `domain-no-direct-assistant-tool-registration`:
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
 * 27 converted contributors use.
 *
 * `EXEMPT_FILE_SYMBOLS` (below) is a PER-SYMBOL allowlist, not a whole-file one (2026-09-21; a
 * whole-file exemption would silently allow a future `registerToolContributor` import in any of
 * these files without this test ever going red). It maps each of the four files that value-import
 * from the same deliberately-kept seam (see `assistant/index.ts`'s own "E — External MCP
 * Federation" section) instead of calling `registerToolContributor`, to exactly the named symbols
 * that file imports today — as of 2026-09-20/21 (two agent-plugins connect files added 2026-09-27):
 * `src/features/agent-plugins/federate-mcp.ts`,
 * `src/features/agent-plugins/access-token-tool.ts` (was `supabase-connect/tool-registrations.ts`), and
 * `src/features/external-mcp/tool-registrations.ts`. A value-import of any OTHER symbol from
 * `#src/assistant/index` by one of these files — `registerToolContributor` above all — is not
 * covered by its allowlist and fails the test, the same as it would for any non-exempt file.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../..");
const SRC_ROOT = path.join(REPO_ROOT, "apps", "website", "src");
const ASSISTANT_ROOT = path.join(REPO_ROOT, "apps", "website", "src", "assistant");

const GUARDED_TOP_LEVEL_DIRS = ["analytics", "features", "identity", "media", "navigation", "origin", "seo", "widgets"];

/** Per-file allowlist of the exact named symbols a file may value-import from
 *  `#src/assistant/index` — every other symbol (`registerToolContributor` above all) still fails
 *  the test for these files, same as for any non-exempt file. Each set is exactly what that file
 *  imports today; growing it back out to a real production need is a deliberate, reviewable edit
 *  here, not something a future rename or a copy-pasted import can slip past silently. */
const EXEMPT_FILE_SYMBOLS = new Map<string, Set<string>>([
  [
    // Added 2026-09-10 (feaf69d08, "wire auto-admitted plugin MCP servers into the external-MCP
    // store") — confirmed via `assistant/index.ts`'s own comment naming this file. Imports only the
    // one function it calls to save a plugin's declared remote MCP server into the store.
    path.join(REPO_ROOT, "apps", "website", "src", "features", "agent-plugins", "federate-mcp.ts"),
    new Set(["saveExternalMcpServer"]),
  ],
  [
    // Added 2026-09-29: `agent_plugin_set_access_token`, moved here from the deleted
    // `supabase-connect/tool-registrations.ts` (SPEC-052), which had this exact exemption. Saves a
    // pasted token onto a plugin's row and maps the store's own errors. Never calls
    // `registerToolContributor`; contributed through `contributeAgentPluginConnectTools()`.
    path.join(REPO_ROOT, "apps", "website", "src", "features", "agent-plugins", "access-token-tool.ts"),
    new Set(["ExternalMcpSecretStoreUnconfiguredError", "ExternalMcpValidationError", "saveExternalMcpServer"]),
  ],
  [
    // Has the identical shape and was already exempt in practice — it only surfaced once
    // `stripComments`'s block/line-comment ordering bug (fixed 2026-09-20) was corrected. Its own
    // header comment (added 2026-09-07, lines ~24-34) documents this exact seam and says it
    // "Verified empirically (not assumed)" against this same boundary family and that the
    // value-import "adds no new violation"; it never calls `registerToolContributor` (only
    // `server/runtime/composition/tool-catalog-manifest.ts` may) and exports the required
    // `contributeExternalMcpTools(): ToolContributor` return-based registration shape.
    path.join(REPO_ROOT, "apps", "website", "src", "features", "external-mcp", "tool-registrations.ts"),
    new Set([
      "ExternalMcpSecretStoreUnconfiguredError",
      "ExternalMcpValidationError",
      "listExternalMcpServerViews",
      // Added 2026-09-27: announces a saved row through the roster-change fan-out, which
      // `assistant/index.ts`'s own "Roster-change fan-out" comment names this file as a caller of.
      "notifyExternalMcpRosterChanged",
      "readEnabledExternalMcpConfigs",
      "saveExternalMcpServer",
    ]),
  ],
  [
    // Added 2026-09-27 (1ec285153, S-G1): `agent_plugin_connect` reads a plugin row's OAuth status
    // and maps the store's validation error — the same External MCP read surface
    // `access-token-tool.ts` uses above. Never calls `registerToolContributor`;
    // it is contributed through `contributeAgentPluginConnectTools()`.
    path.join(REPO_ROOT, "apps", "website", "src", "features", "agent-plugins", "connect-tool.ts"),
    new Set(["ExternalMcpValidationError", "resolveExternalMcpOAuthStatus"]),
  ],
  [
    // Added 2026-09-27 (caaf88d56, S-G2): the `onConnected` port that writes a plugin's declared
    // default tools after first sign-in, then announces the roster change so live runtimes reload —
    // the same fan-out `external-mcp/tool-registrations.ts` uses.
    path.join(REPO_ROOT, "apps", "website", "src", "features", "agent-plugins", "apply-connect-defaults.ts"),
    new Set(["notifyExternalMcpRosterChanged"]),
  ],
]);

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", "__tests__"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

/** Runtime module edges, including re-exports and lazy loading. Type-only declarations are exempt. */
function runtimeEdges(source: string): Array<{ specifier: string; names: string[] | null }> {
  const ast = ts.createSourceFile("fixture.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edges: Array<{ specifier: string; names: string[] | null }> = [];
  const add = (specifier: ts.Node | undefined, names: string[] | null) => {
    if (specifier && ts.isStringLiteralLike(specifier)) edges.push({ specifier: specifier.text, names });
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause?.isTypeOnly) {
        const bindings = clause?.namedBindings;
        const names = !clause?.name && bindings && ts.isNamedImports(bindings)
          ? bindings.elements.filter((item) => !item.isTypeOnly).map((item) => (item.propertyName ?? item.name).text) : null;
        if (names === null || names.length > 0) add(node.moduleSpecifier, names);
      }
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
      const clause = node.exportClause;
      const names = clause && ts.isNamedExports(clause)
        ? clause.elements.filter((item) => !item.isTypeOnly).map((item) => (item.propertyName ?? item.name).text) : null;
      if (names === null || names.length > 0) add(node.moduleSpecifier, names);
    } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression, null);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      add(node.arguments[0], null);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return edges;
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
  if (specifier === "#src/assistant" || specifier.startsWith("#src/assistant/")) return true;
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
    const allowedSymbols = EXEMPT_FILE_SYMBOLS.get(file);
    const source = fs.readFileSync(file, "utf8");
    for (const { specifier, names: valueNames } of runtimeEdges(source)) {
      if (!resolvesToAssistant(file, specifier)) continue;

      if (allowedSymbols) {
        // A named `{...}` clause whose every imported symbol is on THIS file's own allowlist is
        // fine; anything else (an unlisted symbol, or a clause shape the allowlist cannot verify
        // per-symbol, e.g. a default/namespace import) still counts as an offense below.
        if (valueNames !== null && valueNames.every((name) => allowedSymbols.has(name))) continue;
        const disallowed = valueNames?.filter((name) => !allowedSymbols.has(name)) ?? null;
        offenders.push(
          `${path.relative(REPO_ROOT, file)} value-imports "${specifier}"` +
            (disallowed && disallowed.length > 0
              ? ` — symbol(s) not in this file's allowlist: ${disallowed.join(", ")}`
              : " — clause shape not verifiable per-symbol"),
        );
        continue;
      }

      offenders.push(`${path.relative(REPO_ROOT, file)} value-imports "${specifier}"`);
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    `Domain/feature modules must not call assistant's tool-contribution registry directly — only server/tool-catalog-manifest.ts may. Offending edges:\n  ${offenders.join("\n  ")}`,
  );
});


test("the boundary sees each runtime syntax and exempts only type-only edges", () => {
  for (const source of [
    'import { registerToolContributor } from "#src/assistant/index";',
    'export { registerToolContributor as register } from "#src/assistant/index";',
    'export * from "#src/assistant";',
    'await import("#src/assistant/index");',
    'require("#src/assistant");',
    'import registry = require("#src/assistant/index");',
    'import "#src/assistant";',
    'import * as registry from "../assistant/index";',
  ]) {
    const edges = runtimeEdges(source);
    assert.equal(edges.length, 1, source);
    assert.equal(resolvesToAssistant(path.join(SRC_ROOT, "features", "fixture.ts"), edges[0].specifier), true, source);
  }
  assert.deepEqual(runtimeEdges(`
    // await import("#src/assistant/index")
    const text = 'require("#src/assistant")';
    import type { ToolContributor } from "#src/assistant/index";
    export type { ToolContributor } from "#src/assistant/index";
    import { type ToolContributor } from "#src/assistant/index";
  `), []);
  assert.deepEqual(runtimeEdges('import { type ToolContributor, registerToolContributor as register } from "#src/assistant/index";'),
    [{ specifier: "#src/assistant/index", names: ["registerToolContributor"] }]);
});
