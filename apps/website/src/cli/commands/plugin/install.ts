import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { installSitePlugin, previewSitePluginInstall, PluginInstallError, type PluginInstallDeps } from "@jini-ai/plugins/host/node";
import { pluginInstallConsent } from "#src/features/plugin-runtime/install-consent";
import { closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { bootSiteDir } from "#src/server/runtime/composition/site-dir";
import { resolveSiteRoot } from "#src/platform/site-dir/site-root";
import { contentKernel } from "#src/platform/db/content-kernel";
import { SqlPluginActivationRepo } from "@jini-ai/plugins/host/sql";

/** The CLI names no workspace, and conflicts are per workspace: it reports none here, and turning
 *  the plugin on in a workspace still refuses a clash (the enable-time conflict gate). */
const noWorkspaceConflicts: PluginInstallDeps["conflicts"] = async () => [];

/** Opens only the site store: never constructs the runtime or attaches enabled plugin code. */
async function openInstaller(required: { site: string; env: NodeJS.ProcessEnv }, _optional = {}) {
  const { env } = required;
  const target = path.resolve(required.site);
  const boot = await bootSiteDir({ dir: target });
  try {
    const repo = new SqlPluginActivationRepo({ kernel: (boot.store?.content ?? contentKernel(boot.db!)) as unknown as import("@jini-ai/plugins/host/sql").PluginActivationSqlRequired["kernel"], tables: { activations: "plugin_activations" } });
    return { deps: { ...pluginHostBinding, installDir: env.TOVU_PLUGINS_DIR !== undefined ? path.resolve(env.TOVU_PLUGINS_DIR) : path.join(target, "plugins"), builtInIds: ["word-count"], repo, conflicts: noWorkspaceConflicts }, close: () => closeSiteDirBoot(boot) };
  } catch (e) { await closeSiteDirBoot(boot); throw e; }
}

/** Ask once on an interactive terminal; a non-interactive run must pass `--yes` instead.
 * @throws {PluginInstallError} `PLUGIN_CONSENT_REQUIRED` when `input` is not a TTY. */
export async function confirmPluginInstallOnTerminal(
  required: { input: NodeJS.ReadableStream & { isTTY?: boolean }; output: NodeJS.WritableStream },
  _optional = {},
): Promise<boolean> {
  if (!required.input.isTTY) throw new PluginInstallError("PLUGIN_CONSENT_REQUIRED", "Use --yes to acknowledge the displayed trust warning in non-interactive mode.");
  const prompt = createInterface({ input: required.input, output: required.output });
  try { return /^y(es)?$/i.test((await prompt.question("Install (stays off)? [y/N] ")).trim()); }
  finally { prompt.close(); }
}

/** Moved to the feature so the assistant's `plugins_install` result carries the same risk sentence. */
export { pluginInstallConsent };

export async function runPluginInstallCommand(
  required: { dir: string; site?: string; replace?: boolean; yes?: boolean },
  optional: {
    open?: (required: { site: string; env: NodeJS.ProcessEnv }, optional?: Record<string, never>) => Promise<{ deps: PluginInstallDeps; close: () => Promise<void> }>;
    confirm?: () => Promise<boolean>; write?: (message: string) => void;
    /** Where `TOVU_PLUGINS_DIR` is read from; defaults to the process env. */
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<void> {
  // The process env is wired here, at the command edge; tests inject their own.
  const { env = process.env } = optional;
  const session = await (optional.open ?? openInstaller)({ site: required.site ?? resolveSiteRoot(), env });
  const write = optional.write ?? ((message: string) => process.stdout.write(message));
  try {
    const input = { sourceDir: required.dir, replace: required.replace, deps: { ...pluginHostBinding, ...session.deps } };
    const preview = await previewSitePluginInstall(input);
    write(pluginInstallConsent({ preview }));
    const confirm = optional.confirm ?? (() => confirmPluginInstallOnTerminal({ input: process.stdin, output: process.stdout }));
    if (!required.yes && !(await confirm())) { write("Installation cancelled.\n"); return; }
    await installSitePlugin({ ...input, expectedDigest: preview.digest });
    write(`Installed ${preview.id} ${preview.version}; disabled in every workspace.\n`);
  } finally { await session.close(); }
}
