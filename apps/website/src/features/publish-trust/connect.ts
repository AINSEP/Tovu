import type { KeyringPort } from "#src/features/webhooks/index";

import {
  PUBLISHING_CAPABILITIES,
  PUBLISH_TRUST_GRANT_VERSION,
  type PublishTrustGrant,
} from "./grant.js";
import { fetchDestinationIdentity, PUBLISH_TRUST_GENERATION, PublishTrustHandshakeError, type DestinationIdentity, type HandshakeClientDeps } from "./handshake-client.js";
import { deriveInstallationId, derivePublishSigningKey } from "./keys.js";
import {
  grantNotAfterFrom,
  type ProvisioningFileIo,
  type ProvisioningTarget,
  type PublishTrustProvisioningPort,
} from "./provisioning.js";

/**
 * @file Zero-setup publishing auth — the one action a person takes: "this site is mine".
 *
 * `provisioning.ts` can write a grant and `handshake-client.ts` can ask a destination who it is;
 * neither knows how to turn "the owner clicked Connect" into a grant. This file is that step, and
 * it is deliberately the ONLY place that composes them, so there is exactly one definition of what
 * connecting means.
 *
 * ## The whole user-visible surface is one confirmation
 *
 * {@link findCandidateDestination} reads the address out of the deploy config the repo already
 * carries, so the common case is a pre-filled "Publish to <site>?" rather than a field to fill in.
 * Everything else — the destination's workspace id, this install's identity, the key, the entity
 * allowlist, the expiry — is derived or asked for. The owner sees none of it and is asked for none
 * of it.
 *
 * ## What connecting does and does not do
 *
 * It writes a public key into committed deploy config, and stops. It cannot deploy (that would need
 * provider credentials on the owner's machine — the dependency this design exists to remove), so
 * the grant takes effect on the next deploy and {@link ConnectedDestination.nextStep} says so in
 * one sentence. Nothing secret is written, displayed, copied or stored: the private half is derived
 * from the Site Token on demand and never exists between publishes.
 */

/** Deploy-config files a repo may carry, in the order they are consulted for a candidate address.
 *
 *  This is a SUGGESTION mechanism, never a trust decision: whatever it finds is shown to the owner
 *  for confirmation and is re-validated as a URL before anything is done with it. That is why a
 *  plain scan is adequate here where a real parser is required in `provisioning.fly-toml.ts` — the
 *  cost of a wrong guess is a pre-filled field the owner corrects, not a misdirected publish. */
export const DEPLOY_CONFIG_CANDIDATE_PATHS = ["fly.toml", "render.yaml", "railway.toml", "app.json"] as const;

/** The deploy-config key naming a deployment's public origin. Already this repo's own convention
 *  for exactly that (`features/origin/configured-origin.ts`); reusing it means a site that has ever
 *  been deployed needs no new setting to be connectable. */
const PUBLIC_URL_KEY = "TOVU_PUBLIC_URL";

/** Matches `TOVU_PUBLIC_URL = "https://…"` / `TOVU_PUBLIC_URL: https://…` / `TOVU_PUBLIC_URL=https://…`
 *  across TOML, YAML and JSON alike, which is why one expression covers every file above. */
const PUBLIC_URL_PATTERN = new RegExp(`${PUBLIC_URL_KEY}\\s*[:=]\\s*["']?(https://[^"'\\s,]+)`);

/**
 * The address to offer the owner, read out of the repo's own deploy config.
 *
 * Deliberately NOT `process.env.TOVU_PUBLIC_URL`: on the machine doing the connecting that names
 * THIS install (usually `localhost`), not the site being published to. The committed config is the
 * one place that names the deployed site, and every install that has ever been deployed has it.
 *
 * @returns The first `https` origin found, or `null` — an install that has never been deployed has
 * no candidate, which is an ordinary empty state and not an error.
 * @complexity O(f · n) for `f` config files of length `n`; f is a fixed list of four.
 */
export async function findCandidateDestination(deps: {
  readonly io: ProvisioningFileIo;
  /** Absolute path for a repo-relative config file. */
  readonly resolvePath: (relative: string) => string;
}): Promise<string | null> {
  for (const relative of DEPLOY_CONFIG_CANDIDATE_PATHS) {
    const contents = await deps.io.read(deps.resolvePath(relative));
    if (contents === null) continue;
    const found = PUBLIC_URL_PATTERN.exec(contents);
    if (found) return found[1];
  }
  return null;
}

