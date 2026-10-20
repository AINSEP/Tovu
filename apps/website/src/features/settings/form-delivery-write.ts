import type { JsonValue } from "@jini-ai/core/primitives";
import type { SetValueRequired } from "@jini-ai/core/settings";

import { set } from "./site-title-write.js";

/**
 * @file The typed write for `core.forms/deliveryBindings` that a later admin or plugin UI calls.
 * Kept apart from `form-delivery.ts` because it writes through the host settings chokepoint
 * (`site-title-write.ts`), which itself imports that file's validator: one file would close an
 * import cycle.
 */

/**
 * Saves the bindings through the host chokepoint, which validates them and stores the cleaned list
 * (`enforceFormDeliveryBindingsWrite`), so an invalid or secret-carrying list never reaches the ledger.
 * @throws ValueValidationFailedError for any rule `parseFormDeliveryBindings` enforces;
 *   authorization and ledger errors from the settings write propagate.
 * @complexity `parseFormDeliveryBindings` plus one settings write.
 */
export async function writeFormDeliveryBindings(
  required: { deps: SetValueRequired["deps"]; workspaceId: string; callerPrincipalId: string; value: unknown },
  _optional: Record<string, never> = {},
): Promise<{ value: JsonValue; revisionSeq: number }> {
  return set({ deps: required.deps, input: {
    namespace: "core.forms", key: "deliveryBindings", scope: "workspace", workspaceId: required.workspaceId,
    callerPrincipalId: required.callerPrincipalId, value: required.value as JsonValue,
  } });
}
