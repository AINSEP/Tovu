import { listBundledContributionSources } from "@jini-ai/agent-plugins/site/bundled-contribution-sources";
import type { TrustedPluginPackage } from "@jini-ai/agent-plugins/lifecycle";

import { RETIRED_BUNDLED_AGENT_PLUGINS } from "./bundled-catalog.js";

/** Tovu's hermetic bundled contribution sources, in plugin-id order: Jini's selection policy bound to
 * Tovu's retired bundled catalog. Only pass product-owned source roots, never operator-writable
 * installed directories. @complexity O(p) directories. */
export function bundledContributionSources(required: { readonly sourceRoot: string; readonly filename: string }, _optional: Record<string, never> = {}): readonly TrustedPluginPackage[] {
  return listBundledContributionSources({ ...required, retired: RETIRED_BUNDLED_AGENT_PLUGINS });
}
