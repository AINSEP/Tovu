import {
  grantAllowsCapability,
  isGrantActive,
  type PublishTrustGrant,
  type PublishingCapability,
} from "./grant.js";
import { verifyPublishSignature } from "./keys.js";

/**
 * @file Zero-setup publishing auth — proof of possession.
 * Design note: `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`.
 *
 * The source never sends a secret. It proves it holds the private half of a public key the
 * destination was already given (as committed deploy config) by signing a nonce the DESTINATION
 * chose. Four bindings are inside the signed bytes, and each one closes a specific attack:
 *
 * - `nonce` — single-use and short-lived, so a captured response cannot be replayed.
 * - `targetInstallationId` (the audience) — so a response captured by, or produced for, one
 *   destination cannot be presented at another. Note this is belt AND braces: `keys.ts` already
 *   derives a different keypair per destination, so a cross-destination replay fails on the
 *   signature too. Two independent mechanisms, because an audience check is the one a future
 *   refactor is most likely to drop.
 * - `sourceInstallationId` + `generation` — pins which installation and which rotation generation
 *   is claiming to speak, so a valid signature from an old generation cannot be re-labelled as a
 *   new one.
 * - `capabilities` — the caller states what it is asking for and signs it, so the request cannot be
 *   escalated in flight. It is then intersected with the grant, which is the real ceiling.
 *
 * FAIL-CLOSED EVERYWHERE: every rejection below returns a reason string, never a throw and never a
 * partially-verified result. `reason` names the check that failed for the operator's log; it is
 * never returned to the caller, because "expired nonce" vs "unknown nonce" is an oracle.
 */

/** Canonical message format version. Inside the signed bytes, so a future format cannot be swapped
 *  in under a signature made for this one. */
const CHALLENGE_MESSAGE_VERSION = "tovu-publish-challenge-v1";

/** How long an issued nonce stays usable. Long enough for one round trip on a slow link, short
 *  enough that a captured-but-unused nonce is worthless almost immediately. */
export const CHALLENGE_TTL_MS = 60_000;

/** An issued, not-yet-answered challenge. */
export interface PublishChallengeRecord {
  readonly nonce: string;
  readonly targetInstallationId: string;
  readonly issuedAtIso: string;
  readonly expiresAtIso: string;
}

/**
 * Single-use nonce storage.
 *
 * {@link takeOnce} is named to say "consumes" out loud: it MUST delete the record it returns, in
 * the same operation, or replay protection does not exist. A `get`-shaped method would invite a
 * caller to verify first and delete later, which is exactly the window a replay needs.
 */
export interface PublishChallengeStorePort {
  put(record: PublishChallengeRecord): Promise<void>;
  /** Returns the record AND removes it. A second call for the same nonce returns `null`. */
  takeOnce(nonce: string): Promise<PublishChallengeRecord | null>;
}

/** What the source sends back. Every field is attacker-controlled — nothing here is trusted until
 *  the signature over {@link buildChallengeMessage} verifies. */
export interface PublishChallengeResponse {
  readonly nonce: string;
  readonly sourceInstallationId: string;
  readonly generation: number;
  readonly capabilities: readonly string[];
  readonly signatureB64u: string;
}

/**
 * The exact bytes both sides sign and verify.
 *
 * Newline-separated because every field is an identifier, a base64url value, an integer or a
 * comma-joined capability list — none of which can contain a newline — so the encoding is
 * unambiguous and no field can be shifted into another by choosing a clever value. Capabilities are
 * sorted so the two sides cannot disagree about order.
 *
 * @complexity O(n log n) in the capability count (the sort), n ≤ 2.
 */
export function buildChallengeMessage(input: {
  nonce: string;
  targetInstallationId: string;
  sourceInstallationId: string;
  generation: number;
  capabilities: readonly string[];
}): string {
  return [
    CHALLENGE_MESSAGE_VERSION,
    input.nonce,
    input.targetInstallationId,
    input.sourceInstallationId,
    String(input.generation),
    [...input.capabilities].sort().join(","),
  ].join("\n");
}

/**
 * Issues a fresh single-use challenge. Called by the destination, for anyone who asks — issuing a
 * nonce discloses nothing, so this route needs no credential (which is what makes the whole flow
 * possible for a caller that has none yet).
 *
 * @complexity O(1) — one id generation and one store write.
 */
export async function issuePublishChallenge(deps: {
  store: PublishChallengeStorePort;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  targetInstallationId: string;
}): Promise<PublishChallengeRecord> {
  const issuedAtIso = deps.clock.nowIso();
  const record: PublishChallengeRecord = {
    nonce: deps.idGen.newId(),
    targetInstallationId: deps.targetInstallationId,
    issuedAtIso,
    expiresAtIso: new Date(Date.parse(issuedAtIso) + CHALLENGE_TTL_MS).toISOString(),
  };
  await deps.store.put(record);
  return record;
}

