import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { CollectionEntryEditor } from "../CollectionEntryEditor";
import { CollectionEntries } from "../CollectionEntries";
import { Collections } from "../Collections";
import type { CollectionsController } from "../hooks/use-collections.hooks";
import type { AdminContentType } from "../../../lib/api";

/**
 * @file Regression test for this batch's agent-control tagging on the `collections` feature
 * (`Collections.tsx`/`CollectionEntries.tsx`/`CollectionEntryEditor.tsx`) — same shape as
 * `forms/__tests__/forms-agent-drive.unit.test.tsx`, driving the real `executePageCapability` and
 * the real `createDomPageDriver`, not `userEvent`.
 *
 * Properties covered:
 *
 * 1. `page.fill` on `CollectionEntryEditor`'s title/slug fields reaches React state.
 * 2. A NEW entry publishes `entry-save` but never `entry-publish`/`entry-unpublish` — those are
 *    conditional on `entry` existing (`EntryLifecycleButtons`), so this is a live render check, not
 *    an assumption from reading the JSX once.
 * 3. `Collections`' list gives each row's "Manage entries" link a distinct, id-derived handle —
 *    exercised through the screen's own `useCollectionsHook` injection seam (no `fetch` needed),
 *    same convention `Collections.unit.test.tsx` already uses for this screen.
 * 4. `CollectionEntries`' list does the same for its own row-edit links, over a real `fetch` mock.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubLocaleAndRoute(fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>) {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective")) return Promise.resolve(jsonResponse({ data: [] }));
    return fetchMock(url, init);
  });
}

interface FoundElement {
  handle: string;
  role?: string;
  label: string;
}

async function findElements(
  driver: ReturnType<typeof createDomPageDriver>,
  filter: { role?: string } = {},
): Promise<FoundElement[]> {
  const result = (await executePageCapability(driver, "page.find_elements", filter)) as { elements: FoundElement[] };
  return result.elements;
}

async function handlesOf(driver: ReturnType<typeof createDomPageDriver>, filter: { role?: string } = {}) {
  return (await findElements(driver, filter)).map((element) => element.handle);
}

const ARTICLE_TYPE = {
  workspaceId: "w1",
  key: "articles",
  label: "Article",
  fields: [],
  status: "active" as const,
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("driving a new entry's editor through page.* verbs", () => {
  it("page.fill on the title and slug fields reaches React state", async () => {
    stubLocaleAndRoute(fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [ARTICLE_TYPE] })) // listContentTypes
      .mockResolvedValueOnce(jsonResponse({ items: [] })); // listTaxonomies

    const { container } = render(
      <FetchQueryProvider>
        <CollectionEntryEditor contentTypeKey="articles" entryId={null} />
      </FetchQueryProvider>,
    );
    await screen.findByLabelText("Entry title");
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.fill", { handle: "entry-title", text: "Hello world" });
    await executePageCapability(driver, "page.fill", { handle: "entry-slug", text: "hello-world" });

    expect((screen.getByLabelText("Entry title") as HTMLInputElement).value).toBe("Hello world");
    expect((screen.getByLabelText("Entry slug") as HTMLInputElement).value).toBe("hello-world");
  });

  it("publishes entry-save but never entry-publish/entry-unpublish — those need an existing entry", async () => {
    stubLocaleAndRoute(fetchMock);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [ARTICLE_TYPE] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    const { container } = render(
      <FetchQueryProvider>
        <CollectionEntryEditor contentTypeKey="articles" entryId={null} />
      </FetchQueryProvider>,
    );
    await screen.findByLabelText("Entry title");
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver);
    expect(handles).toContain("entry-save");
    expect(handles).not.toContain("entry-publish");
    expect(handles).not.toContain("entry-unpublish");
  });
});

describe("addressing the collections list", () => {
  function controller(overrides: Partial<CollectionsController> = {}): CollectionsController {
    return {
      types: [],
      error: null,
      showNewDialog: false,
      setShowNewDialog: vi.fn(),
      pendingLifecycle: null,
      setPendingLifecycle: vi.fn(),
      editingFieldsFor: null,
      setEditingFieldsFor: vi.fn(),
      actionError: null,
      load: vi.fn(),
      runLifecycle: vi.fn(async () => {}),
      t: (key: string) => key,
      locale: "en",
      ...overrides,
    };
  }

  it("gives every content type row a distinct, key-derived entries-link handle", async () => {
    const types: AdminContentType[] = [
      { workspaceId: "w1", key: "recipe", label: "Recipe", fields: [], status: "active", version: 1 },
      { workspaceId: "w1", key: "article", label: "Article", fields: [], status: "active", version: 1 },
    ];
    const { container } = render(<Collections useCollectionsHook={() => controller({ types })} />);
    await screen.findAllByRole("link", { name: "Manage entries" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    const links = await handlesOf(driver, { role: "link" });
    expect(links).toContain("collections-row-recipe-entries");
    expect(links).toContain("collections-row-article-entries");
    expect(new Set(links).size).toBe(links.length);
  });

  it("find_elements discovers the header region and the New content type button", async () => {
    const { container } = render(<Collections useCollectionsHook={() => controller()} />);
    await screen.findByRole("button", { name: "New content type" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver);
    expect(handles).toContain("collections-header");
    expect(handles).toContain("collections-new");
  });
});

describe("addressing a content type's entries list", () => {
  it("gives every entry row a distinct, id-derived edit-link handle — never the RowMenu-less trigger this screen doesn't have", async () => {
    stubLocaleAndRoute(fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/content-types")) return Promise.resolve(jsonResponse({ items: [ARTICLE_TYPE] }));
      if (String(url).includes("/entries")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "e1",
                workspaceId: "w1",
                type: "articles",
                slug: "first",
                status: "published",
                title: "First",
                bodyJson: null,
                fieldsJson: {},
                publishedAt: "2026-07-01T09:00:00.000Z",
                createdAt: "2026-07-01T09:00:00.000Z",
                updatedAt: "2026-07-01T09:00:00.000Z",
                version: 1,
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`collections-agent-drive test: no mocked route for ${url}`));
    });

    const { container } = render(
      <FetchQueryProvider>
        <CollectionEntries contentTypeKey="articles" />
      </FetchQueryProvider>,
    );
    await screen.findByRole("link", { name: "First" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    const linkHandles = await handlesOf(driver, { role: "link" });
    expect(linkHandles).toContain("collection-entries-new");
    expect(linkHandles).toContain("collection-entries-row-e1-edit");
  });
});
