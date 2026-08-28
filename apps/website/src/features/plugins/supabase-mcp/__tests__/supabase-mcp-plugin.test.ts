import assert from "node:assert/strict";
import test from "node:test";

import type { FederatedMcpConnectionConfig, RemoteToolDescriptor } from "#src/assistant/mcp-federation/ports";
import { listFederatedMcpPresets, resetFederatedMcpPresetsForTests } from "#src/assistant/mcp-federation/presets";
import { admitRemoteTools } from "#src/assistant/mcp-federation/trust";
import {
  registerSupabaseMcpPreset,
  resolveSupabaseMcpConnection,
  SUPABASE_DEFAULT_ALLOWED_TOOLS,
  SUPABASE_MCP_PACKAGE,
  SUPABASE_MCP_PRESET_ID,
} from "../supabase-mcp-plugin.js";

/**
 * @file The Supabase preset's own tests — the vendor-specific half of what used to be
 * `src/assistant/__tests__/mcp-federation.{registrations,trust}.test.ts`, moved here with the preset
 * so the core federation suite imports no vendor module.
 *
 * Two things are under test, and they are different in kind:
 * 1. CONFIGURATION RESOLUTION — that federation stays off until a site owner turns it on, that a
 *    half-configured connection fails loudly instead of resolving to a broader one, and that the PAT
 *    never lands in argv.
 * 2. THE VENDOR JUDGEMENTS — that Tovu's own default allowlist for this specific server contains
 *    what its authorship claims, and that `execute_sql` is kept out by the operator allowlist (R2)
 *    rather than by the server's own annotations (R3). That second case is the concrete evidence for
 *    core's whole trust-tier argument, which is why it is asserted against the real
 *    `admitRemoteTools` rather than restated in prose.
 */

const VALID_ENV = {
  TOVU_SUPABASE_MCP_ENABLED: "1",
  TOVU_SUPABASE_MCP_ACCESS_TOKEN: "sbp_x",
  TOVU_SUPABASE_MCP_PROJECT_REF: "abcdefghijklmnop",
};

// ---------------------------------------------------------------------------
// Configuration (the site-owner-facing surface)
// ---------------------------------------------------------------------------

test("federation is off unless a site owner turns it on", () => {
  assert.equal(resolveSupabaseMcpConnection({}), null);
  assert.equal(resolveSupabaseMcpConnection({ TOVU_SUPABASE_MCP_ENABLED: "0" }), null);
  assert.equal(resolveSupabaseMcpConnection({ TOVU_SUPABASE_MCP_ENABLED: "false" }), null);
});

test("an enabled-but-incomplete configuration fails loudly instead of connecting to something broader", () => {
  assert.throws(
    () => resolveSupabaseMcpConnection({ TOVU_SUPABASE_MCP_ENABLED: "1" }),
    /requires a personal access token \(PAT\), not the project anon or service-role key/,
  );
  // project-ref is REQUIRED here though optional upstream, because omitting it upstream scopes the
  // PAT to the entire account.
  assert.throws(
    () => resolveSupabaseMcpConnection({ TOVU_SUPABASE_MCP_ENABLED: "1", TOVU_SUPABASE_MCP_ACCESS_TOKEN: "sbp_x" }),
    /TOVU_SUPABASE_MCP_PROJECT_REF/,
  );
  assert.throws(() => resolveSupabaseMcpConnection({ ...VALID_ENV, TOVU_SUPABASE_MCP_PROJECT_REF: "NOT A REF" }), /TOVU_SUPABASE_MCP_PROJECT_REF/);
});

test("a valid configuration pins the package, forces --read-only, scopes to the project, and keeps the PAT out of argv", () => {
  const resolved = resolveSupabaseMcpConnection({ ...VALID_ENV, TOVU_SUPABASE_MCP_ACCESS_TOKEN: "sbp_secret_token" });

  assert.ok(resolved);
  assert.equal(resolved.config.connectionId, "supabase");
  assert.deepEqual(resolved.config.allowedToolNames, SUPABASE_DEFAULT_ALLOWED_TOOLS);

  assert.equal(resolved.launch.command, "npx");
  assert.ok(resolved.launch.args.includes(SUPABASE_MCP_PACKAGE), "the package version must be pinned, not floating");
  assert.ok(resolved.launch.args.includes("--read-only"));
  assert.ok(resolved.launch.args.includes("--project-ref=abcdefghijklmnop"));

  // argv is world-readable via /proc/<pid>/cmdline and `ps`; the token must be in env only.
  assert.equal(resolved.launch.args.join(" ").includes("sbp_secret_token"), false);
  assert.deepEqual(resolved.launch.env, { SUPABASE_ACCESS_TOKEN: "sbp_secret_token" });
});

test("an operator can widen the allowlist explicitly, or empty it to disable every tool", () => {
  assert.deepEqual(resolveSupabaseMcpConnection({ ...VALID_ENV, TOVU_SUPABASE_MCP_ALLOWED_TOOLS: "list_tables, execute_sql" })?.config.allowedToolNames, [
    "list_tables",
    "execute_sql",
  ]);
  // Explicitly empty is distinguishable from unset, and means "nothing".
  assert.deepEqual(resolveSupabaseMcpConnection({ ...VALID_ENV, TOVU_SUPABASE_MCP_ALLOWED_TOOLS: "" })?.config.allowedToolNames, []);
});

