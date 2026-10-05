import { authenticatedAdminRequest, WORKSPACE_ID } from "@/lib/api";
import { CONTENT_ANALYZER_PLUGIN_ID, type PluginPreviewRequest } from "../rules";
import type { ContentAnalysisPort, PluginPreviewResponse } from "./content-analysis-port.hooks";

/**
 * @file The only place `use-content-analysis.hooks.ts` reaches `lib/api` — see
 * `content-analysis-port.hooks.ts` for why the split exists.
 */

const previewPath = (pluginId: string) => `/workspaces/${WORKSPACE_ID}/plugins/${encodeURIComponent(pluginId)}/preview`;

/** The live implementation, as a module-level singleton. */
export const defaultContentAnalysisPort: ContentAnalysisPort = {
  // Workspace-scoped like every plugins route (`routes/plugins/preview.ts`, PLUGIN_PREVIEW and
  // PLUGIN_PREVIEW_STATUS).
  previewStatus: ({ pluginId }) => authenticatedAdminRequest({ path: previewPath(pluginId), method: "GET" }),
  previewPlugin: ({ pluginId }, body) => authenticatedAdminRequest({ path: previewPath(pluginId), method: "POST", body }),
};

/** Seed state for {@link createFakeContentAnalysisPort}. */
export interface FakeContentAnalysisPortOptions {
  /** Whether the `content-analyzer` plugin reports as enabled. Defaults to `true`. */
  enabled?: boolean;
  /** When set, `previewStatus()` rejects with this. */
  statusError?: Error;
  /** The `fields` a preview returns. Defaults to `{}`. */
  previewFields?: PluginPreviewResponse["fields"];
  /** When set, `previewPlugin()` rejects with this (changeable later via `setPreviewError`). */
  previewError?: Error;
  /** When set, `previewPlugin()` waits for it before answering — for in-flight and race tests. */
  previewGate?: Promise<void>;
}

/**
 * An in-memory {@link ContentAnalysisPort} for tests — "every port gets a fake". Records each
 * preview call so a test can assert exactly which draft was sent.
 */
export function createFakeContentAnalysisPort(options: FakeContentAnalysisPortOptions = {}): ContentAnalysisPort & {
  readonly statusCalls: number;
  readonly previewCalls: Array<{ pluginId: string; body: PluginPreviewRequest }>;
  setPreviewError(error: Error | null): void;
} {
  let statusCalls = 0;
  let previewError = options.previewError ?? null;
  const previewCalls: Array<{ pluginId: string; body: PluginPreviewRequest }> = [];
  return {
    get statusCalls() {
      return statusCalls;
    },
    previewCalls,
    setPreviewError(error) {
      previewError = error;
    },
    async previewStatus({ pluginId }) {
      statusCalls += 1;
      if (options.statusError) throw options.statusError;
      return { pluginId, enabled: pluginId === CONTENT_ANALYZER_PLUGIN_ID && (options.enabled ?? true) };
    },
    async previewPlugin({ pluginId }, body) {
      previewCalls.push({ pluginId, body });
      await options.previewGate;
      if (previewError) throw previewError;
      return { pluginId, fields: options.previewFields ?? {} };
    },
  };
}
