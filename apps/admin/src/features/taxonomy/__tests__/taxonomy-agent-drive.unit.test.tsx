import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import type { AdminTaxonomyWithTerms, AdminTerm } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { Taxonomy } from "../Taxonomy";
import type { TaxonomyController } from "../hooks/use-taxonomy.hooks";

/**
 * @file Regression test for this batch's agent-control tagging on `Taxonomy.tsx` — same shape as
 * `forms/__tests__/forms-agent-drive.unit.test.tsx`, driving the real `executePageCapability` and
 * the real `createDomPageDriver`, not `userEvent`.
 *
 * Uses the same `useTaxonomyHook` injection seam `Taxonomy.unit.test.tsx` already established —
 * `NewTaxonomyForm`/`NewTermForm` compose their own real `useWiredX` hooks but never fetch on
 * mount, so a `FetchQueryProvider` ancestor is enough; no `fetch` mock is needed for anything short
 * of an actual submit, which these tests don't trigger.
 *
 * Properties covered:
 *
 * 1. Two taxonomies get their own `NewTermForm` base handle, and each one's own name/parent/submit
 *    handles only appear after `page.click`-ing THAT taxonomy's own "+ Add term" trigger — proving
 *    the per-group scoping actually reaches the DOM, not just the handle-generation logic in
 *    isolation (already covered by `rules.unit.test.ts`-style pure tests elsewhere).
 * 2. A term row's handle sits on the visible name `<span>`, not the `<li>` — `page.click` on it
 *    must still select the term (bubbling to the `<li>`'s own `onClick`), proving the fix for the
 *    RowMenu-adoption hazard documented inline in `Taxonomy.tsx`.
 * 3. Both of this screen's `RowMenu`s (per-taxonomy, per-term) now publish an `agentHandle` —
 *    `RowMenu`'s own `agentHandle` prop only reached `@jini-ai/admin/react` this session, and
 *    nothing in Tovu passed it before this batch. Covers the representative case for the whole
 *    "wire every `<RowMenu>` call site" workstream: the trigger is discoverable via a first
 *    `page.find_elements`, its items only appear on a SECOND call after `page.click` opens it (the
 *    menu is portaled and conditionally rendered — see `RowMenu.tsx`'s own doc comment), and two
 *    rows under the same list publish distinct handles.
 */

