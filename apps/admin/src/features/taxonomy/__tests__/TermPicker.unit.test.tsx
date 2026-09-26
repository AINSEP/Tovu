import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TermPicker } from "../TermPicker";
import type { TermPickerController } from "../hooks/use-term-picker.hooks";
import type { AdminTaxonomyWithTerms } from "@/lib/api";

/**
 * @file `TermPicker` — the Categories & Tags box the post, page and collection-entry editors mount.
 * Render branches only, driven through the `useTermPickerHook` seam; the hook's own loads and save
 * are `use-term-picker.unit.test.tsx`. (Moved from `CollectionEntryEditor.dynamic-field.unit.test.tsx`
 * when the box became shared.)
 */

function taxonomy(overrides: Partial<AdminTaxonomyWithTerms["taxonomy"]> = {}): AdminTaxonomyWithTerms["taxonomy"] {
  return { id: "tax1", name: "Genre", hierarchical: false, status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1, ...overrides };
}
function term(overrides: Partial<AdminTaxonomyWithTerms["terms"][number]> = {}): AdminTaxonomyWithTerms["terms"][number] {
  return { id: "t1", taxonomyId: "tax1", parentId: null, name: "Fiction", status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1, ...overrides };
}

const TAXONOMY: AdminTaxonomyWithTerms = {
  taxonomy: taxonomy(),
  terms: [term({ id: "t1", name: "Fiction" }), term({ id: "t2", name: "Non-fiction" })],
};
const EMPTY_TAXONOMY: AdminTaxonomyWithTerms = {
  taxonomy: taxonomy({ id: "tax2", name: "Empty Tax" }),
  terms: [],
};

function controller(overrides: Partial<TermPickerController> = {}): TermPickerController {
  return {
    taxonomies: [TAXONOMY],
    hidden: false,
    subject: "post",
    selected: new Set(),
    toggle: vi.fn(),
    loading: false,
    dirty: false,
    saving: false,
    message: null,
    error: null,
    save: vi.fn(async () => {}),
    t: (key) => key,
    canCreate: false,
    showAddInput: () => false,
    showAddTrigger: () => false,
    setAddOpen: vi.fn(),
    newTermName: () => "",
    setNewTermName: vi.fn(),
    onNewTermKeyDown: vi.fn(),
    addTerm: vi.fn(async () => {}),
    creating: () => false,
    createError: () => null,
    suggestions: () => [],
    ...overrides,
  };
}

function renderPicker(overrides: Partial<TermPickerController> = {}) {
  const useHook = vi.fn(() => controller(overrides));
  render(<TermPicker contentType="post" contentId="p1" useTermPickerHook={useHook} />);
  return useHook;
}

