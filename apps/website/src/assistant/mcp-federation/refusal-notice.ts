import type { FederatedAdmissionReport, ToolRefusalReason } from "./trust.js";

/**
 * @file The refusal channel's SECOND sink: the one that reaches the model.
 *
 * ---------------------------------------------------------------------------
 * The defect this closes
 * ---------------------------------------------------------------------------
 * `trust.ts` already refuses nothing silently — `admitRemoteTools` returns a complete accounting,
 * and `bootstrap.ts`'s `logFederatedAdmissionReport` writes every line of it. But a log is a sink
 * with exactly one reader: whoever happened to be tailing the daemon's terminal at the moment it
 * booted. Two parties who needed that accounting never got it:
 *
 * 1. THE OPERATOR, who ticked a tool in Settings → External MCP and watched it not work. Served
 *    since C-008/C-009 by `federation-admissions-route.ts` and its admin proxy — a structured read
 *    of this same snapshot.
 * 2. THE MODEL, which is this file. Asked in chat why it could not generate an image, the assistant
 *    INVENTED a cause, because a refused tool is simply absent: it is never registered, so
 *    `search_tools` cannot find it, `describe_tool` cannot describe it, and nothing anywhere in the
 *    catalog says "this exists and was withheld." Absence is indistinguishable from non-existence,
 *    and a model asked to explain an absence with no evidence will produce a plausible sentence.
 *
 * A tool-shaped fix does not work here, and that is the whole reason this is prompt text. A model
 * that does not know it is missing anything never calls the tool that would tell it. The refusal
 * has to arrive without a discovery step, which means the prompt.
 *
 * ---------------------------------------------------------------------------
 * Why this is safe to prepend to every run
 * ---------------------------------------------------------------------------
 * R-A. NOTHING IS SAID WHEN NOTHING IS WRONG. A boot with no actionable refusal returns `""` and
 *      costs zero tokens — the overwhelmingly common case, and the reason this is not gated behind
 *      an env arm the way `capability-manifest-prefix.ts` is.
 *
 * R-B. `not-in-operator-allowlist` IS NOT REPORTED. It is the routine default-deny outcome of R2:
 *      a real server advertises tens of tools and an operator allowlists three, so this reason
 *      fires for every tool nobody asked for. Reporting it would put a wall of "you did not enable
 *      this" in front of the model on every turn and train it to ignore the whole block — the same
 *      failure `bootstrap.ts`'s `resolveRegisteredPresets` cites for staying silent about a preset
 *      that simply is not configured. What IS reported is every refusal where the operator's own
 *      intent and the gate's decision disagree.
 *
 * R-C. THE REMOTE'S BYTES ARE NEVER TRUSTED. A refused `remoteName` is third-party text on a direct
 *      path into the system prompt, and `invalid-remote-tool-name` is BY DEFINITION the refusal
 *      whose name failed {@link SAFE_REMOTE_NAME} — arbitrary attacker-chosen bytes. Every name
 *      here is re-checked against that pattern and replaced with a description rather than escaped
 *      when it fails, matching `trust.ts`'s own "refused rather than escaped, because every escaping
 *      scheme is a place to get it wrong later" for the identical reason one layer earlier.
 *
 * R-D. THE CHANNEL IS BOUNDED. A remote that advertises a thousand malformed tools cannot spend the
 *      model's context window through this file: the item list is capped and the omission is
 *      announced with the true total, so the model is never told a smaller number than the truth.
 *      Same discipline as `wrapUntrustedResult`'s announced truncation.
 *
 * Architectural role:
 * Pure functions. No I/O, no registry, no protocol — the same posture as `trust.ts`, and for the
 * same reason: every rule above is a unit test.
 */

/** One connection's boot admission accounting, exactly as `AttachFederatedToolsResult.reports`
 *  carries it and `federation-admissions-route.ts` serves it. Restated structurally rather than
 *  imported from `bootstrap.ts`: that module performs I/O and spawns child processes on import,
 *  and this file's whole point is being a pure reduction over the snapshot. */
export interface FederationAdmissionSnapshotEntry {
  readonly connectionId: string;
  readonly report: FederatedAdmissionReport;
}

/** What KIND of disagreement between operator intent and the gate's decision an item records.
 *  Three, not one, because the operator fix differs for each: a refusal needs a grant, an absent
 *  allowlist entry needs a correction, and an inert write grant needs a second listing. */
export type FederationRefusalKind = "refused" | "allowlisted-but-absent" | "write-allowed-but-not-allowlisted";

