/**
 * @file Child-process fixture for the cross-process lock's integration tests
 * (`activation-cross-process-writes.integration.test.ts`). Run standalone, never imported: the
 * parent spawns `process.execPath` against this file with `--import tsx`.
 *
 * Argv: `<mode> <workspaceRoot> <signalDir> <pluginId> [count]`
 *
 * - **`pause-before-rename`**: monkeypatches `node:fs/promises`'s `rename` — the SAME named export
 *   `activation.ts` imports — so renaming `activations.json` specifically pauses: it writes
 *   `<signalDir>/<pluginId>.paused`, then polls for `<signalDir>/<pluginId>.release` before calling
 *   the real rename. Simulates a writer frozen between its strict read and its rename — the exact
 *   window the pre-lock code (`72dc4766`) lost a cross-process write in. The patch mutates the CJS
 *   `require("node:fs/promises")` exports object and then calls `syncBuiltinESMExports()`
 *   (`node:module`) — Node's own documented technique for making an ESM named import's LIVE binding
 *   see a builtin mutation, since a namespace object from a plain `import` is non-writable. If this
 *   technique does not engage under tsx, the parent test's own `.paused` wait times out and the test
 *   fails LOUDLY rather than passing vacuously (see this file's own "NOT VERIFIED" note in the plan).
 * - **`plain`**: one ordinary disable.
 * - **`burst`**: `count` sequential disables of `<pluginId>-0` .. `<pluginId>-<count-1>`, after
 *   rendezvousing with the parent through `<signalDir>/go`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const [, , mode, workspaceRoot, signalDir, pluginId, countArg] = process.argv;

function signalPath(name: string): string {
  return path.join(signalDir, name);
}

async function waitForFile(filePath: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await readFile(filePath);
      return;
    } catch {
      if (Date.now() - start > timeoutMs) throw new Error(`activation-writer-child: timed out waiting for ${filePath}`);
      await sleep(10);
    }
  }
}

/** See this file's own header for why this mutates the CJS exports object rather than the ESM
 *  namespace object directly (which is non-writable). */
function installPauseBeforeRename(): void {
  const require = createRequire(import.meta.url);
  const fspCjs = require("node:fs/promises") as typeof import("node:fs/promises");
  const realRename = fspCjs.rename;
  fspCjs.rename = (async (from: Parameters<typeof realRename>[0], to: Parameters<typeof realRename>[1]) => {
    if (path.basename(String(to)) === "activations.json") {
      await writeFile(signalPath(`${pluginId}.paused`), "1", "utf8");
      await waitForFile(signalPath(`${pluginId}.release`), 30_000);
    }
    return realRename(from, to);
  }) as typeof realRename;
  (require("node:module") as typeof import("node:module")).syncBuiltinESMExports();
}

async function runBurst(setAgentPluginActivation: typeof import("../../activation.js").setAgentPluginActivation): Promise<void> {
  const count = Number(countArg ?? "0");
  await writeFile(signalPath(`${pluginId}.ready`), "1", "utf8");
  await waitForFile(signalPath("go"), 30_000);
  for (let index = 0; index < count; index++) {
    await setAgentPluginActivation({ workspaceRoot, pluginId: `${pluginId}-${index}`, enabled: false, actor: "child" });
  }
}

async function main(): Promise<void> {
  await mkdir(signalDir, { recursive: true });
  if (mode === "pause-before-rename") installPauseBeforeRename();

  const { setAgentPluginActivation } = await import("../../activation.js");

  if (mode === "burst") {
    await runBurst(setAgentPluginActivation);
    return;
  }

  await writeFile(signalPath(`${pluginId}.started`), "1", "utf8");
  await setAgentPluginActivation({ workspaceRoot, pluginId, enabled: false, actor: "child" });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
