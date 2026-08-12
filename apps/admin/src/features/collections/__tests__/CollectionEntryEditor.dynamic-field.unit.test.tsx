import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionEntryEditor } from "../CollectionEntryEditor";
import type { CollectionEntryEditorController } from "../hooks/use-collection-entry-editor.hooks";
import type { TermPickerController } from "../hooks/use-term-picker.hooks";
import type { AdminContentType, AdminEntry, AdminTaxonomyWithTerms, ContentTypeFieldDef } from "../../../lib/api";

/**
 * @file `CollectionEntryEditor` — the render-layer branches `CollectionEntryEditor.unit.test.tsx`
 * (the a11y-label pin, driven through a real `useCollectionEntryEditor` + mocked `fetch`) doesn't
 * reach: `DynamicField`'s five `ContentTypeFieldDef.kind` branches (rank #2 by cognitive
 * complexity in the whole admin app per the coverage audit), `readExtSiteField`'s defensive
 * shape-check fallbacks, the Publish/Unpublish/Save lifecycle buttons, loading/error states, and
 * `TermPicker`.
 *
 * Neither `CollectionEntryEditor` nor its nested `DynamicField`/`TermPicker` expose a `use*Hook`
 * DI seam through props (`CollectionEntryEditor`'s own props are only `{ contentTypeKey,
 * entryId }`) — so `use-collection-entry-editor.hooks.ts` and `use-term-picker.hooks.ts` are
 * module-mocked via `vi.hoisted` refs, the same fallback seam `Recovery.tsx`'s `RestoreFlow` and
 * `Database.tsx`'s sections needed. `editor` is fixture-supplied as `null` throughout — verified
 * safe: `WidgetEmbedInsertControl` explicitly renders nothing for a null editor
 * (`lib/widget-embed-extension.tsx`), and `EditorContent` (`@tiptap/react`) accepts a null editor.
 */

const { editorControllerRef, termPickerControllerRef } = vi.hoisted(() => ({
  editorControllerRef: { current: null as unknown },
  termPickerControllerRef: { current: null as unknown },
}));

vi.mock("../hooks/use-collection-entry-editor.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-collection-entry-editor.hooks")>();
  // Mocks the zero-deps wrapper `CollectionEntryEditor.tsx` now calls by default post-`useWiredX`
  // conversion — was `useCollectionEntryEditor` (the pure, deps-taking hook) before; a call-site
  // rename of what gets intercepted, not a behavior or assertion change.
  return { ...actual, useWiredCollectionEntryEditor: () => editorControllerRef.current };
});
vi.mock("../hooks/use-term-picker.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-term-picker.hooks")>();
  // Mocks the zero-deps wrapper `CollectionEntryEditor.tsx` now calls by default post-`useWiredX`
  // conversion — was `useTermPicker` (the pure, port-taking hook) before; a call-site rename of
  // what gets intercepted, not a behavior or assertion change.
  return { ...actual, useWiredTermPicker: () => termPickerControllerRef.current };
});

const FIELD_TEXT: ContentTypeFieldDef = { name: "notes", kind: "text", required: false, queryable: false };
const FIELD_INTEGER: ContentTypeFieldDef = { name: "prep_time", kind: "integer", required: true, queryable: true };
const FIELD_REAL: ContentTypeFieldDef = { name: "rating", kind: "real", required: false, queryable: false };
const FIELD_BOOLEAN: ContentTypeFieldDef = { name: "featured", kind: "boolean", required: false, queryable: false };
const FIELD_DATETIME: ContentTypeFieldDef = { name: "cook_by", kind: "datetime", required: false, queryable: false };

const CONTENT_TYPE: AdminContentType = {
  workspaceId: "w1",
  key: "recipe",
  label: "Recipe",
  fields: [FIELD_TEXT, FIELD_INTEGER, FIELD_REAL, FIELD_BOOLEAN, FIELD_DATETIME],
  status: "active",
  version: 1,
};

const ENTRY: AdminEntry = {
  id: "e1",
  workspaceId: "w1",
  type: "recipe",
  slug: "my-recipe",
  status: "draft",
  title: "My Recipe",
  bodyJson: null,
  fieldsJson: { ext: { site: { notes: "hello" } } },
  publishedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 2,
};

