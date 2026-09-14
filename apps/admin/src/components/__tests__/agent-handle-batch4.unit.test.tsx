import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../lib/api";
import { EmbedInsertControl } from "../EmbedInsertControl/EmbedInsertControl";
import { ChatFab } from "../ChatFab/ChatFab";

/**
 * @file Batch 4 of the shared `components/` pass-through `agentHandle` prop: `EmbedInsertControl`
 * (a thin dispatcher over the already-covered `MediaPickerDialog`/`WidgetPickerDialog`/
 * `WidgetAddControl` from batch 3, so this pins ITS OWN job — deriving the four menu-item handles
 * and forwarding sub-bases to the dialogs it opens, not those dialogs' internals again) and
 * `ChatFab` (a single-button component: the base handle applies directly, no suffix).
 */

const AGENT_ELEMENT = "data-agent-element";

function fakeEditor() {
  return { commands: { insertMediaEmbed: vi.fn().mockReturnValue(true), insertWidgetEmbed: vi.fn().mockReturnValue(true) } };
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Embed" }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EmbedInsertControl agentHandle", () => {
  it("omits data-agent-* on the trigger and every menu item when agentHandle is not passed", async () => {
    const user = userEvent.setup();
    render(<EmbedInsertControl editor={fakeEditor()} />);
    expect(screen.getByRole("button", { name: "Embed" })).not.toHaveAttribute(AGENT_ELEMENT);

    await openMenu(user);
    expect(screen.getByRole("menuitem", { name: "Media" })).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the trigger directly under the base, and each menu item under a literal action name", async () => {
    const user = userEvent.setup();
    render(<EmbedInsertControl editor={fakeEditor()} agentHandle="post-embed" />);
    expect(screen.getByRole("button", { name: "Embed" })).toHaveAttribute(AGENT_ELEMENT, "post-embed");

    await openMenu(user);
    expect(screen.getByRole("menuitem", { name: "Media" })).toHaveAttribute(AGENT_ELEMENT, "post-embed-media");
    expect(screen.getByRole("menuitem", { name: "Form" })).toHaveAttribute(AGENT_ELEMENT, "post-embed-form");
    expect(screen.getByRole("menuitem", { name: "Menu" })).toHaveAttribute(AGENT_ELEMENT, "post-embed-menu");
    expect(screen.getByRole("menuitem", { name: "Widget…" })).toHaveAttribute(AGENT_ELEMENT, "post-embed-widget");
  });

  it("forwards <base>-media-dialog into the opened MediaPickerDialog's own Cancel button", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMedia").mockReturnValue(new Promise(() => {})); // never resolves — Cancel renders regardless
    render(<EmbedInsertControl editor={fakeEditor()} agentHandle="post-embed" />);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Media" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(AGENT_ELEMENT, "post-embed-media-dialog-cancel");
  });

  it("forwards <base>-form-dialog into the WidgetPickerDialog opened by the Form shortcut", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listWidgets").mockResolvedValue({ widgets: [] });
    render(<EmbedInsertControl editor={fakeEditor()} agentHandle="post-embed" />);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Form" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute(AGENT_ELEMENT, "post-embed-form-dialog-new-title");
  });

  it("forwards <base>-widget-control into WidgetAddControl once Widget… is picked", async () => {
    const user = userEvent.setup();
    render(<EmbedInsertControl editor={fakeEditor()} agentHandle="post-embed" />);

    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Widget…" }));
    expect(screen.getByRole("combobox", { name: "Widget type" })).toHaveAttribute(AGENT_ELEMENT, "post-embed-widget-control-type");
    expect(screen.getByRole("button", { name: "Insert widget" })).toHaveAttribute(AGENT_ELEMENT, "post-embed-widget-control-open");
  });
});

describe("ChatFab agentHandle", () => {
  it("omits data-agent-* when agentHandle is not passed", () => {
    render(<ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} />);
    expect(screen.getByRole("button")).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the FAB button directly under the caller's base handle (no suffix)", () => {
    render(<ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} agentHandle="assistant-fab" />);
    expect(screen.getByRole("button")).toHaveAttribute(AGENT_ELEMENT, "assistant-fab");
  });
});
