import type { PeerCallDeps } from "#src/features/publish-content/peer-transport";
import { planPublishToPeer } from "#src/features/publish-content/push-plan";
import type { Response } from "express";

import { pullAndStageFromPeer } from "#src/features/publish-content/pull";
// Pull ordering/identity rationale: features/publish-content/pull.ts; this route stops at staging.
import type { PublishScope } from "#src/features/publish-content/ui/contract";
import {
  confirmPeerImport,
  executePeerImport,
  PublishContentPeerTransportError,
} from "#src/features/publish-content/peer-transport";
import { resolvePublishDestinationCredential } from "#src/features/publish-content/destination-credential";
import {
  PublishContentPeerCredentialMissingError,
  PublishContentPeerNotFoundError,
  PublishContentPeerSecretStoreUnconfiguredError,
} from "#src/features/publish-content/peers";
import { PublishTrustHandshakeError } from "#src/features/publish-trust/handshake-client";
import {
  canPublishToLive,
  PUBLISH_FROM_LIVE_SITE_CODE,
  PUBLISH_FROM_LIVE_SITE_ERROR,
} from "#src/features/publish-content/live-site-policy";
import { rejectUnlessSessionCredential } from "#src/server/inbound/admin-http/dev-auth";

import { toPublishContentDeps, type PublishContentRouteDeps, type PublishContentRouteRegistrar } from "./deps.js";
import {
  acceptOverwriteEntityKeys,
  authorizedPrincipalId,
  bodyRecord,
  mappedErrorResponse,
  OVERWRITE_REFUSED,
  rejectForeignWorkspace,
  routeParam,
  sendRefusal,
  type MappedErrorClass,
  type RouteParamsRequest,
} from "./route-helpers.js";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.6/§4 task 10.
 *
 * The operator-facing half of the outbound leg, under
 * `/api/admin/v1/workspaces/:workspaceId/publish-content/peers/:peerId/...`:
 *
 * - `POST .../push/plan` → build a bundle here, upload the blobs the peer lacks, stage it there,
 *   return the PEER's gated plan.
 * - `POST .../push/confirm` → relay the operator's confirmation to the peer.
 * - `POST .../push/execute` → relay the redemption; the peer applies.
 * - `POST .../pull` → fetch the peer's export and stage it HERE, returning a local `bundleId` that
 *   this instance's own `/import/plan|confirm|execute` then drives. One importer, two directions.
 *
 * ## FROZEN CONTRACT: every route here takes a `peerId`
 *
 * Never a raw URL and never a credential from the client. The URL comes from the
 * `publish_content_peers` row, and the credential is resolved from that row for the lifetime of one
 * request (see the next section). A client that could supply a URL would turn these routes into an SSRF primitive
 * wearing an authorization check; a client that could supply a credential would make the sealed
 * column pointless.
 *
 * ## Where the safety properties live
 *
 * On a PUSH, they live on the DESTINATION: the peer runs its own `gated-mutations` gateway, so
 * `PLAN_STALE`, single-redemption tokens, `AGENT_CANNOT_CONFIRM` and the restore point are enforced
 * by the code that owns the data being written. This file only relays — it cannot assert a principal
 * kind over the wire, so it cannot weaken the agent-confirm guard even in principle.
 *
 * On a PULL, they live HERE, in the existing `/import/*` ceremony — which is exactly why this pull
 * route stops at staging rather than planning: adding a second entry point into `planImport` would
 * be a second place the gate could be forgotten.
 *
 * ## Two kinds of destination, resolved in one place
 *
 * `openPeer` no longer calls `resolvePeerCredential` directly. `destination-credential.ts` decides
 * whether this destination is an explicitly-configured peer (a sealed key, opened per request) or
 * one this install is CONNECTED to (nothing stored; a session token minted by proving possession of
 * the site key). Both arrive as the same `ResolvedPeerCredential`, so every route below is
 * unchanged and cannot tell them apart.
 *
 * ## The credential never appears in a response
 *
 * Nothing in this file reads `credential.apiKey`; it is passed straight into the transport driver,
 * which puts it in one `Authorization` header. Every error body below is built from a typed error
 * whose message is derived from the PEER's response, never from the request.
 */

