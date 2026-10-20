import { createHmac, timingSafeEqual } from "node:crypto";

import type { PublishingCapability } from "./grant.js";
import type { KeyringPort } from "#src/features/webhooks/index";

/**
 * @file Zero-setup publishing auth — the short-lived publishing session.
 * Design note: `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`.
 *
 * After a source proves possession (`challenge.ts`), the destination hands back a token so the
 * remaining calls of one publish do not each need a signature round trip.
 *
 * NO NEW KEY HERE EITHER. The token is HMAC'd under a secret derived from the DESTINATION's own
 * site key — the same "site key" that install already has — through the same `KeyringPort.derive`
 * seam, under its own `purpose` so it is domain-separated from the signing-key derivation. Nothing
 * is minted, stored or shown; a restart or a site key regeneration simply invalidates outstanding
 * sessions, which for a minutes-long credential is the correct behavior rather than a problem.
 *
 * WHAT THE TOKEN IS NOT: it is not an admin credential and carries no route allowlist. The set of
 * reachable routes is owned by `grant.ts`'s `PUBLISH_TRUST_ROUTES` and checked at the middleware,
 * NOT carried in the token — deliberately, so no token can ever widen its own surface, and a route
 * added to this codebase tomorrow is unreachable until someone adds it to that list on purpose.
 */

/** HKDF `purpose` for the session HMAC key. Distinct from `keys.ts`'s purposes. */
const SESSION_KEY_PURPOSE = "publish-trust-session-key";

/** Payload format version, authenticated by the HMAC. */
const SESSION_PAYLOAD_VERSION = 1;

/** How long a minted session stays valid. Short enough that target-side revocation (dropping the
 *  grant from config) takes effect within one session lifetime. */
export const SESSION_TTL_MS = 10 * 60_000;

/** What a verified session asserts. */
export interface PublishSessionPayload {
  readonly v: number;
  /** Stable publishing identity — what `publish_content_baselines.peerPrincipalId` ends up holding,
   *  so rotation does not reset baselines. */
  readonly sourceInstallationId: string;
  /** The audience: the destination this token is for, and ONLY this one. */
  readonly targetInstallationId: string;
  /** The destination workspace this token may touch. */
  readonly workspaceId: string;
  readonly capabilities: readonly PublishingCapability[];
  /** Rotation generation — audit metadata, never identity. */
  readonly generation: number;
  readonly expiresAtIso: string;
}

export type PublishSessionVerification =
  | { readonly ok: true; readonly payload: PublishSessionPayload }
  | { readonly ok: false; readonly reason: string };

/** @complexity O(1). */
function refuse(reason: string): PublishSessionVerification {
  return { ok: false, reason };
}

/** @complexity O(1) plus one HKDF. */
async function sessionKey(deps: { keyring: KeyringPort; workspaceId: string }): Promise<Buffer> {
  const material = await deps.keyring.derive({
    workspaceId: deps.workspaceId as never,
    purpose: SESSION_KEY_PURPOSE,
    info: "session-hmac",
  });
  return Buffer.from(material);
}

