/**
 * @file `ADS-memory/.local-artifacts/publish-criteria-tool-webmcp-plan-2026-09-24.md` §2/§4 S1 — the
 * one contract shared by the dialog, the chat capability (S3) and the WebMCP projection (S5). A
 * `PublishCriteria` names what to publish and whether to overwrite; `applyPublishCriteria` turns that
 * into the same `deselectedKeys`/`overwriteKeys` shape `use-publish-content-confirm.hooks.ts` already
 * threads through a re-plan (`setDeselectedKeys`, `applyOverwriteKeys`). Criteria only ever set the
 * *initial* value of state the dialog already owns — no new selection mechanism is added, and no call
 * here can ever write anything (see plan §3: the executor built on this may only open the dialog).
 *
 * `PUBLISH_CONTENT_CAPABILITY` is shaped to match Jini's `CapabilityDef` (`@jini-ai/agentic`), but
 * this file deliberately does not import that type: `ui-stays-client-safe.boundary.test.ts`'s
 * reachability walk treats ANY bare package specifier reached from `index.ts` as an escape — type-only
 * or not, unlike its separate value-import check, it never looks at `edge.typeOnly`. Leaving this
 * constant untyped here costs nothing: every real caller (`frontend-control-capabilities.ts`, and
 * later `App.hooks.tsx`'s WebMCP registration) assigns it into a `CapabilityDef`-typed slot **by
 * reference**, where TypeScript's ordinary structural assignability applies rather than the
 * excess-property checking a fresh object literal would get.
 */
import type { PublishReportRow } from "./report-rows.js";

/**
 * What the assistant (chat, or a WebMCP caller) names when it asks to publish something. Every field
 * narrows an "everything" default — omitting a field, or giving it an empty array, means "don't
 * filter by this."
 */
export interface PublishCriteria {
  /** Entity types to publish, e.g. `["page","menu"]`. Omitted/empty = every type. `"pages"`/`"posts"`
   *  plurals and `"nav"`/`"navigation"` (→ `"menu"`) are accepted. */
  readonly types?: readonly string[];
  /** Specific things: a title (case-insensitive exact), an id, or a `"type:id"` key. Omitted/empty =
   *  all. */
  readonly items?: readonly string[];
  /** Tick "Overwrite on live" for every offered row that matches `types`/`items`. Default `false`. */
  readonly overwrite?: boolean;
}

/** What a `PublishCriteria` resolves to against one plan's rows. */
export interface CriteriaSelection {
  /** Selectable rows that do NOT match the criteria — the dialog's initial unchecked set. */
  readonly deselectedKeys: ReadonlySet<string>;
  /** Overwritable rows that match the criteria, populated only when `criteria.overwrite` is `true`. */
  readonly overwriteKeys: ReadonlySet<string>;
  /** `items` entries that named nothing in this plan. */
  readonly unmatchedItems: readonly string[];
  /** `types` entries no row in this plan has, after alias normalisation. */
  readonly unknownTypes: readonly string[];
}

/**
 * The `types` aliases plan §2 documents: plurals for the two kinds that take one, and the two
 * spellings of "menu" nobody actually calls a menu. Anything else passes through unchanged and, if no
 * row has it, ends up in {@link CriteriaSelection.unknownTypes} rather than silently matching nothing.
 */
const TYPE_ALIASES: Readonly<Record<string, string>> = {
  pages: "page",
  posts: "post",
  nav: "menu",
  navigation: "menu",
};

/** @complexity O(1). */
function normalizeType(type: string): string {
  const lower = type.trim().toLowerCase();
  return TYPE_ALIASES[lower] ?? lower;
}

/**
 * Whether one `items` entry names this row — by label (case-insensitive), by id, or by the row's own
 * `"type:id"` key, the three forms plan §2 documents.
 *
 * @complexity O(1).
 */
