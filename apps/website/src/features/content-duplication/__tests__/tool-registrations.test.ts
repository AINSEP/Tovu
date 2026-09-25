import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import type { AssistantToolRegistryDeps } from "#src/assistant/tool-registrations";
import type { DuplicateResourceHandlerContributor } from "#src/assistant/index";
import { buildContentDuplicationRegistrations } from "../tool-registrations.js";

/**
 * @file Certifies `content_duplicate` — the CROSS-RESOURCE half of the tool, independent of any one
 * resource's copy semantics. Post/page's own copy behavior is certified in
 * `features/post/__tests__/content-duplicate.post-page.test.ts`; forms' in
 * `features/forms/__tests__/content-duplicate.form.test.ts`. What is certified HERE is the part that
 * has no precedent anywhere else in this codebase:
 *
 * 1. **Permission resolves from the RESOURCE, not the tool.** All ~182 other tools in this repo
 *    declare exactly one static permission per tool id, evaluated the same way on every call. This
 *    tool cannot: `post` gates on `content.write` and `form` on `admin.forms.manage`, and a caller
 *    holding one must not thereby hold the other. The tests below use two fake resources with
 *    deliberately different permissions and an `authorize` that grants exactly one of them, then
 *    assert both that the refused resource rejects AND that its `duplicate` was never entered — a
 *    test asserting only the rejection would still pass if the gate ran AFTER the copy.
 * 2. **An unsupported resource enumerates what IS supported.** `resource` cannot be a static schema
 *    enum (the set is populated at boot), so this rejection is the only place a caller can learn the
 *    live set — asserted on its exact text, not just that it throws.
 *
 * Fake resources rather than the real post/forms contributors: this file is about the generic
 * dispatch and gate, and a real resource would drag a repo, a command gateway and an outbox in to
 * prove nothing extra. It also keeps the two permission strings under this file's own control, so
 * the per-resource assertion cannot silently pass because two real resources happen to agree.
 */

const WORKSPACE_ID = "ws-content-duplicate";
const PRINCIPAL_ID = "principal-under-test";

interface AuthorizeCall {
  principalId: string;
  permission: string;
  workspaceId?: string;
  entityType?: string;
  entityId?: string;
}

/**
 * A `routeDeps` stand-in carrying only what `content_duplicate`'s own handler reads: `workspaceId`
 * and `authorize`. `allowedPermissions` is what makes the per-resource assertion real — a caller
 * that holds one resource's permission and not another's.
 */
function fakeRouteDeps(allowedPermissions: string[]) {
  const authorizeCalls: AuthorizeCall[] = [];
  const deps = {
    workspaceId: WORKSPACE_ID,
    authorize: async (required: AuthorizeCall) => {
      authorizeCalls.push(required);
      return allowedPermissions.includes(required.permission)
        ? { allowed: true, reason: "matched" }
        : { allowed: false, reason: "no matching grant" };
    },
  } as unknown as AssistantToolRegistryDeps;

  return { deps, authorizeCalls };
}

interface FakeResource {
  contributor: DuplicateResourceHandlerContributor;
  calls: Array<{ principalId: string; id: string; overrides: Record<string, unknown> }>;
}

function fakeResource(resource: string, permission: string): FakeResource {
  const calls: FakeResource["calls"] = [];
  return {
    calls,
    contributor: {
      resource,
      build: () => ({
        permission,
        duplicate: async (input) => {
          calls.push({ principalId: input.principalId, id: input.id, overrides: { ...input.overrides } });
          return { copiedResource: resource, copiedFrom: input.id };
        },
      }),
    },
  };
}

function toolFor(
  deps: AssistantToolRegistryDeps,
  contributors: readonly DuplicateResourceHandlerContributor[],
): ToolRegistration {
  const registrations = buildContentDuplicationRegistrations(deps, {
    listResourceHandlers: () => contributors,
  });
  const found = registrations.find((r) => r.descriptor.id === "content_duplicate");
  assert.ok(found, "expected 'content_duplicate' to be wired");
  return found;
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL_ID },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

// ---------------------------------------------------------------------------------------------
// Permission resolves from the RESOURCE, not the tool.
// ---------------------------------------------------------------------------------------------

