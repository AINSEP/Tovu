import { render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdminMailStatus } from "@/lib/api";
import { Email } from "../Email";
import type { EmailController, EmailStatusView } from "../hooks/use-email.hooks";

/**
 * @file The Email screen for each controller state, through the `useEmailHook` seam. The hook's own
 * load behavior is `use-email.unit.test.ts`.
 */

function renderEmail(view: EmailStatusView, overrides: Partial<EmailController> = {}) {
  const controller: EmailController = { view, locale: "en", retry: () => {}, ...overrides };
  return render(<Email useEmailHook={() => controller} />);
}

const SECTIONS = ["Status", "Provider", "Sender", "DNS", "Send test email", "What uses email", "Recent sends and failures"];

const LOCAL: AdminMailStatus = {
  mailDeliveryAvailable: false,
  state: "degraded",
  lanes: [{ lane: "transactional", providerId: "local", state: "local_only" }, { lane: "bulk", providerId: "local", state: "local_only" }],
  warnings: ["sender_unknown"],
  providers: [{ id: "local", label: "Local log", hosted: false, origin: "core" }, { id: "hosted", label: "Hosted Mail", hosted: true, origin: "plugin" }],
  refusals: ["broken-plugin: missing export"],
};

describe("Email", () => {
  it("renders the seven sections in the design's order", () => {
    renderEmail({ kind: "loading" });
    expect(screen.getByRole("heading", { level: 1, name: "Email" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(SECTIONS);
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
    renderEmail({ kind: "loaded", status: { mailDeliveryAvailable: false, state: "unconfigured", lanes: [{ lane: "transactional", providerId: null, state: "unconfigured" }, { lane: "bulk", providerId: null, state: "unconfigured" }], warnings: [], providers: [] } });
    expect(screen.getAllByText("Not set up").length).toBeGreaterThan(0);
    expect(screen.getAllByText("None")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Manage agent plugins" })).toHaveAttribute("href", "/admin/agent-plugins");
  });

  it("reads a local-only lane as No external delivery, never healthy", () => {
    renderEmail({ kind: "loaded", status: LOCAL });
    expect(screen.getAllByText("No external delivery").length).toBeGreaterThan(0);
    expect(screen.queryByText("Configured")).toBeNull();
    expect(screen.getAllByText("Local log").length).toBeGreaterThan(0);
    expect(screen.getByText("Hosted Mail")).toBeInTheDocument();
    expect(screen.getByText("Local only")).toBeInTheDocument();
    expect(screen.getByText("broken-plugin: missing export")).toBeInTheDocument();
    expect(screen.getByText("No sender address is set.")).toBeInTheDocument();
  });

  it("says Configured when every lane is ready, and still labels it configuration-only", () => {
    renderEmail({ kind: "loaded", status: { mailDeliveryAvailable: true, state: "ready", lanes: [{ lane: "transactional", providerId: "hosted", state: "ready" }, { lane: "bulk", providerId: "hosted", state: "ready" }], warnings: [], providers: [{ id: "hosted", label: "Hosted Mail", hosted: true, origin: "plugin" }] } });
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("This checks configuration only. It does not prove that mail arrives.")).toBeInTheDocument();
    expect(screen.getByText("No sender warnings reported.")).toBeInTheDocument();
  });

  it("marks sections without data as Coming next instead of inventing rows", () => {
    renderEmail({ kind: "loaded", status: LOCAL });
    expect(screen.getAllByText("Coming next")).toHaveLength(6);
  });

  it("translates through the locale", () => {
    renderEmail({ kind: "error" }, { locale: "es" });
    expect(screen.getByRole("heading", { level: 1, name: "Correo electrónico" })).toBeInTheDocument();
    expect(screen.getByText("Estado no disponible")).toBeInTheDocument();
  });
});
