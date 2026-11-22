/**
 * Tovu's one tool group, `content_read`, told to the daemon's delegated-tool route.
 *
 * `content_read` is a namespace of read cards (`content_read.menu`, `content_read.page`, ...), never a tool
 * of its own. When an agent calls the bare id, the route asks this port what the id is and answers with the
 * members instead of "no such tool". Only the names live here: the route filters every member by the run's
 * own registry before it shows anything, and nothing is executed or rerouted, so the agent's next request
 * names a concrete member and passes every host gate under that id.
 */
import type { ToolRegistry } from "@jini-ai/core";
import type { ToolFamilyPort } from "@jini-ai/daemon/http";

const FAMILY_ID = "content_read";
const MEMBER_PREFIX = `${FAMILY_ID}.`;
/** The input fields agents have used to say which card they meant when they called the bare id. */
const SELECTOR_KEYS = ["resource", "type", "entity", "kind"] as const;

/**
 * Builds the port from the registry the route serves, read at the moment a bare id arrives so a card
 * registered or retired since startup is reflected.
 *
 * @param required.registry - The run-scoped registry; only `list` is read.
 * @returns A port that knows `content_read` and nothing else; `undefined` for every other id and when no card is registered.
 * @complexity O(r) per bare-id request for r registered tools; no I/O.
 */
export function createContentReadFamilyPort(
  { registry }: { readonly registry: Pick<ToolRegistry, "list"> },
  _optional: Record<string, never> = {},
): ToolFamilyPort {
  return {
    describeFamily({ familyId }) {
      if (familyId !== FAMILY_ID) return undefined;
      const members = registry.list({}).map(({ id }) => id).filter(id => id.startsWith(MEMBER_PREFIX));
      if (members.length === 0) return undefined;
      const byValue = Object.fromEntries(members.map(id => [id.slice(MEMBER_PREFIX.length), id]));
      return { members, selector: { keys: [...SELECTOR_KEYS], byValue } };
    },
  };
}
