import { buildConfirmationSurface, type ConfirmationChoice, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";

import { PUBLISH_CONTENT_PUBLISH_TOOL_ID } from "./agent-tools.js";
import type { NotSupportedByLiveEntry } from "./peer-transport.js";
import { entityKey, type PublishContentOutcomeKind, type PublishContentOutcomeRow } from "./planner.js";

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

/** "was" for one thing, "were" for more — the verb {@link things}'s singular/plural split needs to
 *  read as a sentence rather than a fragment.
 *  @complexity O(1). */
function wasWere(count: number): string {
  return count === 1 ? "was" : "were";
}

/** Present-tense sibling of {@link wasWere}, for a state that still holds on the live site.
 *  @complexity O(1). */
function isAre(count: number): string {
  return count === 1 ? "is" : "are";
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

/**
 * One sentence saying what publishing JUST DID, for the assistant to say out loud after a publish
 * actually ran.
 *
 * `describePublishChanges` is plan-tense ("would add/replace") — right for the confirmation dialog,
 * wrong for the sentence that follows a completed publish, where it used to be reused verbatim and
 * left the success message reading "Published to site. Publishing would add…" after the write had
 * already happened. This is that missing past-tense counterpart, and unlike the plan sentence it
 * also names `counts.unchanged`: a person told "3 things were already up to date" learns something a
 * dialog asking "publish?" does not need to say, but a person told what already happened does.
 *
 * @complexity O(1).
 */
export function describePublishResult(counts: PublishChangeCounts, siteLabel: string): string {
  if (publishWouldChangeNothing(counts)) {
    const tails: string[] = [];
    if (counts.unchanged > 0) tails.push(`${things(counts.unchanged)} ${wasWere(counts.unchanged)} already up to date`);
    if (counts.skipped > 0) tails.push(`${things(counts.skipped)} ${wasWere(counts.skipped)} left alone`);
    if (tails.length === 0) return `${siteLabel} was already up to date.`;
    return `Nothing changed on ${siteLabel}. ${tails.join(", and ")}.`;
  }
  const parts: string[] = [];
  if (counts.added > 0) parts.push(`added ${things(counts.added)}`);
  if (counts.replaced > 0) parts.push(`replaced ${things(counts.replaced)}`);
  const tails: string[] = [];
  if (counts.unchanged > 0) tails.push(`${things(counts.unchanged)} ${wasWere(counts.unchanged)} already up to date`);
  if (counts.skipped > 0) tails.push(`${things(counts.skipped)} ${wasWere(counts.skipped)} left alone`);
  const tail = tails.length > 0 ? ` ${tails.join(", and ")}.` : "";
  return `Published to ${siteLabel}: ${parts.join(" and ")}.${tail}`;
}

/**
 * The correction {@link describePublishResult} needs when the destination wrote FEWER rows than its
 * plan promised — a row edited there between plan and apply is downgraded to `conflict` at apply
 * time (`apply-loop.ts`), and the plan's own counts would otherwise claim it was replaced. `null`
 * when every planned write landed. `actualWrites` is the execute response's `changeSetIds.length`:
 * one id per row that actually wrote.
 * @complexity O(1).
 */
export function describeApplyShortfall(
  writes: { plannedWrites: number; actualWrites: number },
  siteLabel: string
): string | null {
  const missed = writes.plannedWrites - writes.actualWrites;
  if (missed <= 0) return null;
  return missed === 1
    ? `1 of those changed on ${siteLabel} while publishing, so it was left alone.`
    : `${missed} of those changed on ${siteLabel} while publishing, so they were left alone.`;
}

/** Which of the known reasons publishing leaves a row alone, derived from the row's `reason`
 *  text — see {@link classifyLeftAloneReason}. `"other"` is the same conservative fallback
 *  {@link countPublishChanges} uses for an outcome kind nobody named yet: grouped and shown, never
 *  silently dropped. */
export type LeftAloneReasonClass =
  | "edited-on-live"
  | "no-baseline"
  | "body-format"
  | "type-not-supported-by-live"
  | "blob-missing"
  | "slug-taken-on-live"
  | "in-trash-on-live"
  | "kind-differs-on-live"
  | "other";

/** One reason-class's rows, ready to show. */
export interface LeftAloneGroup {
  readonly reasonClass: LeftAloneReasonClass;
  /** How many rows are in this group — may be larger than {@link entityLabels}.length. */
  readonly count: number;
  /** One plain sentence explaining this group, in a person's words. */
  readonly sentence: string;
  /** Up to 5 labels (falling back to the row's id — see `PublishContentOutcomeRow.entityLabel`'s own
   *  doc for why that fallback is the one case it is allowed), so a dialog can name a few without
   *  paying for every row in a large plan. */
  readonly entityLabels: readonly string[];
}

/** Fixed display order for {@link summarizeLeftAlone}'s groups — the same order plan §4 of
 *  `ADS-memory/.local-artifacts/publish-types-plan-2026-09-24.md` lists the five known reasons in,
 *  so the groups a person sees are not reordered from one publish to the next by object-key or
 *  Map-insertion happenstance. */
const LEFT_ALONE_REASON_ORDER: readonly LeftAloneReasonClass[] = [
  "edited-on-live",
  "no-baseline",
  "body-format",
  "type-not-supported-by-live",
  "blob-missing",
  "slug-taken-on-live",
  "in-trash-on-live",
  "kind-differs-on-live",
  "other",
];

/** A group shows at most this many labels; {@link LeftAloneGroup.count} still carries the true
 *  total. @complexity n/a — a display cap, not a computed value. */
const MAX_LEFT_ALONE_LABELS = 5;

/**
 * Sentence templates, one per {@link LeftAloneReasonClass}, each taking the group's row count.
 *
 * Kept as a lookup rather than a `switch` so {@link LEFT_ALONE_REASON_ORDER} and this map are the
 * only two places a new reason class has to be added — TypeScript's `Record` fails the file to
 * compile if either one is missed.
 */
const LEFT_ALONE_REASON_SENTENCE: Record<LeftAloneReasonClass, (count: number) => string> = {
  "edited-on-live": (n) =>
    `${things(n)} ${wasWere(n)} edited on the live site since the last publish, so publishing left ${n === 1 ? "it" : "them"} alone.`,
  "no-baseline": (n) =>
    `${things(n)} on the live site ${wasWere(n)} never published from this computer before, so publishing left ${
      n === 1 ? "it" : "them"
    } alone rather than overwrite something already there.`,
  "body-format": (n) =>
    `${things(n)} ${wasWere(n)} edited in a different way locally than on the live site, so publishing cannot carry the change over yet.`,
  "type-not-supported-by-live": (n) => `${things(n)} ${wasWere(n)} a kind of content the live site cannot receive yet.`,
  "blob-missing": (n) => `${things(n)} ${wasWere(n)} missing a file this computer could not find to send.`,
  "slug-taken-on-live": (n) =>
    `${things(n)} could not be published because the live site already has something different at the same address, so publishing left the live ${
      n === 1 ? "one" : "ones"
    } alone.`,
  "in-trash-on-live": (n) =>
    `${things(n)} ${isAre(n)} in the trash on the live site, so publishing left ${n === 1 ? "it" : "them"} there rather than bring ${
      n === 1 ? "it" : "them"
    } back.`,
  "kind-differs-on-live": (n) =>
    `${things(n)} ${isAre(n)} a different kind of content on the live site (for example a post there but a page here), so publishing left ${
      n === 1 ? "it" : "them"
    } alone.`,
  other: (n) => `${things(n)} ${wasWere(n)} left alone.`,
};

/**
 * Classifies one row's `reason` text into a {@link LeftAloneReasonClass}.
 *
 * Matches on the fixed English substrings `planner.ts`'s `planEntity` and `features/post/publish-
 * content.ts`'s `precheck` actually emit today (this file may not import either — `reason` is
 * already a plain string on {@link PublishContentOutcomeRow} by the time it gets here). A future
 * reason nobody wrote a matcher for lands in `"other"` rather than throwing or vanishing, the same
 * conservative default `countPublishChanges` uses for an unrecognised outcome kind.
 *
 * @complexity O(1) — a handful of substring checks, no regex backtracking risk.
 */
function classifyLeftAloneReason(reason: string | null): LeftAloneReasonClass {
  if (reason === null) return "other";
  if (reason.includes("has been edited on the destination since the last sync")) return "edited-on-live";
  if (reason.includes("no prior sync baseline for")) return "no-baseline";
  if (reason.includes("-format at this destination but")) return "body-format";
  if (reason.includes("no registered publish-content handler for entity type")) return "type-not-supported-by-live";
  if (reason.startsWith("required blob '") && reason.includes("is not available on this instance")) return "blob-missing";
  // `features/post/publish-content.ts`, `features/media/publish-content.ts` and
  // `features/navigation/publish-content.ts` prechecks — the same address held by a different row.
  if (reason.includes("is already held by a different")) return "slug-taken-on-live";
  if (reason.includes("is in the trash at this destination")) return "in-trash-on-live";
  if (reason.includes("at this destination but a '") && reason.includes("kind is fixed at creation")) return "kind-differs-on-live";
  return "other";
}

/** `true` for a row publishing leaves untouched — every `SKIPPED_OUTCOMES` kind, PLUS any outcome
 *  kind this file does not recognise, mirroring {@link countPublishChanges}'s own "an unrecognised
 *  kind counts as skipped, never silently dropped" rule so the two functions cannot drift apart on
 *  what "left alone" means.
 *  @complexity O(1). */
function isLeftAlone(row: PublishContentOutcomeRow): boolean {
  if (row.outcome === "created" || REPLACING_OUTCOMES.has(row.outcome) || row.outcome === "unchanged") return false;
  return true;
}

/**
 * Groups every row publishing left alone by why, for the "left alone" section of a publish result.
 *
 * Rows that were `created`/`applied`/`forced`/`unchanged` never appear in any group — see
 * {@link isLeftAlone}. Groups are returned in {@link LEFT_ALONE_REASON_ORDER}, and a class with zero
 * matching rows is omitted rather than shown empty.
 *
 * @complexity O(n) in `rows.length`, plus O(1) work per known reason class for the final ordering
 * pass (`LEFT_ALONE_REASON_ORDER` has a fixed length of 6).
 */
export function summarizeLeftAlone(rows: readonly PublishContentOutcomeRow[]): readonly LeftAloneGroup[] {
  const byClass = new Map<LeftAloneReasonClass, PublishContentOutcomeRow[]>();
  for (const row of rows) {
    if (!isLeftAlone(row)) continue;
    const reasonClass = classifyLeftAloneReason(row.reason);
    const bucket = byClass.get(reasonClass);
    if (bucket) bucket.push(row);
    else byClass.set(reasonClass, [row]);
  }

  const groups: LeftAloneGroup[] = [];
  for (const reasonClass of LEFT_ALONE_REASON_ORDER) {
    const bucket = byClass.get(reasonClass);
    if (!bucket || bucket.length === 0) continue;
    groups.push({
      reasonClass,
      count: bucket.length,
      sentence: LEFT_ALONE_REASON_SENTENCE[reasonClass](bucket.length),
      entityLabels: bucket.slice(0, MAX_LEFT_ALONE_LABELS).map((row) => row.entityLabel ?? row.entityId),
    });
  }
  return groups;
}

/** A human plural noun for a registered entity type, for {@link describeNotSupportedByLive}'s
 *  sentence. Not every type pluralizes with a trailing "s" (`media` already is one), so known types
 *  are named explicitly; an unrecognised type falls back to `<type>s` — degraded, never wrong,
 *  mirroring `entityDisplayLabel`'s own "unknown field -> null, never throw" posture. */
const ENTITY_TYPE_PLURAL: Record<string, string> = {
  post: "posts",
  page: "pages",
  media: "media",
  redirect: "redirects",
};

/** "3 posts" / "1 redirect" — the count plus this type's plural noun.
 *  @complexity O(1). */
function countedEntityTypeLabel(entry: NotSupportedByLiveEntry): string {
  const noun = ENTITY_TYPE_PLURAL[entry.entityType] ?? `${entry.entityType}s`;
  return `${entry.count} ${noun}`;
}

/** Joins counted labels the way a sentence does — "3 posts", "3 posts and 1 redirect",
 *  "3 posts, 1 redirect and 2 pages". Mirrors `publish-readiness.ts`'s own local `nameList`; kept
 *  as a separate copy per this codebase's "each file owns its own small fixture/helper" convention
 *  rather than exporting a cross-file utility for three lines of logic.
 *  @complexity O(n) in the list length. */
function joinCountedLabels(labels: readonly string[]): string {
  if (labels.length === 1) return labels[0] as string;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1] as string}`;
}

/**
 * One sentence saying what a push left behind because the live site cannot accept it yet — S-F1 of
 * `ADS-memory/.local-artifacts/publish-files-plan-2026-09-24.md` §5/§6.
 *
 * `null` when {@link entries} is empty, so a caller can splice this straight onto another sentence
 * without an empty-string artifact (`describePublishResult(...) + (extra ?? "")` would otherwise
 * leave a trailing space). Distinct from {@link summarizeLeftAlone}'s `"type-not-supported-by-live"`
 * group: that group covers a row the DESTINATION's own planner marked `blocked` because it has no
 * registered handler for the type at all; this sentence covers entities that were removed from the
 * bundle by THIS install's own capability probe, before the destination ever planned anything, so
 * they never became a plan row to summarize.
 *
 * @complexity O(n) in `entries.length`.
 */
export function describeNotSupportedByLive(entries: readonly NotSupportedByLiveEntry[], siteLabel: string): string | null {
  if (entries.length === 0) return null;
  const stayed = joinCountedLabels(entries.map(countedEntityTypeLabel));
  return `${siteLabel} is on an older Tovu, so ${stayed} stayed here. Update ${siteLabel}, then publish again.`;
}

/** The `ui://` URI for one publish confirmation. Keyed by the plan, so a dialog raised for an older
 *  plan is never mistaken for the current one — the same reason `deleteConfirmationUri` keys by the
 *  row's version.
 *  @complexity O(1). */
export function publishConfirmationUri(planId: string): UIResourceUri {
  return `ui://tovu/publish-content/${planId}` as UIResourceUri;
}

/** publish-overwrite-live-plan §4/S8 — the params key an "Overwrite on live" tick rides home under,
 *  byte-identical to Jini's own `ConfirmationSurfaceSpec.choicesParam` default so a caller never has
 *  to pass it explicitly. Exported so {@link resolveChosenOverwriteKeys} and the tool handler read
 *  the exact same key a dialog was built with. */
export const OVERWRITE_CHOICES_PARAM = "overwrite";

/** One plain sentence per row offering to overwrite it — the chat dialog's per-item checkbox label.
 *  Reuses {@link classifyLeftAloneReason} rather than re-deriving a second classification of the
 *  same `reason` string, so a wording change to one can never silently drift from the other's idea
 *  of what a row's reason means.
 *  @complexity O(1). */
function overwriteChoiceLabel(row: PublishContentOutcomeRow): string {
  const label = row.entityLabel ?? row.entityId;
  switch (classifyLeftAloneReason(row.reason)) {
    case "slug-taken-on-live": {
      const holder = row.retires ? (row.retires.entityLabel ?? row.retires.entityId) : "the one already there";
      return `${label}: replace live's copy (moves ${holder} to Trash)`;
    }
    case "no-baseline":
      return `${label}: replace live's own version, never published from here`;
    case "edited-on-live":
      return `${label}: replace live's edit since your last publish`;
    case "in-trash-on-live":
      return `${label}: bring back from live's Trash with your version`;
    case "kind-differs-on-live":
      return `${label}: change live's kind to match yours`;
    default:
      return `${label}: replace live's copy`;
  }
}

/**
 * Turns every row the operator may resolve by overwriting live into one unchecked Jini
 * `ConfirmationChoice` — publish-overwrite-live-plan §3 Assistant chat, step 3. Only rows the
 * PLANNER itself marked {@link PublishContentOutcomeRow.canOverwrite} appear; a row the run already
 * writes, or one no handler can resolve, offers no box.
 * @complexity O(n) in `rows.length`.
 */
export function buildOverwriteChoices(rows: readonly PublishContentOutcomeRow[]): readonly ConfirmationChoice[] {
  return rows.filter((row) => row.canOverwrite).map((row) => ({ id: entityKey(row.entityType, row.entityId), label: overwriteChoiceLabel(row) }));
}

/**
 * Reads the ticked ids a confirm click posted back, restricted to `offered` — publish-overwrite-
 * live-plan §7's security rule: an "Overwrite on live" key comes ONLY from the human's click (this
 * function's `params` argument is always `SurfaceMessage.params`, sourced from a browser POST to
 * `mcp-ui-tool-calls-route.ts`), never from anything the model can influence. Restricting to
 * `offered` additionally means an id the dialog never rendered a box for — however it got into
 * `params` — is silently dropped rather than acted on.
 *
 * @complexity O(n) in the ticked array's length.
 */
export function resolveChosenOverwriteKeys(params: Record<string, unknown>, offered: ReadonlySet<string>): readonly string[] {
  const raw = params[OVERWRITE_CHOICES_PARAM];
  if (!Array.isArray(raw)) return [];
  const chosen: string[] = [];
  for (const value of raw) {
    if (typeof value === "string" && offered.has(value) && !chosen.includes(value)) chosen.push(value);
  }
  return chosen;
}

/** Every key `rows` would actually write (`created`/`applied`/`forced`), minus `exclude` — the
 *  yardstick {@link overwriteReplanMatches} uses on both the shown and the re-planned report,
 *  mirroring the admin dialog's own `writingKeysExcluding` (`use-publish-content-confirm.hooks.ts`).
 *  @complexity O(n). */
function writingKeysExcludingOverwrite(rows: readonly PublishContentOutcomeRow[], exclude: ReadonlySet<string>): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.outcome !== "created" && !REPLACING_OUTCOMES.has(row.outcome)) continue;
    const key = entityKey(row.entityType, row.entityId);
    if (!exclude.has(key)) keys.add(key);
  }
  return keys;
}

