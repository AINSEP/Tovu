import { ToolInputError } from "@jini-ai/core";
import type { PublishContentToolDeps } from "./tool-registrations.js";
import { resolvePublishDestinationCredential } from "./destination-credential.js";
import { selectConnectedDestination } from "./peers.js";
import { canPublishToLive, PUBLISH_FROM_LIVE_SITE_ERROR } from "./live-site-policy.js";
import { planPublishToPeer } from "./push-plan.js";
import { confirmPeerImport, executePeerImport } from "./peer-transport.js";
import { applyPublishCriteria, parsePublishContentToolInput, type PublishCriteria } from "./ui/criteria.js";
import { canConfirmPlan } from "./ui/phase.js";
import { overwriteReplanIsConsistent, preparePublishConfirmation } from "./ui/replan.js";
import { selectableRowKeys, toPublishReportRows } from "./ui/report-rows.js";
import type { PublishContentPlanResult, PublishContentReport } from "./ui/contract.js";

/** Strict tool boundary: misspelled filters must never widen an autonomous publish. */
function readCriteria(input: Record<string, unknown>): PublishCriteria & { readonly excludeItems?: readonly string[] } {
  for (const key of ["types", "items", "excludeItems"] as const) {
    const value = input[key];
    if (value !== undefined && (!Array.isArray(value) || value.length > 1000 ||
      !value.every(item => typeof item === "string" && item.trim().length > 0))) {
      throw new ToolInputError({ message: `'${key}' must be an array of at most 1000 non-empty strings.` });
    }
  }
  try {
    return { ...parsePublishContentToolInput(input), ...(input.excludeItems === undefined ? {} : { excludeItems: input.excludeItems as string[] }) };
  } catch (error) {
    throw new ToolInputError({ message: error instanceof Error ? error.message.replace(/^admin\.publish_content:/, "publish_content_publish:") : "Invalid publish selection." });
  }
}

/** The remote report is untrusted; refuse malformed/refused plans before any confirm call. */
function readReport(value: unknown): PublishContentReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ToolInputError({ message: "The live site returned no publish report." });
  const report = value as PublishContentReport;
  const outcomes = new Set(["created", "applied", "forced", "unchanged", "conflict", "blocked"]);
  if (typeof report.refused !== "boolean" || !Array.isArray(report.rows) || !report.rows.every(row =>
    row && typeof row.entityType === "string" && typeof row.entityId === "string" &&
    typeof row.writes === "boolean" && outcomes.has(row.outcome) &&
    row.writes === ["created", "applied", "forced"].includes(row.outcome))) {
    throw new ToolInputError({ message: "The live site returned an invalid publish report." });
  }
  if (report.refused) throw new ToolInputError({ message: report.refusalReason ?? "The live site refused this publish." });
  return report;
}

/** CMS-specific autonomous push. Ports supply credential resolution, export and peer HTTP; no
 * model mocks or second importer. The dialog shares push-plan and preparePublishConfirmation.
 * Only explicit overwrite:true selects conflict keys, then the exact same keys travel to execute.
 * Results describe actual apply outcomes: race-time conflicts must never be called published. */
