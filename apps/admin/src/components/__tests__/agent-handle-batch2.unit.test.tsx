import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../lib/api";
import { WidgetConfigFields } from "../WidgetConfigFields/WidgetConfigFields";

/**
 * @file Batch 2 of the shared `components/` pass-through `agentHandle` prop: `WidgetConfigFields`
 * — one `agentHandle` prop forwarded to whichever of its five per-widget-type sub-forms is active.
 * Field-level behavior for each sub-form already has its own coverage in
 * `WidgetConfigFields.unit.test.tsx`; this file only pins the handle-derivation contract: omitting
 * `agentHandle` emits zero `data-agent-*` markup, and supplying it publishes each type's own fields
 * under `<base>-<field>` (see the component's own "Agent handles" doc for the full per-type table).
 */

const AGENT_ELEMENT = "data-agent-element";
const AGENT_ROLE = "data-agent-role";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("text", () => {
  it("omits data-agent-* on the textarea when agentHandle is not passed", () => {
    render(<WidgetConfigFields widgetType="text" config={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Text")).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes the textarea under <base>-body", () => {
    render(<WidgetConfigFields widgetType="text" config={{}} onChange={vi.fn()} agentHandle="hero-text" />);
    const field = screen.getByLabelText("Text");
    expect(field).toHaveAttribute(AGENT_ELEMENT, "hero-text-body");
    expect(field).toHaveAttribute(AGENT_ROLE, "field");
  });
});

describe("social-links", () => {
  const TWO_LINKS = { links: [{ platform: "GitHub", url: "https://github.com/x" }, { platform: "X", url: "https://x.com/x" }] };

  it("omits data-agent-* on every row and the add button when agentHandle is not passed", () => {
    render(<WidgetConfigFields widgetType="social-links" config={TWO_LINKS} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue("GitHub")).not.toHaveAttribute(AGENT_ELEMENT);
    expect(screen.getByText("Add link")).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("keys each row by its array index — <base>-link-<i>-platform/-url/-remove, plus <base>-add", () => {
    render(<WidgetConfigFields widgetType="social-links" config={TWO_LINKS} onChange={vi.fn()} agentHandle="social" />);

    expect(screen.getByDisplayValue("GitHub")).toHaveAttribute(AGENT_ELEMENT, "social-link-0-platform");
    expect(screen.getByDisplayValue("https://github.com/x")).toHaveAttribute(AGENT_ELEMENT, "social-link-0-url");
    expect(screen.getByDisplayValue("X")).toHaveAttribute(AGENT_ELEMENT, "social-link-1-platform");
    expect(screen.getAllByText("Remove")[0]).toHaveAttribute(AGENT_ELEMENT, "social-link-0-remove");
    expect(screen.getAllByText("Remove")[1]).toHaveAttribute(AGENT_ELEMENT, "social-link-1-remove");
    expect(screen.getByText("Add link")).toHaveAttribute(AGENT_ELEMENT, "social-add");
  });
});

describe("recent-entries", () => {
  it("omits data-agent-* on both fields when agentHandle is not passed", () => {
    render(<WidgetConfigFields widgetType="recent-entries" config={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Max items")).not.toHaveAttribute(AGENT_ELEMENT);
  });

  it("publishes <base>-max-items and <base>-category-term-id", () => {
    render(<WidgetConfigFields widgetType="recent-entries" config={{}} onChange={vi.fn()} agentHandle="recent" />);
    expect(screen.getByLabelText("Max items")).toHaveAttribute(AGENT_ELEMENT, "recent-max-items");
    expect(screen.getByLabelText("Category term id (optional)")).toHaveAttribute(AGENT_ELEMENT, "recent-category-term-id");
  });
});

describe("menu", () => {
  it("publishes the real <select> under <base>-menu-ref once loaded", async () => {
    vi.spyOn(api, "listMenus").mockResolvedValue({ menus: [] });
    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={vi.fn()} agentHandle="footer-menu" />);
    await waitFor(() => expect(screen.getByLabelText("Menu")).toBeInTheDocument());
    const select = screen.getByLabelText("Menu");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveAttribute(AGENT_ELEMENT, "footer-menu-menu-ref");
    expect(select).toHaveAttribute(AGENT_ROLE, "field");
  });

  it("omits data-agent-* when agentHandle is not passed", async () => {
    vi.spyOn(api, "listMenus").mockResolvedValue({ menus: [] });
    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Menu")).toBeInTheDocument());
    expect(screen.getByLabelText("Menu")).not.toHaveAttribute(AGENT_ELEMENT);
  });
});

describe("contact-form", () => {
  it("publishes the select and the success-message input under <base>-form-definition-id/-success-message", async () => {
    vi.spyOn(api, "listForms").mockResolvedValue({ data: [] });
    render(<WidgetConfigFields widgetType="contact-form" config={{}} onChange={vi.fn()} agentHandle="contact" />);
    await waitFor(() => expect(screen.getByLabelText("Form")).toBeInTheDocument());
    expect(screen.getByLabelText("Form")).toHaveAttribute(AGENT_ELEMENT, "contact-form-definition-id");
    expect(screen.getByLabelText("Success message (optional)")).toHaveAttribute(AGENT_ELEMENT, "contact-success-message");
  });
});