/** The typed errors a peer action answers with their own message. */
const PEER_ACTION_ERRORS: readonly MappedErrorClass[] = [
  [PublishContentPeerNotFoundError, 404, "PEER_NOT_FOUND"],
  // A connected destination's handshake. 502 for the same reason a transport error is: this
  // instance is fine and the request was well-formed — the far side (or the path to it) is what
  // failed, and the message is already the sentence the owner needs to act on.
  [PublishTrustHandshakeError, 502, "PUBLISH_TRUST_HANDSHAKE_FAILED"],
  [PublishContentPeerCredentialMissingError, 409, "PEER_CREDENTIAL_MISSING"],
  [PublishContentPeerSecretStoreUnconfiguredError, 503, "SECRET_STORE_UNCONFIGURED"],
];

/** @complexity O(1). */
function respondWithError(res: Response, err: unknown): void {
  if (err instanceof PublishContentPeerTransportError) {
    // 502: this instance is fine and the request was well-formed; the PEER (or the path to it) is
    // what failed. A 500 here would send an operator looking in the wrong server's logs — and for
    // `EGRESS_REFUSED` specifically, the message is the `devHostAllowlist` diagnosis, which is only
    // actionable if it reaches them intact.
    res.status(502).json({ error: err.message, code: err.code });
    return;
  }
  sendRefusal(res, mappedErrorResponse(err, PEER_ACTION_ERRORS));
}

/** The per-request transport bag: the guarded client plus the opened credential.
 *  @complexity O(1) plus one repo read and one AEAD open. */
async function openPeer(deps: PublishContentRouteDeps, peerId: string): Promise<PeerCallDeps> {
  const credential = await resolvePublishDestinationCredential({
    deps: {
      repo: deps.publishContentPeerRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      httpClient: deps.publishContentPeerHttpClient,
    },
    input: { workspaceId: deps.workspaceId, id: peerId },
  });
  return { credential, httpClient: deps.publishContentPeerHttpClient,
    publishHistory: { store: deps.publishHistoryStore, workspaceId: deps.workspaceId, clock: deps.clock } };
}

/** Distinguishes "the body carried a malformed selection" (a 400) from "the body carried none"
 *  (`null`, publish everything) — two outcomes a bare `null` return could not tell apart. */
const INVALID_SELECTION = Symbol("invalid-selection");

/**
 * Reads `push/plan`'s optional per-row selection: the `entityKey` strings
 * (`planner.ts`'s `${entityType}:${entityId}`) the operator left checked in the dialog.
 *
 * Absent means "publish everything", which is what every caller before the checkbox column sent and
 * what the dialog still sends when nothing was unchecked — the common path stays a bodyless POST.
 * An empty ARRAY is a real, different answer ("the operator unchecked everything") and is honoured
 * as such: it stages an empty bundle and plans to zero rows rather than quietly publishing the lot.
 *
 * @complexity O(n) in the submitted key count.
 */
function readSelectedEntityKeys(body: unknown): readonly string[] | null | typeof INVALID_SELECTION {
  const raw = bodyRecord(body);
  if (raw.selectedEntityKeys === undefined || raw.selectedEntityKeys === null) return null;
  if (!Array.isArray(raw.selectedEntityKeys)) return INVALID_SELECTION;
  if (!raw.selectedEntityKeys.every((key): key is string => typeof key === "string")) return INVALID_SELECTION;
  return raw.selectedEntityKeys;
}

/** `scope`'s per-field cap, matching `readOverwriteEntityKeys`'s 1000-entry bound (`route-helpers.ts`). */
const MAX_SCOPE_ARRAY_LENGTH = 1000;

/** @complexity O(1). */
function isNonEmptyStringArrayField(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_SCOPE_ARRAY_LENGTH && value.every((v) => typeof v === "string");
}

