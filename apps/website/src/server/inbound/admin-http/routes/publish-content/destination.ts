import type { Express } from "express";

import { normalizePeerBaseUrl } from "#src/features/publish-content/peer-url";
import {
  connectAndRecordDestination,
  disconnectAndForgetDestination,
} from "#src/features/publish-content/connect-destination";
import { selectConnectedDestination, type PublishContentPeerSummary } from "#src/features/publish-content/peers";
import { listPublishContentContributors } from "#src/features/publish-content/type-registry";
import {
  connectDestination,
  disconnectDestination,
  PublishTrustConnectError,
} from "#src/features/publish-trust/connect";
import { PublishTrustHandshakeError } from "#src/features/publish-trust/handshake-client";
import type { PublishTrustProvisioningPort } from "#src/features/publish-trust/provisioning";
import { authorizeOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import type { PublishContentRouteDeps } from "./deps.js";

/**
 * @file The one action a person takes to make publishing work: "yes, that site is mine".
 * Design note: `ADS-memory/reports/2026-09-19-publish-zero-setup-auth-design.md`.
 *
 * ## Why the action lives here, behind the Publish button
 *
 * The owner has rejected the key ceremony five times, so the bar for this surface is that it
 * introduces NO concept. That rules out a settings screen: a settings screen is a place you have to
 * know to go to, and once you are there the page has to explain what it is for — which is the
 * vocabulary lesson the whole design exists to avoid. So the connect action hangs off the Publish
 * Content dialog instead, in the slot that used to read "No publish target is configured yet. Add
 * one in Settings first." The owner gets there by trying to do the thing they wanted, and the dead
 * end becomes the one question worth asking them.
 *
 * `GET` pre-fills the candidate from the deploy config the repo already carries, so in the common
 * case the dialog asks "Publish to tovu.fly.dev?" and the owner presses one button. That is the one
 * irreducible step: choosing which site is theirs, once.
 *
 * These are ordinary admin routes rather than UI-only logic so the same action is reachable from a
 * command or an assistant tool later without a second implementation of what connecting means.
 *
 * ## Nothing in any response here is secret
 *
 * `GET` returns an address, a label and two sentences. `POST /connect` returns the same plus what to
 * do next. No installation id, no public key, no generation, no capability list, no expiry — not
 * because they are secret (they are not; they live in committed config) but because naming them is
 * exactly the vocabulary this surface must not teach.
 */

/** What every response here is shaped as. Strings a person reads, never state to interpret. */
export interface PublishDestinationView {
  /** `true` once this computer's grant has been written for a site. */
  readonly connected: boolean;
  /** The connected site, as the publish list already models it. `null` when there is none. */
  readonly site: PublishContentPeerSummary | null;
  /** Read out of the repo's deploy config — what to offer when nothing is connected yet. */
  readonly candidateUrl: string | null;
  /** One sentence describing where things stand. */
  readonly message: string;
  /** One sentence naming what the owner does next, or `null` when nothing is pending. */
  readonly nextStep: string | null;
}

export interface PublishDestinationDeps {
  readonly provisioning: PublishTrustProvisioningPort;
  /** The address to offer, from the repo's committed deploy config. */
  readonly findCandidate: () => Promise<string | null>;
}

/** The site host, as a label a person recognises. The address is the identity; this is the name.
 *  @complexity O(n) in the URL length. */
function siteLabelFor(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

/**
 * The connected destination, if this install has one.
 *
 * "Connected" is a property of the peer list, not of the grant file: a grant can be present while
 * the row is gone (a repo cloned onto a second computer) and the row is what publishing needs. The
 * grant is re-derived by {@link connectDestination} whenever the owner connects again, which is why
 * making the row authoritative here costs nothing.
 *
 * @complexity O(n) in the workspace's peer count.
 */
async function connectedSite(deps: PublishContentRouteDeps): Promise<PublishContentPeerSummary | null> {
  const rows = await deps.publishContentPeerRepo.listByWorkspace({ workspaceId: deps.workspaceId });
  const match = selectConnectedDestination(rows);
  return match
    ? {
        id: match.id,
        label: match.label,
        baseUrl: match.baseUrl,
        remoteWorkspaceId: match.remoteWorkspaceId,
        masked: null,
        hasCredential: false,
      }
    : null;
}

/** Maps this file's own failures to a status and an owner-facing sentence. Every message passed
 *  through is already written for a person — see `handshake-client.ts`'s header.
 *  @complexity O(1). */
function respondWithError(res: { status(code: number): { json(body: unknown): void } }, err: unknown): void {
  if (err instanceof PublishTrustHandshakeError) {
    res.status(502).json({ error: err.message, code: "PUBLISH_TRUST_HANDSHAKE_FAILED" });
    return;
  }
  if (err instanceof PublishTrustConnectError) {
    res.status(500).json({ error: err.message, code: "PUBLISH_TRUST_NOT_SAVED" });
    return;
  }
  res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
}

/**
 * Registers `GET`, `POST /connect` and `POST /disconnect` under
 * `/api/admin/v1/workspaces/:workspaceId/publish-content/destination`.
 *
 * @complexity O(1) per request beyond each handler's own cost.
 */
export function registerPublishContentDestinationRoutes(
  app: Express,
  deps: PublishContentRouteDeps,
  own: PublishDestinationDeps
): void {
  const base = "/api/admin/v1/workspaces/:workspaceId/publish-content/destination";

  /** Mount-path 404 plus the `publish_content.apply` gate — connecting authorises future writes to
   *  a live site, so it is gated as a write, not as a read. */
  const guard = async (
    req: { params: Record<string, string | undefined> },
    res: Parameters<Parameters<typeof app.post>[1]>[1]
  ): Promise<boolean> => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return false;
    }
    const principal = getAuthedPrincipal(res);
    return authorizeOrRespond(res, deps.authorize, {
      principalId: principal.id,
      permission: "publish_content.apply",
      workspaceId: deps.workspaceId,
    });
  };

  app.get(base, async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const site = await connectedSite(deps);
      if (site) {
        const view: PublishDestinationView = {
          connected: true,
          site,
          candidateUrl: null,
          message: `This computer publishes to ${site.label}.`,
          nextStep: null,
        };
        res.json(view);
        return;
      }

      const candidateUrl = await own.findCandidate();
      const view: PublishDestinationView = {
        connected: false,
        site: null,
        candidateUrl,
        // The empty state is a plain sentence, never an error code — a fresh install that has never
        // deployed is the ordinary first run, not a fault.
        message: candidateUrl
          ? `Publish to ${siteLabelFor(candidateUrl)}?`
          : "No live site is set up yet. Deploy this site once, then come back here.",
        nextStep: null,
      };
      res.json(view);
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(`${base}/connect`, async (req, res) => {
    try {
      if (!(await guard(req, res))) return;

      const supplied = (req.body ?? {}) as Record<string, unknown>;
      const raw = typeof supplied.siteUrl === "string" && supplied.siteUrl.trim() !== ""
        ? supplied.siteUrl
        : await own.findCandidate();
      if (raw === null) {
        res.status(400).json({
          error: "No live site is set up yet. Deploy this site once, then come back here.",
          code: "NO_DESTINATION",
        });
        return;
      }
      const normalized = normalizePeerBaseUrl(String(raw));
      if ("error" in normalized) {
        res.status(400).json({ error: "That does not look like a website address.", code: "VALIDATION_ERROR" });
        return;
      }

      // What this source may publish is its OWN registered types, not a list anyone chooses. An
      // empty grant can do nothing (`grant.ts`), so an install with no registered contributors is
      // refused here rather than connected into something that silently publishes nothing.
      const entityTypes = listPublishContentContributors().map((contributor) => contributor.entityType);
      if (entityTypes.length === 0) {
        res.status(409).json({ error: "This site has nothing that can be published yet.", code: "NO_PUBLISHABLE_TYPES" });
        return;
      }

      const trustDeps = {
        httpClient: deps.publishContentPeerHttpClient,
        keyring: deps.siteAssistantSecretKeyring,
        provisioning: own.provisioning,
        clock: deps.clock,
        workspaceId: deps.workspaceId,
      };
      const { site, grant } = await connectAndRecordDestination(
        {
          repo: deps.publishContentPeerRepo,
          clock: deps.clock,
          idGen: deps.idGen,
          connectGrant: (input) => connectDestination(trustDeps, input),
          reverseGrant: () => disconnectDestination(trustDeps),
        },
        { workspaceId: deps.workspaceId, baseUrl: normalized.baseUrl, entityTypes }
      );

      const view: PublishDestinationView = {
        connected: true,
        site,
        candidateUrl: null,
        message: `This computer publishes to ${site.label}.`,
        nextStep: grant.nextStep,
      };
      res.status(201).json(view);
    } catch (err) {
      respondWithError(res, err);
    }
  });

  app.post(`${base}/disconnect`, async (req, res) => {
    try {
      if (!(await guard(req, res))) return;
      const removed = await disconnectAndForgetDestination(
        {
          repo: deps.publishContentPeerRepo,
          clock: deps.clock,
          idGen: deps.idGen,
          reverseGrant: () =>
            disconnectDestination({
              keyring: deps.siteAssistantSecretKeyring,
              provisioning: own.provisioning,
              workspaceId: deps.workspaceId,
            }),
        },
        { workspaceId: deps.workspaceId }
      );
      const site = removed.site;

      const view: PublishDestinationView = {
        connected: false,
        site: null,
        candidateUrl: site?.baseUrl ?? (await own.findCandidate()),
        message: site ? `This computer no longer publishes to ${site.label}.` : "This computer was not publishing anywhere.",
        // Takes effect on the next deploy — the destination-side deny list is the immediate one,
        // and it is a separate action on the SITE, not on this computer.
        nextStep: removed.changed ? (removed.target?.nextStep ?? null) : null,
      };
      res.json(view);
    } catch (err) {
      respondWithError(res, err);
    }
  });
}
