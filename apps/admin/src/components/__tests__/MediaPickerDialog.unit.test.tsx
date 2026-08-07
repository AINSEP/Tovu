import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError, type AdminMedia } from "../../lib/api";
import { MediaPickerDialog } from "../MediaPickerDialog/MediaPickerDialog";
import type { useMediaPickerDialog } from "../MediaPickerDialog/MediaPickerDialog.hooks";

/**
 * @file First test file for `MediaPickerDialog` (0% before this refactor pass — no test file
 * existed at all, flat or split). Written against the post-split `MediaPickerDialog.tsx` +
 * `MediaPickerDialog.hooks.tsx` — the JSX and hook bodies were moved verbatim (see both files' own
 * headers), so this suite exercising the real default `useMediaPickerDialog` hook end-to-end
 * (mocking only `api.listMedia`, the actual network boundary, the same way
 * `WidgetConfigFields.unit.test.tsx` mocks `api.listMenus`/`api.listForms`) is the equivalence
 * check the pre-refactor file never had.
 *
 * The `useDialog`-injection describe block at the bottom is the seam-specific test the split adds:
 * it proves `MediaPickerDialog` actually reads through the prop rather than the hardcoded import.
 */

function mediaItem(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "m1",
    workspaceId: "w1",
    title: "Sunset",
    alt: "A sunset over water",
    caption: "",
    credit: "",
    sha256: "abc",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MediaPickerDialog — loading/error/empty", () => {
  it("shows a loading notice before the fetch resolves", () => {
    vi.spyOn(api, "listMedia").mockReturnValue(new Promise(() => {}));
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Loading media…")).toBeInTheDocument();
  });

  it("shows a describable error notice on a failed fetch", async () => {
    vi.spyOn(api, "listMedia").mockRejectedValue(new ApiError("media table locked", 500));
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText("media table locked")).toBeInTheDocument();
  });

  it("points to the Media screen when nothing has been uploaded yet", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText(/No media uploaded yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Media" })).toHaveAttribute("href", "/admin/media");
  });
});

describe("MediaPickerDialog — populated grid", () => {
  it("renders one button per active item, with its thumbnail and title", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem()] });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);

    // Queried by `title` rather than accessible name: the button's computed name is its content
    // (image `alt` + the visible title span concatenated), not the `title` attribute alone, which
    // only wins as an accessible-name fallback when there's no content — not the case here.
    const item = await screen.findByTitle("Sunset");
    const img = item.querySelector("img");
    expect(img).toHaveAttribute("src", api.mediaOriginalUrl("m1"));
    expect(img).toHaveAttribute("alt", "A sunset over water");
    expect(item).toHaveTextContent("Sunset");
  });

  it("falls back to the title as alt text when the asset has none", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem({ alt: "" })] });
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} />);

    const img = await screen.findByRole("img");
    expect(img).toHaveAttribute("alt", "Sunset");
  });

  it("calls onSelect with the clicked item", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [mediaItem()] });
    const onSelect = vi.fn();
    render(<MediaPickerDialog onSelect={onSelect} onCancel={vi.fn()} />);

    await user.click(await screen.findByTitle("Sunset"));
    expect(onSelect).toHaveBeenCalledWith(mediaItem());
  });
});

describe("MediaPickerDialog — dismissal", () => {
  it("calls onCancel on Cancel button click", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    const onCancel = vi.fn();
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={onCancel} />);

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on a backdrop click but not on a click inside the dialog panel", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    const onCancel = vi.fn();
    const { container } = render(<MediaPickerDialog onSelect={vi.fn()} onCancel={onCancel} />);

    await user.click(await screen.findByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();

    await user.click(container.querySelector(".settings-dialog-backdrop")!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Escape, via the real useMediaPickerDialog hook", async () => {
    vi.spyOn(api, "listMedia").mockResolvedValue({ media: [] });
    const onCancel = vi.fn();
    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={onCancel} />);

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("MediaPickerDialog — useDialog injection", () => {
  it("renders entirely off an injected useDialog — api.listMedia is never called", () => {
    const listMedia = vi.spyOn(api, "listMedia");
    const select = vi.fn();
    const fakeUseDialog: typeof useMediaPickerDialog = (onSelect) => ({
      items: [mediaItem({ id: "fake-1", title: "Fake asset" })],
      error: null,
      select: (item) => {
        select(item);
        onSelect(item);
      },
    });

    render(<MediaPickerDialog onSelect={vi.fn()} onCancel={vi.fn()} useDialog={fakeUseDialog} />);

    // Content only the fake could have produced — the real hook, given no mock, would never
    // resolve `items` synchronously like this.
    expect(screen.getByTitle("Fake asset")).toBeInTheDocument();
    expect(listMedia).not.toHaveBeenCalled();
  });
});
