import { render, screen, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { MailTestSendResult } from "../email-api";
import { EmailProviderTab, segmentLabel, shownProviderId } from "../EmailProviderTab";
import { EmailSenderTab } from "../EmailSenderTab";
import { EmailOverviewTab } from "../EmailOverviewTab";
import { EmailActivityTab } from "../EmailActivityTab";
import { EmailTemplatesTab } from "../EmailTemplatesTab";
import { useEmailProvider } from "../hooks/use-email-provider.hooks";
import { useEmailSender } from "../hooks/use-email-sender.hooks";
import { useEmailActivity } from "../hooks/use-email-activity.hooks";
import { createTabHooks } from "./email-controller.test-helpers";
import { ACTIVITY, AT, BLOCK, createEmailFake, DNS, PLAN, PROVIDER, TEMPLATE } from "./email.test-helpers";

/** @file User actions reach injected ports; provider declarations and DNS verdicts stay truthful. */
describe("Email tab components", () => {
  it("renders only declared key fields, hides secrets, saves without switching and disables an unselectable provider", async () => {
    const api = createEmailFake();
    function Harness() { return <EmailProviderTab controller={useEmailProvider({ api })} status={null} locale="en" />; }
    render(<Harness />);
    const key = await screen.findByLabelText("Access key");
    expect(key).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Server URL")).toHaveAttribute("type", "url");
    expect(screen.queryByLabelText("Username")).toBeNull();
    expect(screen.getByRole("link", { name: "Where do I get a key?" })).toHaveAttribute("href", PROVIDER.setup.helpUrl);
    expect(screen.getByRole("button", { name: "Use this provider" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(key).toHaveAttribute("type", "text");
    await userEvent.type(key, "secret");
    await userEvent.click(screen.getByRole("button", { name: "Save key" }));
    expect(await screen.findByText("Key saved.")).toBeInTheDocument();
    expect(key).toHaveValue("");
    expect(api.saveProviderKey).toHaveBeenCalledExactlyOnceWith({ providerId: PROVIDER.id, input: { token: "secret" } });
    expect(api.activateProvider).not.toHaveBeenCalled();
  });

  it("asks before switching both lanes and suppresses switch for a fully active provider", async () => {
    const hooks = createTabHooks();
    const controller = hooks.provider({});
    const active = { ...PROVIDER, lanes: ["transactional", "bulk"] as const, credential: { required: true, saved: true }, selectable: true };
    controller.view = { kind: "loaded", data: { setting: { transactional: active.id, bulk: active.id }, providers: [active], refusals: [] } };
    const { rerender } = render(<EmailProviderTab controller={controller} status={null} locale="en" />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByLabelText("Access key")).toHaveAttribute("placeholder", "Saved — enter a new key to replace it");
    expect(screen.queryByRole("button", { name: "Use this provider" })).toBeNull();
    const selectable = { ...active, lanes: [] };
    controller.view = { kind: "loaded", data: { setting: { transactional: null, bulk: null }, providers: [selectable], refusals: [] } };
    rerender(<EmailProviderTab controller={controller} status={null} locale="en" />);
    await userEvent.click(screen.getByRole("button", { name: "Use this provider" }));
    expect(controller.askSwitch).toHaveBeenCalledWith(selectable);
    expect(controller.confirmSwitch).not.toHaveBeenCalled();
    controller.pendingSwitch = selectable;
    rerender(<EmailProviderTab controller={controller} status={null} locale="en" />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("All email — sign-in links, confirmations, notifications and newsletters — will send with Hosted Mail.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Switch" }));
    expect(controller.confirmSwitch).toHaveBeenCalledOnce();
  });

  it("shows one provider card at a time behind a segment per installed provider, defaulting to the active one", async () => {
    const controller = createTabHooks().provider({});
    const smtp = { ...PROVIDER, id: "smtp", label: "SMTP server" };
    const local = { ...PROVIDER, id: "local", label: "Console (local development, sends nothing)", hosted: false };
    const hosted = { ...PROVIDER, id: "hosted", label: "Hosted Mail", lanes: ["transactional", "bulk"] as const, selectable: true };
    controller.view = { kind: "loaded", data: { setting: { transactional: "hosted", bulk: "hosted" }, providers: [smtp, local, hosted], refusals: [] } };
    const onSelect = vi.fn();
    const { rerender } = render(<EmailProviderTab controller={controller} status={null} locale="en" onSelect={onSelect} />);
    const group = screen.getByRole("radiogroup", { name: "Provider" });
    expect(within(group).getAllByRole("radio").map((radio) => radio.closest("label")?.textContent)).toEqual(["SMTP server", "Console", "Hosted Mail"]);
    expect(screen.getByRole("radio", { name: "Hosted Mail" })).toBeChecked();
    expect(Array.from(document.querySelectorAll(".email-provider .email-provider-name"), (name) => name.textContent)).toEqual(["Hosted Mail"]);
    expect(screen.getByText("Active")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Console" }));
    expect(onSelect).toHaveBeenCalledWith("local");
    rerender(<EmailProviderTab controller={controller} status={null} locale="en" selectedId="local" onSelect={onSelect} />);
    expect(screen.getByRole("radio", { name: "Console" })).toBeChecked();
    expect(screen.getByText("Console (local development, sends nothing)")).toBeInTheDocument();
    expect(screen.queryByText("Active")).toBeNull();
  });

  it("picks the shown provider and its segment name without vendor branches", () => {
    const a = { ...PROVIDER, id: "a" };
    const b = { ...PROVIDER, id: "b", lanes: ["transactional"] as const };
    const c = { ...PROVIDER, id: "c", lanes: ["transactional", "bulk"] as const };
    expect(shownProviderId([a, b, c], "a")).toBe("a");
    expect(shownProviderId([a, b, c], "gone")).toBe("c");
    expect(shownProviderId([a, b], null)).toBe("b");
    expect(shownProviderId([a], undefined)).toBe("a");
    expect(shownProviderId([], "a")).toBeUndefined();
    expect(segmentLabel("Console (local development, sends nothing)")).toBe("Console");
    expect(segmentLabel("SMTP server")).toBe("SMTP server");
    expect(segmentLabel("(odd)")).toBe("(odd)");
  });

  it("shows DNS expected/observed values, treats unknown separately from mismatch, and saves sender explicitly", async () => {
    const api = createEmailFake();
    function Harness() { return <EmailSenderTab controller={useEmailSender({ api })} locale="en" />; }
    render(<Harness />);
    const name = await screen.findByDisplayValue("Example");
    expect(screen.getByText("Mismatch")).toHaveClass("status-error");
    expect(screen.getByText("Unknown")).toHaveClass("status-neutral");
    expect(screen.getByText(DNS.dns!.records[0]!.expected)).toBeInTheDocument();
    expect(screen.getByText("v=spf1 -all")).toBeInTheDocument();
    expect(screen.getByText("The provider is still verifying")).toBeInTheDocument();
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    try {
      await user.click(screen.getByRole("button", { name: "Copy: TXT host" }));
      expect(writeText).toHaveBeenCalledWith("example.com");
      await user.click(screen.getByRole("button", { name: "Copy: TXT value" }));
      expect(writeText).toHaveBeenLastCalledWith(DNS.dns!.records[0]!.expected);
    } finally { writeText.mockRestore(); }
    await userEvent.clear(name);
    await userEvent.type(name, "New name");
    expect(api.saveSender).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(api.saveSender).toHaveBeenCalledExactlyOnceWith({ key: "senderName", value: "New name" });
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(api.verifyDns).toHaveBeenCalledOnce();
  });

  it.each([
    ["accepted", "Accepted by the provider for ada@example.com."], ["captured", "Kept on this machine — nothing was sent."],
    ["redirected", "Test mode sent it to test@example.com instead."], ["failed", "Not sent. Refused"], ["unknown", "Not sent. Refused"],
  ] as const)("renders %s test-send copy", (outcome, text) => {
    const controller = createTabHooks().overview();
    const result = { to: BLOCK.address, from: "hello@example.com", driver: "hosted", at: AT, outcome, providerMessageId: "msg-1", where: "console", redirectedTo: "test@example.com", errorCode: "REFUSED", message: "Refused", retryable: false } as MailTestSendResult;
    controller.test = { kind: "done", result };
    render(<EmailOverviewTab controller={controller} locale="en" />);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });

  it("wires recipient/outcome filters and load more, while showing partly hidden addresses", async () => {
    const controller = createTabHooks().activity();
    controller.activity.view = { kind: "loaded", data: { items: [ACTIVITY], nextCursor: "next", empty: null, access: "masked" } };
    render(<EmailActivityTab controller={controller} locale="en" />);
    // Standalone (no `part`, no segmented pill above): every section keeps its heading.
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Recent sends", "Blocked addresses", "Bounce and spam reports"]);
    expect(screen.getByText("Addresses are partly hidden for your role.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Outcome"), "failed");
    expect(controller.setFilter).toHaveBeenLastCalledWith({ outcome: "failed" });
    await userEvent.type(screen.getByLabelText("Recipient"), "a");
    expect(controller.setFilter).toHaveBeenLastCalledWith({ recipient: "a" });
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(controller.activity.loadMore).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(controller.toggleDetail).toHaveBeenCalledWith(ACTIVITY.id);
  });

  it("requires reason then confirmation in the rendered unblock dialog and shows the owner-only refusal", async () => {
    const api = createEmailFake();
    api.listSuppressions.mockResolvedValue({ items: [BLOCK], nextCursor: null, empty: null });
    api.removeSuppression.mockResolvedValueOnce({ removed: false, confirmationRequired: true, plan: PLAN });
    function Harness() { return <EmailActivityTab controller={useEmailActivity({ api }, { debounceMs: 0 })} locale="en" />; }
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Unblock" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Say why this address may get email again.");
    expect(api.removeSuppression).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Reason (kept in the record)"), PLAN.reason);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const dialog = await screen.findByRole("dialog", { name: "Unblock this address?" });
    expect(dialog).toHaveTextContent(PLAN.warnings[0]!);
    expect(api.removeSuppression).toHaveBeenCalledTimes(1);
    api.removeSuppression.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    await userEvent.click(within(dialog).getByRole("button", { name: "Unblock" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only the site owner can remove a block.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lists template subjects/fields and exposes New, Rename and Trash through the shared menu", async () => {
    const controller = createTabHooks().templates({});
    controller.view = { kind: "loaded", data: { templates: [TEMPLATE] } };
    render(<EmailTemplatesTab controller={controller} locale="en" />);
    expect(screen.getByRole("link", { name: TEMPLATE.name })).toHaveAttribute("href", "/admin/email/templates/template-1");
    expect(screen.getByText(TEMPLATE.subject)).toBeInTheDocument();
    expect(screen.getByText("{{name}}")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "New template" }));
    expect(controller.create).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: 'Actions for "Welcome"' }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(controller.startRename).toHaveBeenCalledWith(TEMPLATE);
    await userEvent.click(screen.getByRole("button", { name: 'Actions for "Welcome"' }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Move to trash" }));
    expect(controller.setPendingTrash).toHaveBeenCalledWith(TEMPLATE);
    expect(controller.confirmTrash).not.toHaveBeenCalled();
  });
});