test("each resource is gated on ITS OWN declared permission, not one flat permission for the tool", async () => {
  const posts = fakeResource("post", "content.write");
  const forms = fakeResource("form", "admin.forms.manage");
  // Holds posts' permission ONLY.
  const { deps, authorizeCalls } = fakeRouteDeps(["content.write"]);
  const duplicate = toolFor(deps, [posts.contributor, forms.contributor]);

  const allowed = await call(duplicate, { resource: "post", id: "post-1" });
  assert.deepEqual(allowed, { copiedResource: "post", copiedFrom: "post-1" });

  await assert.rejects(
    call(duplicate, { resource: "form", id: "form-1" }),
    /admin\.forms\.manage/,
    "being permitted to copy a post must not by itself permit copying a form",
  );

  assert.deepEqual(
    authorizeCalls.map((c) => c.permission),
    ["content.write", "admin.forms.manage"],
    "the permission put to authorize() must be the one the RESOURCE declares, per call",
  );
});

test("a refused resource's duplicate() is never entered — the gate runs BEFORE the copy, not after", async () => {
  const forms = fakeResource("form", "admin.forms.manage");
  const { deps } = fakeRouteDeps(["content.write"]);
  const duplicate = toolFor(deps, [forms.contributor]);

  await assert.rejects(call(duplicate, { resource: "form", id: "form-1" }));

  assert.deepEqual(forms.calls, [], "a denied caller must not reach the resource's own copy implementation at all");
});

test("the resource id and source id are carried onto the authorize() call as entityType/entityId", async () => {
  const posts = fakeResource("post", "content.write");
  const { deps, authorizeCalls } = fakeRouteDeps(["content.write"]);

  await call(toolFor(deps, [posts.contributor]), { resource: "post", id: "post-42" });

  assert.deepEqual(authorizeCalls, [
    { principalId: PRINCIPAL_ID, permission: "content.write", workspaceId: WORKSPACE_ID, entityType: "post", entityId: "post-42" },
  ]);
});

test("the same principal IS allowed both resources when it holds both permissions", async () => {
  const posts = fakeResource("post", "content.write");
  const forms = fakeResource("form", "admin.forms.manage");
  const { deps } = fakeRouteDeps(["content.write", "admin.forms.manage"]);
  const duplicate = toolFor(deps, [posts.contributor, forms.contributor]);

  assert.deepEqual(await call(duplicate, { resource: "post", id: "p1" }), { copiedResource: "post", copiedFrom: "p1" });
  assert.deepEqual(await call(duplicate, { resource: "form", id: "f1" }), { copiedResource: "form", copiedFrom: "f1" });
});

// ---------------------------------------------------------------------------------------------
// An unsupported resource enumerates what IS supported.
// ---------------------------------------------------------------------------------------------

test("an unsupported resource names every resource that IS supported, sorted, with its exact text", async () => {
  const { deps } = fakeRouteDeps(["content.write"]);
  const duplicate = toolFor(deps, [
    fakeResource("post", "content.write").contributor,
    fakeResource("form", "admin.forms.manage").contributor,
    fakeResource("page", "content.write").contributor,
  ]);

  await assert.rejects(call(duplicate, { resource: "widget", id: "w-1" }), (err: Error) => {
    assert.equal(
      err.message,
      "content_duplicate: cannot duplicate resource 'widget'. Supported resources: form, page, post. " +
        "No other resource can be duplicated by this tool — retrying with a different spelling will not help.",
    );
    return true;
  });
});

test("the enumerated list is sorted, so it does not drift with registration order", async () => {
  const { deps } = fakeRouteDeps([]);
  const registeredOutOfOrder = toolFor(deps, [
    fakeResource("post", "content.write").contributor,
    fakeResource("form", "admin.forms.manage").contributor,
  ]);

  await assert.rejects(call(registeredOutOfOrder, { resource: "nope", id: "x" }), /Supported resources: form, post\./);
});

test("with NO resources registered the rejection says so explicitly rather than naming an empty list", async () => {
  const { deps } = fakeRouteDeps(["content.write"]);

  await assert.rejects(
    call(toolFor(deps, []), { resource: "post", id: "p-1" }),
    /Supported resources: \(none registered\)\./,
  );
});

test("an unsupported resource is rejected before any authorize() call — the supported set is catalog information, not privileged", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps(["content.write"]);

  await assert.rejects(call(toolFor(deps, [fakeResource("post", "content.write").contributor]), { resource: "widget", id: "w" }));

  assert.deepEqual(authorizeCalls, []);
});

