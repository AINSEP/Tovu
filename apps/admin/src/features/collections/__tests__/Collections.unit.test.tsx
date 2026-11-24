import { fireEvent, render, screen, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Collections } from "../CollectionsScreen";
import type { CollectionsController } from "@jini-ai/admin/screens/collections/hooks/use-collections.hooks";
import type { NewContentTypeDialogController } from "@jini-ai/admin/screens/collections/hooks/use-new-content-type-dialog.hooks";
import type { EditFieldsDialogController } from "@jini-ai/admin/screens/collections/hooks/use-edit-fields-dialog.hooks";
import type { LifecycleConfirmDialogController } from "@jini-ai/admin/screens/collections/hooks/use-lifecycle-confirm-dialog.hooks";
import type { AdminContentType } from "@jini-ai/admin/screens/collections/api/collections-api.types";

/**
 * @file The host-composed `Collections` route (design-spec.md §1, ADR-022/ADR-043) — the dialog
 * behaviour that depends on THIS host's real kit `Dialog` (native `<dialog>` modality, backdrop and
 * Escape dismissal, initial focus). The screen's own behaviour (list states, row menu, embed copy,
 * dialog wiring) is tested with a fake kit in `@jini-ai/admin`'s
 * `screens/collections/__tests__/Collections.unit.test.tsx`.
 *
 * `Collections` itself is driven through the injectable `useCollectionsHook` seam (same
 * convention as `Pages.tsx`/`Recovery.tsx`). The three dialogs each declare their own `use*Hook`
 * seam too; `Collections.dialogHooks` threads the controller fakes through to each dialog,
 * reaching every dialog state without a real `fetch` or module mocks.
 */

    // Substitutes the zero-deps wrapper `NewContentTypeDialog`'s default prop points at post-
    // `useWiredX` conversion — was `useNewContentTypeDialog` (the pure, deps-taking hook) before; a
    // call-site rename of what gets intercepted, not a behavior or assertion change.
    // Substitutes the zero-port wrapper `EditFieldsDialog`'s default prop points at post-`useWiredX`
    // conversion — was `useEditFieldsDialog` (the pure, port-taking hook) before; a call-site
    // rename of what gets intercepted, not a behavior or assertion change.
const newDialogRef = { current: null as unknown };
const newDialogPropsRef = { current: null as unknown };
const editDialogRef = { current: null as unknown };
const editDialogPropsRef = { current: null as unknown };
const lifecycleDialogRef = { current: null as unknown };
const lifecycleDialogPropsRef = { current: null as unknown };

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
    t: ({ key }: { key: string }, _optional = {}) => key,
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
    ...overrides,
  };
}

function lifecycleDialogController(overrides: Partial<LifecycleConfirmDialogController> = {}): LifecycleConfirmDialogController {
  return {
    copy: { title: "Deprecate content type", body: "Existing entries stay readable; no new entries can be created." },
    autoFocusCancel: false,
    ...overrides,
  };
}

beforeEach(() => {
  newDialogRef.current = newDialogController();
  editDialogRef.current = editDialogController();
  lifecycleDialogRef.current = lifecycleDialogController();
  lifecycleDialogPropsRef.current = null;
});

function renderCollections(overrides: Partial<CollectionsController> = {}) {
  const c = collectionsController(overrides);
  const useCollectionsHook = () => c;
  render(<Collections useCollectionsHook={useCollectionsHook} dialogHooks={{
    useNewContentTypeDialogHook: (props) => { newDialogPropsRef.current = props; return newDialogRef.current as NewContentTypeDialogController; },
    useEditFieldsDialogHook: (props) => { editDialogPropsRef.current = props; return editDialogRef.current as EditFieldsDialogController; },
    useLifecycleConfirmDialogHook: (props) => { lifecycleDialogPropsRef.current = props; return lifecycleDialogRef.current as LifecycleConfirmDialogController; },
  }} />);
  return c;
}

describe("NewContentTypeDialog", () => {

  // Historically M3 required attaching the hook's ref to the real dialog: hook-only harnesses
  // stayed green when that wiring was missing (verified 2026-09-20). Native modality must likewise
  // be asserted on the real dialog, not assumed from controller-only tests.
  it("renders an open native dialog so the browser owns modality (M3)", () => {
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    expect(screen.getByRole("dialog").tagName).toBe("DIALOG");
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("clicking the backdrop calls the dialog's own cancel, but clicking inside the dialog does not", async () => {
    const user = userEvent.setup();
    const dlg = newDialogController();
    newDialogRef.current = dlg;
    renderCollections({ showNewDialog: true });
    await user.click(screen.getByRole("dialog").querySelector("h2")!);
    expect(dlg.cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("dialog"));
    expect(dlg.cancel).toHaveBeenCalledTimes(1);
  });

});

describe("EditFieldsDialog", () => {

  /** Same wiring check as NewContentTypeDialog's own — see its comment. */
  it("renders an open native dialog so the browser owns modality (M3)", () => {
    const dlg = editDialogController();
    editDialogRef.current = dlg;
    renderCollections({ editingFieldsFor: TYPE });
    expect(screen.getByRole("dialog").tagName).toBe("DIALOG");
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
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
    await user.click(screen.getByRole("dialog").querySelector("h2")!);
    expect(dlg.cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("dialog"));
    expect(dlg.cancel).toHaveBeenCalledTimes(1);
  });

});

describe("LifecycleConfirmDialog", () => {

  it("closing the dialog (Escape) cancels the pending lifecycle change", () => {
    const c = renderCollections({ pendingLifecycle: { op: "deprecate", contentType: TYPE } });
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(c.setPendingLifecycle).toHaveBeenCalledWith(null);
    expect(c.runLifecycle).not.toHaveBeenCalled();
  });

  /** Same wiring check as NewContentTypeDialog's own — see its comment. */
  it("renders an open native dialog so the browser owns modality (M3)", () => {
    const dlg = lifecycleDialogController();
    lifecycleDialogRef.current = dlg;
    renderCollections({ pendingLifecycle: { op: "deprecate", contentType: TYPE } });
    expect(screen.getByRole("dialog").tagName).toBe("DIALOG");
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("autoFocus reflects the hook's autoFocusCancel — cancel focused for tombstone", () => {
    lifecycleDialogRef.current = lifecycleDialogController({ autoFocusCancel: true, copy: { title: "Delete content type", body: "not reversible" } });
    renderCollections({ pendingLifecycle: { op: "tombstone", contentType: TYPE } });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  });

  it("autoFocus reflects the hook's autoFocusCancel=false — confirm button focused for deprecate", () => {
    lifecycleDialogRef.current = lifecycleDialogController({ autoFocusCancel: false });
    renderCollections({ pendingLifecycle: { op: "deprecate", contentType: TYPE } });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Deprecate" }));
  });
});
