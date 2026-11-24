import { existsSync } from "node:fs";
import path from "node:path";
import { resolveBundledHostSignals } from "@jini-ai/agent-plugins/site/host-signals";
import { bundledContributionSources } from "../../website/src/features/agent-plugins/bundled-contribution-sources.ts";
import { bundledAgentPluginsDir } from "../../website/src/server/runtime/composition/site-paths.ts";
import { evaluateHostSignals, selectCoreHostSignalDeclaration, type HostSignals } from "@tovu/contracts/host-signals";

/**
 * Bind shipped host data to Electron's payload, or normal product-root discovery in development.
 * @param required Host env snapshot; plugin activation and site directories never participate.
 * @param optional Electron resources location, path probe and synchronous reader ports.
 * @returns Host facts; missing/malformed declarations retain the core legacy security fallback.
 * @complexity O(1) selection plus the bundled reader's manifest scan; no plugin code executes.
 * @example resolveDesktopHostSignals({ env: runtime.hostEnv });
 */
export function resolveDesktopHostSignals(
  required: { env: Readonly<Record<string, string | undefined>> },
  { resourcesPath = process.resourcesPath, pathExists = existsSync, resolveSignals = resolveBundledHostSignals }: {
    resourcesPath?: string; pathExists?: (file: string) => boolean; resolveSignals?: typeof resolveBundledHostSignals<HostSignals>;
  } = {},
): HostSignals {
  let sourceRoot: string | undefined;
  if (resourcesPath) {
    const payload = path.join(resourcesPath, "tovu", "dist", "content", "agent-plugins");
    if (pathExists(payload)) sourceRoot = payload;
  }
  return resolveSignals({ ...required, sources: bundledContributionSources, evaluateHostSignals, selectCoreHostSignalDeclaration,
    get bundledSourceRoot() { return sourceRoot ?? bundledAgentPluginsDir({}, { env: required.env }); },
  });
}
