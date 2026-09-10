import assert from "node:assert/strict";
import test from "node:test";

import type { ToolRegistration } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";

import { ADMIN_SCREEN_LINK_TOOL_ID, buildAdminScreenLinkRegistrations, buildAdminScreenPath } from "../admin-screen-link-tool.js";

/**
 * @file `assistant_admin_screen_link`'s own round trip — the general fallback for "take the human to
 * the right admin screen" once no in-chat tool can perform the action itself (see that file's own
 * header for the observed failure this closes: a credential-creation request that dead-ended with
 * prose directions instead of something the human could open).
 *
 * Three things this suite exists to prove, matching the survey that shaped the tool's design:
 *  - the relative path this tool builds is exactly what `apps/admin/src/lib/router.ts`'s
 *    `adminHref`/`DEFAULT_ADMIN_BASE` would also produce for the same route (`/admin/<segment>`,
 *    `?tab=` for a tabbed screen) — asserted here as a literal string, not re-derived, since this
 *    tool has no import path to that module (see the implementation file's own header for why).
 *  - an absolute `url` is included ONLY when `TOVU_PUBLIC_URL` is configured, and is absent
 *    otherwise — this tool must never fabricate a local origin (the same INV-07 rule
 *    `features/seo/sitemap.ts`'s `buildRobots` also follows, though `buildRobots` gets there via a
 *    verified `OriginRegistryPort` lookup this tool structurally has no access to — see the
 *    implementation file's own header for why).
 *  - malformed input (missing/blank path, a path that reduces to nothing once its leading slashes
 *    are stripped) is refused with a clear message rather than silently producing a broken link.
 */

function buildHandler(): ToolRegistration["handler"] {
  const registrations: ToolRegistration[] = buildAdminScreenLinkRegistrations(undefined, undefined);
  const registration = registrations.find((r) => r.descriptor.id === ADMIN_SCREEN_LINK_TOOL_ID);
  assert.ok(registration, "the tool must be wired");
  return registration.handler;
}

function call(handler: ToolRegistration["handler"], input: unknown) {
  return handler({
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  } as Parameters<typeof handler>[0]);
}

test("buildAdminScreenPath joins a bare segment under /admin with no query", () => {
  assert.equal(buildAdminScreenPath({ path: "access-tokens" }), "/admin/access-tokens");
});

test("buildAdminScreenPath strips a leading slash the caller supplied", () => {
  assert.equal(buildAdminScreenPath({ path: "/media" }), "/admin/media");
});

test("buildAdminScreenPath appends ?tab= for a tabbed screen, URL-encoded", () => {
  assert.equal(
    buildAdminScreenPath({ path: "settings", tab: "external mcp" }),
    "/admin/settings?tab=external%20mcp",
  );
});

test("buildAdminScreenPath rejects a path that is nothing but slashes", () => {
  assert.throws(() => buildAdminScreenPath({ path: "///" }), /path/i);
});

// 500-redact defect (RED->GREEN): this used to reject with a bare `Error`, which
// `@jini-ai/daemon`'s `ToolExecutor` tags `errorKind: 'internal'` — the classification
// `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` SEC-005-redacts into a message-stripped 500.
// It now throws `ToolInputError`, mirroring `features/post/tool-registrations.ts`'s fix shape.
test("buildAdminScreenPath's rejection is a ToolInputError (400), not a bare Error (redacted 500)", () => {
  assert.throws(() => buildAdminScreenPath({ path: "///" }), (err: unknown) => err instanceof ToolInputError);
});

test("the tool handler returns the relative path and no url when TOVU_PUBLIC_URL is unset", async () => {
  const previous = process.env.TOVU_PUBLIC_URL;
  delete process.env.TOVU_PUBLIC_URL;
  try {
    const handler = buildHandler();
    const result = await call(handler, { path: "access-tokens" });
    assert.deepEqual(result, { path: "/admin/access-tokens" });
  } finally {
    if (previous === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previous;
  }
});

test("the tool handler includes an absolute url when TOVU_PUBLIC_URL is configured", async () => {
  const previous = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "https://example.tovu.test";
  try {
    const handler = buildHandler();
    const result = await call(handler, { path: "access-tokens", tab: undefined });
    assert.deepEqual(result, {
      path: "/admin/access-tokens",
      url: "https://example.tovu.test/admin/access-tokens",
    });
  } finally {
    if (previous === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previous;
  }
});

test("the tool handler refuses a call with no path", async () => {
  const handler = buildHandler();
  await assert.rejects(() => call(handler, {}), /path/i);
});

test("the tool handler refuses a non-object input", async () => {
  const handler = buildHandler();
  await assert.rejects(() => call(handler, "access-tokens"), /object/i);
});
