/**
 * @file SPEC-007 — the Settings domain's agent-tool catalog, instantiating SPEC-016 REQ-22's
 * naming/callability convention (the same shape `features/database/agent-tools.ts`,
 * `features/recovery/agent-tools.ts`, and every other domain catalog already use).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes. Settings
 * is, by design, a broad key/value surface — `apps/admin/src/sections/Settings.tsx`'s own file
 * header confirms the human admin screen is an uncurated, free-text editor: the operator types
 * ANY namespace string to load it (no definitions-listing UI consumes `list-definitions` yet) and
 * edits values through a raw-JSON textarea (`ValueEditor`'s documented fallback, since no
 * schema-exposing endpoint feeds a typed control). There is no fixed, curated list of named
 * settings anywhere in this codebase's admin surface to wire tools against.
 *
 * That disqualifies every GENERIC write in this domain from being wired here:
 * - `SETTINGS_SET`/`SETTINGS_CLEAR` let a caller write/clear the value of any registered
 *   namespace+key at any scope it can name — exactly the generic "set any setting key" tool this
 *   dispatch's brief prohibits outright, regardless of the write path's own schema validation
 *   (validation constrains VALUE shape, not WHICH key can be targeted).
 *
 * UPDATE (2026-07-31) — the premise above has a scope this file originally could not see, and one
 * curated write is now wired because of it. The claim "there is no fixed, curated list of named
 * settings anywhere in this codebase's admin surface" was true when written and is no longer:
 * `features/settings/ui-tab-definitions.ts` registers one, because the settings-dialog tabs need
 * named keys to bind to. `SETTINGS_SET_UI_PREFERENCE` below wires a seven-key subset of that list
 * (`features/settings/agent-writable-preferences.ts`), and it is not a weaker `settings_set`:
 *
 * - Its `setting` parameter is a JSON Schema `enum`, so WHICH key is targeted is constrained by
 *   the same mechanism as everything else — the exact gap the paragraph above identifies. The
 *   ledger's registered definition schema still bounds the VALUE, so both halves are covered.
 * - It exposes no `scope` and no `principalId`. Every write is `scope: "user"` against the
 *   caller's own principal, which derives `settings.user.self.write` — the narrowest write grant
 *   in the system — and makes writing another operator's preferences unrepresentable rather than
 *   merely unauthorized.
 * - The keys are per-operator display preferences (locale, theme, accent, notification sounds),
 *   each reversible in one call and visible in the admin UI the moment it changes.
 *
 * The generic setter stays excluded, permanently and for its original reason. Nothing below is
 * evidence that the other three writes may now be wired: `SETTINGS_RESET` and
 * `SETTINGS_REGISTER_DEFINITIONS` fail on their own merits (see their entries), and
 * `SETTINGS_SET`/`SETTINGS_CLEAR` fail precisely because they are the uncurated form of what
 * `SETTINGS_SET_UI_PREFERENCE` does safely.
 * - `SETTINGS_RESET` is broader still: a single call clears every value in an operator-named
 *   namespace at a scope, described by the admin UI's own confirmation dialog as "This cannot be
 *   undone."
 * - `SETTINGS_REGISTER_DEFINITIONS` is schema-level, not value-level: it can rename/retype/
 *   deprecate/tombstone the DEFINITION a key resolves through, changing how every existing stored
 *   value for that key is interpreted platform-wide — the closest analogue in this codebase is
 *   `database_execute_migrate_forward`'s exclusion, not an ordinary write.
 *
 * Reads are a different risk class and are wired, mirroring `features/database/agent-tools.ts` and
 * `features/recovery/agent-tools.ts`'s own precedent of "reads freely wireable even in a
 * meaningfully higher-risk domain, writes curtailed": `SETTINGS_LIST_DEFINITIONS`/
 * `SETTINGS_GET_EFFECTIVE`/`SETTINGS_GET_RAW` cannot mutate anything, are gated by the same real
 * `authorize()` permissions the admin UI's own reads use (including the cross-principal
 * `settings.user.read` check), and cannot surface a secret value even in principle —
 * `features/settings/settings.ts`'s `validateDefinitionInput` unconditionally refuses
 * `secret:true` at registration time (REQ-09/INV-08), so no secret setting can exist in this
 * codebase's current state to leak.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` (ADR-021 §2) enforces the actual permission checks at call
 * time — this module only declares the catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `features/settings` domain logic. Depends only on its own sibling
 * `agent-writable-preferences.ts` (for the curated write's enum) — no I/O, no enforcement.
 */

import { AGENT_WRITABLE_PREFERENCE_IDS, AGENT_WRITABLE_PREFERENCES } from "./agent-writable-preferences";

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  /**
   * JSON Schema for this tool's `input`, published to the model via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registrations.ts`, which refuses to wire any tool lacking one). Optional,
   * matching `features/database/agent-tools.ts`'s convention — the four write entries this file
   * documents but never wires (see file header) carry no schema at all, since one is never
   * published for a tool the model never sees.
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** No arguments — `settings_list_definitions` takes none; it always enumerates the caller's own
 * (boot-wired) workspace's site-owned partition plus the shared platform partition, exactly like
 * `list-definitions.ts`'s route. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/** Shared by `settings_get_effective`/`settings_get_raw` — mirrors `get-effective.ts`/`get-raw.ts`'s
 * identical `principalId` query-param handling: naming a DIFFERENT principal than the caller
 * requires `settings.user.read` (checked by the handler, not expressed in this schema). */
const PRINCIPAL_ID_PROPERTY = {
  type: "string",
  description:
    "Read another principal's user-layer value instead of the caller's own. Requires the settings.user.read permission when it names a principal other than the caller. Omit to read the caller's own user layer.",
} as const;

