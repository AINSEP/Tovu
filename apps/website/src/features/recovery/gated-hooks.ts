// Generic hook lifecycle and its rationale live in Jini; this adapter binds Tovu's policy owner.
import { buildRestoreHooks as buildHooks, type BuildRestoreHooksInput as JiniHooksInput } from "@jini-ai/db/recovery/restore-hooks";
import { planHashOf, resolveActorClassIdentity } from "../../contracts/core/gated-mutations/composition.js";
export type BuildRestoreHooksInput = Omit<JiniHooksInput, "planHashOf" | "resolveActorClassIdentity">;

/** Bind the shared hash/actor policy without taking ownership of the mutation ceremony. */
export function buildRestoreHooks(input: BuildRestoreHooksInput, optional: Record<string, never> = {}): ReturnType<typeof buildHooks> {
  return buildHooks({ ...input, planHashOf: ({ details }) => planHashOf(details), resolveActorClassIdentity }, optional);
}
export { RestorePointNotFoundError, toRecoveryResult } from "@jini-ai/db/recovery/restore-hooks";
export type { RecoveryErrorPayload } from "@jini-ai/db/recovery/restore-hooks";
