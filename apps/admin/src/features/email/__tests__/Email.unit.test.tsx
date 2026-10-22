import { render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminMailStatus } from "@/lib/api";
import { Email } from "../Email";
import type { EmailController, EmailStatusView } from "../hooks/use-email.hooks";

/**
 * @file The Email screen for each controller state, through the `useEmailHook` seam. The hook's own
 * load behavior is `use-email.unit.test.ts`.
 */

function renderEmail(view: EmailStatusView, overrides: Partial<EmailController> = {}, tabId: string | null = null) {
  const controller: EmailController = { view, locale: "en", retry: () => {}, ...overrides };
  return render(<Email tabId={tabId} useEmailHook={() => controller} />);
}

const sectionTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);

const originalUrl = window.location.href;
afterEach(() => window.history.replaceState(null, "", originalUrl));

const LOCAL: AdminMailStatus = {
  mailDeliveryAvailable: false,
  state: "degraded",
  lanes: [{ lane: "transactional", providerId: "local", state: "local_only" }, { lane: "bulk", providerId: "local", state: "local_only" }],
  warnings: ["sender_unknown"],
  providers: [{ id: "local", label: "Local log", hosted: false, origin: "core" }, { id: "hosted", label: "Hosted Mail", hosted: true, origin: "plugin" }],
  refusals: ["broken-plugin: missing export"],
};

describe("Email", () => {
  it("shows the five tabs in order and opens Overview by default", () => {
    renderEmail({ kind: "loading" });
    expect(screen.getByRole("heading", { level: 1, name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Email" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Overview", "Provider", "Sender & DNS", "Templates", "Activity"]);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(sectionTitles()).toEqual(["Status", "What uses email", "Send test email"]);
  });

  it.each([
    ["overview", ["Status", "What uses email", "Send test email"]],
    ["provider", ["Provider"]],
    ["sender", ["Sender", "DNS"]],
    ["templates", ["Templates"]],
    ["activity", ["Activity"]],
    ["unknown", ["Status", "What uses email", "Send test email"]],
  ])("opens the %s tab from the URL", (tabId, titles) => {
    renderEmail({ kind: "loaded", status: LOCAL }, {}, tabId);
    expect(sectionTitles()).toEqual(titles);
  });

  it("switching tabs writes ?tab= into the URL without adding history", async () => {
    window.history.replaceState(null, "", "/admin/email");
    const length = window.history.length;
    renderEmail({ kind: "loaded", status: LOCAL });
    await userEvent.click(screen.getByRole("tab", { name: "Sender & DNS" }));
    expect(window.location.pathname).toBe("/admin/email");
    expect(window.location.search).toBe("?tab=sender");
    expect(window.history.length).toBe(length);
  });

  it("says Coming next on Templates and Activity", () => {
    renderEmail({ kind: "loaded", status: LOCAL }, {}, "templates");
    expect(screen.getByText("HTML email templates you or the assistant edit like Pages, with a live preview.")).toBeInTheDocument();
    renderEmail({ kind: "loaded", status: LOCAL }, {}, "activity");
    expect(screen.getByText("Recent sends, failures, bounces and blocked addresses.")).toBeInTheDocument();
  });

  it("shows the status read's error with Retry on a data tab until it loads, never an empty card", () => {
    renderEmail({ kind: "error" }, {}, "provider");
    expect(screen.getByRole("alert")).toHaveTextContent("Status unavailable");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows a loading line while the status is read", () => {
    renderEmail({ kind: "loading" });
    expect(screen.getByRole("status")).toHaveTextContent("Loading email status…");
  });

  it("says permission is missing on a 403", () => {
    renderEmail({ kind: "forbidden" });
    expect(screen.getByText("You don't have permission to view email status.")).toBeInTheDocument();
  });

  it("says Status unavailable with Retry on a failed read — never Not set up", async () => {
    const retry = vi.fn();
    renderEmail({ kind: "error" }, { retry });
    expect(screen.getByRole("alert")).toHaveTextContent("Status unavailable");
    expect(screen.queryByText("Not set up")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("says Not set up when no provider is chosen", () => {
    renderEmail({ kind: "loaded", status: { mailDeliveryAvailable: false, state: "unconfigured", lanes: [{ lane: "transactional", providerId: null, state: "unconfigured" }, { lane: "bulk", providerId: null, state: "unconfigured" }], warnings: [], providers: [] } }, {}, "provider");
    expect(screen.getAllByText("Not set up").length).toBeGreaterThan(0);
    expect(screen.getAllByText("None")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Manage agent plugins" })).toHaveAttribute("href", "/admin/agent-plugins");
  });

  it("reads a local-only lane as No external delivery, never healthy", () => {
    renderEmail({ kind: "loaded", status: LOCAL });
    expect(screen.getByText("No external delivery")).toBeInTheDocument();
    expect(screen.queryByText("Configured")).toBeNull();
  });

  it("lists lanes, installed providers and refusals on the Provider tab", () => {
    renderEmail({ kind: "loaded", status: LOCAL }, {}, "provider");
    expect(screen.getAllByText("No external delivery")).toHaveLength(2);
    expect(screen.getAllByText("Local log").length).toBeGreaterThan(0);
    expect(screen.getByText("Hosted Mail")).toBeInTheDocument();
    expect(screen.getByText("Local only")).toBeInTheDocument();
    expect(screen.getByText("broken-plugin: missing export")).toBeInTheDocument();
    expect(screen.getByText("Switching providers and saving keys here.")).toBeInTheDocument();
  });

  it("shows sender warnings on the Sender & DNS tab", () => {
    renderEmail({ kind: "loaded", status: LOCAL }, {}, "sender");
    expect(screen.getByText("No sender address is set.")).toBeInTheDocument();
    expect(screen.getByText("The records your domain needs, with a live check.")).toBeInTheDocument();
  });

  it("says Configured when every lane is ready, and still labels it configuration-only", () => {
    const READY: AdminMailStatus = { mailDeliveryAvailable: true, state: "ready", lanes: [{ lane: "transactional", providerId: "hosted", state: "ready" }, { lane: "bulk", providerId: "hosted", state: "ready" }], warnings: [], providers: [{ id: "hosted", label: "Hosted Mail", hosted: true, origin: "plugin" }] };
    renderEmail({ kind: "loaded", status: READY });
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("This checks configuration only. It does not prove that mail arrives.")).toBeInTheDocument();
    renderEmail({ kind: "loaded", status: READY }, {}, "provider");
    expect(screen.getByText("Active")).toBeInTheDocument();
    renderEmail({ kind: "loaded", status: READY }, {}, "sender");
    expect(screen.getByText("No sender warnings reported.")).toBeInTheDocument();
  });

  it.each([["overview", 2], ["provider", 1], ["sender", 2], ["templates", 1], ["activity", 1]])("marks %s sections without data as Coming next instead of inventing rows", (tabId, count) => {
    renderEmail({ kind: "loaded", status: LOCAL }, {}, tabId as string);
    expect(screen.getAllByText("Coming next")).toHaveLength(count as number);
  });

  it("translates through the locale", () => {
    renderEmail({ kind: "error" }, { locale: "es" });
    expect(screen.getByRole("heading", { level: 1, name: "Correo electrónico" })).toBeInTheDocument();
    expect(screen.getByText("Estado no disponible")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Resumen", "Proveedor", "Remitente y DNS", "Plantillas", "Actividad"]);
  });
});
