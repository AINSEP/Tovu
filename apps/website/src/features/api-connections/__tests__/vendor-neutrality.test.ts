/**
 * @file Vendor-neutrality pin for Tovu's side of the generic plugin seams: Agent Plugin features
 * (executable tools, admin surfaces, connect), the API-connection adapters, the push form-destination
 * contract, the surface/callback routes, their composition, and the admin app's surface mount. These
 * must carry opaque plugin/connection/product ids only, so a second provider needs nothing but its
 * own plugin files (the `acme-office` fixture proves that end to end in
 * `server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts`). This test
 * greps every seam file, tests included, for the first provider's vocabulary and fails on any hit,
 * naming file and line. Provider names belong in the plugin.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(self), "../../../../../..");
const VENDOR_VOCABULARY = /google|googleapis|gsheets|spreadsheet|drive\.file|picker/i;
const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".json", ".md", ".html"]);

/** The generic seam files and folders (repo-relative). Folders are scanned recursively. */
const SEAMS = [
  "apps/website/src/features/agent-plugins",
  "apps/website/src/features/api-connections",
  "apps/website/src/features/form-destinations",
  "apps/website/src/server/inbound/admin-http/routes/agent-plugins",
  "apps/website/src/server/inbound/public-http/routes/agent-plugin-surfaces",
  "apps/website/src/server/inbound/public-http/routes/api-connections",
  "apps/website/src/server/runtime/composition/agent-plugin-connections.ts",
  "apps/website/src/server/runtime/composition/modules/agent-plugins.ts",
  "apps/website/src/server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts",
  "apps/admin/src/features/plugins/AgentPluginSurfaceFrame.tsx",
  "apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx",
  "apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts",
  "apps/admin/src/features/plugins/hooks/use-agent-plugin-surfaces.hooks.ts",
  "apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-port.hooks.ts",
  "apps/admin/src/features/plugins/hooks/agent-plugin-surfaces-dependencies.hooks.ts",
  "apps/admin/src/features/plugins/__tests__/agent-plugin-surface-frame.unit.test.tsx",
];

/**
 * Lines that may name the vocabulary, matched by exact text, so any NEW hit, even in this file, still
 * fails; an entry whose line is reworded makes the test fail until the entry is removed:
 * - `federate-mcp.ts` predates the feature and uses "picker" as the plain English word for a UI list
 *   of tools (not the provider's file picker);
 */
const ALLOWED = new Set([
  'apps/website/src/features/agent-plugins/federate-mcp.ts: * like an operator-typed one: the same allowlist/"may write" tool picker, the same enable toggle,',
  "apps/website/src/features/agent-plugins/federate-mcp.ts: *    execution. The operator ticks tools in Settings → External MCP's picker, which already lets",
]);

/** Every scannable file under `target` (a file or a folder), skipping installs and build output. */
function filesUnder(target: string): string[] {
  if (statSync(target).isFile()) return [target];
  return readdirSync(target, { withFileTypes: true })
    .filter((entry) => entry.name !== "node_modules" && entry.name !== "dist")
    .flatMap((entry) => (entry.isDirectory() ? filesUnder(path.join(target, entry.name)) : [path.join(target, entry.name)]))
    .filter((file) => SCANNED_EXTENSIONS.has(path.extname(file)));
}

/** `{ at: "relative/path:line", key: "relative/path:text" }` for every line naming the vocabulary. */
function vendorHits(files: readonly string[], root: string): { at: string; key: string }[] {
  return files.flatMap((file) => readFileSync(file, "utf8").split("\n").flatMap((line, index) => {
    const relative = path.relative(root, file);
    return VENDOR_VOCABULARY.test(line) ? [{ at: `${relative}:${index + 1}`, key: `${relative}:${line.trimEnd()}` }] : [];
  }));
}

const scratch = mkdtempSync(path.join(tmpdir(), "vendor-neutrality-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

test("the scanner reports a vendor word with its file and line, in any case", () => {
  writeFileSync(path.join(scratch, "seam.ts"), "const ok = 1;\n// opens the Picker\n");
  assert.deepEqual(vendorHits(filesUnder(scratch), scratch), [{ at: "seam.ts:2", key: "seam.ts:// opens the Picker" }]);
});

test("no generic seam file names the first provider", () => {
  const files = SEAMS.flatMap((seam) => {
    const scanned = filesUnder(path.join(repoRoot, seam)).filter((file) => file !== self);
    // A moved or emptied seam must fail loudly, not pass by scanning nothing.
    assert.ok(scanned.length > 0, `${seam} has no scannable files`);
    return scanned;
  });
  assert.ok(files.length > 100, `only ${files.length} seam files found`);
  const hits = vendorHits(files, repoRoot);
  assert.deepEqual(hits.filter((hit) => !ALLOWED.has(hit.key)).map((hit) => hit.at), []);
  assert.deepEqual([...ALLOWED].filter((key) => !hits.some((hit) => hit.key === key)), [], "a stale allowlist entry must be removed");
});