/**
 * Reads `push/plan`'s optional `scope` (`plan-publish-sections-2026-09-25.md` §1) — the section (or
 * section-plus-rows) this plan is about, applied BEFORE `selectedEntityKeys` narrows further (this
 * file's own `push/plan` handler). Absent/`null` means "publish everything", the same "absent, not an
 * empty real answer" contract every other optional array field on this route reads by.
 *
 * A present `entityTypes` or `entityKeys` must be a non-empty array of strings (at most
 * {@link MAX_SCOPE_ARRAY_LENGTH} entries): an empty array is refused rather than silently treated as
 * "everything" or "nothing", since `selectedEntityKeys` already uses an empty array for "nothing" and
 * a caller sending `scope: {entityTypes: []}` almost certainly meant something else.
 *
 * @returns `{scope: null}` when the body carries no `scope`, `{scope}` (the validated
 *   {@link PublishScope}) when it is well-formed, or `{invalidField}` naming which field was wrong
 *   (`"scope"` itself when it is not an object or names neither field — never read as "everything").
 * @complexity O(n) in the submitted array lengths.
 */
function readPublishScope(body: unknown): { scope: PublishScope | null } | { invalidField: ScopeInvalidField } {
  const raw = bodyRecord(body);
  if (raw.scope === undefined || raw.scope === null) return { scope: null };
  if (typeof raw.scope !== "object" || Array.isArray(raw.scope)) return { invalidField: "scope" };
  const scopeBody = raw.scope as Record<string, unknown>;
  // A present scope naming neither field (`{}`, or a typo like `{types: [...]}`) would otherwise
  // narrow nothing — silently widening a one-section dialog to "publish everything". Refused.
  if (scopeBody.entityTypes === undefined && scopeBody.entityKeys === undefined) return { invalidField: "scope" };
  const invalidField = SCOPE_FIELDS.find((field) => scopeBody[field] !== undefined && !isNonEmptyStringArrayField(scopeBody[field]));
  return invalidField ? { invalidField } : { scope: presentScopeFields(scopeBody) };
}

const SCOPE_FIELDS = ["entityTypes", "entityKeys"] as const;
type ScopeInvalidField = "scope" | (typeof SCOPE_FIELDS)[number];

/** The scope fields the body carries, each already validated by {@link readPublishScope}.
 *  @complexity O(1) — two fixed fields. */
function presentScopeFields(scopeBody: Record<string, unknown>): PublishScope {
  return Object.fromEntries(SCOPE_FIELDS.filter((field) => scopeBody[field] !== undefined).map((field) => [field, scopeBody[field]]));
}

/** The 400 message for a malformed `scope`. @complexity O(1). */
function scopeErrorMessage(invalidField: ScopeInvalidField): string {
  return invalidField === "scope"
    ? "'scope' must be an object with 'entityTypes' and/or 'entityKeys'"
    : `'scope.${invalidField}' must be a non-empty array of strings`;
}

/**
 * Reads `push/plan`'s two narrowing fields: `selectedEntityKeys` first, then `scope`.
 * @returns the 400 message for the first malformed one, or both read values.
 * @complexity O(n) in the submitted array lengths.
 */
function readPushPlanNarrowing(body: unknown): { error: string } | { scope: PublishScope | null; selectedEntityKeys: readonly string[] | null } {
  const selectedEntityKeys = readSelectedEntityKeys(body);
  if (selectedEntityKeys === INVALID_SELECTION) return { error: "'selectedEntityKeys' must be an array of strings" };
  const scopeResult = readPublishScope(body);
  if ("invalidField" in scopeResult) return { error: scopeErrorMessage(scopeResult.invalidField) };
  return { scope: scopeResult.scope, selectedEntityKeys };
}

/**
 * publish-overwrite-live-plan §7: "Overwrite on live" ticks come only from a person's click. On
 * this relay that means a signed-in admin session; an API key (a script, or a model holding one) is
 * refused. The destination can't tell the difference — it only ever sees this instance's
 * publishing credential — so this is the one place the rule can hold for a push. Empty ticks ask
 * for nothing and pass.
 *
 * @returns `true` when the request may proceed. On `false` the 403 has already been sent.
 * @complexity O(1).
 */
