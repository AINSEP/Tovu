import type { ErrorReporter } from "@jini-ai/core/errors/reporter";
import { ToolAccessLoweringError } from '@jini-ai/core/tool-access-change';
import type { SiteStoragePort } from "./storage-routes.js";
import { admittedToolSources, stopRunsForToolAccessChange } from '@jini-ai/daemon';
import type { ToolAccessChange } from '@jini-ai/core/contracts/site/daemon';
import { createAutomaticPluginRuns } from "#src/features/agent-plugins/automatic-agent-plugins";
import { askAgentPluginChoice } from "#src/assistant/ask-choice-tool";
import { resolveAgentPluginRefs } from "#src/features/agent-plugins/lifecycle";
import { translateRetiredPluginRefs } from "#src/features/agent-plugins/bundled-catalog";
import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor, DerivedToolContributor } from "@jini-ai/core";
import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import { createAccessApprover } from "#src/assistant/tool-registrations";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
/**
 * @file The admin assistant dock's "API · BYOK" execution mode (ADR-049's picker, see
 * `@jini-ai/chat`'s `AgentRuntimePicker`) — a SECOND, provider-direct run path alongside the
 * existing Local CLI path (`assistant.ts`'s proxy in front of `agent-daemon-server.ts`).
 *
 * Deliberately NOT mounted under `/api/runs` and NOT reusing `assistant.ts`'s run-lifecycle
 * (`POST /api/runs` → `EventSource(GET /api/runs/:runId/events)`, with separate `fetchRunStatus`/
 * `stopRun` requests against a runId the DAEMON tracks). That shape exists because the daemon is a
 * genuinely separate, long-lived process whose runs must be reattachable across an `EventSource`
 * reconnect. A BYOK turn has no such process to reattach to: this route holds the whole
 * request/response open for exactly one turn (mirrors `site-assistant.ts`'s own shape for the
 * public visitor assistant — same reasoning, same author, same day) and streams events on the SAME
 * connection the browser's `fetch()` opened. `apps/admin/src/lib/assistant-transport.ts`'s `startRun`
 * branches on execution mode: Local CLI keeps the existing POST-then-EventSource dance unchanged;
 * BYOK reads this response body directly as one continuous SSE stream.
 *
 * Disclosed cost of that simpler shape (see the 2026-08-04 milestone thread — asked to name what
 * this trades away rather than paper over it): a BYOK turn cannot be reattached after a page reload
 * or a dropped connection — closing the request loses the in-flight turn, the same way closing a
 * `fetch()` would for any other in-page request. `fetchRunStatus`/`stopRun`/`reattachRun` are not
 * implemented for BYOK-originated run ids in `assistant-transport.ts`; a page reload mid-BYOK-turn
 * shows the conversation as it stood, not a resumed stream. Local CLI mode is unaffected — its own
 * genuinely reattachable daemon-run model is untouched by anything in this file.
 *
 * Tool calling: real, not stubbed. `byok-tool-surface.ts` composes the identical
 * `buildAssistantToolRegistrations` catalog the daemon uses (131 tools, 21 domains, the same
 * per-tool `ToolPolicy`), so a BYOK-mode tool call is authorized and executed exactly like a
 * Local-CLI-mode one. MCP-UI confirmation parity: a tool that raises a surface via `ctx.emitSurface`
 * (today: only `content_post_delete`) now genuinely parks rather than failing closed —
 * `handleTurn` below builds a real `SurfaceEmitter` per tool call, writing each emission onto this
 * SAME SSE response as an `agent` event shaped exactly like the daemon path's own wire format (see
 * `toWireSurfacePayload`'s doc), so the already-shipped client-side `translateRunAgentPayload`
 * switch renders it with no new frontend branching. Redemption is `apps/website/src/server/runtime/composition/modules/assistant.ts`'s
 * job: it holds the SAME `toolSurface.surfaceExchanges` reference this module composed and exposes
 * on its own returned handle (see {@link createAssistantByokModule}'s doc for why `app.ts` captures
 * it that way rather than importing `byok-tool-surface.ts` directly) and tries local delivery before
 * falling back to the daemon's own store. Scope: verified for the `mcp-ui` channel only — see
 * `byok-tool-surface.ts`'s header for what remains out of scope (A2UI).
 *
 * Credential source: see `byok-credential.ts`'s header. As of the server-side keystore (design:
 * `ADS-memory/reports/analysis/2026-08-05-admin-byok-keystore-design.md`, owner-approved), this
 * module constructs `createStoredExecutionCredentialPort` — a request-supplied key still wins when
 * the browser sends one, and it falls back to this admin's own stored, encrypted row
 * (`admin_execution_credentials`, migration `0026`) when the request omits one.
 */