const GET_EFFECTIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["namespace"],
  properties: {
    namespace: { type: "string", minLength: 1, description: "The settings namespace to enumerate, e.g. 'core.presentation'." },
    principalId: PRINCIPAL_ID_PROPERTY,
  },
} as const;

const GET_RAW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["namespace", "key"],
  properties: {
    namespace: { type: "string", minLength: 1, description: "The settings namespace the key belongs to, e.g. 'core.presentation'." },
    key: { type: "string", minLength: 1, description: "The setting key within the namespace." },
    principalId: PRINCIPAL_ID_PROPERTY,
  },
} as const;

/**
 * Input schema for `settings_set_ui_preference`.
 *
 * The `enum` on `setting` is the load-bearing part and the reason this tool is wireable at all —
 * it is what makes "which key" a schema-constrained choice rather than free text. Built from
 * {@link AGENT_WRITABLE_PREFERENCE_IDS} rather than listed here, so the published schema and the
 * handler's own allowlist check cannot disagree.
 *
 * `value` is typed only as "present". Constraining it here would mean restating seven different
 * per-key schemas that the ledger already holds and already enforces inside the write chokepoint
 * (`write-service.ts`'s `set()`), and a second copy that drifts is worse than no copy: it would
 * reject values the ledger accepts, or — far worse — describe as acceptable a shape the ledger
 * will refuse. The per-key hints below tell the model what to send; the ledger decides.
 */
const SET_UI_PREFERENCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["setting", "value"],
  properties: {
    setting: {
      type: "string",
      enum: AGENT_WRITABLE_PREFERENCE_IDS,
      description: `The preference to set. Legal values and what each expects: ${AGENT_WRITABLE_PREFERENCES.map(
        (p) => `${p.id} — ${p.valueHint}`,
      ).join(" | ")}`,
    },
    value: {
      description:
        "The new value, matching the shape described for the chosen setting. Validated against that setting's registered schema; a mismatch is rejected and nothing is written.",
    },
  },
} as const;

/**
 * The Settings domain's fixed agent-tool catalog (SPEC-007) — the three reads, one curated write
 * (`settings_set_ui_preference`), and four generic writes documented but deliberately never
 * wired. See file header.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 * @overallScore 100
 */
export function getSettingsAgentToolCatalog(): AgentToolDefinition[] {
  return [
    {
      name: "settings_list_definitions",
      description:
        "Lists every active setting definition visible to this workspace (platform core/theme definitions plus this workspace's own site-owned definitions): namespace, key, owner kind, scope bitmask, status, and version. Metadata only — never a value.",
      sideEffects: "none",
      authorization: { permission: "settings.read.definitions" },
      inputSchema: NO_INPUT_SCHEMA,
    },
    {
      name: "settings_get_effective",
      description:
        "Returns the effective (precedence-resolved: user, then workspace, then global, then default) value of every active setting registered in a namespace.",
      sideEffects: "none",
      authorization: { permission: "settings.read" },
      inputSchema: GET_EFFECTIVE_SCHEMA,
    },
    {
      name: "settings_get_raw",
      description: "Returns the per-layer raw values (global, workspace, user, default) of one setting key, unresolved by precedence.",
      sideEffects: "none",
      authorization: { permission: "settings.read.raw" },
      inputSchema: GET_RAW_SCHEMA,
    },
    {
      name: "settings_set_ui_preference",
      description:
        "Sets one of the operator's own admin-UI preferences (interface language, theme, accent color, or notification sounds) and returns the stored value. Writes only to the calling operator's own user layer — it cannot target another operator, another scope, or any setting outside its fixed list. Use settings_get_effective to read current values first.",
      sideEffects: "mutates-durable-state",
      // The narrowest write grant in the system, and it is what this tool derives BECAUSE it never
      // names a target principal (`write-service.ts`'s `deriveRequiredPermission`). Declared here
      // to match; the handler does not pass this string, it lets the chokepoint derive it, so the
      // two cannot drift into a state where this file advertises a check that is not the one run.
      authorization: { permission: "settings.user.self.write" },
      inputSchema: SET_UI_PREFERENCE_SCHEMA,
    },
    {
      // EXCLUDED BY DESIGN, never wired: see this file's header. Generic "set any setting key" —
      // the human admin UI itself is an uncurated free-text/raw-JSON editor, not a fixed named
      // list. `settings_set_ui_preference` above is the curated alternative and does NOT make this
      // one wireable: the whole difference is that its target key is enum-bounded.
      name: "settings_set",
      description: "Sets a setting's value at a scope. NEVER agent-callable — see file header.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "settings.workspace.write" },
    },
    {
      // EXCLUDED BY DESIGN, never wired: see this file's header. Same "generic key" exclusion as
      // settings_set.
      name: "settings_clear",
      description: "Clears a setting's value at a scope, reverting it to default. NEVER agent-callable — see file header.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "settings.workspace.write" },
    },
    {
      // EXCLUDED BY DESIGN, never wired: see this file's header. Bulk variant of settings_clear —
      // clears every value in an operator-named namespace at a scope in one call, irreversible.
      name: "settings_reset",
      description: "Resets every setting in a namespace to defaults at a scope. NEVER agent-callable — see file header.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "settings.reset.workspace" },
    },
    {
      // EXCLUDED BY DESIGN, never wired: see this file's header. Schema-level, not value-level —
      // can rename/retype/deprecate/tombstone the definition a key resolves through, changing how
      // every existing stored value for that key is interpreted platform-wide.
      name: "settings_register_definitions",
      description: "Registers, renames, retypes, deprecates, or tombstones setting definitions. NEVER agent-callable — see file header.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "settings.definitions.manage" },
    },
  ];
}
