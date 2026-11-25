/**
 * @file The publishing handshake's wire vocabulary. A contract, not publish-trust behavior: both
 * sides of the handshake (`features/publish-trust` verifying, `features/publish-content` opening a
 * session to a destination) must spell these literals identically, so they live here rather than in
 * one feature slice that the other would have to import across.
 */

/** The publishing handshake's product wire literals, injected into `@jini-ai/cms/publish/trust/*`:
 *  `messageVersion` is the first line of every signed challenge message, so it is identity — a
 *  changed tag invalidates every signature an existing source makes. */
export const PUBLISH_TRUST_WIRE = {
  messageVersion: "tovu-publish-challenge-v1",
  peerSiteLabel: "a Tovu site",
  notPeerFailure: "not-a-tovu-site",
} as const;
