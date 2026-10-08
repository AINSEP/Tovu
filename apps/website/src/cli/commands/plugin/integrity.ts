import path from "node:path";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { computePluginIntegrity } from "@jini-ai/plugins/host/node";

/** Authoring helper: hashes bytes only; never imports the package's entry point. */
export async function runPluginIntegrityCommand(required: { dir: string; write?: boolean }, optional: { output?: (message: string) => void } = {}): Promise<void> {
  const integrity = await computePluginIntegrity({ sourceDir: required.dir });
  if (required.write) {
    const manifestPath = path.join(required.dir, "tovu.plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const staged = manifestPath + ".tmp-" + randomUUID();
    try {
      await writeFile(staged, JSON.stringify({ ...manifest, integrity }, null, 2) + "\n", { flag: "wx" });
      await rename(staged, manifestPath);
    } finally { await rm(staged, { force: true }); }
  }
  (optional.output ?? ((message: string) => process.stdout.write(message)))(JSON.stringify(integrity, null, 2) + "\n");
}
