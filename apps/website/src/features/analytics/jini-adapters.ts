/** Tovu ports/presets around the shared ingestion engine; no normalization or buffer logic lives here. */
import {
  LocalBufferSink,
  type AnalyticsPrivacyPolicy,
  type AnalyticsSaltContext,
  type IngestHitDeps,
  type IngestHitOptional,
} from "@jini-ai/analytics";
import type { AnalyticsSinkPort, IngestDeps } from "./ports.js";
import type { NormalizedHit } from "./types.js";

/**
 * Preserve bounded event bags (ADR-022 bounded-cost discipline: 20 keys and 200-char strings)
 * and 30-minute same-day sessions (ADR-035). A visit crossing a time-window edge gets two IDs;
 * true cross-window stitching is a later rollup/session-table concern.
 */
export const analyticsPrivacyPolicy: AnalyticsPrivacyPolicy = {
  maxEventPropCount: 20,
  maxEventPropStringLength: 200,
  sessionWindowMinutes: 30,
};

/**
 * Host-owned HKDF wire context: changing either string changes existing visitor/session hashes.
 * The fixed non-secret extraction salt pins the extraction step reproducibly across processes;
 * uniqueness comes from the secret root key and the workspace/date info, not this constant.
 */
export const analyticsSaltContext: AnalyticsSaltContext = {
  extractionSalt: "tovu-analytics-daily-salt-hkdf-v1",
  infoPrefix: "analytics-salt:",
};

/** Existing HTTP dependencies retain the host clock, IDs and plugin hook ABI. */
export interface AnalyticsIngestRouteDeps extends IngestDeps {
  resolveWorkspaceForHost: (host: string) => Promise<string | null> | string | null;
  rootKeySeed: string;
}

/**
 * Convert host ports to the package's object arguments and supply explicit host policy/context.
 * Hooks receive only normalized hits; adapter failures propagate to the HTTP error boundary.
 * @returns Required Jini deps and separate optional hooks, without invoking any port.
 * @example const { deps, optional } = createAnalyticsIngestBinding({ deps: hostDeps });
 * @complexity O(1).
 */
export function createAnalyticsIngestBinding(
  required: { deps: AnalyticsIngestRouteDeps },
  _optional: Record<string, never> = {},
): { deps: IngestHitDeps; optional: IngestHitOptional } {
  const host = required.deps;
  const hooks = host.hooks;
  return {
    deps: {
      config: host.config,
      sink: {
        capabilities: () => host.sink.capabilities(),
        accept: ({ hit }) => host.sink.accept(hit),
        acceptBatch: ({ hits }) => host.sink.acceptBatch(hits),
        list: (_required, optional) => host.sink.list(optional),
      },
      resolveWorkspaceForHost: ({ host: siteHost }) => host.resolveWorkspaceForHost(siteHost),
      rootKeySeed: host.rootKeySeed,
      saltContext: analyticsSaltContext,
      privacyPolicy: analyticsPrivacyPolicy,
    },
    optional: hooks ? { hooks: { beforeIngest: ({ hit }) => hooks.beforeIngest(hit) } } : {},
  };
}

/**
 * Adapt Jini's process-local buffer to the existing Tovu sink port and inspection getter.
 * The package owns copying, list bounds/order and durable=false; SQL adapters keep the same port.
 * @returns A fresh buffer adapter; contents disappear on process restart.
 * @example const sink = createLocalAnalyticsSink({}, { initialHits: [] });
 * @complexity O(n) for n initial hits; subsequent costs are those of LocalBufferSink.
 */
export function createLocalAnalyticsSink(
  _required: Record<string, never>,
  optional: { initialHits?: readonly NormalizedHit[] } = {},
): AnalyticsSinkPort & { all(): NormalizedHit[] } {
  // Deleted repo.memory.ts/LocalBufferSink fork: @jini-ai/analytics owns the implementation (DELETED-CODE.md).
  const sink = new LocalBufferSink({}, optional);
  return {
    capabilities: () => sink.capabilities({}),
    accept: (hit) => sink.accept({ hit }),
    acceptBatch: (hits) => sink.acceptBatch({ hits }),
    list: (input) => sink.list({}, input),
    all: () => sink.all({}),
  };
}
