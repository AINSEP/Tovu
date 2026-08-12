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
    formOpen: false,
    setFormOpen: vi.fn(),
    // Explicit `null`/`false` defaults matter here, not just `undefined` — both `ConfirmDialog`s
    // gate `open` on `pending… !== null` (see `Taxonomy.tsx`), and `undefined !== null` is `true`,
    // so an omitted field here would render BOTH delete-confirm dialogs open by default in every
    // test using this helper (caught live: it turned a single `getByRole("button", {name:
    // /cancel/i})` query into a "found 3 elements" failure across the whole suite, not just the
    // one test that asserts on it).
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
    // Identity `t` — matches what this screen got from a real, unmocked `useAdminLocale()` call
    // before this hook's own `useWiredX` i18n pass (defaults to "en", and TAXONOMY_DICT has no
    // "en" entries, so every lookup already fell through to `?? key`), so every existing
    // literal-English-string assertion below stays valid unchanged.
    t: (key: string) => key,
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
  // `Taxonomy` now also reads `core.language.locale` (via `useAdminLocale`) to translate its own
  // chrome — a real `fetch` call this file's tests never queued for. Routed here, ahead of
  // `fetchMock`, so it never consumes a slot from the `mockResolvedValueOnce` sequence the
  // "real hook, mocked fetch" tests below still queue on `fetchMock` itself unchanged. An empty
  // settings response resolves `loadLanguage()` to `DEFAULT_LOCALE` ("en"), matching every
  // assertion below.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    return fetchMock(input, init);
  });
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

describe("merge wizard steps (real useMergeTermSection, mocked fetch) — MergeIdleStep/MergePlannedStep/MergeConfirmedStep", () => {
  it("walks idle -> planned -> confirmed, rendering each step's own markup, not just the idle one", async () => {
    const user = userEvent.setup();
    const a = term({ id: "a", name: "Term A" });
    const b = term({ id: "b", name: "Term B" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [a, b] };
    renderTaxonomy({ taxonomies: [group], selected: { taxonomy: group, term: a } });

    // Idle step (MergeIdleStep): choose a target, Plan merge.
    await user.selectOptions(screen.getByLabelText(/merge into/i), "b");
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ planId: "plan1", planHash: "hash1", details: { overlappingContentCount: 3 } })
    );
    await user.click(screen.getByRole("button", { name: /plan merge/i }));

    // Planned step (MergePlannedStep): the plan's own copy, not the idle select, is now on screen.
    expect(await screen.findByText(/3 overlapping content assignment/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/merge into/i)).not.toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(jsonResponse({ confirmationToken: "tok1" }));
    await user.click(screen.getByRole("button", { name: /confirm merge/i }));

    // Confirmed step (MergeConfirmedStep): its own irreversible-warning copy and Execute button.
    expect(await screen.findByText(/executing merges the terms now/i)).toBeInTheDocument();
    const executeButton = screen.getByRole("button", { name: /execute merge/i });
    expect(executeButton).toHaveClass("btn-danger");

    fetchMock.mockResolvedValueOnce(jsonResponse({ mergedCount: 3 }));
    await user.click(executeButton);

    // onMerged fires -> Taxonomy clears selectedTermId and reloads (stubbed setSelectedTermId/load).
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});

describe("new-term form's collapsed resting state (web-design pass, 2026-08-05)", () => {
  it("starts collapsed behind an 'Add term' trigger, not the form itself", () => {
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: false }), terms: [] };
    renderTaxonomy({ taxonomies: [group] });
    expect(screen.getByRole("button", { name: /\+ add term/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/new term in/i)).not.toBeInTheDocument();
  });

  it("opens the real form on click — real useNewTermForm state, not the stubbed top-level controller", async () => {
    const user = userEvent.setup();
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: false }), terms: [] };
    renderTaxonomy({ taxonomies: [group] });

    await user.click(screen.getByRole("button", { name: /\+ add term/i }));

    expect(screen.getByLabelText(/new term in/i)).toBeInTheDocument();
  });
});

describe("new-term form's hierarchical parent select", () => {
  it("omits the parent select for a flat taxonomy", async () => {
    const user = userEvent.setup();
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: false }), terms: [] };
    renderTaxonomy({ taxonomies: [group] });
    await user.click(screen.getByRole("button", { name: /\+ add term/i }));
    expect(screen.queryByLabelText(/parent term/i)).not.toBeInTheDocument();
  });

  it("shows a parent select for a hierarchical taxonomy", async () => {
    const user = userEvent.setup();
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ hierarchical: true }), terms: [term()] };
    renderTaxonomy({ taxonomies: [group] });
    await user.click(screen.getByRole("button", { name: /\+ add term/i }));
    expect(screen.getByLabelText(/parent term/i)).toBeInTheDocument();
  });
});

