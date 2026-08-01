import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dashboard } from "../Dashboard";

/**
 * @file `Dashboard` — the audit's exec-summary finding #5: two `useEffect` fetches with no
 * `.catch()` left both stat cards showing "…" forever on a real failure, on the very first screen
 * every operator sees. Pins the fix: each fetch now surfaces its own error via the `notice error`
 * convention, and a failure in one card's data never blanks the other's. Follows the RTL harness
 * `Plugins.unit.test.tsx` established for this package (mocked global `fetch`, no server).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const POSTS_RESPONSE = {
  posts: [{ post: { status: "published" } }, { post: { status: "published" } }, { post: { status: "draft" } }],
};
const PRESENTATION_RESPONSE = { settings: { activeThemeId: "editorial" }, availableThemeIds: ["editorial"] };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("renders both cards' real data when both fetches succeed", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse(POSTS_RESPONSE)).mockResolvedValueOnce(jsonResponse(PRESENTATION_RESPONSE));

  render(<Dashboard />);

  expect(await screen.findByText("3")).toBeInTheDocument(); // postCount
  expect(screen.getByText(/2 published/)).toBeInTheDocument();
  expect(screen.getByText("editorial")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

describe("a failed post-count fetch", () => {
  it("shows an error notice on the Content card without blanking the Theme card", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse(PRESENTATION_RESPONSE));

    render(<Dashboard />);

    expect(await screen.findByText("network down")).toBeInTheDocument();
    expect(screen.getByText("editorial")).toBeInTheDocument();
    // The failed card must not still read "…" forever once the error is known.
    expect(screen.queryByText("…")).not.toBeInTheDocument();
  });
});

describe("a failed presentation fetch", () => {
  it("shows an error notice on the Theme card without blanking the Content card", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(POSTS_RESPONSE))
      .mockRejectedValueOnce(new Error("network down"));

    render(<Dashboard />);

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(await screen.findByText("network down")).toBeInTheDocument();
  });
});

it("shows an independent error notice per card when both fetches fail", async () => {
  fetchMock
    .mockRejectedValueOnce(new Error("posts failed"))
    .mockRejectedValueOnce(new Error("presentation failed"));

  render(<Dashboard />);

  expect(await screen.findByText("posts failed")).toBeInTheDocument();
  expect(await screen.findByText("presentation failed")).toBeInTheDocument();
});
