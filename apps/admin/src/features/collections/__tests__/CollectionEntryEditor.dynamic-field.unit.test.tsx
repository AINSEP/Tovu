import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionEntryEditor } from "../CollectionEntryEditor";
import type { CollectionEntryEditorController } from "../hooks/use-collection-entry-editor.hooks";
import type { AdminContentType, AdminEntry, ContentTypeFieldDef } from "@/lib/api";

/**
 * @file `CollectionEntryEditor` — the render-layer branches `CollectionEntryEditor.unit.test.tsx`
 * (the a11y-label pin, driven through a real `useCollectionEntryEditor` + mocked `fetch`) doesn't
 * reach: `DynamicField`'s five `ContentTypeFieldDef.kind` branches (rank #2 by cognitive
 * complexity in the whole admin app per the coverage audit), `readExtSiteField`'s defensive
 * shape-check fallbacks, the Publish/Unpublish/Save lifecycle buttons, loading/error states, and
 * that the shared `TermPicker` is mounted (its own branches: `features/taxonomy/__tests__/`).
 *
 * `CollectionEntryEditor`'s nested `DynamicField` exposes no `use*Hook` DI seam through props — so
 * `use-collection-entry-editor.hooks.ts` is module-mocked via a `vi.hoisted` ref (and `TermPicker`
 * is stubbed to echo its content ref), the same fallback seam `Recovery.tsx`'s `RestoreFlow` and
 * `Database.tsx`'s sections needed. `editor` is fixture-supplied as `null` throughout — verified
 * safe: `WidgetEmbedInsertControl` explicitly renders nothing for a null editor
 * (`lib/widget-embed-extension.tsx`), and `EditorContent` (`@tiptap/react`) accepts a null editor.
 */

const { editorControllerRef } = vi.hoisted(() => ({
  editorControllerRef: { current: null as unknown },
}));

vi.mock("../hooks/use-collection-entry-editor.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-collection-entry-editor.hooks")>();
  // Mocks the zero-deps wrapper `CollectionEntryEditor.tsx` now calls by default post-`useWiredX`
  // conversion — was `useCollectionEntryEditor` (the pure, deps-taking hook) before; a call-site
  // rename of what gets intercepted, not a behavior or assertion change.
  return { ...actual, useWiredCollectionEntryEditor: () => editorControllerRef.current };
});
vi.mock("../../taxonomy/TermPicker", () => ({
  TermPicker: (props: { contentType: string; contentId: string }) => (
    <div data-testid="term-picker">{`${props.contentType}/${props.contentId}`}</div>
  ),
}));

const FIELD_TEXT: ContentTypeFieldDef = { name: "notes", kind: "text", required: false, queryable: false };
const FIELD_INTEGER: ContentTypeFieldDef = { name: "prep_time", kind: "integer", required: true, queryable: true };
const FIELD_REAL: ContentTypeFieldDef = { name: "rating", kind: "real", required: false, queryable: false };
const FIELD_BOOLEAN: ContentTypeFieldDef = { name: "featured", kind: "boolean", required: false, queryable: false };
const FIELD_DATETIME: ContentTypeFieldDef = { name: "cook_by", kind: "datetime", required: false, queryable: false };
// `relation`/`json` (Jini `df1be096`, 2026-09-05): the crash-repro kinds — before this fix,
// `FIELD_CONTROLS[field.kind]` was `undefined` for either one, and `<Control .../>` threw
// synchronously during render (would fail these tests with an uncaught render error, not a
// regular assertion failure).
const FIELD_RELATION: ContentTypeFieldDef = { name: "author_id", kind: "relation", required: false, queryable: true };
const FIELD_JSON: ContentTypeFieldDef = { name: "meta", kind: "json", required: false, queryable: false };

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
    message: null,
    error: null,
    loadError: null,
    loaded: true,
    saving: false,
    busy: false,
    editor: null,
    save: vi.fn(async () => {}),
    toggleLifecycle: vi.fn(async () => {}),
    setFieldValidity: vi.fn(),
    // Identity `t` — matches what the pre-`useWiredX` component got from a real, unmocked
    // `useAdminLocale()` call in this render-only test (defaults to "en", and `COLLECTIONS_DICT`
    // has no "en" entries, so every lookup already fell through to `?? key`), so every existing
    // literal-English-string assertion below stays valid unchanged.
    t: (key: string) => key,
    ...overrides,
  };
}

