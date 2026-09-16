import assert from "node:assert/strict";
import test from "node:test";

import { createVerifiedOrigin } from "#src/features/origin/index";
import type { VerifiedOrigin } from "#src/features/origin/index";
import { checkSameOriginDestination } from "../reserved-destination.js";

/**
 * @file Pure-function coverage for {@link checkSameOriginDestination} — the one "same-origin
 * destination lands on the admin surface" verdict shared by the read gate (`phase-handler.ts`) and
 * the write gate (`redirects.ts`). `phase-handler.read-path-target.test.ts` and
 * `redirects.reserved-target.test.ts` exercise it through those two callers; this file pins the
 * canonical-side normalization (a mixed-case/trailing-dot STORED origin) neither of those resolver-
 * level tests can reach, plus the full verdict matrix directly (t91 B1, 2026-09-16).
 */

const TRUSTED: VerifiedOrigin = createVerifiedOrigin({
  scheme: "https",
  host: "trusted.example",
  verifiedAt: "2026-07-13T00:00:00.000Z",
  source: "workspace-setting",
});

test("checkSameOriginDestination against a plain canonical origin", () => {
  assert.deepEqual(
    checkSameOriginDestination("https://trusted.example./admin", TRUSTED),
    { kind: "reserved", surface: "admin" },
    "a trailing-dot host is still same-origin"
  );
  assert.deepEqual(
    checkSameOriginDestination("https://TRUSTED.EXAMPLE./api/x", TRUSTED),
    { kind: "reserved", surface: "api" },
    "upper-cased plus trailing dot is still same-origin"
  );
  assert.deepEqual(checkSameOriginDestination("https://trusted.example/blog", TRUSTED), { kind: "ok" });
  assert.deepEqual(
    checkSameOriginDestination("https://trusted.example:8443/admin", TRUSTED),
    { kind: "ok" },
    "a different port is cross-origin — not this rule's business"
  );
  assert.deepEqual(
    checkSameOriginDestination("http://trusted.example/admin", TRUSTED),
    { kind: "ok" },
    "a different scheme is cross-origin"
  );
  assert.deepEqual(
    checkSameOriginDestination("https://partner.example/admin", TRUSTED),
    { kind: "ok" },
    "a genuinely different host is cross-origin"
  );
  assert.deepEqual(
    checkSameOriginDestination("https://trusted.example./%5Cevil.example", TRUSTED),
    { kind: "disallowed-character" },
    "a percent-encoded backslash decodes to a path separator the reserved-path rule refuses"
  );
  assert.deepEqual(checkSameOriginDestination("not a url", TRUSTED), { kind: "unparseable" });
  assert.deepEqual(
    checkSameOriginDestination("https://user@trusted.example/admin", TRUSTED),
    { kind: "unparseable" },
    "userinfo is refused by the oracle's own normalizer — fail closed, not 'cross-origin'"
  );
});

test("checkSameOriginDestination against a canonical origin stored with mixed case and a trailing dot", () => {
  const storedMessy: VerifiedOrigin = createVerifiedOrigin({
    scheme: "https",
    host: "Trusted.Example.",
    verifiedAt: "2026-07-13T00:00:00.000Z",
    source: "workspace-setting",
  });

  assert.deepEqual(
    checkSameOriginDestination("https://trusted.example/admin", storedMessy),
    { kind: "reserved", surface: "admin" },
    "the CANONICAL side must normalize too, not just the candidate"
  );
});

test("checkSameOriginDestination against a dev-capability http canonical origin", () => {
  const devLocal: VerifiedOrigin = createVerifiedOrigin({
    scheme: "http",
    host: "localhost",
    port: 3000,
    verifiedAt: "2026-07-13T00:00:00.000Z",
    source: "dev-capability",
  });

  assert.deepEqual(
    checkSameOriginDestination("http://localhost.:3000/admin", devLocal),
    { kind: "reserved", surface: "admin" }
  );
  assert.deepEqual(checkSameOriginDestination("http://localhost:3000/new", devLocal), { kind: "ok" });
});
