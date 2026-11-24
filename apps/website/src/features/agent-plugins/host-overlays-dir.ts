import path from "node:path";
import { resolveProductRoot } from "#src/platform/site-dir/product-root";

/**
 * @file Where this product's Agent Plugin overlays live, bound into `@jini-ai/agent-plugins/site/host-plugin-guidance`
 * (which takes the directory as a required `overlaysDir`).
 *
 * The shipped overlays: `content/agent-plugin-overlays/`, copied to `dist/content/agent-plugin-overlays/`
 * by the server build, resolved package-relative exactly like `bundledAgentPluginsDir` in
 * `composition/site-paths.ts` (which re-exports this one). `TOVU_AGENT_PLUGIN_OVERLAYS_DIR` overrides.
 * Lives here, not in the composition root, because the module-level lifecycle binding has no
 * composition to receive it from, and a feature must not import the composition root.
 */

/** @complexity O(depth) — the product-root walk-up. */
export function agentPluginOverlaysDir(_required: Record<string, never> = {}, optional: { env?: NodeJS.ProcessEnv } = {}): string {
  return (optional.env ?? process.env).TOVU_AGENT_PLUGIN_OVERLAYS_DIR ?? path.join(resolveProductRoot({}), "content", "agent-plugin-overlays");
}
