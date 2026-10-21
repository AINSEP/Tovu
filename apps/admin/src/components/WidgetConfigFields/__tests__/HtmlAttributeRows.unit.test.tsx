import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HtmlAttributeRows } from "../HtmlAttributeRows";
import type { HtmlAttributeRowsController } from "../HtmlAttributeRows.hooks";

/**
 * @file `HtmlAttributeRows` markup against a typed fake controller (its `useRows` seam): which
 * control calls which action with what, the per-row "Dropped when rendered" flag, and the optional
 * agent handle on the add button. Behaviour against the real hook is covered through
 * `MediaContentEditor.unit.test.tsx`.
 */

afterEach(cleanup);

type Call = readonly [name: string, ...args: unknown[]];

function fakeRows(overrides: Partial<HtmlAttributeRowsController> = {}) {
  const calls: Call[] = [];
  const vm: HtmlAttributeRowsController = {
    rows: [],
    dropped: [],
    setRow: (index, patch) => calls.push(["setRow", index, patch]),
    addRow: () => calls.push(["addRow"]),
    removeRow: (index) => calls.push(["removeRow", index]),
    ...overrides,
  };
  return { calls, useRows: () => vm };
}

describe("HtmlAttributeRows", () => {
  it("edits a row's trimmed name and raw value, and removes it by name", () => {
    const { calls, useRows } = fakeRows({ rows: [{ name: "data-kui", value: "x" }], dropped: [false] });
    render(<HtmlAttributeRows value="" onChange={() => {}} useRows={useRows} />);
    fireEvent.change(screen.getByLabelText("Attribute name 1"), { target: { value: "  data-id  " } });
    fireEvent.change(screen.getByLabelText("Attribute value 1"), { target: { value: " spaced " } });
    fireEvent.click(screen.getByRole("button", { name: "Remove data-kui" }));
    expect(calls).toEqual([
      ["setRow", 0, { name: "data-id" }],
      ["setRow", 0, { value: " spaced " }],
      ["removeRow", 0],
    ]);
    expect(screen.getByLabelText("Attribute name 1")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Dropped when rendered")).toBeNull();
  });

  it("names an unnamed row's remove button by its position", () => {
    const { calls, useRows } = fakeRows({ rows: [{ name: "a", value: "" }, { name: "", value: "" }], dropped: [false, false] });
    render(<HtmlAttributeRows value="" onChange={() => {}} useRows={useRows} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove 2" }));
    expect(calls).toEqual([["removeRow", 1]]);
  });

  it("flags only the rows the renderer will drop", () => {
    const { useRows } = fakeRows({ rows: [{ name: "onclick", value: "x" }, { name: "data-ok", value: "y" }], dropped: [true, false] });
    render(<HtmlAttributeRows value="" onChange={() => {}} useRows={useRows} />);
    expect(screen.getByLabelText("Attribute name 1")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Attribute name 2")).not.toHaveAttribute("aria-invalid");
    expect(screen.getAllByText("Dropped when rendered")).toHaveLength(1);
  });

  it("adds a row, carrying the agent handle only when the host gives a base", () => {
    const { calls, useRows } = fakeRows();
    const { rerender } = render(<HtmlAttributeRows value="" onChange={() => {}} useRows={useRows} />);
    const add = screen.getByRole("button", { name: "Add attribute" });
    expect(add).not.toHaveAttribute("data-agent-element");
    fireEvent.click(add);
    expect(calls).toEqual([["addRow"]]);
    rerender(<HtmlAttributeRows value="" onChange={() => {}} useRows={useRows} agentHandle="embed-style" />);
    expect(screen.getByRole("button", { name: "Add attribute" })).toHaveAttribute("data-agent-element", "embed-style-attribute-add");
  });

  it("translates its labels through the host's t", () => {
    const { useRows } = fakeRows({ rows: [{ name: "", value: "" }], dropped: [true] });
    render(<HtmlAttributeRows value="" onChange={() => {}} useRows={useRows} t={(key) => `«${key}»`} />);
    expect(screen.getByLabelText("«Attribute name» 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "«Add attribute»" })).toBeInTheDocument();
    expect(screen.getByText("«Dropped when rendered»")).toBeInTheDocument();
  });
});
