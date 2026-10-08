import { tovuFederationMessages } from "./mcp-federation/presets.js";
import type { ToolRegistry } from "@jini-ai/core";

import { attachFederatedMcpTools, type FederationLogger } from "./mcp-federation/bootstrap.js";
import type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";
import type { McpSessionPort } from "@jini-ai/mcp/federation";
import { buildFederatedRefusalPrefix } from "@jini-ai/mcp/federation";
import { createFederationReloadCoordinator } from "./mcp-federation/reload-adapter.js";
import type { FederationReloadResult } from "@jini-ai/mcp/federation";
import type { FederationDeps } from "./mcp-federation/registrations.js";

/**
 * @file One federation runtime per process, shared by daemon and BYOK composition.
 * Boot and reload own one accounting state: `start()` seeds it, `reload()` extends it, and
 * `reports()`/`refusalPrefix()` read it live. Separate state for these views would allow drift.
 *
 * Architectural role:
 * Composition. No I/O of its own — every I/O call (`attach`, `resolveConnections`) is a parameter, so
 * this file is importable and testable without booting a real process, matching `bootstrap.ts` and
 * `reload.ts`'s own posture.
 */

/** Everything one process needs to build its own federation runtime. */
export interface CreateFederationRuntimeParams {
  readonly registry: ToolRegistry;
  readonly deps: FederationDeps;
  /** Reads the operator-editable roster fresh — today, `readEnabledExternalMcpConfigs` wrapped by
   *  `external-mcp-connection-source.ts`'s `createStoredExternalMcpConnectionSource`. Called once at
   *  boot and once per actual reload pass, never once per `reload()` caller — see
   *  `mcp-federation/reload.ts`'s own coalescing doc. */
  readonly resolveConnections: () => Promise<readonly ResolvedFederatedConnection[]>;
  /**
   * Resolved before `start()`'s own boot pass ever calls `attach` — today, the installed-extension
   * tools' registration promise, so a federated id can never win a registration race against an
   * installed-extension id for the same slot (`installed-extension-tools.ts`'s
   * `attachAssistantToolExtensions` is what wires this in). Defaults to an already-resolved promise
   * for a caller with nothing to wait on.
   */
  readonly after?: Promise<void>;
  /** Called once per reload pass that actually admitted something new — never for a no-op reload.
   *  The daemon rebinds its live tool catalog here; BYOK rebuilds its search index. */
  readonly onAdmitted?: (result: FederationReloadResult) => void;
  /** The calling process's own console prefix — `"[agent-daemon]"` or `"[assistant-byok]"` — so both
   *  processes' boot logs stay byte-identical to what they printed before this runtime existed. */
  readonly log: string;
  /** Test seam — defaults to the real {@link attachFederatedMcpTools}. Shared by the boot pass and
   *  the reload coordinator, so a test double replaces every attach attempt this runtime ever makes. */
  readonly attach?: typeof attachFederatedMcpTools;
  /** Test seam — the session factory for the boot pass only, matching
   *  `AttachFederatedMcpToolsParams.connect`'s own scope: a reload pass never overrides `connect` (see
   *  `mcp-federation/reload.ts`'s `runOnePass`), so this has nothing to thread through there. */
  readonly connect?: (connection: ResolvedFederatedConnection) => Promise<McpSessionPort>;
}

export interface FederationRuntime {
  /** The boot pass: presets plus the roster `resolveConnections` returns. Single-flight and
   *  idempotent — calling it any number of times performs the boot pass exactly once and every call
   *  shares that one result. Never rejects: attach absorbs per-connection failures, and this
   *  runtime catches failures from `after` and `resolveConnections` so callers can await boot
   *  unconditionally and `started` reaches its terminal state. */
  start(): Promise<void>;
  /** Re-admits every roster connection not yet admitted. Resolves `{newlyAdmittedConnectionIds: [],
   *  reports: []}` with no roster read at all if `start()` was never called — there is nothing yet to
   *  extend. If a `start()` is in flight, waits for it first, so a reload can never run against a
   *  boot pass's stale pre-seed state. */
  reload(): Promise<FederationReloadResult>;
  /** A live read of the merged boot-plus-every-reload admission accounting. */
  reports(): AttachFederatedToolsResultReports;
  /** A live read of the merged boot-plus-every-reload CONNECT failures — one entry per
   *  connection that never reached admission at all (bad spawn, timed-out handshake, malformed
   *  listing), so it has no entry in `reports()` either. Same shape and same merge discipline as
   *  `reports()`. */
  connectFailures(): AttachFederatedToolsResultConnectFailures;
  /** The refusal-prefix text for `reports()`, cached and recomputed only when `reports()` changes —
   *  `""` when there is nothing to report. */
  refusalPrefix(): string;
  /** Whether the boot pass has completed — successfully or not; see `start()`'s own doc.
   */
  readonly started: boolean;
  /**
   * The boot roster's connection ids — `undefined` until `resolveConnections()` resolves
   * (the roster itself is not known yet), then fixed for the rest of boot. Lets a caller building
   * `FederationBootStatus` (`federated-refusal-diagnosis.ts`) tell "a real, pending roster connection"
   * apart from "never configured at all" while `!started`, without waiting for the whole boot pass —
   * see that file's `configuredConnectionIds` doc for why `undefined` and `[]` are different claims.
   */
  configuredConnectionIds(): readonly string[] | undefined;
}

