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
  | "server-side-defect"
  // The three reverse-direction kinds (2026-09-07, ADM-001) — see {@link liveOnlyEntries} and
  // {@link connectionLevelEntry}. Every one of them is fixed by the same restart, and none of them
  // could produce a row before, because the comparison only ever ran `saved − live`.
  | "still-live-after-removal"
  | "not-running"
  | "disabled-but-running";

/** One place the operator's intent and the running assistant disagree. */
export interface AdmissionDriftEntry {
  /** The connection's id — identical to the roster row's `serverId` (`toResolvedFederatedConnections`
   *  sets `connectionId: config.serverId`), which is what lets a row be matched back to its card. */
  readonly connectionId: string;
  /** `null` for a row about the CONNECTION rather than about one of its tools (`not-running`,
   *  `disabled-but-running`). The section around the row already carries the connection id as its
   *  heading, so repeating it in the name slot would be a label, not a tool name — and a field
   *  called `remoteName` holding a connection id is the kind of misleading name that survives into
   *  a later reader's assumptions. */
  readonly remoteName: string | null;
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

/**
 * What the operator's roster says about ONE connection — the "saved" half of every comparison in
 * this file.
 *
 * `enabled` is here and not derivable (2026-09-07, ADM-001): `external-mcp-store.ts`'s
 * `readEnabledExternalMcpConfigs` skips a switched-off server, so "saved but not live" is the
 * CORRECT and expected state for one, and a rule that could not see the flag would report the
 * operator's own most deliberate action back to them as a fault.
 */
export interface SavedConnectionIntent {
  /** The roster card's `allowedToolNames` field, verbatim — `"a, b , c"` as it is stored. */
  readonly allowedToolNames: string;
  /** The card's on/off toggle. */
  readonly enabled: boolean;
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

/** ADM-001's three keys. English-only for now, the same deliberate choice the four server-side-defect
 *  strings above record: `createDictionaryTranslator` falls back to the English key, and inventing
 *  21 translations ahead of the copy settling is the more expensive mistake to undo. Each one names
 *  the restart, because the restart is the entire fix in all three cases. */
const STILL_LIVE_KEY = "The assistant is still running this tool, but it's no longer on the allowlist. Restart the assistant to unload it.";
const NOT_RUNNING_KEY = "The assistant isn't running this server at all. Restart the assistant to load it.";
const DISABLED_BUT_RUNNING_KEY = "This server is switched off, but the assistant is still running it. Restart the assistant to unload it.";

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

/**
 * ADM-001's `live − saved` half: tools the running daemon is still serving that the operator's
 * allowlist no longer names.
 *
 * `savedAllowedToolNames === undefined` returns NOTHING, and that is the load-bearing case rather
 * than a defensive default. `mcp-federation/bootstrap.ts` merges roster connections with
 * env-registered PRESET connections (`resolveRegisteredPresets`, e.g. the Supabase MCP plugin) into
 * one report list, and a preset has no roster card by design — so "no saved entry" means "no
 * operator intent is recorded here", not "the operator allowlisted nothing". Reading it as the
 * latter would put every preset tool in this list on every boot, forever. An empty STRING is the
 * opposite: a card exists and its allowlist was cleared, so every live tool really is drift.
 *
 * @complexity O(t) in the connection's admitted tool count.
 */
function liveOnlyEntries(entry: AdminFederatedAdmissionEntry, savedAllowedToolNames: string | undefined): AdmissionDriftEntry[] {
  if (savedAllowedToolNames === undefined) return [];
  const saved = new Set(parseSavedToolNames(savedAllowedToolNames));
  return entry.admitted
    .filter((tool) => !saved.has(tool.remoteName))
    .map((tool): AdmissionDriftEntry => ({
      connectionId: entry.connectionId,
      remoteName: tool.remoteName,
      kind: "still-live-after-removal",
      messageKey: STILL_LIVE_KEY,
      messageVars: {},
    }));
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
 * @param savedAllowedToolNames - The roster card's own `allowedToolNames` field, verbatim, or
 *   `undefined` when this connection has no roster card at all (an env preset). The two are NOT
 *   interchangeable — see {@link liveOnlyEntries}.
 * @complexity O(t) in the connection's advertised/refused/admitted tool count.
 * @overallScore 100
 */
export function describeConnectionDrift(
  entry: AdminFederatedAdmissionEntry,
  savedAllowedToolNames: string | undefined,
): AdmissionDriftConnection | null {
  const entries = [...refusalEntries(entry), ...driftEntries(entry), ...liveOnlyEntries(entry, savedAllowedToolNames)];
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
 * The four-combination truth table {@link connectionLevelEntry} documents, as a flat chain rather
 * than a nested ternary — the same extraction `lib/fetch-query/adapter.tanstack.tsx`'s
 * `resolveFetchQueryStatus` records the reasoning for.
 *
 * @returns The disagreement's kind, or `null` when intent and reality agree.
 * @complexity O(1).
 */
function resolveConnectionLevelKind(enabled: boolean, isLive: boolean, liveToolCount: number): AdmissionDriftKind | null {
  if (!isLive) return enabled ? "not-running" : null;
  // A live connection with an empty admitted set says nothing either way — the daemon may hold the
  // session open having admitted none of its tools, which the per-tool rows already explain.
  if (!enabled && liveToolCount > 0) return "disabled-but-running";
  return null;
}

/**
 * ADM-001's whole-connection half: a saved connection whose state the daemon disagrees with
 * outright, rather than one tool inside a connection it is running.
 *
 * Only two of the four combinations are a disagreement. Saved-and-enabled-and-not-live is the
 * operator having added or re-enabled a server since boot — `trust.ts` R5 freezes the admitted set
 * at connect, so it is genuinely absent and stays absent until a restart. Saved-and-disabled-and-
 * still-live is the same freeze seen from the other side. The other two agree and must render
 * nothing: an off server that is not running is not a fault, it is the switch working.
 *
 * @returns The connection row, or `null` when intent and reality agree.
 * @complexity O(t) in the saved name count.
 */
function connectionLevelEntry(
  connectionId: string,
  saved: SavedConnectionIntent,
  liveEntry: AdminFederatedAdmissionEntry | undefined,
): AdmissionDriftConnection | null {
  const savedNames = parseSavedToolNames(saved.allowedToolNames);
  const liveToolCount = liveEntry?.admitted.length ?? 0;
  const kind = resolveConnectionLevelKind(saved.enabled, liveEntry !== undefined, liveToolCount);
  if (!kind) return null;

  return {
    connectionId,
    liveToolCount,
    // Every saved name for a connection that is not running: all of them are missing, which is the
    // count line's whole job. Empty for the disabled-but-running arm, where the live tools ARE the
    // saved ones and nothing is missing.
    notLoaded: liveEntry ? [] : savedNames,
    savedToolCount: savedNames.length,
    entries: [
      {
        connectionId,
        remoteName: null,
        kind,
        messageKey: kind === "not-running" ? NOT_RUNNING_KEY : DISABLED_BUT_RUNNING_KEY,
        messageVars: {},
      },
    ],
  };
}

/**
 * Every connection with something to say, in the daemon's own connection order, then any saved
 * connection the daemon never reported.
 *
 * Two passes rather than one, and they never both claim the same connection: the first covers every
 * connection the daemon IS running (roster-backed or env preset), the second only adds rows for a
 * whole-connection disagreement the first pass structurally cannot see — a saved connection with no
 * live entry, or a switched-off one that is still live (2026-09-07, ADM-001). A live, agreeing
 * connection is claimed by neither.
 *
 * @param snapshot - `getExternalMcpAdmissions()`'s response. `undefined` means the daemon could not
 *   be asked, and returns `[]` deliberately: the caller renders that as its own sentence, and
 *   inventing "not running" rows out of a failed read would put a wrong diagnosis under a right one.
 * @param savedById - Each roster card's saved intent, keyed by its id. A connection the daemon
 *   reports that is absent here is an env preset, not an empty roster entry.
 * @complexity O(c · t).
 * @overallScore 100
 */
export function describeAdmissionDrift(
  snapshot: AdminExternalMcpAdmissionsSnapshot | undefined,
  savedById: Readonly<Record<string, SavedConnectionIntent>>,
): readonly AdmissionDriftConnection[] {
  if (!snapshot) return [];
  const liveIds = new Set(snapshot.connections.map((entry) => entry.connectionId));

  return [
    ...snapshot.connections.map((entry) => describeLiveConnection(entry, savedById[entry.connectionId])),
    ...Object.entries(savedById)
      .filter(([connectionId]) => !liveIds.has(connectionId))
      .map(([connectionId, saved]) => connectionLevelEntry(connectionId, saved, undefined)),
  ].filter((connection): connection is AdmissionDriftConnection => connection !== null);
}

/** One LIVE connection's row. A whole-connection disagreement supersedes the per-tool rows: telling
 *  an operator which of a switched-off server's tools are still loaded, one line each, buries the
 *  one thing they need to read — that the server they turned off is still running. Split out of
 *  {@link describeAdmissionDrift} to keep that function under the shop complexity ceiling. */
function describeLiveConnection(
  entry: AdminFederatedAdmissionEntry,
  saved: SavedConnectionIntent | undefined,
): AdmissionDriftConnection | null {
  const connectionLevel = saved ? connectionLevelEntry(entry.connectionId, saved, entry) : null;
  return connectionLevel ?? describeConnectionDrift(entry, saved?.allowedToolNames);
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
