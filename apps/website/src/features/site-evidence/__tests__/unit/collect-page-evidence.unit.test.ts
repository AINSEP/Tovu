import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/cms/core";

import type { ObservePageRequest, ObservePageResult, PageObservation, SiteEvidenceBrowserFactory } from "../../browser-port.js";
import { collectPageEvidence, SITE_EVIDENCE_LIMITS, type CollectPageEvidenceDeps } from "../../collect-page-evidence.js";
import { OriginNotVerifiedError, type OriginRegistryPort, type VerifiedOrigin } from "#src/features/origin/index";

/**
 * @file `collectPageEvidence()` — the bounds and the no-verdict contract, exercised against a fake
 * browser.
 *
 * Every one of these is a property the tool PROMISES to an operator who is about to let a headless
 * browser run on their server: it will not visit anyone else's site, it will not run forever, it
 * will not load a hundred pages, and it will not tell them they are compliant. None of them needs a
 * real browser to assert, and none of them should — a guarantee that can only be checked by
 * downloading Chromium is a guarantee nobody checks.
 */

const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444" as UUID;

const ORIGIN: VerifiedOrigin = {
  scheme: "https",
  host: "example.test",
  verifiedAt: "2026-08-26T00:00:00.000Z",
  source: "workspace-setting",
};

function originRegistry(origin: VerifiedOrigin | Error = ORIGIN): OriginRegistryPort {
  return {
    async canonicalOrigin() {
      if (origin instanceof Error) throw origin;
      return origin;
    },
    async isAllowedRedirectTarget() {
      return false;
    },
    async isAllowedEgressTarget() {
      return false;
    },
  };
}

function observation(overrides: { finalUrl?: string } = {}): PageObservation {
  return {
    document: {
      httpStatus: 200,
      finalUrl: overrides.finalUrl ?? "https://example.test/",
      redirected: false,
      title: "Example",
      lang: "en",
      headers: [{ name: "content-type", value: "text/html" }],
      textExcerpt: "hello",
      textTruncated: false,
    },
    cookies: [],
    requests: [],
    notes: [],
  };
}

interface FakeBrowser {
  readonly factory: SiteEvidenceBrowserFactory;
  readonly visited: string[];
  closed: number;
}

function fakeBrowser(respond: (request: ObservePageRequest) => ObservePageResult = () => ({ ok: true, observation: observation() })): FakeBrowser {
  const state: FakeBrowser = {
    visited: [],
    closed: 0,
    factory: async () => ({
      available: true,
      browser: {
        async observe(request) {
          state.visited.push(request.url);
          return respond(request);
        },
        async close() {
          state.closed += 1;
        },
      },
    }),
  };
  return state;
}

function deps(browser: SiteEvidenceBrowserFactory, overrides: Partial<CollectPageEvidenceDeps> = {}): CollectPageEvidenceDeps {
  return { workspaceId: WORKSPACE_ID, originRegistry: originRegistry(), openBrowser: browser, ...overrides };
}

test("only this workspace's own verified origin is ever visited", async () => {
  const browser = fakeBrowser();
  const result = await collectPageEvidence(deps(browser.factory), { paths: ["/", "/pricing"] });

  assert.deepEqual(browser.visited, ["https://example.test/", "https://example.test/pricing"]);
  assert.equal(result.origin, "https://example.test");
});

test("an off-origin input never reaches the browser at all — it is refused before navigation", async () => {
  const browser = fakeBrowser();
  const result = await collectPageEvidence(deps(browser.factory), {
    paths: ["https://evil.example/steal", "//evil.example/steal", "\\\\evil.example", "/ok"],
  });

  assert.deepEqual(browser.visited, ["https://example.test/ok"], "no hostile input may produce a navigation");
  assert.deepEqual(
    result.skipped.filter((entry) => entry.reason === "invalid-path").map((entry) => entry.path),
    ["https://evil.example/steal", "//evil.example/steal", "\\\\evil.example"],
  );
  assert.equal(result.pages.length, 1);
});

