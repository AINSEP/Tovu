import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@/__tests__/fetch-query-render";
import { PlacementContentFields } from "../PlacementContentFields";

/**
 * @file "Content for this spot": the radio pair picks between the widget's own content and a
 * per-placement override, and only the override shows the shared `MediaContentEditor`.
 *
 * The editor's media library loads through the default picker port (this component passes no
 * port), so `fetch` answers an empty library — no request reaches a network.
 */

beforeEach(() => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ media: [] }), { status: 200, headers: { "content-type": "application/json" } }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderFields(custom: boolean, t?: (key: string) => string) {
  const calls: Array<[string, unknown]> = [];
  render(
    <PlacementContentFields
      widgetType="media"
      custom={custom}
      content={{ mode: "html", html: "<p>here</p>" }}
      setCustom={(next) => calls.push(["setCustom", next])}
      setContent={(next) => calls.push(["setContent", next])}
      t={t}
    />,
  );
  return calls;
}

describe("PlacementContentFields", () => {
  it("defaults to the widget's own content, with no editor shown", () => {
    renderFields(false);
    expect(screen.getByRole("radio", { name: "Use the widget's content" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Custom for this post" })).not.toBeChecked();
    expect(screen.queryByLabelText("HTML source")).toBeNull();
  });

  it("choosing Custom asks the host to switch to custom content", () => {
    const calls = renderFields(false);
    fireEvent.click(screen.getByRole("radio", { name: "Custom for this post" }));
    expect(calls).toEqual([["setCustom", true]]);
  });

  it("shows the shared editor for custom content and forwards its edits", () => {
    const calls = renderFields(true);
    expect(screen.getByRole("radio", { name: "Custom for this post" })).toBeChecked();
    const source = screen.getByLabelText("HTML source") as HTMLTextAreaElement;
    expect(source.value).toBe("<p>here</p>");
    fireEvent.change(source, { target: { value: "<p>there</p>" } });
    fireEvent.click(screen.getByRole("radio", { name: "Use the widget's content" }));
    expect(calls).toEqual([
      ["setContent", { mode: "html", html: "<p>there</p>" }],
      ["setCustom", false],
    ]);
  });

  it("translates the legend and choices through the host's t", () => {
    renderFields(false, (key) => `«${key}»`);
    expect(screen.getByText("«Content for this spot»")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "«Custom for this post»" })).toBeInTheDocument();
  });
});
