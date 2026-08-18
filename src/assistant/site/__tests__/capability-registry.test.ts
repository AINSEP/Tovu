import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSiteCapabilityRegistry, type SiteAssistantCallerClass } from "../capability-registry";
import { SITE_ASSISTANT_TOOL_SCHEMAS, type SiteAssistantToolDeps } from "../tools";
import { listPublishedPosts } from "../../../features/post";

/**
 * SPEC-046 REQ-0 — proves the registry preserves the closed switch's guarantees while making the
 * capability set addressable by more than one adapter: default deny for an unknown name, per-caller
 * authorization enforced even though only one caller class exists in production today, validation
 * left to the capability (not re-implemented here), and errors surfaced rather than thrown.
 */

interface FakeRow {
  id: string;
  workspaceId: string;
  title: string;
  slug: string;
  bodyJson: unknown;
  status: "draft" | "published";
  kind: "post" | "page";
  updatedAt: string;
  version: number;
  deletedAt?: string | null;
}

function row(partial: Partial<FakeRow> & { slug: string; status: FakeRow["status"] }): FakeRow {
  return {
    id: `id-${partial.slug}`,
    workspaceId: "ws",
    title: partial.slug,
    bodyJson: {},
    kind: "post",
    updatedAt: "2026-01-01",
    version: 1,
    deletedAt: null,
    ...partial,
  };
}

function fakePort(rows: FakeRow[]) {
  return {
    list: async () => rows as never,
  };
}

/**
 * Shared deps base for every `createSiteCapabilityRegistry` call below — `SiteAssistantToolDeps` now
 * injects `listPublishedPosts` (see `tools.ts`'s own doc for why), so every call site needs it. Uses
 * the REAL `features/post` export directly rather than a fake, same reasoning as `tools.test.ts`.
 */
function makeDeps(overrides: Partial<SiteAssistantToolDeps> & Pick<SiteAssistantToolDeps, "postRepo">): SiteAssistantToolDeps {
  return { workspaceId: "ws", listPublishedPosts, ...overrides };
}

function registryOver(rows: FakeRow[]) {
  return createSiteCapabilityRegistry(makeDeps({ postRepo: fakePort(rows) as never }));
}

