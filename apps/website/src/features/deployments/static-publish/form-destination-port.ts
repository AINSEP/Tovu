import { randomBytes } from "node:crypto";
import {
  createCustomCredential,
  CustomCredentialDuplicateLabelError,
  listCustomCredentials,
  resolveCustomCredentialByLabel,
  updateCustomCredential,
  type CustomCredentialWriteDeps,
} from "#src/features/custom-credentials/index";
import type { FormDestinationAddress } from "#src/features/deployments/deploy-targets/types";
import type { StaticPublishFormDestinationPort } from "./adapter.js";

/**
 * @file The site's form destination keys, kept in Tovu's existing credential vault as one custom
 * credential per hosting target ("Form submissions key: <target>", category hosting). Its base URL is
 * the published address, which is where a pull goes. The key is never written to HTML, history,
 * logs or errors. Generic: any hosting target that can receive forms uses the same keys.
 */
const LABEL_PREFIX = "Form submissions key: ";

/** The vault label for one target's key. @complexity O(1). */
export function formDestinationKeyLabel({ targetId }: { targetId: string }, _optional = {}): string {
  return `${LABEL_PREFIX}${targetId}`;
}

/**
 * The publish-side port. A first publish with forms mints a key and saves it once the host has it;
 * a republish reuses the key and moves its base URL when the published address changed (a rename).
 * @complexity One vault list per call, plus one open for an existing key.
 */
export function createFormDestinationPort(
  required: { listForms: StaticPublishFormDestinationPort["listForms"]; credentials: CustomCredentialWriteDeps },
  optional: { newSecret?: () => string } = {},
): StaticPublishFormDestinationPort {
  const { listForms, credentials } = required;
  const newSecret = optional.newSecret ?? (() => randomBytes(32).toString("base64url"));
  return {
    listForms,
    async receiverKey({ workspaceId, targetId }) {
      const label = formDestinationKeyLabel({ targetId });
      const existing = await resolveCustomCredentialByLabel(credentials, { workspaceId, label });
      if (existing) {
        return { secret: existing.connection.token, save: async ({ url }) => {
          const baseUrl = new URL(url).origin;
          if (baseUrl !== existing.baseUrl) await updateCustomCredential(credentials, { workspaceId, id: existing.id, baseUrl });
        } };
      }
      const secret = newSecret();
      return { secret, save: async ({ url }) => {
        try { await createCustomCredential(credentials, { workspaceId, label, category: "hosting", baseUrl: new URL(url).origin, connection: { token: secret } }); }
        // A concurrent publish saved its key first; the next publish installs that one everywhere.
        catch (error) { if (!(error instanceof CustomCredentialDuplicateLabelError)) throw error; }
      } };
    },
  };
}

/** Every saved destination to pull from, optionally one target's. Opens only the matching keys.
 * @complexity O(saved credentials) metadata plus one open per destination. */
export async function listFormDestinations(
  required: { credentials: CustomCredentialWriteDeps; workspaceId: string },
  optional: { targetId?: string } = {},
): Promise<{ targetId: string; destination: FormDestinationAddress }[]> {
  const { credentials, workspaceId } = required;
  const labels = (await listCustomCredentials(credentials, { workspaceId })).map((summary) => summary.label)
    .filter((label) => label.startsWith(LABEL_PREFIX) && (optional.targetId === undefined || label === formDestinationKeyLabel({ targetId: optional.targetId })));
  const found: { targetId: string; destination: FormDestinationAddress }[] = [];
  for (const label of labels) {
    const resolved = await resolveCustomCredentialByLabel(credentials, { workspaceId, label });
    if (resolved) found.push({ targetId: label.slice(LABEL_PREFIX.length), destination: { url: resolved.baseUrl, secret: resolved.connection.token } });
  }
  return found;
}