/** One thing the operator asked for that the running assistant does not have. */
export interface FederationRefusalItem {
  readonly connectionId: string;
  /** Already sanitized per R-C — safe to render and safe to put in a prompt. */
  readonly remoteName: string;
  readonly kind: FederationRefusalKind;
  /** `null` for the two drift kinds, which are not gate refusals. */
  readonly reason: ToolRefusalReason | null;
  /** Operator-actionable prose: what happened AND what to do about it. Never a placeholder — a
   *  reason with no real fix is a reported refusal that is still useless. */
  readonly explanation: string;
}

/** R-C's gate, deliberately identical to `trust.ts`'s `REMOTE_TOOL_NAME_PATTERN`. Kept as its own
 *  literal rather than imported: that constant is private to the trust tier and exporting it to
 *  make a prompt-safety check reuse it would widen a security module's surface for a consumer that
 *  only needs the same ANSWER, not the same binding. The two must not drift — a name this file
 *  accepts that the gate would reject is a prompt-injection hole — which is why the equivalence is
 *  its own test rather than a comment. */
const SAFE_REMOTE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/;

/** What a name is replaced by when it fails {@link SAFE_REMOTE_NAME}. Says what happened without
 *  quoting a single byte the remote chose. */
const UNPRINTABLE_NAME = "(a tool name this server sent that Tovu could not accept)";

/** R-D's cap. Enough that a real misconfiguration is fully listed, small enough that a hostile
 *  server cannot buy prompt real estate by advertising junk. */
const MAX_ITEMS_IN_PREFIX = 10;

/**
 * R-C. Returns a name safe to place in a prompt, or {@link UNPRINTABLE_NAME}.
 *
 * @complexity O(n) in the name length, bounded by the pattern's own 64-character ceiling.
 * @overallScore 100
 */
export function safeRemoteName(remoteName: unknown): string {
  if (typeof remoteName !== "string") return UNPRINTABLE_NAME;
  return SAFE_REMOTE_NAME.test(remoteName) ? remoteName : UNPRINTABLE_NAME;
}

/**
 * The operator-facing sentence for each refusal reason: what the gate did, and the one thing that
 * changes it. `not-in-operator-allowlist` is absent on purpose — see R-B; it never becomes an item,
 * so it never needs prose.
 *
 * The two field labels quoted here (`Allowed tools`, `Allowed to make changes`) are the literal
 * labels `apps/admin/src/features/settings/rules.ts` renders. Naming them exactly is the entire
 * value of this text: "authorize the write" is advice nobody can act on, and the second list is
 * precisely the thing operators do not know exists.
 */
const EXPLANATION_BY_REASON: Readonly<Record<Exclude<ToolRefusalReason, "not-in-operator-allowlist">, string>> = {
  "remote-declares-not-read-only":
    "the server says this tool makes changes, and it is not in this connection's \"Allowed to make changes\" list. " +
    "Fix: in Settings → External MCP, add it to BOTH \"Allowed tools\" and \"Allowed to make changes\", then restart the assistant.",
  "remote-declares-destructive":
    "the server marks this tool as destructive. Tovu does not enable destructive external tools at all, and there is no " +
    "setting that turns this one on. Fix: there is none — the administrator would have to use this server's own interface directly.",
  "missing-or-invalid-input-schema":
    "the server published no usable input schema for it, so there is no contract to give you and the arguments would be guesswork. " +
    "Fix: this is the external server's bug, not a Tovu setting — the administrator should report it to that vendor.",
  "invalid-remote-tool-name":
    "the server advertised it under a name Tovu will not register (it must be letters, digits, '.', '-' or '_', at most 64 characters). " +
    "Fix: this is the external server's bug, not a Tovu setting.",
  "duplicate-remote-tool-name":
    "the server advertised the same tool name twice, and Tovu refuses the repeat rather than letting a second definition overwrite the first. " +
    "Fix: this is the external server's bug, not a Tovu setting.",
  "connection-tool-cap-reached":
    "this connection had already reached its maximum number of tools before reaching this one. " +
    "Fix: the administrator should shorten \"Allowed tools\" to the tools that are actually needed, then restart the assistant.",
};

const ABSENT_EXPLANATION =
  "the administrator allowed this tool, but the server does not offer a tool by that name — most likely a typo in " +
  "\"Allowed tools\", or the server was started without the feature that provides it.";

const INERT_WRITE_GRANT_EXPLANATION =
  "the administrator put this tool in \"Allowed to make changes\" but not in \"Allowed tools\", so the grant does nothing at all. " +
  "Fix: add the same name to \"Allowed tools\" too, then restart the assistant.";

/** One connection's gate refusals, minus R-B's routine default-deny. */
function refusalItems(entry: FederationAdmissionSnapshotEntry): FederationRefusalItem[] {
  const items: FederationRefusalItem[] = [];
  for (const refusal of entry.report.refused) {
    if (refusal.reason === "not-in-operator-allowlist") continue;
    items.push({
      connectionId: entry.connectionId,
      remoteName: safeRemoteName(refusal.remoteName),
      kind: "refused",
      reason: refusal.reason,
      explanation: EXPLANATION_BY_REASON[refusal.reason],
    });
  }
  return items;
}

