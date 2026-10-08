// Generic hook lifecycle and its rationale live in Jini; this adapter binds Tovu's policy owner.
import { buildMigrateForwardHooks as buildHooks, type BuildMigrateForwardHooksInput as JiniHooksInput } from "@jini-ai/db/recovery/migrate-forward-hooks";
import { planHashOf, resolveActorClassIdentity } from "../../contracts/core/gated-mutations/composition.js";
export type BuildMigrateForwardHooksInput = Omit<JiniHooksInput, "planHashOf" | "resolveActorClassIdentity">;

/** Bind the shared hash/actor policy without taking ownership of the mutation ceremony. */
export function buildMigrateForwardHooks(input: BuildMigrateForwardHooksInput, optional: Record<string, never> = {}): ReturnType<typeof buildHooks> {
  return buildHooks({ ...input, planHashOf: ({ details }) => planHashOf(details), resolveActorClassIdentity }, optional);
}
export type { LedgerAppendPort, MigrateForwardDbOpsPort } from "@jini-ai/db/recovery/migrate-forward-hooks";