export async function publishContentFromTool(
  required: { deps: PublishContentToolDeps; principalId: string },
  input: Record<string, unknown> = {},
) {
  const criteria = readCriteria(input);
  if (!canPublishToLive()) throw new ToolInputError({ message: PUBLISH_FROM_LIVE_SITE_ERROR });
  const { deps, principalId } = required;
  const peers = await deps.publishContentPeerRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  if (input.peerId !== undefined && (typeof input.peerId !== "string" || !input.peerId.trim())) {
    throw new ToolInputError({ message: "'peerId' must be a non-empty string." });
  }
  const peerId = typeof input.peerId === "string" ? input.peerId : (selectConnectedDestination(peers) ?? (peers.length === 1 ? peers[0] : null))?.id;
  if (!peerId) throw new ToolInputError({ message: peers.length ? "Several destinations are saved. Choose a peerId before publishing." : "No live destination is connected. Connect this computer with publish_content_connect, then publish again." });
  const credential = await resolvePublishDestinationCredential({ repo: deps.publishContentPeerRepo,
    sealer: deps.siteAssistantSecretSealer, keyring: deps.siteAssistantSecretKeyring, httpClient: deps.publishContentPeerHttpClient },
  { workspaceId: deps.workspaceId, id: peerId });
  const peer = { credential, httpClient: deps.publishContentPeerHttpClient };
  const contentDeps = deps.makePublishContentDeps?.() ?? { workspaceId: deps.workspaceId, clock: deps.clock,
    idGen: deps.idGen, ports: deps.publishContentPorts ?? {} };
  const plan = async (selection: { selectedEntityKeys?: readonly string[]; overwriteEntityKeys?: readonly string[] } = {}) => {
    const raw = await planPublishToPeer({ deps: { ...deps, publishContentDeps: contentDeps }, peer, principalId }, selection);
    if (typeof raw.planId !== "string" || typeof raw.planHash !== "string") throw new ToolInputError({ message: "The live site returned an invalid publish plan." });
    const details = readReport(raw.details);
    // Unsupported source items never reached the peer, so it cannot report them. Preserve each
    // title in the tool's skipped results, just as the dialog preserves its type-level notice.
    const unsupported = new Set(raw.notSupportedByLive.map(item => item.entityType));
    const heldBack = Object.entries(raw.itemNames).flatMap(([key, names]) => {
      const separator = key.indexOf(":");
      const entityType = key.slice(0, separator);
      if (!unsupported.has(entityType)) return [];
      return [{ entityType, entityId: key.slice(separator + 1), entityLabel: names[0] ?? null,
        outcome: "blocked" as const, writes: false, canOverwrite: false,
        reason: "The live site's build does not support this kind of content yet." }];
    });
    return { ...raw, planId: raw.planId, planHash: raw.planHash, details: { ...details, rows: [...details.rows, ...heldBack] } };
  };
  const initial = await plan();
  const selectionRows = toPublishReportRows(initial.details).map(row => ({ ...row, names: initial.itemNames[row.key] ?? [] }));
  const selection = applyPublishCriteria(selectionRows.map(row => ({ ...row, selectable: true })), criteria);
  // Every unmatched row is deselected (so it is filtered out of the result lists below), but only
  // one that would otherwise have been written is worth naming as excluded.
  const skipped = selectionRows.filter(row => selection.deselectedKeys.has(row.key) && row.disposition === "publish").map(row => ({
    entityKey: row.key, title: row.entityLabel, reason: "Excluded by the requested selection." }));
  let chosen = initial;
  if (selection.overwriteKeys.size > 0) {
    if (!initial.liveCanOverwrite) throw new ToolInputError({ message: "The live site cannot overwrite content yet. Update it before trying again." });
    chosen = await plan({ overwriteEntityKeys: [...selection.overwriteKeys] });
    if (!overwriteReplanIsConsistent({ shown: initial.details, next: chosen.details, tickedKeys: selection.overwriteKeys, changing: selection.overwriteKeys })) {
      throw new ToolInputError({ message: "The live site changed while publishing was being planned. Check the list again." });
    }
  }
  // Nothing selected: never re-stage an empty bundle on live, and never confirm `chosen`, which
  // still holds every row.
  const nothingSelected = selectableRowKeys(toPublishReportRows(chosen.details)).every(key => selection.deselectedKeys.has(key));
  let confirmed: PublishContentPlanResult = chosen;
  try {
    if (!nothingSelected) confirmed = await preparePublishConfirmation({ plan: chosen, deselectedKeys: selection.deselectedKeys, planPublish: plan });
  } catch (error) {
    throw new ToolInputError({ message: error instanceof Error ? error.message : "Could not plan this publish." });
  }
  const urls = (confirmed as typeof initial).publicUrls ?? chosen.publicUrls;
  let execution: Record<string, unknown> | null = null;
  let actual = confirmed.details;
  if (!nothingSelected && canConfirmPlan({ kind: "planned", plan: confirmed })) {
    const { confirmationToken } = await confirmPeerImport(peer, { planId: confirmed.planId, planHash: confirmed.planHash });
    execution = await executePeerImport(peer, { bundleId: confirmed.bundleId, confirmationToken,
      ...(confirmed.overwriteEntityKeys?.length ? { overwriteEntityKeys: confirmed.overwriteEntityKeys } : {}) });
    // Old live builds omit per-item outcomes. A successful HTTP response alone cannot prove every
    // planned row landed: apply can downgrade a concurrent edit to a conflict after token checking.
    // Keep the completed run and explicitly report uncertainty instead of fabricating success.
    if (execution.report === undefined) {
      skipped.push(...selectionRows.filter(row => row.disposition === "skipped" && !selection.deselectedKeys.has(row.key) && !selection.overwriteKeys.has(row.key)).map(row => ({ entityKey: row.key, title: row.entityLabel, reason: row.reason ?? "The live site skipped this item." })));
      return { published: [], skipped, unverified: confirmed.details.rows.filter(row => row.writes).map(row => ({
        entityKey: `${row.entityType}:${row.entityId}`, title: row.entityLabel, publicUrl: urls[`${row.entityType}:${row.entityId}`] ?? null })),
      runId: execution.runId, message: "The publish run completed, but this live site's version did not return per-item results. I could not verify which items landed. Update the live site to receive those results.",
      unmatchedItems: selection.unmatchedItems, unknownTypes: selection.unknownTypes, verificationProblems: execution.verificationProblems ?? [] };
    }
    actual = readReport(execution.report);
  }
  const rows = toPublishReportRows(actual);
  const published = execution ? rows.filter(row => row.appliesOnExecute).map(row => ({
    entityKey: row.key, title: row.entityLabel, outcome: row.outcome, publicUrl: urls[row.key] ?? null })) : [];
  // Locally skipped pack units and unsupported types never reached live's apply report.
  const known = new Set(rows.map(row => row.key));
  const omitted = toPublishReportRows(initial.details).filter(row => !row.appliesOnExecute && !known.has(row.key) && !selection.deselectedKeys.has(row.key));
  skipped.push(...[...rows, ...omitted].filter(row => row.disposition === "skipped" && !selection.deselectedKeys.has(row.key)).map(row => ({ entityKey: row.key, title: row.entityLabel, reason: row.reason ?? "The live site skipped this item." })));
  return { published, skipped, unchanged: [...rows, ...omitted].filter(row => row.disposition === "unchanged" && !selection.deselectedKeys.has(row.key)).map(row => ({ entityKey: row.key, title: row.entityLabel })),
    unmatchedItems: selection.unmatchedItems, unknownTypes: selection.unknownTypes, notSupportedByLive: confirmed.notSupportedByLive ?? [],
    runId: execution?.runId ?? null, verificationProblems: execution?.verificationProblems ?? [],
    message: published.length ? `Published ${published.length} item${published.length === 1 ? "" : "s"} to ${credential.baseUrl}. Skipped ${skipped.length}.` : `Published nothing. Skipped ${skipped.length}.` };
}
