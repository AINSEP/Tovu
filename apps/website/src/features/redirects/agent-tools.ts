import { MAX_IMPORT_BATCH_SIZE, MAX_PRIORITY, MAX_TARGET_LENGTH, MIN_PRIORITY, MIN_TARGET_LENGTH, VALID_STATUS_CODES } from "./redirects.js";

/**
 * @file The Redirects domain's agent-tool catalog, instantiating SPEC-016 REQ-22's
 * naming/callability convention (the same shape `features/workspace/agent-tools.ts`,
 * `newsletter/agent-tools.ts`, and every other domain catalog already use).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes. Every
 * entry maps 1:1 onto a real admin HTTP route already exposed to a human operator
 * (`server/routes/admin/redirects/*.ts`) — this catalog never names an operation the admin UI does
 * not already perform.
 *
 * 2026-09-24 (tool-design audit F2/F3, dispatch item 3): `redirects_import` is now wired. It was
 * previously withheld as "a mass, immediate site-behavior change with no per-item human review
 * step" — but every rule still routes through the identical `createRedirect` chokepoint a single
 * `redirects_create` call uses (no validation bypassed at scale), each import row is reversible the
 * same way a single created rule is (`redirects_update`/`redirects_tombstone`), and a per-rule
 * failure never aborts the batch (`importRedirects`'s own `created`/`failed` split, EC-08) — the
 * same risk envelope as `redirects_create`/`redirects_update`, just N rows instead of one. It is not
 * a permanent, undoable-only-by-restore action, so the owner's "only permanent deletes hold up an
 * in-chat confirm" rule leaves it unconfirmed, same as `redirects_create`.
 *
 * `redirects_create`/`redirects_update` both accept `override` (a rule that preempts already-live
 * content resolution rather than only filling a 404). This is real, meaningful behavior — but it is
 * gated by the exact same `admin.redirects.manage` permission as every other write here (the
 * codebase enforces no separate, stronger gate for `override:true` today), it targets exactly one
 * named rule per call, and it is always reversible (`redirects_update`/`redirects_tombstone` can
 * undo it). That keeps it inside this catalog's ordinary single-record CRUD risk envelope rather
 * than warranting its own exclusion.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` (ADR-021 §2) enforces the actual permission checks at call
 * time — this module only declares the catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `redirects` domain logic. Imports only the constants its own domain already enforces
 * (`redirects.ts`'s length/priority/status-code/batch-size bounds), so the published JSON Schemas
 * cannot drift from the validators — same discipline `seo/agent-tools.ts` uses for
 * `write-service.ts`'s constants.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  /**
   * JSON Schema for this tool's `input`, published via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registration-kit.ts`'s `buildDomainRegistrations`, which refuses to wire any
   * tool lacking one). Optional, matching `features/database/agent-tools.ts`'s convention for a
   * domain entry that IS deliberately excluded and so carries no schema at all — every entry in
   * this domain's own catalog is wired, so every entry here declares one.
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

const REDIRECT_ID_PROPERTY = {
  type: "string",
  minLength: 1,
  description: "A redirect rule's id, as returned by redirects_create or content_read.redirect.",
} as const;

const REDIRECT_ID_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: { id: REDIRECT_ID_PROPERTY },
} as const;

const MATCH_TYPE_PROPERTY = {
  type: "string",
  enum: ["exact", "prefix", "wildcard", "regex"],
  description:
    "How fromPattern is matched. 'exact': full-path equality. 'prefix': longest-prefix match. 'wildcard': glob with '*' captures. 'regex' is a valid value but is ALWAYS rejected by this write chokepoint today (gated behind a currently-off feature flag) — expect a validation error if you pass it.",
} as const;

const STATUS_CODE_PROPERTY = {
  type: "integer",
  enum: [...VALID_STATUS_CODES],
  description: "HTTP redirect status. 301/308 are permanent; 302/307 are temporary. 307/308 preserve the request method/body.",
} as const;

const TO_TARGET_PROPERTY = {
  type: "string",
  minLength: MIN_TARGET_LENGTH,
  maxLength: MAX_TARGET_LENGTH,
  description: `The destination: a site-relative path, or an absolute URL. An absolute target must resolve against this workspace's redirect-target allowlist; a site-relative target must stay on this site and must not resolve onto '/admin' or '/api' (the authenticated admin application, not public pages) — either way the write is refused. ${MIN_TARGET_LENGTH}-${MAX_TARGET_LENGTH} characters.`,
} as const;

const PRIORITY_PROPERTY = {
  type: "integer",
  minimum: MIN_PRIORITY,
  maximum: MAX_PRIORITY,
  description: `Tie-breaker within an equal-specificity band — higher wins. ${MIN_PRIORITY}-${MAX_PRIORITY}. Omit to default to ${MIN_PRIORITY}.`,
} as const;

const OVERRIDE_PROPERTY = {
  type: "boolean",
  description:
    "When true, this rule is consulted BEFORE live content resolution (it can redirect away from an already-published URL). Defaults to false, meaning the rule only fills the 404 path.",
} as const;

const LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    status: { type: "string", enum: ["active", "disabled"], description: "Filter to rules in exactly this status. Omit to list every status." },
    source: {
      type: "string",
      enum: ["manual", "auto_slug_change", "import"],
      description: "Filter to rules with exactly this provenance. Omit to list every source.",
    },
    matchType: { type: "string", enum: ["exact", "prefix", "wildcard", "regex"], description: "Filter to rules of exactly this match type. Omit to list every match type." },
  },
} as const;

const CREATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["matchType", "fromPattern", "toTarget", "statusCode"],
  properties: {
    matchType: MATCH_TYPE_PROPERTY,
    fromPattern: { type: "string", minLength: 1, description: "The source path/pattern to match against incoming requests." },
    toTarget: TO_TARGET_PROPERTY,
    statusCode: STATUS_CODE_PROPERTY,
    override: OVERRIDE_PROPERTY,
    priority: PRIORITY_PROPERTY,
  },
} as const;

const IMPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rules"],
  properties: {
    rules: {
      type: "array",
      minItems: 1,
      maxItems: MAX_IMPORT_BATCH_SIZE,
      description: `1-${MAX_IMPORT_BATCH_SIZE} redirect rules to create. Each rule is validated and written through the identical chokepoint a single redirects_create call uses (own pattern/target-allowlist/duplicate/cycle checks); one invalid rule does not abort the rest of the batch — check the response's 'failed' list.`,
      items: CREATE_SCHEMA,
    },
  },
} as const;

const UPDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: REDIRECT_ID_PROPERTY,
    matchType: MATCH_TYPE_PROPERTY,
    fromPattern: { type: "string", minLength: 1, description: "The source path/pattern to match against incoming requests. Omit to leave unchanged." },
    toTarget: { ...TO_TARGET_PROPERTY, description: `${TO_TARGET_PROPERTY.description} Omit to leave unchanged.` },
    statusCode: STATUS_CODE_PROPERTY,
    status: {
      type: "string",
      enum: ["active", "disabled"],
      description:
        "'disabled' turns the rule off; 'active' turns it back on (on a rule in the Trash this restores it). To delete a rule, use redirects_tombstone, which moves it to the Trash. A rule in the Trash can't be edited until it is restored.",
    },
    override: OVERRIDE_PROPERTY,
    priority: PRIORITY_PROPERTY,
  },
} as const;

/**
 * The Redirects domain's fixed agent-tool catalog (SPEC-009) — see this file's header for the one
 * withheld operation and why.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 * @overallScore 100
 */