describe("TermPicker", () => {
  it("passes its content ref to the hook", () => {
    const useHook = renderPicker();
    expect(useHook).toHaveBeenCalledWith({ contentType: "post", contentId: "p1" });
  });

  it("renders nothing when no taxonomy exists", () => {
    renderPicker({ hidden: true, taxonomies: [] });
    expect(screen.queryByText("Categories & Tags")).not.toBeInTheDocument();
  });

  it("renders one fieldset per taxonomy with its own terms as checkboxes", () => {
    renderPicker();
    expect(screen.getByRole("group", { name: "Genre" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Fiction" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Non-fiction" })).toBeInTheDocument();
  });

  it("shows 'No terms yet.' for a taxonomy with zero terms", () => {
    renderPicker({ taxonomies: [EMPTY_TAXONOMY] });
    expect(screen.getByText("No terms yet.")).toBeInTheDocument();
  });

  it("a term's checkbox reflects the hook's own `selected` set", () => {
    renderPicker({ selected: new Set(["t1"]) });
    expect(screen.getByRole("checkbox", { name: "Fiction" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Non-fiction" })).not.toBeChecked();
  });

  it("clicking a term checkbox calls toggle(termId)", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    renderPicker({ toggle });
    await user.click(screen.getByRole("checkbox", { name: "Fiction" }));
    expect(toggle).toHaveBeenCalledWith("t1");
  });

  it("the content's own terms show ticked; the boxes wait for them to load", () => {
    renderPicker({ loading: true });
    expect(screen.getByText("Loading categories & tags…")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Fiction" })).toBeDisabled();
  });

  it("'Save categories & tags' is disabled until the ticked set differs from the content's", () => {
    renderPicker({ selected: new Set(["t1"]), dirty: false });
    expect(screen.getByText("Tick the categories and tags that apply, then save.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save categories & tags" })).toBeDisabled();
  });

  it("'Save categories & tags' is enabled once something changed, even an untick", () => {
    renderPicker({ selected: new Set(), dirty: true });
    expect(screen.getByRole("button", { name: "Save categories & tags" })).toBeEnabled();
  });

  it("shows 'Saving…' and disables while saving", () => {
    renderPicker({ selected: new Set(["t1"]), dirty: true, saving: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("clicking Save calls save()", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => {});
    renderPicker({ selected: new Set(["t1"]), dirty: true, save });
    await user.click(screen.getByRole("button", { name: "Save categories & tags" }));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("shows the hook's own message on success", () => {
    renderPicker({ message: "Categories & tags saved." });
    expect(screen.getByText("Categories & tags saved.")).toBeInTheDocument();
  });

  it("shows the hook's own error on failure", () => {
    renderPicker({ error: "Failed to save categories & tags" });
    expect(screen.getByText("Failed to save categories & tags")).toBeInTheDocument();
  });

  it("names the tagged content in its agent labels", () => {
    renderPicker({ subject: "page" });
    expect(screen.getByRole("checkbox", { name: "Fiction" })).toHaveAttribute(
      "data-agent-label",
      'Tag this page with the "Genre" term "Fiction"',
    );
    expect(screen.getByRole("button", { name: "Save categories & tags" })).toHaveAttribute(
      "data-agent-label",
      "Save this page's categories and tags as checked above",
    );
  });

  describe("adding a term by name", () => {
    it("an empty taxonomy the admin can add to shows the input instead of 'No terms yet.'", () => {
      renderPicker({ taxonomies: [EMPTY_TAXONOMY], canCreate: true, showAddInput: (id) => id === "tax2" });
      expect(screen.queryByText("No terms yet.")).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Term name" })).toHaveAttribute("placeholder", "Type a name, then press Enter");
    });

    it("typing, keys and the Add button all go to the hook, per taxonomy", async () => {
      const user = userEvent.setup();
      const setNewTermName = vi.fn();
      const onNewTermKeyDown = vi.fn();
      const addTerm = vi.fn(async () => {});
      renderPicker({ showAddInput: () => true, newTermName: () => "Noir", setNewTermName, onNewTermKeyDown, addTerm });
      const input = screen.getByRole("textbox", { name: "Term name" });
      expect(input).toHaveValue("Noir");
      await user.type(input, "x");
      expect(setNewTermName).toHaveBeenCalledWith("tax1", "Noirx");
      expect(onNewTermKeyDown).toHaveBeenCalledWith("tax1", expect.objectContaining({ key: "x" }));
      await user.click(screen.getByRole("button", { name: "Add term" }));
      expect(addTerm).toHaveBeenCalledWith("tax1");
    });

    it("Add is disabled with nothing typed", () => {
      renderPicker({ showAddInput: () => true });
      expect(screen.getByRole("button", { name: "Add term" })).toBeDisabled();
    });

    it("shows 'Saving…' on Add while that taxonomy's term is being created", () => {
      renderPicker({ showAddInput: () => true, newTermName: () => "Noir", creating: () => true });
      expect(screen.getByRole("button", { name: "Saving…", hidden: false })).toBeDisabled();
    });

    it("offers the hook's suggestions to the input", () => {
      renderPicker({ showAddInput: () => true, suggestions: () => ["Fiction", "Non-fiction"] });
      const input = screen.getByRole("combobox", { name: "Term name" });
      const list = document.getElementById(input.getAttribute("list")!);
      expect([...list!.querySelectorAll("option")].map((option) => option.value)).toEqual(["Fiction", "Non-fiction"]);
    });

    it("a category box's '+ Add term' opens its input", async () => {
      const user = userEvent.setup();
      const setAddOpen = vi.fn();
      renderPicker({ showAddTrigger: () => true, setAddOpen });
      await user.click(screen.getByRole("button", { name: "+ Add term" }));
      expect(setAddOpen).toHaveBeenCalledWith("tax1", true);
    });

    it("shows that taxonomy's create error", () => {
      renderPicker({ showAddInput: () => true, createError: (id) => (id === "tax1" ? "create exploded" : null) });
      expect(screen.getByRole("alert")).toHaveTextContent("create exploded");
    });

    it("without the permission, shows neither the input nor the trigger", () => {
      renderPicker({ taxonomies: [TAXONOMY, EMPTY_TAXONOMY] });
      expect(screen.queryByRole("textbox", { name: "Term name" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "+ Add term" })).not.toBeInTheDocument();
      expect(screen.getByText("No terms yet.")).toBeInTheDocument();
    });
  });

  it("renders its copy through the hook's translator", () => {
    renderPicker({ t: (key) => (key === "Categories & Tags" ? "Categorías y etiquetas" : key) });
    expect(screen.getByRole("heading", { name: "Categorías y etiquetas" })).toBeInTheDocument();
  });
});
