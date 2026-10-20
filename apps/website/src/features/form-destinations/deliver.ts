import { FormDeliveryError, type FormDeliveryJob, type FormDeliveryResult } from "@jini-ai/cms/forms";
import { resolveRequestTarget } from "@jini-ai/integrations/credentialed-http";
import type { FormDeliveryConnectionPort, FormDestinationCredential, FormDestinationKit, FormDestinationRegistry } from "./types.js";

/**
 * @file The host half of one push-delivery attempt: find the binding's adapter among the loaded
 * form destinations, resolve its credential, and call the adapter's `deliver` with the frozen job.
 * Retries, attempt caps and error sanitising belong to the outbox worker and Jini's
 * `deliverFormJob`, which wraps this function; refusals here use the same safe error codes.
 *
 * The adapter gets a kit bound to the attempt's credential: its `fetch` reaches only the
 * credential's saved hosts, the rule `custom_credential_make_request` enforces, so a plugin handed
 * a credential cannot send it (or the answers) to any other origin through the kit.
 */

/**
 * Builds the `deliver` port `createFormDeliverySubscriptions` calls once per attempt.
 * @throws FormDeliveryError `adapter-unavailable` (retryable: the plugin may be re-enabled) when no
 *   loaded destination with the binding's adapter id has `deliver`; `authorization-required`
 *   (non-retryable) when the connection port finds no credential. The adapter's `kit.fetch` rejects
 *   with `configuration-invalid` (non-retryable) for a URL outside the credential's saved hosts.
 * @complexity One registry load and one credential resolution per attempt, then the adapter's own cost.
 */
export function createFormDestinationDeliverer(
  required: {
    loadRegistry: (required: { workspaceId: string }) => Promise<FormDestinationRegistry>;
    connections: FormDeliveryConnectionPort;
    kit: FormDestinationKit;
  },
  _optional: Record<string, never> = {},
): (required: { workspaceId: string; job: FormDeliveryJob }) => Promise<FormDeliveryResult | void> {
  return async ({ workspaceId, job }) => {
    const { binding } = job;
    const adapter = (await required.loadRegistry({ workspaceId })).get(binding.adapterId);
    if (!adapter?.module.deliver) throw new FormDeliveryError({ code: "adapter-unavailable", retryable: true });
    // Resolved on every attempt and passed only to the adapter, so rotation and revocation apply at once.
    const credential = await required.connections({ workspaceId, connectionRef: binding.connectionRef, adapterId: binding.adapterId });
    if (!credential) throw new FormDeliveryError({ code: "authorization-required", retryable: false });
    const kit = credentialScopedKit({ kit: required.kit, credential, workspaceId, connectionRef: binding.connectionRef });
    return adapter.module.deliver({ kit, credential, ...job.snapshot, binding, idempotencyKey: job.idempotencyKey });
  };
}

/**
 * The kit one attempt's adapter receives. Only the members `FormDestinationKit` names are passed on:
 * the host kit's other network helpers take any URL and would let a plugin carry the credential out
 * in a query string. Each `fetch` URL goes through the custom-credential make-request host check
 * (exact origin match on `baseUrl` + `additionalHosts`, http/https only, no `user:pass@`) before any
 * network call. The credential's own saved state is the allowlist; nothing the adapter sends widens it.
 * @complexity O(saved hosts) per fetch, before the host kit's own cost.
 */
function credentialScopedKit(required: { kit: FormDestinationKit; credential: FormDestinationCredential; workspaceId: string; connectionRef: string }): FormDestinationKit {
  const { kit, credential, workspaceId, connectionRef } = required;
  const target = { baseUrl: credential.baseUrl, additionalHosts: credential.additionalHosts ?? [] };
  const fetch: FormDestinationKit["fetch"] = async (url, init, options) => {
    try {
      await resolveRequestTarget({ resolver: { describe: async () => target }, input: { workspaceId, label: connectionRef, url } });
    } catch {
      // The resolver above cannot fail, so every refusal is the host check's. Its message names the
      // URL, which may carry answers; only the safe code leaves this function.
      throw new FormDeliveryError({ code: "configuration-invalid", retryable: false, outcome: "not-applied" });
    }
    return kit.fetch(url, init, options);
  };
  return { fetch, timeouts: kit.timeouts, ...(kit.now ? { now: () => kit.now!() } : {}) };
}
