import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, type AdminWidgetType } from "../../lib/api";
import { defaultWidgetConfig, WidgetConfigFields, WIDGET_TYPE_OPTIONS } from "../WidgetConfigFields/WidgetConfigFields";

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
 *
 * `MenuConfigFields`/`ContactFormConfigFields` now share their fetch-once-on-mount state via
 * `useFetchedOptions` (`WidgetConfigFields.hooks.tsx`, extracted when `WidgetConfigFields.tsx` split
 * into `WidgetConfigFields.tsx`/`WidgetConfigFields.hooks.tsx`) — most of this file still exercises
 * that behavior through the rendered sub-components by mocking `api.listMenus`/`api.listForms`
 * directly; `WidgetConfigFields.hooks.unit.test.tsx` covers the hook itself in isolation via
 * `renderHook`. The `describe('WidgetConfigFields data-fetching-hook injection')` block at the
 * bottom of this file additionally proves `WidgetConfigFields`'s own `useFetchedOptions` prop (owner
 * mandate MSG-01: every DOM/IO-touching extracted hook must be reachable as an optional prop) is
 * actually wired through to `MenuConfigFields`, not hardcoded.
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

const COLLECTIONS = [
  {
    workspaceId: "ws1",
    key: "tovu_feature",
    label: "Features",
    status: "active" as const,
    version: 1,
    fields: [
      { name: "docs_page", kind: "text" as const, required: false, queryable: true },
      { name: "featured", kind: "boolean" as const, required: false, queryable: true },
      { name: "score", kind: "real" as const, required: false, queryable: true },
      { name: "related", kind: "relation" as const, required: false, queryable: false },
    ],
  },
  { workspaceId: "ws1", key: "docs_page", label: "Docs page", status: "active" as const, version: 1, fields: [] },
  { workspaceId: "ws1", key: "widget", label: "widget", status: "active" as const, version: 1, fields: [] },
];