export interface ConnectDeps extends HandshakeClientDeps {
  readonly keyring: KeyringPort;
  readonly provisioning: PublishTrustProvisioningPort;
  readonly clock: { nowIso(): string };
  /** THIS install's workspace — the Site Token the publishing key is derived from. */
  readonly workspaceId: string;
}

/** What a successful connect produced. No key material and no identifier a person has to keep. */
export interface ConnectedDestination {
  readonly identity: DestinationIdentity;
  /** The normalized address that was connected, and the key-derivation audience. */
  readonly baseUrl: string;
  /** `false` when the config already said exactly this — nothing to commit, nothing to deploy. */
  readonly changed: boolean;
  readonly target: ProvisioningTarget;
  /** The one sentence to show the owner next. */
  readonly nextStep: string;
}

/** Thrown when the grant could not be written. `message` is a sentence for the owner. */
export class PublishTrustConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishTrustConnectError";
  }
}

/**
 * Connects this install to a destination: learn who it is, derive this install's public key for it,
 * and write the grant into the deploy config.
 *
 * Idempotent by construction — `provisioning.connect` merges by source installation id, so running
 * it twice replaces this computer's own entry and leaves every other computer's alone. That is what
 * makes "click it again if you are not sure" a safe instruction to give a non-developer.
 *
 * @param input.entityTypes - What this source may publish, from its own registered publish-content
 * types. An empty list is a grant that can do nothing (`grant.ts`), so a caller that cannot
 * enumerate its types must not call this.
 * @throws {PublishTrustHandshakeError} when the destination cannot be reached or is not a Tovu site.
 * @throws {PublishTrustConnectError} when the deploy config could not be written.
 * @complexity O(1) plus one round trip, two HKDFs, one file read and one file write.
 */
export async function connectDestination(
  deps: ConnectDeps,
  input: { baseUrl: string; entityTypes: readonly string[] }
): Promise<ConnectedDestination> {
  const identity = await fetchDestinationIdentity(deps, input);

  const sourceInstallationId = await deriveInstallationId({ keyring: deps.keyring, workspaceId: deps.workspaceId });
  const signingKey = await derivePublishSigningKey({
    keyring: deps.keyring,
    workspaceId: deps.workspaceId,
    sourceInstallationId,
    // VERBATIM the same string `openPublishSession` signs with later. A grant written against a
    // different spelling of the same site produces a public key that verifies nothing.
    targetOrigin: input.baseUrl,
    generation: PUBLISH_TRUST_GENERATION,
  });

  const grant: PublishTrustGrant = {
    version: PUBLISH_TRUST_GRANT_VERSION,
    sourceInstallationId,
    publicKeys: [{ publicKeyB64u: signingKey.publicKeyB64u, generation: signingKey.generation }],
    // The DESTINATION's workspace, as the destination itself just stated it. This is the value the
    // old flow made a human find and retype, and the reason `/identity` exists.
    workspaceId: identity.workspaceId,
    entityTypes: [...input.entityTypes],
    capabilities: PUBLISHING_CAPABILITIES,
    notAfter: grantNotAfterFrom(deps.clock.nowIso()),
  };

  const written = await deps.provisioning.connect({ grant });
  if (!written.ok) throw new PublishTrustConnectError(`This site's publishing settings could not be saved: ${written.reason}`);

  return {
    identity,
    baseUrl: input.baseUrl,
    changed: written.changed,
    target: written.target,
    nextStep: written.changed
      ? written.target.nextStep
      : "This computer was already connected to that site. Nothing to change.",
  };
}

/**
 * Removes this install's grant from the deploy config.
 *
 * The weaker of the two disconnects on purpose: it takes effect on the next deploy. The immediate
 * one is the destination-side deny list (`revocations.ts`), which needs no deploy and wins over any
 * grant. Both exist because they answer different questions — "stop shipping my key in the repo"
 * and "cut this computer off right now".
 *
 * @complexity O(1) plus one HKDF, one file read and one file write.
 */
export async function disconnectDestination(
  deps: Pick<ConnectDeps, "keyring" | "provisioning" | "workspaceId">
): Promise<{ changed: boolean; target: ProvisioningTarget }> {
  const sourceInstallationId = await deriveInstallationId({ keyring: deps.keyring, workspaceId: deps.workspaceId });
  const written = await deps.provisioning.disconnect({ sourceInstallationId });
  if (!written.ok) throw new PublishTrustConnectError(`This site's publishing settings could not be saved: ${written.reason}`);
  return { changed: written.changed, target: written.target };
}

export { PublishTrustHandshakeError };
