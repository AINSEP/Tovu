import { bindPublishCompatibility } from "#src/features/deployments/publish-credentials/index";
import { bindSourceControlWritePort } from "#src/features/source-control/index";
import { validateRepositoryTarget } from "#src/features/custom-credentials/write-files-validation";
import { describeCredentialByLabel, resolveCustomCredentialByLabel } from "#src/features/custom-credentials/index";

import type { RouteDeps } from "../../routes/types.js";

/** The slice of `RouteDeps` the credential ports read when they run. */
export type CredentialsHostPortDeps = Pick<RouteDeps, "loadSourceControlProviders" | "customCredentialSetRepo" | "siteAssistantSecretSealer" | "customCredentialsHttpClient" | "observability" | "loadDeployTargets" | "publishCredentialVerificationCache">;

/**
 * Binds the host's credential ports. Both composition roots bind them from inside the literal that builds
 * `RouteDeps`, where the loader, the guarded client and the observability port are not yet readable as plain
 * values, so `readDeps` is a getter (`() => routeDeps`) and every read happens when a write runs, after the
 * bag is complete (the late-read rule `exportSiteBound` relies on).
 * @complexity O(1) to bind.
 */
export function bindCredentialsHostPorts({ readDeps }: { readDeps: () => CredentialsHostPortDeps }, _optional = {}): Pick<RouteDeps, "sourceControlWrite" | "publishCompatibility" | "sourceControlSavedKeys"> {
  return {
    sourceControlWrite: bindSourceControlWritePort({
      load: (input, optional) => readDeps().loadSourceControlProviders(input, optional),
      get httpClient() { return readDeps().customCredentialsHttpClient; },
      get observability() { return readDeps().observability; },
      validateRepositoryTarget,
    }),
    publishCompatibility: bindPublishCompatibility({ get source() { return readDeps(); } }),
    // Source control reads a provider's saved API key by label through the custom-credentials owner;
    // the repo and sealer are read when a lookup runs, after the bag is complete.
    sourceControlSavedKeys: {
      describeByLabel: ({ workspaceId, label }) => describeCredentialByLabel({ repo: readDeps().customCredentialSetRepo }, { workspaceId, label }),
      resolveByLabel: ({ workspaceId, label }) => resolveCustomCredentialByLabel({ repo: readDeps().customCredentialSetRepo, sealer: readDeps().siteAssistantSecretSealer }, { workspaceId, label }),
    },
  };
}