import type { NextFunction, Request, Response } from "express";


import {
  createStoredExecutionCredentialPort,
  createByokToolSurface,
  type ByokToolSurface,
  type ByokToolSurfaceDeps,
} from "#src/assistant/index";
import { requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { createTestOriginHttpClientFactory } from "#src/platform/http/test-origin-allowlist";
import { registerInstalledExtensionTools } from "../installed-extension-tools.js";
import { installFirstPartyToolContributors } from "../tool-catalog-manifest.js";
import { createRoutineToolDiscovery, type RoutineToolHost } from "#src/features/routines/routine-tool-registrations";
import type { ServerModuleHandle } from "./types.js";
import { buildDaemonAttachmentTools, createDaemonApprovalMemory, createDaemonAwareInstallAttachmentReader, registerAssistantToolExecRoutes, publishDaemonPluginEvent, findLiveSiteToolRun } from "./assistant-tool-exec.js";
import { assistantRunFinalizerFor } from "./run-finalizer/shared.js";
import { createAssistantServerFederation } from "./assistant-server-federation.js";
import { desktopMcpRuntime } from "#src/assistant/desktop-mcp-runtime";
import { registerDesktopMcpHandoff } from "./desktop-mcp-handoff.js";
import { readDaemonCallContext } from "@jini-ai/daemon/daemon-call-context";
import type { InternalRouteTarget } from "./tool-execution-caller-express.js";
import type { AttachmentLookup } from "@jini-ai/daemon/http";

import { handleTurn, sse, rememberByokSources, type ByokTurnContext, type LiveByokToolRun } from "./assistant-byok-turn.js";

export const BYOK_TURN_PATH = "/api/admin/v1/assistant/byok-turn";

/**
 * Return type widened past the generic {@link ServerModuleHandle} to also expose the composed
 * `toolSurface` — specifically so `app.ts` can capture `.toolSurface.surfaceExchanges` and hand it to
 * `createAssistantModule`'s redemption proxy WITHOUT importing `byok-tool-surface.ts` directly
 * itself. That's not a style preference: `app.ts` already transitively reaches `byok-tool-surface.ts`
 * through this module (which has always imported it), so reading the value off this return object
 * costs the composition root zero new edges in the dependency graph; a direct
 * `import { createByokToolSurface } from "../assistant/byok-tool-surface"` in `app.ts` would add one,
 * and — traced empirically via `npm run check:architecture` before landing this — that one new edge
 * from the highest-fan-out file in the whole codebase was enough to flip ~17 other files into the
 * "core" classification (both fan-in and fan-out above the graph median), regressing that ratcheted
 * metric. This shape gets the identical runtime behavior (one surface, built once, shared by both
 * modules) for zero graph cost.
 */
export interface AssistantByokModuleHandle extends ServerModuleHandle {
  readonly toolSurface: ByokToolSurface;
  /** Mounts the agent daemon's tool RPC over `toolSurface` (`assistant-tool-exec.ts`). */
  readonly registerToolExecRoutes: (required: { readonly router: InternalRouteTarget }) => void;
  /** Serving owner only: export/preview compositions must never replace its listener or reader. */
  readonly activateServerFederation: (required: { readonly router: InternalRouteTarget }, optional?: Record<string, never>) => void;
}

/** A provider ignoring Stop must produce a failure rather than leave the OFF request hanging.
 * Existing handlers receive the aborted turn signal; this deadline never claims they completed.
 * @complexity O(1), one cleared timer per affected live provider turn. */
async function awaitByokCleanup({ done }: { done: Promise<void> }, _optional = {}): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([done, new Promise<void>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ToolAccessLoweringError()), 4_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

  // Must run before `createByokToolSurface` (below, or the caller's own instance's earlier
  // construction) calls `buildAssistantToolRegistrations`: that function reads whatever
  // this composition's explicit core registries hold, and those registries start empty every
  // process boot. ADR-070 leaves this server as the site-tool registrar; the daemon discovers its
  // descriptors through RPC. Idempotent, so a test supplying its own `toolSurface`
  // (built from an already-installed registry) pays nothing extra for this still running.
function createByokContributions(_required: Record<string, never>, _optional = {}) {
  return {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor<AssistantToolRegistryDeps, AssistantSurfaceDeps> }) => contribution.domain }),
  };
}

