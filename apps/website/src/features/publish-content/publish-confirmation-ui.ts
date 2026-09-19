import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";

import { PUBLISH_CONTENT_PUBLISH_TOOL_ID } from "./agent-tools.js";
import type { PublishContentOutcomeKind, PublishContentOutcomeRow } from "./planner.js";

/**
 * @file The dialog `publish_content_publish` raises, and the counting that decides what it says.
 *
 * ## Why this exists rather than a boolean argument
 *
 * Writing to a live site is a gated ceremony on the destination, and
 * `contracts/core/gated-mutations/gateway.ts` holds that confirmation is a human act. A `confirm:
 * true` argument would make the model the confirmer, which is precisely the thing that rule
 * forbids. Holding the call open and asking a person instead is the shape this codebase already
 * settled on for the same problem (`features/post/delete-confirmation-ui.ts`, ADR-055 Decision 2):
 * the model's one call parks, and the only channel that can resolve it is a browser POST to
 * `assistant/mcp-ui-tool-calls-route.ts` — which sits behind the daemon's bearer gate and an admin
 * session, neither of which a model-issued tool call can satisfy.
 *
 * The exchange id interpolated below is a correlation handle, not a secret, for the reason
 * `delete-confirmation-ui.ts`'s header sets out: leaking it lets a caller NAME a pending call, not
 * act on it. It still goes here and nowhere else, so that there is visibly one path back.
 *
 * ## What the dialog is allowed to say
 *
 * Counts and consequences, in a person's words. Not entity types, not ids, not outcome kinds, not a
 * plan hash, and nothing about keys. A dialog that asks "apply 12 entities?" has not obtained
 * consent from someone who does not know what an entity is.
 */

/** How one publish would land, counted rather than listed. A person deciding whether to publish
 *  needs the shape of the change, not a row per item. */
export interface PublishChangeCounts {
  /** Things that do not exist on the live site yet. */
  readonly added: number;
  /** Things that exist there and would be overwritten with this computer's version. */
  readonly replaced: number;
  /** Things already identical on both sides. Nothing happens to these. */
  readonly unchanged: number;
  /** Things that would be skipped — edited on the live site since the last publish, or missing
   *  something they need. Publishing does not touch them. */
  readonly skipped: number;
}

/** Outcome kinds that mean "this item would be written over something already there". `forced` is
 *  a conflict the operator already chose to overwrite, so it lands with `applied` rather than with
 *  the skipped items — the person is being told what WOULD happen, and it would be overwritten. */
const REPLACING_OUTCOMES: ReadonlySet<PublishContentOutcomeKind> = new Set(["applied", "forced"]);

/** Outcome kinds that mean "publishing leaves this alone". */
const SKIPPED_OUTCOMES: ReadonlySet<PublishContentOutcomeKind> = new Set(["conflict", "blocked"]);

/**
 * Counts one plan's rows into the four buckets a person can act on.
 *
 * Every outcome kind maps to exactly one bucket, and an unrecognised kind counts as `skipped`
 * rather than being dropped: the total must equal the row count, because a dialog whose numbers do
 * not add up to what was planned is worse than no numbers. A new outcome kind added later therefore
 * shows up as something publishing will not touch — the conservative reading — instead of silently
 * vanishing from the summary.
 *
 * @complexity O(n) in the plan's row count.
 */
export function countPublishChanges(rows: readonly PublishContentOutcomeRow[]): PublishChangeCounts {
  let added = 0;
  let replaced = 0;
  let unchanged = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.outcome === "created") added += 1;
    else if (REPLACING_OUTCOMES.has(row.outcome)) replaced += 1;
    else if (row.outcome === "unchanged") unchanged += 1;
    else if (SKIPPED_OUTCOMES.has(row.outcome)) skipped += 1;
    else skipped += 1;
  }
  return { added, replaced, unchanged, skipped };
}

