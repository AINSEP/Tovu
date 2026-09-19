import type { HttpClientPort } from "#src/platform/http/index";
import type { KeyringPort } from "#src/features/webhooks/index";

import { buildChallengeMessage } from "./challenge.js";
import { PUBLISHING_CAPABILITIES, type PublishingCapability } from "./grant.js";
import { deriveInstallationId, derivePublishSigningKey } from "./keys.js";

/**
 * @file Zero-setup publishing auth — the SOURCE's half of the handshake.
 * Design note: `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`.
 *
 * The mirror of `server/inbound/public-http/routes/publish-trust/handshake.ts`: that file is what a
 * destination answers, this one is what a source asks. Three calls, no stored credential:
 *
 * 1. `GET /identity` — learn who the destination is. This is what removes "type your workspace id"
 *    from the flow: the source reads the destination's own answer instead of the owner reading it
 *    off a screen.
 * 2. `POST /challenge` — take a single-use nonce.
 * 3. `POST /session` — sign the nonce with the key DERIVED from this install's Site Token and
 *    exchange the signature for a short-lived session token.
 *
 * ## Nothing here is stored, displayed or copied
 *
 * The signing key is derived per call by {@link derivePublishSigningKey} and dies with the
 * function's stack frame; the session token lives for minutes and never leaves the process except
 * as one `Authorization` header. There is no field on any type in this file that a UI could render
 * as "your key", which is the property the whole feature exists to hold.
 *
 * ## Every message in this file is written for a person
 *
 * A refusal on this path reaches the owner in a dialog, so {@link PublishTrustHandshakeError}
 * carries a sentence, never a protocol reason. In particular the destination's own internal
 * "no accepted public key for the claimed generation" is never surfaced — the destination refuses
 * every handshake failure identically anyway, so the source cannot tell those cases apart and must
 * not pretend to. `not-connected` is the one that matters: it means "deploy once", and saying that
 * is the difference between a working flow and a support request.
 */

/** Where the destination's handshake routes live. Must match `handshake.ts`'s own mount path. */
export const PUBLISH_TRUST_HANDSHAKE_BASE = "/api/publish-trust/v1";

/**
 * The rotation generation this source signs with.
 *
 * A constant, not a setting: rotation here is a counter, and the counter only ever moves when the
 * Site Token itself is regenerated — at which point the DERIVED key changes anyway, so bumping the
 * generation would buy nothing and would strand the grant that names generation 1. It exists as a
 * named constant so the grant writer and the signer cannot disagree about it.
 */
export const PUBLISH_TRUST_GENERATION = 1;

/** Per-call timeout for a handshake leg. Far shorter than a bundle upload: these are three small
 *  JSON round trips, and a wedged destination must not hold an admin request open. */
export const HANDSHAKE_TIMEOUT_MS = 15_000;

/** How much of a destination's response body an error may quote. Bounded because it is another
 *  process's output. Only ever used for the "this is not a Tovu site" diagnosis, never for a
 *  refusal — a refusal's wording is this file's, so it cannot leak the destination's vocabulary. */
const MAX_QUOTED_BODY = 200;

/** What went wrong, as a class an admin surface can act on differently. */
export type PublishTrustHandshakeFailure =
  /** The host did not answer at all, or egress refused the address. */
  | "unreachable"
  /** Something answered, but not a Tovu site's handshake routes. */
  | "not-a-tovu-site"
  /** The site answered correctly and does not accept publishes from this computer (yet). */
  | "not-connected"
  /** The site answered, but not in a way this source can use. */
  | "refused";

/** A handshake failure. `message` is written for the owner and contains no key material, no
 *  identifier and no error code — see this file's header. */
export class PublishTrustHandshakeError extends Error {
  readonly failure: PublishTrustHandshakeFailure;

  constructor(message: string, failure: PublishTrustHandshakeFailure) {
    super(message);
    this.name = "PublishTrustHandshakeError";
    this.failure = failure;
  }
}