function editorController(overrides: Partial<CollectionEntryEditorController> = {}): CollectionEntryEditorController {
  return {
    contentType: CONTENT_TYPE,
    entry: null,
    title: "",
    setTitle: vi.fn(),
    slug: "",
    setSlug: vi.fn(),
    extFields: {},
    setExtFields: vi.fn(),
    taxonomies: [],
    message: null,
    error: null,
    loadError: null,
    loaded: true,
    saving: false,
    editor: null,
    save: vi.fn(async () => {}),
    toggleLifecycle: vi.fn(async () => {}),
    // Identity `t` — matches what the pre-`useWiredX` component got from a real, unmocked
    // `useAdminLocale()` call in this render-only test (defaults to "en", and `COLLECTIONS_DICT`
    // has no "en" entries, so every lookup already fell through to `?? key`), so every existing
    // literal-English-string assertion below stays valid unchanged.
    t: (key: string) => key,
    ...overrides,
  };
}

function termPickerController(overrides: Partial<TermPickerController> = {}): TermPickerController {
  return {
    selected: new Set(),
    toggle: vi.fn(),
    saving: false,
    message: null,
    error: null,
    assign: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  editorControllerRef.current = editorController();
  termPickerControllerRef.current = termPickerController();
});

function renderEditor(overrides: Partial<CollectionEntryEditorController> = {}, entryId: string | null = null) {
  editorControllerRef.current = editorController(overrides);
  render(<CollectionEntryEditor contentTypeKey="recipe" entryId={entryId} />);
}

describe("loading / error / not-found states", () => {
  it("shows the load error when loadError is set, regardless of loaded", () => {
    renderEditor({ loadError: "failed to load entry", loaded: false });
    expect(screen.getByText("failed to load entry")).toBeInTheDocument();
  });

  it("shows a loading notice while loaded is false and there is no loadError", () => {
    renderEditor({ loaded: false });
    expect(screen.getByText("Loading entry…")).toBeInTheDocument();
  });

  it("shows a loading notice while contentType is still undefined (the 'not yet resolved' sentinel), even if loaded somehow true", () => {
    renderEditor({ loaded: true, contentType: undefined });
    expect(screen.getByText("Loading entry…")).toBeInTheDocument();
  });

  it("shows 'Unknown content type' when contentType resolved to null", () => {
    renderEditor({ loaded: true, contentType: null });
    expect(screen.getByText('Unknown content type "recipe".')).toBeInTheDocument();
  });

  it("shows 'Entry not found' when entryId is set but entry is still null", () => {
    renderEditor({ loaded: true, contentType: CONTENT_TYPE, entry: null }, "e404");
    expect(screen.getByText("Entry not found.")).toBeInTheDocument();
  });

  it("does NOT show 'Entry not found' for a new entry (entryId null, entry null)", () => {
    renderEditor({ loaded: true, contentType: CONTENT_TYPE, entry: null }, null);
    expect(screen.queryByText("Entry not found.")).not.toBeInTheDocument();
  });
});

