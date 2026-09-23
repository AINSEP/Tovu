import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Collections } from "../Collections";
import type { CollectionsController } from "../hooks/use-collections.hooks";
import type { NewContentTypeDialogController } from "../hooks/use-new-content-type-dialog.hooks";
import type { EditFieldsDialogController } from "../hooks/use-edit-fields-dialog.hooks";
import type { LifecycleConfirmDialogController } from "../hooks/use-lifecycle-confirm-dialog.hooks";
import type { AdminContentType } from "@/lib/api";

/**
 * @file `Collections` — the `/admin/collections` list screen (design-spec.md §1, ADR-022/ADR-043)
 * plus its three dialogs (`NewContentTypeDialog`, `EditFieldsDialog`, `LifecycleConfirmDialog`).
 *
 * `Collections` itself is driven through the injectable `useCollectionsHook` seam (same
 * convention as `Pages.tsx`/`Recovery.tsx`). The three dialogs each declare their own `use*Hook`
 * seam too, but `Collections` never threads a prop through to them when it instantiates them
 * (same situation as `RestoreFlow` in `Recovery.tsx` / the three sections in `Database.tsx`) — so
 * each dialog's hook module is mocked via a `vi.hoisted` ref that tests mutate before rendering,
 * reaching every dialog state without a real `fetch`.
 */

const { newDialogRef, newDialogPropsRef, editDialogRef, editDialogPropsRef, lifecycleDialogRef } = vi.hoisted(() => ({
  newDialogRef: { current: null as unknown },
  newDialogPropsRef: { current: null as unknown },
  editDialogRef: { current: null as unknown },
  editDialogPropsRef: { current: null as unknown },
  lifecycleDialogRef: { current: null as unknown },
}));

vi.mock("../hooks/use-new-content-type-dialog.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-new-content-type-dialog.hooks")>();
  return {
    ...actual,
    // Mocks the zero-deps wrapper `NewContentTypeDialog`'s default prop now points at post-
    // `useWiredX` conversion — was `useNewContentTypeDialog` (the pure, deps-taking hook) before; a
    // call-site rename of what gets intercepted, not a behavior or assertion change.
    useWiredNewContentTypeDialog: (props: unknown) => {
      newDialogPropsRef.current = props;
      return newDialogRef.current;
    },
  };
});
vi.mock("../hooks/use-edit-fields-dialog.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-edit-fields-dialog.hooks")>();
  return {
    ...actual,
    // Mocks the zero-port wrapper `EditFieldsDialog`'s default prop now points at post-`useWiredX`
    // conversion — was `useEditFieldsDialog` (the pure, port-taking hook) before; a call-site
    // rename of what gets intercepted, not a behavior or assertion change.
    useWiredEditFieldsDialog: (props: unknown) => {
      editDialogPropsRef.current = props;
      return editDialogRef.current;
    },
  };
});
vi.mock("../hooks/use-lifecycle-confirm-dialog.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-lifecycle-confirm-dialog.hooks")>();
  return { ...actual, useLifecycleConfirmDialog: () => lifecycleDialogRef.current };
});

const TYPE: AdminContentType = {
  workspaceId: "w1",
  key: "recipe",
  label: "Recipe",
  fields: [
    { name: "prep_time", kind: "integer", required: true, queryable: true },
    { name: "notes", kind: "text", required: false, queryable: false },
  ],
  status: "active",
  version: 1,
};
const DEPRECATED_TYPE: AdminContentType = { ...TYPE, key: "old", label: "Old Type", status: "deprecated" };
const TOMBSTONE_TYPE: AdminContentType = { ...TYPE, key: "gone", label: "Gone Type", status: "tombstone" };

