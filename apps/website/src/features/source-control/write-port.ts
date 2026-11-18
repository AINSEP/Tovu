import type { SourceControlWritePort } from "@jini-ai/core/contracts/credentials";
import type { ObservabilityPort } from "@jini-ai/diagnostics/observability";
import type { HttpClientPort } from "../../platform/http/index.js";
import { validateRepositoryTarget } from "../custom-credentials/write-files-validation.js";
import { buildSourceControlProviderForApi, type LoadSourceControlProviders } from "./provider-registry.js";

/** Bind the source-control write port over the installed provider registry.
 * @param required Provider loader, guarded HTTP client and observability exactly as the
 *   `custom_credential_write_files` handler passes them to `buildSourceControlProviderForApi`.
 * @returns A port whose plan/commit run on the provider object `build` returned. `required` is read inside `build`,
 *   never at bind time: the composition roots bind this from inside the literal that builds `RouteDeps`, so the
 *   loader, client and observability are getters that do not exist yet when this runs.
 * @complexity O(1) to build; `build` is one registry load.
 * @example const built = await port.build({ workspaceId, baseUrl }); if (built.ok) port.validateTarget({ provider: built.provider, target });
 */
export function bindSourceControlWritePort(required: {
  load: LoadSourceControlProviders;
  httpClient: HttpClientPort;
  observability?: ObservabilityPort;
}, _optional = {}): SourceControlWritePort {
  return {
    build: ({ workspaceId, baseUrl }) => buildSourceControlProviderForApi({ load: required.load, workspaceId, baseUrl, httpClient: required.httpClient, observability: required.observability }),
    validateTarget: ({ provider, target }) => validateRepositoryTarget(target, provider.validateTarget),
    planFileWrite: ({ provider, input }) => provider.planFileWrite(input),
    commitFiles: ({ provider, input, plan }) => provider.commitFiles(input, plan),
  };
}
