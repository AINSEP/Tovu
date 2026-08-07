import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminMedia, type AdminWidget } from "../../lib/api";
import { EmbedInsertControl } from "../EmbedInsertControl/EmbedInsertControl";
import type { useEmbedInsertControl } from "../EmbedInsertControl/EmbedInsertControl.hooks";

/**
 * @file First test file for `EmbedInsertControl` (0% before this pass — no test file existed, even
 * though it sits on the Posts editor's live toolbar). Written against the CURRENT, pre-refactor
 * `lib/embed-insert-control.tsx` first, gotten green, and only then is the file split into
 * `components/EmbedInsertControl/EmbedInsertControl.tsx` + `.hooks.tsx` — the same discipline
 * `MediaPickerDialog.unit.test.tsx` used, so this suite is an equivalence check on the move rather
 * than a description of whatever the split happened to produce.
 *
 * `EmbedInsertControl` is a thin dispatcher over three already-tested pieces (`MediaPickerDialog`,
 * `WidgetPickerDialog`, `WidgetAddControl`) — these tests cover ITS OWN job (menu open/close, which
 * dialog each of the four choices opens, and that Form/Menu skip `WidgetAddControl`'s own type
 * `<Select>` entirely), not those components' internals again. Mocks the same `api` boundary
 * (`listMedia`/`listWidgets`) the components underneath already use, per this codebase's
 * established `vi.spyOn(api, …)` convention (`WidgetConfigFields.unit.test.tsx`,
 * `MediaPickerDialog.unit.test.tsx`).
 */

// The button's accessible name is its visible text content ("Embed"), not its `title` attribute —
// `title` only wins as an accessible-name fallback when there's no content, not the case here.
const EMBED_TRIGGER_NAME = "Embed";

function fakeEditor() {
  return {
    commands: {
      insertMediaRef: vi.fn().mockReturnValue(true),
      insertWidgetEmbed: vi.fn().mockReturnValue(true),
    },
  };
}

function mediaItem(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "m1",
    workspaceId: "w1",
    title: "Sunset",
    alt: "A sunset over water",
    caption: "",
    credit: "",
    sha256: "abc",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    ...overrides,
  };
}

