/**
 * @file The browser seam for `site_collect_page_evidence`, plus the evidence shapes that cross it.
 *
 * ---------------------------------------------------------------------------
 * Why a port at all
 * ---------------------------------------------------------------------------
 * A headless browser is a heavyweight, optional, environment-dependent runtime dependency. Three
 * things follow, and the port is what makes all three cheap:
 *
 * 1. **It may be absent.** Tovu is self-hosted; an operator's image may not carry Chromium at all.
 *    `SiteEvidenceBrowserFactory` therefore returns a discriminated result rather than throwing, so
 *    "this deployment cannot observe rendered behaviour" is a first-class, reportable state instead
 *    of a stack trace. The skill's output contract requires it to say `cannot-determine` in exactly
 *    this case, which it can only do if the tool tells it plainly.
 * 2. **It must be testable without one.** Every bound, every same-origin refusal, every redaction
 *    rule in `collect-page-evidence.ts` is exercised against a fake implementing this interface.
 *    Nothing about those rules should require downloading a browser to assert.
 * 3. **Playwright is not the contract.** `playwright-browser.ts` is one adapter. Nothing outside it
 *    imports `playwright`, so swapping it (or shipping without it) touches one file.
 *
 * ---------------------------------------------------------------------------
 * What this port is NOT allowed to carry
 * ---------------------------------------------------------------------------
 * The evidence types below are the whole contract, and they are deliberately incapable of carrying
 * personal data out of a page:
 *
 * - A cookie's **value is not a field**. Names, domains, flags and the observation phase are; the
 *   value is not modelled, so an adapter has nothing to put it in and a report has nothing to leak.
 * - A request's **body is not a field**, and neither are its headers. Method, host, path, resource
 *   type, phase.
 * - A form control's **value is not a field**. Its selector, name, type, and whether it has an
 *   accessible label are.
 * - Page text is a bounded **excerpt**, capped by the collector, never the full document.
 *
 * This is the same "unrepresentability, not redaction" discipline `same-origin.ts` applies to the
 * URL: a field that does not exist cannot be forgotten in a redaction pass.
 */

/** Which side of the consent interaction an observation belongs to. `before` is everything seen
 *  from navigation up to the consent click; `after` is everything seen following it. A run that was
 *  not asked to perform a consent action reports everything as `before` — there was no transition,
 *  so nothing is "after" anything. */
export type ObservationPhase = "before" | "after";

/** One cookie observed in the browser context. No value field — see this file's header. */
export interface CookieEvidence {
  readonly name: string;
  readonly domain: string;
  readonly path: string;
  readonly secure: boolean;
  readonly httpOnly: boolean;
  readonly sameSite: string;
  /** `null` when the cookie is a session cookie (no expiry). */
  readonly expiresAt: string | null;
  /** Whether the cookie's domain is this site's own origin host. First-party/third-party is the
   *  distinction most consent rules turn on, and it is a fact about the observation, not a
   *  judgement about it. */
  readonly firstParty: boolean;
  readonly phase: ObservationPhase;
}

/** One network request the page attempted. No body, no headers — see this file's header. */
export interface RequestEvidence {
  readonly method: string;
  readonly host: string;
  readonly pathname: string;
  /** The browser's own classification (`document`, `script`, `image`, `xhr`, `fetch`, …). */
  readonly resourceType: string;
  readonly firstParty: boolean;
  readonly phase: ObservationPhase;
  /** Set when the collector refused to let the request proceed — see
   *  `collect-page-evidence.ts`'s non-GET rule. The attempt is still evidence; completing it is
   *  not required to observe that it happened. */
  readonly blockedReason?: string;
}

/** One response header observed on the main document response. */
export interface HeaderEvidence {
  readonly name: string;
  readonly value: string;
}

/** A landmark region in the rendered accessibility tree. */
export interface LandmarkEvidence {
  readonly role: string;
  readonly selector: string;
  readonly accessibleName: string | null;
}

/** One heading, in document order, with its level — the raw material for an outline check. */
export interface HeadingEvidence {
  readonly level: number;
  readonly selector: string;
  readonly text: string;
}

/** One image and whether it carries alternative text. `alt: null` means the attribute is absent;
 *  `alt: ""` means it is present and empty (a deliberate decorative marking), and the two are not
 *  the same observation. */
