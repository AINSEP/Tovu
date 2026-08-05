import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetInstanceEditor } from "../WidgetInstanceEditor";

/**
 * @file `WidgetInstanceEditor` — pins the fix for the audit's Major finding on
 * `/widgets/new?type=garbage-nonsense`: a missing `?type=` was already handled ("No widget type
 * specified."), but a garbage one previously reached a full live editor shell — title field,
 * working Save button — with zero config fields and zero explanation. Follows the RTL harness
 * `Plugins.unit.test.tsx` established for this package.
 */

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a garbage ?type= on /widgets/new", () => {
  it("renders an Unknown widget type error instead of a live editor shell", () => {
    render(<WidgetInstanceEditor widgetId={null} widgetType="garbage-nonsense" />);

    expect(screen.getByText('Unknown widget type "garbage-nonsense".')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Widget title")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("a missing ?type= on /widgets/new (still handled)", () => {
  it("renders No widget type specified, unaffected by the new check", () => {
    render(<WidgetInstanceEditor widgetId={null} widgetType={null} />);
    expect(screen.getByText("No widget type specified.")).toBeInTheDocument();
  });
});

describe("a known widget type on /widgets/new", () => {
  it("renders the live editor shell normally", () => {
    render(<WidgetInstanceEditor widgetId={null} widgetType="text" />);

    expect(screen.getByPlaceholderText("Widget title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });

  it("gives the title field a real accessible name, not just a placeholder", () => {
    render(<WidgetInstanceEditor widgetId={null} widgetType="text" />);

    const titleInput = screen.getByLabelText("Widget title");
    expect(titleInput).toHaveAttribute("placeholder", "Widget title");
  });
});
