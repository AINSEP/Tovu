/** Closed admin input parsing and publication decisions shared by both admin transports. */
import { visitorToolsObject, VisitorToolPolicyValidationError, VISITOR_TOOL_DEFAULT_LIMITS, type VisitorToolChoice } from "../../contracts/site-assistant/visitor-tools.js";
import type { VisitorToolDescriptor, VisitorToolsConfigureInput } from "../../contracts/site-assistant/visitor-tools-management.js";

const MODE_RANK = { off: 0, ask: 1, auto: 2 } as const;

/** Require a positive safe integer; zero cannot disable quotas (use Off). @complexity O(1). */
function positiveLimit({ value }: { value: unknown }, _options = {}): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new VisitorToolPolicyValidationError("Limits must be positive safe whole numbers.");
  return value as number;
}

/** Parse a partial limit patch; omitted dimensions retain their current value. @complexity O(1). */
function limitsPatch({ value }: { value: unknown }, _options = {}) {
  const input = visitorToolsObject({ value, keys: ["perIpPerHour", "perSitePerDay"] });
  if (!Object.keys(input).length) throw new VisitorToolPolicyValidationError("Supply at least one limit.");
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, positiveLimit({ value })]));
}

/** Validate the optional mode independently of the partial-update shape. */
function parseMode({ value }: { value: unknown }, _options = {}): VisitorToolsConfigureInput["mode"] {
  if (value === undefined) return undefined;
  if (value !== "auto" && value !== "ask" && value !== "off") throw new VisitorToolPolicyValidationError("Mode must be auto, ask or off.");
  return value;
}

/** Parse the complete transport contract; approval/identity flags cannot enter through input.
 * @throws VisitorToolPolicyValidationError for unknown/invalid fields. @complexity O(1).
 * @example parseVisitorToolsConfigure({ value: {toolId:"site", expectedRevisionSeq:0, mode:"off"} });
 */
export function parseVisitorToolsConfigure({ value }: { value: unknown }, _options = {}): VisitorToolsConfigureInput {
  const input = visitorToolsObject({ value, keys: ["toolId", "expectedRevisionSeq", "mode", "limits"] });
  if (typeof input.toolId !== "string" || !/^[a-z][a-z0-9_]{0,127}$/.test(input.toolId)) throw new VisitorToolPolicyValidationError("Use a toolId from visitor_tools_list, or site.");
  if (!Number.isSafeInteger(input.expectedRevisionSeq) || (input.expectedRevisionSeq as number) < 0) throw new VisitorToolPolicyValidationError("List visitor tools first and supply expectedRevisionSeq.");
  const mode = parseMode({ value: input.mode });
  if (input.mode === undefined && input.limits === undefined) throw new VisitorToolPolicyValidationError("Supply mode or limits.");
  return { toolId: input.toolId, expectedRevisionSeq: input.expectedRevisionSeq as number,
    ...(mode === undefined ? {} : { mode }),
    ...(input.limits === undefined ? {} : { limits: limitsPatch({ value: input.limits }) }) };
}

/** Publication requires a fresh human card; reductions and reviewed public reads run directly.
 * MOVE: Saved plugin escalation grants never authorize publishing data to anonymous visitors.
 * @complexity O(1); two quota dimensions.
 * @example visitorToolsNeedsApproval({ tool, previous, next });
 */
export function visitorToolsNeedsApproval({ tool, previous, next }: {
  tool: VisitorToolDescriptor; previous: VisitorToolChoice; next: VisitorToolChoice;
}, _options = {}): boolean {
  const raisedAboveDefaults = (Object.keys(VISITOR_TOOL_DEFAULT_LIMITS) as (keyof typeof VISITOR_TOOL_DEFAULT_LIMITS)[])
    .some(key => next.limits[key] > previous.limits[key] && next.limits[key] > VISITOR_TOOL_DEFAULT_LIMITS[key]);
  if (raisedAboveDefaults) return true;
  if (MODE_RANK[next.mode] <= MODE_RANK[previous.mode]) return false;
  return tool.source !== "builtin" || tool.effect !== "read";
}
