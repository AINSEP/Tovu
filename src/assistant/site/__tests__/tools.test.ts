import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSiteAssistantTools } from "../tools";

/**
 * The property under test is a security one: this surface is reachable by anonymous internet
 * traffic, so no tool may return anything that is not `status: "published"`. The fake port below
 * deliberately returns EVERY row regardless of the `status` filter it is handed, so a tool that
 * forgot to pin the filter — or that filtered client-side and got the predicate wrong — fails here
 * rather than in production.
 */

interface FakeRow {
  id: string;
  workspaceId: string;
  type: string;
  slug: string;
  status: "draft" | "published" | "unpublished";
  title: string;
  bodyJson: unknown;
  fieldsJson: unknown;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

function row(partial: Partial<FakeRow> & { slug: string; status: FakeRow["status"] }): FakeRow {
  return {
    id: `id-${partial.slug}`,
    workspaceId: "ws",
    type: "post",
    title: partial.slug,
    bodyJson: null,
    fieldsJson: {},
    publishedAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    version: 1,
    ...partial,
  };
}

const ROWS: FakeRow[] = [
  row({ slug: "public-post", status: "published", title: "Public Post", publishedAt: "2026-01-01" }),
  row({ slug: "secret-draft", status: "draft", title: "Secret Draft" }),
  row({ slug: "taken-down", status: "unpublished", title: "Taken Down" }),
  row({ slug: "public-page", status: "published", title: "Public Page", type: "page" }),
];

/** Honors the `status` filter, like a real adapter. */
function honestPort() {
  const calls: unknown[] = [];
  return {
    calls,
    port: {
      listByWorkspace: async (params: { status?: string }) => {
        calls.push(params);
        return ROWS.filter((r) => (params.status ? r.status === params.status : true));
      },
    },
  };
}

/** IGNORES the `status` filter — models an adapter bug, or a caller that never sent one. Any tool
 *  relying on the database to be well-behaved rather than pinning the filter itself leaks here. */
const leakyPort = { listByWorkspace: async () => ROWS };

describe("site assistant tools", () => {
  describe("published-only enforcement", () => {
    it("pins status:published into the query rather than filtering after the fact", async () => {
      const { calls, port } = honestPort();
      await createSiteAssistantTools({ entryList: port as never, workspaceId: "ws" }).list_categories();
      assert.equal((calls[0] as { status: string }).status, "published");
    });

    it("never surfaces a draft or an unpublished entry from search", async () => {
      const tools = createSiteAssistantTools({ entryList: honestPort().port as never, workspaceId: "ws" });
      const slugs = (await tools.search_published_entries({})).map((e) => e.slug);
      assert.deepEqual(slugs.sort(), ["public-page", "public-post"]);
    });

    it("refuses to fetch a draft by slug even when the slug is guessed correctly", async () => {
      const tools = createSiteAssistantTools({ entryList: honestPort().port as never, workspaceId: "ws" });
      const result = await tools.get_published_entry({ slug: "secret-draft" });
      assert.ok("error" in result, "a draft must never resolve");
    });

    it("gives an unpublished entry the same response as a nonexistent one", async () => {
      // Distinguishing them would confirm that hidden content exists to anyone who can guess a slug.
      const tools = createSiteAssistantTools({ entryList: honestPort().port as never, workspaceId: "ws" });
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
      const tools = createSiteAssistantTools({ entryList: honestPort().port as never, workspaceId: "ws" });
      const [first] = await tools.search_published_entries({ query: "public post" });
      assert.deepEqual(Object.keys(first).sort(), ["publishedAt", "slug", "title", "type"]);
    });

    it("returns plain text from a Tiptap body, not the document tree", async () => {
      const port = {
        listByWorkspace: async () => [
          row({
            slug: "doc",
            status: "published",
            bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello world" }] }] },
          }),
        ],
      };
      const tools = createSiteAssistantTools({ entryList: port as never, workspaceId: "ws" });
      const result = await tools.get_published_entry({ slug: "doc" });
      assert.equal((result as { text: string }).text, "hello world");
    });

    it("degrades to empty text on a malformed body rather than throwing", async () => {
      // bodyJson is `unknown` and rows written by older schema versions are real. A bad body must
      // cost the answer some detail, never fail the visitor's request.
      const port = { listByWorkspace: async () => [row({ slug: "bad", status: "published", bodyJson: "not-a-doc" })] };
      const tools = createSiteAssistantTools({ entryList: port as never, workspaceId: "ws" });
      const result = await tools.get_published_entry({ slug: "bad" });
      assert.equal((result as { text: string }).text, "");
    });

    it("derives categories from published entries only, not from the type registry", async () => {
      const tools = createSiteAssistantTools({ entryList: honestPort().port as never, workspaceId: "ws" });
      assert.deepEqual(await tools.list_categories(), ["page", "post"]);
    });
  });

  describe("input handling", () => {
    it("treats a missing or non-string slug as a validation error, not a lookup", async () => {
      const tools = createSiteAssistantTools({ entryList: honestPort().port as never, workspaceId: "ws" });
      for (const input of [{}, { slug: 42 }, { slug: "   " }]) {
        const result = await tools.get_published_entry(input as never);
        assert.ok("error" in result, `input ${JSON.stringify(input)} must not resolve an entry`);
      }
    });

    it("still withholds drafts when the underlying adapter ignores the status filter", async () => {
      // Belt-and-braces: if this ever fails, the tools are trusting the database to be correct
      // rather than enforcing the contract themselves.
      const tools = createSiteAssistantTools({ entryList: leakyPort as never, workspaceId: "ws" });
      const result = await tools.get_published_entry({ slug: "secret-draft" });
      assert.ok("error" in result, "a leaky adapter must not become a content leak");
    });
  });
});
