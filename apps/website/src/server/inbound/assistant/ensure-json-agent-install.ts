import { applyJsonInstall, isAgentSlug, planAgentInstall, verifyJsonAgentInstall, type JsonInstallPlan, type McpLaunchSpec, type PlanContext } from "@jini-ai/mcp";
import { randomUUID } from "node:crypto";
import * as nodeFs from "node:fs/promises";
import { dirname } from "node:path";

/** Host I/O for automatic bridge registration; tests never touch the user's configuration. */
export interface JsonAgentInstallFilesystem {
  readFile(required: { path: string }): Promise<string>;
  stat(required: { path: string }): Promise<{ mode: number }>;
  mkdir(required: { path: string }): Promise<void>;
  writeFile(required: { path: string; contents: string; mode: number }): Promise<void>;
  chmod(required: { path: string; mode: number }): Promise<void>;
  rename(required: { from: string; to: string }): Promise<void>;
  remove(required: { path: string }): Promise<void>;
}

const nodeFilesystem: JsonAgentInstallFilesystem = {
  readFile: ({ path }) => nodeFs.readFile(path, "utf8"),
  stat: ({ path }) => nodeFs.stat(path),
  mkdir: async ({ path }) => { await nodeFs.mkdir(path, { recursive: true }); },
  writeFile: ({ path, contents, mode }) => nodeFs.writeFile(path, contents, { encoding: "utf8", mode, flag: "wx" }),
  chmod: ({ path, mode }) => nodeFs.chmod(path, mode),
  rename: ({ from, to }) => nodeFs.rename(from, to),
  remove: ({ path }) => nodeFs.rm(path, { force: true }),
};

/** Only the static Electron launcher switch belongs in shared config. The daemon supplies all
 * run/site values through the CLI's inherited environment, never this persistent entry. */
function assertStaticBridgeEntry({ plan }: { plan: JsonInstallPlan }, _optional = {}): void {
  const entry = plan.entry as { env?: Record<string, string>; environment?: Record<string, string> };
  const env = { ...entry.env, ...entry.environment };
  if (Object.entries(env).some(([key, value]) => key !== "ELECTRON_RUN_AS_NODE" || value !== "1")) {
    throw new Error("Bridge installation contains non-static environment values");
  }
}

/** Only ENOENT permits creating a new config; unreadable files must never be overwritten. */
async function readConfig(
  { path, fs }: { path: string; fs: JsonAgentInstallFilesystem }, _optional = {},
): Promise<{ text: string | null; mode: number }> {
  try {
    const text = await fs.readFile({ path });
    const { mode } = await fs.stat({ path });
    return { text, mode: mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { text: null, mode: 0o600 };
  }
}

/** Publish a complete config by same-directory rename. Chmod restores the exact destination mode
 * despite umask; a failed exclusive create never grants ownership of someone else's temp file. */
async function writeConfig(
  { path, contents, mode, fs }: { path: string; contents: string; mode: number; fs: JsonAgentInstallFilesystem }, _optional = {},
): Promise<void> {
  await fs.mkdir({ path: dirname(path) });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile({ path: temporary, contents, mode: 0o600 });
    await fs.chmod({ path: temporary, mode });
    await fs.rename({ from: temporary, to: path });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      // A cleanup failure must not hide the installation failure.
      await fs.remove({ path: temporary }).catch(() => {});
    }
    throw error;
  }
}

/** Verify an env-passthrough CLI's static bridge, repair missing/stale JSON registration, then
 * verify again before dispatch. Jini owns paths, safe-plan validation and merge semantics.
 * Throws a value-free user message on recovery failure; never exposes config or installer errors.
 * @complexity O(n) time/space in config bytes; a bounded number of filesystem operations.
 */
export async function ensureJsonAgentInstall(
  required: { agentId: string; spec: McpLaunchSpec; ctx: PlanContext },
  optional: Partial<JsonAgentInstallFilesystem> = {},
): Promise<void> {
  const fs = { ...nodeFilesystem, ...optional };
  const verification = { ...required, readFile: fs.readFile };
  try {
    await verifyJsonAgentInstall(verification);
    return;
  } catch { /* Missing or stale registration is recovered below. */ }
  try {
    const slug = { value: required.agentId };
    if (!isAgentSlug(slug)) throw new Error("Unknown bridge installation");
    const plan = planAgentInstall({ slug: slug.value, spec: required.spec, ctx: required.ctx });
    if (plan.kind !== "json") throw new Error("Bridge installation requires a JSON registry");
    assertStaticBridgeEntry({ plan });
    const existing = await readConfig({ path: plan.configPath, fs });
    const contents = applyJsonInstall({ existingText: existing.text, plan });
    await writeConfig({ path: plan.configPath, contents, mode: existing.mode, fs });
    await verifyJsonAgentInstall(verification);
  } catch {
    throw new Error("The assistant could not set up its tools automatically. Please try again.");
  }
}
