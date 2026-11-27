import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/core/primitives";
import { ForbiddenError } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import type { RenderBrowser, RenderContext } from "@jini-ai/diagnostics/web-evidence/playwright";
import type { HttpRequest } from "#src/platform/http/index";
import { playwrightModuleLoader } from "#src/platform/headless-browser/playwright-loader";

import {
  OriginNotVerifiedError,
  type OriginRegistryPort,
  type VerifiedOrigin,
} from "@jini-ai/core/contracts/server/verified-origin";
import { siteEvidenceAgentToolCatalog, SITE_EVIDENCE_TOOL_ID } from "@jini-ai/diagnostics/web-evidence/agent-tools";
import { SITE_EVIDENCE_LIMITS } from "@jini-ai/diagnostics/web-evidence";
import type { ObservePageRequest, PageObservation, SiteEvidenceBrowserFactory } from "@jini-ai/diagnostics/web-evidence";
import {
  buildSiteEvidenceRegistrations,
  contributeSiteEvidenceTools,
  readOptionalEvidenceArguments,
  readPathsArgument,
  siteEvidenceDerivedRisk,
  type SiteEvidenceToolDeps,
} from "../../tool-registrations.js";

/**
 * @file The `site_collect_page_evidence` registration — its argument contract, its authorization
 * check, and the two properties an operator is really trusting: it reads nothing it should not, and
 * it never answers a compliance question.
 */

const WORKSPACE_ID = "55555555-5555-4555-8555-555555555555" as UUID;
const PRINCIPAL_ID = "66666666-6666-4666-8666-666666666666";

const ORIGIN: VerifiedOrigin = { scheme: "https", host: "example.test", verifiedAt: "2026-08-26T00:00:00.000Z", source: "workspace-setting" };

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

const unavailableBrowser: SiteEvidenceBrowserFactory = async () => ({ available: false, reason: "no browser in this test" });

function toolDeps(overrides: Partial<SiteEvidenceToolDeps> = {}): SiteEvidenceToolDeps {
  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true }) as never,
    originRegistry: originRegistry(),
    siteEvidenceBrowser: unavailableBrowser,
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: ToolHandler's ctx type is owned by @jini-ai/cms/core and is not exported; a structural stand-in here would drift from it silently.
function toolContext(input: unknown): any {
  return { input, principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: { id: SITE_EVIDENCE_TOOL_ID } };
}

test("the catalog declares exactly one tool, read-only, permission-gated", () => {
  assert.equal(siteEvidenceAgentToolCatalog.length, 1);
  const [definition] = siteEvidenceAgentToolCatalog;
  assert.equal(definition?.name, SITE_EVIDENCE_TOOL_ID);
  assert.equal(definition?.sideEffects, "none");
  assert.equal(definition?.authorization.permission, "content.read");
  assert.equal(siteEvidenceDerivedRisk.get(SITE_EVIDENCE_TOOL_ID), "none");
});

test("the tool description tells the model the two things it must not get wrong", () => {
  const description = siteEvidenceAgentToolCatalog[0]?.description ?? "";
  assert.ok(description.includes("site-relative paths, never URLs"), "the same-origin scope must be stated to the caller");
  assert.ok(description.includes("EVIDENCE, NOT VERDICTS"));
  assert.ok(description.includes("never submits a form"));
  assert.ok(
    description.includes("absence of an observation is never evidence"),
    "the single most dangerous misreading of this tool's output must be pre-empted in its own description",
  );
});

test("the input schema cannot express a URL, a host, or more than the page cap", () => {
  const schema = siteEvidenceAgentToolCatalog[0]?.inputSchema as Record<string, unknown>;
  const properties = schema.properties as Record<string, Record<string, unknown>>;

  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["paths"]);
  assert.equal(properties.paths?.maxItems, 5);
  assert.deepEqual(Object.keys(properties).sort(), ["collectAccessibility", "collectPerformance", "consentAcceptSelector", "paths"]);
  assert.ok(!("url" in properties) && !("host" in properties) && !("origin" in properties));
});