test("a server-side redirect off the origin is recorded as evidence and its content is discarded", async () => {
  const browser = fakeBrowser((request) =>
    request.url.endsWith("/redirects-away")
      ? { ok: true, observation: observation({ finalUrl: "https://evil.example/landing?token=SECRET" }) }
      : { ok: true, observation: observation() },
  );

  const result = await collectPageEvidence(deps(browser.factory), { paths: ["/redirects-away", "/ok"] });

  assert.deepEqual(result.pages.map((page) => page.path), ["/ok"]);
  const skipped = result.skipped.find((entry) => entry.path === "/redirects-away");
  assert.equal(skipped?.reason, "off-origin-redirect");
  assert.ok(skipped?.message.includes("https://evil.example"));
  assert.ok(
    !skipped?.message.includes("SECRET"),
    "the redirect target is reduced to its origin — its path and query are somebody else's data",
  );
});

test("the page cap is enforced, and the excess is REPORTED rather than silently dropped", async () => {
  const browser = fakeBrowser();
  const paths = ["/a", "/b", "/c", "/d", "/e", "/f", "/g"];
  const result = await collectPageEvidence(deps(browser.factory), { paths });

  assert.equal(browser.visited.length, SITE_EVIDENCE_LIMITS.maxPagesPerCall);
  assert.equal(result.pages.length, SITE_EVIDENCE_LIMITS.maxPagesPerCall);
  assert.deepEqual(
    result.skipped.filter((entry) => entry.reason === "page-cap").map((entry) => entry.path),
    ["/f", "/g"],
  );
});

test("an invalid path is reported as invalid even when it comes after the cap is reached", async () => {
  const browser = fakeBrowser();
  const result = await collectPageEvidence(deps(browser.factory), {
    paths: ["/a", "/b", "/c", "/d", "/e", "https://evil.example/steal"],
  });

  const hostile = result.skipped.find((entry) => entry.path === "https://evil.example/steal");
  assert.equal(hostile?.reason, "invalid-path", "a refused origin must never be masked as a mere cap overflow");
});

test("the whole-call deadline stops further page loads and names the reason", async () => {
  const browser = fakeBrowser();
  // Call order: startedAt, then one pre-load check per requested page. The first page is inside
  // budget; by the second, the whole-call deadline has passed.
  const ticks = [1_000, 1_000, 1_000 + SITE_EVIDENCE_LIMITS.maxTotalMs];
  let call = 0;
  const result = await collectPageEvidence(
    deps(browser.factory, { now: () => ticks[Math.min(call++, ticks.length - 1)] as number }),
    { paths: ["/a", "/b", "/c"] },
  );

  assert.equal(browser.visited.length, 1, "the deadline must stop the run, not merely be reported afterwards");
  assert.deepEqual(result.skipped.filter((entry) => entry.reason === "deadline").map((entry) => entry.path), ["/b", "/c"]);
});

test("the per-page budget handed to the browser is the collector's own constant, not a caller's", async () => {
  const seen: ObservePageRequest[] = [];
  const browser = fakeBrowser((request) => {
    seen.push(request);
    return { ok: true, observation: observation() };
  });
  await collectPageEvidence(deps(browser.factory), { paths: ["/"] });

  const request = seen[0];
  assert.equal(request?.timeoutMs, SITE_EVIDENCE_LIMITS.maxPageLoadMs);
  assert.equal(request?.maxCookies, SITE_EVIDENCE_LIMITS.maxCookies);
  assert.equal(request?.maxRequests, SITE_EVIDENCE_LIMITS.maxRequests);
  assert.equal(request?.maxTextExcerptChars, SITE_EVIDENCE_LIMITS.maxTextExcerptChars);
  assert.equal(request?.originBaseUrl, "https://example.test");
});

test("the browser is always closed — including when a page load fails", async () => {
  const browser = fakeBrowser(() => ({ ok: false, reason: "boom" }));
  await collectPageEvidence(deps(browser.factory), { paths: ["/a", "/b"] });
  assert.equal(browser.closed, 1);
});

