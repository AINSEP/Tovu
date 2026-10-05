/**
 * route-tool-parity.ts — pure classifier behind `check-route-tool-parity.ts`.
 *
 * WHY (2026-10-05): the owner found the admin chat could not publish live or delete a form, though
 * the admin UI could, because nothing compared the admin HTTP routes with the chat tool catalog.
 * This module takes the live route list, the live tool ids and the hand-kept mapping file
 * (`development/parity/route-tool-parity.json`) and says which routes are covered by a tool, which
 * are chatless on purpose, which are known gaps, and which nobody has classified yet.
 *
 * The mapping lives in the data file, not in tool metadata: 240+ registrations would churn, and a
 * reviewable JSON diff is what the gate reads.
 *
 * Pure (no app, registry or fs imports) so the unit test drives it with a fake route list and a fake
 * tool list. Generic for any router + tool-registry app; belongs in Jini once extracted.
 */

export interface ParityTool {
  readonly id: string;
  readonly readOnly: boolean;
}

/**
 * One route's classification. Exactly one of the shapes:
 * - `{ tools: ["id", ...] }` (non-empty): covered by those chat tools.
 * - `{ chatless: "<reason>" }`: no chat tool on purpose; the reason comes from {@link CHATLESS_REASONS}.
 * - `{ gap: "<note>" }`: a confirmed gap: the chat should do this but cannot yet.
 * - `{ tools: [] }`: not triaged yet; `--seed` adds `suggested` / `suggestedChatless` hints.
 */
export interface ParityEntry {
  readonly tools?: readonly string[];
  readonly chatless?: string;
  readonly gap?: string;
  readonly suggested?: readonly string[];
  readonly suggestedChatless?: string;
  readonly note?: string;
}

export interface ParityFile {
  readonly _about?: string;
  readonly routes: Record<string, ParityEntry>;
}

/** Fixed reason vocabulary; the last two take a `:<detail>` suffix. */
export const CHATLESS_REASONS = ["auth-session", "ui-only-asset", "streaming-transport", "internal-health"] as const;
export const CHATLESS_REASON_PREFIXES = ["covered-by-generic:", "intentional:"] as const;

export interface ParityReport {
  readonly routes: number;
  readonly covered: string[];
  readonly chatless: string[];
  readonly gaps: string[];
  readonly untriaged: string[];
  /** Live routes the file does not mention at all (new, unclassified). */
  readonly unknownRoutes: string[];
  /** File entries whose route no longer exists. */
  readonly staleEntries: string[];
  readonly unknownToolIds: { route: string; toolId: string }[];
  readonly badReasons: { route: string; reason: string }[];
  readonly malformed: { route: string; why: string }[];
}

export function routeKey(route: { method: string; path: string }): string {
  return `${route.method} ${route.path}`;
}

export function isValidChatlessReason(reason: string): boolean {
  if ((CHATLESS_REASONS as readonly string[]).includes(reason)) return true;
  return CHATLESS_REASON_PREFIXES.some((p) => reason.startsWith(p) && reason.length > p.length);
}

type EntryKind = "covered" | "chatless" | "gap" | "untriaged" | "malformed";

function kindOf(entry: ParityEntry): EntryKind {
  const shapes = [entry.chatless !== undefined, entry.gap !== undefined, (entry.tools?.length ?? 0) > 0].filter(Boolean).length;
  if (shapes > 1) return "malformed";
  if (entry.chatless !== undefined) return "chatless";
  if (entry.gap !== undefined) return "gap";
  if (entry.tools === undefined) return "malformed";
  return entry.tools.length > 0 ? "covered" : "untriaged";
}

function emptyReport(routes: number): ParityReport {
  return { routes, covered: [], chatless: [], gaps: [], untriaged: [], unknownRoutes: [], staleEntries: [], unknownToolIds: [], badReasons: [], malformed: [] };
}