export interface ImageEvidence {
  readonly selector: string;
  readonly src: string;
  readonly alt: string | null;
  readonly ariaHidden: boolean;
}

/** One form control and how (or whether) it is labelled. Never its value. */
export interface FormControlEvidence {
  readonly selector: string;
  readonly tag: string;
  readonly type: string | null;
  readonly name: string | null;
  readonly accessibleName: string | null;
  /** How the accessible name was derived, when it was: `label-for`, `label-wrap`, `aria-label`,
   *  `aria-labelledby`, `title`, or `none`. */
  readonly labelSource: string;
  readonly required: boolean;
}

/** One sampled text/background colour pair and its computed contrast ratio. A sample, explicitly:
 *  the collector caps how many it takes, and says so in the result. */
export interface ContrastSampleEvidence {
  readonly selector: string;
  readonly foreground: string;
  readonly background: string;
  readonly ratio: number;
  readonly fontSizePx: number;
  readonly fontWeight: number;
}

export interface AccessibilityEvidence {
  readonly landmarks: readonly LandmarkEvidence[];
  readonly headings: readonly HeadingEvidence[];
  readonly images: readonly ImageEvidence[];
  readonly formControls: readonly FormControlEvidence[];
  readonly contrastSamples: readonly ContrastSampleEvidence[];
  /** Names any category whose cap was reached, so a report can never read a truncated list as an
   *  exhaustive one. */
  readonly truncated: readonly string[];
}

export interface DocumentEvidence {
  readonly httpStatus: number;
  /** The URL actually loaded, after redirects — what `isSameOriginUrl` is re-checked against. */
  readonly finalUrl: string;
  readonly redirected: boolean;
  readonly title: string;
  /** The `<html lang>` attribute, or `null` when absent. */
  readonly lang: string | null;
  readonly headers: readonly HeaderEvidence[];
  /** A bounded excerpt of the page's visible text, for quoting placeholder/boilerplate copy. */
  readonly textExcerpt: string;
  readonly textTruncated: boolean;
}

/** Everything one page load produced. Every field is optional-by-absence rather than defaulted:
 *  a section that was not collected is missing, and a report must treat missing as
 *  "not observed", never as "observed to be empty". */
export interface PageObservation {
  readonly document: DocumentEvidence;
  readonly cookies: readonly CookieEvidence[];
  readonly requests: readonly RequestEvidence[];
  readonly accessibility?: AccessibilityEvidence;
  /** Free-text notes the adapter produced about the observation itself (e.g. "consent selector
   *  matched no element"). Never findings — the adapter has no opinion about compliance. */
  readonly notes: readonly string[];
}

/** What the collector asks the browser to do for one page. */
export interface ObservePageRequest {
  /** Already normalized and already joined to the workspace's own verified origin. The adapter
   *  does not re-derive it and must not accept anything else. */
  readonly url: string;
  /** The origin every `firstParty` flag is computed against. */
  readonly originBaseUrl: string;
  /** A CSS selector for the site's consent-accept control. When present the adapter clicks it once
   *  and re-observes; when absent no interaction happens at all. */
  readonly consentAcceptSelector?: string;
  readonly collectAccessibility: boolean;
  readonly timeoutMs: number;
  readonly maxTextExcerptChars: number;
  readonly maxCookies: number;
  readonly maxRequests: number;
  readonly maxAccessibilityNodesPerCategory: number;
  readonly maxContrastSamples: number;
}

export type ObservePageResult =
  | { readonly ok: true; readonly observation: PageObservation }
  | { readonly ok: false; readonly reason: string };

export interface SiteEvidenceBrowserPort {
  /** Loads one page in a fresh, isolated, non-persistent context and returns what was observed.
   *  Never throws for an expected failure (navigation error, timeout) — those come back as
   *  `{ ok: false, reason }` so one bad page does not end the run. */
  observe(request: ObservePageRequest): Promise<ObservePageResult>;
  /** Releases the underlying browser. Always called by the collector, including on failure. */
  close(): Promise<void>;
}

export type SiteEvidenceBrowserAvailability =
  | { readonly available: true; readonly browser: SiteEvidenceBrowserPort }
  | { readonly available: false; readonly reason: string };

/** Opens a browser, or explains why this deployment has none. See this file's header, point 1. */
export type SiteEvidenceBrowserFactory = () => Promise<SiteEvidenceBrowserAvailability>;
