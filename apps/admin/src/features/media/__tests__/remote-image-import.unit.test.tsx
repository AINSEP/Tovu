/** Quick wins A: visible URL-import action, retryable errors, and media-list invalidation. */
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { RemoteImageImport } from "../RemoteImageImport";
import { useRemoteImageImport } from "../hooks/use-remote-image-import.hooks";
import { KEYS } from "../rules";
import { MEDIA_DICT } from "../media-i18n";

const wrapper = ({ children }: { children: React.ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;

describe("remote media import", () => {
  it("presents the URL action and passes trimmed URL/alt through the injected port", async () => {
    const importFromUrl = vi.fn().mockResolvedValue({ media: { id: "new-media" } });
    render(<RemoteImageImport t={(key) => key} dependencies={{ port: { importFromUrl } }} />, { wrapper });
    fireEvent.change(screen.getByLabelText("Remote image URL"), { target: { value: " https://cdn.example/fox.png " } });
    fireEvent.change(screen.getByLabelText("Imported image alt text (optional)"), { target: { value: " A fox " } });
    fireEvent.click(screen.getByRole("button", { name: "Import from URL" }));
    await waitFor(() => expect(importFromUrl).toHaveBeenCalledWith({ url: "https://cdn.example/fox.png" }, { alt: "A fox" }));
    await waitFor(() => expect(screen.getByLabelText("Remote image URL")).toHaveValue(""));
  });

  it("retains the draft and displays a refusal, then invalidates the media list after retry", async () => {
    const importFromUrl = vi.fn().mockRejectedValueOnce(new Error("Target is not public")).mockResolvedValue({ media: { id: "new-media" } });
    const list = vi.fn().mockResolvedValue({ media: [] });
    const { result } = renderHook(() => {
      useFetchQuery({ key: KEYS.list, fetch: list });
      return useRemoteImageImport({ t: (key) => key }, { port: { importFromUrl } });
    }, { wrapper });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    act(() => { result.current.setUrl("https://cdn.example/fox.png"); });
    await act(() => result.current.submit());
    // The mutation's error state reaches observers on the adapter's notify batch, after the
    // rejected promise `submit` awaited, so wait for it rather than reading it synchronously.
    await waitFor(() => expect(result.current.error).toContain("Target is not public"));
    expect(result.current.url).toBe("https://cdn.example/fox.png");
    await act(() => result.current.submit());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBeNull();
    expect(result.current.url).toBe("");
  });

  it("ships import copy in every feature locale", () => {
    for (const dictionary of Object.values(MEDIA_DICT)) {
      for (const key of ["Remote image URL", "Imported image alt text (optional)", "Import from URL", "Importing…", "Could not import media."]) {
        expect(dictionary[key]).toBeTruthy();
      }
    }
  });
});
