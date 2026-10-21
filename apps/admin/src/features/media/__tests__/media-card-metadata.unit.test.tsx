import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { Media } from "../Media";

afterEach(() => vi.unstubAllGlobals());

describe("legacy media cards", () => {
  it("renders size and upload date beneath status with the original timestamp on time", async () => {
    const createdAt = "2026-10-03T23:30:00-02:00";
    const item = {
      id: "metadata-card", workspaceId: "workspace-local", title: "Metadata photo", slug: "metadata-photo",
      alt: "", caption: "", credit: "", sha256: "hash", status: "active", createdAt, updatedAt: createdAt,
      version: 1, width: null, height: null, cssClass: null, htmlAttributes: null,
      contentType: "image/png", publicUrl: null, byteSize: 9_961_472,
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.includes("/settings/effective") ? { data: [] }
        : url.includes("/users") ? { users: [] } : { media: [item] };
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    }));
    render(<FetchQueryProvider><Media /></FetchQueryProvider>);
    // why: the card title is now the file name with its extension, split by MiddleTruncate into head/tail spans; its full name is the InfoTip trigger's accessible name.
    const title = await screen.findByRole("button", { name: "Metadata photo.png" });
    const card = title.closest(".media-card")!;
    const line = card.querySelector(".media-card-size")!;
    expect(line).toHaveTextContent("9.5 MB · Oct 4, 2026");
    expect(line.querySelector("time")).toHaveAttribute("datetime", createdAt);
    expect(card.querySelector(".status-active")).toBeInTheDocument();
  });
});