/** What a destination says about itself. Not secret — see `handshake.ts`'s header for the reasoning
 *  on each field. */
export interface DestinationIdentity {
  readonly installationId: string;
  /** The destination's OWN workspace id — what every publish URL to it is built from. */
  readonly workspaceId: string;
  /** The origin as the destination saw the request arrive on. */
  readonly origin: string;
}

/** A minted publishing session. `token` is the wire credential for exactly one publish run. */
export interface PublishSession {
  readonly token: string;
  readonly expiresAt: string;
  readonly capabilities: readonly PublishingCapability[];
  /** Who answered. Carried out so a caller can compare it against what it connected to. */
  readonly identity: DestinationIdentity;
}

export interface HandshakeClientDeps {
  /** The guarded ADR-038 egress client — the same one peer pushes go through, so the SSRF policy
   *  is identical on both paths and there is no second HTTP seam to configure. */
  readonly httpClient: HttpClientPort;
}

/** The host part of a base URL, for a message a person reads. Falls back to the whole string when
 *  it somehow does not parse (it is normalized before it reaches here).
 *  @complexity O(n) in the URL length. */
function siteNameOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * One handshake call, with every failure already turned into a sentence.
 *
 * @returns The parsed JSON body.
 * @throws {PublishTrustHandshakeError} for every failure — this function never lets a raw transport
 * error or a destination's own wording escape.
 * @complexity O(1) plus one round trip and one JSON parse.
 */
