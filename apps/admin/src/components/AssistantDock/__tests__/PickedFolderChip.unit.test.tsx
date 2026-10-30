import { readFileSync } from "node:fs";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PickedFolderChip } from "../PickedFolderChip";

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
});

it("shows the picked folder's name (full path on hover) and × clears it", async () => {
  const onClear = vi.fn();
  render(<PickedFolderChip path={"C:\\Users\\la\\Desktop\\Brand Assets\\"} onClear={onClear} />);
  expect(screen.getByText("Brand Assets")).toHaveAttribute("title", "C:\\Users\\la\\Desktop\\Brand Assets\\");
  await userEvent.setup().click(screen.getByRole("button", { name: "Stop using Brand Assets" }));
  expect(onClear).toHaveBeenCalledTimes(1);
});

// Owner report, 2026-10-29: in the composer footer the chip took 50% of a slot sized by its own full
// name, showed only "A…", and still pushed the model picker under Send. jsdom cannot lay out flex,
// so the declarations that let it truncate (and give the slot a small min-content) are checked.
it("truncates inside the composer footer instead of crowding the picker", () => {
  document.head.innerHTML = `<style>${readFileSync("src/styles/assistant.css", "utf8")}</style>`;
  render(
    <div className="admin-chat-dock"><div className="jini-chat-pane"><div className="jini-composer-footer"><div className="jini-composer-footer-leading">
      <PickedFolderChip path="/Users/la/Downloads/Additional Assets" onClear={() => {}} />
    </div></div></div></div>,
  );
  const name = screen.getByText("Additional Assets");
  const chip = getComputedStyle(name.closest(".tovu-picked-folder-chip")!);
  const label = getComputedStyle(name);
  expect(name).toHaveAttribute("title", "/Users/la/Downloads/Additional Assets");
  expect(chip.minWidth).toBe("7rem");
  expect(chip.maxWidth).toBe("180px");
  // One clamped line that may break anywhere: a min-content of one character, so the footer can
  // shrink the chip before it wraps the picker.
  expect(label.whiteSpace).toBe("normal");
  expect(label.wordBreak).toBe("break-all");
  expect(label.getPropertyValue("-webkit-line-clamp")).toBe("1");
});
