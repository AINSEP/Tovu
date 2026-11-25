import type { MutationActor } from "@jini-ai/core/contracts/events";

/**
 * @file Host-composition attribution for recorded mutations (P10-H2.T). The composition root knows
 * which trusted path a write came through — an authenticated admin command, an assistant tool run
 * (the CLI executor and the BYOK executor share the same tool registrations), or a background worker
 * — and that path, not the principal id, decides the kind stamped on the change set and its outbox
 * event. Authorization still runs on the acting user's own principal id; this only labels provenance.
 */

/** The stable, named actor a truly autonomous background job writes as. */
export const WORKER_SYSTEM_ACTOR_ID = "system:background-worker";

/** The trusted call path a mutation arrived through. A worker acts for nobody, so it names no principal. */
export type MutationOrigin =
  | { origin: "admin"; principalId: string }
  | { origin: "assistant"; principalId: string }
  | { origin: "worker"; principalId?: undefined };

/** The kind each trusted origin stamps; `admin` and `assistant` keep the narrower command-actor kinds. */
type ActorFor<O extends MutationOrigin> = O extends { origin: "admin" } ? MutationActor & { kind: "user" }
  : O extends { origin: "assistant" } ? MutationActor & { kind: "agent" }
  : MutationActor & { kind: "system" };

/**
 * The actor a mutation is attributed to, from the trusted origin of the call.
 *
 * @param required - The origin, and the acting principal for admin and assistant writes.
 * @returns `{ id, kind }` — the principal as `user` (admin) or `agent` (assistant), or the named system actor (worker).
 * @example actorForMutation({ principalId: ctx.principal.id, origin: "assistant" }) // { id, kind: "agent" }
 * @complexity O(1).
 */
export function actorForMutation<O extends MutationOrigin>(required: O, _optional: Record<string, never> = {}): ActorFor<O> {
  // An assistant acting for an owner does not turn the action into an owner click.
  if (required.origin === "assistant") return { id: required.principalId, kind: "agent" } as ActorFor<O>;
  if (required.origin === "admin") return { id: required.principalId, kind: "user" } as ActorFor<O>;
  return { id: WORKER_SYSTEM_ACTOR_ID, kind: "system" } as ActorFor<O>;
}
