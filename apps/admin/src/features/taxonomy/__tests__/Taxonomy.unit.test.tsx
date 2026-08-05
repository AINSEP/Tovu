import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminTaxonomyWithTerms, AdminTerm } from "../../../lib/api";
import { Taxonomy } from "../Taxonomy";
import type { TaxonomyController } from "../hooks/use-taxonomy.hooks";

/**
 * @file `Taxonomy` — markup-only assertions driven through the injectable `useTaxonomyHook` seam
 * (same convention `Roles.tsx`/`Posts.tsx` use). `NewTaxonomyForm`, `NewTermForm`,
 * `MergeTermSection`, and `TermDetailPanel` are unexported locals of `Taxonomy.tsx` — they cannot
 * be imported and tested in isolation — but none of their own hooks fetch on mount (only state
 * resets in a `useEffect`), so rendering them through `<Taxonomy>` with a stubbed top-level
 * controller exercises their real markup/state without needing to mock `fetch` for anything that
 * does not actually submit a form.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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
    ...overrides,
  };
}

function renderTaxonomy(overrides: Partial<TaxonomyController> = {}) {
  const controller = baseController(overrides);
  render(<Taxonomy useTaxonomyHook={() => controller} />);
  return controller;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loading and error states", () => {
  it("shows a loading notice while taxonomies is null", () => {
    renderTaxonomy({ taxonomies: null });
    expect(screen.getByText(/loading taxonomies/i)).toBeInTheDocument();
  });

  it("shows only the error notice, not the screen, when error is set and taxonomies never loaded", () => {
    renderTaxonomy({ taxonomies: null, error: "failed to load taxonomies" });
    expect(screen.getByText("failed to load taxonomies")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /categories & tags/i })).not.toBeInTheDocument();
  });

  it("shows an error banner above an already-loaded screen, not a full blank", () => {
    const t = term();
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    renderTaxonomy({ taxonomies: [group], error: "failed to create term" });
    expect(screen.getByText("failed to create term")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /categories & tags/i })).toBeInTheDocument();
  });
});

describe("term list rendering", () => {
  it("renders 'No terms yet' for an empty group instead of an empty list", () => {
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [] };
    renderTaxonomy({ taxonomies: [group] });
    expect(screen.getByText("No terms yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("indents a hierarchical child term further than its parent via termDepth", () => {
    const parent = term({ id: "p", name: "Parent", parentId: null });
    const child = term({ id: "c", name: "Child", parentId: "p" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: true }), terms: [parent, child] };
    renderTaxonomy({ taxonomies: [group] });

    const list = within(screen.getByRole("list"));
    const parentRow = list.getByText("Parent").closest("li");
    const childRow = list.getByText("Child").closest("li");
    expect(parentRow).not.toHaveStyle({ marginLeft: "1.1rem" });
    expect(childRow).toHaveStyle({ marginLeft: "1.1rem" });
  });

  it("gives a hierarchical child term an accessible 'subcategory of X' label", () => {
    const parent = term({ id: "p", name: "Parent", parentId: null });
    const child = term({ id: "c", name: "Child", parentId: "p" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: true }), terms: [parent, child] };
    renderTaxonomy({ taxonomies: [group] });

    expect(screen.getByLabelText("Child, subcategory of Parent")).toBeInTheDocument();
  });

  it("does not add depth or a subcategory label for a flat (non-hierarchical) taxonomy", () => {
    // Same parentId shape, but hierarchical: false — depth must stay 0 for every row.
    const parent = term({ id: "p", name: "Parent", parentId: null });
    const child = term({ id: "c", name: "Child", parentId: "p" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: false }), terms: [parent, child] };
    renderTaxonomy({ taxonomies: [group] });

    const childRow = within(screen.getByRole("list")).getByText("Child").closest("li");
    expect(childRow).not.toHaveStyle({ marginLeft: "1.1rem" });
    expect(screen.queryByLabelText(/subcategory of/i)).not.toBeInTheDocument();
  });
});

describe("term selection", () => {
  it("marks the selected row with is-selected/aria-selected", () => {
    const t = term({ id: "t1", name: "Selected Term" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    renderTaxonomy({ taxonomies: [group], selectedTermId: "t1" });

    const row = screen.getByText("Selected Term").closest("li");
    expect(row).toHaveClass("is-selected");
    expect(row).toHaveAttribute("aria-selected", "true");
  });

  it("clicking a row calls setSelectedTermId with that term's id", async () => {
    const user = userEvent.setup();
    const t = term({ id: "t1", name: "Click Me" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    const controller = renderTaxonomy({ taxonomies: [group] });

    await user.click(screen.getByText("Click Me"));
    expect(controller.setSelectedTermId).toHaveBeenCalledWith("t1");
  });

  it("pressing Enter on a row calls setSelectedTermId with that term's id", async () => {
    const user = userEvent.setup();
    const t = term({ id: "t1", name: "Keyboard Row" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    const controller = renderTaxonomy({ taxonomies: [group] });

    const row = screen.getByText("Keyboard Row").closest("li") as HTMLElement;
    row.focus();
    await user.keyboard("{Enter}");
    expect(controller.setSelectedTermId).toHaveBeenCalledWith("t1");
  });
});

describe("term detail panel", () => {
  it("is absent when nothing is selected", () => {
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [term()] };
    renderTaxonomy({ taxonomies: [group] });
    expect(screen.queryByRole("heading", { level: 2, name: "Term" })).not.toBeInTheDocument();
  });

  it("renders status/parent/version once a term is selected", () => {
    const parent = term({ id: "p", name: "Parent Cat", parentId: null });
    const child = term({ id: "c", name: "Child Cat", parentId: "p", status: "active", version: 4 });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: true }), terms: [parent, child] };
    renderTaxonomy({ taxonomies: [group], selected: { taxonomy: group, term: child } });

    const heading = screen.getByRole("heading", { level: 2, name: "Child Cat" });
    const grid = within(heading.closest(".settings-detail-panel")!.querySelector(".settings-layer-grid") as HTMLElement);
    expect(heading).toBeInTheDocument();
    expect(grid.getByText("Parent Cat")).toBeInTheDocument();
    expect(grid.getByText("4")).toBeInTheDocument();
  });

  it("shows a plain dash for a top-level (parentless) selected term", () => {
    const t = term({ id: "t1", name: "Top Level", parentId: null });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    renderTaxonomy({ taxonomies: [group], selected: { taxonomy: group, term: t } });

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("merge section visibility (otherMergeTargets)", () => {
  it("does not render the merge section when the selected term's taxonomy has no other terms", () => {
    const only = term({ id: "only", name: "Only Term" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [only] };
    renderTaxonomy({ taxonomies: [group], selected: { taxonomy: group, term: only } });

    expect(screen.queryByText(/merge into another term/i)).not.toBeInTheDocument();
  });

  it("renders the merge section, offering every OTHER term, when at least one other term exists", () => {
    const a = term({ id: "a", name: "Term A" });
    const b = term({ id: "b", name: "Term B" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [a, b] };
    renderTaxonomy({ taxonomies: [group], selected: { taxonomy: group, term: a } });

    expect(screen.getByText(/merge into another term/i)).toBeInTheDocument();
    const select = screen.getByLabelText(/merge into/i) as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((o) => o.textContent);
    expect(optionLabels).toContain("Term B");
    expect(optionLabels).not.toContain("Term A");
  });
});

describe("new-term form's hierarchical parent select", () => {
  it("omits the parent select for a flat taxonomy", () => {
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: false }), terms: [] };
    renderTaxonomy({ taxonomies: [group] });
    expect(screen.queryByLabelText(/parent term/i)).not.toBeInTheDocument();
  });

  it("shows a parent select for a hierarchical taxonomy", () => {
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: true }), terms: [term()] };
    renderTaxonomy({ taxonomies: [group] });
    expect(screen.getByLabelText(/parent term/i)).toBeInTheDocument();
  });
});

describe("creating a taxonomy end to end (real hook, mocked fetch)", () => {
  it("submits name+hierarchical and reloads the list via the injected load()", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ taxonomy: taxonomyMeta({ id: "new", name: "New Taxonomy" }) })
    );
    const load = vi.fn();
    renderTaxonomy({ taxonomies: [], load });

    await user.type(screen.getByLabelText(/new taxonomy/i), "New Taxonomy");
    await user.click(screen.getByRole("button", { name: /^create taxonomy$/i }));

    await screen.findByRole("button", { name: /^create taxonomy$/i });
    expect(load).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ name: "New Taxonomy", hierarchical: false });
  });
});