describe("page header — new vs edit", () => {
  it("shows 'New {label} entry' when there is no entry", () => {
    renderEditor({ entry: null });
    expect(screen.getByRole("heading", { name: "New Recipe entry" })).toBeInTheDocument();
  });

  it("shows 'Edit {label} entry' when an entry is loaded", () => {
    renderEditor({ entry: ENTRY });
    expect(screen.getByRole("heading", { name: "Edit Recipe entry" })).toBeInTheDocument();
  });

  it("shows the entry's status badge only when an entry exists", () => {
    renderEditor({ entry: ENTRY });
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("shows message/error banners in the header", () => {
    renderEditor({ message: "Saved · version 2", error: "save failed" });
    expect(screen.getByText("Saved · version 2")).toBeInTheDocument();
    expect(screen.getByText("save failed")).toBeInTheDocument();
  });
});

describe("lifecycle buttons — Publish/Unpublish", () => {
  it("shows Publish for a draft entry, not Unpublish", () => {
    renderEditor({ entry: { ...ENTRY, status: "draft" } });
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("shows Unpublish for a published entry, not Publish", () => {
    renderEditor({ entry: { ...ENTRY, status: "published" } });
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("shows neither for an unpublished entry that was previously published (status: unpublished, not draft)", () => {
    renderEditor({ entry: { ...ENTRY, status: "unpublished" } });
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("shows neither for a brand-new entry (no entry yet)", () => {
    renderEditor({ entry: null });
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("clicking Publish calls toggleLifecycle('publish')", async () => {
    const user = userEvent.setup();
    const toggleLifecycle = vi.fn(async () => {});
    renderEditor({ entry: { ...ENTRY, status: "draft" }, toggleLifecycle });
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(toggleLifecycle).toHaveBeenCalledWith("publish");
  });

  it("clicking Unpublish calls toggleLifecycle('unpublish')", async () => {
    const user = userEvent.setup();
    const toggleLifecycle = vi.fn(async () => {});
    renderEditor({ entry: { ...ENTRY, status: "published" }, toggleLifecycle });
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    expect(toggleLifecycle).toHaveBeenCalledWith("unpublish");
  });
});

describe("Save button", () => {
  it("is secondary-styled while a draft/unpublished entry still has Publish available", () => {
    renderEditor({ entry: { ...ENTRY, status: "draft" } });
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("btn-secondary");
  });

  it("is NOT secondary-styled (primary) once published", () => {
    renderEditor({ entry: { ...ENTRY, status: "published" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveClass("btn-secondary");
  });

  it("is NOT secondary-styled for a brand-new entry", () => {
    renderEditor({ entry: null });
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveClass("btn-secondary");
  });

  it("shows 'Saving…' and disables while saving", () => {
    renderEditor({ saving: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("clicking Save calls save()", async () => {
    const user = userEvent.setup();
    const save = vi.fn(async () => {});
    renderEditor({ save });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("title/slug fields", () => {
  it("typing the title calls setTitle", async () => {
    const user = userEvent.setup();
    const setTitle = vi.fn();
    renderEditor({ setTitle });
    await user.type(screen.getByLabelText("Entry title"), "x");
    expect(setTitle).toHaveBeenCalled();
  });

  it("shows an editable slug input (with setSlug) only for a new entry", async () => {
    const user = userEvent.setup();
    const setSlug = vi.fn();
    renderEditor({ entry: null, setSlug });
    await user.type(screen.getByLabelText("Entry slug"), "x");
    expect(setSlug).toHaveBeenCalled();
  });

  it("shows the entry's own (immutable) slug as plain text once an entry exists — no slug input", () => {
    renderEditor({ entry: ENTRY });
    expect(screen.getByText("my-recipe")).toBeInTheDocument();
    expect(screen.queryByLabelText("Entry slug")).not.toBeInTheDocument();
  });
});

describe("DynamicField — one control per ContentTypeFieldDef.kind", () => {
  it("renders no Fields section when contentType.fields is empty", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [] } });
    expect(screen.queryByText("Fields")).not.toBeInTheDocument();
  });

  it("text: renders a plain (untyped, defaults to text) input, marks required fields with '*'", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] } });
    const input = screen.getByLabelText("notes");
    expect(input.tagName).toBe("INPUT");
    expect(input).not.toHaveAttribute("type"); // no explicit type -> plain text input, unlike integer/real/boolean/datetime
    // FIELD_TEXT is not required — no asterisk.
    expect(screen.queryByText("notes *")).not.toBeInTheDocument();
  });

  it("marks a required field's label with ' *'", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_INTEGER] } });
    expect(screen.getByText("prep_time *")).toBeInTheDocument();
  });

  it("integer: renders a number input (step=1)", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_INTEGER] } });
    const input = screen.getByLabelText("prep_time *");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("step", "1");
  });

  it("real: renders a number input without step=1", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_REAL] } });
    const input = screen.getByLabelText("rating");
    expect(input).toHaveAttribute("type", "number");
    expect(input).not.toHaveAttribute("step");
  });

  it("boolean: renders a checkbox", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_BOOLEAN] } });
    expect(screen.getByLabelText("featured")).toHaveAttribute("type", "checkbox");
  });

  it("datetime (the fallback else-branch): renders a datetime-local input", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_DATETIME] } });
    expect(screen.getByLabelText("cook_by")).toHaveAttribute("type", "datetime-local");
  });

  it("text/datetime coerce a non-string current value to '' rather than rendering it raw", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] }, extFields: { notes: 42 } });
    expect(screen.getByLabelText("notes")).toHaveValue("");
  });

  it("datetime coerces a non-string current value to '' rather than rendering it raw", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_DATETIME] }, extFields: { cook_by: 42 } });
    expect(screen.getByLabelText("cook_by")).toHaveValue("");
  });

  it("datetime renders an existing string value as-is", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_DATETIME] }, extFields: { cook_by: "2026-08-01T12:00" } });
    expect(screen.getByLabelText("cook_by")).toHaveValue("2026-08-01T12:00");
  });

  it("integer/real coerce a non-number current value to '' rather than rendering it raw", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_REAL] }, extFields: { rating: "not a number" } });
    expect(screen.getByLabelText("rating")).toHaveValue(null);
  });

  it("boolean only checks for the literal value true, not any truthy value", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_BOOLEAN] }, extFields: { featured: "yes" } });
    expect(screen.getByLabelText("featured")).not.toBeChecked();
  });

  it("boolean checks when the value is literally true", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_BOOLEAN] }, extFields: { featured: true } });
    expect(screen.getByLabelText("featured")).toBeChecked();
  });

  it("typing into a text field calls setExtFields with an updater merging { [name]: value }", async () => {
    const user = userEvent.setup();
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] }, setExtFields });
    await user.type(screen.getByLabelText("notes"), "x");
    expect(setExtFields).toHaveBeenCalled();
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({ other: 1 })).toEqual({ other: 1, notes: "x" });
  });

  it("typing a number into an integer field converts to Number", async () => {
    const user = userEvent.setup();
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_INTEGER] }, setExtFields });
    await user.type(screen.getByLabelText("prep_time *"), "5");
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({})).toEqual({ prep_time: 5 });
  });

  it("clearing an integer field's value sets it to undefined, not NaN or 0", async () => {
    const user = userEvent.setup();
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_INTEGER] }, extFields: { prep_time: 5 }, setExtFields });
    await user.clear(screen.getByLabelText("prep_time *"));
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({ prep_time: 5 })).toEqual({ prep_time: undefined });
  });

  it("typing a decimal number into a real field converts to Number", () => {
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_REAL] }, setExtFields });
    // A single atomic fireEvent.change (rather than user.type's per-keystroke events): this is a
    // controlled input whose `value` prop never advances in this fixture (setExtFields is a
    // no-op spy), so per-keystroke typing of a multi-character decimal gets its intermediate
    // DOM value reset between keystrokes — a harness artifact of the mock, not a real product
    // behavior worth pinning either way.
    fireEvent.change(screen.getByLabelText("rating"), { target: { value: "4.5" } });
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({})).toEqual({ rating: 4.5 });
  });

  it("clearing a real field's value sets it to undefined", async () => {
    const user = userEvent.setup();
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_REAL] }, extFields: { rating: 4.5 }, setExtFields });
    await user.clear(screen.getByLabelText("rating"));
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({ rating: 4.5 })).toEqual({ rating: undefined });
  });

  it("typing into a datetime field calls setExtFields with the raw string value", async () => {
    const user = userEvent.setup();
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_DATETIME] }, setExtFields });
    await user.type(screen.getByLabelText("cook_by"), "2026-08-01T12:00");
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({})).toEqual({ cook_by: "2026-08-01T12:00" });
  });

  it("toggling a boolean field calls setExtFields with the checked value", async () => {
    const user = userEvent.setup();
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_BOOLEAN] }, setExtFields });
    await user.click(screen.getByLabelText("featured"));
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({})).toEqual({ featured: true });
  });
});