/** Named alias purely so this file's public surface does not have to spell out
 *  `Awaited<ReturnType<typeof attachFederatedMcpTools>>["reports"]` at every use. */
type AttachFederatedMcpToolsResult = Awaited<ReturnType<typeof attachFederatedMcpTools>>;
type AttachFederatedToolsResultReports = AttachFederatedMcpToolsResult["reports"];
type AttachFederatedToolsResultConnectFailures = AttachFederatedMcpToolsResult["connectFailures"];

/**
 * Builds one process's federation runtime. Nothing here performs I/O until `start()` or `reload()` is
 * called — constructing this is free, which is what lets a caller (`installed-extension-tools.ts`)
 * build it unconditionally and leave starting it to whichever root decides when.
 *
 * @complexity O(1) to construct; `start()`/`reload()` inherit their cost from `attachFederatedMcpTools`
 * and `createFederationReloadCoordinator`.
 * @overallScore 100
 */
export function createFederationRuntime(params: CreateFederationRuntimeParams): FederationRuntime {
  const attach = params.attach ?? attachFederatedMcpTools;
  const logger: FederationLogger = {
    info: (message) => console.log(`${params.log} ${message}`),
    warn: (message) => console.warn(`${params.log} ${message}`),
  };

  let mergedReports: AttachFederatedToolsResultReports = [];
  let mergedConnectFailures: AttachFederatedToolsResultConnectFailures = [];
  let cachedPrefix = "";
  let startPromise: Promise<void> | undefined;
  let startedFlag = false;
  let coordinator: ReturnType<typeof createFederationReloadCoordinator> | undefined;
  let configuredConnectionIds: readonly string[] | undefined;

  function recomputePrefix(): void {
    cachedPrefix = buildFederatedRefusalPrefix({ snapshot: mergedReports, messages: tovuFederationMessages });
  }

  async function runStart(): Promise<void> {
    // Catch prerequisites as well as attachment: a failed roster read must complete boot's
    // lifecycle so later calls are diagnosed as failed rather than "still connecting" forever.
    // Optional federation failures cannot disable the native assistant.
    try {
      await (params.after ?? Promise.resolve());
      const connections = await params.resolveConnections();
      configuredConnectionIds = connections.map((connection) => connection.config.connectionId);
      const attached = await attach({
        registry: params.registry,
        deps: params.deps,
        extraConnections: connections,
        logger,
        ...(params.connect ? { connect: params.connect } : {}),
      });

      mergedReports = attached.reports;
      mergedConnectFailures = attached.connectFailures;
      recomputePrefix();
      coordinator = createFederationReloadCoordinator({ coordDeps: {
          registry: params.registry,
          deps: params.deps,
          resolveConnections: params.resolveConnections,
          attach,
          logger,
          ...(params.connect ? { connect: params.connect } : {}),
        }, initiallyAdmitted: mergedReports.map((entry) => entry.connectionId),
      });
    } catch (error) {
      logger.warn(`mcp-federation: boot pass failed, continuing without federated tools — ${messageOf(error)}`);
    } finally {
      startedFlag = true;
    }
  }

  function start(): Promise<void> {
    if (!startPromise) startPromise = runStart();
    return startPromise;
  }

  async function reload(): Promise<FederationReloadResult> {
    // Nothing to extend yet — matches `start()` never having run, rather than treating "not started"
    // as an error. A caller unsure whether `start()` has happened yet (BYOK's lazy start) can always
    // call `reload()` first and get a harmless no-op.
    if (!startPromise) return { newlyAdmittedConnectionIds: [], reports: [], connectFailures: [] };
    await startPromise;
    if (!coordinator) return { newlyAdmittedConnectionIds: [], reports: [], connectFailures: [] };

    const result = await coordinator.reload();
    // A reload's own connect failures are merged unconditionally, even when nothing was newly
    // admitted — a reload that only ever fails a connection must still make that failure visible,
    // not just a reload that also happened to admit something else alongside it. Every connection
    // this pass attempted (admitted or failed) first drops its older entry: a now-admitted one must
    // leave the list (the admissions wire documents `connections`/`configFailures` as disjoint), and
    // a repeat failure replaces rather than piling up one entry per reload. Does not touch
    // `cachedPrefix`: `buildFederatedRefusalPrefix` is a pure function of `mergedReports` alone, and
    // a connect failure never produces a report entry to feed it.
    const attemptedIds = new Set([...result.newlyAdmittedConnectionIds, ...result.connectFailures.map((entry) => entry.connectionId)]);
    if (attemptedIds.size > 0) {
      mergedConnectFailures = [...mergedConnectFailures.filter((entry) => !attemptedIds.has(entry.connectionId)), ...result.connectFailures];
    }
    if (result.newlyAdmittedConnectionIds.length === 0) return result;

    mergedReports = [...mergedReports, ...result.reports];
    recomputePrefix();
    params.onAdmitted?.(result);
    return result;
  }

  return {
    start,
    reload,
    reports: () => mergedReports,
    connectFailures: () => mergedConnectFailures,
    refusalPrefix: () => cachedPrefix,
    configuredConnectionIds: () => configuredConnectionIds,
    get started() {
      return startedFlag;
    },
  };
}

/** Local copy of `bootstrap.ts`'s private helper of the same name — not shared because that file
 *  exports nothing for this one purpose, and this is a one-line reduction, not a policy this module
 *  needs to stay byte-identical with. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