test("readPathsArgument rejects every wrong shape with an actionable message", () => {
  assert.throws(() => readPathsArgument({}), /'paths' is required and must be an array/);
  assert.throws(() => readPathsArgument({ paths: "/pricing" }), /'paths' is required and must be an array/);
  assert.throws(() => readPathsArgument({ paths: [] }), /'paths' must contain at least one site-relative path/);
  assert.throws(() => readPathsArgument({ paths: ["/ok", 7] }), /'paths\[1\]' must be a string, got number/);
  assert.deepEqual(readPathsArgument({ paths: ["/a", "/b"] }), ["/a", "/b"]);
});

test("readOptionalEvidenceArguments trims, drops empties, and rejects wrong types", () => {
  assert.deepEqual(readOptionalEvidenceArguments({}), {});
  assert.deepEqual(readOptionalEvidenceArguments({ consentAcceptSelector: "  #accept  " }), { consentAcceptSelector: "#accept" });
  assert.deepEqual(readOptionalEvidenceArguments({ consentAcceptSelector: "   " }), {}, "a blank selector is no selector");
  assert.deepEqual(readOptionalEvidenceArguments({ collectAccessibility: false }), { collectAccessibility: false });
  assert.throws(() => readOptionalEvidenceArguments({ consentAcceptSelector: 7 }), /must be a CSS selector string/);
  assert.throws(() => readOptionalEvidenceArguments({ collectAccessibility: "yes" }), /must be a boolean/);
});

// ---------------------------------------------------------------------------
// 500-redact defect (RED->GREEN): both validators above used to reject with a bare `Error`, which
// `@jini-ai/daemon`'s `ToolExecutor` tags `errorKind: 'internal'` — the classification
// `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` SEC-005-redacts into a message-stripped 500.
// Both now throw `ToolInputError`, mirroring `features/post/tool-registrations.ts`'s fix shape.
// ---------------------------------------------------------------------------

test("readPathsArgument's rejection is a ToolInputError (400), not a bare Error (redacted 500)", () => {
  assert.throws(() => readPathsArgument({}), (err: unknown) => err instanceof ToolInputError);
  assert.throws(() => readPathsArgument({ paths: [] }), (err: unknown) => err instanceof ToolInputError);
  assert.throws(() => readPathsArgument({ paths: ["/ok", 7] }), (err: unknown) => err instanceof ToolInputError);
});

test("readOptionalEvidenceArguments's rejection is a ToolInputError (400), not a bare Error (redacted 500)", () => {
  assert.throws(() => readOptionalEvidenceArguments({ consentAcceptSelector: 7 }), (err: unknown) => err instanceof ToolInputError);
  assert.throws(() => readOptionalEvidenceArguments({ collectAccessibility: "yes" }), (err: unknown) => err instanceof ToolInputError);
});

test("the handler refuses a caller the authorizer denies", async () => {
  const requests: unknown[] = [];
  const registrations = buildSiteEvidenceRegistrations(toolDeps({
      authorize: async (request) => {
        // Optional entity scope may be omitted by the package adapter; record its semantic value.
        requests.push({ ...request, entityId: request.entityId });
        return { allowed: request.permission === "content.write", reason: "read denied" } as never;
      },
      originRegistry: { ...originRegistry(), canonicalOrigin: async () => { assert.fail("origin lookup before authorization"); } },
      siteEvidenceBrowser: async () => { assert.fail("browser opened before authorization"); },
    })
  );
  const registration = registrations.find((entry) => entry.descriptor.id === SITE_EVIDENCE_TOOL_ID);
  assert.ok(registration);

  await assert.rejects(() => registration.handler(toolContext({ paths: ["/"] })), (error: unknown) => {
    assert.ok(error instanceof ForbiddenError);
    assert.equal(error.message, `principal '${PRINCIPAL_ID}' is not authorized for 'content.read' (read denied)`);
    return true;
  });
  assert.deepEqual(requests, [{ principalId: PRINCIPAL_ID, workspaceId: WORKSPACE_ID, permission: "content.read", entityType: "post", entityId: undefined }]);
});

test("the handler returns evidence-shaped data when the browser is unavailable, not an error", async () => {
  const registration = buildSiteEvidenceRegistrations(toolDeps()).find((entry) => entry.descriptor.id === SITE_EVIDENCE_TOOL_ID);
  assert.ok(registration);

  const result = (await registration.handler(toolContext({ paths: ["/", "/pricing"] }))) as Record<string, unknown>;
  assert.equal((result.browser as { status: string }).status, "unavailable");
  assert.deepEqual(result.pages, []);
  assert.equal((result.skipped as unknown[]).length, 2);
});

