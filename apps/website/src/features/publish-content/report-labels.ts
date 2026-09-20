import { entityDisplayLabel, entityKey } from "./planner.js";
import type { PackedEntity } from "./type-registry.js";

/**
 * @file Naming the rows of a report THIS instance did not produce.
 *
 * A push plans on the DESTINATION: this instance builds a bundle, stages it there, and renders the
 * report that comes back. The destination names each row from the entity state it was given
 * (`planner.ts`'s `entityDisplayLabel`) — but only if it is running a build that knows to. A live
 * site deployed before that field existed answers rows with no label at all, and the dialog then
 * falls back to a short id for content this machine can name perfectly well.
 *
 * So the source labels the report itself, from the very bundle it just sent. Every row in a push
 * report corresponds to an entity in that bundle by {@link entityKey}, so the mapping needs no
 * lookup, no extra request and no agreement from the far side.
 *
 * ## Why the destination's own label still wins when it has one
 *
 * It is the destination's report. A label it supplied was derived from the same packed state this
 * side holds, so the two agree in every normal case — and where they could not (a row for an entity
 * that is somehow not in this bundle), the side that produced the row is the one with the context.
 * This module only ever FILLS IN a label, never overwrites one.
 *
 * Nothing here is load-bearing for safety: a label is display text. Every field a publish decision
 * actually turns on — `outcome`, `writes`, `reason`, the plan hash — is passed through untouched, and
 * a report whose shape is not what this module expects is returned exactly as it arrived rather than
 * being reshaped into something that parses.
 */

/** A plan envelope as `push/plan` receives it from a peer: `{planId, planHash, details, …}`, where
 *  `details` is the report. Deliberately `unknown`-shaped — this came off the network. */
type PeerPlanEnvelope = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fills in `entityLabel` on every row of a peer's plan from the local bundle that produced it.
 *
 * Returns the envelope unchanged when it is not the expected shape — a peer that answered something
 * this side does not recognize is the route's problem to report, not this function's to paper over.
 *
 * @complexity O(e + r) time in the bundle's entity count and the report's row count (one map build,
 * one pass); O(e + r) space for the map and the copied rows.
 */
export function labelPeerPlanRows(plan: PeerPlanEnvelope, entities: readonly PackedEntity[]): PeerPlanEnvelope {
  const details = plan.details;
  if (!isRecord(details) || !Array.isArray(details.rows)) return plan;

  const labelByKey = new Map<string, string | null>();
  for (const entity of entities) {
    labelByKey.set(entityKey(entity.entityType, entity.id), entityDisplayLabel(entity.state));
  }

  const rows = details.rows.map((row) => {
    if (!isRecord(row)) return row;
    if (typeof row.entityLabel === "string" && row.entityLabel.length > 0) return row;
    const local = labelByKey.get(entityKey(String(row.entityType ?? ""), String(row.entityId ?? "")));
    return local === undefined || local === null ? row : { ...row, entityLabel: local };
  });

  return { ...plan, details: { ...details, rows } };
}