function matchesItem(row: PublishReportRow, item: string): boolean {
  const trimmed = item.trim();
  if (trimmed.length === 0) return false;
  if (row.entityLabel.toLowerCase() === trimmed.toLowerCase()) return true;
  if (row.entityId === trimmed) return true;
  if (row.key === trimmed) return true;
  return false;
}

/**
 * Turns a `PublishCriteria` into the dialog's selection state against one plan's rows.
 *
 * `types` and `items` combine with AND, not OR: each one that is given narrows the "everything"
 * default further, so `{types:["page"], items:["About"]}` means the page named About, not every page
 * plus anything else named About. Neither field narrows the other when it is itself omitted or empty.
 *
 * @complexity O(rows × items) — an `items` list is a handful of named things per request, so this
 * stays well under a millisecond for any plan size the dialog renders.
 */
export function applyPublishCriteria(rows: readonly PublishReportRow[], criteria: PublishCriteria): CriteriaSelection {
  const types = criteria.types ?? [];
  const items = criteria.items ?? [];
  const normalizedTypes = new Set(types.map(normalizeType));
  const hasTypes = normalizedTypes.size > 0;
  const hasItems = items.length > 0;

  const matches = (row: PublishReportRow): boolean => {
    const typeOk = !hasTypes || normalizedTypes.has(row.entityType);
    const itemOk = !hasItems || items.some((item) => matchesItem(row, item));
    return typeOk && itemOk;
  };

  const deselectedKeys = new Set<string>();
  const overwriteKeys = new Set<string>();
  for (const row of rows) {
    const isMatch = matches(row);
    if (row.selectable && !isMatch) deselectedKeys.add(row.key);
    if (criteria.overwrite === true && row.overwritable && isMatch) overwriteKeys.add(row.key);
  }

  const unmatchedItems = items.filter((item) => !rows.some((row) => matchesItem(row, item)));
  const unknownTypes = types.filter((type) => !rows.some((row) => row.entityType === normalizeType(type)));

  return { deselectedKeys, overwriteKeys, unmatchedItems, unknownTypes };
}

/**
 * The capability every caller shares: chat (plan §4 S3, relayed through the `admin.*` executors) and
 * Chrome's WebMCP agent (plan §4 S5, the same executor projected by Jini's `toWebMcpTool`). Its
 * executor may only call `requestPublish` — see plan §3 for why that is the entire gate that keeps
 * either caller from publishing anything itself: this capability has no `requiresConfirmation`
 * because the dialog IS the confirmation, and nothing reachable from it can call `confirmPublish` or
 * `executePublish`.
 */
export const PUBLISH_CONTENT_CAPABILITY = {
  id: "admin.publish_content",
  description:
    "Opens this site's Publish dialog with the things you name already chosen, and tells you what it " +
    "would publish. Nothing is published until the person clicks Publish. You cannot click it for them. " +
    "Use `types` for kinds of things (pages, posts, media, menus, redirects), `items` for specific ones " +
    "by title, and `overwrite: true` only when the person asked to replace what's on the live site.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      types: { type: "array", items: { type: "string" } },
      items: { type: "array", items: { type: "string" } },
      overwrite: { type: "boolean" },
    },
  },
  risk: "write",
  surface: "session",
} as const;

/**
 * What the tool returns to the model after `requestPublish` resolves (plan §2). `nextStep` is always
 * the same sentence — "Check the list in the Publish dialog, then click Publish." — because the model
 * has exactly one next move regardless of what it asked for: it cannot act further itself.
 */
export interface PublishRequestResult {
  readonly opened: boolean;
  readonly planned: boolean;
  readonly site: string | null;
  readonly willPublish: readonly string[];
  readonly willOverwrite: readonly string[];
  readonly leftAlone: readonly { label: string; reason: string }[];
  readonly unmatchedItems: readonly string[];
  readonly unknownTypes: readonly string[];
  readonly nextStep: string;
}

