import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminMedia, AdminPost } from "@/lib/api";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { usePostEditor } from "../hooks/use-post-editor.hooks";
import { usePostFeaturedImage } from "../hooks/use-post-featured-image.hooks";
import { PostPublishingFields } from "../PostPublishingFields";
import { isScheduledPost, isoToLocalDateTimeInput, localDateTimeInputToIso } from "../rules";

/**
 * @file Scheduled publishing + featured image in the post editor (2026-10-05): the local-time
 * conversion rules, the editor hook's load/save of both fields, the picker hook, and the controls.
 */

const POST: AdminPost = {
  id: "p1",
  workspaceId: "ws1",
  kind: "post",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
  bodyFormat: "doc",
  status: "draft",
  templateChoice: null,
  overridesThemePage: false,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 3,
};

const fakeT = (key: string): string => key;

afterEach(() => {
  localStorage.clear();
});

describe("schedule rules", () => {
  it("round-trips a stored UTC time through the datetime-local value", () => {
    const iso = "2099-01-01T16:30:00.000Z";
    const local = isoToLocalDateTimeInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(localDateTimeInputToIso(local)).toBe(iso);
  });

  it("empty or unparseable values mean no schedule", () => {
    expect(isoToLocalDateTimeInput(null)).toBe("");
    expect(isoToLocalDateTimeInput(undefined)).toBe("");
    expect(isoToLocalDateTimeInput("nope")).toBe("");
    expect(localDateTimeInputToIso("")).toBeNull();
    expect(localDateTimeInputToIso("nope")).toBeNull();
  });

  it("only a published row with a future publishAt is scheduled", () => {
    const now = Date.parse("2026-10-05T00:00:00Z");
    expect(isScheduledPost({ status: "published", publishAt: "2099-01-01T00:00:00Z" }, now)).toBe(true);
    expect(isScheduledPost({ status: "draft", publishAt: "2099-01-01T00:00:00Z" }, now)).toBe(false);
    expect(isScheduledPost({ status: "published", publishAt: "2020-01-01T00:00:00Z" }, now)).toBe(false);
    expect(isScheduledPost({ status: "published", publishAt: null }, now)).toBe(false);
  });
});

