import { fireEvent, render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmailTemplateEditor } from "../EmailTemplateEditor";
import { PAGE_PREVIEW_IFRAME_SANDBOX } from "../../pages/rules";
import { createEditorController } from "./email-controller.test-helpers";
import { TEMPLATE } from "./email.test-helpers";

vi.mock("../../../hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "en" }));

/** @file Editor controls, sandbox and browser unload/keyboard guards through the controller seam. */
describe("EmailTemplateEditor", () => {
  it("guards unsaved HTML, removes the guard after save, and cleans up on unmount", () => {
    let controller = createEditorController();
    const useEditorHook = () => controller;
    const { rerender, unmount } = render(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={useEditorHook} locale="en" />);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    controller = { ...controller, dirty: true };
    rerender(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={useEditorHook} locale="en" />);
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    controller = { ...controller, dirty: false, savedAt: TEMPLATE.updatedAt };
    rerender(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={useEditorHook} locale="en" />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    const saved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
    controller = { ...controller, dirty: true };
    rerender(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={useEditorHook} locale="en" />);
    unmount();
    const gone = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(gone);
    expect(gone.defaultPrevented).toBe(false);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])("saves on the platform shortcut %j and on the Save button", async (modifier) => {
    const controller = createEditorController({ overrides: { dirty: true } });
    render(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={() => controller} locale="en" />);
    const key = new KeyboardEvent("keydown", { key: "s", ...modifier, cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(controller.save).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(controller.save).toHaveBeenCalledTimes(2);
  });

  it("uses the Pages sandbox without same-origin access and wires preview mode and values", async () => {
    const controller = createEditorController();
    render(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={() => controller} locale="en" />);
    const iframe = screen.getByTitle("Email preview");
    expect(iframe).toHaveAttribute("sandbox", PAGE_PREVIEW_IFRAME_SANDBOX);
    expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(iframe).toHaveAttribute("srcdoc", controller.preview.data!.html);
    fireEvent.change(screen.getByLabelText("{{name}}"), { target: { value: "Bo" } });
    expect(controller.setValue).toHaveBeenCalledWith("name", "Bo");
    await userEvent.click(screen.getByRole("button", { name: "As sent" }));
    expect(controller.setMode).toHaveBeenCalledWith("sent");
    fireEvent.change(screen.getByLabelText("Template HTML"), { target: { value: "<p>Edit</p>" } });
    expect(controller.setHtml).toHaveBeenCalledWith("<p>Edit</p>");
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Renamed" } });
    fireEvent.blur(screen.getByLabelText("Template name"));
    expect(controller.setName).toHaveBeenCalledWith("Renamed");
    expect(controller.commitName).toHaveBeenCalledOnce();
  });

  it("shows the 409 advice and keeps the source visible", () => {
    const error = "Someone else changed this template. Reload to get their version; copy your edits first.";
    const controller = createEditorController({ overrides: { dirty: true, html: "<p>Keep my edits</p>", saveError: error } });
    render(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={() => controller} locale="en" />);
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    expect(screen.getByLabelText("Template HTML")).toHaveValue("<p>Keep my edits</p>");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