beforeEach(() => {
  editorControllerRef.current = editorController();
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
    // `saving` implies `busy` in the real hook (`busy = saving || lifecycleMutation.pending`) — the
    // fake controller's two fields are independent, so both are set here to match.
    renderEditor({ saving: true, busy: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("disables Publish/Save while busy (H2: Publish now saves first, so a lifecycle-only pending state must also disable)", () => {
    renderEditor({ entry: { ...ENTRY, status: "draft" }, busy: true });
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
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

  it("relation: renders a plain text input (not a crash) holding the current foreign-id value", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_RELATION] }, extFields: { author_id: "user-42" } });
    const input = screen.getByLabelText("author_id");
    expect(input.tagName).toBe("INPUT");
    expect(input).not.toHaveAttribute("type"); // same plain text input as `text`, not a special widget
    expect(input).toHaveValue("user-42");
  });

  it("typing into a relation field calls setExtFields with the raw string id, same as a text field", async () => {
    const user = userEvent.setup();
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_RELATION] }, setExtFields });
    await user.type(screen.getByLabelText("author_id"), "x");
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({})).toEqual({ author_id: "x" });
  });

  it("json: renders a textarea (not a crash) showing the current value pretty-printed", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_JSON] }, extFields: { meta: { tags: ["a", "b"], count: 3 } } });
    const control = screen.getByLabelText("meta");
    expect(control.tagName).toBe("TEXTAREA");
    expect(JSON.parse((control as HTMLTextAreaElement).value)).toEqual({ tags: ["a", "b"], count: 3 });
  });

  it("json: an untouched field's textarea round-trips the exact stored value — same shape back out", () => {
    const meta = { tags: ["a", "b"], count: 3, nested: { ok: true } };
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_JSON] }, extFields: { meta } });
    const control = screen.getByLabelText("meta") as HTMLTextAreaElement;
    expect(JSON.parse(control.value)).toEqual(meta);
  });

  it("json: no stored value yet renders 'null', not a crash or an empty/undefined buffer", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_JSON] }, extFields: {} });
    expect((screen.getByLabelText("meta") as HTMLTextAreaElement).value).toBe("null");
  });

  it("editing a json field to valid JSON calls setExtFields with the PARSED value, not the raw text", () => {
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_JSON] }, setExtFields });
    fireEvent.change(screen.getByLabelText("meta"), { target: { value: '{"tags":["x"],"count":1}' } });
    const updater = setExtFields.mock.calls.at(-1)![0] as (c: Record<string, unknown>) => Record<string, unknown>;
    expect(updater({})).toEqual({ meta: { tags: ["x"], count: 1 } });
  });

  it("editing a json field to INVALID JSON does not call setExtFields — the last valid value is never overwritten by a parse failure", () => {
    const setExtFields = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_JSON] }, extFields: { meta: { count: 1 } }, setExtFields });
    fireEvent.change(screen.getByLabelText("meta"), { target: { value: "{not valid json" } });
    expect(setExtFields).not.toHaveBeenCalled();
  });

  it("json: flags an unparseable buffer via aria-invalid, without touching the stored value", () => {
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_JSON] }, extFields: { meta: { count: 1 } } });
    const control = screen.getByLabelText("meta");
    expect(control).toHaveAttribute("aria-invalid", "false");
    fireEvent.change(control, { target: { value: "{not valid json" } });
    expect(control).toHaveAttribute("aria-invalid", "true");
  });

  it("json: typing invalid text calls controller.setFieldValidity(fieldName, false) (M2)", () => {
    const setFieldValidity = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_JSON] }, extFields: { meta: { count: 1 } }, setFieldValidity });
    fireEvent.change(screen.getByLabelText("meta"), { target: { value: "{not valid json" } });
    expect(setFieldValidity).toHaveBeenCalledWith("meta", false);
  });

  it("json: typing valid text calls controller.setFieldValidity(fieldName, true) (M2)", () => {
    const setFieldValidity = vi.fn();
    renderEditor({ contentType: { ...CONTENT_TYPE, fields: [FIELD_JSON] }, extFields: {}, setFieldValidity });
    fireEvent.change(screen.getByLabelText("meta"), { target: { value: '{"tags":["x"],"count":1}' } });
    expect(setFieldValidity).toHaveBeenCalledWith("meta", true);
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

describe("Categories & Tags", () => {
  it("is not mounted when there is no entry yet (new entry)", () => {
    renderEditor({ entry: null });
    expect(screen.queryByTestId("term-picker")).not.toBeInTheDocument();
  });

  it("mounts the shared box for a saved entry, by its collection key and entry id", () => {
    renderEditor({ entry: ENTRY });
    expect(screen.getByTestId("term-picker")).toHaveTextContent("recipe/e1");
  });
});