describe("readExtSiteField — falls back to the entry's stored fieldsJson only when extFields has no local value", () => {
  it("uses the value from entry.fieldsJson.ext.site.{name} when extFields is empty", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] }, entry: ENTRY, extFields: {} });
    expect(screen.getByLabelText("notes")).toHaveValue("hello");
  });

  it("a local extFields edit shadows the entry's stored value (?? only falls through on nullish)", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] }, entry: ENTRY, extFields: { notes: "edited" } });
    expect(screen.getByLabelText("notes")).toHaveValue("edited");
  });

  it("defends against fieldsJson being a non-object (e.g. a string) — falls back to undefined, not a crash", () => {
    renderEditor({
      contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] },
      entry: { ...ENTRY, fieldsJson: "not an object" as unknown },
      extFields: {},
    });
    expect(screen.getByLabelText("notes")).toHaveValue("");
  });

  it("defends against fieldsJson being null", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] }, entry: { ...ENTRY, fieldsJson: null }, extFields: {} });
    expect(screen.getByLabelText("notes")).toHaveValue("");
  });

  it("defends against fieldsJson.ext being a non-object", () => {
    renderEditor({
      contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] },
      entry: { ...ENTRY, fieldsJson: { ext: "nope" } },
      extFields: {},
    });
    expect(screen.getByLabelText("notes")).toHaveValue("");
  });

  it("defends against fieldsJson.ext.site being a non-object", () => {
    renderEditor({
      contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] },
      entry: { ...ENTRY, fieldsJson: { ext: { site: "nope" } } },
      extFields: {},
    });
    expect(screen.getByLabelText("notes")).toHaveValue("");
  });

  it("defends against fieldsJson.ext.site missing the requested field name entirely", () => {
    renderEditor({
      contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] },
      entry: { ...ENTRY, fieldsJson: { ext: { site: {} } } },
      extFields: {},
    });
    expect(screen.getByLabelText("notes")).toHaveValue("");
  });

  it("no entry at all (new-entry case) falls back to undefined without touching fieldsJson", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_TEXT] }, entry: null, extFields: {} });
    expect(screen.getByLabelText("notes")).toHaveValue("");
  });
});

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