test("a workspace with no verified origin returns an explicit 'cannot collect' payload, not a stack trace", async () => {
  const registration = buildSiteEvidenceRegistrations(toolDeps({ originRegistry: originRegistry(new OriginNotVerifiedError({ message: "no verified origin registered" })) })
  ).find((entry) => entry.descriptor.id === SITE_EVIDENCE_TOOL_ID);
  assert.ok(registration);

  const result = (await registration.handler(toolContext({ paths: ["/"] }))) as Record<string, unknown>;
  assert.equal(result.collected, false);
  assert.ok(String(result.reason).includes("cannot-determine"), "the model must be told the correct way to report this");
  assert.ok(String(result.reason).includes("no verified canonical origin"));
});

test("the available-browser handler forwards optional inputs, returns same-origin evidence and closes after refusals", async () => {
  const requests: ObservePageRequest[] = [];
  let closed = 0;
  const observed: PageObservation = {
    document: { httpStatus: 200, finalUrl: "https://example.test/ok", redirected: false, title: "Observed", lang: "en", headers: [], textExcerpt: "Canary text", textTruncated: false },
    cookies: [], requests: [], notes: [],
  };
  const registration = buildSiteEvidenceRegistrations(toolDeps({
    authorize: async (request) => ({ allowed: request.permission === "content.read" && request.principalId === PRINCIPAL_ID && request.workspaceId === WORKSPACE_ID }) as never,
    siteEvidenceBrowser: async () => ({ available: true, browser: {
      observe: async (request, options) => {
        requests.push({ ...request, ...options });
        if (request.url.endsWith("/broken")) throw new Error("navigation failed");
        return { ok: true, observation: request.url.endsWith("/away")
          ? { ...observed, document: { ...observed.document, finalUrl: "https://other.test/private?secret=canary" } }
          : observed };
      },
      close: async () => { closed += 1; },
    } }),
  })).find((entry) => entry.descriptor.id === SITE_EVIDENCE_TOOL_ID)!;
  const result = await registration.handler(toolContext({ paths: ["/ok", "/away", "/broken"], consentAcceptSelector: "  #accept  ", collectAccessibility: false })) as {
    pages: unknown[]; skipped: { path: string; reason: string }[];
  };
  assert.deepEqual(requests, ["/ok", "/away", "/broken"].map((path) => ({
    url: `https://example.test${path}`, originBaseUrl: "https://example.test", consentAcceptSelector: "#accept", collectAccessibility: false,
    timeoutMs: SITE_EVIDENCE_LIMITS.maxPageLoadMs, maxTextExcerptChars: SITE_EVIDENCE_LIMITS.maxTextExcerptChars,
    maxCookies: SITE_EVIDENCE_LIMITS.maxCookies, maxRequests: SITE_EVIDENCE_LIMITS.maxRequests,
    maxAccessibilityNodesPerCategory: SITE_EVIDENCE_LIMITS.maxAccessibilityNodesPerCategory, maxContrastSamples: SITE_EVIDENCE_LIMITS.maxContrastSamples,
  })));
  assert.deepEqual(result.pages, [{ path: "/ok", url: "https://example.test/ok", observation: observed }]);
  assert.deepEqual(result.skipped.map(({ path, reason }) => ({ path, reason })), [{ path: "/away", reason: "off-origin-redirect" }, { path: "/broken", reason: "navigation-failed" }]);
  assert.equal(JSON.stringify(result).includes("secret=canary"), false);
  assert.equal(closed, 1);
});


test('performance diagnostics are explicit opt-in and reject non-boolean input', () => {
  assert.deepEqual(readOptionalEvidenceArguments({}), {});
  assert.deepEqual(readOptionalEvidenceArguments({ collectPerformance: true }), { collectPerformance: true });
  assert.deepEqual(readOptionalEvidenceArguments({ collectPerformance: false }), { collectPerformance: false });
  assert.throws(() => readOptionalEvidenceArguments({ collectPerformance: 'true' }), ToolInputError);
});

