import type { Request, Response } from "express";
import type { RouteRequestFacts } from "@jini-ai/core/contracts/server";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";

import { captureRequestFacts } from "#src/platform/express/request-facts";

import { getAuthedCredentialKind, type AuthCredentialKind, type CredentialKindForbiddenBody, type OperatorPrincipalRecord } from "./dev-auth.js";
import { getPublishTrustContext, type PublishTrustContext } from "./publish-trust-auth.js";
import { isLocalAdminRequest } from "./local-admin-request.js";

/**
 * @file How an admin request authenticated, for Jini route specs mounted through the admin ports
 * (w3-rtfnd T3/T4), and the request facts (client address, User-Agent, Host) every Tovu mount
 * resolves for a spec that opts in (T2). A spec never sees Express: the ports record these facts while `authenticate`
 * reads the session, keyed on that request's own principal copy, and the composition binds
 * {@link adminRequestFactsFor} into the spec's deps. Composition only; nothing here leaves Tovu.
 */

/** The authentication facts of one admin request. */
export interface AdminRequestFacts {
  /** `res.locals.authCredentialKind`, as `getAuthedCredentialKind` reads it. */
  readonly credentialKind: AuthCredentialKind;
  /** The publish-trust grant `requirePublishTrust` attached, or `null` (the normal case). */
  readonly publishTrust: PublishTrustContext | null;
  /** `isLocalAdminRequest` for this request (loopback sockets, no forwarding headers, a local Host and
   *  matching Origin) — credential-copy's local-host gate. Computed only when read, and not enumerable,
   *  so a spec that answers its facts as JSON keeps its wire. */
  readonly localAdmin: boolean;
}

/** The `sessionCredentialOnly` mount option: the wording and permission the 403 body names. */
export interface SessionCredentialGate { readonly message: string; readonly permission: string }

type RecordedFacts = { readonly credentialKind: AuthCredentialKind | undefined; readonly publishTrust: PublishTrustContext | null; readonly req: Request | undefined };

// Keyed on the per-request principal copy `authenticate` returns, exactly like the ports'
// `publishTrustByContext`: a request's facts die with its context and are never shared across requests.
const factsByContext = new WeakMap<OperatorPrincipalRecord, RecordedFacts>();

const MISSING_FACTS = "adminRequestFactsFor: no admin request facts for this context — requireAdminSession must run before this route";

/** Record the request's authentication facts against its principal copy (called by `authenticate`).
 * The kind is read leniently here and checked on read, so a route that never asks keeps its old wire.
 * @complexity O(1). */
export function recordAdminRequestFacts({ principal, res }: { principal: OperatorPrincipalRecord; res: Response }, _optional: Record<string, never> = {}): void {
  factsByContext.set(principal, { credentialKind: res.locals.authCredentialKind as AuthCredentialKind | undefined, publishTrust: getPublishTrustContext(res), req: res.req });
}

/** The facts of the request a spec is handling, read through its `context`.
 * @throws When the ports never authenticated this context or the session layer recorded no kind —
 *   a wiring bug, the same contract as `getAuthedCredentialKind`; the mount answers its redacted 500.
 * @complexity O(1).
 * @example const { credentialKind } = deps.requestFacts({ context });
 */
export function adminRequestFactsFor({ context }: { context: OperatorPrincipalRecord | undefined }, _optional: Record<string, never> = {}): AdminRequestFacts {
  const facts = context ? factsByContext.get(context) : undefined;
  if (!facts?.credentialKind) throw new Error(MISSING_FACTS);
  const { req } = facts;
  // Lazy: the socket/header inspection runs only for a route that asks (credential-copy).
  return Object.defineProperty({ credentialKind: facts.credentialKind, publishTrust: facts.publishTrust }, "localAdmin", {
    enumerable: false, get: () => req !== undefined && isLocalAdminRequest({ req }),
  }) as AdminRequestFacts;
}

/** Only the publish-trust grant of the request a spec is handling — for a route that never reads the
 * credential kind (publish-content capabilities), so a request whose session layer recorded no kind
 * still answers from its grant instead of the redacted 500 `adminRequestFactsFor` gives it.
 * @throws When the ports never authenticated this context (a wiring bug, same message).
 * @complexity O(1).
 */
export function adminPublishTrustFor({ context }: { context: OperatorPrincipalRecord | undefined }, _optional: Record<string, never> = {}): PublishTrustContext | null {
  const facts = context ? factsByContext.get(context) : undefined;
  if (!facts) throw new Error(MISSING_FACTS);
  return facts.publishTrust;
}

/** The port form of `rejectUnlessSessionCredential`: same rule, same 403 body, thrown as a refusal so
 * the mount's error port writes it before parse, authorization or any side effect.
 * @complexity O(1). */
export function refuseUnlessSessionCredential({ res, gate }: { res: Response; gate: SessionCredentialGate }, _optional: Record<string, never> = {}): void {
  if (getAuthedCredentialKind(res) === "session") return;
  const body: CredentialKindForbiddenBody = { error: gate.message, code: "FORBIDDEN", details: { permission: gate.permission, reason: "credential_kind_not_permitted" } };
  throw new RouteRefusalError({ status: 403, body });
}

/** The host's `requestFacts` port, bound on every Tovu mount (admin and public, JSON and raw) and
 * consulted only for a spec that opts in. `clientAddress` is the same trust-proxy answer the Jini
 * frontend hooks get (`captureRequestFacts` → `resolveClientIp`); `host` is `req.get("host")` as
 * publish-trust's `originOf` reads it, and `protocol` is `req.protocol` (trust-proxy aware) for the same
 * origin. An absent header leaves its key out.
 * @complexity O(1).
 */
export function routeRequestFactsFor({ req }: { req: Request }, _optional: Record<string, never> = {}): RouteRequestFacts {
  const userAgent = req.get("user-agent");
  const host = req.get("host");
  return { clientAddress: captureRequestFacts({ req }).clientAddress, ...(userAgent === undefined ? {} : { userAgent }), ...(host === undefined ? {} : { host }), protocol: req.protocol };
}