/** One connection's two config-drift lists — `trust.ts`'s own `allowlistedButAbsent` /
 *  `writeAllowedButNotAllowlisted`, which exist precisely so config that can never take effect is
 *  reported rather than silently inert. This file is where that reporting finally reaches a reader
 *  who is not tailing a terminal. */
function driftItems(entry: FederationAdmissionSnapshotEntry): FederationRefusalItem[] {
  const absent = entry.report.allowlistedButAbsent.map((name): FederationRefusalItem => ({
    connectionId: entry.connectionId,
    remoteName: safeRemoteName(name),
    kind: "allowlisted-but-absent",
    reason: null,
    explanation: ABSENT_EXPLANATION,
  }));
  const inert = entry.report.writeAllowedButNotAllowlisted.map((name): FederationRefusalItem => ({
    connectionId: entry.connectionId,
    remoteName: safeRemoteName(name),
    kind: "write-allowed-but-not-allowlisted",
    reason: null,
    explanation: INERT_WRITE_GRANT_EXPLANATION,
  }));
  return [...absent, ...inert];
}

/**
 * Every place this boot's admitted set disagrees with what the operator asked for.
 *
 * Shared by the prompt prefix below and by any operator-facing consumer that wants the same
 * accounting as data rather than prose — one derivation, so the two can never disagree about which
 * refusals count, the same INV-005 property `classifyRemoteToolSurface` gives `trust.ts`.
 *
 * @param snapshot - `AttachFederatedToolsResult.reports`, verbatim.
 * @returns Items in connection order, refusals before drift within each connection.
 * @complexity O(c · t) in connections and their refused/drift entries.
 * @overallScore 100
 */
export function summarizeFederatedRefusals(
  snapshot: readonly FederationAdmissionSnapshotEntry[],
): readonly FederationRefusalItem[] {
  return snapshot.flatMap((entry) => [...refusalItems(entry), ...driftItems(entry)]);
}

/** One rendered bullet. The connection id is operator-authored and pattern-validated by
 *  `assertValidConnectionId` before any tool from it is ever admitted, so it needs no sanitizing of
 *  its own; the remote name already went through {@link safeRemoteName}. */
function renderItem(item: FederationRefusalItem): string {
  return `- '${item.remoteName}' on external server '${item.connectionId}': ${item.explanation}`;
}

const PREFIX_HEADING =
  "EXTERNAL TOOL AVAILABILITY — read this before telling anyone that a capability is missing or that you do not know why something failed.";

const PREFIX_INSTRUCTION =
  "These external tools were withheld from your catalog when this assistant started. They are NOT in `search_tools`, `describe_tool` " +
  "cannot describe them, and calling them is impossible — their absence is a configuration decision that was already made, not a " +
  "missing feature and not a fault of yours. If a user asks for something one of these would do, say exactly which tool was withheld " +
  "and repeat the fix below verbatim. Never guess at, or invent, a different reason for the capability being unavailable. This list " +
  "is fixed for the lifetime of this assistant process: a setting changed now takes effect only after the assistant is restarted.";

/**
 * The prompt prefix, or `""` when this boot has nothing to report (R-A).
 *
 * Prepended to a run's prompt by `agent-daemon-server.ts` through the same
 * `assemblePromptWithPluginPrefix` seam the capability manifest and agent-plugin prefixes already
 * use — deliberately not a new delivery mechanism, and deliberately not a tool: see this file's
 * header for why a model that does not know it is missing something never calls the tool that
 * would tell it.
 *
 * @param snapshot - `AttachFederatedToolsResult.reports`, verbatim.
 * @returns Prompt text, bounded per R-D, with the true total announced when the list is clipped.
 * @complexity O(c · t), plus O(n) rendering bounded by {@link MAX_ITEMS_IN_PREFIX}.
 * @overallScore 100
 */
export function buildFederatedRefusalPrefix(snapshot: readonly FederationAdmissionSnapshotEntry[]): string {
  const items = summarizeFederatedRefusals(snapshot);
  if (items.length === 0) return "";

  const shown = items.slice(0, MAX_ITEMS_IN_PREFIX);
  const lines = [PREFIX_HEADING, "", PREFIX_INSTRUCTION, "", ...shown.map(renderItem)];

  if (items.length > shown.length) {
    lines.push(
      `- …and ${items.length - shown.length} more, for ${items.length} withheld in total. The administrator can see the complete list in Settings → External MCP.`,
    );
  }

  return lines.join("\n");
}
