import { FormDeliveryError, type FormDeliveryJob, type FormDeliveryResult } from "@jini-ai/cms/forms";
import type { FormDeliveryConnectionPort, FormDestinationKit, FormDestinationRegistry } from "./types.js";

/**
 * @file The host half of one push-delivery attempt: find the binding's adapter among the loaded
 * form destinations, resolve its credential, and call the adapter's `deliver` with the frozen job.
 * Retries, attempt caps and error sanitising belong to the outbox worker and Jini's
 * `deliverFormJob`, which wraps this function; refusals here use the same safe error codes.
 */

/**
 * Builds the `deliver` port `createFormDeliverySubscriptions` calls once per attempt.
 * @throws FormDeliveryError `adapter-unavailable` (retryable: the plugin may be re-enabled) when no
 *   loaded destination with the binding's adapter id has `deliver`; `authorization-required`
 *   (non-retryable) when the connection port finds no credential.
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
    return adapter.module.deliver({ kit: required.kit, credential, ...job.snapshot, binding, idempotencyKey: job.idempotencyKey });
  };
}
