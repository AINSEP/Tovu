import { readAgentPluginMetadata } from "@jini-ai/agent-plugins/manifest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AgentPluginPathsPort } from "./service-ports.js";
import { evaluateHostSignals, selectCoreHostSignalDeclaration, type HostSignalDeclaration, type HostSignals } from "../../contracts/core/host-signals.js";
import { bundledContributionSources } from "./bundled-contribution-sources.js";

/**
 * Read Jini's validated portable extension; malformed declarations contribute nothing.
 * @param required Parsed JSON manifest, never executable plugin code.
 * @returns Validated hints, or undefined for absent/invalid metadata. Never throws for JSON input.
 * @complexity O(s) for s declared signals; no I/O.
 * @example parseHostSignalDeclaration({ manifest: JSON.parse(text) });
 */
export function parseHostSignalDeclaration({ manifest }: { manifest: unknown }, _optional = {}): HostSignalDeclaration | undefined {
  const { metadata } = readAgentPluginMetadata({ value: manifest });
  if (metadata.hostSignals === undefined) return undefined;
  return { signals: metadata.hostSignals, ...(metadata.deploymentAdvice === undefined ? {} : { deploymentAdvice: metadata.deploymentAdvice }) };
}

interface ReaderPorts {
  readonly sources?: typeof bundledContributionSources;
  readonly readText?: (file: string) => string;
}

/**
 * Read only manifests from the hermetic bundled source policy, independent of site activation.
 * @param required Product-controlled content/agent-plugins root, never an installed package dir.
 * @param optional Directory and text reader ports for direct failure-path tests.
 * @returns Validated unambiguous data. Absent/malformed packages contribute no declaration;
 * the resolver applies the core security fallback rather than treating absent data as permission.
 * @complexity O(p + s) for p plugin manifests and s signals; one synchronous read per manifest.
 * @example readBundledHostSignalDeclaration({ sourceRoot });
 */
export function readBundledHostSignalDeclaration(
  required: { readonly sourceRoot: string }, optional: ReaderPorts = {},
): HostSignalDeclaration {
  let sources: ReturnType<typeof bundledContributionSources>;
  // Preboot readers must not turn a missing bundled payload into a boot failure (phase 2 policy).
  try { sources = (optional.sources ?? bundledContributionSources)({ ...required, filename: "plugin.json" }); }
  catch { return { signals: [] }; }
  const declarations = sources.flatMap(source => {
    try {
      const text = (optional.readText ?? readManifestText)(path.join(source.packageRoot, "plugin.json"));
      const declaration = parseHostSignalDeclaration({ manifest: JSON.parse(text) });
      return declaration === undefined ? [] : [declaration];
    } catch { return []; }
  });
  return combineDeclarations({ declarations });
}

/** Reject the whole ambiguous declaration so the resolver can retain the complete core fallback.
 * @complexity O(s + p) for s signals and p declarations, with no I/O or input mutation. */
function combineDeclarations({ declarations }: { declarations: readonly HostSignalDeclaration[] }, _optional = {}): HostSignalDeclaration {
  const signals = declarations.flatMap(declaration => declaration.signals);
  const names = new Set(signals.map(signal => signal.env));
  const advice = [...new Set(declarations.flatMap(declaration => declaration.deploymentAdvice === undefined ? [] : [declaration.deploymentAdvice]))];
  if (names.size !== signals.length || advice.length > 1) return { signals: [] };
  return { signals, ...(advice.length === 1 ? { deploymentAdvice: advice[0] } : {}) };
}

/** Node's text-only manifest read; errors are caught at the bundled adapter boundary. */
function readManifestText(file: string): string { return readFileSync(file, "utf8"); }

/**
 * Bind the host's bundled-source fact to the pure evaluator; no plugin imports, DB or activation needed.
 * @param required Environment snapshot, values are never logged or returned as diagnostic copy.
 * @param optional Declaration reader port; desktop may supply its payload in the required path fact.
 * @returns Facts only; unavailable/incomplete/ambiguous security data uses the core HEAD fallback.
 * Read failures never fail boot or disable the baseline hosted protections.
 * @complexity O(p + s) as for the reader.
 * @example resolveBundledHostSignals({ env, bundledSourceRoot });
 */
export function resolveBundledHostSignals(
  required: Pick<AgentPluginPathsPort, "bundledSourceRoot"> & { env: Readonly<Record<string, string | undefined>> },
  optional: { readDeclaration?: typeof readBundledHostSignalDeclaration } = {},
): HostSignals {
  try {
    const sourceRoot = required.bundledSourceRoot;
    const declaration = selectCoreHostSignalDeclaration({ declaration: (optional.readDeclaration ?? readBundledHostSignalDeclaration)({ sourceRoot }) });
    return evaluateHostSignals({ env: required.env, declaration });
  } catch { return evaluateHostSignals({ env: required.env, declaration: selectCoreHostSignalDeclaration({}) }); }
}
