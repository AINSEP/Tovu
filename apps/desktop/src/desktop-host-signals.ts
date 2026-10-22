import { existsSync } from "node:fs";
import path from "node:path";
import { resolveBundledHostSignals } from "../../website/src/features/agent-plugins/host-signals.ts";
import type { HostSignals } from "../../website/src/contracts/core/host-signals.ts";

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
    resourcesPath?: string; pathExists?: (file: string) => boolean; resolveSignals?: typeof resolveBundledHostSignals;
  } = {},
): HostSignals {
  let sourceRoot: string | undefined;
  if (resourcesPath) {
    const payload = path.join(resourcesPath, "tovu", "dist", "content", "agent-plugins");
    if (pathExists(payload)) sourceRoot = payload;
  }
  return resolveSignals(required, { sourceRoot });
}
