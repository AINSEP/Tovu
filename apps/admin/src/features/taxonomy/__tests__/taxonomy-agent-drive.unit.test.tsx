import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

/**
 * KNOWN GAP (found while writing this batch's test, not previously documented anywhere): `RowMenu`
 * (`@jini-ai/admin/react`) renders its dropdown via `createPortal(..., document.body)` — see that
 * component's own file comment. Tovu's real agent bridge (`App.hooks.tsx`'s `useAgentPageBridge`)
 * scopes its `createDomPageDriver` to `contentEl` (`<main>`), deliberately narrower than
 * `document.body`, so "a page verb cannot reach into the assistant's own UI" (that file's own
 * comment). `<main>` does not contain `document.body`'s other children, so a portaled dropdown is
 * OUTSIDE the driver's root — structurally, not by omission.
 *
 * Net effect: the trigger button (not portaled — an ordinary descendant of `<main>`) IS discoverable
 * and clickable through the real bridge, and `page.click` on it does flip `open` — but the dropdown
 * ITEMS it reveals are not, because they render into a DOM subtree the scoped driver never scans.
 * `agentHandle` on `RowMenu` is therefore necessary but not sufficient for "an agent can pick a
 * specific row action" — the tests below assert this real, current shape (root scoped to `container`,
 * matching `contentEl` in production) rather than testing against `document.body`, which would hide
 * the gap behind a driver scope the shipping app does not use.
 */
describe("driving the taxonomy-level RowMenu through page.* verbs", () => {
  it("publishes a distinct, clickable handle per taxonomy trigger; its dropdown item stays outside the production-scoped root", async () => {
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
    await executePageCapability(driver, "page.click", { handle: "taxonomy-menu-tax-a" });
    await driver.settle?.();

    // Through the production-shaped scoped root, the opened item is still invisible — not because
    // the click failed, but because `RowMenu` rendered it into `document.body`, outside `container`.
    const afterScoped = await handlesOf(driver);
    expect(afterScoped).not.toContain("taxonomy-menu-tax-a-item-delete");

    // Proves the click DID work and the item DOES exist — just unreachable via the scoped root above.
    // A driver rooted at `document.body` (never used by the real bridge; shown here only to isolate
    // the cause) finds it immediately.
    const bodyDriver = createDomPageDriver({ root: document.body, pages: {} });
    expect(await handlesOf(bodyDriver)).toContain("taxonomy-menu-tax-a-item-delete");
  });
});

describe("driving the term-level RowMenu through page.* verbs", () => {
  it("publishes a distinct handle per term, derived from the same id as the term's own row handle", async () => {
    const group: AdminTaxonomyWithTerms = {
      taxonomy: taxonomyMeta(),
      terms: [term({ id: "t-alpha", name: "Alpha" }), term({ id: "t-beta", name: "Beta" })],
    };
    const { container } = renderTaxonomy({ taxonomies: [group] });
    await screen.findByText("Alpha");
    const driver = createDomPageDriver({ root: container, pages: {} });

    const before = await handlesOf(driver);
    // Derived from the SAME id as the row's own `taxonomy-term-t-alpha` handle (see `Taxonomy.tsx`'s
    // `termHandle` — the menu is `${termHandle}-menu`), so an agent reading `page.find_elements` can
    // tell the row and its menu belong to the same term without cross-referencing anything else.
    expect(before).toContain("taxonomy-term-t-alpha-menu");
    expect(before).toContain("taxonomy-term-t-beta-menu");
    expect(before).not.toContain("taxonomy-term-t-alpha-menu-item-delete");

    await executePageCapability(driver, "page.click", { handle: "taxonomy-term-t-alpha-menu" });
    await driver.settle?.();

    // Same production-shaped scoped-root gap as the taxonomy-level menu above — see this file's
    // "KNOWN GAP" comment. The item exists (confirmed via `document.body` below) but not here.
    const after = await handlesOf(driver);
    expect(after).not.toContain("taxonomy-term-t-alpha-menu-item-delete");

    const bodyDriver = createDomPageDriver({ root: document.body, pages: {} });
    expect(await handlesOf(bodyDriver)).toContain("taxonomy-term-t-alpha-menu-item-delete");
    // Beta's own menu stays closed — its item never appears from Alpha's click.
    expect(after).not.toContain("taxonomy-term-t-beta-menu-item-delete");
  });
});