export function getRedirectsAgentToolCatalog(): AgentToolDefinition[] {
  return [
    {
      name: "redirects_list",
      description: "Lists the workspace's redirect rules, optionally filtered by status/source/matchType. Read-only.",
      sideEffects: "none",
      authorization: { permission: "admin.redirects.manage" },
      inputSchema: LIST_SCHEMA,
    },
    {
      name: "redirects_get",
      description: "Fetches a single redirect rule by id. Read-only.",
      sideEffects: "none",
      authorization: { permission: "admin.redirects.manage" },
      inputSchema: REDIRECT_ID_SCHEMA,
    },
    {
      name: "redirects_get_hits",
      description: "Fetches aggregate hit stats (total hit count, last-hit time) for a redirect rule by id. Read-only. Returns hitCount:0 if the rule has never been hit.",
      sideEffects: "none",
      authorization: { permission: "admin.redirects.manage" },
      inputSchema: REDIRECT_ID_SCHEMA,
    },
    {
      name: "redirects_create",
      description:
        "Creates a new manual redirect rule. Rejects an unsafe/disallowed absolute target, collapses a one-hop chain onto an existing active rule's own target, and rejects a resulting cycle. Rejects a duplicate exact-match rule for the same fromPattern.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.redirects.manage" },
      inputSchema: CREATE_SCHEMA,
    },
    {
      name: "redirects_update",
      description: "Edits one or more fields on an existing redirect rule. Only provided fields change; omitted fields keep their current value. Same validation as redirects_create.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.redirects.manage" },
      inputSchema: UPDATE_SCHEMA,
    },
    {
      name: "redirects_tombstone",
      description: "Soft-deletes (disables) a redirect rule. Retained for audit, never matched again once disabled. Idempotent: tombstoning an already-disabled rule is a no-op.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.redirects.manage" },
      inputSchema: REDIRECT_ID_SCHEMA,
    },
    {
      name: "redirects_import",
      description:
        `Creates up to ${MAX_IMPORT_BATCH_SIZE} redirect rules in one call. Each rule gets the identical validation a single redirects_create call gets (pattern/target-allowlist/duplicate/cycle checks); a per-rule failure is reported in 'failed' and does not abort the rest of the batch.`,
      sideEffects: "mutates-durable-state",
      authorization: { permission: "admin.redirects.manage" },
      inputSchema: IMPORT_SCHEMA,
    },
  ];
}