function collectionsController(overrides: Partial<CollectionsController> = {}): CollectionsController {
  return {
    types: [TYPE],
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
    copiedKey: null,
    copyFallback: null,
    copyEmbedCode: vi.fn(async () => {}),
    // Identity `t` + "en" locale — matches what the pre-`useWiredX` component got from a real,
    // unmocked `useAdminLocale()` call in this render-only test (defaults to `DEFAULT_LOCALE`
    // synchronously; `COLLECTIONS_DICT` has no "en" entries, so every lookup already fell through
    // to `?? key`), so every existing literal-English-string assertion below stays valid unchanged.
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

function newDialogController(overrides: Partial<NewContentTypeDialogController> = {}): NewContentTypeDialogController {
  return {
    label: "",
    setLabel: vi.fn(),
    key: "",
    setKey: vi.fn(),
    fields: [{ _rowId: 1, name: "", kind: "text", required: false, queryable: false }],
    updateField: vi.fn(),
    removeField: vi.fn(),
    addField: vi.fn(),
    error: null,
    saving: false,
    submit: vi.fn((e: React.FormEvent) => e.preventDefault()),
    cancel: vi.fn(),
    dialogRef: { current: null },
    ...overrides,
  };
}

function editDialogController(overrides: Partial<EditFieldsDialogController> = {}): EditFieldsDialogController {
  return {
    fields: [{ _rowId: 1, name: "prep_time", kind: "integer", required: true, queryable: true }],
    updateField: vi.fn(),
    removeField: vi.fn(),
    addField: vi.fn(),
    error: null,
    saving: false,
    submit: vi.fn((e: React.FormEvent) => e.preventDefault()),
    cancel: vi.fn(),
    dialogRef: { current: null },
    ...overrides,
  };
}

function lifecycleDialogController(overrides: Partial<LifecycleConfirmDialogController> = {}): LifecycleConfirmDialogController {
  return {
    copy: { title: "Deprecate content type", body: "Existing entries stay readable; no new entries can be created." },
    autoFocusCancel: false,
    dialogRef: { current: null },
    ...overrides,
  };
}

beforeEach(() => {
  newDialogRef.current = newDialogController();
  editDialogRef.current = editDialogController();
  lifecycleDialogRef.current = lifecycleDialogController();
});

function renderCollections(overrides: Partial<CollectionsController> = {}) {
  const c = collectionsController(overrides);
  const useCollectionsHook = () => c;
  render(<Collections useCollectionsHook={useCollectionsHook} />);
  return c;
}

describe("loading and error-before-load states", () => {
  it("shows a loading notice while types is null and there is no error", () => {
    renderCollections({ types: null, error: null });
    expect(screen.getByText("Loading content types…")).toBeInTheDocument();
  });

  it("shows only the error notice when types is still null and error is set", () => {
    renderCollections({ types: null, error: "failed to load content types" });
    expect(screen.getByText("failed to load content types")).toBeInTheDocument();
  });

  it("shows an inline banner ABOVE the table once types have loaded and a later error occurs", () => {
    renderCollections({ types: [TYPE], error: "failed to load content types" });
    expect(screen.getByText("failed to load content types")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows the actionError banner separately from the load error", () => {
    renderCollections({ types: [TYPE], actionError: 'Failed to deprecate "Recipe"' });
    expect(screen.getByText('Failed to deprecate "Recipe"')).toBeInTheDocument();
  });
});

describe("empty and populated list", () => {
  it("shows the empty state when there are no content types", () => {
    renderCollections({ types: [] });
    expect(screen.getByText("No Collections yet.")).toBeInTheDocument();
  });

  it("renders label, key, field count, queryable count, status, and the manage-entries link", () => {
    renderCollections({ types: [TYPE] });
    expect(screen.getByText("Recipe")).toBeInTheDocument();
    expect(screen.getByText("recipe")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // field count
    expect(screen.getByText("1")).toBeInTheDocument(); // queryable count
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage entries" })).toHaveAttribute("href", "/admin/collections/recipe");
  });
});

describe("Copy embed code", () => {
  it("renders a Copy embed code button per row and calls copyEmbedCode(ct) on click", async () => {
    const user = userEvent.setup();
    const c = renderCollections({ types: [TYPE] });
    await user.click(screen.getByRole("button", { name: "Copy embed code" }));
    expect(c.copyEmbedCode).toHaveBeenCalledWith(TYPE);
  });

  it("shows the snippet as selectable text on the failed row only, when the clipboard write failed", () => {
    const snippet = '<div data-embed-config=\'{"type":"collection","id":"recipe"}\'></div>';
    renderCollections({ types: [TYPE, DEPRECATED_TYPE], copyFallback: { key: "recipe", snippet } });
    expect(screen.getByText(snippet)).toBeInTheDocument();
    expect(screen.getAllByText(/data-embed-config/)).toHaveLength(1);
  });

  it("shows Copied only for the row whose key matches copiedKey", () => {
    renderCollections({ types: [TYPE, DEPRECATED_TYPE], copiedKey: "recipe" });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy embed code" })).toBeInTheDocument();
  });
});

describe("New content type button", () => {
  it("clicking calls setShowNewDialog(true)", async () => {
    const user = userEvent.setup();
    const c = renderCollections();
    await user.click(screen.getByRole("button", { name: "New content type" }));
    expect(c.setShowNewDialog).toHaveBeenCalledWith(true);
  });

  it("dialog is not rendered when showNewDialog is false", () => {
    renderCollections({ showNewDialog: false });
    expect(screen.queryByRole("dialog", { name: "New content type" })).not.toBeInTheDocument();
  });
});

describe("row menu — status-driven visibility (mirrors contentTypeMenuItems)", () => {
  it("active: offers Deprecate and Tombstone, not Reactivate", async () => {
    const user = userEvent.setup();
    renderCollections({ types: [TYPE] });
    await user.click(screen.getByRole("button", { name: 'Actions for content type "Recipe"' }));
    expect(screen.getByRole("menuitem", { name: "Deprecate" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Reactivate" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Tombstone" })).toBeInTheDocument();
  });

  it("deprecated: offers Reactivate and Tombstone, not Deprecate", async () => {
    const user = userEvent.setup();
    renderCollections({ types: [DEPRECATED_TYPE] });
    await user.click(screen.getByRole("button", { name: 'Actions for content type "Old Type"' }));
    expect(screen.queryByRole("menuitem", { name: "Deprecate" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Reactivate" })).toBeInTheDocument();
  });

  it("tombstone: offers none of Deprecate/Reactivate/Tombstone", async () => {
    const user = userEvent.setup();
    renderCollections({ types: [TOMBSTONE_TYPE] });
    await user.click(screen.getByRole("button", { name: 'Actions for content type "Gone Type"' }));
    expect(screen.queryByRole("menuitem", { name: "Deprecate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Reactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Tombstone" })).not.toBeInTheDocument();
  });

  it("Edit fields calls setEditingFieldsFor with the row", async () => {
    const user = userEvent.setup();
    const c = renderCollections({ types: [TYPE] });
    await user.click(screen.getByRole("button", { name: 'Actions for content type "Recipe"' }));
    await user.click(screen.getByRole("menuitem", { name: "Edit fields" }));
    expect(c.setEditingFieldsFor).toHaveBeenCalledWith(TYPE);
  });

  it("Deprecate calls setPendingLifecycle({ op: 'deprecate', contentType }) — confirm-gated, not immediate", async () => {
    const user = userEvent.setup();
    const c = renderCollections({ types: [TYPE] });
    await user.click(screen.getByRole("button", { name: 'Actions for content type "Recipe"' }));
    await user.click(screen.getByRole("menuitem", { name: "Deprecate" }));
    expect(c.setPendingLifecycle).toHaveBeenCalledWith({ op: "deprecate", contentType: TYPE });
    expect(c.runLifecycle).not.toHaveBeenCalled();
  });

  it("Tombstone calls setPendingLifecycle({ op: 'tombstone', contentType }) — confirm-gated", async () => {
    const user = userEvent.setup();
    const c = renderCollections({ types: [TYPE] });
    await user.click(screen.getByRole("button", { name: 'Actions for content type "Recipe"' }));
    await user.click(screen.getByRole("menuitem", { name: "Tombstone" }));
    expect(c.setPendingLifecycle).toHaveBeenCalledWith({ op: "tombstone", contentType: TYPE });
  });

  it("Reactivate calls runLifecycle directly — NOT confirm-gated", async () => {
    const user = userEvent.setup();
    const c = renderCollections({ types: [DEPRECATED_TYPE] });
    await user.click(screen.getByRole("button", { name: 'Actions for content type "Old Type"' }));
    await user.click(screen.getByRole("menuitem", { name: "Reactivate" }));
    expect(c.runLifecycle).toHaveBeenCalledWith(DEPRECATED_TYPE, "reactivate");
    expect(c.setPendingLifecycle).not.toHaveBeenCalled();
  });
});

describe("NewContentTypeDialog", () => {
  it("renders when showNewDialog is true, driven by the mocked hook", () => {
    renderCollections({ showNewDialog: true });
    expect(screen.getByRole("dialog", { name: "New content type" })).toBeInTheDocument();
  });

  it("renders one fieldset per draft field, with Remove field only when more than one exists", () => {
    newDialogRef.current = newDialogController({
      fields: [
        { _rowId: 1, name: "a", kind: "text", required: false, queryable: false },
        { _rowId: 2, name: "b", kind: "text", required: false, queryable: false },
      ],
    });
    renderCollections({ showNewDialog: true });
    expect(screen.getAllByText(/^Field \d$/)).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Remove field" })).toHaveLength(2);
  });

  it("omits Remove field when only one field remains", () => {
    renderCollections({ showNewDialog: true });
    expect(screen.queryByRole("button", { name: "Remove field" })).not.toBeInTheDocument();
  });

  it("typing the label calls setLabel", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.type(screen.getByLabelText("Label"), "x");
    expect(dlg.setLabel).toHaveBeenCalled();
  });

  it("typing the key calls setKey", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.type(screen.getByLabelText("Key"), "x");
    expect(dlg.setKey).toHaveBeenCalled();
  });

  it("typing a field name calls updateField with { name }", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController({ fields: [{ _rowId: 1, name: "", kind: "text", required: false, queryable: false }] });
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.type(screen.getByLabelText("Name"), "x");
    expect(dlg.updateField).toHaveBeenCalledWith(1, { name: "x" });
  });

  it("changing the Kind select calls updateField with { kind }", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController({ fields: [{ _rowId: 1, name: "n", kind: "text", required: false, queryable: false }] });
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.selectOptions(screen.getByLabelText("Kind"), "real");
    expect(dlg.updateField).toHaveBeenCalledWith(1, { kind: "real" });
  });

  it("toggling Required calls updateField with { required }", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController({ fields: [{ _rowId: 1, name: "n", kind: "text", required: false, queryable: false }] });
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.click(screen.getByRole("checkbox", { name: "Required" }));
    expect(dlg.updateField).toHaveBeenCalledWith(1, { required: true });
  });

  it("toggling Queryable calls updateField with { queryable }", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController({ fields: [{ _rowId: 1, name: "n", kind: "text", required: false, queryable: false }] });
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.click(screen.getByRole("checkbox", { name: /Queryable/ }));
    expect(dlg.updateField).toHaveBeenCalledWith(1, { queryable: true });
  });

  it("clicking 'Remove field' (only shown when >1 field) calls removeField", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController({
      fields: [
        { _rowId: 1, name: "a", kind: "text", required: false, queryable: false },
        { _rowId: 2, name: "b", kind: "text", required: false, queryable: false },
      ],
    });
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.click(screen.getAllByRole("button", { name: "Remove field" })[0]);
    expect(dlg.removeField).toHaveBeenCalledWith(1);
  });

  it("clicking 'Add field' calls addField", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.click(screen.getByRole("button", { name: "Add field" }));
    expect(dlg.addField).toHaveBeenCalledTimes(1);
  });

  it("shows the dialog's own error", () => {
    newDialogRef.current = newDialogController({ error: "Key must start with a lowercase letter." });
    renderCollections({ showNewDialog: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Key must start with a lowercase letter.");
  });

  it("disables submit and shows 'Saving…' while saving", () => {
    newDialogRef.current = newDialogController({ saving: true });
    renderCollections({ showNewDialog: true });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("submitting the form calls the dialog's submit handler", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.click(screen.getByRole("button", { name: "Create content type" }));
    expect(dlg.submit).toHaveBeenCalledTimes(1);
  });

  it("clicking Cancel calls the dialog's own cancel (H4 — routes through the in-flight guard, not the raw prop)", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dlg.cancel).toHaveBeenCalledTimes(1);
  });

  // M3's focus trap only works if Collections.tsx actually attaches the hook's ref to this
  // dialog's own role="dialog" root. The hook tests render their own harness markup, so dropping
  // `ref={dialogRef}` here left every test green (verified 2026-09-20) while the trap silently
  // did nothing in the real dialog.
  it("attaches the hook's dialogRef to the dialog root, so useFocusTrap has an element to trap in (M3)", () => {
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    expect(dlg.dialogRef.current).toBe(screen.getByRole("dialog"));
  });

  it("clicking the backdrop calls the dialog's own cancel, but clicking inside the dialog does not", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.click(screen.getByRole("dialog"));
    expect(dlg.cancel).not.toHaveBeenCalled();
    await user.click(document.querySelector(".settings-dialog-backdrop")!);
    expect(dlg.cancel).toHaveBeenCalledTimes(1);
  });

  it("Cancel is disabled while saving, so a click can't reach the dialog's cancel (H4)", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController({ saving: true });
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeDisabled();
    await user.click(cancelButton);
    expect(dlg.cancel).not.toHaveBeenCalled();
  });

  it("onCreated closes the dialog AND reloads the list — Collections passes both through, not just one", () => {
    // `newDialogPropsRef` captures the props Collections.tsx passed to the (mocked)
    // useNewContentTypeDialog hook — invoking the real `onCreated` it wired up is how
    // `onCreated={() => { setShowNewDialog(false); load(); }}` itself gets exercised, since the
    // dialog-hook mock has no real submit flow of its own to click through.
    const c = renderCollections({ showNewDialog: true });
    (newDialogPropsRef.current as { onCreated: () => void }).onCreated();
    expect(c.setShowNewDialog).toHaveBeenCalledWith(false);
    expect(c.load).toHaveBeenCalledTimes(1);
  });
});

