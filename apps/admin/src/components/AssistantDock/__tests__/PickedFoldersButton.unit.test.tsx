import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PickedFoldersButton, folderName } from "../PickedFoldersButton";

/** @file The composer's attached-folders button: count, tooltip, the list a click opens, and × per folder. */

afterEach(cleanup);

const FOLDERS = ["/Users/la/Downloads/Additional Assets", "C:\\Users\\la\\Desktop\\Brand Assets\\"];

it("renders nothing while no folder is attached", () => {
  const { container } = render(<PickedFoldersButton folders={[]} onRemove={vi.fn()} />);
  expect(container).toBeEmptyDOMElement();
});

it("shows the count, and its tooltip names every folder the agent reads", () => {
  render(<PickedFoldersButton folders={FOLDERS} onRemove={vi.fn()} />);
  const trigger = screen.getByRole("button", { name: "Agent reads: Additional Assets, Brand Assets" });
  expect(trigger).toHaveAttribute("title", "Agent reads: Additional Assets, Brand Assets");
  expect(trigger).toHaveTextContent("2");
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("a click opens one row per folder, full path on hover, and × removes that folder", async () => {
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(<PickedFoldersButton folders={FOLDERS} onRemove={onRemove} />);
  await user.click(screen.getByRole("button", { name: /Agent reads/ }));
  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(screen.getByText("Additional Assets")).toHaveAttribute("title", FOLDERS[0]);
  expect(screen.getByText("Brand Assets")).toHaveAttribute("title", FOLDERS[1]);
  await user.click(screen.getByRole("menuitem", { name: "Stop using Brand Assets" }));
  expect(onRemove).toHaveBeenCalledExactlyOnceWith(FOLDERS[1]);
});

it("Escape closes the list and returns focus to the button; so does a click outside it", async () => {
  const user = userEvent.setup();
  render(<><button type="button">elsewhere</button><PickedFoldersButton folders={FOLDERS} onRemove={vi.fn()} /></>);
  const trigger = screen.getByRole("button", { name: /Agent reads/ });
  await user.click(trigger);
  await user.tab();
  expect(screen.getByRole("menuitem", { name: "Stop using Additional Assets" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByRole("button", { name: "elsewhere" }));
  expect(screen.queryByRole("menu")).toBeNull();
});

it("removing the last folder moves focus to the composer input, not <body>", async () => {
  const user = userEvent.setup();
  render(
    <div className="jini-composer">
      <textarea className="jini-composer-input" aria-label="message" />
      <PickedFoldersButton folders={[FOLDERS[0]!]} onRemove={vi.fn()} />
    </div>,
  );
  await user.click(screen.getByRole("button", { name: /Agent reads/ }));
  await user.click(screen.getByRole("menuitem", { name: "Stop using Additional Assets" }));
  expect(screen.getByRole("textbox", { name: "message" })).toHaveFocus();
});

it("names a folder by its last segment, for either separator and a trailing one", () => {
  expect(folderName("/a/b/Brand")).toBe("Brand");
  expect(folderName("C:\\a\\Brand\\")).toBe("Brand");
});
