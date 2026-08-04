import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSiteAssistantTools } from "../tools";

/**
 * The property under test is a security one: this surface is reachable by anonymous internet
 * traffic, so no tool may return anything that is not `status: "published"` and non-trashed.
 *
 * Unlike the `entries`/`EntryListPort` model this file used to test against, `PostRepoPort.list()`
 * has no `status` parameter at all — it always returns every row in the workspace, drafts and
 * trashed rows included (see `tools.ts`'s file header). So `fakePort` below is not split into an
 * "honest" and a "leaky" variant the way the old entries-based test was: there is only one real
 * shape, and it is the leaky one by contract. Every test here proves the tool's own filter, not the
 * port's.
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

const ROWS: FakeRow[] = [
  row({ slug: "public-post", status: "published", title: "Public Post" }),
  row({ slug: "secret-draft", status: "draft", title: "Secret Draft" }),
  row({ slug: "taken-down", status: "published", title: "Taken Down", deletedAt: "2026-02-01" }),
  row({ slug: "public-page", status: "published", title: "Public Page", kind: "page" }),
];

/** `PostRepoPort.list()`'s real contract: every row in the workspace, unfiltered by status or
 *  trash state — see `tools.ts`'s file header for why this is the only shape worth faking. */
function fakePort(rows: FakeRow[] = ROWS) {
  const calls: unknown[] = [];
  return {
    calls,
    port: {
      list: async (params: { workspaceId: string }) => {
        calls.push(params);
        return rows as never;
      },
    },
  };
}

