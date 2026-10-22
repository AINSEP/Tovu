/** The only Tovu management writer for visitor-tool policy. T2 will call this from page and chat. */
import type { JsonValue } from "@jini-ai/core/primitives";
import type { SetValueRequired } from "@jini-ai/core/settings";
import { parseVisitorToolPolicy, VISITOR_TOOLS_PERMISSION, VISITOR_TOOLS_SETTING } from "../../contracts/site-assistant/visitor-tools.js";
import { set } from "./site-title-write.js";

/** J1 must supply atomic revision CAS in the existing settings owner; a pre-read cannot provide it. */
export class VisitorToolsRevisionUnavailableError extends Error {}

/** Validate, then write with the dedicated permission. No raw repo writes or proxy CAS.
 * J1 SEAM: inject the published CAS-enabled host writer here once its option is available. Until
 * then revision-dependent writes refuse rather than silently lose a concurrent admin edit.
 * @throws VisitorToolsRevisionUnavailableError if a caller requires J1's unavailable CAS.
 * @complexity O(t) validation (t ≤ 128), plus one existing settings transaction.
 * @example writeVisitorTools({ deps, workspaceId, callerPrincipalId, value });
 */
export async function writeVisitorTools(required: {
  deps: SetValueRequired["deps"]; workspaceId: string; callerPrincipalId: string; value: unknown;
}, optional: { expectedRevisionSeq?: number } = {}): Promise<{ value: JsonValue; revisionSeq: number }> {
  if (optional.expectedRevisionSeq !== undefined) throw new VisitorToolsRevisionUnavailableError("Visitor tools revision checks require J1 settings CAS.");
  const policy = parseVisitorToolPolicy({ value: required.value });
  return set({ deps: required.deps, input: {
    ...VISITOR_TOOLS_SETTING, scope: "workspace", workspaceId: required.workspaceId,
    authWorkspaceId: required.workspaceId, callerPrincipalId: required.callerPrincipalId,
    requiredPermissionOverride: VISITOR_TOOLS_PERMISSION, value: policy as unknown as JsonValue,
  } });
}
