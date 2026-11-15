// Jini implementation: packages/diagnostics/src/web-evidence/collect-page-evidence.ts
import {
  collectPageEvidence as collectDiagnosticEvidence,
  type CollectPageEvidenceOptions,
  type ObservationPolicy,
  type PageObservation,
  type SiteEvidenceBrowserFactory,
  type SiteEvidenceResult,
} from "@jini-ai/diagnostics/web-evidence";
import type { UUID } from "@jini-ai/core/primitives";

import type { OriginRegistryPort } from "@jini-ai/http-kit/verified-origin";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";

/** Required Tovu origin and browser ports, plus the requested site-relative paths. */
export interface CollectPageEvidenceDeps {
  readonly workspaceId: UUID;
  readonly originRegistry: OriginRegistryPort;
  readonly openBrowser: SiteEvidenceBrowserFactory;
  readonly paths: readonly string[];
}

/** Redacts one evidence string with Tovu's secret-only policy; never logs the raw value. */
function redactText({ text }: { text: string }, _optional = {}): string {
  return redactSecretShapes({ text }).text;
}

/** Keeps absence distinct from an observed empty string in accessibility metadata. */
function redactNullableText({ text }: { text: string | null }, _optional = {}): string | null {
  if (text === null) return null;
  return redactText({ text });
}

/**
 * Applies Tovu's evidence disclosure policy to browser-owned strings. Cookie/request/form values
 * remain unrepresentable in Jini's evidence contract. Credential-bearing response headers are
 * hidden in full, even when their value is too short to look like a token in ordinary prose.
 * @param required Browser observation to copy; input arrays and objects are never mutated.
 * @returns Evidence with secret values hidden, preserving numerical/boolean facts and absence.
 * @complexity O(n) time/space in captured text and nodes, bounded by Jini's capture limits.
 */
function redactObservation({ observation }: { observation: PageObservation }): PageObservation {
  const accessibility = observation.accessibility;
  return {
    document: {
      ...observation.document,
      finalUrl: redactText({ text: observation.document.finalUrl }),
      title: redactText({ text: observation.document.title }),
      lang: redactNullableText({ text: observation.document.lang }),
      textExcerpt: redactText({ text: observation.document.textExcerpt }),
      headers: observation.document.headers.map(({ name, value }) => ({
        name: redactText({ text: name }),
        value: /^(?:(?:proxy-)?authorization|(?:set-)?cookie|x-api-key|api-key|x-goog-api-key|x-auth-token)$/i.test(name)
          ? "[REDACTED:auth_header]" : redactText({ text: value }),
      })),
    },
    cookies: observation.cookies.map(cookie => ({
      ...cookie,
      name: redactText({ text: cookie.name }), domain: redactText({ text: cookie.domain }), path: redactText({ text: cookie.path }),
      sameSite: redactText({ text: cookie.sameSite }), expiresAt: redactNullableText({ text: cookie.expiresAt }),
    })),
    requests: observation.requests.map(request => ({
      ...request,
      method: redactText({ text: request.method }), host: redactText({ text: request.host }), pathname: redactText({ text: request.pathname }),
      resourceType: redactText({ text: request.resourceType }),
      ...(request.blockedReason === undefined ? {} : { blockedReason: redactText({ text: request.blockedReason }) }),
    })),
    ...(accessibility === undefined ? {} : { accessibility: {
      landmarks: accessibility.landmarks.map(node => ({
        ...node, role: redactText({ text: node.role }), selector: redactText({ text: node.selector }), accessibleName: redactNullableText({ text: node.accessibleName }),
      })),
      headings: accessibility.headings.map(node => ({ ...node, selector: redactText({ text: node.selector }), text: redactText({ text: node.text }) })),
      images: accessibility.images.map(node => ({
        ...node, selector: redactText({ text: node.selector }), src: redactText({ text: node.src }), alt: redactNullableText({ text: node.alt }),
      })),
      formControls: accessibility.formControls.map(node => ({
        ...node, selector: redactText({ text: node.selector }), tag: redactText({ text: node.tag }), type: redactNullableText({ text: node.type }),
        name: redactNullableText({ text: node.name }), accessibleName: redactNullableText({ text: node.accessibleName }), labelSource: redactText({ text: node.labelSource }),
      })),
      contrastSamples: accessibility.contrastSamples.map(node => ({
        ...node, selector: redactText({ text: node.selector }), foreground: redactText({ text: node.foreground }), background: redactText({ text: node.background }),
      })),
      truncated: accessibility.truncated.map((text) => redactText({ text })),
    } }),
    ...(observation.performance === undefined ? {} : { performance: {
      ...observation.performance, suspects: observation.performance.suspects.map((text) => redactText({ text })),
    } }),
    notes: observation.notes.map((text) => redactText({ text })),
  };
}