describe("EditFieldsDialog", () => {
  it("renders when editingFieldsFor is set, showing the content type's own label in the title", () => {
    renderCollections({ editingFieldsFor: TYPE });
    expect(screen.getByRole("heading", { name: "Edit fields — Recipe" })).toBeInTheDocument();
  });

  it("does not render when editingFieldsFor is null", () => {
    renderCollections({ editingFieldsFor: null });
    expect(screen.queryByRole("heading", { name: /Edit fields/ })).not.toBeInTheDocument();
  });

  it("clicking 'Remove field' always calls removeField, even for the only remaining field (no length guard here)", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController({ fields: [{ _rowId: 1, name: "prep_time", kind: "integer", required: true, queryable: true }] });
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.click(screen.getByRole("button", { name: "Remove field" }));
    expect(dlg.removeField).toHaveBeenCalledWith(1);
  });

  it("typing the field name calls updateField with { name }", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController({ fields: [{ _rowId: 1, name: "", kind: "text", required: false, queryable: false }] });
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.type(screen.getByLabelText("Name"), "x");
    expect(dlg.updateField).toHaveBeenCalledWith(1, { name: "x" });
  });

  it("changing the Kind select calls updateField with { kind }", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController({ fields: [{ _rowId: 1, name: "n", kind: "text", required: false, queryable: false }] });
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.selectOptions(screen.getByLabelText("Kind"), "boolean");
    expect(dlg.updateField).toHaveBeenCalledWith(1, { kind: "boolean" });
  });

  it("toggling Required calls updateField with { required }", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController({ fields: [{ _rowId: 1, name: "n", kind: "text", required: false, queryable: false }] });
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.click(screen.getByRole("checkbox", { name: "Required" }));
    expect(dlg.updateField).toHaveBeenCalledWith(1, { required: true });
  });

  it("toggling Queryable calls updateField with { queryable }", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController({ fields: [{ _rowId: 1, name: "n", kind: "text", required: false, queryable: false }] });
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.click(screen.getByRole("checkbox", { name: /Queryable/ }));
    expect(dlg.updateField).toHaveBeenCalledWith(1, { queryable: true });
  });

  it("clicking 'Add field' calls addField", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController();
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.click(screen.getByRole("button", { name: "Add field" }));
    expect(dlg.addField).toHaveBeenCalledTimes(1);
  });

  it("shows the dialog's own error", () => {
    editDialogRef.current = editDialogController({ error: "This content type changed since you loaded it, refresh and try again." });
    renderCollections({ editingFieldsFor: TYPE });
    expect(screen.getByRole("alert")).toHaveTextContent("refresh and try again");
  });

  it("disables submit and shows 'Saving…' while saving", () => {
    editDialogRef.current = editDialogController({ saving: true });
    renderCollections({ editingFieldsFor: TYPE });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("submitting calls the dialog's submit handler", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController();
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.click(screen.getByRole("button", { name: "Save fields" }));
    expect(dlg.submit).toHaveBeenCalledTimes(1);
  });

  it("clicking Cancel calls the dialog's own cancel (H4 — routes through the in-flight guard, not the raw prop)", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController();
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dlg.cancel).toHaveBeenCalledTimes(1);
  });

  /** Same wiring check as NewContentTypeDialog's own — see its comment. */
  it("attaches the hook's dialogRef to the dialog root, so useFocusTrap has an element to trap in (M3)", () => {
    const dlg = editDialogController();
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    expect(dlg.dialogRef.current).toBe(screen.getByRole("dialog"));
  });

  // The sibling NewContentTypeDialog describe has had this case since 7cd19b4a7; this dialog's
  // backdrop did not, so `onClick={cancel}` here could be reverted to the raw `onCancel` prop with
  // every test still green — the dismiss-while-saving guard would be gone on one of the two
  // dialogs only (verified 2026-09-20: that exact mutant survived the whole file).
  it("clicking the backdrop calls the dialog's own cancel, but clicking inside the dialog does not", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController();
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    await user.click(screen.getByRole("dialog"));
    expect(dlg.cancel).not.toHaveBeenCalled();
    await user.click(document.querySelector(".settings-dialog-backdrop")!);
    expect(dlg.cancel).toHaveBeenCalledTimes(1);
  });

  it("Cancel is disabled while saving, so a click can't reach the dialog's cancel (H4)", async () => {
    const user = userEvent.setup();
    const dlg = editDialogController({ saving: true });
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeDisabled();
    await user.click(cancelButton);
    expect(dlg.cancel).not.toHaveBeenCalled();
  });

  it("onSaved closes the dialog AND reloads the list — Collections passes both through, not just one", () => {
    const c = renderCollections({ editingFieldsFor: TYPE });
    (editDialogPropsRef.current as { onSaved: () => void }).onSaved();
    expect(c.setEditingFieldsFor).toHaveBeenCalledWith(null);
    expect(c.load).toHaveBeenCalledTimes(1);
  });
});