function mayOverwrite(res: Response, overwriteEntityKeys: readonly string[] | null): boolean {
  if (overwriteEntityKeys === null || overwriteEntityKeys.length === 0) return true;
  return rejectUnlessSessionCredential(res, {
    message: "'overwriteEntityKeys' can only be sent from a signed-in admin session",
    permission: "publish_content.apply",
  });
}

export const registerPublishContentPeerTransportRoutes: PublishContentRouteRegistrar = (app, deps) => {
  const base = "/api/admin/v1/workspaces/:workspaceId/publish-content/peers/:peerId";

  /** Every route here shares the same preamble: mount-path 404, authenticated principal, and the
   *  `publish_content.apply` gate. Factored so a new peer action cannot accidentally ship without
   *  one of the three. Returns the principal id, or `null` when a response has already been sent. */
  const guard = async (req: RouteParamsRequest, res: Response): Promise<string | null> => {
    if (rejectForeignWorkspace(req, res, deps.workspaceId)) return null;
    return authorizedPrincipalId(res, deps, "publish_content.apply");
  };

  /** The push routes' extra preamble: the live site is the publish destination, so it never pushes
   *  (`live-site-policy.ts`). Runs before {@link guard} — nothing about the caller changes the answer. */
  const pushGuard: typeof guard = async (req, res) => {
    if (!canPublishToLive()) {
      res.status(403).json({ error: PUBLISH_FROM_LIVE_SITE_ERROR, code: PUBLISH_FROM_LIVE_SITE_CODE });
      return null;
    }
    return guard(req, res);
  };

  app.post(`${base}/push/plan`, async (req, res) => {
    try {
      const principalId = await pushGuard(req, res);
      if (principalId === null) return;

      const narrowing = readPushPlanNarrowing(req.body);
      if ("error" in narrowing) {
        res.status(400).json({ error: narrowing.error, code: "VALIDATION_ERROR" });
        return;
      }
      const overwriteEntityKeys = acceptOverwriteEntityKeys(res, bodyRecord(req.body).overwriteEntityKeys, mayOverwrite);
      if (overwriteEntityKeys === OVERWRITE_REFUSED) return;

      const peer = await openPeer(deps, routeParam(req, "peerId"));
      res.json(await planPublishToPeer({
        deps: { ...deps, publishContentDeps: toPublishContentDeps(deps) },
        peer,
        principalId,
      }, { scope: narrowing.scope, selectedEntityKeys: narrowing.selectedEntityKeys, overwriteEntityKeys }));
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(`${base}/push/confirm`, async (req, res) => {
    try {
      const principalId = await pushGuard(req, res);
      if (principalId === null) return;

      const { planId, planHash } = bodyRecord(req.body);
      if (typeof planId !== "string" || typeof planHash !== "string") {
        res.status(400).json({ error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }

      const peer = await openPeer(deps, routeParam(req, "peerId"));
      res.json(await confirmPeerImport(peer, { planId, planHash }));
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(`${base}/push/execute`, async (req, res) => {
    try {
      const principalId = await pushGuard(req, res);
      if (principalId === null) return;

      const body = bodyRecord(req.body);
      const { bundleId, confirmationToken } = body;
      if (typeof bundleId !== "string" || typeof confirmationToken !== "string") {
        res.status(400).json({ error: "'bundleId' and 'confirmationToken' (strings) are required", code: "VALIDATION_ERROR" });
        return;
      }
      const overwriteEntityKeys = acceptOverwriteEntityKeys(res, body.overwriteEntityKeys, mayOverwrite);
      if (overwriteEntityKeys === OVERWRITE_REFUSED) return;

      const peer = await openPeer(deps, routeParam(req, "peerId"));
      res.json(
        await executePeerImport(peer, {
          bundleId,
          confirmationToken,
          ...(overwriteEntityKeys === null ? {} : { overwriteEntityKeys }),
        })
      );
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(`${base}/pull`, async (req, res) => {
    try {
      const principalId = await guard(req, res);
      if (principalId === null) return;

      res.status(201).json(await pullAndStageFromPeer(deps, {
        peerId: routeParam(req, "peerId"),
        principalId,
      }));
    } catch (err) {
      respondWithError(res, err);
    }
  });
};