describe("new-taxonomy form's collapsed resting state (web-design pass, 2026-08-05)", () => {
  it("starts collapsed behind a 'New taxonomy' page-actions button, not the form itself", () => {
    renderTaxonomy({ taxonomies: [] });
    expect(screen.getByRole("button", { name: /^new taxonomy$/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new taxonomy$/i)).not.toBeInTheDocument();
  });

  it("clicking the header button calls the stubbed controller's setFormOpen (real toggle covered by use-taxonomy.unit.test.ts)", async () => {
    const user = userEvent.setup();
    const controller = renderTaxonomy({ taxonomies: [] });
    await user.click(screen.getByRole("button", { name: /^new taxonomy$/i }));
    expect(controller.setFormOpen).toHaveBeenCalledTimes(1);
  });

  it("renders the form and a 'Cancel' header button once formOpen is true", () => {
    renderTaxonomy({ taxonomies: [], formOpen: true });
    expect(screen.getByLabelText(/^new taxonomy$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  });
});

describe("delete UI — RowMenu + ConfirmDialog (web-design pass, 2026-08-05)", () => {
  it("a term row's RowMenu offers exactly 'Delete term', which calls requestDeleteTerm with that term", async () => {
    const user = userEvent.setup();
    const t = term({ id: "t1", name: "Breakfast" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    const controller = renderTaxonomy({ taxonomies: [group] });

    await user.click(screen.getByRole("button", { name: /actions for term "breakfast"/i }));
    expect(screen.getByRole("menuitem", { name: "Delete term" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Delete term" }));

    expect(controller.requestDeleteTerm).toHaveBeenCalledWith(t);
  });

  it("opening a term's RowMenu and picking its action does NOT also select the row (stopPropagation)", async () => {
    // Regression test for the exact bug this screen is the first in the app to risk: a `RowMenu`
    // nested inside a click-to-select `<li>`. Without the wrapping `stopPropagation`, opening the
    // menu — or picking an item from it — would ALSO fire the row's own `onClick` and select it.
    const user = userEvent.setup();
    const t = term({ id: "t1", name: "Breakfast" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    const controller = renderTaxonomy({ taxonomies: [group] });

    await user.click(screen.getByRole("button", { name: /actions for term "breakfast"/i }));
    await user.click(screen.getByRole("menuitem", { name: "Delete term" }));

    expect(controller.setSelectedTermId).not.toHaveBeenCalled();
  });

  it("a taxonomy group's RowMenu offers exactly 'Delete taxonomy', which calls requestDeleteTaxonomy with that taxonomy", async () => {
    const user = userEvent.setup();
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ name: "Category" }), terms: [] };
    const controller = renderTaxonomy({ taxonomies: [group] });

    await user.click(screen.getByRole("button", { name: /actions for taxonomy "category"/i }));
    expect(screen.getByRole("menuitem", { name: "Delete taxonomy" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Delete taxonomy" }));

    expect(controller.requestDeleteTaxonomy).toHaveBeenCalledWith(group.taxonomy);
  });

  it("the term ConfirmDialog is closed by default and opens (naming the term) once pendingDeleteTerm is set", () => {
    const t = term({ name: "Breakfast" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    const { rerender } = render(<Taxonomy useTaxonomyHook={() => baseController({ taxonomies: [group] })} />);
    const closedDialog = screen.getByText("Delete term?").closest("dialog")!;
    expect(closedDialog.hasAttribute("open")).toBe(false);

    rerender(<Taxonomy useTaxonomyHook={() => baseController({ taxonomies: [group], pendingDeleteTerm: t })} />);
    const openDialog = screen.getByText("Delete term?").closest("dialog")!;
    expect(openDialog.hasAttribute("open")).toBe(true);
    expect(within(openDialog).getByText(/delete term "breakfast".*cannot be undone/i)).toBeInTheDocument();
  });

  it("confirming the term dialog calls confirmDeleteTerm; canceling calls requestDeleteTerm(null)", async () => {
    const user = userEvent.setup();
    const t = term({ name: "Breakfast" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    const controller = renderTaxonomy({ taxonomies: [group], pendingDeleteTerm: t });

    const dialog = screen.getByText("Delete term?").closest("dialog")!;
    await user.click(within(dialog).getByRole("button", { name: /^delete term$/i }));
    expect(controller.confirmDeleteTerm).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(controller.requestDeleteTerm).toHaveBeenCalledWith(null);
  });

  it("the taxonomy ConfirmDialog is closed by default and opens (naming the taxonomy) once pendingDeleteTaxonomy is set", () => {
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ name: "Category" }), terms: [] };
    const { rerender } = render(<Taxonomy useTaxonomyHook={() => baseController({ taxonomies: [group] })} />);
    const closedDialog = screen.getByText("Delete taxonomy?").closest("dialog")!;
    expect(closedDialog.hasAttribute("open")).toBe(false);

    rerender(
      <Taxonomy useTaxonomyHook={() => baseController({ taxonomies: [group], pendingDeleteTaxonomy: group.taxonomy })} />
    );
    const openDialog = screen.getByText("Delete taxonomy?").closest("dialog")!;
    expect(openDialog.hasAttribute("open")).toBe(true);
    expect(within(openDialog).getByText(/delete taxonomy "category".*cannot be undone/i)).toBeInTheDocument();
  });

  it("confirming the taxonomy dialog calls confirmDeleteTaxonomy; canceling calls requestDeleteTaxonomy(null)", async () => {
    const user = userEvent.setup();
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ name: "Category" }), terms: [] };
    const controller = renderTaxonomy({ taxonomies: [group], pendingDeleteTaxonomy: group.taxonomy });

    const dialog = screen.getByText("Delete taxonomy?").closest("dialog")!;
    await user.click(within(dialog).getByRole("button", { name: /^delete taxonomy$/i }));
    expect(controller.confirmDeleteTaxonomy).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: /^cancel$/i }));
    expect(controller.requestDeleteTaxonomy).toHaveBeenCalledWith(null);
  });

  it("both delete confirm buttons disable while their own busy flag is set (in-flight guard against a double submit)", () => {
    const t = term({ name: "Breakfast" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    renderTaxonomy({ taxonomies: [group], pendingDeleteTerm: t, deleteTermBusy: true });

    const dialog = screen.getByText("Delete term?").closest("dialog")!;
    expect(within(dialog).getByRole("button", { name: /^delete term$/i })).toBeDisabled();
  });

  it("shows the blocked-delete reason for the specific term that was refused, naming the remedy — not a silent disabled control", () => {
    const t = term({ id: "t1", name: "Breakfast" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    renderTaxonomy({
      taxonomies: [group],
      deleteTermBlocked: {
        termId: "t1",
        state: { code: "TERM_HAS_ASSIGNMENTS", count: 2, message: "Still assigned to 2 content items. Unassign it first." },
      },
    });

    expect(
      screen.getByText(/can't delete "breakfast": still assigned to 2 content items\. unassign it first\./i)
    ).toBeInTheDocument();
  });

  it("does not show a blocked-delete notice for a group whose term was NOT the one refused", () => {
    const t1 = term({ id: "t1", name: "Breakfast" });
    const t2 = term({ id: "t2", name: "Lunch" });
    const groupA: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax1", name: "Category" }), terms: [t1] };
    const groupB: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax2", name: "Tag" }), terms: [t2] };
    renderTaxonomy({
      taxonomies: [groupA, groupB],
      deleteTermBlocked: { termId: "t2", state: { code: "TERM_HAS_ASSIGNMENTS", count: 1, message: "blocked" } },
    });

    expect(screen.queryByText(/can't delete "breakfast"/i)).not.toBeInTheDocument();
    expect(screen.getByText(/can't delete "lunch"/i)).toBeInTheDocument();
  });

  it("shows the blocked-delete reason for a refused taxonomy delete", () => {
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax1", name: "Category" }), terms: [] };
    renderTaxonomy({
      taxonomies: [group],
      deleteTaxonomyBlocked: {
        taxonomyId: "tax1",
        state: { code: "TAXONOMY_HAS_ASSIGNMENTS", count: 1, message: "A term is still assigned. Unassign it first." },
      },
    });

    expect(
      screen.getByText(/can't delete "category": a term is still assigned\. unassign it first\./i)
    ).toBeInTheDocument();
  });
});

describe("creating a taxonomy end to end (real hook, mocked fetch)", () => {
  it("submits name+hierarchical and reloads the list via the injected load()", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ taxonomy: taxonomyMeta({ id: "new", name: "New Taxonomy" }) })
    );
    const load = vi.fn();
    // `formOpen: true` — the stubbed top-level controller isn't stateful, so the header toggle
    // button's own click (see the "collapsed resting state" tests above) can't reveal the form
    // here; starting it open is how every other test in this file exercises a form whose
    // visibility is driven by the (stubbed) top-level controller rather than a real hook.
    renderTaxonomy({ taxonomies: [], load, formOpen: true });

    await user.type(screen.getByLabelText(/^new taxonomy$/i), "New Taxonomy");
    await user.click(screen.getByRole("button", { name: /^create taxonomy$/i }));

    await screen.findByRole("button", { name: /^create taxonomy$/i });
    expect(load).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ name: "New Taxonomy", hierarchical: false });
  });
});

// Delete term/taxonomy (web-design pass, 2026-08-05) — markup-only assertions: `confirmDeleteTerm`/
// `confirmDeleteTaxonomy`'s own branches (success/blocked/failure) are covered against the real
// hook in `use-taxonomy.unit.test.ts`; what's asserted here is that the row/group menu items reach
// the right `request…` call, that opening a row's menu does not ALSO select the row (the
// `stopPropagation` this file's header comment calls out), and that a blocked reason renders
// scoped to the right group.
describe("delete term via RowMenu + ConfirmDialog", () => {
  it("picking 'Delete term' from a row's menu calls requestDeleteTerm with that term, not setSelectedTermId", async () => {
    const user = userEvent.setup();
    const t = term({ id: "t1", name: "Doomed Term" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    const controller = renderTaxonomy({ taxonomies: [group] });

    await user.click(screen.getByRole("button", { name: /actions for term "doomed term"/i }));
    await user.click(screen.getByRole("menuitem", { name: /^delete term$/i }));

    expect(controller.requestDeleteTerm).toHaveBeenCalledWith(t);
    // The regression this file's header comment names: without `stopPropagation` on the trigger's
    // wrapper, opening/using the row menu also bubbles to the `<li>`'s own click-to-select handler.
    expect(controller.setSelectedTermId).not.toHaveBeenCalled();
  });

  it("renders the confirm dialog open, wired to confirmDeleteTerm/requestDeleteTerm(null), once pendingDeleteTerm is set", async () => {
    const user = userEvent.setup();
    const t = term({ id: "t1", name: "Doomed Term" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta(), terms: [t] };
    const controller = renderTaxonomy({ taxonomies: [group], pendingDeleteTerm: t });

    expect(screen.getByRole("heading", { name: /^delete term\?$/i })).toBeInTheDocument();
    expect(screen.getByText(/delete term "doomed term"\? this cannot be undone\./i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^delete term$/i }));
    expect(controller.confirmDeleteTerm).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByRole("button", { name: /^cancel$/i })[0]);
    expect(controller.requestDeleteTerm).toHaveBeenCalledWith(null);
  });

  it("shows the blocked-delete reason scoped to the group whose term was refused, naming the remedy and count", () => {
    const t = term({ id: "t1", name: "Blocked Term" });
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax1", name: "Category" }), terms: [t] };
    const other: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax2", name: "Topic" }), terms: [] };
    renderTaxonomy({
      taxonomies: [group, other],
      deleteTermBlocked: {
        termId: "t1",
        state: { code: "TERM_HAS_ASSIGNMENTS", count: 2, message: "Still assigned to 2 content items. Unassign it, or merge it into another term, before deleting." },
      },
    });

    const notice = screen.getByText(/still assigned to 2 content items/i);
    expect(notice.closest(".settings-namespace-group")).toHaveTextContent("Category");
    // Never a silent disabled control — the message names the count and the remedy.
    expect(notice).toHaveTextContent("2");
    expect(notice).toHaveTextContent(/unassign/i);
  });
});

describe("delete taxonomy via RowMenu + ConfirmDialog", () => {
  it("picking 'Delete taxonomy' from the group's menu calls requestDeleteTaxonomy with that taxonomy", async () => {
    const user = userEvent.setup();
    const group: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax1", name: "Category" }), terms: [] };
    const controller = renderTaxonomy({ taxonomies: [group] });

    await user.click(screen.getByRole("button", { name: /actions for taxonomy "category"/i }));
    await user.click(screen.getByRole("menuitem", { name: /^delete taxonomy$/i }));

    expect(controller.requestDeleteTaxonomy).toHaveBeenCalledWith(group.taxonomy);
  });

  it("shows the blocked-delete reason scoped to the refused taxonomy's own group, not a page-level banner", () => {
    const blockedGroup: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax1", name: "Category" }), terms: [] };
    const unrelatedGroup: AdminTaxonomyWithTerms = { taxonomy: taxonomyMeta({ id: "tax2", name: "Topic" }), terms: [] };
    renderTaxonomy({
      taxonomies: [blockedGroup, unrelatedGroup],
      deleteTaxonomyBlocked: {
        taxonomyId: "tax1",
        state: { code: "TAXONOMY_HAS_ASSIGNMENTS", count: 1, message: "A term in this taxonomy is still assigned to 1 content item. Unassign or merge that term before deleting the taxonomy." },
      },
    });

    const notice = screen.getByText(/still assigned to 1 content item/i);
    expect(notice.closest(".settings-namespace-group")).toHaveTextContent("Category");
    // The unrelated group must not show a reason it was never given.
    const topicGroup = screen.getByRole("heading", { name: "Topic" }).closest(".settings-namespace-group");
    expect(within(topicGroup as HTMLElement).queryByText(/still assigned/i)).not.toBeInTheDocument();
  });
});