function taxonomyMeta(overrides: Partial<AdminTaxonomyWithTerms["taxonomy"]> = {}) {
  return {
    id: "tax1",
    name: "Category",
    hierarchical: false,
    status: "active",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function term(overrides: Partial<AdminTerm> = {}): AdminTerm {
  return {
    id: "t1",
    taxonomyId: "tax1",
    parentId: null,
    name: "Term",
    status: "active",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function baseController(overrides: Partial<TaxonomyController> = {}): TaxonomyController {
  return {
    taxonomies: [],
    error: null,
    selectedTermId: null,
    setSelectedTermId: vi.fn(),
    selected: null,
    load: vi.fn(),
    formOpen: false,
    setFormOpen: vi.fn(),
    pendingDeleteTerm: null,
    requestDeleteTerm: vi.fn(),
    deleteTermBusy: false,
    deleteTermBlocked: null,
    confirmDeleteTerm: vi.fn(),
    pendingDeleteTaxonomy: null,
    requestDeleteTaxonomy: vi.fn(),
    deleteTaxonomyBusy: false,
    deleteTaxonomyBlocked: null,
    confirmDeleteTaxonomy: vi.fn(),
    t: (key: string) => key,
    ...overrides,
  };
}

function renderTaxonomy(overrides: Partial<TaxonomyController> = {}) {
  const controller = baseController(overrides);
  const { container } = render(
    <FetchQueryProvider>
      <Taxonomy useTaxonomyHook={() => controller} />
    </FetchQueryProvider>,
  );
  return { controller, container };
}

afterEach(() => vi.unstubAllGlobals());

interface FoundElement {
  handle: string;
  role?: string;
  label: string;
}

async function findElements(
  driver: ReturnType<typeof createDomPageDriver>,
  filter: { role?: string } = {},
): Promise<FoundElement[]> {
  const result = (await executePageCapability({ driver, capabilityId: "page.find_elements", input: filter })) as { elements: FoundElement[] };
  return result.elements;
}

async function handlesOf(driver: ReturnType<typeof createDomPageDriver>, filter: { role?: string } = {}) {
  return (await findElements(driver, filter)).map((element) => element.handle);
}

describe("driving per-taxonomy forms through page.* verbs", () => {
  it("each taxonomy's own Add-term trigger reveals only ITS OWN name/submit handles", async () => {
    const groupA: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax-a", name: "Category" }), terms: [] };
    const groupB: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax-b", name: "Tag" }), terms: [] };
    const { container } = renderTaxonomy({ taxonomies: [groupA, groupB] });
    await screen.findAllByRole("button", { name: "+ Add term" });
    const driver = createDomPageDriver({ root: container, pages: {} });

    const before = await handlesOf(driver);
    expect(before).toContain("taxonomy-new-term-tax-a-open");
    expect(before).toContain("taxonomy-new-term-tax-b-open");
    expect(before).not.toContain("taxonomy-new-term-tax-a-name");

    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-new-term-tax-a-open" } });
    await driver.settle?.({});

    const after = await handlesOf(driver);
    expect(after).toContain("taxonomy-new-term-tax-a-name");
    expect(after).toContain("taxonomy-new-term-tax-a-submit");
    // Group B's own form is untouched — still collapsed, no name field of its own yet.
    expect(after).not.toContain("taxonomy-new-term-tax-b-name");
    expect(after).toContain("taxonomy-new-term-tax-b-open");
  });
});

describe("driving the new-taxonomy form through page.* verbs", () => {
  it("page.fill on the name field reaches React state, and page.click toggles Hierarchical", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/settings/effective")) return new Response(JSON.stringify({ data: [] }));
      if (String(url) === "/api/admin/v1/taxonomy" && init?.method === "POST") {
        return new Response(JSON.stringify({ taxonomy: taxonomyMeta({ name: "Series", hierarchical: true }) }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderTaxonomy({ formOpen: true });
    await screen.findByLabelText(/^New taxonomy$/);
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability({ driver, capabilityId: "page.fill", input: { handle: "taxonomy-new-name", text: "Series" } });
    expect((screen.getByPlaceholderText("e.g. Category") as HTMLInputElement).value).toBe("Series");

    const checkbox = screen.getByRole("checkbox", { name: "Hierarchical" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-new-hierarchical" } });
    expect(checkbox.checked).toBe(true);

    expect(await handlesOf(driver)).toContain("taxonomy-new-submit");
    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-new-submit" } });
    await waitFor(() => {
      const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toBe("/api/admin/v1/taxonomy");
      expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ name: "Series", hierarchical: true });
    });
  });
});

describe("addressing term rows without triggering the RowMenu they sit beside", () => {
  it("page.click on a term's handle selects it (bubbles to the <li>), never the neighboring RowMenu trigger", async () => {
    const group: AdminTaxonomyWithTerms = {
      taxonomy: taxonomyMeta(),
      terms: [term({ id: "t-alpha", name: "Alpha" }), term({ id: "t-beta", name: "Beta" })],
    };
    const { controller, container } = renderTaxonomy({ taxonomies: [group] });
    await screen.findByText("Alpha");
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver, { role: "button" });
    expect(handles).toContain("taxonomy-term-t-alpha");
    expect(handles).toContain("taxonomy-term-t-beta");

    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-term-t-alpha" } });

    expect(controller.setSelectedTermId).toHaveBeenCalledWith("t-alpha");
    expect(controller.setSelectedTermId).not.toHaveBeenCalledWith("t-beta");
  });
});

/**
 * Regression for menus formerly portaled outside the production bridge's `<main>` root.
 * Keep the real driver scoped to `container`: reaching the items must come from the
 * page's portal container, with the assistant's own UI still outside the scope.
 */
describe("driving the taxonomy-level RowMenu through page.* verbs", () => {
  it("the scoped agent can discover and select the opened taxonomy's delete action", async () => {
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax-a", name: "Category" }), terms: [] };
    const { controller, container } = renderTaxonomy({ taxonomies: [group] });
    await screen.findByText("Category");
    const driver = createDomPageDriver({ root: container, pages: {} });
    const assistantControl = document.createElement("button");
    assistantControl.setAttribute("data-agent-element", "assistant-private-action");
    document.body.append(assistantControl);
    try {
      expect(await handlesOf(driver)).toContain("taxonomy-menu-tax-a");
      await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-menu-tax-a" } });
      await driver.settle?.({});
      expect(await handlesOf(driver)).toContain("taxonomy-menu-tax-a-item-delete");
      expect(await handlesOf(driver)).not.toContain("assistant-private-action");
      await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-menu-tax-a-item-delete" } });
      expect(controller.requestDeleteTaxonomy).toHaveBeenCalledTimes(1);
      expect(controller.requestDeleteTaxonomy).toHaveBeenCalledWith(group.taxonomy);
      await driver.settle?.({});
      expect(await handlesOf(driver)).not.toContain("taxonomy-menu-tax-a-item-delete");
    } finally {
      assistantControl.remove();
    }
  });

  it("publishes distinct taxonomy triggers and keeps the opened menu inside the production-scoped root", async () => {
    const groupA: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax-a", name: "Category" }), terms: [] };
    const groupB: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax-b", name: "Tag" }), terms: [] };
    const { container } = renderTaxonomy({ taxonomies: [groupA, groupB] });
    await screen.findByText("Category");
    // Scoped to `container`, the same way `App.hooks.tsx` scopes the real bridge to `contentEl`
    // rather than `document.body` — see this block's own doc comment above.
    const driver = createDomPageDriver({ root: container, pages: {} });

    // First call: only the two triggers exist. `RowMenu` only renders its dropdown while `open`, so
    // neither taxonomy's "Delete taxonomy" item is in the DOM yet regardless of root.
    const before = await handlesOf(driver);
    expect(before).toContain("taxonomy-menu-tax-a");
    expect(before).toContain("taxonomy-menu-tax-b");
    // Distinct handles — id-derived, not position-derived — same property `Users.tsx`'s row menus
    // and every other list on this workstream must hold. A duplicate would not fail loudly; it would
    // make `page.click` silently resolve to whichever menu the DOM reaches first (see
    // `buildAgentListHandles`'s own doc comment).
    expect(new Set(before).size).toBe(before.length);
    expect(before).not.toContain("taxonomy-menu-tax-a-item-delete");

    // The trigger itself IS reachable and clickable through the scoped root — it is an ordinary
    // descendant of `container`, not portaled.
    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-menu-tax-a" } });
    await driver.settle?.({});

    // Only the opened taxonomy contributes an item to the scoped page.
    const afterScoped = await handlesOf(driver);
    expect(afterScoped).toContain("taxonomy-menu-tax-a-item-delete");
    expect(afterScoped).not.toContain("taxonomy-menu-tax-b-item-delete");

    expect(container.contains(screen.getByRole("menuitem", { name: "Delete taxonomy" }))).toBe(true);
  });
});

describe("driving the term-level RowMenu through page.* verbs", () => {
  it("publishes a distinct handle per term, derived from the same id as the term's own row handle", async () => {
    const group: AdminTaxonomyWithTerms = {
      taxonomy: taxonomyMeta(),
      terms: [term({ id: "t-alpha", name: "Alpha" }), term({ id: "t-beta", name: "Beta" })],
    };
    const { controller, container } = renderTaxonomy({ taxonomies: [group] });
    await screen.findByText("Alpha");
    const driver = createDomPageDriver({ root: container, pages: {} });

    const before = await handlesOf(driver);
    // Derived from the SAME id as the row's own `taxonomy-term-t-alpha` handle (see `Taxonomy.tsx`'s
    // `termHandle` — the menu is `${termHandle}-menu`), so an agent reading `page.find_elements` can
    // tell the row and its menu belong to the same term without cross-referencing anything else.
    expect(before).toContain("taxonomy-term-t-alpha-menu");
    expect(before).toContain("taxonomy-term-t-beta-menu");
    expect(before).not.toContain("taxonomy-term-t-alpha-menu-item-delete");

    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-term-t-alpha-menu" } });
    await driver.settle?.({});

    // Both menu levels must use the same page-owned portal container.
    const after = await handlesOf(driver);
    expect(after).toContain("taxonomy-term-t-alpha-menu-item-delete");

    // Beta's own menu stays closed — its item never appears from Alpha's click.
    expect(after).not.toContain("taxonomy-term-t-beta-menu-item-delete");
    await executePageCapability({ driver, capabilityId: "page.click", input: { handle: "taxonomy-term-t-alpha-menu-item-delete" } });
    expect(controller.requestDeleteTerm).toHaveBeenCalledExactlyOnceWith(group.terms[0]);
    expect(controller.setSelectedTermId).not.toHaveBeenCalled();
    expect(await handlesOf(driver)).not.toContain("taxonomy-term-t-alpha-menu-item-delete");
  });
});