describe("LifecycleConfirmDialog", () => {
  it("renders when pendingLifecycle is set, using its op-derived copy and the content type's label", () => {
    renderCollections({ pendingLifecycle: { op: "deprecate", contentType: TYPE } });
    expect(screen.getByRole("heading", { name: "Deprecate content type" })).toBeInTheDocument();
    expect(screen.getByText("Recipe", { selector: "strong" })).toBeInTheDocument();
  });

  it("does not render when pendingLifecycle is null", () => {
    renderCollections({ pendingLifecycle: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses btn-warning for the deprecate confirm button", () => {
    renderCollections({ pendingLifecycle: { op: "deprecate", contentType: TYPE } });
    expect(screen.getByRole("button", { name: "Deprecate" })).toHaveClass("btn-warning");
  });

  it("uses btn-danger for the tombstone confirm button", () => {
    renderCollections({ pendingLifecycle: { op: "tombstone", contentType: TYPE } });
    expect(screen.getByRole("button", { name: "Tombstone" })).toHaveClass("btn-danger");
  });

  it("confirming calls runLifecycle(contentType, op) then setPendingLifecycle(null)", async () => {
    const user = userEvent.setup();
    const c = renderCollections({ pendingLifecycle: { op: "deprecate", contentType: TYPE } });
    await user.click(screen.getByRole("button", { name: "Deprecate" }));
    expect(c.runLifecycle).toHaveBeenCalledWith(TYPE, "deprecate");
    expect(c.setPendingLifecycle).toHaveBeenCalledWith(null);
  });

  it("canceling calls setPendingLifecycle(null) without calling runLifecycle", async () => {
    const user = userEvent.setup();
    const c = renderCollections({ pendingLifecycle: { op: "tombstone", contentType: TYPE } });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(c.setPendingLifecycle).toHaveBeenCalledWith(null);
    expect(c.runLifecycle).not.toHaveBeenCalled();
  });

  /** Same wiring check as NewContentTypeDialog's own — see its comment. */
  it("attaches the hook's dialogRef to the dialog root, so useFocusTrap has an element to trap in (M3)", () => {
    const dlg = lifecycleDialogController();
    lifecycleDialogRef.current = dlg;
    renderCollections({ pendingLifecycle: { op: "deprecate", contentType: TYPE } });
    expect(dlg.dialogRef.current).toBe(screen.getByRole("dialog"));
  });

  it("autoFocus reflects the hook's autoFocusCancel — cancel focused for tombstone", () => {
    lifecycleDialogRef.current = lifecycleDialogController({ autoFocusCancel: true, copy: { title: "Tombstone content type", body: "not reversible" } });
    renderCollections({ pendingLifecycle: { op: "tombstone", contentType: TYPE } });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("autoFocus reflects the hook's autoFocusCancel=false — confirm button focused for deprecate", () => {
    lifecycleDialogRef.current = lifecycleDialogController({ autoFocusCancel: false });
    renderCollections({ pendingLifecycle: { op: "deprecate", contentType: TYPE } });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Deprecate" }));
  });
});
