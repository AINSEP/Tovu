/** A8 seam proofs for the portable plugin host: the required grant port runs after provisioning
 * and its failure warnings, with the failed servers skipped and the approved enable passed through;
 * an approved enable with failures refuses before any grant; and no portable A8 file has an import
 * edge into the A10 connect cycle, and none falls back to Tovu's projections (legacy fallback lives
 * only in the T shims at the old paths and the T binder). */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ToolInputError } from "@jini-ai/core";
import { createPluginHost, type PluginHostDeps } from "../portable-plugin-host.js";

type Call = { readonly step: string; readonly detail?: unknown };

function hostWith({ calls, failed }: { calls: Call[]; failed: readonly { serverKey: string; reason: string }[] }) {
  const projections = {} as PluginHostDeps<never>["mcpPorts"]["projections"];
  const mcpPorts = { projections, classifyError: () => "other" as const };
  const mcp = { repo: { tag: "repo" }, applyAccess: async () => {}, notifyRosterChanged: async () => {} } as unknown as PluginHostDeps<never>["mcp"];
  const deps: PluginHostDeps<never> = {
    workspaceId: "ws", agentPluginLayout: { tag: "layout" } as never, clock: { now: () => new Date(0) } as never, namespace: "other-host",
    discoverPlugins: async () => [], getActivation: async () => null,
    lifecycle: {
      listInstalled: async () => [], preferInstalled: async ({ installed }) => installed, readIdentity: async () => { throw new Error("unused"); },
      isEnabled: async () => false, inactivePluginIds: async () => new Set(), assertWritable: async () => {}, setEnabled: async () => { throw new Error("unused"); }, uninstall: async () => undefined,
    },
    withLock: ({ run }) => run(), mcp, mcpPorts,
    grantSignedInDefaults: async (required, optional) => { calls.push({ step: "grant", detail: { required, optional } }); return []; },
    warn: message => calls.push({ step: "warn", detail: message }),
    messages: { provisioningFailed: ({ pluginId }) => `other-host: ${pluginId} failed`, approvedSnapshotMissing: () => "other-host: no key", approvedLoadFailed: ({ detail }) => `other-host: ${detail}` },
  };
  const servers = { a: { type: "http", url: "https://a.example" }, b: { type: "http", url: "https://b.example" } };
  const host = createPluginHost({ deps }, {
    resolveMcpServers: async () => { calls.push({ step: "resolve" }); return servers as never; },
    provisionMcpServers: async (port) => { calls.push({ step: "provision", detail: port }); return { provisioned: [], alreadyProvisioned: [], adopted: [], failed } as never; },
  });
  return { capability: host.getHostCapability({ capability: "agent-plugin-lifecycle" })!, deps, servers, mcpPorts };
}

test("grant port runs after provisioning and its failure warnings, skipping exactly the failed servers", async () => {
  const calls: Call[] = [];
  const { capability, deps, servers, mcpPorts } = hostWith({ calls, failed: [{ serverKey: "b", reason: "boom" }] });
  await capability.provisionMcp({ pluginId: "p", principalId: "u" });
  assert.deepEqual(calls.map(call => call.step), ["resolve", "provision", "warn", "grant"]);
  assert.equal(calls[1]!.detail, deps.mcp, "provisioning receives the host's same MCP port instance");
  const { required, optional } = calls[3]!.detail as { required: { deps: Record<string, unknown>; pluginId: string; servers: unknown }; optional: Record<string, unknown> };
  assert.equal(required.pluginId, "p");
  assert.equal(required.servers, servers, "the same resolved declaration object reaches the grant");
  assert.deepEqual(optional, { skipServerKeys: ["b"] }, "failed servers skipped; no approvedEnable for a background enable");
  assert.equal(required.deps.repo, deps.mcp.repo);
  assert.equal(required.deps.projections, mcpPorts.projections, "the host's one resolved projection pair");
  assert.equal(required.deps.agentPluginLayout, deps.agentPluginLayout);
});