/**
 * @param toolSurface - Defaults to a fresh `createByokToolSurface(routeDeps)`, built once right here
 * when the caller doesn't supply one — the production path (`app.ts`) always takes this default, so
 * it never needs its own `byok-tool-surface.ts` import (see {@link AssistantByokModuleHandle}'s doc
 * for why that specifically matters). The explicit parameter exists for tests that need to observe or
 * override the composed surface — e.g. injecting a short-TTL `surfaceExchangeStore` via
 * `createByokToolSurface`'s own override to prove the no-hang bound in milliseconds rather than the
 * production 5.5-minute ceiling — without which this module would have no seam to reach it through.
 * Optional (rather than a plain default parameter) specifically so
 * `installFirstPartyToolContributors()` below is guaranteed to run BEFORE the default
 * `createByokToolSurface(routeDeps)` construction, not as part of evaluating this function's own
 * argument list — a default-parameter expression evaluates before the function body starts, which
 * would be too early for the install call to have any effect on the surface it composes.
 */
/** @param optional.attachmentLookup Test seam for the daemon's attachment store (`assistant-tool-exec.ts`).
 * @param optional.federationConnect Existing transport port, forwarded for hermetic federation tests. */
export function createAssistantByokModule(
  { routeDeps, reporter }: { routeDeps: RouteDeps & ByokToolSurfaceDeps; reporter: ErrorReporter },
  { toolSurface, attachmentLookup, federationConnect, routines, routineApprovalReceiptsFor, siteStorage }: { toolSurface?: ByokToolSurface; attachmentLookup?: AttachmentLookup; siteStorage?: SiteStoragePort;
    federationConnect?: NonNullable<Parameters<typeof createByokToolSurface>[1]>["federationConnect"];
    /** The serving site's bound routine commands; supplied only when the routines release flag is on. Absent, no routine tool exists. */
    routines?: RoutineToolHost;
    /** Human-confirm's receipt port for tracked routine runs (P3-T3.T): observes receipts, never answers a card. */
    routineApprovalReceiptsFor?: NonNullable<Parameters<typeof createByokToolSurface>[1]>["approvalReceiptsFor"] } = {},
): AssistantByokModuleHandle {
  const contributions = createByokContributions({});
  let serverFederation: ReturnType<typeof createAssistantServerFederation>;
  const liveToolRuns = new Map<string, LiveByokToolRun>();

  // `outboundTestOrigins` is set only by the site-import journey harness; absent, this factory is
  // `createDefaultHttpClient` itself (`platform/http/test-origin-allowlist.ts`).
  // The agent daemon's tool RPC runs on this same surface (`assistant-tool-exec.ts`); the daemon-call
  // adapters below change nothing for a BYOK turn.
  installFirstPartyToolContributors({ contributions }, { env: process.env, readAdmissions: () => serverFederation.admissions(),
    readExternalMcpToolNames: required => resolvedToolSurface.readExternalMcpToolNames(required, {}), observability: routeDeps.observability, chatAttachmentsDir: routeDeps.siteStoragePaths.chatAttachmentsDir, siteStorage,
    createHttpClient: createTestOriginHttpClientFactory({ allowedOrigins: routeDeps.outboundTestOrigins ?? [] }),
    readInstallAttachment: createDaemonAwareInstallAttachmentReader({ uploadDirectory: routeDeps.siteStoragePaths.chatAttachmentsDir }),
    ...(routines ? { routines } : {}) });
  const surfaceDeps = routeDeps.conversationToolApprovals ? { ...routeDeps, nativeApprovalMemory: routeDeps.nativeApprovalMemory ?? createDaemonApprovalMemory({
    store: routeDeps.conversationToolApprovals, workspaceId: routeDeps.workspaceId, clock: routeDeps.clock }) } : routeDeps;
  // The public contract and both roots require complete BYOK dependencies;
  // no cast may conceal a missing runtime port.
  let automaticPluginRuns: ReturnType<typeof createAutomaticPluginRuns>;
  const resolvedToolSurface =
    toolSurface ??
    createByokToolSurface({ ...surfaceDeps, reporter }, byokSurfaceOptions(routeDeps, contributions, { federationConnect, attachmentLookup, automaticPluginRuns: () => automaticPluginRuns, routines, routineApprovalReceiptsFor }));
  automaticPluginRuns = createAutomaticPluginRuns({ deps: routeDeps, askAgentPluginChoice,
    surfaces: { surfaceExchanges: resolvedToolSurface.surfaceExchanges, assertAccessApprover: createAccessApprover(routeDeps) } });
  // Reuse the server's admission-aware adapters. No daemon federation or second registrar:
  // both catalog demand and execution await this same server surface's lazy startup.
  serverFederation = createAssistantServerFederation({ toolSurface: resolvedToolSurface }, { lowerLocal: change => lowerLocal(change, { liveToolRuns, resolvedToolSurface, automaticPluginRuns }) });
  const runStore = routeDeps.chatRunLedger.durable;
  if (runStore) assistantRunFinalizerFor({ ledger: routeDeps.chatRunLedger, tracker: routeDeps.tracker, observability: routeDeps.observability,
    onAttemptEnded: async ({ runId }) => {
      await findLiveSiteToolRun({ runId, runStore, workspaceId: routeDeps.workspaceId, plugins: { controller: automaticPluginRuns } });
    },
  }, {});
  const credentialPort = createStoredExecutionCredentialPort({
    repo: routeDeps.adminExecutionCredentialRepo,
    sealer: routeDeps.siteAssistantSecretSealer,
  });

  return byokModuleHandle({ routeDeps, reporter, resolvedToolSurface, automaticPluginRuns, credentialPort, liveToolRuns }, serverFederation);
}

