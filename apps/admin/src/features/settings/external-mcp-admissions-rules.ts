import type { AdminExternalMcpAdmissionsSnapshot, AdminFederatedAdmissionEntry, AdminToolRefusalReason } from "@/lib/api";

/**
 * @file What the RUNNING assistant actually admitted, turned into operator-facing rows — the
 * missing half of the write-tools outline's §3.3 ("What does the user see when it goes wrong?"),
 * whose answer in every row of that table is still "stderr only" or "absent, silent".
 *
 * Everything upstream of this file already exists and already works: the daemon holds its boot
 * admission report (`mcp-federation/bootstrap.ts`), serves it (`GET /api/federation/admissions`,
 * C-009), the admin proxies it (`GET .../mcp-servers/admissions`, C-008), and `lib/api.ts` has a
 * client for it (`getExternalMcpAdmissions`). Nothing in this app called that client. So an
 * operator who ticked a tool in this tab and watched it not work had exactly one way to find out
 * why — read the daemon's terminal at the moment it booted — which on a desktop app nobody can SSH
 * into is no way at all.
 *
 * ## Why `not-in-operator-allowlist` never becomes a row
 *
 * It is the routine outcome of `trust.ts` R2's default-deny: a real server advertises tens of tools
 * and an operator allowlists three, so that reason fires for every tool nobody asked for. Rendering
 * it would bury the two or three rows that DO mean something under a list of tools the operator
 * deliberately did not enable. Every row below is a place the operator's own intent and the gate's
 * decision disagree — nowhere else.
 *
 * ## Copy discipline
 *
 * An admin copy string IS its own i18n key here (`dictionary-translator.ts`), so these functions
 * return the exact English string plus its `{token}` values and let the component bind a locale.
 * Six of the keys below already exist, fully translated, in `external-mcp-i18n.ts` — they were
 * written for this UI in Phase 2C and have been sitting unused since. The four that do not exist
 * are the rare structural refusals, and they fall back to English by design rather than being
 * invented in 21 languages here.
 *
 * Pure. No React, no `api`, no locale — every rule is a unit test.
 */

/** Why one row exists. Distinguished rather than collapsed because the operator's move differs:
 *  one is a tick away, one has no fix at all, one is a typo, one is a second listing. */
export type AdmissionDriftKind =
  | "needs-write-grant"
  | "destructive"
  | "not-offered"
  | "inert-write-grant"
  | "server-side-defect";

/** One tool the operator asked for that the running assistant does not have. */
export interface AdmissionDriftEntry {
  /** The connection's id — identical to the roster row's `serverId` (`toResolvedFederatedConnections`
   *  sets `connectionId: config.serverId`), which is what lets a row be matched back to its card. */
  readonly connectionId: string;
  readonly remoteName: string;
  readonly kind: AdmissionDriftKind;
  /** Exact English copy, which is its own i18n key. */
  readonly messageKey: string;
  /** `interpolate()` values for a parameterized key; `{}` for a flat one. */
  readonly messageVars: Readonly<Record<string, string>>;
}

/** One connection's whole story: what is live, what was saved, and every disagreement. */
export interface AdmissionDriftConnection {
  readonly connectionId: string;
  /** Tools this daemon process actually registered for this connection. */
  readonly liveToolCount: number;
  /** Names in the operator's saved `allowedToolNames` that are NOT live — the ones a restart would
   *  change nothing about until the drift below is fixed, plus any that only need the restart. */
  readonly notLoaded: readonly string[];
  readonly savedToolCount: number;
  readonly entries: readonly AdmissionDriftEntry[];
}

/** The one refusal that is routine rather than newsworthy — see this file's header. */
const ROUTINE_REFUSAL = "not-in-operator-allowlist" as const satisfies AdminToolRefusalReason;

/** Every refusal that describes a defect in the EXTERNAL server rather than anything the operator
 *  can change from this tab. Named once so the four entries below and the unknown-reason fallback
 *  cannot drift apart on which bucket they land in. */
const SERVER_SIDE_DEFECT = "server-side-defect" as const satisfies AdmissionDriftKind;

/**
 * Refusal reason to operator copy.
 *
 * The first two keys are verbatim from `external-mcp-i18n.ts` and are translated. The last four are
 * new English-only strings for refusals that describe a defect in the EXTERNAL server rather than
 * anything the operator can change — deliberately not invented in 21 locales for a case that
 * should be rare, since `createDictionaryTranslator` falls back to the English key.
 */
const REFUSAL_COPY: Readonly<Record<Exclude<AdminToolRefusalReason, typeof ROUTINE_REFUSAL>, { kind: AdmissionDriftKind; key: string }>> = {
  "remote-declares-not-read-only": { kind: "needs-write-grant", key: "Tick 'may write' to enable this tool." },
  "remote-declares-destructive": {
    kind: "destructive",
    key: "The server marks this tool as destructive. Tovu does not enable destructive external tools.",
  },
  "missing-or-invalid-input-schema": {
    kind: SERVER_SIDE_DEFECT,
    key: "This server published no usable input schema for this tool, so Tovu cannot offer it.",
  },
  "invalid-remote-tool-name": {
    kind: SERVER_SIDE_DEFECT,
    key: "This server advertised a tool under a name Tovu will not register.",
  },
  "duplicate-remote-tool-name": {
    kind: SERVER_SIDE_DEFECT,
    key: "This server advertised the same tool name twice, so Tovu kept only the first.",
  },
  "connection-tool-cap-reached": {
    kind: SERVER_SIDE_DEFECT,
    key: "This connection has already reached its maximum number of tools, so this one was left out.",
  },
};

