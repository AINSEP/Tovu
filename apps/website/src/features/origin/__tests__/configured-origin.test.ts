import assert from "node:assert/strict";
import test from "node:test";

import { planOriginBoot, resolveConfiguredOrigin } from "../configured-origin.js";
import type { VerifiedOrigin } from "../types.js";

/**
 * @file Unit suite for `resolveConfiguredOrigin` — the env-declared public-origin resolver
 * (2026-09-18, `ADS-memory/reports/2026-09-18-public-origin-registration-design.md`).
 *
 * This is the ONLY input by which a real public origin can enter the ADR-040 registry, so its
 * rejection pipeline is the security surface: every refusal below is asserted individually with its
 * exact warning text, not a loose match. A value this function accepts becomes the canonical origin
 * for the sitemap, canonical/og tags, magic links, newsletter confirm/unsubscribe links, redirect
 * same-origin verdicts, and the egress allowlist — so a wrongly-accepted value is wrong in eleven
 * places at once.
 *
 * `https://localhost:3000` gets its own case because that is the literal value this repo's own
 * `.env` carries: without the loopback refusal, reusing `TOVU_PUBLIC_URL` would silently flip local
 * dev from a `dev-capability` origin to a `workspace-setting` one and override `deriveDevScheme`'s
 * TLS derivation (the 2026-09-05 audit fix).
 */

const NOW = "2026-09-18T00:00:00.000Z";

/** Collects warnings so each refusal's exact operator-facing text can be asserted. */
function capture() {
  const warnings: string[] = [];
  return { warnings, warn: (message: string) => warnings.push(message) };
}

function resolve(value: string | undefined) {
  const { warnings, warn } = capture();
  const env = value === undefined ? {} : { TOVU_PUBLIC_URL: value };
  const origin = resolveConfiguredOrigin({ now: NOW }, { env, warn });
  return { origin, warnings };
}

function refusalMessage(reason: string, value: string): string {
  return (
    `TOVU_PUBLIC_URL is set but was refused as this deployment's public origin (${reason}); ` +
    `no origin was registered from it. Value: ${value}`
  );
}

test("resolveConfiguredOrigin: a valid public https URL yields a workspace-setting VerifiedOrigin", () => {
  const { origin, warnings } = resolve("https://tovu.fly.dev");
  const expected: VerifiedOrigin = {
    scheme: "https",
    host: "tovu.fly.dev",
    verifiedAt: NOW,
    source: "workspace-setting",
  };
  assert.deepStrictEqual(origin, expected);
  assert.deepEqual(warnings, []);
});

// `port`/`basePath` are genuinely optional fields. An object literal carrying an explicit
// `undefined`-valued key is NOT deepStrictEqual to one that never had the key — the same strictness
// `origin-repo.sqlite.ts`'s `toVerifiedOrigin` is built around. Pinned so a later refactor to
// `port: url.port ? Number(url.port) : undefined` cannot slip through.
test("resolveConfiguredOrigin: omits the port and basePath keys entirely when the URL has neither", () => {
  const { origin } = resolve("https://tovu.fly.dev/");
  assert.deepStrictEqual(Object.keys(origin ?? {}).sort(), ["host", "scheme", "source", "verifiedAt"]);
});

test("resolveConfiguredOrigin: keeps an explicit non-default port", () => {
  const { origin } = resolve("https://tovu.example:8443");
  assert.equal(origin?.port, 8443);
});

test("resolveConfiguredOrigin: keeps a basePath and strips its trailing slash", () => {
  assert.equal(resolve("https://tovu.example/site/").origin?.basePath, "/site");
  assert.equal(resolve("https://tovu.example/site").origin?.basePath, "/site");
});

test("resolveConfiguredOrigin: lower-cases the host and strips a single trailing dot", () => {
  assert.equal(resolve("https://Tovu.Fly.Dev./").origin?.host, "tovu.fly.dev");
});

