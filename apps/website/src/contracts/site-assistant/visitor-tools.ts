/** T1 policy for Tovu's public CMS capabilities. Eligibility always belongs to code, never settings. */
export const VISITOR_TOOLS_SETTING = { namespace: "site.assistant", key: "visitor_tools" } as const;
export const VISITOR_TOOLS_PERMISSION = "visitor-tools.manage";
export const VISITOR_TOOLS_WRITE_REASON = "Change visitor tools through the visitor-tools management service.";
export const VISITOR_TOOL_DEFAULT_LIMITS = Object.freeze({ perIpPerHour: 30, perSitePerDay: 1_000 });
export const VISITOR_TOOL_CALLS_PER_TURN = 4;

// MOVE: This upgrade grant is a frozen cohort, not the current catalog. Future contracts start Off.
const UPGRADE_AUTO_TOOLS: ReadonlySet<string> = new Set([
  "search_published_entries", "get_published_entry", "list_categories",
  "navigate_to_entry", "scroll_to_entry", "highlight_entry", "site_guide",
]);

export const VISITOR_PAGE_LEGACY_IDS: Readonly<Record<string, string>> = Object.freeze({
  'page.navigate': 'navigate_to_entry', 'page.scroll_to': 'scroll_to_entry', 'page.highlight': 'highlight_entry',
});
/** Keep consumed windows when the public vocabulary changes. */
export function visitorToolBudgetId({ toolId }: { toolId: string }, _options = {}): string {
  return VISITOR_PAGE_LEGACY_IDS[toolId] ?? toolId;
}

export type VisitorToolMode = "auto" | "ask" | "off";
export interface VisitorToolLimits { readonly perIpPerHour: number; readonly perSitePerDay: number }
export interface VisitorToolChoice { readonly mode: VisitorToolMode; readonly limits: VisitorToolLimits }
export interface VisitorToolPolicy { readonly version: 1; readonly tools: Readonly<Record<string, VisitorToolChoice>> }
export const EMPTY_VISITOR_TOOL_POLICY: VisitorToolPolicy = { version: 1, tools: {} };
export class VisitorToolPolicyValidationError extends Error {}

/** Require a visitor-policy/configure object, optionally closed to the owner's known keys.
 * Errors never include stored values. @complexity O(k) keys.
 * @example visitorToolsObject({value, keys:["mode", "limits"]});
 */
export function visitorToolsObject({ value, keys }: { value: unknown; keys?: readonly string[] }, _options = {}): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new VisitorToolPolicyValidationError("Visitor tools must use objects.");
  if (keys && Object.keys(value).some(key => !keys.includes(key))) throw new VisitorToolPolicyValidationError("Unknown visitor-tools field.");
  return value as Record<string, unknown>;
}

/** Stored limits may exceed defaults; T2's management boundary gates widening with a fresh card. */
function parseLimits({ value }: { value: unknown }, _options = {}): VisitorToolLimits {
  if (value === undefined) return { ...VISITOR_TOOL_DEFAULT_LIMITS };
  const limits = visitorToolsObject({ value, keys: ["perIpPerHour", "perSitePerDay"] });
  for (const key of ["perIpPerHour", "perSitePerDay"] as const) {
    const count = limits[key];
    if (!Number.isSafeInteger(count) || (count as number) < 1) {
      throw new VisitorToolPolicyValidationError("Visitor-tool limits must be positive safe whole numbers.");
    }
  }
  return { perIpPerHour: limits.perIpPerHour as number, perSitePerDay: limits.perSitePerDay as number };
}

/** Parse one saved choice. Ask is retained for T3 but is never executable in T1. */
function parseChoice({ value }: { value: unknown }, _options = {}): VisitorToolChoice {
  const choice = visitorToolsObject({ value, keys: ["mode", "limits"] });
  if (choice.mode !== "auto" && choice.mode !== "ask" && choice.mode !== "off") throw new VisitorToolPolicyValidationError("Unknown visitor-tool mode.");
  return { mode: choice.mode, limits: parseLimits({ value: choice.limits }) };
}

/** Validate bounded stored JSON or management input; malformed state must deny the entire catalog.
 * @throws VisitorToolPolicyValidationError before any write or execution. @complexity O(t), t ≤ 128.
 * @example parseVisitorToolPolicy({ value: { version: 1, tools: {} } });
 */
export function parseVisitorToolPolicy({ value }: { value: unknown }, _options = {}): VisitorToolPolicy {
  const policy = visitorToolsObject({ value, keys: ["version", "tools"] });
  if (policy.version !== 1) throw new VisitorToolPolicyValidationError("Unsupported visitor-tools version.");
  const entries = Object.entries(visitorToolsObject({ value: policy.tools }));
  if (entries.length > 128) throw new VisitorToolPolicyValidationError("Too many visitor tools.");
  const tools = entries.map(([id, choice]) => {
    if (!/^[a-z][a-z0-9_.]{0,127}$/.test(id)) throw new VisitorToolPolicyValidationError("Invalid visitor-tool id.");
    return [id, parseChoice({ value: choice })] as const;
  });
  const migrated: Record<string, VisitorToolChoice> = Object.fromEntries(tools);
  for (const [current, previous] of Object.entries(VISITOR_PAGE_LEGACY_IDS)) {
    const old = migrated[previous];
    if (!old) continue;
    const existing = migrated[current];
    migrated[current] = existing ? conservativeChoice({ first: old, second: existing }) : old;
    delete migrated[previous];
  }
  return { version: 1, tools: migrated };
}

/** Settings can reduce or enable a declared capability, but cannot create eligibility.
 * @returns A saved choice, the frozen upgrade grant, or Off for a new id. @complexity O(1).
 * @example resolveVisitorToolChoice({ policy, toolId: "list_categories" });
 */
export function resolveVisitorToolChoice({ policy, toolId }: { policy: VisitorToolPolicy; toolId: string }, _options = {}): VisitorToolChoice {
  if (Object.hasOwn(policy.tools, toolId)) return policy.tools[toolId]!;
  const previous = visitorToolBudgetId({ toolId });
  if (Object.hasOwn(policy.tools, previous)) return policy.tools[previous]!;
  return { mode: UPGRADE_AUTO_TOOLS.has(previous) ? "auto" : "off", limits: VISITOR_TOOL_DEFAULT_LIMITS };
}

/** A mixed-version saved policy cannot erase an explicit denial or widen an allowance. */
function conservativeChoice({ first, second }: { first: VisitorToolChoice; second: VisitorToolChoice }, _options = {}): VisitorToolChoice {
  const rank = { auto: 0, ask: 1, off: 2 };
  return { mode: rank[first.mode] > rank[second.mode] ? first.mode : second.mode,
    limits: { perIpPerHour: Math.min(first.limits.perIpPerHour, second.limits.perIpPerHour), perSitePerDay: Math.min(first.limits.perSitePerDay, second.limits.perSitePerDay) } };
}