/** Translated, already in `external-mcp-i18n.ts`. */
const NOT_OFFERED_KEY = "This server does not offer a tool by that name.";
const INERT_WRITE_GRANT_KEY =
  "'{name}' is on the write list but not on the allowlist — it has no effect until it's also allowlisted.";

/** The gate refusals worth showing, in the daemon's own order. */
function refusalEntries(entry: AdminFederatedAdmissionEntry): AdmissionDriftEntry[] {
  const rows: AdmissionDriftEntry[] = [];
  for (const refusal of entry.refused) {
    if (refusal.reason === ROUTINE_REFUSAL) continue;
    const copy = REFUSAL_COPY[refusal.reason];
    // A reason this build does not know about is still REPORTED — an unrecognized refusal that
    // silently vanished would be the exact defect this file exists to close, one version later.
    rows.push({
      connectionId: entry.connectionId,
      remoteName: refusal.remoteName,
      kind: copy?.kind ?? SERVER_SIDE_DEFECT,
      messageKey: copy?.key ?? "The assistant refused this tool at startup.",
      messageVars: {},
    });
  }
  return rows;
}

/** The two config-drift lists — config that can never take effect, which `trust.ts` already
 *  computes precisely so it is reported rather than silently inert. */
function driftEntries(entry: AdminFederatedAdmissionEntry): AdmissionDriftEntry[] {
  return [
    ...entry.allowlistedButAbsent.map((remoteName): AdmissionDriftEntry => ({
      connectionId: entry.connectionId,
      remoteName,
      kind: "not-offered",
      messageKey: NOT_OFFERED_KEY,
      messageVars: {},
    })),
    ...entry.writeAllowedButNotAllowlisted.map((remoteName): AdmissionDriftEntry => ({
      connectionId: entry.connectionId,
      remoteName,
      kind: "inert-write-grant",
      messageKey: INERT_WRITE_GRANT_KEY,
      messageVars: { name: remoteName },
    })),
  ];
}

/** `"a, b , c"` as the roster card stores it, back to names. Mirrors `use-external-mcp.hooks.ts`'s
 *  own `join(", ")` on the way out; blanks are dropped so an empty field is zero names, not one. */
export function parseSavedToolNames(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

/**
 * One connection's drift, or `null` when the live assistant and the saved roster agree — the
 * common case, which must render nothing at all rather than a reassuring banner nobody needs.
 *
 * @param entry - This connection's live admission report from the daemon.
 * @param savedAllowedToolNames - The roster card's own `allowedToolNames` field, verbatim.
 * @complexity O(t) in the connection's advertised/refused tool count.
 * @overallScore 100
 */
export function describeConnectionDrift(
  entry: AdminFederatedAdmissionEntry,
  savedAllowedToolNames: string | undefined,
): AdmissionDriftConnection | null {
  const entries = [...refusalEntries(entry), ...driftEntries(entry)];
  const live = new Set(entry.admitted.map((tool) => tool.remoteName));
  const saved = parseSavedToolNames(savedAllowedToolNames);
  const notLoaded = saved.filter((name) => !live.has(name));

  if (entries.length === 0 && notLoaded.length === 0) return null;

  return {
    connectionId: entry.connectionId,
    liveToolCount: entry.admitted.length,
    notLoaded,
    savedToolCount: saved.length,
    entries,
  };
}

/**
 * Every connection with something to say, in the daemon's own connection order.
 *
 * @param snapshot - `getExternalMcpAdmissions()`'s response.
 * @param savedAllowedToolNamesById - Each roster card's `allowedToolNames` field, keyed by its id.
 * @complexity O(c · t).
 * @overallScore 100
 */
export function describeAdmissionDrift(
  snapshot: AdminExternalMcpAdmissionsSnapshot | undefined,
  savedAllowedToolNamesById: Readonly<Record<string, string>>,
): readonly AdmissionDriftConnection[] {
  if (!snapshot) return [];
  const drifted: AdmissionDriftConnection[] = [];
  for (const entry of snapshot.connections) {
    const connection = describeConnectionDrift(entry, savedAllowedToolNamesById[entry.connectionId]);
    if (connection) drifted.push(connection);
  }
  return drifted;
}

/**
 * The one-click fix: the new `writeAllowedToolNames` field value that grants `remoteName` the
 * write authorization `trust.ts` R3 requires, without disturbing any grant already there.
 *
 * Returns the field value only — the caller writes it through the SAME `updateSource` port the
 * card's own edit form uses, so the merge rules that protect `env` and `oauthClientSecret` from
 * being blanked (`use-external-mcp.hooks.ts`'s header) apply here unchanged.
 *
 * Idempotent: granting a name that is already granted returns the list unchanged, so a double
 * click cannot produce a duplicate entry the store would then have to dedupe.
 *
 * @complexity O(n) in the current grant count.
 * @overallScore 100
 */
export function grantWriteFieldValue(currentWriteAllowedToolNames: string | undefined, remoteName: string): string {
  const names = parseSavedToolNames(currentWriteAllowedToolNames);
  if (names.includes(remoteName)) return names.join(", ");
  return [...names, remoteName].join(", ");
}