describe("site capability registry", () => {
  describe("default deny", () => {
    it("refuses an unknown capability name before executing anything", async () => {
      const registry = registryOver([row({ slug: "public", status: "published" })]);
      const outcome = await registry.invoke({ name: "delete_everything", input: {}, caller: "anonymous-visitor" });
      assert.equal(outcome.kind, "refused");
      assert.match((outcome as { reason: string }).reason, /unknown tool/);
    });

    it("refuses a real capability for a caller class it was not granted to", async () => {
      const registry = registryOver([row({ slug: "public", status: "published" })]);
      // Only "anonymous-visitor" exists as a real caller class today; casting proves the
      // authorization branch itself works without waiting on a second real adapter to exist.
      const outcome = await registry.invoke({
        name: "list_categories",
        input: {},
        caller: "future-admin-adapter" as unknown as SiteAssistantCallerClass,
      });
      assert.equal(outcome.kind, "refused");
      assert.match((outcome as { reason: string }).reason, /not available to caller/);
    });

    it("gives the same outcome kind for a nonexistent name and a not-granted caller", async () => {
      // An adapter must not be able to distinguish "doesn't exist" from "exists but you can't call
      // it" by outcome shape alone — see tools.ts's identical non-disclosure precedent for slugs.
      const registry = registryOver([]);
      const unknown = await registry.invoke({ name: "nope", input: {}, caller: "anonymous-visitor" });
      const notGranted = await registry.invoke({
        name: "list_categories",
        input: {},
        caller: "other" as unknown as SiteAssistantCallerClass,
      });
      assert.equal(unknown.kind, notGranted.kind);
    });
  });

  describe("authorized invocation", () => {
    it("executes and returns the capability's result for a granted caller", async () => {
      const registry = registryOver([
        row({ slug: "public-post", status: "published", title: "Public Post" }),
        row({ slug: "secret-draft", status: "draft" }),
      ]);
      const outcome = await registry.invoke({ name: "search_published_entries", input: {}, caller: "anonymous-visitor" });
      assert.equal(outcome.kind, "ok");
      const results = (outcome as { result: readonly { slug: string }[] }).result;
      assert.deepEqual(
        results.map((r) => r.slug),
        ["public-post"],
      );
    });

    it("leaves input validation to the capability itself", async () => {
      const registry = registryOver([]);
      const outcome = await registry.invoke({ name: "get_published_entry", input: {}, caller: "anonymous-visitor" });
      assert.equal(outcome.kind, "ok");
      assert.ok("error" in (outcome as { result: { error: string } }).result, "missing slug is a tool-level validation error, not a registry rejection");
    });

    it("supports the parameterless list_categories capability", async () => {
      const registry = registryOver([row({ slug: "a", status: "published", kind: "page" })]);
      const outcome = await registry.invoke({ name: "list_categories", input: undefined, caller: "anonymous-visitor" });
      assert.equal(outcome.kind, "ok");
      assert.deepEqual((outcome as { result: readonly string[] }).result, ["page"]);
    });
  });

  describe("execution failure", () => {
    it("surfaces a thrown error as an error outcome instead of throwing", async () => {
      const registry = createSiteCapabilityRegistry(
        makeDeps({
          postRepo: {
            list: async () => {
              throw new Error("boom");
            },
          } as never,
        }),
      );
      const outcome = await registry.invoke({ name: "list_categories", input: undefined, caller: "anonymous-visitor" });
      assert.equal(outcome.kind, "error");
      assert.ok((outcome as { error: unknown }).error instanceof Error);
    });
  });

  describe("SPEC-046 REQ-4 — directive passthrough", () => {
    it("carries a page-action capability's directive on the ok outcome", async () => {
      const registry = registryOver([row({ slug: "public-post", status: "published", title: "Public Post" })]);
      const outcome = await registry.invoke({ name: "navigate_to_entry", input: { slug: "public-post" }, caller: "anonymous-visitor" });
      assert.equal(outcome.kind, "ok");
      assert.deepEqual((outcome as { directive: unknown }).directive, {
        kind: "page_action",
        action: { type: "navigate", target: { slug: "public-post", title: "Public Post", path: "/public-post" }, auto: false },
      });
    });

    it("a read-only capability's ok outcome never carries a directive", async () => {
      const registry = registryOver([row({ slug: "public-post", status: "published" })]);
      const outcome = await registry.invoke({ name: "search_published_entries", input: {}, caller: "anonymous-visitor" });
      assert.equal(outcome.kind, "ok");
      assert.equal((outcome as { directive?: unknown }).directive, undefined);
    });

    it("a refused target produces no directive, even for a page-action capability", async () => {
      const registry = registryOver([row({ slug: "secret-draft", status: "draft" })]);
      const outcome = await registry.invoke({ name: "highlight_entry", input: { slug: "secret-draft" }, caller: "anonymous-visitor" });
      // Still an "ok" outcome kind at the REGISTRY layer (the capability itself ran without
      // throwing) — the refusal lives in the tool's own result, matching "leaves input validation to
      // the capability itself" above. What matters here is that no directive escapes with it.
      assert.equal(outcome.kind, "ok");
      assert.equal((outcome as { directive?: unknown }).directive, undefined);
    });
  });

  describe("surface parity with the old closed switch", () => {
    it("exposes exactly the capabilities the SSE route schemas describe", async () => {
      const registry = registryOver([]);
      const names = SITE_ASSISTANT_TOOL_SCHEMAS.map((s) => s.name);
      for (const name of names) {
        const outcome = await registry.invoke({ name, input: {}, caller: "anonymous-visitor" });
        assert.notEqual(outcome.kind, "refused", `${name} should be a known, granted capability`);
      }
    });

    it("re-exports the same model-facing schemas tools.ts defines", () => {
      const registry = registryOver([]);
      assert.equal(registry.schemas, SITE_ASSISTANT_TOOL_SCHEMAS);
    });
  });
});