function byokModuleHandle({ routeDeps, reporter, resolvedToolSurface, automaticPluginRuns, credentialPort, liveToolRuns }: ByokTurnContext, serverFederation: ReturnType<typeof createAssistantServerFederation>): AssistantByokModuleHandle {
  return {
    name: "assistant-byok",
    toolSurface: resolvedToolSurface,
    activateServerFederation: ({ router }) => {
      routeDeps.externalMcpAdmissions = serverFederation.admissions;
      serverFederation.registerRosterListener({}, {});
      registerDesktopMcpHandoff({ router, runtime: desktopMcpRuntime, reload: async () => {
        await serverFederation.reload({}, {});
        const report = await resolvedToolSurface.readFederationAdmissions({}, {});
        return report.connections.some(connection => connection.connectionId === "tovu-desktop");
      } }, {});
    },
    registerToolExecRoutes: ({ router }) => registerAssistantToolExecRoutes({ router, reporter, toolSurface: { daemonCalls: serverFederation.daemonCalls },
      runStore: routeDeps.chatRunLedger.durable, workspaceId: routeDeps.workspaceId, components: routeDeps, core: routeDeps,
      plugins: { controller: automaticPluginRuns, emit: publishDaemonPluginEvent,
        pinnedPrefix: async ({ pluginRefIds }) => {
          await Promise.all([routeDeps.pluginRuntimeReady, routeDeps.siteTitleReady]);
          const result = await resolveAgentPluginRefs({ pluginRefIds: translateRetiredPluginRefs({ pluginRefIds }), workspaceLayout: routeDeps.agentPluginLayout.forWorkspace({ workspaceId: routeDeps.workspaceId }) }, { deliveryMode: 'inject' });
          return result.ok ? result.promptPrefix : null;
        },
        refusalPrefix: () => resolvedToolSurface.federation?.refusalPrefix() ?? "",
      },
    }, {}),
    registerRoutes: ({ app }, _options = {}) => {
      app.use(BYOK_TURN_PATH, requireAdminSession(routeDeps));
      app.post(BYOK_TURN_PATH, (req: Request, res: Response, next: NextFunction) => {
        // Returned, not voided: Express ignores it, but an embedding host can await the turn it started.
        return handleTurn({ req, res, context: { routeDeps, reporter, resolvedToolSurface, automaticPluginRuns, credentialPort, liveToolRuns } }).catch((error: unknown) => {
          console.error("[assistant-byok] unhandled error", error);
          if (res.headersSent) {
            sse({ res, event: "error", data: { message: "assistant failed" } });
            res.end();
          } else {
            next(error);
          }
        });
      });
    },
  };
}