describe("usePostEditor — publishAt / featured image", () => {
  it("loads both fields, reports scheduled, and a save that did not touch them sends neither key", async () => {
    const stored = { ...POST, status: "published" as const, publishAt: "2099-01-01T16:30:00.000Z", featuredMediaId: "m1" };
    const port = createFakePostEditorPort({ post: stored });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: vi.fn(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await waitFor(() => expect(result.current.post).not.toBeNull());

    expect(result.current.publishAtInput).toBe(isoToLocalDateTimeInput(stored.publishAt));
    expect(result.current.featuredMediaId).toBe("m1");
    expect(result.current.scheduled).toBe(true);
    expect(result.current.dirty).toBe(false);

    act(() => result.current.setSlug("renamed"));
    await act(async () => {
      await result.current.save();
    });
    expect("publishAt" in port.updatePostCalls[0]).toBe(false);
    expect("featuredMediaId" in port.updatePostCalls[0]).toBe(false);
  });

  it("changing either field marks the editor dirty and saves the UTC time and the media id", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: vi.fn(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await waitFor(() => expect(result.current.post).not.toBeNull());

    const local = isoToLocalDateTimeInput("2099-03-04T05:06:00.000Z");
    act(() => {
      result.current.setPublishAtInput(local);
      result.current.setFeaturedMediaId("m9");
    });
    await waitFor(() => expect(result.current.dirty).toBe(true));
    await act(async () => {
      await result.current.save("published");
    });

    expect(port.updatePostCalls[0]).toMatchObject({ publishAt: "2099-03-04T05:06:00.000Z", featuredMediaId: "m9", status: "published" });
    expect(result.current.dirty).toBe(false);
  });

  it("clearing a stored schedule and image sends explicit nulls", async () => {
    const port = createFakePostEditorPort({ post: { ...POST, publishAt: "2099-01-01T16:30:00.000Z", featuredMediaId: "m1" } });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: vi.fn(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await waitFor(() => expect(result.current.featuredMediaId).toBe("m1"));

    act(() => {
      result.current.setPublishAtInput("");
      result.current.setFeaturedMediaId(null);
    });
    await act(async () => {
      await result.current.save();
    });
    expect(port.updatePostCalls[0]).toMatchObject({ publishAt: null, featuredMediaId: null });
  });
});

describe("usePostFeaturedImage", () => {
  it("selecting stores the asset id and closes; clear sends null; preview uses the media URL", () => {
    const onChange = vi.fn();
    const port = { mediaOriginalUrl: (id: string) => `/media/${id}` };
    const { result, rerender } = renderHook(({ value }) => usePostFeaturedImage(value, onChange, { port }), {
      initialProps: { value: null as string | null },
    });
    expect(result.current.previewUrl).toBeNull();
    act(() => result.current.openPicker());
    expect(result.current.pickerOpen).toBe(true);
    act(() => result.current.handleSelect({ id: "m7" } as AdminMedia));
    expect(onChange).toHaveBeenLastCalledWith("m7");
    expect(result.current.pickerOpen).toBe(false);
    rerender({ value: "m7" });
    expect(result.current.previewUrl).toBe("/media/m7");
    act(() => result.current.clear());
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("asks the picker for images only", () => {
    const port = { mediaOriginalUrl: (id: string) => `/media/${id}` };
    const { result } = renderHook(() => usePostFeaturedImage(null, vi.fn(), { port }));
    expect(result.current.accept).toEqual(["image/*"]);
  });

  it("a preview that fails to load is reported until the value changes", () => {
    const port = { mediaOriginalUrl: (id: string) => `/media/${id}` };
    const { result, rerender } = renderHook(({ value }) => usePostFeaturedImage(value, vi.fn(), { port }), {
      initialProps: { value: "m-video" as string | null },
    });
    expect(result.current.previewFailed).toBe(false);
    act(() => result.current.onPreviewError());
    expect(result.current.previewFailed).toBe(true);
    rerender({ value: "m-image" });
    expect(result.current.previewFailed).toBe(false);
  });
});

describe("PostPublishingFields", () => {
  const fakePicker = (overrides: Partial<ReturnType<typeof usePostFeaturedImage>> = {}) => () => ({
    pickerOpen: false,
    openPicker: vi.fn(),
    closePicker: vi.fn(),
    handleSelect: vi.fn(),
    clear: vi.fn(),
    previewUrl: null,
    accept: ["image/*"],
    previewFailed: false,
    onPreviewError: vi.fn(),
    ...overrides,
  });

  it("edits the publish-at input and shows the Scheduled badge only when scheduled", () => {
    const setPublishAtInput = vi.fn();
    const { rerender } = render(
      <PostPublishingFields publishAtInput="" setPublishAtInput={setPublishAtInput} scheduled={false} featuredMediaId={null} setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker()} />,
    );
    expect(screen.queryByText("Scheduled")).toBeNull();
    fireEvent.change(screen.getByLabelText("Publish at"), { target: { value: "2099-01-01T09:00" } });
    expect(setPublishAtInput).toHaveBeenCalledWith("2099-01-01T09:00");
    rerender(
      <PostPublishingFields publishAtInput="2099-01-01T09:00" setPublishAtInput={setPublishAtInput} scheduled featuredMediaId={null} setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker()} />,
    );
    expect(screen.getByText("Scheduled")).toBeTruthy();
  });

  it("shows Choose image with no image, and Change + Remove + preview with one", () => {
    const clear = vi.fn();
    const { rerender } = render(
      <PostPublishingFields publishAtInput="" setPublishAtInput={vi.fn()} scheduled={false} featuredMediaId={null} setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker()} />,
    );
    expect(screen.getByRole("button", { name: "Choose image" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    rerender(
      <PostPublishingFields publishAtInput="" setPublishAtInput={vi.fn()} scheduled={false} featuredMediaId="m1" setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ clear, previewUrl: "/media/m1" })} />,
    );
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Featured image" }).getAttribute("src")).toBe("/media/m1");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(clear).toHaveBeenCalled();
  });

  it("a featured media that cannot be shown renders a fixed-size placeholder, not a broken image", () => {
    render(
      <PostPublishingFields publishAtInput="" setPublishAtInput={vi.fn()} scheduled={false} featuredMediaId="m-video" setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ previewUrl: "/media/m-video", previewFailed: true })} />,
    );
    expect(screen.queryByRole("img", { name: "Featured image" })).toBeNull();
    const placeholder = screen.getByRole("img", { name: "Featured image unavailable" });
    expect(placeholder.tagName).toBe("SPAN");
    expect(placeholder.className).toContain("editor-featured-preview");
  });

  it("a broken preview image reports through onPreviewError", () => {
    const onPreviewError = vi.fn();
    render(
      <PostPublishingFields publishAtInput="" setPublishAtInput={vi.fn()} scheduled={false} featuredMediaId="m1" setFeaturedMediaId={vi.fn()} t={fakeT} useFeaturedImage={fakePicker({ previewUrl: "/media/m1", onPreviewError })} />,
    );
    fireEvent.error(screen.getByRole("img", { name: "Featured image" }));
    expect(onPreviewError).toHaveBeenCalled();
  });
});