describe("site assistant tools", () => {
  describe("published-only enforcement", () => {
    it("scopes the list call to the configured workspace", async () => {
      const { calls, port } = fakePort();
      await createSiteAssistantTools({ postRepo: port as never, workspaceId: "ws" }).list_categories();
      assert.deepEqual(calls[0], { workspaceId: "ws" });
    });

    it("never surfaces a draft from search", async () => {
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      const slugs = (await tools.search_published_entries({})).map((e) => e.slug);
      assert.deepEqual(slugs.sort(), ["public-page", "public-post"]);
    });

    it("never surfaces a trashed post from search, even though its status still reads published", async () => {
      // `PostRepoPort.softDelete` only stamps `deletedAt` — it deliberately does not touch `status`
      // (see `post.ts`). A tool that checked `status` alone would leak this row.
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      const slugs = (await tools.search_published_entries({})).map((e) => e.slug);
      assert.ok(!slugs.includes("taken-down"), "a trashed row must never resolve");
    });

    it("refuses to fetch a draft by slug even when the slug is guessed correctly", async () => {
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      const result = await tools.get_published_entry({ slug: "secret-draft" });
      assert.ok("error" in result, "a draft must never resolve");
    });

    it("gives a trashed post the same response as a nonexistent one", async () => {
      // Distinguishing them would confirm that hidden content exists to anyone who can guess a slug.
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      const takenDown = await tools.get_published_entry({ slug: "taken-down" });
      const neverExisted = await tools.get_published_entry({ slug: "no-such-slug-at-all" });
      assert.ok("error" in takenDown && "error" in neverExisted);
      assert.equal(
        (takenDown as { error: string }).error.replace("taken-down", "X"),
        (neverExisted as { error: string }).error.replace("no-such-slug-at-all", "X"),
      );
    });
  });

  describe("output shape", () => {
    it("never leaks internal identifiers into anything the model sees", async () => {
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      const [first] = await tools.search_published_entries({ query: "public post" });
      assert.deepEqual(Object.keys(first).sort(), ["slug", "title", "type", "updatedAt"]);
    });

    it("returns plain text from a Tiptap body, not the document tree", async () => {
      const port = fakePort([
        row({
          slug: "doc",
          status: "published",
          bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }] },
        }),
      ]).port;
      const tools = createSiteAssistantTools({ postRepo: port as never, workspaceId: "ws" });
      const result = await tools.get_published_entry({ slug: "doc" });
      assert.equal((result as { text: string }).text, "hello world");
    });

    it("degrades to empty text on a malformed body rather than throwing", async () => {
      // bodyJson is typed `JsonObject` but rows written by older schema versions are real. A bad
      // body must cost the answer some detail, never fail the visitor's request.
      const port = fakePort([row({ slug: "bad", status: "published", bodyJson: "not-a-doc" })]).port;
      const tools = createSiteAssistantTools({ postRepo: port as never, workspaceId: "ws" });
      const result = await tools.get_published_entry({ slug: "bad" });
      assert.equal((result as { text: string }).text, "");
    });

    it("derives categories from published, non-trashed posts only", async () => {
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      assert.deepEqual(await tools.list_categories(), ["page", "post"]);
    });
  });

  describe("input handling", () => {
    it("treats a missing or non-string slug as a validation error, not a lookup", async () => {
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      for (const input of [{}, { slug: 42 }, { slug: "   " }]) {
        const result = await tools.get_published_entry(input as never);
        assert.ok("error" in result, `input ${JSON.stringify(input)} must not resolve an entry`);
      }
    });

    it("caps search_published_entries at maxResults", async () => {
      const many = Array.from({ length: 5 }, (_, i) => row({ slug: `p${i}`, status: "published" }));
      const tools = createSiteAssistantTools({ postRepo: fakePort(many).port as never, workspaceId: "ws", maxResults: 2 });
      const results = await tools.search_published_entries({});
      assert.equal(results.length, 2);
    });

    it("does not cap list_categories or get_published_entry, only the search list", async () => {
      // The cap bounds what the model sees per search call; it must not make older content
      // invisible to category enumeration or a direct, addressed slug lookup.
      const many = Array.from({ length: 5 }, (_, i) => row({ slug: `p${i}`, status: "published", kind: i === 4 ? "page" : "post" }));
      const tools = createSiteAssistantTools({ postRepo: fakePort(many).port as never, workspaceId: "ws", maxResults: 2 });
      assert.deepEqual(await tools.list_categories(), ["page", "post"]);
      const result = await tools.get_published_entry({ slug: "p4" });
      assert.ok(!("error" in result), "a slug outside the search cap must still resolve directly");
    });
  });

  /**
   * SPEC-046 REQ-4/REQ-6/REQ-8 — the three page-action tools. Same `fakePort`/`ROWS` as the
   * read-only tools above, deliberately: `navigate_to_entry`/`scroll_to_entry`/`highlight_entry` must
   * refuse a draft or trashed-but-`published` slug for the identical reason
   * `get_published_entry` does — they resolve through the same `resolvePublicTarget`, which itself
   * calls the same `listPublishedPosts` predicate.
   */
  describe("page-action tools (navigate/scroll_to/highlight)", () => {
    it("navigate_to_entry resolves a published slug to a same-site path directive", async () => {
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      const { result, directive } = await tools.navigate_to_entry({ slug: "public-post" });
      assert.ok(!("error" in (result as object)), "a real published slug must resolve");
      assert.deepEqual(directive, {
        kind: "page_action",
        action: { type: "navigate", target: { slug: "public-post", title: "Public Post", path: "/public-post" }, auto: false },
      });
    });

    it("navigate_to_entry's auto flag is false unless autoNavigateAllowed is explicitly true (SPEC-046 D-1)", async () => {
      const port = fakePort().port as never;
      const defaultDeps = await createSiteAssistantTools({ postRepo: port, workspaceId: "ws" }).navigate_to_entry({ slug: "public-post" });
      const explicitFalse = await createSiteAssistantTools({ postRepo: port, workspaceId: "ws", autoNavigateAllowed: false }).navigate_to_entry({
        slug: "public-post",
      });
      const explicitTrue = await createSiteAssistantTools({ postRepo: port, workspaceId: "ws", autoNavigateAllowed: true }).navigate_to_entry({
        slug: "public-post",
      });
      assert.equal((defaultDeps.directive as { action: { auto: boolean } }).action.auto, false, "omitted defaults to the safer propose-only behavior");
      assert.equal((explicitFalse.directive as { action: { auto: boolean } }).action.auto, false);
      assert.equal((explicitTrue.directive as { action: { auto: boolean } }).action.auto, true);
    });

    for (const toolName of ["navigate_to_entry", "scroll_to_entry", "highlight_entry"] as const) {
      it(`${toolName} refuses a draft slug and emits no directive`, async () => {
        const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
        const { result, directive } = await tools[toolName]({ slug: "secret-draft" });
        assert.ok("error" in (result as object), "a draft must never resolve to a target");
        assert.equal(directive, undefined, "a refused target must never carry a client-facing directive");
      });

      it(`${toolName} refuses a trashed-but-published slug and emits no directive`, async () => {
        // The REQ-6 regression this guards against: `deletedAt` is independent of `status`, so a
        // hand-rolled `status === "published"` check here would leak this row. See `tools.ts`'s
        // header and `client-directives.ts`'s `resolvePublicTarget` doc.
        const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
        const { result, directive } = await tools[toolName]({ slug: "taken-down" });
        assert.ok("error" in (result as object), "a trashed row reading status: published must still be refused");
        assert.equal(directive, undefined);
      });

      it(`${toolName} refuses slugs that look like an off-site/admin/scheme injection attempt, by never matching a real row`, async () => {
        // REQ-6's refusal list (off-site URLs, javascript:/data: schemes, admin paths) is not
        // enumerated as separate cases in `resolvePublicTarget` — none of these strings can ever
        // equal a real published slug, so they refuse by construction. Proven directly here rather
        // than asserted only by code inspection.
        const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
        const adversarialSlugs = [
          "https://evil.example/public-post",
          "//evil.example/public-post",
          "javascript:alert(1)",
          "data:text/html,<script>alert(1)</script>",
          "admin",
          "../admin/settings",
        ];
        for (const slug of adversarialSlugs) {
          const { result, directive } = await tools[toolName]({ slug });
          assert.ok("error" in (result as object), `"${slug}" must never resolve to a target`);
          assert.equal(directive, undefined, `"${slug}" must never emit a directive`);
        }
      });

      it(`${toolName} treats a missing or non-string slug as a refusal, not a lookup`, async () => {
        const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
        for (const input of [{}, { slug: 42 }, { slug: "   " }]) {
          const { result, directive } = await tools[toolName](input as never);
          assert.ok("error" in (result as object), `input ${JSON.stringify(input)} must not resolve a target`);
          assert.equal(directive, undefined);
        }
      });
    }

    it("scroll_to_entry's directive carries no auto/propose distinction — it always executes immediately client-side", async () => {
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      const { directive } = await tools.scroll_to_entry({ slug: "public-post" });
      assert.deepEqual(directive, {
        kind: "page_action",
        action: { type: "scroll_to", target: { slug: "public-post", title: "Public Post", path: "/public-post" } },
      });
    });

    it("highlight_entry resolves the same target shape as scroll_to_entry, tagged as a highlight action", async () => {
      const tools = createSiteAssistantTools({ postRepo: fakePort().port as never, workspaceId: "ws" });
      const { directive } = await tools.highlight_entry({ slug: "public-page" });
      assert.deepEqual(directive, {
        kind: "page_action",
        action: { type: "highlight", target: { slug: "public-page", title: "Public Page", path: "/public-page" } },
      });
    });
  });
});