// ---------------------------------------------------------------------------------------------
// Input shape.
// ---------------------------------------------------------------------------------------------

test("overrides are forwarded to the resource's own duplicate(), and an omitted overrides is an empty object", async () => {
  const posts = fakeResource("post", "content.write");
  const { deps } = fakeRouteDeps(["content.write"]);
  const duplicate = toolFor(deps, [posts.contributor]);

  await call(duplicate, { resource: "post", id: "p-1" });
  await call(duplicate, { resource: "post", id: "p-2", overrides: { title: "Renamed", slug: "renamed", status: "published" } });

  assert.deepEqual(posts.calls, [
    { principalId: PRINCIPAL_ID, id: "p-1", overrides: {} },
    { principalId: PRINCIPAL_ID, id: "p-2", overrides: { title: "Renamed", slug: "renamed", status: "published" } },
  ]);
});

test("a present-but-non-object overrides is a caller shape error, never silently ignored", async () => {
  const posts = fakeResource("post", "content.write");
  const { deps } = fakeRouteDeps(["content.write"]);

  await assert.rejects(
    call(toolFor(deps, [posts.contributor]), { resource: "post", id: "p-1", overrides: "title=Renamed" }),
    /'overrides' must be an object/,
  );
  assert.deepEqual(posts.calls, []);
});

test("a present non-string overrides.title is rejected, the resource's own duplicate() is never entered", async () => {
  const posts = fakeResource("post", "content.write");
  const { deps } = fakeRouteDeps(["content.write"]);

  await assert.rejects(
    call(toolFor(deps, [posts.contributor]), { resource: "post", id: "p-1", overrides: { title: 42 } }),
    (err: Error) => {
      assert.equal(err.message, "'overrides.title' must be a string");
      return true;
    },
  );
  assert.deepEqual(posts.calls, []);
});

test("a present non-string overrides.slug is rejected", async () => {
  const posts = fakeResource("post", "content.write");
  const { deps } = fakeRouteDeps(["content.write"]);

  await assert.rejects(
    call(toolFor(deps, [posts.contributor]), { resource: "post", id: "p-1", overrides: { slug: 42 } }),
    (err: Error) => {
      assert.equal(err.message, "'overrides.slug' must be a string");
      return true;
    },
  );
  assert.deepEqual(posts.calls, []);
});

test("a present non-string overrides.status is rejected", async () => {
  const posts = fakeResource("post", "content.write");
  const { deps } = fakeRouteDeps(["content.write"]);

  await assert.rejects(
    call(toolFor(deps, [posts.contributor]), { resource: "post", id: "p-1", overrides: { status: 42 } }),
    (err: Error) => {
      assert.equal(err.message, "'overrides.status' must be a string");
      return true;
    },
  );
  assert.deepEqual(posts.calls, []);
});

test("an unknown overrides key is rejected rather than silently dropped", async () => {
  const posts = fakeResource("post", "content.write");
  const { deps } = fakeRouteDeps(["content.write"]);

  await assert.rejects(
    call(toolFor(deps, [posts.contributor]), { resource: "post", id: "p-1", overrides: { color: "blue" } }),
    (err: Error) => {
      assert.equal(err.message, "unknown override 'color'");
      return true;
    },
  );
  assert.deepEqual(posts.calls, []);
});

test("a missing resource or id is rejected before anything is copied", async () => {
  const posts = fakeResource("post", "content.write");
  const { deps } = fakeRouteDeps(["content.write"]);
  const duplicate = toolFor(deps, [posts.contributor]);

  await assert.rejects(call(duplicate, { id: "p-1" }));
  await assert.rejects(call(duplicate, { resource: "post" }));
  assert.deepEqual(posts.calls, []);
});

test("content_duplicate is never classified read-only — every duplicate is a durable-state mutation", async () => {
  const { deps } = fakeRouteDeps(["content.write"]);
  const duplicate = toolFor(deps, [fakeResource("post", "content.write").contributor]);

  // `descriptor.readOnly` is what `@jini-ai/core`'s `isReadOnlyTool` gates on. A read-only
  // classification here would let this tool run in a surface that permits no writes.
  assert.equal(duplicate.descriptor.readOnly, false);
});
