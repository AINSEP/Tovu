import { render, screen, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/admin-http/request";
import type { MailCaptureClearAnswer } from "@jini-ai/admin/screens/email/email-api.types";
import { useEmailActivity, type CaptureClearState } from "@jini-ai/admin/screens/email/hooks/use-email-activity.hooks";
import { EmailActivityTab } from "../EmailActivityTab";
import { createTabHooks } from "./email-controller.test-helpers";
import { createEmailFake } from "./email.test-helpers";

/** @file "Clear test emails" in the Activity tab (bt2-todos clear-all-admin-ui): owner-only button, confirm card with the count, plain-words states. */
const PLAN = { count: 3, newestAt: "2026-11-24T10:00:00Z" };
const PREVIEW: MailCaptureClearAnswer = { cleared: false, confirmationRequired: true, plan: PLAN, revision: "3:2026-11-24T10:00:00Z" };
const BUTTON = "Clear test emails";

function renderTab({ canClear, state, locale = "en" }: { canClear: boolean; state: CaptureClearState; locale?: string }) {
  const controller = createTabHooks().activity();
  controller.capture = { ...controller.capture, canClear, state };
  render(<EmailActivityTab controller={controller} locale={locale} part="sends" />);
  return controller;
}

describe("Clear test emails, rendered", () => {
  it("shows no button, and no way to start, without the permission", () => {
    renderTab({ canClear: false, state: { kind: "idle" } });
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });

  it("starts the preview from the button, which is a real tap target in the Recent sends section", async () => {
    const controller = renderTab({ canClear: true, state: { kind: "idle" } });
    await userEvent.click(screen.getByRole("button", { name: BUTTON }));
    expect(controller.capture.start).toHaveBeenCalledOnce();
    expect(controller.capture.confirm).not.toHaveBeenCalled();
  });

  it("is disabled and says it is checking while the preview loads", () => {
    renderTab({ canClear: true, state: { kind: "checking" } });
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  });

  it("asks on a confirm card that names the count; Clear confirms, Cancel only cancels", async () => {
    const controller = renderTab({ canClear: true, state: { kind: "confirm", plan: PLAN, revision: "3:x", error: null, pending: false } });
    const dialog = await screen.findByRole("dialog", { name: "Clear all test emails?" });
    expect(dialog).toHaveTextContent("Test emails kept on this machine: 3.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(controller.capture.cancel).toHaveBeenCalledOnce();
    expect(controller.capture.confirm).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    expect(controller.capture.confirm).toHaveBeenCalledOnce();
  });

  it("shows a failed confirm inside the open card", async () => {
    renderTab({ canClear: true, state: { kind: "confirm", plan: PLAN, revision: "3:x", error: "Try again in a minute.", pending: false } });
    expect(await within(await screen.findByRole("dialog")).findByRole("alert")).toHaveTextContent("Try again in a minute.");
  });

  it.each([
    [{ kind: "empty" }, "status", "No test emails to clear"],
    [{ kind: "cleared", deleted: 3 }, "status", "Cleared 3 test emails."],
    [{ kind: "error", message: "The test emails changed. Review and confirm again." }, "alert", "The test emails changed. Review and confirm again."],
  ] as const)("says %j in plain words", (state, role, text) => {
    renderTab({ canClear: true, state });
    expect(screen.getByRole(role)).toHaveTextContent(text);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("translates the button and the confirm card", async () => {
    renderTab({ canClear: true, state: { kind: "confirm", plan: PLAN, revision: "3:x", error: null, pending: false }, locale: "es" });
    expect(await screen.findByRole("dialog", { name: "¿Borrar todos los correos de prueba?" })).toHaveTextContent("Correos de prueba guardados en esta máquina: 3.");
    expect(screen.getByText("Borrar correos de prueba")).toBeInTheDocument();
  });

  it("owner end to end: preview, then the confirm carries the previewed revision; Cancel deletes nothing", async () => {
    const clearCaptured = vi.fn<(options?: { confirm?: { revision: string } }) => Promise<MailCaptureClearAnswer>>(async () => PREVIEW);
    const api = { ...createEmailFake(), clearCaptured };
    function Harness({ permissions }: { permissions: string[] }) {
      return <EmailActivityTab controller={useEmailActivity({ api, ApiError }, { debounceMs: 0, permissions })} locale="en" part="sends" />;
    }
    const view = render(<Harness permissions={["mail.capture.clear"]} />);
    await userEvent.click(await screen.findByRole("button", { name: BUTTON }));
    let dialog = await screen.findByRole("dialog", { name: "Clear all test emails?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(clearCaptured).toHaveBeenCalledTimes(1);
    expect(clearCaptured).toHaveBeenCalledWith();
    await userEvent.click(screen.getByRole("button", { name: BUTTON }));
    dialog = await screen.findByRole("dialog", { name: "Clear all test emails?" });
    clearCaptured.mockResolvedValueOnce({ cleared: true, deleted: 3 });
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("Cleared 3 test emails.")).toBeInTheDocument();
    expect(clearCaptured).toHaveBeenLastCalledWith({ confirm: { revision: PREVIEW.revision } });
    view.unmount();
    render(<Harness permissions={["mail.suppressions.manage"]} />);
    await screen.findByLabelText("Outcome");
    expect(screen.queryByRole("button", { name: BUTTON })).toBeNull();
  });
});
