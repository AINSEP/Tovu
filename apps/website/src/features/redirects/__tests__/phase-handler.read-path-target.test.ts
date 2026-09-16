import assert from "node:assert/strict";
import test from "node:test";

import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "#src/features/origin/index";
import { redirectMatcher } from "../matcher.js";
import { RedirectPhaseHandlerResolver } from "../phase-handler.js";
import { InMemoryRedirectRepo } from "../repo.memory.js";
import type { RedirectRecord } from "../types.js";

/**
 * @file The READ half of the reserved-target/open-redirect rule that `12c1f273` added to the write
 * chokepoint only.
 *
 * Two facts make the write-path gate insufficient on its own, and this file pins both:
 *
 * 1. **The value sent to the browser is the INTERPOLATED `location`, not the stored `toTarget`.**
 *    `matcher.ts`'s `matchWildcard` substitutes a request-path capture into the target, and
 *    `matchPrefix` appends the request-path tail. `/go/*` -> `/$1` is an entirely ordinary-looking
 *    stored target that `assertTargetAllowed` accepts, and a request for `/go/admin` turns it into
 *    `Location: /admin`. The reserved-segment rule has to be applied where the value is finished.
 *
 * 2. **`toOracleCandidate` used to build its candidate by STRING CONCATENATION**
 *    (`origin + location`), which parses a leading `\` as a path character, while a browser
 *    resolving the same `Location` RELATIVE to the request URL parses it as an authority separator:
 *    `new URL("https://site.example" + "/\\evil.example").origin` is `https://site.example`, but
 *    `new URL("/\\evil.example", "https://site.example/p").origin` is `https://evil.example`. The
 *    oracle therefore answered "same origin" about a target that leaves the site.
 */

const WORKSPACE_ID = "workspace-1";

function makeOriginRegistry(opts: { redirectAllowlist?: string[] } = {}) {
  const repo = new InMemoryOriginSettingRepo([
    {
      workspaceId: WORKSPACE_ID,
      origin: createVerifiedOrigin({
        scheme: "https",
        host: "trusted.example",
        verifiedAt: "2026-07-13T00:00:00.000Z",
        source: "workspace-setting",
      }),
      redirectAllowlist: opts.redirectAllowlist ?? [],
    },
  ]);
  return new OriginRegistry({ repo });
}

function rule(overrides: Partial<RedirectRecord>): RedirectRecord {
  return {
    id: overrides.id ?? "rule-1",
    workspaceId: WORKSPACE_ID,
    matchType: "exact",
    fromPattern: "/a",
    toTarget: "/b",
    statusCode: 301,
    status: "active",
    override: false,
    priority: 0,
    source: "manual",
    createdByPrincipal: "user-1",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function resolverWith(rules: RedirectRecord[], opts: { redirectAllowlist?: string[] } = {}) {
  return new RedirectPhaseHandlerResolver({
    repo: new InMemoryRedirectRepo(rules),
    matcher: redirectMatcher,
    originRegistry: makeOriginRegistry(opts),
  });
}

test("a wildcard capture that interpolates the ADMIN surface into a site-relative location never resolves to matched:true", async () => {
  // `/go/*` -> `/$1` passes the write gate: the STORED target is `/$1`, which names no reserved
  // segment. The request supplies the segment.
  const resolver = resolverWith([
    rule({ id: "wildcard-admin", matchType: "wildcard", fromPattern: "/go/*", toTarget: "/$1" }),
  ]);

  const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/go/admin", phase: "post_content" });

  assert.deepEqual(result, { matched: false });
});

test("a wildcard capture that interpolates the API surface into a site-relative location never resolves to matched:true", async () => {
  const resolver = resolverWith([
    rule({ id: "wildcard-api", matchType: "wildcard", fromPattern: "/go/*", toTarget: "/$1/admin/settings" }),
  ]);

  const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/go/api", phase: "post_content" });

  assert.deepEqual(result, { matched: false });
});

test("a prefix rule whose request tail lands the visitor on the admin surface never resolves to matched:true", async () => {
  // `matchPrefix` concatenates the un-matched tail onto the target, so `/go` -> `/` plus a request
  // for `/go/admin` produces `//admin` — which a browser reads as the HOST `admin`, not a path.
  const resolver = resolverWith([
    rule({ id: "prefix-root", matchType: "prefix", fromPattern: "/go", toTarget: "/" }),
  ]);

  const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/go/admin", phase: "post_content" });

  assert.deepEqual(result, { matched: false });
});

test("a STORED target that a browser resolves off-origin via a backslash never resolves to matched:true", async () => {
  // A row written before the write-path gate existed. `/\evil.example` is one slash, so
  // `isPotentiallyCrossOrigin` calls it relative and the oracle is asked about the wrong string.
  const resolver = resolverWith([
    rule({ id: "legacy-backslash", matchType: "exact", fromPattern: "/old", toTarget: "/\\evil.example" }),
  ]);

  const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/old", phase: "post_content" });

  assert.deepEqual(result, { matched: false });
});

test("a wildcard capture that interpolates a backslash authority never resolves to matched:true", async () => {
  const resolver = resolverWith([
    rule({ id: "wildcard-backslash", matchType: "wildcard", fromPattern: "/go/*", toTarget: "/\\$1" }),
  ]);

  const result = await resolver.resolve({
    workspaceId: WORKSPACE_ID,
    path: "/go/evil.example",
    phase: "post_content",
  });

  assert.deepEqual(result, { matched: false });
});

test("a legacy STORED target naming the admin surface never resolves to matched:true", async () => {
  const resolver = resolverWith([
    rule({ id: "legacy-admin", matchType: "exact", fromPattern: "/dashboard", toTarget: "/admin/settings" }),
  ]);

  const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/dashboard", phase: "post_content" });

  assert.deepEqual(result, { matched: false });
});

test("an ABSOLUTE target on this site's OWN origin that names the admin surface never resolves to matched:true", async () => {
  // The write gate routes an absolute target to the origin allowlist, which answers "is that HOST
  // allowed" — and the workspace's own host trivially is. So `https://trusted.example/admin` is a
  // second way to write a rule the reserved-segment rule was meant to refuse.
  const resolver = resolverWith([
    rule({
      id: "absolute-admin",
      matchType: "exact",
      fromPattern: "/dash",
      toTarget: "https://trusted.example/admin/settings",
    }),
  ]);

  const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/dash", phase: "post_content" });

  assert.deepEqual(result, { matched: false });
});

test("an ALLOWLISTED cross-origin host's own /admin is not this site's to police and still resolves", async () => {
  const resolver = resolverWith(
    [rule({ id: "partner-admin", matchType: "exact", fromPattern: "/p", toTarget: "https://partner.example/admin" })],
    { redirectAllowlist: ["partner.example"] },
  );

  const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/p", phase: "post_content" });

  assert.equal(result.matched, true);
});

test("an ordinary same-origin relative target still resolves to matched:true", async () => {
  const resolver = resolverWith([rule({ id: "ok-rel", matchType: "exact", fromPattern: "/old", toTarget: "/new" })]);

  const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/old", phase: "post_content" });

  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.location, "/new");
});

test("a target that merely STARTS WITH the reserved letters is ordinary content and still resolves", async () => {
  const resolver = resolverWith([
    rule({ id: "ok-lookalike", matchType: "wildcard", fromPattern: "/go/*", toTarget: "/$1" }),
  ]);

  const result = await resolver.resolve({
    workspaceId: WORKSPACE_ID,
    path: "/go/administer-survey",
    phase: "post_content",
  });

  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.location, "/administer-survey");
});

