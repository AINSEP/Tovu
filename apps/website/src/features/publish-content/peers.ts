import { InMemoryVaultRepo, SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import type { VaultMeta, VaultRepoPort } from "@jini-ai/core/contracts/vault";
import { credentialTokenHint } from "@jini-ai/platform/secrets/credential-token";
import { byVaultLabel, createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { VaultPublishContentPeerRepo as PeerRegistryVaultRepo, type PublishContentPeerVaultBinding } from "@jini-ai/cms/publish/content/peer-registry";

/**
 * @file Host binding for the publish-content peer registry (`@jini-ai/cms/publish/content/peer-registry`).
 *
 * Jini owns peer CRUD, the read model and the decrypt boundary; this file holds only the values
 * Tovu installs already wrote their peer rows under, plus the platform vault lifecycle that seals
 * and opens them. Callers import the operations from Jini directly and get these values through
 * the repository they already pass (`deps.repo`).
 */

const peerKinds = createTovuVaultKinds({ policy: {
  validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => "apiKey",
} });

/**
 * Tovu's publish-peer vault wiring. `kind` and `ownerKey` are AT-REST VALUES, bound into every sealed
 * peer key's AAD: changing either one makes every saved peer credential on every install fail to
 * open (pinned by `__tests__/peers.sealed-at-rest.pin.test.ts`). Never change them.
 */
export const publishPeerVaultBinding: PublishContentPeerVaultBinding = {
  kind: "publish-peer",
  ownerKey: "tovu",
  parseMeta: ({ meta }) => peerKinds.metaParsers["publish-peer"]({ meta: meta as VaultMeta }),
  createService: options => new SecretsVaultService({ ...options, metaParsers: peerKinds.metaParsers }),
  tokenHint: ({ token }) => credentialTokenHint({ token }),
  compareByLabel: byVaultLabel,
};

/** The SQL/any-vault peer repository, bound to Tovu's at-rest peer scope. */
export class VaultPublishContentPeerRepo extends PeerRegistryVaultRepo {
  constructor({ vault }: { vault: VaultRepoPort }, _options = {}) { super({ vault, binding: publishPeerVaultBinding }); }
}

/** Same facade as SQL, backed by Jini's memory adapter rather than a second lifecycle. */
export class InMemoryPublishContentPeerRepo extends VaultPublishContentPeerRepo {
  constructor(_required = {}, _options = {}) { super({ vault: new InMemoryVaultRepo({}) }); }
}
