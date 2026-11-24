import path from "node:path";
import { isNonArrayRecord } from "@jini-ai/core";
import { load, FAILSAFE_SCHEMA } from "js-yaml";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";

/**
 * @file Tovu's bindings for `@jini-ai/agent-plugins/site/host-plugin-guidance`, the one formatter for
 * `content/agent-plugin-overlays/<pluginId>/` (plan 2026-11-02 §6): where Tovu's shipped overlays are
 * (`overlaysDir`), and the failsafe YAML reader (`isYamlMapping`) its frontmatter scan uses.
 *
 * Both delivery seams inject these: the `agent_plugin_<id>` tool wrapper in `tool-registrations.ts`
 * and the run-reference resolver in `lifecycle.ts`.
 */

/** Where the overlays directory is, and nothing else; both seams take the same option. */
export interface HostPluginOverlayOptional {
  /** Defaults to {@link agentPluginOverlaysDir} — the shipped overlays of this product build. */
  readonly overlaysDir?: string | undefined;
}

/**
 * The shipped overlays: `content/agent-plugin-overlays/`, copied to `dist/content/agent-plugin-overlays/`
 * by the server build, resolved package-relative exactly like `bundledAgentPluginsDir` in
 * `composition/site-paths.ts` (which re-exports this one). `TOVU_AGENT_PLUGIN_OVERLAYS_DIR` overrides.
 * Lives here, not in the composition root, because the module-level lifecycle binding has no
 * composition to receive it from, and a feature must not import the composition root.
 * @complexity O(depth) — the product-root walk-up.
 */
export function agentPluginOverlaysDir(_required: Record<string, never> = {}, optional: { env?: NodeJS.ProcessEnv } = {}): string {
  return (optional.env ?? process.env).TOVU_AGENT_PLUGIN_OVERLAYS_DIR ?? path.join(resolveProductRoot({}), "content", "agent-plugin-overlays");
}

/** The same failsafe YAML reader as platform/markdown/frontmatter: true only for a YAML mapping. O(text). */
export function isFailsafeYamlMapping({ text }: { text: string }, _optional: Record<string, never> = {}): boolean {
  return isNonArrayRecord({ value: load(text, { schema: FAILSAFE_SCHEMA }) });
}