/** @complexity O(n) in the payload length. */
function macOf(key: Buffer, encodedPayload: string): string {
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

/**
 * Mints a session token for an already-verified challenge.
 *
 * @returns `<base64url payload>.<base64url hmac>`. Opaque to the holder: it carries no secret, and
 *   editing any field invalidates the MAC.
 * @complexity O(n) in the payload length, plus one HKDF and one HMAC.
 */
export async function mintPublishSession(
  deps: { keyring: KeyringPort; workspaceId: string; clock: { nowIso(): string } },
  input: {
    sourceInstallationId: string;
    targetInstallationId: string;
    capabilities: readonly PublishingCapability[];
    generation: number;
  }
): Promise<{ token: string; payload: PublishSessionPayload }> {
  const payload: PublishSessionPayload = {
    v: SESSION_PAYLOAD_VERSION,
    sourceInstallationId: input.sourceInstallationId,
    targetInstallationId: input.targetInstallationId,
    workspaceId: deps.workspaceId,
    capabilities: input.capabilities,
    generation: input.generation,
    expiresAtIso: new Date(Date.parse(deps.clock.nowIso()) + SESSION_TTL_MS).toISOString(),
  };

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const key = await sessionKey(deps);
  return { token: `${encoded}.${macOf(key, encoded)}`, payload };
}

/**
 * Splits a presented token into its two non-empty halves, or names the format check it fails.
 * Pure and key-free: it runs BEFORE any key is derived, so junk tokens cost no HKDF.
 *
 * @complexity O(n) in the token length.
 */
function splitToken(token: unknown): { encoded: string; presentedMac: string } | string {
  if (typeof token !== "string" || token === "") return "no session token supplied";

  const parts = token.split(".");
  if (parts.length !== 2 || parts[0] === "" || parts[1] === "") return "malformed session token";
  const [encoded, presentedMac] = parts;
  return { encoded, presentedMac };
}

/**
 * True when `presentedMac` is the MAC of `encoded` under `key`.
 *
 * Compared with {@link timingSafeEqual} — an early-exit string compare on a MAC is a byte-at-a-time
 * forgery oracle. The length guard comes first because `timingSafeEqual` throws on unequal lengths.
 *
 * @complexity O(n) in the payload length, plus one HMAC.
 */
function macMatches({ key, encoded, presentedMac }: { key: Buffer; encoded: string; presentedMac: string }): boolean {
  const expectedMac = macOf(key, encoded);
  const presented = Buffer.from(presentedMac, "base64url");
  const expected = Buffer.from(expectedMac, "base64url");
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/**
 * Decodes an AUTHENTICATED payload and checks its format version. Only ever called after
 * {@link macMatches}, so nothing here parses bytes the MAC has not vouched for.
 *
 * @complexity O(n) in the payload length.
 */
function decodePayload(encoded: string): PublishSessionPayload | string {
  let payload: PublishSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PublishSessionPayload;
  } catch {
    return "session token payload is not JSON";
  }
  if (typeof payload !== "object" || payload === null) return "session token payload is not an object";
  if (payload.v !== SESSION_PAYLOAD_VERSION) return `unsupported session token version ${String(payload.v)}`;
  return payload;
}

/**
 * Names the first claim of a decoded payload that THIS install must refuse — expiry, then audience,
 * then workspace — or `null` when every claim holds.
 *
 * The audience is checked against THIS install: a token minted for another destination is refused
 * even though its MAC is, from that destination's point of view, perfectly valid.
 *
 * @complexity O(1).
 */
function claimRefusal({ payload, nowIso, expectedAudience, workspaceId }: {
  payload: PublishSessionPayload;
  nowIso: string;
  expectedAudience: string;
  workspaceId: string;
}): string | null {
  const now = Date.parse(nowIso);
  if (Number.isNaN(now) || typeof payload.expiresAtIso !== "string" || Number.isNaN(Date.parse(payload.expiresAtIso))) {
    return "session token has no usable expiry";
  }
  if (now >= Date.parse(payload.expiresAtIso)) return "session token has expired";

  if (payload.targetInstallationId !== expectedAudience) return "session token was minted for another destination";
  if (payload.workspaceId !== workspaceId) return "session token was minted for another workspace";
  return null;
}

/**
 * Verifies a session token.
 *
 * THE MAC IS CHECKED BEFORE THE PAYLOAD IS PARSED AS ANYTHING MEANINGFUL (constant-time — see
 * {@link macMatches}); the claims, audience included, only after that (see {@link claimRefusal}).
 *
 * @param expectedAudience - This destination's own installation id.
 * @returns The payload, or a reason. Never throws, for any input.
 * @complexity O(n) in the token length, plus one HKDF and one HMAC.
 */
export async function verifyPublishSession(
  deps: { keyring: KeyringPort; workspaceId: string; clock: { nowIso(): string } },
  input: { token: string; expectedAudience: string }
): Promise<PublishSessionVerification> {
  const split = splitToken(input.token);
  if (typeof split === "string") return refuse(split);

  const key = await sessionKey(deps);
  if (!macMatches({ key, ...split })) return refuse("session token signature is invalid");

  const payload = decodePayload(split.encoded);
  if (typeof payload === "string") return refuse(payload);

  const refusal = claimRefusal({
    payload,
    nowIso: deps.clock.nowIso(),
    expectedAudience: input.expectedAudience,
    workspaceId: deps.workspaceId,
  });
  if (refusal !== null) return refuse(refusal);

  return { ok: true, payload };
}
