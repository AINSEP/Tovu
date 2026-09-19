import type { Express, Request, Response } from "express";

import { createRateLimiter, resolveClientIp, type RateLimitProfile } from "#src/contracts/core/rate-limit/rate-limit";
import {
  issuePublishChallenge,
  verifyChallengeResponse,
  type PublishChallengeResponse,
  type PublishChallengeStorePort,
} from "#src/features/publish-trust/challenge";
import { isGrantActive } from "#src/features/publish-trust/grant";
import { findGrantForSource, type PublishTrustResolution } from "#src/features/publish-trust/provisioning";
import { mintPublishSession } from "#src/features/publish-trust/session";
import type { KeyringPort } from "#src/features/webhooks/index";

/**
 * @file Zero-setup publishing auth — the destination's three unauthenticated handshake routes.
 * Design note: `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`.
 *
 * These sit OUTSIDE `/api/admin`, and therefore outside `requireAdminSession`, because a source
 * that has not yet proved anything has no credential to present. That is the whole point: the user
 * never mints, copies or pastes one.
 *
 * ## What `GET .../identity` discloses, and why that is acceptable
 *
 * Three fields, to anyone who asks:
 *
 * - `installationId` — derived from this install's root key through HKDF. It is not a secret and
 *   was never treated as one: it is published inside the grant, which lives in committed deploy
 *   config by design. It is one-way — it identifies this install without revealing the key it came
 *   from — and possessing it grants nothing, because every credential is checked by signature.
 * - `workspaceId` — already present in the path of every admin URL this site serves.
 * - `origin` — the caller just connected to it.
 *
 * So the route reveals nothing a caller did not already have or could not already see. What it
 * deliberately does NOT reveal is anything about the grant: not whether one is configured, not the
 * source installation it names, and not its public keys. Without that, the route cannot be used to
 * enumerate who is allowed to publish here, or to tell a site that has been paired from one that
 * has not. It exists for exactly one reason — so the source learns this destination's identity
 * without a human reading a workspace id off a screen and typing it somewhere.
 *
 * A destination restored from a backup derives a DIFFERENT installation id (its root key changed),
 * and the source is expected to notice that change loudly rather than publish into a stranger.
 *
 * ## Flood resistance
 *
 * `challenge` mints state for an unauthenticated caller, so it is rate limited per client IP and
 * the store sweeps expired records on every write. `session` is limited on the same key: it runs an
 * Ed25519 verification, which is cheap but not free, and an unbounded caller should not be able to
 * choose how much of it this process does.
 */

/** Per-IP ceiling for the two state-changing handshake routes. Generous next to a real publish
 *  (one challenge plus one session per publish), tight next to a flood. */
const PUBLISH_TRUST_HANDSHAKE_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 30,
  burst: 10,
};

/** The flat refusal every handshake rejection sends. Identical wording in every case on purpose:
 *  "unknown nonce" and "expired nonce" must not be distinguishable, and neither must "no grant
 *  configured" and "a grant that is not yours". The real reason goes to the server's own log. */
const HANDSHAKE_REFUSAL = { error: "the publishing handshake was refused", code: "UNAUTHENTICATED" } as const;

/** Everything the handshake needs. `targetInstallationId` is this install's own derived id,
 *  resolved once at composition rather than per request. */
export interface PublishTrustHandshakeDeps {
  readonly keyring: KeyringPort;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly idGen: { newId(): string };
  readonly challengeStore: PublishChallengeStorePort;
  readonly targetInstallationId: Promise<string>;
  /** The grants this install currently accepts. Any state but `configured` carries none. */
  readonly grants: () => Promise<PublishTrustResolution>;
}

/** This site's own origin as the caller reached it. Built from the request rather than configured,
 *  so a site behind one hostname in dev and another in production needs no second setting.
 *  @complexity O(1). */
function originOf(req: Request): string {
  const host = req.get("host") ?? "";
  return host === "" ? "" : `${req.protocol}://${host}`;
}

/**
 * Narrows an untrusted request body to the challenge-response shape.
 *
 * Shape only — nothing here is a trust decision. `verifyChallengeResponse` re-checks every field
 * against the grant and the signature, and is fail-closed on all of them; this exists so a body
 * with a wrong-typed field produces a refusal rather than reaching the verifier as `undefined`.
 *
 * @complexity O(1).
 */