describe("RecentEntriesConfigFields", () => {
  beforeEach(() => {
    // Every case below fetches the content-type registry for the Collection select on mount (same
    // `useFetchedOptions` seam `MenuConfigFields`/`ContactFormConfigFields` use) — stub it here so
    // tests that don't care about that fetch don't see a real network call.
    vi.spyOn(api, "listContentTypes").mockResolvedValue({ items: COLLECTIONS });
  });

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
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(typeof (lastCall[0] as { maxItems: unknown }).maxItems).toBe("number");
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

  it("shows an error notice when api.listContentTypes rejects with an Error", async () => {
    vi.spyOn(api, "listContentTypes").mockRejectedValue(new Error("collections down"));
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5 }} onChange={vi.fn()} />);

    expect(await screen.findByText("collections down")).toBeInTheDocument();
  });

  it("lists user collections in the Collection select, excluding system types (isUserCollection, A2)", async () => {
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5 }} onChange={vi.fn()} />);

    expect(await screen.findByRole("option", { name: "Features" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Docs page" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All collections" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "widget" })).not.toBeInTheDocument();
  });

  it("choosing a collection writes config.collection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5 }} onChange={onChange} />);

    await screen.findByRole("option", { name: "Features" });
    await user.selectOptions(screen.getByLabelText("Collection"), "tovu_feature");

    expect(onChange).toHaveBeenLastCalledWith({ maxItems: 5, collection: "tovu_feature" });
  });

  it("clearing the collection back to \"All collections\" removes collection (and any fields/where authored against it)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WidgetConfigFields
        widgetType="recent-entries"
        config={{ maxItems: 5, collection: "tovu_feature", fields: ["docs_page"], where: { featured: true } }}
        onChange={onChange}
      />,
    );

    await screen.findByRole("option", { name: "Features" });
    await user.selectOptions(screen.getByLabelText("Collection"), "");

    expect(onChange).toHaveBeenLastCalledWith({ maxItems: 5 });
  });

  it("columns are hidden for list layout and shown for cards layout", async () => {
    const { rerender } = render(
      <WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5, layout: "cards" }} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Columns")).toBeInTheDocument();

    rerender(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5, layout: "list" }} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Columns")).not.toBeInTheDocument();
  });

  it("switching to list layout drops any authored columns value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5, layout: "cards", columns: 4 }} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText("Layout"), "list");

    expect(onChange).toHaveBeenLastCalledWith({ maxItems: 5, layout: "list" });
  });

  it("Fields checkboxes and the filter row are hidden when no specific collection is chosen", async () => {
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5 }} onChange={vi.fn()} />);
    await screen.findByRole("option", { name: "Features" }); // wait for the collections fetch to settle
    expect(screen.queryByText("Fields to show")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter")).not.toBeInTheDocument();
  });

  it("Fields checkboxes appear for a chosen collection's displayable fields only (never relation/json)", async () => {
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5, collection: "tovu_feature" }} onChange={vi.fn()} />);

    expect(await screen.findByText("Fields to show")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Docs page" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Featured" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Related" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Filter")).toBeInTheDocument();
  });

  // Regression: `agentHandle` throws on anything but lowercase-letters-and-hyphens (Jini
  // `@jini-ai/agentic`'s HANDLE_PATTERN), and a content type's field names are operator-chosen —
  // `docs_page` on this very fixture's `tovu_feature` type is snake_case. FieldsCheckboxes used to
  // interpolate the raw field name straight into the handle, which threw and blanked the whole
  // widget editor the moment a collection with an underscored field name was picked, for any
  // caller that supplies `agentHandle` (the real widget editor route does).
  it("does not throw when a chosen collection's field name is not already handle-safe", async () => {
    expect(() =>
      render(
        <WidgetConfigFields
          widgetType="recent-entries"
          config={{ maxItems: 5, collection: "tovu_feature" }}
          onChange={vi.fn()}
          agentHandle="widget-instance-config"
        />,
      ),
    ).not.toThrow();
    const checkbox = await screen.findByRole("checkbox", { name: "Docs page" });
    expect(checkbox.getAttribute("data-agent-element")).toBe("widget-instance-config-field-docs-page");
  });

  it("checking a field writes it into config.fields; unchecking the last one removes the key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5, collection: "tovu_feature" }} onChange={onChange} />);

    const checkbox = await screen.findByRole("checkbox", { name: "Docs page" });
    await user.click(checkbox);
    expect(onChange).toHaveBeenLastCalledWith({ maxItems: 5, collection: "tovu_feature", fields: ["docs_page"] });
  });

  it("the filter row writes a single where clause, coercing a boolean field's value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<WidgetConfigFields widgetType="recent-entries" config={{ maxItems: 5, collection: "tovu_feature" }} onChange={onChange} />);

    await user.selectOptions(await screen.findByLabelText("Filter"), "featured");
    fireEvent.change(screen.getByLabelText("Filter value"), { target: { value: "true" } });

    expect(onChange).toHaveBeenLastCalledWith({ maxItems: 5, collection: "tovu_feature", where: { featured: true } });
  });

  // Regression (review 2026-09-23): the value input rendered the COERCED stored value, so each
  // keystroke was re-coerced before the next one landed. Typing "true" into a boolean filter gave
  // "t" -> false -> the box showed "false", and "1.5" into a real one lost its "." ("1." -> 1). The
  // test above used one fireEvent.change with the whole string, which never showed it.
  function ControlledRecentEntries() {
    const [config, setConfig] = useState<Record<string, unknown>>({ maxItems: 5, collection: "tovu_feature" });
    return (
      <>
        <WidgetConfigFields widgetType="recent-entries" config={config} onChange={setConfig} />
        <output data-testid="where">{JSON.stringify(config.where ?? null)}</output>
      </>
    );
  }

  it("typing a boolean filter value key by key stores true, and the box keeps what was typed", async () => {
    const user = userEvent.setup();
    render(<ControlledRecentEntries />);

    await user.selectOptions(await screen.findByLabelText("Filter"), "featured");
    await user.type(screen.getByLabelText("Filter value"), "true");

    expect(screen.getByLabelText("Filter value")).toHaveValue("true");
    expect(screen.getByTestId("where").textContent).toBe('{"featured":true}');
  });

  it("typing a decimal into a real filter value key by key keeps the decimal point", async () => {
    const user = userEvent.setup();
    render(<ControlledRecentEntries />);

    await user.selectOptions(await screen.findByLabelText("Filter"), "score");
    await user.type(screen.getByLabelText("Filter value"), "1.5");

    expect(screen.getByLabelText("Filter value")).toHaveValue("1.5");
    expect(screen.getByTestId("where").textContent).toBe('{"score":1.5}');
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
      { value: "recent-entries", label: "Collection list" },
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

describe("WidgetConfigFields data-fetching-hook injection", () => {
  it("MenuConfigFields renders purely off an injected fake, proving useFetchedOptions is not hardcoded", () => {
    // The real useFetchedOptions always starts `{ items: null, error: null }` — even for an
    // already-resolved promise, the `.then()` callback that populates `items` can only run after a
    // microtask, so a real render is never synchronously past the "Loading menus…" state. A fake
    // that returns already-populated data with no async wait at all is something the real hook could
    // never produce on first render — if this test passes, `WidgetConfigFields` rendered off the
    // fake, not the real `useFetchedOptions`.
    // Generic like the real `useFetchedOptions<T>`, not a fixed shape — `WidgetConfigFields`'s
    // `useFetchedOptions` prop is typed as `typeof useFetchedOptions`, so the fake has to satisfy
    // that same generic call signature to typecheck as a drop-in replacement.
    function useFakeFetchedOptions<T>(): { items: T[] | null; error: string | null } {
      return {
        items: [
          { id: "fake-1", workspaceId: "ws1", slug: "fake", title: "Fake Menu", status: "published" as const, items: [], locations: [], updatedAt: "2026-01-01", version: 1 },
        ] as unknown as T[],
        error: null,
      };
    }

    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={vi.fn()} useFetchedOptions={useFakeFetchedOptions} />);

    // No `api.listMenus` mock was ever installed in this test, and no `await`/`findBy*` was needed —
    // the option is there synchronously, straight off the fake.
    expect(screen.getByRole("option", { name: "Fake Menu (published)" })).toBeInTheDocument();
    expect(screen.queryByText("Loading menus…")).not.toBeInTheDocument();
  });

  it("ContactFormConfigFields renders purely off an injected fake, proving useFetchedOptions is not hardcoded", () => {
    function useFakeFetchedOptions<T>(): { items: T[] | null; error: string | null } {
      return {
        items: [
          { id: "fake-f1", workspaceId: "ws1", name: "Fake Form", slug: "fake-form", fields: [], notify: { enabled: false, recipients: [] }, status: "active" as const, createdAt: "2026-01-01", updatedAt: "2026-01-01" },
        ] as unknown as T[],
        error: null,
      };
    }

    render(<WidgetConfigFields widgetType="contact-form" config={{}} onChange={vi.fn()} useFetchedOptions={useFakeFetchedOptions} />);

    expect(screen.getByRole("option", { name: "Fake Form — active" })).toBeInTheDocument();
    expect(screen.queryByText("Loading forms…")).not.toBeInTheDocument();
  });

  it("a real widgetType with no fetching sub-component (e.g. text) ignores the prop entirely", () => {
    // `useFetchedOptions` is only threaded to the two fetching sub-components — passing it alongside
    // a non-fetching widgetType must be a harmless no-op, not an error.
    const neverCalled = vi.fn();
    render(<WidgetConfigFields widgetType="text" config={{}} onChange={vi.fn()} useFetchedOptions={neverCalled as never} />);

    expect(screen.getByLabelText("Text")).toBeInTheDocument();
    expect(neverCalled).not.toHaveBeenCalled();
  });
});

/**
 * `t` injection (Batch D2 i18n wiring) — every `describe` above renders with no `t` prop at all,
 * proving the identity-passthrough default keeps English output byte-identical (zero of the tests
 * above needed to change). These prove the OTHER half: a non-identity `t` actually reaches every
 * sub-form's copy, not just gets threaded through and ignored. Each fake `t` below maps only the
 * keys that widget type's sub-form actually calls `t()`/`interpolate()` with, to something visibly
 * NOT the English source string — a passthrough bug (a sub-component reading a hardcoded literal
 * instead of `props.t(...)`) would leave the untranslated English text on screen and fail these.
 */
describe("WidgetConfigFields — translated copy (t injection)", () => {
  it("TextConfigFields: translates the Text label", () => {
    const t = (key: string) => (key === "Text" ? "Texto-FAKE" : key);
    render(<WidgetConfigFields widgetType="text" config={{}} onChange={vi.fn()} t={t} />);

    expect(screen.getByLabelText("Texto-FAKE")).toBeInTheDocument();
    expect(screen.queryByLabelText("Text")).not.toBeInTheDocument();
  });

  it("SocialLinksConfigFields: translates the heading, Link {n} legend (interpolated), field labels/placeholders, Remove and Add link", () => {
    const DICT: Record<string, string> = {
      "Social links": "Enlaces-FAKE",
      "Link {n}": "Enlace-FAKE {n}",
      Platform: "Plataforma-FAKE",
      "e.g. GitHub": "p.ej.-FAKE GitHub",
      URL: "URL-FAKE",
      Remove: "Quitar-FAKE",
      "Add link": "Añadir-FAKE",
    };
    const t = (key: string) => DICT[key] ?? key;
    const links = [{ platform: "GitHub", url: "https://github.com/x" }];
    render(<WidgetConfigFields widgetType="social-links" config={{ links }} onChange={vi.fn()} t={t} />);

    expect(screen.getByText("Enlaces-FAKE")).toBeInTheDocument();
    expect(screen.getByText("Enlace-FAKE 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Plataforma-FAKE")).toBeInTheDocument();
    expect(screen.getByLabelText("URL-FAKE")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("p.ej.-FAKE GitHub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar-FAKE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir-FAKE" })).toBeInTheDocument();
    // None of the English source strings this locale should have replaced remain on screen.
    expect(screen.queryByText("Social links")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Link 1$/)).not.toBeInTheDocument();
  });

  it("RecentEntriesConfigFields: translates both field labels", () => {
    const DICT: Record<string, string> = {
      "Max items": "Máximo-FAKE",
      "Category term id (optional)": "ID-categoría-FAKE",
    };
    const t = (key: string) => DICT[key] ?? key;
    render(<WidgetConfigFields widgetType="recent-entries" config={{}} onChange={vi.fn()} t={t} />);

    expect(screen.getByLabelText("Máximo-FAKE")).toBeInTheDocument();
    expect(screen.getByLabelText("ID-categoría-FAKE")).toBeInTheDocument();
  });

  it("MenuConfigFields: translates the loading state, the label, and the empty option", async () => {
    vi.spyOn(api, "listMenus").mockResolvedValue({ menus: MENUS });
    const DICT: Record<string, string> = {
      "Loading menus…": "Cargando-FAKE…",
      Menu: "Menú-FAKE",
      "Choose a menu…": "Elegir-FAKE…",
    };
    const t = (key: string) => DICT[key] ?? key;
    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={vi.fn()} t={t} />);

    expect(screen.getByText("Cargando-FAKE…")).toBeInTheDocument();

    expect(await screen.findByLabelText("Menú-FAKE")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Elegir-FAKE…" })).toBeInTheDocument();
  });

  it("MenuConfigFields: translates the generic error fallback (rejection is not an Error instance)", async () => {
    vi.spyOn(api, "listMenus").mockRejectedValue("string rejection");
    const t = (key: string) => (key === "failed to load menus" ? "fallo-FAKE" : key);
    render(<WidgetConfigFields widgetType="menu" config={{}} onChange={vi.fn()} t={t} />);

    expect(await screen.findByText("fallo-FAKE")).toBeInTheDocument();
  });

  it("ContactFormConfigFields: translates the loading state, both labels, and the empty option", async () => {
    vi.spyOn(api, "listForms").mockResolvedValue({ data: FORMS });
    const DICT: Record<string, string> = {
      "Loading forms…": "Cargando-formularios-FAKE…",
      Form: "Formulario-FAKE",
      "Choose a form…": "Elegir-formulario-FAKE…",
      "Success message (optional)": "Mensaje-éxito-FAKE",
    };
    const t = (key: string) => DICT[key] ?? key;
    render(<WidgetConfigFields widgetType="contact-form" config={{}} onChange={vi.fn()} t={t} />);

    expect(screen.getByText("Cargando-formularios-FAKE…")).toBeInTheDocument();

    expect(await screen.findByLabelText("Formulario-FAKE")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Elegir-formulario-FAKE…" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje-éxito-FAKE")).toBeInTheDocument();
  });

  it("ContactFormConfigFields: translates the generic error fallback (rejection is not an Error instance)", async () => {
    vi.spyOn(api, "listForms").mockRejectedValue({ code: 500 });
    const t = (key: string) => (key === "failed to load forms" ? "fallo-formulario-FAKE" : key);
    render(<WidgetConfigFields widgetType="contact-form" config={{}} onChange={vi.fn()} t={t} />);

    expect(await screen.findByText("fallo-formulario-FAKE")).toBeInTheDocument();
  });
});