function checkEntry(report: ParityReport, key: string, entry: ParityEntry, toolIds: ReadonlySet<string>): void {
  const kind = kindOf(entry);
  if (kind === "malformed") {
    report.malformed.push({ route: key, why: "needs exactly one of: non-empty tools, chatless, gap (or tools: [] while untriaged)" });
    return;
  }
  if (kind === "chatless" && !isValidChatlessReason(entry.chatless!)) report.badReasons.push({ route: key, reason: entry.chatless! });
  const generic = entry.chatless?.startsWith("covered-by-generic:") ? [entry.chatless.slice("covered-by-generic:".length)] : [];
  for (const toolId of [...(entry.tools ?? []), ...generic]) {
    if (!toolIds.has(toolId)) report.unknownToolIds.push({ route: key, toolId });
  }
  const bucket = { covered: report.covered, chatless: report.chatless, gap: report.gaps, untriaged: report.untriaged }[kind];
  bucket.push(key);
}

/**
 * Classifies every live route against the mapping file.
 *
 * @complexity O(r + e·t) for r routes, e entries, t tools per entry.
 */
export function classifyParity(
  required: { routes: readonly { method: string; path: string }[]; toolIds: ReadonlySet<string>; file: ParityFile },
): ParityReport {
  const live = new Set(required.routes.map(routeKey));
  const report = emptyReport(live.size);
  for (const key of live) {
    const entry = required.file.routes[key];
    if (entry === undefined) report.unknownRoutes.push(key);
    else checkEntry(report, key, entry, required.toolIds);
  }
  for (const key of Object.keys(required.file.routes)) {
    if (!live.has(key)) report.staleEntries.push(key);
  }
  return report;
}

/** True when the file is out of step with the live app (what `--strict` fails on). */
export function hasProblems(report: ParityReport): boolean {
  return report.unknownRoutes.length + report.staleEntries.length + report.unknownToolIds.length + report.badReasons.length + report.malformed.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Seeding: heuristic suggestions for untriaged routes. A suggestion is a triage hint only; it never
// counts as coverage until a human (or the P2 triage job) moves it into `tools`.

// `system` is a namespace, not a feature: `/system/sites/...` belongs to the `sites_*` tools.
const ROUTE_NOISE = new Set(["api", "admin", "v1", "workspaces", "system"]);
const DELETE_WORDS = new Set(["delete", "trash", "purge", "remove", "tombstone", "uninstall", "archive", "disconnect", "revoke"]);
const UPDATE_WORDS = new Set(["update", "set", "edit", "write", "rename"]);
const CREATE_WORDS = new Set(["create", "upload", "install", "import", "save", "define"]);

export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ses") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
  return w;
}

/** Path segments that are neither params nor noise, in order. */
function literalSegments(path: string): string[] {
  return path.split("/").filter((seg) => seg !== "" && !seg.startsWith(":") && !ROUTE_NOISE.has(seg));
}

function segmentWords(seg: string): string[] {
  return seg.split(/[-_.]/).filter((w) => w !== "").map(stem);
}

/** Literal path words, params and noise dropped, kebab segments split, stemmed. */
export function routeTokens(path: string): string[] {
  return literalSegments(path).flatMap(segmentWords);
}

/**
 * Route features whose tools carry another name (`/integrations/subscriptions` is `webhooks_*`,
 * `/recovery/restore/*` is `backup_*`). Extend when a seed shows a whole feature with no hint.
 */
const FEATURE_ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
  ["integration", ["webhook"]],
  ["recovery", ["backup"]],
]);

export function toolTokens(toolId: string): Set<string> {
  return new Set(toolId.split(/[_.]/).filter((w) => w !== "").map(stem));
}

function intersects(tokens: ReadonlySet<string>, words: ReadonlySet<string>): boolean {
  for (const t of tokens) if (words.has(t)) return true;
  return false;
}

function verbBonus(method: string, lastWord: string, tool: ParityTool, tokens: ReadonlySet<string>): number {
  if (method === "GET") return tool.readOnly ? 2 : -2;
  if (tool.readOnly) return -2;
  // A delete with no delete-word tool is a gap, not a near-miss: never suggest `create` for it.
  if (method === "DELETE" || DELETE_WORDS.has(lastWord)) return intersects(tokens, DELETE_WORDS) ? 2 : -2;
  if (method === "PUT" || method === "PATCH") return intersects(tokens, UPDATE_WORDS) ? 1 : 0;
  return intersects(tokens, CREATE_WORDS) ? 1 : 0;
}

