import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminWidgetType } from "../../lib/api";
import { defaultWidgetConfig, WidgetConfigFields, WIDGET_TYPE_OPTIONS } from "../WidgetConfigFields";

/**
 * @file First test file for `WidgetConfigFields.tsx` (0% before this pass — no test file existed).
 *
 * One sub-component per v1 widget type (`ui.spec.md` §2/§3.4), dispatched by
 * `WidgetConfigFields`'s own switch — each gets its own `describe` block below, covering both the
 * dispatch (every case, plus the `default: null` for a type outside the closed union) and the
 * sub-component's own field behavior. `MenuConfigFields`/`ContactFormConfigFields` fetch via `api`
 * on mount, mirroring `WidgetPickerDialog.unit.test.tsx`'s pattern but spying on `api.listMenus`/
 * `api.listForms` directly rather than stubbing `fetch` — simpler here since nothing else in this
 * file touches the network.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WidgetConfigFields — dispatch", () => {
  it("text renders TextConfigFields (the textarea)", () => {
    render(<WidgetConfigFields widgetType="text" config={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Text")).toBeInTheDocument();
  });

  it("social-links renders SocialLinksConfigFields", () => {
    render(<WidgetConfigFields widgetType="social-links" config={{ links: [] }} onChange={vi.fn()} />);
    expect(screen.getByText("Social links")).toBeInTheDocument();
  });

  it("recent-entries renders RecentEntriesConfigFields", () => {
    render(<WidgetConfigFields widgetType="recent-entries" config={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Max items")).toBeInTheDocument();
  });

  it("menu renders MenuConfigFields (starts in its loading state)", () => {
    vi.spyOn(api, "listMenus").mockReturnValue(new Promise(() => {})); // never resolves — pins the loading render
    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={vi.fn()} />);
    expect(screen.getByText("Loading menus…")).toBeInTheDocument();
  });

  it("contact-form renders ContactFormConfigFields (starts in its loading state)", () => {
    vi.spyOn(api, "listForms").mockReturnValue(new Promise(() => {}));
    render(<WidgetConfigFields widgetType="contact-form" config={{}} onChange={vi.fn()} />);
    expect(screen.getByText("Loading forms…")).toBeInTheDocument();
  });

  it("an unknown widget type outside the closed union renders nothing (default: null)", () => {
    const { container } = render(
      <WidgetConfigFields widgetType={"unknown-type" as AdminWidgetType} config={{}} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TextConfigFields", () => {
  it("renders the config's existing body value", () => {
    render(<WidgetConfigFields widgetType="text" config={{ body: "hello world" }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Text")).toHaveValue("hello world");
  });

  it("falls back to an empty string when body is missing or not a string (textValue)", () => {
    render(<WidgetConfigFields widgetType="text" config={{ body: 42 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Text")).toHaveValue("");
  });

  it("typing calls onChange with the rest of the config spread through, plus the new body", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetConfigFields widgetType="text" config={{ other: "kept" }} onChange={onChange} />);

    await user.type(screen.getByLabelText("Text"), "x");

    expect(onChange).toHaveBeenLastCalledWith({ other: "kept", body: "x" });
  });
});

describe("SocialLinksConfigFields", () => {
  it("renders no rows for an empty/missing links array", () => {
    render(<WidgetConfigFields widgetType="social-links" config={{}} onChange={vi.fn()} />);
    expect(screen.queryByText(/^Link 1$/)).not.toBeInTheDocument();
  });

  it("ignores a non-array links value the same way it treats a missing one", () => {
    render(<WidgetConfigFields widgetType="social-links" config={{ links: "not-an-array" }} onChange={vi.fn()} />);
    expect(screen.queryByText(/^Link 1$/)).not.toBeInTheDocument();
  });

  it("Add link appends a blank {platform:'', url:''} entry", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetConfigFields widgetType="social-links" config={{ links: [] }} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Add link" }));

    expect(onChange).toHaveBeenCalledWith({ links: [{ platform: "", url: "" }] });
  });

  it("Add link is disabled at the 20-link cap and does not call onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const links = Array.from({ length: 20 }, (_, i) => ({ platform: `p${i}`, url: `https://${i}` }));
    render(<WidgetConfigFields widgetType="social-links" config={{ links }} onChange={onChange} />);

    const addButton = screen.getByRole("button", { name: "Add link" });
    expect(addButton).toBeDisabled();
    await user.click(addButton);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("editing a link's platform updates only that link, leaving the rest untouched", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const links = [
      { platform: "GitHub", url: "https://github.com/x" },
      { platform: "X", url: "https://x.com/x" },
    ];
    render(<WidgetConfigFields widgetType="social-links" config={{ links }} onChange={onChange} />);

    await user.type(screen.getByLabelText("Platform", { selector: "#widget-social-platform-1" }), "!");

    expect(onChange).toHaveBeenLastCalledWith({
      links: [links[0], { platform: "X!", url: "https://x.com/x" }],
    });
  });

  it("editing a link's URL updates only that link's url field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const links = [{ platform: "GitHub", url: "" }];
    render(<WidgetConfigFields widgetType="social-links" config={{ links }} onChange={onChange} />);

    await user.type(screen.getByLabelText("URL"), "h");

    expect(onChange).toHaveBeenLastCalledWith({ links: [{ platform: "GitHub", url: "h" }] });
  });

  it("Remove drops exactly that link by index", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const links = [
      { platform: "GitHub", url: "https://github.com/x" },
      { platform: "X", url: "https://x.com/x" },
    ];
    render(<WidgetConfigFields widgetType="social-links" config={{ links }} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]!);

    expect(onChange).toHaveBeenCalledWith({ links: [links[1]] });
  });
});

describe("RecentEntriesConfigFields", () => {
  it("defaults maxItems to 5 when the config value is missing or not a number", () => {
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: "5" }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Max items")).toHaveValue(5);
  });

  it("renders an existing numeric maxItems value", () => {
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 12 }} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Max items")).toHaveValue(12);
  });

  it("typing a digit updates maxItems as a Number, not a string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 1 }} onChange={onChange} />);

    await user.type(screen.getByLabelText("Max items"), "9");

    // Controlled input, `onChange` prop never fed back in this render: typing "9" after the
    // existing "1" produces the DOM value "19", and the assertion is on the resulting Number, not
    // the keystroke — pinning that the field parses via `Number(...)`, not string concatenation.
    expect(onChange).toHaveBeenLastCalledWith({ maxItems: 19 });
    expect(typeof (onChange.mock.calls.at(-1)?.[0] as { maxItems: unknown }).maxItems).toBe("number");
  });

  it("clearing the max-items field sets maxItems to undefined, not an empty string or NaN", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5 }} onChange={onChange} />);

    await user.clear(screen.getByLabelText("Max items"));

    expect(onChange).toHaveBeenLastCalledWith({ maxItems: undefined });
  });

  it("renders an existing categoryTermId and clearing it sets undefined, not an empty string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5, categoryTermId: "t1" }} onChange={onChange} />,
    );
    expect(screen.getByLabelText("Category term id (optional)")).toHaveValue("t1");

    await user.clear(screen.getByLabelText("Category term id (optional)"));

    expect(onChange).toHaveBeenLastCalledWith({ maxItems: 5, categoryTermId: undefined });
  });
});

const MENUS = [
  { id: "m1", workspaceId: "ws1", slug: "main", title: "Main menu", status: "published" as const, items: [], locations: [], updatedAt: "2026-01-01", version: 1 },
];

describe("MenuConfigFields", () => {
  it("shows an error notice when api.listMenus rejects with an Error", async () => {
    vi.spyOn(api, "listMenus").mockRejectedValue(new Error("network down"));
    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={vi.fn()} />);

    expect(await screen.findByText("network down")).toBeInTheDocument();
  });

  it("shows the generic fallback message when the rejection is not an Error instance", async () => {
    vi.spyOn(api, "listMenus").mockRejectedValue("string rejection");
    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={vi.fn()} />);

    expect(await screen.findByText("failed to load menus")).toBeInTheDocument();
  });

  it("lists loaded menus and selecting one calls onChange with menuRef", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.spyOn(api, "listMenus").mockResolvedValue({ menus: MENUS });
    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={onChange} />);

    const select = await screen.findByLabelText("Menu");
    expect(screen.getByRole("option", { name: "Main menu (published)" })).toBeInTheDocument();

    await user.selectOptions(select, "m1");

    expect(onChange).toHaveBeenCalledWith({ menuRef: "m1" });
  });

  it("preselects an existing menuRef from config", async () => {
    vi.spyOn(api, "listMenus").mockResolvedValue({ menus: MENUS });
    render(<WidgetConfigFields widgetType="menu" config={{ menuRef: "m1" }} onChange={vi.fn()} />);

    expect(await screen.findByLabelText("Menu")).toHaveValue("m1");
  });
});

const FORMS = [
  {
    id: "f1",
    workspaceId: "ws1",
    name: "Contact us",
    slug: "contact",
    fields: [],
    notify: { enabled: false, recipients: [] },
    status: "active" as const,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  },
];

describe("ContactFormConfigFields", () => {
  it("shows an error notice when api.listForms rejects with an Error", async () => {
    vi.spyOn(api, "listForms").mockRejectedValue(new Error("forms endpoint down"));
    render(<WidgetConfigFields widgetType="contact-form" config={{}} onChange={vi.fn()} />);

    expect(await screen.findByText("forms endpoint down")).toBeInTheDocument();
  });

  it("shows the generic fallback message when the rejection is not an Error instance", async () => {
    vi.spyOn(api, "listForms").mockRejectedValue({ code: 500 });
    render(<WidgetConfigFields widgetType="contact-form" config={{}} onChange={vi.fn()} />);

    expect(await screen.findByText("failed to load forms")).toBeInTheDocument();
  });

  it("lists loaded forms with inline status and selecting one calls onChange with formDefinitionId", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.spyOn(api, "listForms").mockResolvedValue({ data: FORMS });
    render(<WidgetConfigFields widgetType="contact-form" config={{}} onChange={onChange} />);

    const select = await screen.findByLabelText("Form");
    expect(screen.getByRole("option", { name: "Contact us — active" })).toBeInTheDocument();

    await user.selectOptions(select, "f1");

    expect(onChange).toHaveBeenCalledWith({ formDefinitionId: "f1" });
  });

  it("typing a success message sets it, and clearing it sets undefined rather than an empty string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.spyOn(api, "listForms").mockResolvedValue({ data: FORMS });
    render(<WidgetConfigFields widgetType="contact-form" config={{ successMessage: "Thanks!" }} onChange={onChange} />);

    await waitFor(() => expect(screen.getByLabelText("Success message (optional)")).toHaveValue("Thanks!"));

    await user.clear(screen.getByLabelText("Success message (optional)"));

    expect(onChange).toHaveBeenLastCalledWith({ successMessage: undefined });
  });
});

describe("WIDGET_TYPE_OPTIONS", () => {
  it("lists exactly the five closed v1 widget types, value and label paired", () => {
    expect(WIDGET_TYPE_OPTIONS).toEqual([
      { value: "text", label: "Text" },
      { value: "social-links", label: "Social Links" },
      { value: "recent-entries", label: "Recent Entries" },
      { value: "menu", label: "Menu" },
      { value: "contact-form", label: "Contact Form" },
    ]);
  });
});

describe("defaultWidgetConfig", () => {
  it.each([
    ["text", { body: "" }],
    ["social-links", { links: [] }],
    ["recent-entries", { maxItems: 5 }],
    ["menu", { menuRef: "" }],
    ["contact-form", { formDefinitionId: "" }],
  ] as const)("%s -> %j", (type, expected) => {
    expect(defaultWidgetConfig(type)).toEqual(expected);
  });

  it("an unknown type outside the closed union falls back to an empty object", () => {
    expect(defaultWidgetConfig("unknown-type" as AdminWidgetType)).toEqual({});
  });
});