/** `true` when publishing this plan would write nothing at all. Worth asking about separately: a
 *  confirmation dialog for a change that is not a change wastes the one question this design gets
 *  to ask.
 *  @complexity O(1). */
export function publishWouldChangeNothing(counts: PublishChangeCounts): boolean {
  return counts.added === 0 && counts.replaced === 0;
}

/** "1 thing" / "3 things" — the unit a person uses when they do not know what an entity is.
 *  @complexity O(1). */
function things(count: number): string {
  return count === 1 ? "1 thing" : `${count} things`;
}

/**
 * One sentence saying what publishing would do, for the assistant to say out loud.
 *
 * Separate from the dialog because the model needs to be able to describe the plan in chat without
 * re-deriving it from counts and inventing its own wording for `skipped`.
 *
 * @complexity O(1).
 */
export function describePublishChanges(counts: PublishChangeCounts, siteLabel: string): string {
  if (publishWouldChangeNothing(counts)) {
    return counts.skipped > 0
      ? `Nothing would change on ${siteLabel}. ${things(counts.skipped)} would be left alone.`
      : `${siteLabel} is already up to date.`;
  }
  const parts: string[] = [];
  if (counts.added > 0) parts.push(`add ${things(counts.added)}`);
  if (counts.replaced > 0) parts.push(`replace ${things(counts.replaced)}`);
  const tail = counts.skipped > 0 ? ` ${things(counts.skipped)} would be left alone.` : "";
  return `Publishing would ${parts.join(" and ")} on ${siteLabel}.${tail}`;
}

/** The `ui://` URI for one publish confirmation. Keyed by the plan, so a dialog raised for an older
 *  plan is never mistaken for the current one — the same reason `deleteConfirmationUri` keys by the
 *  row's version.
 *  @complexity O(1). */
export function publishConfirmationUri(planId: string): UIResourceUri {
  return `ui://tovu/publish-content/${planId}` as UIResourceUri;
}

/**
 * Renders the publish confirmation as a self-contained MCP-UI resource.
 *
 * @param spec.siteLabel - The live site, as a person recognises it — its host, never its address
 * with a scheme and never an identifier.
 * @param spec.counts - What would happen, from {@link countPublishChanges}.
 * @param spec.planId - The destination's plan, used only to key the URI.
 * @param spec.exchangeId - The held-open call's correlation handle. **This is the only place it may
 * go** — see this file's header.
 * @returns The `EmbeddedResource` the daemon splits out and renders for the human.
 * @complexity O(1).
 */
export function buildPublishConfirmationResource(spec: {
  siteLabel: string;
  counts: PublishChangeCounts;
  planId: string;
  exchangeId: string;
}): UIResource {
  const { siteLabel, counts, planId, exchangeId } = spec;

  return buildConfirmationSurface({
    uri: publishConfirmationUri(planId),
    title: `Publish to ${siteLabel}?`,
    description: describePublishChanges(counts, siteLabel),
    details: [
      { label: "New", value: String(counts.added) },
      { label: "Replaced", value: String(counts.replaced) },
      { label: "Already up to date", value: String(counts.unchanged) },
      { label: "Left alone", value: String(counts.skipped) },
    ],
    // Shown only when it is true, so it stays a warning rather than furniture people click past.
    ...(counts.replaced > 0
      ? { warning: `${things(counts.replaced)} on ${siteLabel} will be replaced with the version on this computer.` }
      : {}),
    danger: counts.replaced > 0,
    confirm: {
      label: `Publish to ${siteLabel}`,
      toolName: PUBLISH_CONTENT_PUBLISH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    // A tool action rather than a bare dismiss: cancelling resolves the parked call immediately
    // instead of stranding it until the idle deadline — the same reason `content_post_delete`'s
    // cancel posts back.
    cancel: {
      label: "Not now",
      toolName: PUBLISH_CONTENT_PUBLISH_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-publish-content", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  });
}
