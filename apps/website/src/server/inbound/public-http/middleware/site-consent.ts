import { parseConsentConfig, consentConfigProblems } from '#src/features/consent/validation';
import { randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import express, { type Express, type Request } from "express";
import { registerConsentHttp, type ConsentHttpPorts } from "@jini-ai/cms/consent/express";
import { consentRateLimitKey, createConsentFileRecords, createNodeConsentFiles, type ConsentAtomicWriter } from "@jini-ai/cms/consent/node";

import { createRateLimiter, type RateLimitProfile } from "#src/contracts/core/rate-limit/rate-limit";
import { withSiteConsentDefaultCss } from "#src/features/consent/config";
import { createSiteConsentRequestPorts } from "#src/features/consent/host";
import { createSiteConsentConfig, resolveSiteConsentActivation } from "#src/features/consent/settings";
import { findPublishedPostBySlug } from "#src/features/post/index";
import { writeJsonFileAtomic } from "#src/platform/site-dir/atomic-write";
import type { RouteDeps } from "#src/server/routes/types";
import { FORM_RANGE_READOUT_JS } from "../http/site/form-render.js";
import { isStaticExportRequest } from "../routes/site/pages.js";
import { resolvePublicOrigin } from "../routes/oauth/public-origin.js";

/**
 * @file Mounts Jini's consent lifecycle (`@jini-ai/cms/consent/express`) on public site HTML.
 *
 * Order (see `createApp`): after the serving gate, security headers and published WebMCP, before
 * every public renderer. WebMCP patches `res.send`; consent captures the lower `write`/`end`, so the
 * WebMCP script is injected first and then gated like any other functional inline script.
 *
 * Receipts are immutable JSON files under `<siteDir>/consent-receipts` (phase 1). The folder is
 * deliberately not on `layout.ts`'s portable allowlist: proofs belong to the site that collected
 * them and never travel with a duplicate or share. A durable database adapter comes later.
 */

/** Top-level, non-portable site folder holding one immutable proof file per visitor choice. */
export const CONSENT_RECEIPTS_DIR_NAME = "consent-receipts";

/** Twenty choices per ten minutes per address (/64 for IPv6), with a small burst for retries. */
export const CONSENT_SAVE_PROFILE: RateLimitProfile = { windowSeconds: 600, max: 20, burst: 5 };

/** Tovu's own essential scripts, matched exactly; everything else waits for a visitor choice. */
export const TOVU_NECESSARY_SCRIPTS = [{ content: FORM_RANGE_READOUT_JS }] as const;

/** Bind the engine's atomic-writer port to the site-dir writer (which owns flush/rename/mode). */
const atomicWrite: ConsentAtomicWriter = async ({ filePath, data }, { createParent, mode, refuseSymlink }) => {
  if (createParent) await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeJsonFileAtomic({ filePath, data }, { mode, refuseSymlink });
};

/** A local single-segment link (/privacy) must name a published page; https links are trusted.
 * @complexity O(1), one indexed slug lookup. */
export function createPrivacyPageCheck({ deps }: { deps: Pick<RouteDeps, "postRepo" | "workspaceId"> }, _optional = {}) {
  return async ({ url }: { url: string }, _options = {}): Promise<boolean> => {
    if (url.startsWith("https://")) return true;
    const slug = /^\/([a-z0-9-]+)\/?$/.exec(url)?.[1];
    if (!slug) return false;
    return (await findPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug } })) !== null;
  };
}

/** Consent read/save failures are logged by operation and message only: no cookie, body or receipt. */
function reportConsentError({ operation }: { operation: "read" | "save"; error: unknown }, _options = {}): void {
  console.error(`[consent] ${operation} failed`);
}

/** Every host effect the engine needs, built from this site's composition. @complexity O(1). */
export function createSiteConsentPorts({ deps }: { deps: RouteDeps }, { trustedRegionHeader }: { trustedRegionHeader?: string } = {}): ConsentHttpPorts {
  const request = createSiteConsentRequestPorts({
    ...(trustedRegionHeader ? { trustedRegionHeader } : {}),
    origin: ({ request: req }) => resolvePublicOrigin(req as Request),
    rateLimiter: createRateLimiter({ profile: CONSENT_SAVE_PROFILE, clock: deps.clock }),
    rateLimitKey: consentRateLimitKey,
  });
  return {
    config: { get: async () => {
      await deps.siteConsentReady;
      const state = await deps.consentStore?.read({});
      // An empty owner Custom CSS gets Tovu's default banner style (owner, 2026-10-22).
      if (!state?.published) return withSiteConsentDefaultCss({ config: await createSiteConsentConfig({ settingsRepo: deps.settingsRepo, workspaceId: deps.workspaceId }).get({}) });
      const config = withSiteConsentDefaultCss({ config: parseConsentConfig({ value: state.published.config }) });
      if (consentConfigProblems({ config, trustedRegion: Boolean(trustedRegionHeader) }).length) throw new Error('Published consent policy is invalid.');
      // Receipts name an immutable configuration; changing a published revision requires a new choice.
      return { ...config, policyVersion: `${config.policyVersion}:${state.published.id}` };
    } },
    records: createConsentFileRecords({ directory: path.join(deps.siteBinding.dir, CONSENT_RECEIPTS_DIR_NAME), files: createNodeConsentFiles({ atomicWrite }) }),
    clock: deps.clock,
    // Receipt IDs must be unpredictable; the site's id generator is time-ordered, so it is not used.
    ids: { newId: () => randomBytes(24).toString("base64url") },
    ...request,
    reportError: reportConsentError,
  };
}

/** True when consent is on only by the product default: no owner choice and nothing published.
 * Exports omit that consent until a browser-side banner supports static sites; live serving keeps it.
 * @complexity O(1), one store read and one settings read. */
async function isDefaultOnlyConsent({ deps }: { deps: RouteDeps }, _options = {}): Promise<boolean> {
  await deps.siteConsentReady;
  if ((await deps.consentStore?.read({}))?.published) return false;
  return (await resolveSiteConsentActivation({ settingsRepo: deps.settingsRepo, workspaceId: deps.workspaceId })).source === "default";
}

/**
 * Register consent for this app. The exporter's crawl (`x-tovu-static-export`) gets the engine's
 * static delivery, which refuses HTML with 409 while explicitly enabled consent is on: a static host
 * cannot store receipts, and silently stripping consent would ship trackers ungated. Default-only
 * consent skips the engine for exports; a failed check falls through to it, which blocks.
 * @complexity O(1) at registration; per page see `registerConsentHttp`.
 */
export function applySiteConsent({ app, deps }: { app: Express; deps: RouteDeps }, { trustedRegionHeader }: { trustedRegionHeader?: string } = {}): void {
  // A sub-app so `next("router")` can skip every consent route and the HTML gate at once.
  const consentApp = express();
  consentApp.use((req, _res, next) => {
    if (!isStaticExportRequest(req)) return next();
    isDefaultOnlyConsent({ deps }).then(skip => (skip ? next("router") : next()), () => next());
  });
  registerConsentHttp({ app: consentApp, ports: createSiteConsentPorts({ deps }, trustedRegionHeader ? { trustedRegionHeader } : {}) }, {
    necessaryScripts: TOVU_NECESSARY_SCRIPTS,
    // Site chat and analytics talk to this same origin; no third-party collector is reviewed yet.
    categoryOrigins: { functional: [], analytics: [] },
    delivery: ({ request: req }) => (isStaticExportRequest(req) ? "static" : "live"),
  });
  app.use(consentApp);
}
