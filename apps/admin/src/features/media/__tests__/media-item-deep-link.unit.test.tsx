import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { Media } from "../Media";
import { renderMediaPanel } from "../../../media-panel";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";

/**
 * @file `/admin/media?id=<mediaId>` deep link (open-bugs 10-31 "no deep link to a single media
 * item"). The item's metadata dialog is the media detail view; the URL names it so a link (from the
 * assistant, a bookmark, a reload) lands on that item, and opening/closing it keeps the URL honest.
 */

const ITEM = {
  id: "media-1",
  workspaceId: "workspace-local",
  title: "Sunset Photo",
  slug: "sunset-photo",
  alt: "",
  caption: "",
  credit: "",
  sha256: "abc123",
  contentType: "image/png",
  status: "active",
  createdAt: "2026-07-02T09:00:00.000Z",
  updatedAt: "2026-07-02T09:00:00.000Z",
  version: 1,
  width: null,
  height: null,
  cssClass: null,
  htmlAttributes: null,
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.stubGlobal("fetch", (url: string) => {
    if (String(url).includes("/settings/effective")) return Promise.resolve(jsonResponse({ data: [] }));
    if (String(url).includes("/media")) return Promise.resolve(jsonResponse({ media: [ITEM] }));
    return Promise.reject(new Error(`no mocked route for ${String(url)}`));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function renderScreen(props: React.ComponentProps<typeof Media> = {}) {
  return render(
    <FetchQueryProvider>
      <Media {...props} />
    </FetchQueryProvider>,
  );
}

function editDialog(): HTMLElement {
  return document.querySelector("dialog.media-edit-dialog") as HTMLElement;
}

describe("/admin/media?id= deep link", () => {
  it("the route hands ?id= to the Media screen", () => {
    const element = renderMediaPanel({ query: new URLSearchParams("id=media-1&tab=images") } as never) as ReactElement<{ itemId?: string | null; tabId?: string | null }>;
    expect(element.props.itemId).toBe("media-1");
    expect(element.props.tabId).toBe("images");
  });

  it("opens the named item's metadata dialog on load", async () => {
    renderScreen({ itemId: "media-1" });
    await waitFor(() => expect(editDialog().hasAttribute("open")).toBe(true));
    expect(within(editDialog()).getByLabelText("Title")).toHaveValue("Sunset Photo");
    expect(screen.queryByText("That media item wasn't found.")).toBeNull();
  });

  it("writes ?id= when the owner opens an item and drops it when they close it", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /edit "sunset photo"/i }));
    await waitFor(() => expect(window.location.search).toBe("?tab=all&id=media-1"));
    await user.click(within(editDialog()).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(window.location.search).toBe("?tab=all"));
    expect(editDialog().hasAttribute("open")).toBe(false);
  });

  it("follows a URL change while the page is open", async () => {
    const view = renderScreen();
    await screen.findByRole("button", { name: /edit "sunset photo"/i });
    expect(editDialog().hasAttribute("open")).toBe(false);
    view.rerender(
      <FetchQueryProvider>
        <Media itemId="media-1" />
      </FetchQueryProvider>,
    );
    await waitFor(() => expect(editDialog().hasAttribute("open")).toBe(true));
  });

  it("an unknown id shows the normal grid and a short notice, no dialog", async () => {
    renderScreen({ itemId: "no-such-item" });
    expect(await screen.findByText("That media item wasn't found.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit "sunset photo"/i })).toBeInTheDocument();
    expect(editDialog().hasAttribute("open")).toBe(false);
  });
});