/** The collector invokes this policy before returning observations and browser failure messages. */
const TOVU_OBSERVATION_POLICY: ObservationPolicy = {
  redactObservation,
  redactMessage: ({ message }) => redactText({ text: message }),
};

/**
 * Adapts Tovu's verified-origin registry and disclosure policy to Jini's bounded collector.
 * @param required Requested paths and host ports; the origin is never derived from tool input.
 * @param options Clock, consent selector and accessibility capture controls.
 * @returns Observed evidence with per-page skip reasons; no persistence or compliance verdict.
 * @throws The host origin error when no verified canonical origin exists. Deliberately propagated
 * rather than converted into a per-page skip: with no origin there is no same-origin boundary,
 * and guessing one from a request host is precisely what ADR-040 F2 forbids. The tool handler
 * turns it into an actionable message. Browser resources are closed by Jini.
 * @complexity At most five page loads, each 15s, with a 60s whole-call deadline and bounded output.
 * @example collectPageEvidence({ workspaceId, originRegistry, openBrowser, paths: ["/"] });
 *
 * `collectPageEvidence()` — the bounded orchestration behind the `site_collect_page_evidence`
 * agent tool, now implemented in Jini diagnostics. Resolves the workspace's own verified origin, normalizes each requested path, drives
 * the browser port once per page, and returns observed evidence.
 *
 * ---------------------------------------------------------------------------
 * The one rule this module exists to enforce: evidence, never a verdict
 * ---------------------------------------------------------------------------
 * Nothing here scores, grades, passes, fails, or maps an observation to a regulation. There is no
 * `compliant` field and no place to put one. The tool reports what was seen and where it was seen;
 * deciding what that means is the `site-compliance` skill's job, under an output contract that
 * forbids it from stating a verdict either. Both halves have to hold — a tool that returned
 * `{ gdprCookieCheck: "pass" }` would make the skill's contract unenforceable, because the verdict
 * would already have been asserted upstream of it.
 *
 * Two consequences worth naming, because they look like missing features and are not:
 * - A page that could not be loaded produces a `skipped` entry with a reason, never an empty
 *   observation. "Nothing observed" and "observed nothing" are different facts and a report that
 *   confuses them is worse than no report.
 * - When the browser is unavailable, EVERY page is `skipped` with that reason and `pages` is empty.
 *   There is no configuration-derived fallback, because a fallback would be a guess wearing the
 *   evidence tool's credibility.
 *
 * ---------------------------------------------------------------------------
 * Bounds
 * ---------------------------------------------------------------------------
 * Every axis a hostile or careless caller could drive unbounded is capped by
 * {@link SITE_EVIDENCE_LIMITS}, and each cap is reported back in the result so a reader can tell a
 * truncated list from a complete one. Per skills/implementation-guardrails' resource-bounds rule:
 * maximum collection size (`maxPagesPerCall`), per-call timeout (`maxPageLoadMs`), overall deadline
 * (`maxTotalMs`), and explicit behaviour at the cap (excess pages are `skipped` with reason
 * `page-cap`, never silently dropped).
 *
 * ---------------------------------------------------------------------------
 * Nothing is persisted
 * ---------------------------------------------------------------------------
 * This module writes no file, no database row, and no cache. The browser adapter uses an ephemeral
 * context with no user-data directory. What the tool observed exists only in the value it returns,
 * and the shapes in `browser-port.ts` cannot represent a cookie value, a request body, or a form
 * field's contents in the first place.
 *
 * Architectural role:
 * Jini orchestration over injected origin/browser ports and Tovu's disclosure policy.
 * No global state, no module-level singletons — `tool-registrations.ts` supplies both.
 */
export function collectPageEvidence(required: CollectPageEvidenceDeps, options: CollectPageEvidenceOptions = {}): Promise<SiteEvidenceResult> {
  return collectDiagnosticEvidence({
    workspaceId: required.workspaceId,
    paths: required.paths,
    openBrowser: required.openBrowser,
    originRegistry: { canonicalOrigin: ({ workspaceId }) => required.originRegistry.canonicalOrigin({ workspaceId }) },
    observationPolicy: TOVU_OBSERVATION_POLICY,
  }, options);
}
