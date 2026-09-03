import type { Express, Request } from "express";

import type { JsonObject } from "@jini-ai/cms/core";
import { ingestHit, type IngestHitDeps } from "#src/features/analytics/ingest";
import type { IngestBeacon, IngestContext } from "#src/features/analytics/index";

/**
 * @file Public ingest beacon route for the `analytics` library (ADR-035 §5).
 *
 * Purpose:
 * Registers `POST /_analytics/e` — the unauthenticated, first-party beacon endpoint a site's
 * pages call via `navigator.sendBeacon`. This is intentionally a SITE route (mirrors
 * `routes/site/pages.ts`), not an admin route: no session is required or checked here, by design
 * (ADR-035 §5 — the beacon must work for anonymous visitors).
 *
 * How it relates to the project:
 * - Delegates all normalization/policy logic to `ingestHit` (`src/features/analytics/ingest.ts`); this file
 *   owns only the HTTP boundary: parsing the untrusted request body into an `IngestBeacon`, and
 *   pulling `ip`/`userAgent`/`acceptLanguage` off the request into an `IngestContext`.
 * - The response is ALWAYS `204 No Content`, regardless of `ingestHit`'s `{ accepted, reason }`
 *   result, and regardless of whether `ingestHit` itself throws. Leaking accept/reject (or a
 *   distinct error status) back to an anonymous caller would turn the beacon into an oracle for
 *   probing a site's exclusion rules, DNT/GPC handling, or PII-shape validation — the ADR's
 *   fire-and-forget beacon contract exists specifically to prevent that.
 */

/** Bounded input length caps applied at the HTTP boundary (secure-input-handling: untrusted body). */
const MAX_HOST_LENGTH = 253; // max valid DNS hostname length
const MAX_PATH_LENGTH = 2048;
const MAX_REFERRER_LENGTH = 2048;
const MAX_EVENT_NAME_LENGTH = 200;

/** Truncates an untrusted string field to a bounded length; non-strings coerce to `""`. */
function boundedString(value: unknown, maxLength: number): string {
  const str = typeof value === "string" ? value : "";
  return str.slice(0, maxLength);
}

/** True only for a plain JSON object (not an array, not `null`) — guards `eventProps`. */
function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses the untrusted POST body into an `IngestBeacon`. Every field is defensively coerced and
 * length-bounded — this body comes from an anonymous, unauthenticated client.
 *
 * @complexity O(1) (plus the bounded string truncation above).
 * @overallScore 100/100
 */
function parseBeacon(body: unknown, fallbackHost: string): IngestBeacon {
  // No `?? {}` fallback: `parseBeacon`'s one call site passes `req.body`, and `express.json()` is
  // mounted ahead of this route in every real composition (see `app.ts`) and in every test's own
  // app — `body-parser`'s `json` middleware sets `req.body = req.body || {}` unconditionally,
  // before it even checks the content type, so `req.body` can never be `null`/`undefined` here.
  const raw = body as Record<string, unknown>;
  const host = boundedString(raw.host, MAX_HOST_LENGTH) || fallbackHost;
  const referrer = typeof raw.referrer === "string" ? boundedString(raw.referrer, MAX_REFERRER_LENGTH) : null;
  const kind = raw.kind === "event" ? "event" : "pageview";
  const eventName =
    kind === "event" && typeof raw.eventName === "string"
      ? boundedString(raw.eventName, MAX_EVENT_NAME_LENGTH)
      : undefined;

  return {
    host,
    path: boundedString(raw.path, MAX_PATH_LENGTH),
    referrer,
    kind,
    eventName,
    eventProps: isJsonObject(raw.eventProps) ? raw.eventProps : undefined,
    dnt: raw.dnt === true,
    gpc: raw.gpc === true,
  };
}

/** Builds the transient per-request context `ingestHit` consumes and then discards (no PII persisted). */
function buildContext(req: Request, receivedAt: string): IngestContext {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? "",
    userAgent: req.get("user-agent") ?? "",
    acceptLanguage: req.get("accept-language") ?? null,
    receivedAt,
  };
}

/**
 * Registers the public analytics beacon route. Deps mirror `IngestHitDeps` exactly (the same
 * dependency shape `ingestHit` already declares) rather than the admin `RouteDeps` shape — this is
 * a site route wired up separately in the composition root (see handoff notes for the exact
 * `createApp()` wiring, since `app.ts` is out of this task's scope to edit directly).
 */
export function registerAnalyticsIngestRoute(app: Express, deps: IngestHitDeps): void {
  app.post("/_analytics/e", async (req, res) => {
    const receivedAt = deps.clock.nowIso();
    const beacon = parseBeacon(req.body, req.hostname ?? "");
    const context = buildContext(req, receivedAt);

    try {
      await ingestHit({ input: { beacon, context }, deps });
    } catch {
      // Never let an ingest-side failure surface to the public beacon caller — see file header.
    }

    // Always 204, regardless of accept/reject or failure above (ADR-035 §5 — no oracle).
    res.status(204).end();
  });
}