test("the shared federation ceilings apply, and a malformed override falls back rather than throwing", () => {
  const defaults = resolveSupabaseMcpConnection(VALID_ENV);
  assert.equal(defaults?.config.connectTimeoutMs, 15_000);
  assert.equal(defaults?.config.callTimeoutMs, 30_000);
  assert.equal(defaults?.config.maxResultBytes, 64 * 1024);

  const overridden = resolveSupabaseMcpConnection({ ...VALID_ENV, TOVU_SUPABASE_MCP_CALL_TIMEOUT_MS: "5000", TOVU_SUPABASE_MCP_MAX_RESULT_BYTES: "nonsense" });
  assert.equal(overridden?.config.callTimeoutMs, 5_000);
  // A mistyped ceiling must not be the difference between having federation and not; a mistyped
  // credential or project scope (asserted above) must be.
  assert.equal(overridden?.config.maxResultBytes, 64 * 1024);
});

// ---------------------------------------------------------------------------
// Default-included wiring — registration through core's seam
// ---------------------------------------------------------------------------

test("the preset installs itself into core federation's registry without core importing it", (t) => {
  t.after(resetFederatedMcpPresetsForTests);
  resetFederatedMcpPresetsForTests();

  registerSupabaseMcpPreset();

  const presets = listFederatedMcpPresets();
  assert.deepEqual(
    presets.map((preset) => preset.presetId),
    [SUPABASE_MCP_PRESET_ID],
  );
  // Registration is not activation: with nothing configured the resolver declines, so wiring this
  // in unconditionally leaves the daemon's behaviour exactly as it was before federation existed.
  assert.equal(presets[0].resolve({}), null);
  assert.ok(presets[0].resolve(VALID_ENV));
});

// ---------------------------------------------------------------------------
// The vendor judgements — asserted against core's real admission logic
// ---------------------------------------------------------------------------

const CONFIG: FederatedMcpConnectionConfig = {
  connectionId: "supabase",
  label: "Supabase (project abcdefghijklmnop)",
  allowedToolNames: SUPABASE_DEFAULT_ALLOWED_TOOLS,
  // Mirrors the real preset's resolved connection: Supabase writes stay off (this file's own
  // header). None of this suite's cases are about R3's write-list override.
  writeAllowedToolNames: [],
  connectTimeoutMs: 1_000,
  callTimeoutMs: 1_000,
  maxResultBytes: 1_024,
  maxTools: 8,
};

const OBJECT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

function remoteTool(overrides: Partial<RemoteToolDescriptor> & { name: string }): RemoteToolDescriptor {
  return { inputSchema: OBJECT_SCHEMA, ...overrides };
}

function refusalFor(report: ReturnType<typeof admitRemoteTools>, name: string): string | undefined {
  return report.refused.find((entry) => entry.remoteName === name)?.reason;
}

test("Supabase: execute_sql is kept out by the OPERATOR ALLOWLIST, not by its annotations", () => {
  // Under `--read-only`, @supabase/mcp-server-supabase@0.9.0 sets execute_sql's own
  // `readOnlyHint` to true (verified in its `database-operation-tools.ts`). So R3 alone would let
  // arbitrary SQL through. R2 is what actually stops it — which is the entire argument for the
  // allowlist being the load-bearing control.
  const report = admitRemoteTools({
    tools: [
      remoteTool({ name: "execute_sql", annotations: { readOnlyHint: true, destructiveHint: false } }),
      remoteTool({ name: "list_tables", annotations: { readOnlyHint: true } }),
    ],
    config: CONFIG,
  });

  assert.deepEqual(
    report.admitted.map((tool) => tool.remoteName),
    ["list_tables"],
  );
  assert.equal(refusalFor(report, "execute_sql"), "not-in-operator-allowlist");
});

test("Supabase: the default allowlist excludes every write, every account-wide tool, and the key-returning one", () => {
  const forbidden = [
    "execute_sql",
    "apply_migration",
    "get_publishable_keys",
    "list_projects",
    "get_project",
    "create_project",
    "pause_project",
    "restore_project",
    "delete_branch",
    "merge_branch",
    "reset_branch",
    "rebase_branch",
    "create_branch",
    "deploy_edge_function",
    "update_storage_config",
  ];

  for (const name of forbidden) {
    assert.ok(!SUPABASE_DEFAULT_ALLOWED_TOOLS.includes(name), `${name} must not be allowlisted by default`);
  }
  // And the reads it does allow are exactly the documented set.
  assert.deepEqual([...SUPABASE_DEFAULT_ALLOWED_TOOLS].sort(), [
    "generate_typescript_types",
    "get_advisors",
    "get_logs",
    "get_project_url",
    "list_extensions",
    "list_migrations",
    "list_tables",
    "search_docs",
  ]);
});

test("Supabase: apply_migration is refused twice over — allowlist first, and its own destructiveHint too", () => {
  const report = admitRemoteTools({
    tools: [remoteTool({ name: "apply_migration", annotations: { destructiveHint: true } })],
    config: { ...CONFIG, allowedToolNames: ["apply_migration"] },
  });

  // With the operator having explicitly (and unwisely) allowlisted it, R3 is the backstop that
  // still keeps it out, because Supabase honestly marks it destructive.
  assert.equal(refusalFor(report, "apply_migration"), "remote-declares-destructive");
});
