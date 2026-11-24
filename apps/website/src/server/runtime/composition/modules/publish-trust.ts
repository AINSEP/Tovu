import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import type { Express } from "express";
import type { RateLimitProfile } from "@jini-ai/core/contracts/site/http-kit-rate-limit";
import type { KeyringPort } from "@jini-ai/integrations/webhooks";
import {
  publishTrustChallengeRoute,
  publishTrustIdentityRoute,
  publishTrustSessionRoute,
  type PublishTrustHandshakeBaseDeps,
  type PublishTrustHandshakeCopy,
} from "@jini-ai/cms/public-http/routes/publish-trust/handshake";

import { describeErrorForLog } from "#src/contracts/core/model-facing-tool-errors";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { issuePublishChallenge, verifyChallengeResponse, type PublishChallengeResponse, type PublishChallengeStorePort } from "#src/features/publish-trust/challenge";
import { isGrantActive, type PublishTrustGrant } from "#src/features/publish-trust/grant";
import { findGrantForSource, type PublishTrustResolution } from "#src/features/publish-trust/provisioning";
import { mintPublishSession } from "#src/features/publish-trust/session";
import { isNoSiteKeyError } from "#src/features/webhooks/keyring.env";
import { mountPublicJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";

/**
 * @file Registers the zero-setup publishing handshake (`@jini-ai/cms` publish-trust specs) and binds
 * this host's policy into them: the per-IP ceiling, the refusal copy, the redacting failure log, and
 * the trust decisions (`features/publish-trust/*`). Design note:
 * `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`.
 */

/** Per-IP ceiling for the two state-changing handshake routes. Generous next to a real publish
 *  (one challenge plus one session per publish), tight next to a flood. */
const PUBLISH_TRUST_HANDSHAKE_PER_IP: RateLimitProfile = {
  windowSeconds: 60,
  max: 30,
  burst: 10,
};

/** The flat refusal every handshake rejection sends, the keyless answer, and any other failure.
 *  Fixed text: the real error goes to the server log only. */
const HANDSHAKE_COPY: PublishTrustHandshakeCopy = {
  refused: { error: "the publishing handshake was refused", code: "UNAUTHENTICATED" },
  noSiteKey: {
    error: "This site has no usable Site key yet, so it cannot accept publishes. Set one up on this site first.",
    code: "SECRET_STORE_UNCONFIGURED",
  },
  failed: { error: "the publishing handshake failed", code: "INTERNAL_ERROR" },
};

/** What `mintPublishSession` mints from: the verified claims and this install's id. */
type MintInput = Parameters<typeof mintPublishSession>[0]["input"];

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

/** The deps all three specs share, built once per registration so the id derivation is awaited
 *  (and, on failure, logged) once. @complexity O(1). */
function handshakeBaseDeps({ deps }: { deps: PublishTrustHandshakeDeps }, _optional: Record<string, never> = {}): PublishTrustHandshakeBaseDeps {
  const targetInstallationId = deps.targetInstallationId.catch((error: unknown) => {
    // A site without a configured key is an ordinary state, not a boot failure.
    if (isNoSiteKeyError({ error })) return null;
    console.error("[publish-trust] Could not derive the site's publishing identity for the handshake:",
      describeErrorForLog({ err: error }));
    return null;
  });
  return {
    installationId: () => targetInstallationId,
    copy: HANDSHAKE_COPY,
    logFailure: ({ method, path, error }) => {
      console.error(`[publish-trust] handshake ${method} ${path} failed:`, formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS));
    },
  };
}

/**
 * Registers `GET /identity`, `POST /challenge` and `POST /session` under `/api/publish-trust/v1`.
 * One limiter serves challenge and session, keyed on the client address, as before.
 *
 * @complexity O(1) per request — see each spec.
 */
export function registerPublishTrustHandshakeRoutes({ app, deps }: { app: Express; deps: PublishTrustHandshakeDeps }, _optional: Record<string, never> = {}): void {
  const base = handshakeBaseDeps({ deps });
  const limiter = createRateLimiter({
    profile: PUBLISH_TRUST_HANDSHAKE_PER_IP,
    clock: { nowMs: () => Date.parse(deps.clock.nowIso()) },
  });
  // Unreachable in practice: every handler answers its own fixed 500; this copy only covers a
  // failure in the request-facts port before the spec runs.
  const failure = { operation: "publish-trust:handshake", visitorError: HANDSHAKE_COPY.failed.error };
  mountPublicJsonRoute({ app, spec: publishTrustIdentityRoute, deps: { ...base, workspaceId: deps.workspaceId }, failure });
  mountPublicJsonRoute({ app, spec: publishTrustChallengeRoute, failure, deps: {
    ...base, limiter,
    issueChallenge: ({ targetInstallationId }) => issuePublishChallenge({ store: deps.challengeStore, clock: deps.clock, idGen: deps.idGen, targetInstallationId }),
  } });
  mountPublicJsonRoute({ app, spec: publishTrustSessionRoute, failure, deps: {
    ...base, limiter,
    findGrant: async ({ sourceInstallationId }) => findGrantForSource({ res: await deps.grants(), sourceInstallationId }),
    // The parameters name this host's own grant and capability types: the spec hands back exactly the
    // grant `findGrant` answered and the claims `verifyResponse` verified.
    isGrantActive: ({ grant }: { grant: PublishTrustGrant }) => isGrantActive({ grant, nowIso: deps.clock.nowIso() }),
    verifyResponse: (input: { grant: PublishTrustGrant; targetInstallationId: string; response: PublishChallengeResponse }) =>
      verifyChallengeResponse({ deps: { store: deps.challengeStore, clock: deps.clock }, input }),
    mintSession: (input: MintInput) => mintPublishSession({ deps: { keyring: deps.keyring, workspaceId: deps.workspaceId, clock: deps.clock }, input }),
  } });
}