test("approved enable passes principal and approved snapshot key to the grant port", async () => {
  const calls: Call[] = [];
  const { capability } = hostWith({ calls, failed: [] });
  await capability.provisionMcp({ pluginId: "p", principalId: "u" }, { approvedEnable: true, approvedEnableKey: "key-1" });
  const grant = calls.find(call => call.step === "grant")!.detail as { optional: Record<string, unknown> };
  assert.deepEqual(grant.optional, { skipServerKeys: [], approvedEnable: { principalId: "u", accessKey: "key-1" } });
});

test("approved enable whose provisioning failed refuses with host copy before any grant", async () => {
  const calls: Call[] = [];
  const { capability } = hostWith({ calls, failed: [{ serverKey: "b", reason: "boom" }] });
  await assert.rejects(capability.provisionMcp({ pluginId: "p", principalId: "u" }, { approvedEnable: true, approvedEnableKey: "key-1" }),
    (error: unknown) => error instanceof ToolInputError && error.message === "other-host: other-host: p failed");
  assert.equal(calls.some(call => call.step === "grant"), false);
});

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../../..");
const agentPlugins = path.join(srcRoot, "features/agent-plugins");
const A8_PORTABLE = [path.resolve(here, "../portable-plugin-host.ts"), path.join(agentPlugins, "service-ports.ts"), ...["federate-mcp", "enable-access", "apply-connect-defaults", "switch-on-saved-token", "connection-status"].map(name => path.join(agentPlugins, "portable", `${name}.ts`))];
const TOVU_PROJECTION_FALLBACK = path.join(agentPlugins, "mcp-host-bindings.ts");
const A10_CYCLE = new Set(["connect-tool", "access-token-tool", "connect-card-ui", "connect-destination", "connect-sign-in-wait", "grant-signed-in-defaults", "token-sign-in", "import-access-token", "apply-tool-renames"].map(name => path.join(agentPlugins, `${name}.ts`)));

/** Every static, dynamic and type import specifier that resolves to a source file under `src/`. */
function importedFiles(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const specifiers = [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map(match => match[1]!);
  return specifiers.flatMap(specifier => {
    const base = specifier.startsWith("#src/") ? path.join(srcRoot, specifier.slice(5)) : specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : null;
    if (!base) return [];
    const candidates = [base.replace(/\.js$/, ".ts"), `${base}.ts`, path.join(base, "index.ts")];
    return candidates.filter(candidate => fs.existsSync(candidate)).slice(0, 1);
  });
}

test("no import edge from the portable A8 files into the A10 connect cycle", () => {
  for (const file of A8_PORTABLE) {
    assert.ok(fs.existsSync(file), file);
    const into = importedFiles(file).filter(target => A10_CYCLE.has(target));
    assert.deepEqual(into, [], `${path.relative(srcRoot, file)} imports the A10 cycle`);
  }
});

test("portable plugin host imports no Jini package other than core and its own agent-plugins lifecycle types", () => {
  const text = fs.readFileSync(A8_PORTABLE[0]!, "utf8");
  const jini = [...text.matchAll(/from\s+["'](@jini-ai\/[^"']+)["']/g)].map(match => match[1]!);
  assert.deepEqual(jini.filter(specifier => !specifier.startsWith("@jini-ai/core") && specifier !== "@jini-ai/agent-plugins/lifecycle"), []);
  assert.equal(/contracts\/headless|@jini-ai\/plugins|@jini-ai\/platform|mcp-host-bindings|node:/.test(text), false, "no headless barrel, plugins/platform package, Tovu projection fallback or node built-in");
});

test("portable A8 bodies take required projection ports: none imports Tovu's projection fallback", () => {
  for (const file of A8_PORTABLE) assert.equal(importedFiles(file).includes(TOVU_PROJECTION_FALLBACK), false, `${path.relative(srcRoot, file)} imports mcp-host-bindings`);
});
