import { RESERVED_SEGMENTS } from "#src/platform/routing/reserved-paths";
/**
 * @file RED->GREEN for wm S16 (redirects half): the redirects tool handlers threw the plain-`Error`
 * `Redirect*Error` classes and the kit's `ForbiddenError` with no `withModelFacingErrors` wrap, so
 * `ToolExecutor` classified every refusal — not found, bad pattern, off-site target, duplicate, loop,
 * permission denied — as `internal`, and the model saw the same redacted INTERNAL_ERROR a crash
 * produces. Each case asserts the exact `ToolInputError` text the model now receives.
 *
 * Also covers the RETURNED half: `redirects_import` reports per-rule failures in `failed[]`, and an
 * unlisted (infrastructure) error used to put its raw message there verbatim, bypassing redaction.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";

import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "@jini-ai/http-kit/verified-origin";
import { redirectMatcher } from "@jini-ai/cms/redirects";
import type { RedirectDbHandle } from "@jini-ai/cms/redirects/sql";
import { InMemoryRedirectRepo } from "@jini-ai/cms/redirects";
import type { RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { buildRedirectsRegistrations, type RedirectsToolDeps } from "../tool-registrations.js";
import { isNeverInTrash, removeVia, restoreVia } from "./remove-redirect-double.js";

const WORKSPACE_ID = "ws-redirects-model-facing";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";
const INTERNAL_DETAIL = "SQLITE_IOERR: disk I/O error at /var/data/site.db";

function makeDeps(options: { allow?: boolean } = {}): { deps: RedirectsToolDeps; redirectRepo: InMemoryRedirectRepo } {
  const allow = options.allow ?? true;
  const redirectRepo = new InMemoryRedirectRepo();
  const originRepo = new InMemoryOriginSettingRepo({ seeds: [
    { workspaceId: WORKSPACE_ID, origin: createVerifiedOrigin({ scheme: "https", host: "trusted.example", verifiedAt: NOW, source: "workspace-setting" }), redirectAllowlist: [] },
  ] });
  let clockTick = 0;
  let idTick = 0;
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    remove: removeVia(redirectRepo as unknown as Parameters<typeof removeVia>[0]),
    isInTrash: isNeverInTrash,
    restore: restoreVia(redirectRepo as unknown as Parameters<typeof removeVia>[0]),
    db: redirectRepo as unknown as RedirectDbHandle,
    transaction: async (fn) => fn(),
    reservedSegments: RESERVED_SEGMENTS,
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: { nowMs: () => Date.parse(`2026-07-29T00:00:${String(clockTick++).padStart(2, "0")}.000Z`) },
    idGen: { newId: () => `redirect-${++idTick}` },
    outbox: new InMemoryOutbox(),
  };
  const deps = {
    workspaceId: WORKSPACE_ID,
    redirectRepo,
    redirectHitSink: { record: async () => undefined, getStats: async () => null, listStats: async () => [] },
    redirectsWriteDeps,
    authorize: async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
  } as unknown as RedirectsToolDeps;
  return { deps, redirectRepo };
}

function handler(deps: RedirectsToolDeps, toolId: string): ToolRegistration["handler"] {
  const registration = buildRedirectsRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(registration, `expected ${toolId} to be wired`);
  return registration.handler;
}

function ctx(input: unknown): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof ToolInputError, `expected ToolInputError, got ${(err as Error)?.constructor?.name}: ${(err as Error)?.message}`);
    return err.message;
  }
  assert.fail("expected the handler to reject");
}

const create = (deps: RedirectsToolDeps, fromPattern: string, toTarget: string) =>
  handler(deps, "redirects_create")(ctx({ matchType: "exact", fromPattern, toTarget, statusCode: 301 }));

for (const toolId of ["redirects_get", "redirects_get_hits", "redirects_update", "redirects_tombstone"]) {
  test(`${toolId}: an unknown id tells the model REDIRECTS_NOT_FOUND, not a redacted internal error`, async () => {
    const { deps } = makeDeps();
    const input = toolId === "redirects_update" ? { id: "nope", priority: 3 } : { id: "nope" };
    assert.equal(await rejectionMessage(handler(deps, toolId)(ctx(input))), "REDIRECTS_NOT_FOUND: redirect 'nope' was not found");
  });
}

test("redirects_create: an invalid pattern is REDIRECTS_VALIDATION with the chokepoint's own reason", async () => {
  const { deps } = makeDeps();
  assert.equal(
    await rejectionMessage(handler(deps, "redirects_create")(ctx({ matchType: "regex", fromPattern: "/a.*", toTarget: "/b", statusCode: 301 }))),
    "REDIRECTS_VALIDATION: matchType 'regex' is not enabled in v1 (REQ-22)",
  );
});

test("redirects_create: an off-site target is REDIRECTS_TARGET_NOT_ALLOWED", async () => {
  const { deps } = makeDeps();
  assert.equal(
    await rejectionMessage(create(deps, "/old", "https://evil.example/x")),
    "REDIRECTS_TARGET_NOT_ALLOWED: toTarget 'https://evil.example/x' is not an allowed redirect destination",
  );
});

test("redirects_create: a duplicate active rule is REDIRECTS_CONFLICT", async () => {
  const { deps } = makeDeps();
  await create(deps, "/dup", "/one");
  assert.equal(await rejectionMessage(create(deps, "/dup", "/two")), "REDIRECTS_CONFLICT: an active exact rule for '/dup' already exists");
});

test("redirects_create: a cycle is REDIRECTS_LOOP naming the rule that would close it", async () => {
  const { deps } = makeDeps();
  await create(deps, "/b", "/a");
  assert.equal(
    await rejectionMessage(create(deps, "/a", "/b")),
    "REDIRECTS_LOOP: redirect from '/a' would create a cycle via '/b' (resolves back to '/a')",
  );
});

for (const toolId of ["redirects_list", "redirects_get", "redirects_get_hits", "redirects_create", "redirects_update", "redirects_tombstone", "redirects_import"]) {
  test(`${toolId}: a permission denial is REDIRECTS_FORBIDDEN, not a redacted internal error`, async () => {
    const { deps } = makeDeps({ allow: false });
    const message = await rejectionMessage(handler(deps, toolId)(ctx({ id: "r1", rules: [] })));
    assert.ok(message.startsWith("REDIRECTS_FORBIDDEN: "), message);
    assert.match(message, /is not authorized for/);
  });
}

test("an unlisted infrastructure error stays redacted (not reclassified as a ToolInputError)", async () => {
  const { deps, redirectRepo } = makeDeps();
  redirectRepo.list = async () => {
    throw new Error(INTERNAL_DETAIL);
  };
  await assert.rejects(handler(deps, "redirects_list")(ctx({})), (err: unknown) => {
    assert.ok(!(err instanceof ToolInputError), "an unknown error must stay `internal` so the transport redacts it");
    return true;
  });
});

test("redirects_import: an infrastructure failure on one rule reports a fixed message, never the raw internal text", async () => {
  const { deps, redirectRepo } = makeDeps();
  const original = redirectRepo.findByFromPattern.bind(redirectRepo);
  redirectRepo.findByFromPattern = async (input) => {
    if (input.fromPattern === "/explode") throw new Error(INTERNAL_DETAIL);
    return original(input);
  };
  const result = (await handler(deps, "redirects_import")(ctx({
    rules: [
      { matchType: "exact", fromPattern: "/ok", toTarget: "/fine", statusCode: 301 },
      { matchType: "exact", fromPattern: "/bad", toTarget: "/explode", statusCode: 301 },
    ],
  }))) as { created: unknown[]; failed: Array<{ index: number; code: string; message: string }> };
  assert.equal(result.created.length, 1);
  assert.deepEqual(result.failed, [{ index: 1, code: "INTERNAL_ERROR", message: "an internal error occurred" }]);
});

test("redirects_import: a listed domain failure still reports its own actionable message", async () => {
  const { deps } = makeDeps();
  const result = (await handler(deps, "redirects_import")(ctx({
    rules: [{ matchType: "exact", fromPattern: "/x", toTarget: "https://evil.example/y", statusCode: 301 }],
  }))) as { failed: Array<{ index: number; code: string; message: string }> };
  assert.deepEqual(result.failed, [
    { index: 0, code: "REDIRECT_TARGET_NOT_ALLOWED", message: "toTarget 'https://evil.example/y' is not an allowed redirect destination" },
  ]);
});

// REGRESSION (fix-plan C6b): `redirects_list` cast each filter straight to its union type, so
// `status:"enabled"` (not a status) matched no rule and the model read "no redirects" instead of the
// reason. Same for `source` and `matchType`, which share the handler and the bug.
test("redirects_list refuses an off-enum status, source or matchType naming the allowed values, before reading", async () => {
  const { deps, redirectRepo } = makeDeps();
  let listed = 0;
  redirectRepo.list = async () => {
    listed += 1;
    return [];
  };
  for (const [input, message] of [
    [{ status: "enabled" }, "'status' must be one of: active, disabled"],
    [{ source: "manual-ish" }, "'source' must be one of: manual, auto_slug_change, import"],
    [{ matchType: "glob" }, "'matchType' must be one of: exact, prefix, wildcard, regex"],
  ] as const) {
    assert.equal(await rejectionMessage(handler(deps, "redirects_list")(ctx(input))), message);
  }
  assert.equal(listed, 0);
  await handler(deps, "redirects_list")(ctx({ status: "disabled", source: "import", matchType: "regex" }));
  assert.equal(listed, 1);
});
