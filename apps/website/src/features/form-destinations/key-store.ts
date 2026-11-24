import { randomBytes } from "node:crypto";
import {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
  type CustomCredentialWriteDeps,
} from "#src/features/custom-credentials/index";
import type { FormDestinationAddress } from "@jini-ai/cms/forms";
import { listReceiverKeys, resolveReceiverKey, type ReceiverKeyVault } from "@jini-ai/cms/forms/destinations/key-store";

/**
 * @file The site's form receiver keys, kept in Tovu's existing credential vault as one custom
 * credential per receiver scope ("Form submissions key: <scope>", category hosting). The scope is
 * the hosting target id for a co-hosted receiver (so a key saved before destinations were their own
 * category keeps its label) and the destination id for an external one. Its base URL is the
 * receiver's origin, which is where a pull goes. The key is never written to HTML, history, logs or
 * errors. Receiver keys are site-owned: a project-first create would stay hidden on republish and
 * mint a different receiver secret. Every destination uses the same lifecycle, owned by
 * `@jini-ai/cms/forms/destinations/key-store`; this binding maps it onto the credential vault and
 * keeps the persisted label, site scope and category.
 */
const LABEL_PREFIX = "Form submissions key: ";

/** The vault label for one scope's key. @complexity O(1). */
export function formDestinationKeyLabel({ scope }: { scope: string }, _optional = {}): string {
  return `${LABEL_PREFIX}${scope}`;
}

/** The credential vault as the receiver-key lifecycle sees it: every key is a site-scoped hosting credential. */
function receiverKeyVault({ credentials }: { credentials: CustomCredentialWriteDeps }, _optional = {}): ReceiverKeyVault {
  return {
    listLabels: async ({ workspaceId }) => (await listCustomCredentials(credentials, { workspaceId })).map((summary) => summary.label),
    resolve: async ({ workspaceId, label }) => {
      const resolved = await resolveCustomCredentialByLabel(credentials, { workspaceId, label });
      return resolved ? { id: resolved.id, baseUrl: resolved.baseUrl, secret: resolved.connection.token } : null;
    },
    create: async ({ workspaceId, label, baseUrl, secret }) => {
      await createCustomCredential(credentials, { workspaceId, label, scope: "site", category: "hosting", baseUrl, connection: { token: secret } });
    },
    updateBaseUrl: async ({ workspaceId, id, baseUrl }) => { await updateCustomCredential(credentials, { workspaceId, id, baseUrl }); },
    isDuplicateLabel: (error) => error instanceof CustomCredentialDuplicateLabelError,
  };
}

/**
 * The publish-side key. A first publish with forms mints a key and saves it once the receiver has
 * it; a republish reuses the key and moves its base URL when the receiver's origin changed (a rename).
 * @complexity One vault list per call, plus one open for an existing key.
 */
export function formReceiverKey(
  required: { credentials: CustomCredentialWriteDeps; workspaceId: string; scope: string },
  optional: { newSecret?: () => string } = {},
): Promise<{ readonly secret: string; readonly save: (required: { readonly url: string }) => Promise<void> }> {
  const { credentials, workspaceId, scope } = required;
  return resolveReceiverKey({
    vault: receiverKeyVault({ credentials }), workspaceId, scope, labelPrefix: LABEL_PREFIX,
    newSecret: optional.newSecret ?? (() => randomBytes(32).toString("base64url")),
  });
}

/** Every saved receiver to pull from, optionally one scope's. Opens only the matching keys.
 * @complexity O(saved credentials) metadata plus one open per destination. */
export function listFormDestinations(
  required: { credentials: CustomCredentialWriteDeps; workspaceId: string },
  optional: { scope?: string } = {},
): Promise<{ scope: string; destination: FormDestinationAddress }[]> {
  return listReceiverKeys({ vault: receiverKeyVault({ credentials: required.credentials }), workspaceId: required.workspaceId, labelPrefix: LABEL_PREFIX }, optional);
}
