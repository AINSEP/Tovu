import { render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminMailStatus } from "@/lib/api";
import { Email } from "../Email";
import type { EmailController, EmailStatusView } from "../hooks/use-email.hooks";
import { createTabHooks } from "./email-controller.test-helpers";

vi.mock("../../../admin-themes/use-admin-theme.hooks", () => ({ useAdminThemeBoundary: () => ({}) }));

/** @file Tab controllers are injected fakes: navigation and status tests make no mail requests. */
function renderEmail(required: { view: EmailStatusView; tabId?: string; overrides?: Partial<EmailController> }, _optional = {}) {
  const controller: EmailController = { view: required.view, locale: "en", retry: vi.fn(), ...required.overrides };
  const tabHooks = createTabHooks();
  return { ...render(<Email tabId={required.tabId} useEmailHook={() => controller} tabHooks={tabHooks} />), tabHooks };
}
const sectionTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
const originalUrl = window.location.href;
afterEach(() => window.history.replaceState(null, "", originalUrl));
const LOCAL: AdminMailStatus = { mailDeliveryAvailable: false, state: "degraded", lanes: [{ lane: "transactional", providerId: "local", state: "local_only" }, { lane: "bulk", providerId: "local", state: "local_only" }], warnings: ["sender_unknown"] };

describe("Email", () => {
  it("shows five ordered tabs and mounts only Overview by default", () => {
    const { tabHooks } = renderEmail({ view: { kind: "loading" } });
    expect(screen.getByRole("heading", { level: 1, name: "Email" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Overview", "Provider", "Sender & DNS", "Templates", "Activity"]);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(sectionTitles()).toEqual(["Status", "What uses email", "Send test email"]);
    expect(tabHooks.overview).toHaveBeenCalledOnce();
    for (const key of ["provider", "sender", "templates", "activity"] as const) expect(tabHooks[key]).not.toHaveBeenCalled();
  });

  it.each([
    ["overview", ["Status", "What uses email", "Send test email"]], ["provider", ["Provider"]],
    ["sender", ["Sender", "DNS"]], ["templates", ["Templates"]],
    ["activity", ["Recent sends", "Blocked addresses", "Bounce and spam reports"]],
    ["unknown", ["Status", "What uses email", "Send test email"]],
  ])("opens the %s tab from the URL", (tabId, titles) => {
    renderEmail({ view: { kind: "loaded", status: LOCAL }, tabId: tabId as string });
    expect(sectionTitles()).toEqual(titles);
    expect(screen.queryByText("Coming next")).not.toBeInTheDocument();
  });

  it("switching tabs replaces the query without adding history", async () => {
    window.history.replaceState(null, "", "/admin/email");
    const length = window.history.length;
    renderEmail({ view: { kind: "loaded", status: LOCAL } });
    await userEvent.click(screen.getByRole("tab", { name: "Sender & DNS" }));
    expect(window.location.pathname).toBe("/admin/email");
    expect(window.location.search).toBe("?tab=sender");
    expect(window.history.length).toBe(length);
  });

  it("shows real empty states and actions for Templates and Activity", () => {
    const { unmount } = renderEmail({ view: { kind: "loaded", status: LOCAL }, tabId: "templates" });
    expect(screen.getByText("No templates yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New template" })).toBeEnabled();
    unmount();
    renderEmail({ view: { kind: "loaded", status: LOCAL }, tabId: "activity" });
    expect(screen.getByText("No sends recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No blocked addresses.")).toBeInTheDocument();
  });

  it("shows the loading and forbidden status states", () => {
    const { unmount } = renderEmail({ view: { kind: "loading" } });
    expect(screen.getByRole("status")).toHaveTextContent("Loading email status…");
    unmount();
    renderEmail({ view: { kind: "forbidden" } });
    expect(screen.getByText("You don't have permission to view email status.")).toBeInTheDocument();
  });

  it("reports a failed status read with Retry, without calling it unconfigured", async () => {
    const retry = vi.fn();
    renderEmail({ view: { kind: "error" }, overrides: { retry } });
    expect(screen.getByRole("alert")).toHaveTextContent("Status unavailable");
    expect(screen.queryByText("Not set up")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows not configured, local-only, degraded and ready summaries truthfully", () => {
    const hooks = createTabHooks();
    let status: AdminMailStatus = { mailDeliveryAvailable: false, state: "unconfigured" };
    const useEmailHook = () => ({ view: { kind: "loaded" as const, status }, locale: "en", retry: vi.fn() });
    const { rerender } = render(<Email useEmailHook={useEmailHook} tabHooks={hooks} />);
    expect(screen.getByText("Not set up")).toBeInTheDocument();
    status = LOCAL;
    rerender(<Email useEmailHook={useEmailHook} tabHooks={hooks} />);
    expect(screen.getByText("No external delivery")).toBeInTheDocument();
    status = { mailDeliveryAvailable: true, state: "degraded" };
    rerender(<Email useEmailHook={useEmailHook} tabHooks={hooks} />);
    expect(screen.getByText("Some mail cannot be sent. Check the Provider and Sender & DNS tabs.")).toBeInTheDocument();
    status = { mailDeliveryAvailable: true, state: "ready", warnings: [] };
    rerender(<Email useEmailHook={useEmailHook} tabHooks={hooks} />);
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("This checks configuration only. It does not prove that mail arrives.")).toBeInTheDocument();
  });

  it("shows sender warnings and the editable sender fields", () => {
    renderEmail({ view: { kind: "loaded", status: LOCAL }, tabId: "sender" });
    expect(screen.getByText("No sender address is set.")).toBeInTheDocument();
    expect(screen.getByLabelText("From address")).toHaveValue("hello@example.com");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("translates status and tabs through the locale", () => {
    renderEmail({ view: { kind: "error" }, overrides: { locale: "es" } });
    expect(screen.getByRole("heading", { level: 1, name: "Correo electrónico" })).toBeInTheDocument();
    expect(screen.getByText("Estado no disponible")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Resumen", "Proveedor", "Remitente y DNS", "Plantillas", "Actividad"]);
  });
});
