import path from "node:path";
import { createInterface } from "node:readline/promises";
import { installSitePlugin, previewSitePluginInstall, PluginInstallError, type PluginInstallDeps, type PluginInstallPreview } from "#src/features/plugin-runtime/install";
import { bootSiteDir, closeSiteDirBoot } from "#src/platform/site-dir/boot-site-dir";
import { resolveSiteRoot } from "#src/platform/site-dir/site-root";
import { contentKernel } from "#src/platform/db/content-kernel";
import { SqlPluginActivationRepo } from "#src/features/plugin-runtime/repo";

/** Opens only the site store: never constructs the runtime or attaches enabled plugin code. */
async function openInstaller(required: { site: string }, _optional = {}) {
  const target = path.resolve(required.site);
  const boot = await bootSiteDir({ dir: target });
  try {
    const repo = new SqlPluginActivationRepo(boot.store?.content ?? contentKernel(boot.db!));
    return { deps: { installDir: process.env.TOVU_PLUGINS_DIR !== undefined ? path.resolve(process.env.TOVU_PLUGINS_DIR) : path.join(target, "plugins"), builtInIds: ["word-count"], repo }, close: () => closeSiteDirBoot(boot) };
  } catch (e) { await closeSiteDirBoot(boot); throw e; }
}

export function pluginInstallConsent(required: { preview: PluginInstallPreview }, _optional = {}): string {
  const p = required.preview;
  return [
    `${p.name} (${p.id}) ${p.version}`,
    `Trust: ${p.tier} (local / unverified publisher)`,
    `Capabilities: ${p.capabilities.join(", ") || "—"}`,
    `Hooks: ${p.hooks.join(", ") || "—"}`,
    ...(p.upgradeFrom ? [`Replaces installed version ${p.upgradeFrom}.`] : []),
    "This plugin runs code with full access to this computer and every site on it.",
    "It stays off in every workspace until you turn it on.", "",
  ].join("\n");
}

export async function runPluginInstallCommand(
  required: { dir: string; site?: string; replace?: boolean; yes?: boolean },
  optional: {
    open?: (required: { site: string }, optional?: Record<string, never>) => Promise<{ deps: PluginInstallDeps; close: () => Promise<void> }>;
    confirm?: () => Promise<boolean>; write?: (message: string) => void;
  } = {},
): Promise<void> {
  const session = await (optional.open ?? openInstaller)({ site: required.site ?? resolveSiteRoot() });
  const write = optional.write ?? ((message: string) => process.stdout.write(message));
  try {
    const input = { sourceDir: required.dir, replace: required.replace, deps: session.deps };
    const preview = await previewSitePluginInstall(input);
    write(pluginInstallConsent({ preview }));
    const confirm = optional.confirm ?? (async () => {
      if (!process.stdin.isTTY) throw new PluginInstallError("PLUGIN_CONSENT_REQUIRED", "Use --yes to acknowledge the displayed trust warning in non-interactive mode.");
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try { return /^y(es)?$/i.test((await prompt.question("Install (stays off)? [y/N] ")).trim()); }
      finally { prompt.close(); }
    });
    if (!required.yes && !(await confirm())) { write("Installation cancelled.\n"); return; }
    await installSitePlugin({ ...input, expectedDigest: preview.digest });
    write(`Installed ${preview.id} ${preview.version}; disabled in every workspace.\n`);
  } finally { await session.close(); }
}