test("optional evidence arguments preserve omission, selector normalization and explicit flag combinations", () => {
  const cases = [undefined, "", " \t\n ", "  #accept  "].flatMap(selector =>
    [undefined, false, true].flatMap(collectAccessibility =>
      [undefined, false, true].map(collectPerformance => ({ selector, collectAccessibility, collectPerformance })),
    ),
  );
  for (const { selector, collectAccessibility, collectPerformance } of cases) {
    const input = Object.freeze({ consentAcceptSelector: selector, collectAccessibility, collectPerformance });
    const expected: Record<string, unknown> = {};
    if (collectPerformance !== undefined) expected.collectPerformance = collectPerformance;
    if (selector === "  #accept  ") expected.consentAcceptSelector = "#accept";
    if (collectAccessibility !== undefined) expected.collectAccessibility = collectAccessibility;
    const actual = readOptionalEvidenceArguments(input);
    assert.deepEqual(actual, expected);
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
  }
});

test("optional evidence arguments reject invalid selector values with the original typed message", () => {
  for (const consentAcceptSelector of [null, false, 0, [], {}, new String("#accept")]) {
    assert.throws(() => readOptionalEvidenceArguments({ consentAcceptSelector }), {
      name: ToolInputError.name,
      message: "'consentAcceptSelector' must be a CSS selector string when provided",
    });
  }
});

test("optional evidence flags reject non-booleans rather than coercing truthy or falsy values", () => {
  for (const name of ["collectAccessibility", "collectPerformance"]) {
    for (const value of [null, "", "false", 0, 1, [], {}, new Boolean(false)]) {
      assert.throws(() => readOptionalEvidenceArguments({ [name]: value }), {
        name: ToolInputError.name,
        message: `'${name}' must be a boolean when provided`,
      });
    }
  }
});

test("optional evidence argument validation reports selector then accessibility then performance errors", () => {
  const input: Record<string, unknown> = {
    consentAcceptSelector: null, collectAccessibility: null, collectPerformance: null,
  };
  assert.throws(() => readOptionalEvidenceArguments(input), {
    name: ToolInputError.name,
    message: "'consentAcceptSelector' must be a CSS selector string when provided",
  });
  input.consentAcceptSelector = " #accept ";
  assert.throws(() => readOptionalEvidenceArguments(input), {
    name: ToolInputError.name,
    message: "'collectAccessibility' must be a boolean when provided",
  });
  input.collectAccessibility = false;
  assert.throws(() => readOptionalEvidenceArguments(input), {
    name: ToolInputError.name,
    message: "'collectPerformance' must be a boolean when provided",
  });
});

test("an unexpected origin registry failure is not reclassified as unverified origin", async () => {
  const failure = new Error("origin storage read failed");
  const registration = buildSiteEvidenceRegistrations(toolDeps({
    originRegistry: originRegistry(failure),
    siteEvidenceBrowser: async () => assert.fail("origin lookup failed before browser setup"),
  })).find(entry => entry.descriptor.id === SITE_EVIDENCE_TOOL_ID);
  assert.ok(registration);
  await assert.rejects(registration.handler(toolContext({ paths: ["/"] })), error => error === failure);
});

