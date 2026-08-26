/**
 * @file The CLI an operator types to turn a bundled Agent Plugin ON (or any installed one off).
 *
 * A plugin Tovu ships with is installed but **inactive** — undiscoverable by `capability_search`,
 * unregistered as a tool, and refused if a composer chip pins it — until this command records an
 * explicit decision. That is the whole point of the bundled-but-inactive model: the vendor supplies
 * the capability, the operator authorizes it.
 *
 * Thin composition over `src/features/agent-plugins/activation.ts` and `layout.ts` — no rule of its
 * own. Every guarantee (tenant-scoped path resolution, atomic write, provenance preservation) lives
 * there and is exercised unchanged here.
 *
 * Usage:
 *   npx tsx development/scripts/agent-plugin-activation.ts list    --workspace <uuid>
 *   npx tsx development/scripts/agent-plugin-activation.ts enable  --workspace <uuid> <plugin-id>
 *   npx tsx development/scripts/agent-plugin-activation.ts disable --workspace <uuid> <plugin-id>
 *
 * `list` shows every installed package alongside its activation state, so an operator can see what
 * shipped without having to already know its id.
 */
import {
  isAgentPluginActive,
  readAgentPluginActivations,
  setAgentPluginActivation,
} from "../../src/features/agent-plugins/activation.js";
import { resolveAgentPluginLayout } from "../../src/features/agent-plugins/layout.js";
import { listInstalledPlugins } from "../../src/features/agent-plugins/resolve-agent-plugin-refs.js";

const USAGE =
  "Usage: npx tsx development/scripts/agent-plugin-activation.ts list    --workspace <uuid>\n" +
  "   or: npx tsx development/scripts/agent-plugin-activation.ts enable  --workspace <uuid> <plugin-id>\n" +
  "   or: npx tsx development/scripts/agent-plugin-activation.ts disable --workspace <uuid> <plugin-id>";

type Command = "list" | "enable" | "disable";

interface ParsedArgs {
  readonly command: Command;
  readonly workspaceId: string;
  readonly pluginId: string | undefined;
}

/** Pure token classification, split from validation so the two are separately readable — the same
 *  split `install-agent-plugin.ts` already makes. */
export function parseActivationArgs(args: readonly string[]): ParsedArgs | { readonly error: string } {
  const positional: string[] = [];
  let workspaceId: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === "--workspace") {
      workspaceId = args[++i];
    } else {
      positional.push(arg);
    }
  }

  const command = positional[0];
  if (command !== "list" && command !== "enable" && command !== "disable") {
    return { error: `Unknown or missing command '${command ?? ""}'.` };
  }
  if (workspaceId === undefined) return { error: "Missing required --workspace <uuid>." };

  const pluginId = positional[1];
  if (command !== "list" && pluginId === undefined) {
    return { error: `'${command}' requires a <plugin-id>.` };
  }

  return { command, workspaceId, pluginId };
}

async function main(): Promise<void> {
  const parsed = parseActivationArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    console.error(USAGE);
    process.exit(1);
  }

  // `forWorkspace` throws for a syntactically invalid workspace id — surfaced as a plain message
  // rather than a stack trace, since a mistyped uuid is the single most likely operator error here.
  let workspaceLayout;
  try {
    workspaceLayout = resolveAgentPluginLayout().forWorkspace(parsed.workspaceId);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (parsed.command === "list") {
    const installed = await listInstalledPlugins(workspaceLayout.packages);
    const activations = await readAgentPluginActivations(workspaceLayout.root);

    if (installed.length === 0) {
      console.log(`No Agent Plugins are installed for workspace ${parsed.workspaceId}.`);
      return;
    }

    for (const plugin of installed) {
      const record = activations.plugins[plugin.pluginId];
      const state = isAgentPluginActive(activations, plugin.pluginId) ? "ACTIVE  " : "INACTIVE";
      const provenance = record === undefined ? "operator-installed (no explicit record)" : `${record.origin}, set by ${record.updatedBy} at ${record.updatedAt}`;
      console.log(`${state}  ${plugin.pluginId}  [${plugin.archiveDigest.slice(0, 12)}]  ${provenance}`);
    }
    return;
  }

  const enabled = parsed.command === "enable";
  await setAgentPluginActivation({
    workspaceRoot: workspaceLayout.root,
    pluginId: parsed.pluginId as string,
    enabled,
    actor: `cli:${process.env.USER ?? "unknown"}`,
  });
  console.log(`Agent Plugin '${parsed.pluginId}' is now ${enabled ? "ACTIVE" : "INACTIVE"} for workspace ${parsed.workspaceId}.`);
}

await main();