function asChallengeResponse(body: unknown): PublishChallengeResponse | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.nonce !== "string") return null;
  if (typeof candidate.sourceInstallationId !== "string") return null;
  if (typeof candidate.generation !== "number" || !Number.isInteger(candidate.generation)) return null;
  if (!Array.isArray(candidate.capabilities) || candidate.capabilities.some((c) => typeof c !== "string")) return null;
  if (typeof candidate.signatureB64u !== "string") return null;
  return {
    nonce: candidate.nonce,
    sourceInstallationId: candidate.sourceInstallationId,
    generation: candidate.generation,
    capabilities: candidate.capabilities as readonly string[],
    signatureB64u: candidate.signatureB64u,
  };
}

/**
 * Registers `GET /identity`, `POST /challenge` and `POST /session` under `/api/publish-trust/v1`.
 *
 * @complexity O(1) per request — see each handler.
 */
export function registerPublishTrustHandshakeRoutes(app: Express, deps: PublishTrustHandshakeDeps): void {
  const limiter = createRateLimiter({ profile: PUBLISH_TRUST_HANDSHAKE_PER_IP, clock: { nowIso: () => deps.clock.nowIso() } });

  /** True when this caller is within its per-IP ceiling; on `false` the 429 has already been sent. */
  function withinRateLimit(req: Request, res: Response): boolean {
    const result = limiter.check(resolveClientIp(req));
    if (result.allowed) return true;
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).json({
      error: "too many publishing handshake attempts",
      code: "RATE_LIMIT_EXCEEDED",
      details: { retryAfterSeconds: result.retryAfterSeconds },
    });
    return false;
  }

  app.get("/api/publish-trust/v1/identity", async (req, res) => {
    res.json({
      installationId: await deps.targetInstallationId,
      workspaceId: deps.workspaceId,
      origin: originOf(req),
    });
  });

  app.post("/api/publish-trust/v1/challenge", async (req, res) => {
    if (!withinRateLimit(req, res)) return;

    const record = await issuePublishChallenge({
      store: deps.challengeStore,
      clock: deps.clock,
      idGen: deps.idGen,
      targetInstallationId: await deps.targetInstallationId,
    });

    // The audience travels with the nonce so the source can build the canonical string without a
    // second round trip. It is not a secret and is the same value `/identity` already states.
    res.json({
      nonce: record.nonce,
      targetInstallationId: record.targetInstallationId,
      expiresAt: record.expiresAtIso,
    });
  });

  app.post("/api/publish-trust/v1/session", async (req, res) => {
    if (!withinRateLimit(req, res)) return;

    const response = asChallengeResponse(req.body);
    if (!response) {
      res.status(401).json(HANDSHAKE_REFUSAL);
      return;
    }

    const grant = findGrantForSource(await deps.grants(), response.sourceInstallationId);
    // An absent grant is the ordinary state of a site nobody has paired with, not an error. It is
    // answered with the same refusal as a bad signature so this route cannot be used to ask
    // "has anyone provisioned publishing here yet?" — nor, by naming installation ids one at a
    // time, "is THIS publisher allowed here?".
    if (!grant || !isGrantActive(grant, deps.clock.nowIso())) {
      res.status(401).json(HANDSHAKE_REFUSAL);
      return;
    }

    const targetInstallationId = await deps.targetInstallationId;
    const verification = await verifyChallengeResponse(
      { store: deps.challengeStore, clock: deps.clock },
      { grant, targetInstallationId, response }
    );
    if (!verification.ok) {
      res.status(401).json(HANDSHAKE_REFUSAL);
      return;
    }

    const { token, payload } = await mintPublishSession(
      { keyring: deps.keyring, workspaceId: deps.workspaceId, clock: deps.clock },
      {
        sourceInstallationId: verification.verified.sourceInstallationId,
        targetInstallationId,
        capabilities: verification.verified.capabilities,
        generation: verification.verified.generation,
      }
    );

    res.json({ token, expiresAt: payload.expiresAtIso, capabilities: payload.capabilities });
  });
}
