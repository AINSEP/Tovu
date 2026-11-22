/**
 * tool-guide-scan.ts — pure scanner behind `check-tool-guides.ts`: which tools does the text a model
 * reads name, and which "calls" in that text name nothing the model can call?
 *
 * WHY (2026-11-18, tool-call-fixes S4a / C1b): guide text (descriptions, overlays, plugin guidance)
 * tells the model "use theme_list_files" or "call `load_agent_plugin(...)`". When a tool is renamed,
 * the sentence keeps naming the old id and the model calls a tool that is not there. Nothing compared
 * the prose with the catalog. This scanner takes the catalog's names and the model-facing texts and
 * reports every named tool and every call-shaped token that matches no tool.
 *
 * It scans only text it is handed; deciding which strings are model-facing is the caller's job, by
 * where the string comes from, never by guessing (the report-only candidate pass is the caller's).
 * Pure: no fs, no app, no registry import.
 */

/** Where a text comes from: the booted registry, an MCP-local tool, or a declared guide module. */
export type GuideSourceKind = "registry" | "mcp-local" | "guide";

export interface GuideSource {
  readonly path: string;
  readonly kind: GuideSourceKind;
  readonly text: string;
}

export interface ToolGuideNames {
  /** Registered tool ids. */
  readonly toolIds: readonly string[];
  /** MCP-local tool names (`search_tools`, `execute_delegated_tool`, ...). */
  readonly localNames: readonly string[];
  /** The names the server publishes (`tool_<readable>_<hash>`, or the id itself). */
  readonly wireNames: readonly string[];
  /** Every declared input property and alias of any tool: a backticked `old_string` is an argument, not a call. */
  readonly knownProperties: readonly string[];
}

/** How a tool is named: in prose, in a call (`id(` / `` `id(...)` ``), or as the `toolId` of the gateway. */
export type MentionForm = "prose" | "call" | "gateway";

export interface Mention {
  readonly id: string;
  readonly form: MentionForm;
  readonly source: string;
  readonly kind: GuideSourceKind;
}

export interface UnknownCall {
  readonly token: string;
  readonly source: string;
  readonly kind: GuideSourceKind;
}

export interface GuideScan {
  /** Every mention, in source order. */
  readonly named: readonly Mention[];
  /** The subset written as the gateway's `toolId`. */
  readonly gatewayForm: readonly Mention[];
  readonly unknownCalls: readonly UnknownCall[];
}

const WORD_CHAR = "A-Za-z0-9_";
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/** A snake_case token: lower-case words joined by `_`. */
const SNAKE = "[a-z][a-z0-9]*(?:_[a-z0-9]+)+";
const CALL_TOKEN = new RegExp(`(?<![${WORD_CHAR}$.{])(${SNAKE})(?=\\()`, "g");
const BACKTICK_TOKEN = new RegExp(`\`(${SNAKE})\``, "g");
/** `agent_plugin_<id>`: a tool-name template the scanner cannot check against the catalog. */
const PLACEHOLDER_TOKEN = new RegExp(`(?<![${WORD_CHAR}$])(${SNAKE}_<[a-z][a-z-]*>)`, "g");

function mentionForm({ text, index, id }: { text: string; index: number; id: string }): MentionForm {
  const before = text.slice(Math.max(0, index - 12), index);
  if (/toolId["']?\s*:\s*["']$/.test(before)) return "gateway";
  const after = text.slice(index + id.length, index + id.length + 1);
  return after === "(" ? "call" : "prose";
}

/** Every position of `id` as a whole name (not inside a longer identifier) in `text`. */
function positionsOf({ text, id }: { text: string; id: string }): number[] {
  const found: number[] = [];
  const pattern = new RegExp(`(?<![${WORD_CHAR}.-])${escapeRegExp(id)}(?![${WORD_CHAR}-]|\\.[${WORD_CHAR}])`, "g");
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) found.push(match.index);
  return found;
}

function mentionsIn({ source, ids }: { source: GuideSource; ids: readonly string[] }): Mention[] {
  const trimmed = source.text.trim();
  const found: { index: number; mention: Mention }[] = [];
  for (const id of ids) {
    // A text that is exactly the id is the descriptor's own literal, not a sentence that names a tool.
    if (trimmed === id) continue;
    for (const index of positionsOf({ text: source.text, id })) {
      found.push({ index, mention: { id, form: mentionForm({ text: source.text, index, id }), source: source.path, kind: source.kind } });
    }
  }
  return found.sort((a, b) => a.index - b.index).map(({ mention }) => mention);
}

const firstSegment = (name: string): string => name.split(/[_.-]/, 1)[0] ?? name;

/**
 * Call-shaped snake_case tokens that name no tool. A token counts only when its first word is the
 * first word of some tool name (`menus_list_menus` shares `menus` with `menus_list`): that is how a
 * renamed or invented tool is told apart from SQL (`json_each(`) or a helper (`some_helper(`).
 */
function unknownCallsIn({ source, known, domains }: { source: GuideSource; known: ReadonlySet<string>; domains: ReadonlySet<string> }): UnknownCall[] {
  const tokens = new Set<string>();
  for (const pattern of [CALL_TOKEN, BACKTICK_TOKEN]) {
    for (const match of source.text.matchAll(pattern)) {
      const token = match[1] ?? "";
      if (!known.has(token) && domains.has(firstSegment(token))) tokens.add(token);
    }
  }
  for (const match of source.text.matchAll(PLACEHOLDER_TOKEN)) tokens.add(match[1] ?? "");
  return [...tokens].map((token) => ({ token, source: source.path, kind: source.kind }));
}

/**
 * Scans model-facing texts for named tools and for call-shaped names that match no tool.
 *
 * @param required.names - The catalog's names; a mention is any whole-name occurrence of one of them.
 * @param required.sources - The texts, each with where it came from.
 * @returns Mentions, the gateway-form subset, and unknown calls, all in source order.
 * @complexity O(s * n * l) for s sources, n names and l text length; no effects.
 */
export function scanToolGuides(
  { names, sources }: { readonly names: ToolGuideNames; readonly sources: readonly GuideSource[] },
  _optional: Record<string, never> = {},
): GuideScan {
  const ids = [...new Set([...names.toolIds, ...names.localNames])];
  const known = new Set([...ids, ...names.wireNames, ...names.knownProperties]);
  const domains = new Set([...ids, ...names.wireNames].map(firstSegment));
  const named = sources.flatMap((source) => mentionsIn({ source, ids }));
  const unknownCalls = sources.flatMap((source) => unknownCallsIn({ source, known, domains }));
  return { named, gatewayForm: named.filter((mention) => mention.form === "gateway"), unknownCalls };
}
