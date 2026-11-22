/**
 * Packaged release gates run a COPY of the app in a fresh OS temp dir. Launched inside the checkout,
 * a packaged app resolves a missing dependency from the checkout's node_modules (Node walks up the
 * directory tree), which hid the 0.1.13–0.1.17 missing-peer bug from every gate.
 */
import { resolveOnPath } from '@jini-ai/agent-runtime';
import { tmpdir } from "node:os";
import { withIsolatedPackagedTree } from "@jini-ai/devops/packaging/electron";

type SmokeTargets = { executablePath: string; nodeModulesDir: string };

/**
 * Copies the whole Tovu.app (or win-unpacked) into a fresh temp dir, runs the gate against the copy
 * with that dir as a safe cwd, and always removes the copy.
 * @param options.platform selects the copier (`cpSync` on win32, `cp -R` elsewhere); `process.platform` by default.
 */
export async function withIsolatedSmokeTargets(
  { targets, run }: { targets: SmokeTargets; run: (input: { targets: SmokeTargets; directory: string }, options?: Record<string, never>) => void | Promise<void> },
  { tempRoot = tmpdir(), platform = process.platform }: { tempRoot?: string; platform?: NodeJS.Platform } = {},
): Promise<void> {
  return withIsolatedPackagedTree({ targets, run, resolveCommand: resolveOnPath }, { tempRoot, platform, tempPrefix: "tovu-gate-" });
}
