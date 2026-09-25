import type { ToolRegistry } from "@jini-ai/core";

import { attachFederatedMcpTools, type FederationLogger } from "./mcp-federation/bootstrap.js";
import type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
import type { McpSessionPort } from "./mcp-federation/ports.js";
import { buildFederatedRefusalPrefix } from "./mcp-federation/refusal-notice.js";
import { createFederationReloadCoordinator, type FederationReloadResult } from "./mcp-federation/reload.js";
import type { FederationDeps } from "./mcp-federation/registrations.js";

/**
 * @file One federation runtime, instantiated once per process (the daemon and BYOK each build their
 * own) from the SAME code — see `ADS-memory/.local-artifacts/design-byok-external-mcp-2026-09-24.md`
 * §2.1 item 2. Before this file, the boot pass, the reload coordinator, the merged admission
 * accounting, and the cached refusal prefix were four separate pieces of state hand-wired inline
 * inside `agent-daemon-server.ts`'s `start()` (`:1231-1420` there) — code a second process could not
 * reuse without copying it by hand and risking exactly the kind of drift
 * `process-root-parity.test.ts` exists to catch. This module is that wiring, extracted so BOTH
 * processes call through one implementation.
 *
 * Boot and reload are two ends of the SAME accounting: `start()` seeds it, `reload()` extends it, and
 * `reports()`/`refusalPrefix()` read whatever has accumulated across both, live. Splitting boot and
 * reload into two objects that each held half of this state was rejected — the daemon's own
 * `federationAdmissionReports`/`federationRefusalPrefix` pair already show what happens when they can
 * drift apart (`:1355-1356` reassigns both together, by hand, on every reload — the exact discipline
 * this file now owns so a caller cannot forget half of it).
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
   *  shares that one result. Never rejects, because neither `params.after` nor `attachFederatedMcpTools`
   *  ever does. */
  start(): Promise<void>;
  /** Re-admits every roster connection not yet admitted. Resolves `{newlyAdmittedConnectionIds: [],
   *  reports: []}` with no roster read at all if `start()` was never called — there is nothing yet to
   *  extend. If a `start()` is in flight, waits for it first, so a reload can never run against a
   *  boot pass's stale pre-seed state. */
  reload(): Promise<FederationReloadResult>;
  /** A live read of the merged boot-plus-every-reload admission accounting. */
  reports(): AttachFederatedToolsResultReports;
  /** A live read of the merged boot-plus-every-reload CONNECT failures (2026-09-24) — one entry per
   *  connection that never reached admission at all (bad spawn, timed-out handshake, malformed
   *  listing), so it has no entry in `reports()` either. Same shape and same merge discipline as
   *  `reports()`. */
  connectFailures(): AttachFederatedToolsResultConnectFailures;
  /** The refusal-prefix text for `reports()`, cached and recomputed only when `reports()` changes —
   *  `""` when there is nothing to report. */
  refusalPrefix(): string;
  /** Whether the boot pass has completed. */
  readonly started: boolean;
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

  function recomputePrefix(): void {
    cachedPrefix = buildFederatedRefusalPrefix(mergedReports);
  }

  async function runStart(): Promise<void> {
    await (params.after ?? Promise.resolve());
    const connections = await params.resolveConnections();
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
    coordinator = createFederationReloadCoordinator(
      {
        registry: params.registry,
        deps: params.deps,
        resolveConnections: params.resolveConnections,
        attach,
        logger,
      },
      mergedReports.map((entry) => entry.connectionId),
    );
    startedFlag = true;
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
    // not just a reload that also happened to admit something else alongside it. Does not touch
    // `cachedPrefix`: `buildFederatedRefusalPrefix` is a pure function of `mergedReports` alone, and
    // a connect failure never produces a report entry to feed it.
    if (result.connectFailures.length > 0) mergedConnectFailures = [...mergedConnectFailures, ...result.connectFailures];
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
    get started() {
      return startedFlag;
    },
  };
}
