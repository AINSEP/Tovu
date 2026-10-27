import { randomBytes } from "node:crypto";
import {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
  type CustomCredentialWriteDeps,
} from "#src/features/custom-credentials/index";
import type { FormDestinationAddress } from "./types.js";

/**
 * @file The site's form receiver keys, kept in Tovu's existing credential vault as one custom
 * credential per receiver scope ("Form submissions key: <scope>", category hosting). The scope is
 * the hosting target id for a co-hosted receiver (so a key saved before destinations were their own
 * category keeps its label) and the destination id for an external one. Its base URL is the
 * receiver's origin, which is where a pull goes. The key is never written to HTML, history, logs or
 * errors. Receiver keys are site-owned: a project-first create would stay hidden on republish and
 * mint a different receiver secret. Every destination uses the same lifecycle.
 */
const LABEL_PREFIX = "Form submissions key: ";

/** The vault label for one scope's key. @complexity O(1). */
export function formDestinationKeyLabel({ scope }: { scope: string }, _optional = {}): string {
  return `${LABEL_PREFIX}${scope}`;
}

/**
 * The publish-side key. A first publish with forms mints a key and saves it once the receiver has
 * it; a republish reuses the key and moves its base URL when the receiver's origin changed (a rename).
 * @complexity One vault list per call, plus one open for an existing key.
 */
export async function formReceiverKey(
  required: { credentials: CustomCredentialWriteDeps; workspaceId: string; scope: string },
  optional: { newSecret?: () => string } = {},
): Promise<{ readonly secret: string; readonly save: (required: { readonly url: string }) => Promise<void> }> {
  const { credentials, workspaceId, scope } = required;
  const label = formDestinationKeyLabel({ scope });
  const existing = await resolveCustomCredentialByLabel(credentials, { workspaceId, label });
  if (existing) {
    return { secret: existing.connection.token, save: async ({ url }) => {
      const baseUrl = new URL(url).origin;
      if (baseUrl !== existing.baseUrl) await updateCustomCredential(credentials, { workspaceId, id: existing.id, baseUrl });
    } };
  }
  const secret = (optional.newSecret ?? (() => randomBytes(32).toString("base64url")))();
  return { secret, save: async ({ url }) => {
    try { await createCustomCredential(credentials, { workspaceId, label, scope: "site", category: "hosting", baseUrl: new URL(url).origin, connection: { token: secret } }); }
    // A concurrent publish saved its key first; the next publish installs that one everywhere.
    catch (error) { if (!(error instanceof CustomCredentialDuplicateLabelError)) throw error; }
  } };
}

/** Every saved receiver to pull from, optionally one scope's. Opens only the matching keys.
 * @complexity O(saved credentials) metadata plus one open per destination. */
export async function listFormDestinations(
  required: { credentials: CustomCredentialWriteDeps; workspaceId: string },
  optional: { scope?: string } = {},
): Promise<{ scope: string; destination: FormDestinationAddress }[]> {
  const { credentials, workspaceId } = required;
  const labels = (await listCustomCredentials(credentials, { workspaceId })).map((summary) => summary.label)
    .filter((label) => label.startsWith(LABEL_PREFIX) && (optional.scope === undefined || label === formDestinationKeyLabel({ scope: optional.scope })));
  const found: { scope: string; destination: FormDestinationAddress }[] = [];
  for (const label of labels) {
    const resolved = await resolveCustomCredentialByLabel(credentials, { workspaceId, label });
    if (resolved) found.push({ scope: label.slice(LABEL_PREFIX.length), destination: { url: resolved.baseUrl, secret: resolved.connection.token } });
  }
  return found;
}
