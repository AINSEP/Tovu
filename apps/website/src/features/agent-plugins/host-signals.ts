import { readFileSync } from "node:fs";
import path from "node:path";
import type { AgentPluginPathsPort } from "./service-ports.js";
import { evaluateHostSignals, selectCoreHostSignalDeclaration, type HostSignal, type HostSignalDeclaration, type HostSignals } from "../../contracts/core/host-signals.js";
import { bundledContributionSources } from "./bundled-contribution-sources.js";

/** JSON objects only, including the manifest's optional extension containers. */
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Diagnostic copy is a single bounded line, never an environment value. */
function diagnosticText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 2048 && !/[\x00-\x1f\x7f]/.test(value);
}

/** Accept only known boolean facts and a finite positive safe hop count. No truthy coercion. */
function validFacts(value: unknown): value is HostSignal["facts"] {
  if (!record(value)) return false;
  return Object.entries(value).every(([key, fact]) => {
    if (key === "hosted" || key === "nativeToolsRestricted") return typeof fact === "boolean";
    return key === "trustProxyHops" && Number.isSafeInteger(fact) && (fact as number) > 0;
  });
}

/** Invalid env names or labels cannot become host hints. @complexity O(1). */
function validSignal(value: unknown): value is HostSignal {
  if (!record(value)) return false;
  if (typeof value.env !== "string" || !/^[A-Z_][A-Z0-9_]*$/.test(value.env)) return false;
  if (!validFacts(value.facts)) return false;
  return value.label === undefined || diagnosticText(value.label);
}

/**
 * Parse the existing extensions.tovu convention; a malformed declaration contributes nothing.
 * @param required Parsed JSON manifest, never executable plugin code.
 * @returns Validated hints, or undefined for absent/invalid metadata. Never throws for JSON input.
 * @complexity O(s) for s declared signals; no I/O.
 * @example parseHostSignalDeclaration({ manifest: JSON.parse(text) });
 */
export function parseHostSignalDeclaration({ manifest }: { manifest: unknown }, _optional = {}): HostSignalDeclaration | undefined {
  if (!record(manifest) || !record(manifest.extensions) || !record(manifest.extensions.tovu)) return undefined;
  const extension = manifest.extensions.tovu;
  if (!Array.isArray(extension.hostSignals) || !extension.hostSignals.every(validSignal)) return undefined;
  if (extension.deploymentAdvice !== undefined && !diagnosticText(extension.deploymentAdvice)) return undefined;
  return { signals: extension.hostSignals, ...(extension.deploymentAdvice === undefined ? {} : { deploymentAdvice: extension.deploymentAdvice as string }) };
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