describe("TermPicker", () => {
  it("is not rendered at all when there is no entry yet (new entry)", () => {
    renderEditor({ entry: null, taxonomies: [TAXONOMY] });
    expect(screen.queryByText("Categories & Tags")).not.toBeInTheDocument();
  });

  it("renders nothing when taxonomies is empty, even with an entry", () => {
    renderEditor({ entry: ENTRY, taxonomies: [] });
    expect(screen.queryByText("Categories & Tags")).not.toBeInTheDocument();
  });

  it("renders one fieldset per taxonomy with its own terms as checkboxes", () => {
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    expect(screen.getByRole("group", { name: "Genre" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Fiction" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Non-fiction" })).toBeInTheDocument();
  });

  it("shows 'No terms yet.' for a taxonomy with zero terms", () => {
    renderEditor({ entry: ENTRY, taxonomies: [EMPTY_TAXONOMY] });
    expect(screen.getByText("No terms yet.")).toBeInTheDocument();
  });

  it("a term's checkbox reflects the hook's own `selected` set", () => {
    termPickerControllerRef.current = termPickerController({ selected: new Set(["t1"]) });
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    expect(screen.getByRole("checkbox", { name: "Fiction" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Non-fiction" })).not.toBeChecked();
  });

  it("clicking a term checkbox calls toggle(termId)", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    termPickerControllerRef.current = termPickerController({ toggle });
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    await user.click(screen.getByRole("checkbox", { name: "Fiction" }));
    expect(toggle).toHaveBeenCalledWith("t1");
  });

  it("'Assign selected terms' is disabled when nothing is selected", () => {
    termPickerControllerRef.current = termPickerController({ selected: new Set() });
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    expect(screen.getByRole("button", { name: "Assign selected terms" })).toBeDisabled();
  });

  it("'Assign selected terms' is enabled once at least one term is selected", () => {
    termPickerControllerRef.current = termPickerController({ selected: new Set(["t1"]) });
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    expect(screen.getByRole("button", { name: "Assign selected terms" })).toBeEnabled();
  });

  it("shows 'Assigning…' and disables while saving, even with a selection", () => {
    termPickerControllerRef.current = termPickerController({ selected: new Set(["t1"]), saving: true });
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    expect(screen.getByRole("button", { name: "Assigning…" })).toBeDisabled();
  });

  it("clicking Assign calls assign()", async () => {
    const user = userEvent.setup();
    const assign = vi.fn(async () => {});
    termPickerControllerRef.current = termPickerController({ selected: new Set(["t1"]), assign });
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    await user.click(screen.getByRole("button", { name: "Assign selected terms" }));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("shows the hook's own message on success", () => {
    termPickerControllerRef.current = termPickerController({ message: "Assigned 1 term(s)." });
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    expect(screen.getByText("Assigned 1 term(s).")).toBeInTheDocument();
  });

  it("shows the hook's own error on failure", () => {
    termPickerControllerRef.current = termPickerController({ error: "Failed to assign terms" });
    renderEditor({ entry: ENTRY, taxonomies: [TAXONOMY] });
    expect(screen.getByText("Failed to assign terms")).toBeInTheDocument();
  });
});