test("an allowlisted cross-origin interpolated target still resolves (the oracle half is unchanged)", async () => {
  const resolver = resolverWith(
    [rule({ id: "ok-abs", matchType: "wildcard", fromPattern: "/go3/*", toTarget: "https://$1" })],
    { redirectAllowlist: ["partner.example"] },
  );

  const result = await resolver.resolve({
    workspaceId: WORKSPACE_ID,
    path: "/go3/partner.example",
    phase: "post_content",
  });

  assert.equal(result.matched, true);
  if (result.matched) assert.equal(result.location, "https://partner.example");
});

/**
 * t91 B1 (2026-09-16): `isReservedSameOriginDestination` used to compare `parsed.origin` against a
 * STRING-composed canonical origin, so a trailing-dot or percent-encoded-dot host — which a WHATWG
 * `URL` parser keeps as a distinct `origin` string — sailed past the "is this the same origin"
 * check entirely, and the reserved-path rule never ran. `checkSameOriginDestination` decides same-
 * origin the way the oracle itself does (`normalizeOriginCandidate` + `isSameOrigin`: lower-cased,
 * trailing-dot-stripped host), so these three spellings of the workspace's own `/admin`/`/api`
 * surface are refused exactly like the plain `https://trusted.example/admin` case above.
 */
const SAME_ORIGIN_SPELLINGS_OF_RESERVED: readonly { readonly target: string; readonly why: string }[] = [
  { target: "https://trusted.example./admin", why: "a trailing dot: URL.origin keeps it, the oracle strips it" },
  { target: "https://trusted.example%2E/admin", why: "a percent-encoded trailing dot, decodes to the same host" },
  { target: "https://trusted.example./api/admin/v1/workspaces", why: "trailing dot, api surface" },
];

for (const { target, why } of SAME_ORIGIN_SPELLINGS_OF_RESERVED) {
  test(`a same-origin admin target spelled as '${target}' never resolves to matched:true (${why})`, async () => {
    const resolver = resolverWith([rule({ id: "dash-N", matchType: "exact", fromPattern: "/dash-N", toTarget: target })]);

    const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/dash-N", phase: "post_content" });

    assert.deepEqual(result, { matched: false });
  });
}

test("a same-origin absolute target to ordinary content still resolves, trailing dot or not", async () => {
  for (const target of ["https://trusted.example/blog/post", "https://trusted.example./blog/post"]) {
    const resolver = resolverWith([rule({ id: "ordinary-abs", matchType: "exact", fromPattern: "/old", toTarget: target })]);

    const result = await resolver.resolve({ workspaceId: WORKSPACE_ID, path: "/old", phase: "post_content" });

    assert.equal(result.matched, true, `expected '${target}' to still resolve`);
    if (result.matched) assert.equal(result.location, target);
  }
});
