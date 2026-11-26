/**
 * @file The offer/commit halves of `POST /internal/agent-plugin-preflight`. Identity never comes
 * from the request: the stored `DurableRunHead` supplies principal, workspace, logical turn and run,
 * and its `recoveryCount` is the attempt. Ownership is re-read after every await and at commit, so
 * a stopped, replaced or recovered attempt can never commit another attempt's offer.
 */
import { randomUUID } from "node:crypto";
import { err, ok, type Result } from "@jini-ai/core/contracts/server";
import type { AgentPluginGuidanceAttempt, AgentPluginGuidanceOffer } from "@jini-ai/core/contracts/site/daemon";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import type { DurableRunHead } from "@jini-ai/chat/server/durable-runs";
import { parseRunStartContextRef } from "#src/assistant/run-start-context";
import type { AutomaticPluginRun, createAutomaticPluginRuns } from "@jini-ai/agent-plugins/site/automatic-agent-plugins";

type Runs = ReturnType<typeof createAutomaticPluginRuns>;
type OwnedRun = { head: DurableRunHead & { principalId: string }; scope: AgentPluginGuidanceAttempt; context: ReturnType<typeof parseRunStartContextRef> };

/** Ports the host composes; `contextFor` binds the run's consent/usage emitters to the live attempt. */
export type GuidanceRpcPorts = {
  findLive: (required: { runId: string }) => Promise<DurableRunHead | undefined>;
  controller: Pick<Runs, "forget"> & Partial<Pick<Runs, "offer" | "commit" | "guidanceIds">>;
  pinnedPrefix: (required: { pluginRefIds: readonly string[] }) => Promise<string | null>;
  refusalPrefix: () => string;
  contextFor: (required: { run: OwnedRun["head"]; context: OwnedRun["context"]; signal: AbortSignal }) => AutomaticPluginRun;
};

/** An explicit pick that cannot load is `prefix: null`, which the daemon turns into a fail-closed run start. */
export type PreparedGuidanceOffer = { prefix: string | null; refusalPrefix: string; pluginIds: readonly string[]; offer: AgentPluginGuidanceOffer | null };

const notLive = <T>(): Result<T> => err({ error: { code: "NOT_FOUND", message: "a live site run is required" } });
const unavailable = <T>(): Result<T> => err({ error: { code: "SERVICE_UNAVAILABLE", message: "plugin preflight is unavailable" } });

/** The attempt fence. @returns undefined for a head with no stored principal. O(1). */
export function attemptScopeOf({ head }: { head: DurableRunHead }, _optional = {}): AgentPluginGuidanceAttempt | undefined {
  return head.principalId ? { runId: head.runId, attempt: head.recoveryCount, principalId: head.principalId } : undefined;
}

function sameOwnership({ head, owned }: { head: DurableRunHead | undefined; owned: OwnedRun }, _optional = {}): boolean {
  return !!head && head.runId === owned.scope.runId && head.recoveryCount === owned.scope.attempt && head.principalId === owned.scope.principalId
    && head.workspaceId === owned.head.workspaceId && head.conversationId === owned.head.conversationId && head.messageId === owned.head.messageId;
}

async function readOwnedRun({ findLive, runId }: Pick<GuidanceRpcPorts, "findLive"> & { runId: string }, _optional = {}): Promise<OwnedRun | undefined> {
  const head = await findLive({ runId });
  const scope = head && attemptScopeOf({ head });
  if (!head || !scope) return undefined;
  const parsed = JSON.parse(head.request.contextRef) as Record<string, unknown>;
  const context = parseRunStartContextRef({ contextRef: JSON.stringify({ ...parsed, principalId: scope.principalId }) });
  return { head: { ...head, principalId: scope.principalId }, scope, context };
}

const stillOwned = async ({ findLive, owned }: Pick<GuidanceRpcPorts, "findLive"> & { owned: OwnedRun }) =>
  sameOwnership({ head: await findLive({ runId: owned.scope.runId }), owned });