test("resolveConfiguredOrigin: an unset TOVU_PUBLIC_URL yields undefined and warns nothing", () => {
  const { origin, warnings } = resolve(undefined);
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, [], "an unset public URL is the normal local-dev case, not an operator error");
});

test("resolveConfiguredOrigin: a blank TOVU_PUBLIC_URL yields undefined and warns nothing", () => {
  const { origin, warnings } = resolve("   ");
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, []);
});

test("resolveConfiguredOrigin: an unparseable value is refused with the exact warning", () => {
  const { origin, warnings } = resolve("not a url");
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, [refusalMessage("it is not a parseable URL", "not a url")]);
});

// The same raw-character class ADR-040 amendment 8 requires of the redirect oracle
// (`hasForbiddenRawUrlCharacter`), applied before the WHATWG parser can silently normalize a
// backslash into a slash.
test("resolveConfiguredOrigin: a backslash in the raw value is refused with the exact warning", () => {
  const { origin, warnings } = resolve("https:/\\tovu.fly.dev");
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, [refusalMessage("it is not a parseable URL", "https:/\\tovu.fly.dev")]);
});

// ADR-040 Round-3 fold amendment 1: `scheme: "http"` is legal ONLY for `source: "dev-capability"`,
// and `createVerifiedOrigin` THROWS on the combination. Refusing here is what keeps that throw off
// the boot path.
test("resolveConfiguredOrigin: an http URL is refused with the exact warning (ADR-040 https-only)", () => {
  const { origin, warnings } = resolve("http://tovu.fly.dev");
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, [refusalMessage("its scheme must be https", "http://tovu.fly.dev")]);
});

test("resolveConfiguredOrigin: a non-http(s) scheme is refused with the exact warning", () => {
  const { origin, warnings } = resolve("ftp://tovu.fly.dev");
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, [refusalMessage("its scheme must be https", "ftp://tovu.fly.dev")]);
});

test("resolveConfiguredOrigin: a userinfo component is refused with the exact warning", () => {
  const { origin, warnings } = resolve("https://user:pw@tovu.fly.dev");
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, [
    refusalMessage("it carries a userinfo component", "https://user:pw@tovu.fly.dev"),
  ]);
});

test("resolveConfiguredOrigin: a query string is refused with the exact warning", () => {
  const { origin, warnings } = resolve("https://tovu.fly.dev/?a=1");
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, [
    refusalMessage("it carries a query string or fragment", "https://tovu.fly.dev/?a=1"),
  ]);
});

test("resolveConfiguredOrigin: a fragment is refused with the exact warning", () => {
  const { origin, warnings } = resolve("https://tovu.fly.dev/#x");
  assert.equal(origin, undefined);
  assert.deepEqual(warnings, [
    refusalMessage("it carries a query string or fragment", "https://tovu.fly.dev/#x"),
  ]);
});

test("resolveConfiguredOrigin: https://localhost:3000 -- this repo's own .env value -- is refused as a loopback host", () => {
  const { origin, warnings } = resolve("https://localhost:3000");
  assert.equal(origin, undefined, "a loopback host can never be a public origin");
  assert.deepEqual(warnings, [
    refusalMessage("'localhost' is a loopback host, not a public origin", "https://localhost:3000"),
  ]);
});

test("resolveConfiguredOrigin: every loopback identity is refused", () => {
  for (const [value, host] of [
    ["https://127.0.0.1", "127.0.0.1"],
    ["https://127.1.2.3:8443", "127.1.2.3"],
    ["https://app.localhost", "app.localhost"],
    ["https://[::1]", "[::1]"],
    ["https://0.0.0.0", "0.0.0.0"],
  ] as const) {
    const { origin, warnings } = resolve(value);
    assert.equal(origin, undefined, `${value} must be refused`);
    assert.deepEqual(warnings, [
      refusalMessage(`'${host}' is a loopback host, not a public origin`, value),
    ]);
  }
});