/**
 * Whether re-planning with `chosen` ticks landed on a report consistent with `first` — publish-
 * overwrite-live-plan §3 Assistant chat, step 5. Two things must both hold: every ticked key is now
 * `forced` in `second`, and every OTHER writing row (created/applied/forced, outside `chosen`) names
 * the exact same set in both reports. `false` means live moved between the first plan and this one,
 * and the caller must publish nothing rather than act on a report the operator never saw.
 * @complexity O(n) in the larger report's row count.
 */
export function overwriteReplanMatches(
  first: readonly PublishContentOutcomeRow[],
  second: readonly PublishContentOutcomeRow[],
  chosen: ReadonlySet<string>
): boolean {
  const secondByKey = new Map(second.map((row) => [entityKey(row.entityType, row.entityId), row]));
  for (const key of chosen) {
    const row = secondByKey.get(key);
    if (!row || row.outcome !== "forced") return false;
  }
  const firstOther = writingKeysExcludingOverwrite(first, chosen);
  const secondOther = writingKeysExcludingOverwrite(second, chosen);
  if (firstOther.size !== secondOther.size) return false;
  for (const key of firstOther) if (!secondOther.has(key)) return false;
  return true;
}

/** "1 old version was moved" / "3 old versions were moved" — the sentence appended to a publish
 *  result when {@link executePeerImport}'s `retiredChangeSetIds` is non-empty (publish-overwrite-
 *  live-plan §3 Assistant chat, step 6). `null` when nothing was retired, so a caller can splice it
 *  onto another sentence the same way {@link describeApplyShortfall} already does.
 *  @complexity O(1). */
export function describeRetiredCount(count: number, siteLabel: string): string | null {
  if (count <= 0) return null;
  return count === 1
    ? `1 old version was moved to ${siteLabel}'s Trash.`
    : `${count} old versions were moved to ${siteLabel}'s Trash.`;
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
 * @param spec.overwriteChoices - publish-overwrite-live-plan §3 Assistant chat, step 3
 * ({@link buildOverwriteChoices}). Omitted or empty, the rendered document and the params confirm
 * posts are byte-identical to a dialog built before this field existed.
 * @returns The `EmbeddedResource` the daemon splits out and renders for the human.
 * @complexity O(1).
 */
export function buildPublishConfirmationResource(spec: {
  siteLabel: string;
  counts: PublishChangeCounts;
  planId: string;
  exchangeId: string;
  overwriteChoices?: readonly ConfirmationChoice[];
}): UIResource {
  const { siteLabel, counts, planId, exchangeId, overwriteChoices } = spec;

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
    ...(overwriteChoices !== undefined && overwriteChoices.length > 0
      ? { choices: overwriteChoices, choicesParam: OVERWRITE_CHOICES_PARAM }
      : {}),
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
