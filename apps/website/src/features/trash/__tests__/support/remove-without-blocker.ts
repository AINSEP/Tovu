import type { TrashMarkerResult } from "@jini-ai/cms/trash";

/** What a blocker-free domain's `remove*` port (`RemovePostFn`, `RemoveWidgetFn`, ...) can return. */
export type RemoveWithoutBlockerResult =
  | { ok: true; version: number | null }
  | { ok: false; reason: "not-found" | "version-changed" };

/**
 * Test twin of the composition roots' own `removeEntityWithoutBlocker` (`server/runtime/composition`'s
 * `app.ts` and `deps.ts`, where it is a local, unexported function): narrows a bound trash removal to
 * a domain port for an entity type registered with no blocker, throwing on a `"blocked"` result the
 * same way production does rather than letting it reach a port that has no such reason.
 */
export function removeEntityWithoutBlocker<Input extends { id: string }>(
  remove: (required: Input) => Promise<TrashMarkerResult>
): (required: Input) => Promise<RemoveWithoutBlockerResult> {
  return async (required) => {
    const result = await remove(required);
    if (!result.ok && result.reason === "blocked") {
      throw new Error(`trash: '${required.id}' reported 'blocked' from a type registered with no blocker — composition bug`);
    }
    return result;
  };
}