test("resolveConfiguredOrigin: never throws, whatever the configured value is", () => {
  for (const value of ["", "://", "https://", "https:", "\u0000", "javascript:alert(1)", "//tovu.fly.dev", "https://tovu.fly.dev\n"]) {
    assert.doesNotThrow(() => resolveConfiguredOrigin({ now: NOW }, { env: { TOVU_PUBLIC_URL: value }, warn: () => {} }), `threw on ${JSON.stringify(value)}`);
  }
});

/**
 * `planOriginBoot` — the three-way boot decision, extracted so it is directly assertable instead of
 * buried in the 1000-line composition root. The production/no-config arm is the one that matters
 * most: it is what stops a Fly boot from ever writing `http://localhost:3000` into prod's
 * `content.db` again, which is the write that caused the original bug.
 */
const NO_CONFIG_IN_PRODUCTION_WARNING =
  "No public origin is configured for this production deployment: TOVU_PUBLIC_URL is unset or was " +
  "refused, and the localhost dev-capability seed is never written in production runtime mode. " +
  "Public URLs (sitemap.xml, canonical, og:url, newsletter and magic links) stay relative or " +
  "unavailable until TOVU_PUBLIC_URL names this deployment's origin.";

function plan(value: string | undefined, mode: "production" | "local") {
  const { warnings, warn } = capture();
  const env = value === undefined ? {} : { TOVU_PUBLIC_URL: value };
  return { result: planOriginBoot({ now: NOW }, { env, warn, mode: () => mode }), warnings };
}

test("planOriginBoot: a configured public origin is registered, in production", () => {
  const { result, warnings } = plan("https://tovu.fly.dev", "production");
  assert.equal(result.kind, "configured");
  assert.equal(result.kind === "configured" ? result.origin.host : undefined, "tovu.fly.dev");
  assert.deepEqual(warnings, []);
});

test("planOriginBoot: a configured public origin is registered in local mode too -- how an operator tests prod-shaped absolute URLs locally", () => {
  assert.equal(plan("https://tovu.fly.dev", "local").result.kind, "configured");
});

test("planOriginBoot: no configured origin in local mode falls through to the dev-capability seed (unchanged dev behavior)", () => {
  const { result, warnings } = plan(undefined, "local");
  assert.equal(result.kind, "dev-seed");
  assert.deepEqual(warnings, []);
});

test("planOriginBoot: a loopback TOVU_PUBLIC_URL in local mode still falls through to the dev-capability seed", () => {
  const { result } = plan("https://localhost:3000", "local");
  assert.equal(result.kind, "dev-seed", "the dev seed's deriveDevScheme must keep owning the local origin");
});

// THE guard. `seedDevCapabilityOrigin`'s unconditional call is what durably wrote
// `http://localhost:3000` into production's content.db on Fly's first boot; under find-or-create
// that row is immortal. In production with nothing configured, the correct answer is to write
// NOTHING and fail closed (ADR-040 §2), not to invent a localhost origin.
test("planOriginBoot: no configured origin in production writes nothing and warns with the exact message", () => {
  const { result, warnings } = plan(undefined, "production");
  assert.equal(result.kind, "none");
  assert.deepEqual(warnings, [NO_CONFIG_IN_PRODUCTION_WARNING]);
});

test("planOriginBoot: a loopback TOVU_PUBLIC_URL in production writes nothing -- never the localhost seed", () => {
  const { result, warnings } = plan("https://localhost:3000", "production");
  assert.equal(result.kind, "none");
  assert.deepEqual(warnings, [
    refusalMessage("'localhost' is a loopback host, not a public origin", "https://localhost:3000"),
    NO_CONFIG_IN_PRODUCTION_WARNING,
  ]);
});

// Defaulting to `process.env` is the real boot path; the injected `env` above is the test seam.
test("resolveConfiguredOrigin: reads process.env when no env override is supplied", () => {
  const previous = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "https://process-env.example";
  try {
    assert.equal(resolveConfiguredOrigin({ now: NOW }, { warn: () => {} })?.host, "process-env.example");
  } finally {
    if (previous === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previous;
  }
});