async function callHandshake(
  deps: HandshakeClientDeps,
  request: { method: "GET" | "POST"; baseUrl: string; path: string; body?: unknown }
): Promise<Record<string, unknown>> {
  const site = siteNameOf(request.baseUrl);
  let response;
  try {
    response = await deps.httpClient.send({
      method: request.method,
      url: `${request.baseUrl}${PUBLISH_TRUST_HANDSHAKE_BASE}${request.path}`,
      headers: request.body === undefined ? {} : { "content-type": "application/json" },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      timeoutMs: HANDSHAKE_TIMEOUT_MS,
    });
  } catch (err) {
    throw new PublishTrustHandshakeError(
      `${site} could not be reached: ${err instanceof Error ? err.message : String(err)}`,
      "unreachable"
    );
  }

  if (response.status === 404) {
    throw new PublishTrustHandshakeError(
      `${site} answered, but it does not look like a Tovu site. Check the address.`,
      "not-a-tovu-site"
    );
  }
  if (response.status === 401) {
    // The destination refuses every handshake failure with one flat 401 on purpose, so this source
    // genuinely cannot tell "no grant here" from "bad signature" — and must not guess. The sentence
    // names the only action that resolves any of them.
    throw new PublishTrustHandshakeError(
      `${site} doesn't recognise this computer yet. Connect it, then deploy the site once.`,
      "not-connected"
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new PublishTrustHandshakeError(
      `${site} refused to set up publishing right now. Try again in a moment.`,
      "refused"
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.bodyText);
  } catch {
    throw new PublishTrustHandshakeError(
      `${site} answered, but it does not look like a Tovu site (${response.bodyText.slice(0, MAX_QUOTED_BODY)}).`,
      "not-a-tovu-site"
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new PublishTrustHandshakeError(
      `${site} answered, but it does not look like a Tovu site.`,
      "not-a-tovu-site"
    );
  }
  return parsed as Record<string, unknown>;
}

/**
 * Asks a destination who it is.
 *
 * This is the call that makes the flow zero-concept: `workspaceId` is the one value the old peer
 * form made a human find and retype, and the destination already knows it.
 *
 * @param input.baseUrl - A normalized `https` origin (`normalizePeerBaseUrl`'s output).
 * @throws {PublishTrustHandshakeError} `unreachable` / `not-a-tovu-site`.
 * @complexity O(1) plus one round trip.
 */
export async function fetchDestinationIdentity(
  deps: HandshakeClientDeps,
  input: { baseUrl: string }
): Promise<DestinationIdentity> {
  const body = await callHandshake(deps, { method: "GET", baseUrl: input.baseUrl, path: "/identity" });
  const { installationId, workspaceId, origin } = body;
  if (typeof installationId !== "string" || installationId === "" || typeof workspaceId !== "string" || workspaceId === "") {
    throw new PublishTrustHandshakeError(
      `${siteNameOf(input.baseUrl)} answered, but it does not look like a Tovu site.`,
      "not-a-tovu-site"
    );
  }
  return { installationId, workspaceId, origin: typeof origin === "string" ? origin : input.baseUrl };
}

/**
 * Proves possession of this install's Site Token to a destination and takes a publishing session.
 *
 * The private half of the signing key exists only inside this call: {@link derivePublishSigningKey}
 * rebuilds it from the Site Token, signs one nonce, and the closure is collected. Between two
 * publishes there is nothing on disk to steal, rotate or copy.
 *
 * `targetOrigin` in the derivation is `input.baseUrl` VERBATIM, and the grant written at connect
 * time must use the same string — a signature derived for one spelling of the destination verifies
 * against no other, which is the property that stops a captured response being replayed at a
 * different site (`keys.ts`).
 *
 * @param input.baseUrl - The destination, normalized. Also the key-derivation audience.
 * @param input.workspaceId - THIS install's workspace. Never the destination's: it selects which
 * Site Token derives the key.
 * @throws {PublishTrustHandshakeError} — every failure, already a sentence.
 * @complexity O(1) plus three round trips, two HKDFs and one Ed25519 signature.
 */
export async function openPublishSession(
  deps: HandshakeClientDeps & { readonly keyring: KeyringPort },
  input: { baseUrl: string; workspaceId: string; generation?: number }
): Promise<PublishSession> {
  const generation = input.generation ?? PUBLISH_TRUST_GENERATION;
  const identity = await fetchDestinationIdentity(deps, input);

  const challenge = await callHandshake(deps, { method: "POST", baseUrl: input.baseUrl, path: "/challenge", body: {} });
  const nonce = challenge.nonce;
  const targetInstallationId = challenge.targetInstallationId;
  if (typeof nonce !== "string" || nonce === "" || typeof targetInstallationId !== "string" || targetInstallationId === "") {
    throw new PublishTrustHandshakeError(
      `${siteNameOf(input.baseUrl)} answered, but it does not look like a Tovu site.`,
      "not-a-tovu-site"
    );
  }

  const sourceInstallationId = await deriveInstallationId({ keyring: deps.keyring, workspaceId: input.workspaceId });
  const signingKey = await derivePublishSigningKey({
    keyring: deps.keyring,
    workspaceId: input.workspaceId,
    sourceInstallationId,
    targetOrigin: input.baseUrl,
    generation,
  });

  const capabilities: readonly PublishingCapability[] = PUBLISHING_CAPABILITIES;
  const signatureB64u = signingKey.sign(
    buildChallengeMessage({ nonce, targetInstallationId, sourceInstallationId, generation, capabilities })
  );

  const minted = await callHandshake(deps, {
    method: "POST",
    baseUrl: input.baseUrl,
    path: "/session",
    body: { nonce, sourceInstallationId, generation, capabilities, signatureB64u },
  });
  const token = minted.token;
  if (typeof token !== "string" || token === "") {
    throw new PublishTrustHandshakeError(
      `${siteNameOf(input.baseUrl)} answered, but it does not look like a Tovu site.`,
      "not-a-tovu-site"
    );
  }

  return {
    token,
    expiresAt: typeof minted.expiresAt === "string" ? minted.expiresAt : "",
    capabilities: Array.isArray(minted.capabilities)
      ? (minted.capabilities.filter((c) => typeof c === "string") as PublishingCapability[])
      : capabilities,
    identity,
  };
}