test("the contributor keeps a missing browser reportable with or without a guarded renderer client", async t => {
  const launchOptions: unknown[] = [];
  t.mock.method(playwrightModuleLoader, "load", async (required: { moduleName: string }) => {
    assert.deepEqual(required, { moduleName: "playwright" });
    return { chromium: { launch: async (options: unknown) => {
      launchOptions.push(options);
      throw new Error("browser deliberately unavailable");
    } } };
  });
  const httpClient = { send: async () => assert.fail("a failed browser launch must not fetch") };
  for (const configured of [false, true]) {
    launchOptions.length = 0;
    const contributor = contributeSiteEvidenceTools(configured ? { httpClient } : {});
    const { siteEvidenceBrowser: _injected, ...deps } = toolDeps();
    const registration = contributor.build(deps, undefined).find(entry => entry.descriptor.id === SITE_EVIDENCE_TOOL_ID);
    assert.ok(registration);
    assert.deepEqual(launchOptions, []);
    const result = await registration.handler(toolContext({ paths: ["/pricing"] })) as { browser: { status: string; reason: string }; pages: unknown[]; skipped: { path: string; reason: string }[] };
    assert.equal(result.browser.status, "unavailable");
    assert.match(result.browser.reason, /Neither bundled Chromium nor system Chrome could be launched/);
    assert.deepEqual(result.pages, []);
    assert.deepEqual(result.skipped.map(({ path, reason }) => [path, reason]), [["/pricing", "browser-unavailable"]]);
    const launch = configured
      ? { headless: true, args: ["--disable-dev-shm-usage", "--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--no-sandbox"] }
      : { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
    assert.deepEqual(launchOptions, [launch, { ...launch, channel: "chrome" }]);
  }
});

test("the default evidence browser routes third-party assets through the guarded client and keeps own-site cookies local", async t => {
  const ownUrl = "https://example.test/pricing";
  const cssUrl = "https://assets.example.test/layout.css";
  const css = "body{color:navy}";
  const guarded: HttpRequest[] = [];
  const direct: unknown[] = [];
  const fulfilled = new Map<string, string>();
  let contextClosed = 0, browserClosed = 0;
  let intercept: Parameters<RenderContext["route"]>[1] | undefined;
  const browser: RenderBrowser = {
    close: async () => { browserClosed++; },
    newContext: async () => ({
      route: async (pattern, handler) => { assert.equal(pattern, "**/*"); intercept = handler; },
      close: async () => { contextClosed++; },
      cookies: async () => [],
      newPage: async () => ({
        goto: async url => {
          assert.equal(url, ownUrl);
          assert.ok(intercept, "the guard is installed before navigation");
          for (const [resourceUrl, resourceType] of [[url, "document"], [cssUrl, "stylesheet"]] as const) {
            await intercept({
              request: () => ({
                url: () => resourceUrl, method: () => "GET", headers: () => ({ cookie: resourceType === "document" ? "visitor=demo" : "asset=fresh" }),
                resourceType: () => resourceType, isNavigationRequest: () => resourceType === "document",
                frame: () => ({ parentFrame: () => null }),
              }),
              fulfill: async response => { fulfilled.set(resourceUrl, response.body.toString("utf8")); },
              abort: async code => assert.fail(`unexpected refusal of ${resourceType}: ${code}`),
            });
          }
          return { status: () => 200 };
        },
        evaluate: async () => ({ title: "Pricing", lang: "en", textExcerpt: "Sample pricing", textTruncated: false }),
        title: async () => "Pricing",
        waitForTimeout: async ms => { assert.equal(ms, 1200); },
      }),
    }),
  };
  t.mock.method(playwrightModuleLoader, "load", async () => ({ chromium: { launch: async () => browser } }));
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    direct.push([String(url), options?.method, new Headers(options?.headers).get("cookie"), options?.redirect]);
    return new Response("own site");
  });
  const httpClient = { send: async (request: HttpRequest) => {
    guarded.push(request);
    assert.deepEqual({ ...request, signal: request.signal?.aborted }, {
      method: "GET", url: cssUrl, headers: {}, signal: false, timeoutMs: 15_000, maxResponseBytes: 15 * 1024 * 1024,
    });
    return { status: 200, headers: { "content-type": "text/css" }, bodyText: css };
  } };
  const { siteEvidenceBrowser: _injected, ...deps } = toolDeps();
  const registration = contributeSiteEvidenceTools({ httpClient }).build(deps, undefined).find(entry => entry.descriptor.id === SITE_EVIDENCE_TOOL_ID);
  assert.ok(registration);
  const result = await registration.handler(toolContext({ paths: ["/pricing"], collectAccessibility: false })) as { pages: { path: string; observation: PageObservation }[]; skipped: unknown[] };
  assert.deepEqual(result.skipped, []);
  assert.equal(result.pages.find(page => page.path === "/pricing")?.observation.document.textExcerpt, "Sample pricing");
  assert.deepEqual(direct, [[ownUrl, "GET", "visitor=demo", "manual"]]);
  assert.deepEqual([...fulfilled], [[ownUrl, "own site"], [cssUrl, css]]);
  assert.equal(guarded.length, 1);
  assert.equal(guarded[0]?.signal?.aborted, true);
  assert.deepEqual([contextClosed, browserClosed], [1, 1]);
});
