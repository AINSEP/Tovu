import { fireEvent, render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmailTemplateEditor } from "../EmailTemplateEditor";
import { PAGE_PREVIEW_IFRAME_SANDBOX } from "../../pages/rules";
import { createEditorController } from "./email-controller.test-helpers";
import { TEMPLATE } from "./email.test-helpers";
import { installInternalLinkInterceptor } from "../../../lib/router";

vi.mock("../../../hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => "en" }));

/** @file Editor controls, sandbox and browser unload/keyboard guards through the controller seam. */
describe("EmailTemplateEditor", () => {
  it.each(["back", "back icon", "sidebar"])("confirms %s navigation through Pages' dirty guard before the SPA changes routes", (source) => {
    const previous = window.location.href;
    window.history.replaceState(null, "", `/admin/email/templates/${TEMPLATE.id}`);
    const stop = installInternalLinkInterceptor();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const controller = createEditorController({ overrides: { dirty: true, html: "<p>Keep my edits</p>" } });
    const { unmount } = render(<>
      <nav><a href="/admin/pages">Pages sidebar</a></nav>
      <EmailTemplateEditor id={TEMPLATE.id} useEditorHook={() => controller} locale="en" />
    </>);
    try {
      fireEvent.click(screen.getByRole("tab", { name: "HTML" }));
      const link = screen.getByRole("link", { name: source === "sidebar" ? "Pages sidebar" : "Back: Templates" });
      const target = source === "back icon" ? link.firstElementChild! : link;
      fireEvent.click(target);
      expect(confirm).toHaveBeenCalledExactlyOnceWith("You have unsaved changes. Leave without saving?");
      expect(window.location.pathname).toBe(`/admin/email/templates/${TEMPLATE.id}`);
      expect(screen.getByLabelText("Template HTML")).toHaveValue("<p>Keep my edits</p>");
      confirm.mockReturnValue(true);
      fireEvent.click(target);
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(window.location.pathname + window.location.search).toBe(source === "sidebar" ? "/admin/pages" : "/admin/email?tab=templates");
      unmount();
      confirm.mockClear();
      fireEvent.click(document.body);
      expect(confirm).not.toHaveBeenCalled();
    } finally {
      unmount(); stop(); confirm.mockRestore();
      window.history.replaceState(null, "", previous);
    }
  });

  it("does not prompt on clean navigation after save", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    let controller = createEditorController({ overrides: { dirty: true } });
    const useEditorHook = () => controller;
    const { rerender, unmount } = render(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={useEditorHook} locale="en" />);
    controller = { ...controller, dirty: false, savedAt: TEMPLATE.updatedAt };
    rerender(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={useEditorHook} locale="en" />);
    const link = screen.getByRole("link", { name: "Back: Templates" });
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    try { fireEvent.click(link); expect(confirm).not.toHaveBeenCalled(); }
    finally { unmount(); confirm.mockRestore(); }
  });

  it.each([
    { event: { ctrlKey: true } }, { event: { metaKey: true } },
    { event: { shiftKey: true } }, { event: { altKey: true } },
    { event: { button: 1 } }, { target: "_blank" }, { download: true },
    { href: "https://example.com/admin/pages" }, { href: "#preview" },
  ])("keeps other-tab, download and external navigation outside the SPA guard (%j)", (options) => {
    const previous = window.location.href;
    window.history.replaceState(null, "", `/admin/email/templates/${TEMPLATE.id}`);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const controller = createEditorController({ overrides: { dirty: true } });
    const { unmount } = render(<>
      <a href={"href" in options ? options.href : "/admin/pages"} target={"target" in options ? options.target : undefined} download={"download" in options ? options.download : undefined}>Other destination</a>
      <EmailTemplateEditor id={TEMPLATE.id} useEditorHook={() => controller} locale="en" />
    </>);
    const link = screen.getByRole("link", { name: "Other destination" });
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    try {
      fireEvent.click(link, "event" in options ? options.event : {});
      expect(confirm).not.toHaveBeenCalled();
    } finally { unmount(); confirm.mockRestore(); window.history.replaceState(null, "", previous); }
  });

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
    await userEvent.click(screen.getByRole("tab", { name: "HTML" }));
    fireEvent.change(screen.getByLabelText("Template HTML"), { target: { value: "<p>Edit</p>" } });
    expect(controller.setHtml).toHaveBeenCalledWith("<p>Edit</p>");
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Renamed" } });
    fireEvent.blur(screen.getByLabelText("Template name"));
    expect(controller.setName).toHaveBeenCalledWith("Renamed");
    expect(controller.commitName).toHaveBeenCalledOnce();
  });

  it("shows the 409 advice and keeps the source visible", async () => {
    const error = "Someone else changed this template. Reload to get their version; copy your edits first.";
    const controller = createEditorController({ overrides: { dirty: true, html: "<p>Keep my edits</p>", saveError: error } });
    render(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={() => controller} locale="en" />);
    expect(screen.getByRole("alert")).toHaveTextContent(error);
    await userEvent.click(screen.getByRole("tab", { name: "HTML" }));
    expect(screen.getByLabelText("Template HTML")).toHaveValue("<p>Keep my edits</p>");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("lays out like the Pages editor: HTML | Preview tabs, device widths and As sent only on Preview", async () => {
    const controller = createEditorController({ overrides: { mode: "sent" } });
    render(<EmailTemplateEditor id={TEMPLATE.id} useEditorHook={() => controller} locale="en" />);
    expect(screen.getByRole("link", { name: "Back: Templates" })).toHaveAttribute("href", expect.stringContaining("/email?tab=templates"));
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Interactive" })).toBeNull();
    expect(screen.getByText("1280px")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(screen.getByText("390px")).toBeInTheDocument();
    const asSent = screen.getByRole("button", { name: "As sent" });
    expect(asSent).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(asSent);
    expect(controller.setMode).toHaveBeenCalledWith("admin");
    expect(screen.getByText("Fill-in fields (preview values)").closest("details")).toHaveAttribute("open");
    await userEvent.click(screen.getByRole("tab", { name: "HTML" }));
    expect(screen.getByLabelText("Template HTML")).toHaveValue(TEMPLATE.html);
    expect(screen.queryByTitle("Email preview")).toBeNull();
    expect(screen.queryByRole("button", { name: "As sent" })).toBeNull();
    expect(screen.queryByText("390px")).toBeNull();
  });
});