/**
 * The admin URL query param a `PublishCriteria` deep link travels under (`/admin/?publish=<encoded>`)
 * — owner decision, plan §5 D2's own follow-up: a chat with no admin tab open can't open the Publish
 * dialog itself, so it hands back a link that opens the admin with the dialog pre-filled instead. The
 * link only pre-fills a criteria-driven `requestPublish` call; nothing here can confirm or execute —
 * see this file's own header and plan §3.
 */
export const PUBLISH_CRITERIA_QUERY_PARAM = "publish";

/** {@link decodePublishCriteriaFromQuery}'s cap on the raw (still-encoded) query value's own length —
 *  comfortably under every browser's address-bar limit, and short-circuits a value built to make the
 *  decoder do a lot of work for nothing. */
const MAX_QUERY_LENGTH = 4000;
/** Cap on `types`/`items` array length once decoded — plan §2 never needs more than a handful of
 *  named things in one request. */
const MAX_LIST_LENGTH = 50;
/** Cap on one `types`/`items` entry's own length — a type name or a title, never a paragraph. */
const MAX_ENTRY_LENGTH = 200;

/**
 * Encodes a `PublishCriteria` as the value of the `publish` query param. Plain JSON,
 * `encodeURIComponent`-escaped — readable in the address bar, no extra dependency, and exactly
 * reversible by {@link decodePublishCriteriaFromQuery}. Fields that mean "everything"/`false` (an
 * omitted or empty `types`/`items`, `overwrite: false`) are left out of the payload entirely rather
 * than encoded as their empty/false form, so a round trip never grows a link past what the caller
 * actually named.
 *
 * @complexity O(n) in the criteria's own `types`/`items` length.
 */
export function encodePublishCriteriaToQuery(criteria: PublishCriteria): string {
  const payload: { types?: readonly string[]; items?: readonly string[]; overwrite?: true } = {};
  if (criteria.types && criteria.types.length > 0) payload.types = criteria.types;
  if (criteria.items && criteria.items.length > 0) payload.items = criteria.items;
  if (criteria.overwrite === true) payload.overwrite = true;
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * The other half of {@link encodePublishCriteriaToQuery} — and the one that has to survive a hostile
 * or malformed `publish` value, since anything that can build a URL can build this string. Never
 * throws: `null` covers every shape of bad input (not JSON, not an object, an array, a primitive, or
 * anything past the caps below) the same way, because none of them earn the caller a more specific
 * complaint than "ignore this and open the dialog with nothing pre-filled."
 *
 * Unknown fields are dropped by construction rather than rejected — only `types`/`items`/`overwrite`
 * are ever read off the parsed object, so a payload from a newer or older build that carries an extra
 * field decodes as whatever of these three it also carries, not as `null`. A bad ENTRY inside
 * `types`/`items` (wrong type, empty, oversized) is dropped the same way, one at a time, rather than
 * failing the whole list — see {@link sanitizeCriteriaList}.
 *
 * @complexity O(n) in the decoded payload's own `types`/`items` length.
 */
export function decodePublishCriteriaFromQuery(raw: string): PublishCriteria | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_QUERY_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const types = sanitizeCriteriaList(obj.types);
  const items = sanitizeCriteriaList(obj.items);
  const overwrite = obj.overwrite === true;

  const criteria: { types?: readonly string[]; items?: readonly string[]; overwrite?: boolean } = {};
  if (types) criteria.types = types;
  if (items) criteria.items = items;
  if (overwrite) criteria.overwrite = true;
  return criteria;
}

/**
 * One decoded `types`/`items` list, trimmed to {@link MAX_LIST_LENGTH} entries of at most
 * {@link MAX_ENTRY_LENGTH} characters each and with every non-string or empty entry dropped.
 * `undefined` for an empty result, matching `PublishCriteria`'s own "omitted means everything"
 * convention rather than encoding a now-empty array back onto the criteria.
 *
 * @complexity O(n).
 */
function sanitizeCriteriaList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= MAX_ENTRY_LENGTH)
    .slice(0, MAX_LIST_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}
