import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PickedFolderChip } from "../PickedFolderChip";

afterEach(() => {
  cleanup();
});

it("shows the picked folder's name (full path on hover) and × clears it", async () => {
  const onClear = vi.fn();
  render(<PickedFolderChip path={"C:\\Users\\la\\Desktop\\Brand Assets\\"} onClear={onClear} />);
  expect(screen.getByText("Brand Assets")).toHaveAttribute("title", "C:\\Users\\la\\Desktop\\Brand Assets\\");
  await userEvent.setup().click(screen.getByRole("button", { name: "Stop using Brand Assets" }));
  expect(onClear).toHaveBeenCalledTimes(1);
});
