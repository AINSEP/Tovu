import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import type { AdminTaxonomyWithTerms, AdminTerm } from "../../../lib/api";
import { FetchQueryProvider } from "../../../lib/fetch-query";
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

    await executePageCapability(driver, "page.click", { handle: "taxonomy-new-term-tax-a-open" });
    await driver.settle?.();

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
    const { container } = renderTaxonomy({ formOpen: true });
    await screen.findByLabelText(/^New taxonomy$/);
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.fill", { handle: "taxonomy-new-name", text: "Series" });
    expect((screen.getByPlaceholderText("e.g. Category") as HTMLInputElement).value).toBe("Series");

    const checkbox = screen.getByRole("checkbox", { name: "Hierarchical" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    await executePageCapability(driver, "page.click", { handle: "taxonomy-new-hierarchical" });
    expect(checkbox.checked).toBe(true);

    expect(await handlesOf(driver)).toContain("taxonomy-new-submit");
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

    await executePageCapability(driver, "page.click", { handle: "taxonomy-term-t-alpha" });

    expect(controller.setSelectedTermId).toHaveBeenCalledWith("t-alpha");
    expect(controller.setSelectedTermId).not.toHaveBeenCalledWith("t-beta");
  });
});
