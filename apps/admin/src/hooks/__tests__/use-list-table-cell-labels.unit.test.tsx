import { render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { labelListTableCells, useListTableCellLabels } from "../use-list-table-cell-labels.hooks";

/**
 * @file The phone card layout's column labels (mobile catalog P-4, 2026-10-06): every `.list-table`
 * body cell gets its column header's text as `data-label`, which `styles.css` prints in card mode.
 */

function table(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("labelListTableCells", () => {
  it("copies each header's text (minus sort glyphs) onto its column, honouring colspan", () => {
    const root = table(`<table class="list-table">
      <thead><tr><th>Title ⇅</th><th colspan="2">When</th><th></th></tr></thead>
      <tbody><tr><td>a</td><td>b</td><td>c</td><td>d</td></tr></tbody></table>`);
    labelListTableCells(root);
    const labels = Array.from(root.querySelectorAll("td")).map((td) => td.getAttribute("data-label"));
    expect(labels).toEqual(["Title", "When", "When", null]);
  });

  it("gives a spanning cell no label and clears a stale one", () => {
    const root = table(`<table class="list-table">
      <thead><tr><th>A</th><th>B</th></tr></thead>
      <tbody><tr><td colspan="2" data-label="A">empty</td></tr></tbody></table>`);
    labelListTableCells(root);
    expect(root.querySelector("td")?.hasAttribute("data-label")).toBe(false);
  });

  it("leaves tables without a header row, and non-list tables, alone", () => {
    const root = table(`<table class="list-table"><tbody><tr><td>x</td></tr></tbody></table>
      <table><thead><tr><th>H</th></tr></thead><tbody><tr><td>y</td></tr></tbody></table>`);
    labelListTableCells(root);
    expect(root.querySelectorAll("td[data-label]")).toHaveLength(0);
  });
});

describe("useListTableCellLabels", () => {
  function Harness({ rows }: { rows: readonly string[] }) {
    const [root, setRoot] = useState<HTMLElement | null>(null);
    useListTableCellLabels(root);
    return (
      <main ref={setRoot}>
        <table className="list-table">
          <thead><tr><th>Name</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r}><td>{r}</td></tr>)}</tbody>
        </table>
      </main>
    );
  }

  it("labels the first render and rows added later", async () => {
    const { container, rerender } = render(<Harness rows={["a"]} />);
    expect(container.querySelector("td")?.getAttribute("data-label")).toBe("Name");
    rerender(<Harness rows={["a", "b"]} />);
    await Promise.resolve();
    const labels = Array.from(container.querySelectorAll("td")).map((td) => td.getAttribute("data-label"));
    expect(labels).toEqual(["Name", "Name"]);
  });
});
