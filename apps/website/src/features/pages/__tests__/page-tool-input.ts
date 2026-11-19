import { requireInputRecord } from "@jini-ai/core";
import type { PostRepoPort } from "../../post/index.js";

/** Supply a freshly loaded basis for older authoring fixtures; explicit stale/malformed bases stay
 * untouched. Store-failure fixtures have no repo row and model version 1. Missing-basis regressions
 * call the handlers directly in tool-registrations.lost-update.test.ts. */
export async function pageToolInputWithBasis(
  { toolId, input, repo, workspaceId }: { toolId: string; input: unknown; repo: PostRepoPort; workspaceId: string },
  _options = {},
): Promise<Record<string, unknown>> {
  const record = requireInputRecord({ input });
  if (toolId === "pages_read_html" || "expectedVersion" in record) return record;
  const row = await repo.findById({ workspaceId, id: String(record.id) });
  return { expectedVersion: row?.version ?? 1, ...record };
}