/** Draft this attempt's optional guidance; pins are prepared here and always inlined by the daemon.
 * Offering records nothing. Optional guidance stays fail-open; the warning carries only a safe diagnostic.
 * @complexity Indexed head reads around one pinned resolution and one controller offer.
 */
export async function prepareGuidanceOffer(ports: GuidanceRpcPorts & { runId: string }, { signal }: { signal?: AbortSignal | undefined } = {}): Promise<Result<PreparedGuidanceOffer>> {
  const owned = await readOwnedRun(ports);
  if (!owned) return notLive();
  if (!ports.controller.offer) return unavailable();
  const pinnedPrefix = await ports.pinnedPrefix({ pluginRefIds: owned.context.pluginRefIds });
  if (!(await stillOwned({ findLive: ports.findLive, owned }))) return notLive();
  if (pinnedPrefix === null) return ok({ value: { prefix: null, refusalPrefix: ports.refusalPrefix(), pluginIds: [], offer: null } });
  const offer = await draftOffer({ ports, owned }, { signal });
  if (!(await stillOwned({ findLive: ports.findLive, owned }))) return notLive();
  return ok({ value: { prefix: pinnedPrefix, refusalPrefix: ports.refusalPrefix(), pluginIds: ports.controller.guidanceIds?.({ runId: owned.scope.runId }) ?? [], offer } });
}

async function draftOffer({ ports, owned }: { ports: GuidanceRpcPorts; owned: OwnedRun }, { signal }: { signal?: AbortSignal | undefined } = {}): Promise<AgentPluginGuidanceOffer | null> {
  const runId = owned.scope.runId;
  const abort = new AbortController();
  // A dropped request releases this attempt; a durable pending answer can still rejoin its turn.
  const onAbort = () => { abort.abort(); ports.controller.forget({ runId }, { preservePending: true }); };
  if (signal?.aborted) onAbort(); else signal?.addEventListener("abort", onAbort, { once: true });
  const isAttemptLive = async (scope: AgentPluginGuidanceAttempt) => scope.attempt === owned.scope.attempt && scope.principalId === owned.scope.principalId
    && sameOwnership({ head: await ports.findLive({ runId: scope.runId }), owned });
  try {
    return await ports.controller.offer!({ runId, messageId: owned.head.messageId, scope: owned.scope, offerId: randomUUID(), isAttemptLive,
      context: ports.contextFor({ run: owned.head, context: owned.context, signal: abort.signal }) });
  } catch (error) { console.warn("[agent-plugins] automatic guidance offer unavailable", describeErrorForLog({ err: error })); return null; }
  finally { signal?.removeEventListener("abort", onAbort); }
}

/** Record exactly the ids the daemon delivered for this attempt's offer. A refusal records nothing
 * and answers plain words; neither the controller's message nor any prompt text is logged or echoed.
 * @complexity Two indexed head reads around one serialized controller commit.
 */
export async function commitGuidanceOffer(ports: GuidanceRpcPorts & { runId: string; offerId: string; deliveredIds: readonly string[] }, { signal }: { signal?: AbortSignal | undefined } = {}): Promise<Result<{ pluginIds: readonly string[] }>> {
  const owned = await readOwnedRun(ports);
  if (!owned) return notLive();
  if (!ports.controller.commit) return unavailable();
  let guidanceIds: readonly string[];
  try { ({ guidanceIds } = await ports.controller.commit({ scope: owned.scope, offerId: ports.offerId, deliveredIds: ports.deliveredIds }, signal ? { signal } : {})); }
  catch (error) {
    console.warn("[agent-plugins] guidance commit refused", describeErrorForLog({ err: error }));
    return err({ error: { code: "CONFLICT", message: "This plugin guidance choice could not be recorded." } });
  }
  if (!(await stillOwned({ findLive: ports.findLive, owned }))) return notLive();
  return ok({ value: { pluginIds: guidanceIds } });
}
