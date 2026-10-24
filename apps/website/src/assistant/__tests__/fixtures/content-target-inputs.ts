import type { ToolRegistration } from "@jini-ai/core";
import type { AssistantToolRegistryDeps } from "../../tool-registrations.js";
import { bindContentTargetInputs } from "../../../server/runtime/composition/content-target-inputs.js";
import type { ContentTargetDeps } from "../../content-target-inputs.js";

/** Exercise domain tools with the same host target adapter the assembled assistant installs. */
export function withContentTargets({ registrations, deps, beforeLookup }: { registrations: readonly ToolRegistration[]; deps: unknown; beforeLookup?: ContentTargetDeps["beforeLookup"] }, _options = {}) {
  return bindContentTargetInputs({ registrations, routeDeps: deps as AssistantToolRegistryDeps, beforeLookup });
}