/** A verified challenge response: who proved possession, and what they may do. `capabilities` is
 *  the INTERSECTION with the grant, never what the caller asked for. */
export interface VerifiedChallenge {
  readonly sourceInstallationId: string;
  readonly targetInstallationId: string;
  readonly generation: number;
  readonly capabilities: readonly PublishingCapability[];
}

export type ChallengeVerification =
  | { readonly ok: true; readonly verified: VerifiedChallenge }
  | { readonly ok: false; readonly reason: string };

/** @complexity O(1). */
function refuse(reason: string): ChallengeVerification {
  return { ok: false, reason };
}

/**
 * Verifies a challenge response against a grant.
 *
 * ORDER MATTERS: the nonce is consumed FIRST, before any other check. A nonce spent on a failed
 * attempt is gone — an attacker cannot use a rejected request to keep a nonce alive for another
 * try, and cannot probe which later check would have failed without burning a fresh nonce each
 * time.
 *
 * @returns The verified identity and its capability intersection, or a reason. Never throws.
 * @complexity O(n) in the grant's key count plus one Ed25519 verification.
 */
export async function verifyChallengeResponse(
  deps: { store: PublishChallengeStorePort; clock: { nowIso(): string } },
  input: {
    grant: PublishTrustGrant;
    targetInstallationId: string;
    response: PublishChallengeResponse;
  }
): Promise<ChallengeVerification> {
  const { response, grant } = input;
  if (typeof response?.nonce !== "string" || response.nonce === "") return refuse("no nonce supplied");

  // FIRST, and unconditionally — see this function's doc.
  const issued = await deps.store.takeOnce(response.nonce);
  if (!issued) return refuse("nonce is unknown or was already used");

  const nowIso = deps.clock.nowIso();
  const now = Date.parse(nowIso);
  if (Number.isNaN(now) || now >= Date.parse(issued.expiresAtIso)) return refuse("nonce has expired");

  if (issued.targetInstallationId !== input.targetInstallationId) return refuse("nonce was issued for another destination");
  if (!isGrantActive(grant, nowIso)) return refuse("the publishing grant has expired or been revoked");
  if (response.sourceInstallationId !== grant.sourceInstallationId) {
    return refuse("the response names an installation this grant is not for");
  }

  if (!Array.isArray(response.capabilities) || response.capabilities.length === 0) {
    return refuse("no capabilities requested");
  }
  // Intersect, do not accept: a caller asking for something the grant does not hold is refused
  // outright rather than quietly narrowed, so a widening attempt is visible in the log.
  for (const capability of response.capabilities) {
    if (!grantAllowsCapability(grant, capability)) return refuse(`'${String(capability)}' is outside this grant`);
  }

  const key = grant.publicKeys.find((candidate) => candidate.generation === response.generation);
  if (!key) return refuse("no accepted public key for the claimed generation");

  if (typeof response.signatureB64u !== "string" || response.signatureB64u === "") {
    return refuse("the response carries no signature");
  }
  const message = buildChallengeMessage({
    nonce: response.nonce,
    targetInstallationId: input.targetInstallationId,
    sourceInstallationId: response.sourceInstallationId,
    generation: response.generation,
    capabilities: response.capabilities,
  });
  if (!verifyPublishSignature({ publicKeyB64u: key.publicKeyB64u, message, signatureB64u: response.signatureB64u })) {
    return refuse("signature verification failed");
  }

  return {
    ok: true,
    verified: {
      sourceInstallationId: response.sourceInstallationId,
      targetInstallationId: input.targetInstallationId,
      generation: response.generation,
      capabilities: response.capabilities as readonly PublishingCapability[],
    },
  };
}

/**
 * In-memory {@link PublishChallengeStorePort} — the ADR-006 rule-of-two second adapter, and the one
 * a single-process install actually runs on (a nonce outliving a restart is not a requirement:
 * {@link CHALLENGE_TTL_MS} is a minute, and the source simply asks for another).
 *
 * Expired records are swept on write so an unanswered-challenge flood cannot grow the map without
 * bound — the destination issues nonces to unauthenticated callers, so this is a reachable path.
 */
export class InMemoryPublishChallengeStore implements PublishChallengeStorePort {
  private readonly records = new Map<string, PublishChallengeRecord>();

  constructor(private readonly clock: { nowIso(): string }) {}

  /** @complexity O(n) in the stored record count (the sweep), bounded by the TTL window. */
  async put(record: PublishChallengeRecord): Promise<void> {
    const now = Date.parse(this.clock.nowIso());
    for (const [nonce, existing] of this.records) {
      if (Date.parse(existing.expiresAtIso) <= now) this.records.delete(nonce);
    }
    this.records.set(record.nonce, record);
  }

  /** @complexity O(1). Deletes as it reads — see {@link PublishChallengeStorePort.takeOnce}. */
  async takeOnce(nonce: string): Promise<PublishChallengeRecord | null> {
    const record = this.records.get(nonce) ?? null;
    if (record) this.records.delete(nonce);
    return record;
  }
}