test("an unavailable browser degrades to explicit skips — never to a config-derived guess", async () => {
  const factory: SiteEvidenceBrowserFactory = async () => ({ available: false, reason: "no chromium in this deployment" });
  const result = await collectPageEvidence(deps(factory), { paths: ["/", "/pricing"] });

  assert.deepEqual(result.pages, [], "no browser means no observations, not partial ones");
  assert.equal(result.browser.status, "unavailable");
  assert.equal(result.browser.status === "unavailable" && result.browser.reason, "no chromium in this deployment");
  assert.deepEqual(
    result.skipped.map((entry) => [entry.path, entry.reason]),
    [
      ["/", "browser-unavailable"],
      ["/pricing", "browser-unavailable"],
    ],
  );
});

test("a navigation failure skips one page without ending the run", async () => {
  const browser = fakeBrowser((request) => (request.url.endsWith("/dead") ? { ok: false, reason: "timed out" } : { ok: true, observation: observation() }));
  const result = await collectPageEvidence(deps(browser.factory), { paths: ["/dead", "/alive"] });

  assert.deepEqual(result.pages.map((page) => page.path), ["/alive"]);
  const skipped = result.skipped.find((entry) => entry.path === "/dead");
  assert.equal(skipped?.reason, "navigation-failed");
  assert.equal(skipped?.message, "timed out");
});

test("with no consent selector, the result SAYS no consent transition was performed", async () => {
  const browser = fakeBrowser();
  const result = await collectPageEvidence(deps(browser.factory), { paths: ["/"] });

  assert.equal(result.consentTransition.attempted, false);
  assert.ok(
    result.consentTransition.attempted === false && result.consentTransition.reason.includes("pre-consent"),
    "a report must not be able to read an all-'before' phase as though acceptance changed nothing",
  );
});

test("a consent selector is passed through and reported", async () => {
  const seen: ObservePageRequest[] = [];
  const browser = fakeBrowser((request) => {
    seen.push(request);
    return { ok: true, observation: observation() };
  });
  const result = await collectPageEvidence(deps(browser.factory), { paths: ["/"], consentAcceptSelector: "#accept" });

  assert.equal(seen[0]?.consentAcceptSelector, "#accept");
  assert.deepEqual(result.consentTransition, { attempted: true, selector: "#accept" });
});

test("the result carries the limits it enforced, so a truncated list is distinguishable from a complete one", async () => {
  const browser = fakeBrowser();
  const result = await collectPageEvidence(deps(browser.factory), { paths: ["/"] });
  assert.deepEqual(result.limits, SITE_EVIDENCE_LIMITS);
});

test("the result contains NO verdict-shaped field anywhere", async () => {
  const browser = fakeBrowser();
  const result = await collectPageEvidence(deps(browser.factory), { paths: ["/"], consentAcceptSelector: "#accept" });

  // Asserted over the serialized result rather than field by field: a future field named `passed`
  // or `score` nested three levels down would slip past a shallow key check.
  const serialized = JSON.stringify(result);
  for (const forbidden of ['"compliant"', '"nonCompliant"', '"passed"', '"failed"', '"score"', '"grade"', '"violation"', '"severity"']) {
    assert.ok(!serialized.includes(forbidden), `the evidence tool must never emit ${forbidden} — that would be a verdict`);
  }
  assert.ok(result.disclaimer.includes("does not evaluate, score, or determine compliance"));
});

test("a workspace with no verified origin propagates OriginNotVerifiedError rather than guessing one", async () => {
  const browser = fakeBrowser();
  await assert.rejects(
    () =>
      collectPageEvidence(
        { workspaceId: WORKSPACE_ID, originRegistry: originRegistry(new OriginNotVerifiedError("none registered")), openBrowser: browser.factory },
        { paths: ["/"] },
      ),
    OriginNotVerifiedError,
  );
  assert.deepEqual(browser.visited, [], "with no origin there is no same-origin boundary — nothing may be loaded");
});