/**
 * Scores one tool for one route. 0 unless the tool id names the route's feature (a word of its first
 * literal segment, or an alias), so a suggestion never crosses features; and 0 unless it also shares
 * a word with the rest of the path when there is one, so `/forms/:id/schema` is not offered every
 * `forms_*` tool.
 */
export function scoreTool(route: { method: string; path: string }, tool: ParityTool): number {
  const tokens = toolTokens(tool.id);
  const [feature = "", ...rest] = literalSegments(route.path);
  const featureWords = segmentWords(feature).flatMap((w) => [w, ...(FEATURE_ALIASES.get(w) ?? [])]);
  if (!featureWords.some((w) => tokens.has(w))) return 0;
  const restWords = rest.flatMap(segmentWords);
  const restOverlap = new Set(restWords.filter((w) => tokens.has(w))).size;
  if (restWords.length > 0 && restOverlap === 0) return 0;
  const lastWord = restWords[restWords.length - 1] ?? "";
  // A literal last segment is usually the action verb (`.../revert`, `.../approve`): weigh it up.
  const lastIsAction = !route.path.split("/").pop()!.startsWith(":") && tokens.has(lastWord);
  return 1 + restOverlap + verbBonus(route.method, lastWord, tool, tokens) + (lastIsAction ? 2 : 0);
}

/** Up to `limit` tool ids, best first, each scoring at least 2. */
export function suggestTools(route: { method: string; path: string }, tools: readonly ParityTool[], limit = 3): string[] {
  return tools
    .map((tool) => ({ id: tool.id, score: scoreTool(route, tool) }))
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((s) => s.id);
}

/** A chatless reason only for shapes that are never a site-owner action. */
export function suggestChatless(route: { method: string; path: string }): string | undefined {
  if (/\/auth\/|\/session(s)?(\/|$)|\/boot-session/.test(route.path)) return "auth-session";
  if (/\/(stream|events)(\/|$)/.test(route.path)) return "streaming-transport";
  return undefined;
}

function seedEntry(route: { method: string; path: string }, tools: readonly ParityTool[]): ParityEntry {
  const suggested = suggestTools(route, tools);
  const suggestedChatless = suggestChatless(route);
  return { tools: [], ...(suggested.length > 0 ? { suggested } : {}), ...(suggestedChatless ? { suggestedChatless } : {}) };
}

/**
 * Returns the file with every live route present: classified entries are kept untouched, untriaged
 * ones get fresh suggestions, missing routes are added untriaged. Stale entries are kept (and
 * reported by {@link classifyParity}) so a removed route is a reviewed deletion, not a silent one.
 * Keys are sorted for stable diffs.
 */
export function seedParity(required: { routes: readonly { method: string; path: string }[]; tools: readonly ParityTool[]; file: ParityFile }): ParityFile {
  const next: Record<string, ParityEntry> = { ...required.file.routes };
  for (const route of required.routes) {
    const key = routeKey(route);
    const existing = next[key];
    if (existing === undefined || kindOf(existing) === "untriaged") next[key] = { ...seedEntry(route, required.tools), ...(existing?.note ? { note: existing.note } : {}) };
  }
  const sorted: Record<string, ParityEntry> = {};
  for (const key of Object.keys(next).sort(compareKeys)) sorted[key] = next[key]!;
  return { ...(required.file._about ? { _about: required.file._about } : {}), routes: sorted };
}

/** Path first, then method, so all verbs of one path sit together. */
function compareKeys(a: string, b: string): number {
  const [ma, pa] = splitKey(a);
  const [mb, pb] = splitKey(b);
  return pa.localeCompare(pb) || ma.localeCompare(mb);
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf(" ");
  return [key.slice(0, i), key.slice(i + 1)];
}