function byokSurfaceOptions(routeDeps: RouteDeps & ByokToolSurfaceDeps, contributions: NonNullable<Parameters<typeof createByokToolSurface>[1]>["contributions"], { federationConnect, attachmentLookup, automaticPluginRuns, routines, routineApprovalReceiptsFor }: {
  routines?: RoutineToolHost;
  routineApprovalReceiptsFor?: NonNullable<Parameters<typeof createByokToolSurface>[1]>["approvalReceiptsFor"];
  federationConnect: NonNullable<Parameters<typeof createByokToolSurface>[1]>["federationConnect"];
  attachmentLookup: AttachmentLookup | undefined;
  automaticPluginRuns: () => ReturnType<typeof createAutomaticPluginRuns>;
}): NonNullable<Parameters<typeof createByokToolSurface>[1]> {
  return {
      contributions,
      ...(routines ? { routineDiscovery: createRoutineToolDiscovery(routines) } : {}),
      ...(routineApprovalReceiptsFor ? { approvalReceiptsFor: routineApprovalReceiptsFor } : {}),
      ...(federationConnect ? { federationConnect } : {}),
      // Preserve the daemon's remembered approval contract on the existing server confirmer.
      // Async call context supplies the current chat; no process-global last-chat binding.
      federationApprovals: {
        ...(routeDeps.externalMcpToolApprovalRepo ? { always: routeDeps.externalMcpToolApprovalRepo } : {}),
        ...(routeDeps.conversationToolApprovals ? { chat: routeDeps.conversationToolApprovals } : {}),
        conversationIdForRun: () => readDaemonCallContext()?.conversationId,
      },
      hostRegistrations: ({ registrations }) => buildDaemonAttachmentTools({ deps: routeDeps, registrations }, attachmentLookup ? { getLookup: () => attachmentLookup } : {}),
      prepareGuidance: (required, optional) => automaticPluginRuns().prepareGuidance(required, optional),
      // The root injects the audit sink; see RouteDeps.toolAttemptAuditSink for why
      // consumers must not open their own database. A supplied toolSurface bypasses this branch.
      toolAttemptAudit: { sink: routeDeps.toolAttemptAuditSink, workspaceId: routeDeps.workspaceId },
      // Feature registrars `assistant/` must not import by value (module cycles) — injected here.
      registerInstalledExtensions: async ({ registry, deps, log }, _optional = {}) => {
        await registerInstalledExtensionTools({ registry, deps, log });
        // The awaited extension pass also lets the run controller bind to this surface below.
        registry.register(automaticPluginRuns().loadRegistration);
      },
    };
}


/** Abort is the provider turn's existing Stop path and closes its signal-bound cards/tools.
   * No credentials are minted for provider-direct execution. Await the existing turn finally.
   * @complexity O(live runs), no I/O besides the existing Stop/cleanup paths. */
async function lowerLocal(change: ToolAccessChange, { liveToolRuns, resolvedToolSurface, automaticPluginRuns }: Pick<ByokTurnContext, "liveToolRuns" | "resolvedToolSurface" | "automaticPluginRuns">): Promise<void> {
    const selected = new Map(liveToolRuns);
    const current = admittedToolSources({ tools: resolvedToolSurface.registry.list({}) });
    for (const run of selected.values()) rememberByokSources(run, current);
    const result = await stopRunsForToolAccessChange({ runs: [...selected.values()], change,
      revoke: ({ runId }) => { const entry = selected.get(runId); if (!entry) throw new Error("tool access change has no selected run to revoke"); entry.lowered = true; entry.abort.abort(); },
      cancel: async ({ runId }) => { automaticPluginRuns.forget({ runId }); },
      waitForCleanup: ({ runId }) => { const entry = selected.get(runId); if (!entry) throw new Error("tool access change has no selected run to await"); return awaitByokCleanup({ done: entry.done }); },
      notice: async ({ runId, message }) => { const entry = selected.get(runId); if (!entry) throw new Error("tool access change has no selected run to notify"); const response = entry.res; sse({ res: response, event: 'agent', data: { type: 'status', label: message } }); sse({ res: response, event: 'agent', data: { type: 'text_delta', delta: `\n\n${message}` } }); },
    }, {});
    if (result.failedRunIds.length) throw new ToolAccessLoweringError();
  }