function widget(overrides: Partial<AdminWidget> = {}): AdminWidget {
  return {
    id: "w1",
    workspaceId: "ws1",
    slug: "contact",
    title: "Contact widget",
    status: "active",
    widgetType: "contact-form",
    config: {},
    updatedAt: "2026-01-01",
    version: 1,
    ...overrides,
  };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: EMBED_TRIGGER_NAME }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EmbedInsertControl — no editor", () => {
  it("renders nothing when editor is null", () => {
    const { container } = render(<EmbedInsertControl editor={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("EmbedInsertControl — the Embed menu", () => {
  it("opens on click, listing all four choices, and is closed beforehand", async () => {
    const user = userEvent.setup();
    render(<EmbedInsertControl editor={fakeEditor()} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await openMenu(user);

    const menu = screen.getByRole("menu", { name: "Insert" });
    expect(screen.getByRole("menuitem", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Form" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Widget…" })).toBeInTheDocument();
    expect(menu).toBeInTheDocument();
  });

  it("toggles closed on a second click of the Embed trigger", async () => {
    const user = userEvent.setup();
    render(<EmbedInsertControl editor={fakeEditor()} />);

    await openMenu(user);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await openMenu(user);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("EmbedInsertControl — Media", () => {
  it("opens MediaPickerDialog, closes the menu, and selecting an asset inserts it on the public transform", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem()] });
    const editor = fakeEditor();
    render(<EmbedInsertControl editor={editor} />);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Media" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(await screen.findByTitle("Sunset"));

    expect(editor.commands.insertMediaRef).toHaveBeenCalledWith({
      assetId: "m1",
      transformName: "public",
      alt: "A sunset over water",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("EmbedInsertControl — Form / Menu shortcuts skip the type <Select>", () => {
  it("Form pins the picker straight to contact-form on one click — no WidgetAddControl type chooser appears", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listWidgets").mockResolvedValue({ widgets: [] });
    render(<EmbedInsertControl editor={fakeEditor()} />);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Form" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    // The dialog's own title is scoped by the pinned type, reached in one click — proves `Form`
    // drove `setPickerType("contact-form")` directly rather than landing on a type-choice step.
    expect(await screen.findByRole("heading", { name: "Place a Contact Form widget" })).toBeInTheDocument();
    // `WidgetAddControl`'s own type-select carries this exact accessible name (`aria-label="Widget
    // type"`) and only renders on the "Widget…" full-flow path, never here.
    expect(screen.queryByRole("combobox", { name: "Widget type" })).not.toBeInTheDocument();
  });

  it("Menu pins the picker straight to menu on one click", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listWidgets").mockResolvedValue({ widgets: [] });
    render(<EmbedInsertControl editor={fakeEditor()} />);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Menu" }));

    expect(await screen.findByRole("heading", { name: "Place a Menu widget" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Widget type" })).not.toBeInTheDocument();
  });

  it("Form: selecting an existing contact-form widget inserts it and closes the dialog", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listWidgets").mockResolvedValue({ widgets: [widget({ id: "cf1", title: "Contact widget" })] });
    const editor = fakeEditor();
    render(<EmbedInsertControl editor={editor} />);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Form" }));

    const combobox = await screen.findByRole("combobox", { name: /existing contact form widgets/i });
    await user.click(combobox);
    await user.click(screen.getByRole("option", { name: "Contact widget" }));
    await user.click(screen.getByRole("button", { name: "Use this widget" }));

    await waitFor(() => expect(editor.commands.insertWidgetEmbed).toHaveBeenCalledTimes(1));
    const [attrs] = editor.commands.insertWidgetEmbed.mock.calls[0] as [{ widgetEntryId: string; placementId: string }];
    expect(attrs.widgetEntryId).toBe("cf1");
    expect(attrs.placementId).toBeTruthy();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mints a fresh placementId per insertion — two inserts never reuse the same id", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listWidgets").mockResolvedValue({ widgets: [widget({ id: "menu1", title: "Main nav", widgetType: "menu" })] });
    const editor = fakeEditor();
    render(<EmbedInsertControl editor={editor} />);

    for (let i = 0; i < 2; i++) {
      await openMenu(user);
      await user.click(screen.getByRole("menuitem", { name: "Menu" }));
      const combobox = await screen.findByRole("combobox", { name: /existing menu widgets/i });
      await user.click(combobox);
      await user.click(screen.getByRole("option", { name: "Main nav" }));
      await user.click(screen.getByRole("button", { name: "Use this widget" }));
      await waitFor(() => expect(editor.commands.insertWidgetEmbed).toHaveBeenCalledTimes(i + 1));
    }

    const [firstAttrs] = editor.commands.insertWidgetEmbed.mock.calls[0] as [{ placementId: string }];
    const [secondAttrs] = editor.commands.insertWidgetEmbed.mock.calls[1] as [{ placementId: string }];
    expect(firstAttrs.placementId).not.toBe(secondAttrs.placementId);
  });
});

describe("EmbedInsertControl — Widget…", () => {
  it("switches the menu to the full WidgetAddControl flow, with its own type <Select>", async () => {
    const user = userEvent.setup();
    render(<EmbedInsertControl editor={fakeEditor()} />);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Widget…" }));

    expect(screen.queryByRole("menuitem", { name: "Media" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Insert widget" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Widget type" })).toBeInTheDocument();
  });
});

function fakeAddControl(overrides: Partial<ReturnType<typeof useEmbedInsertControl>["formControl"]> = {}) {
  return {
    pickerType: null,
    setPickerType: vi.fn(),
    selectedType: "text" as const,
    setSelectedType: vi.fn(),
    error: null,
    handleCreateNew: vi.fn(),
    handleUseExisting: vi.fn(),
    ...overrides,
  };
}

describe("EmbedInsertControl — useEmbed injection", () => {
  it("renders entirely off an injected useEmbed — the menu opens without a single click", () => {
    // The real `useEmbedInsertControl` starts `open: false`, only flipped by clicking "Embed" (see
    // the "opens on click" test above). Rendering with `open: true` here, with NO click at all, is
    // reachable only if the component actually reads through the `useEmbed` prop rather than the
    // hardcoded default.
    const fakeUseEmbed: typeof useEmbedInsertControl = () => ({
      open: true,
      setOpen: vi.fn(),
      widgetMode: false,
      setWidgetMode: vi.fn(),
      mediaPicking: false,
      setMediaPicking: vi.fn(),
      formControl: fakeAddControl(),
      menuControl: fakeAddControl(),
      insertWidget: vi.fn(),
    });

    render(<EmbedInsertControl editor={fakeEditor()} useEmbed={fakeUseEmbed} />);

    expect(screen.getByRole("menu", { name: "Insert" })).toBeInTheDocument();
  });

  it("an injected mediaPicking: true renders MediaPickerDialog without ever clicking Media", () => {
    // `MediaPickerDialog` is still the REAL component here (only `EmbedInsertControl`'s own
    // `useEmbed` is faked) — it mounts and fetches on its own via its own hook regardless, so this
    // test isn't about suppressing that call, only about proving `EmbedInsertControl` itself never
    // clicked "Media" to get here: `mediaPicking` starts `false` on every real render (see the
    // "no editor"/"opens on click" tests above), so a mounted dialog with zero clicks is reachable
    // only through the injected `true`.
    vi.spyOn(api, "listMedia").mockReturnValue(new Promise(() => {}));
    const fakeUseEmbed: typeof useEmbedInsertControl = () => ({
      open: false,
      setOpen: vi.fn(),
      widgetMode: false,
      setWidgetMode: vi.fn(),
      mediaPicking: true,
      setMediaPicking: vi.fn(),
      formControl: fakeAddControl(),
      menuControl: fakeAddControl(),
      insertWidget: vi.fn(),
    });

    render(<EmbedInsertControl editor={fakeEditor()} useEmbed={fakeUseEmbed} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders formControl's and menuControl's error slots independently — WidgetShortcutPicker direct coverage", () => {
    // Neither `formControl.error` nor `menuControl.error` was exercised by any test above (the
    // complexity-ceiling pass extracted this ternary pair into `WidgetShortcutPicker`, used once
    // per control) — added per that pass's "every extracted unit gets its own direct unit test"
    // rule. Both set at once, with distinct text, to prove each renders off its own control rather
    // than one shared error slot.
    const fakeUseEmbed: typeof useEmbedInsertControl = () => ({
      open: false,
      setOpen: vi.fn(),
      widgetMode: false,
      setWidgetMode: vi.fn(),
      mediaPicking: false,
      setMediaPicking: vi.fn(),
      formControl: fakeAddControl({ error: "failed to create form widget" }),
      menuControl: fakeAddControl({ error: "failed to create menu widget" }),
      insertWidget: vi.fn(),
    });

    render(<EmbedInsertControl editor={fakeEditor()} useEmbed={fakeUseEmbed} />);

    expect(screen.getByText("failed to create form widget")).toBeInTheDocument();
    expect(screen.getByText("failed to create menu widget")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
