import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FormEditor } from "../FormEditor";

/**
 * @file `FormEditor` — pins the fix for the audit's live-verified blocker (exec summary #3): a
 * bogus form id previously rendered `"form definition 'X' was not found"` AND, underneath it, a
 * fully live, empty, saveable form with a working Save button — because the original guard
 * (`if (!isNew && !form && !error) return <Loading/>`) only covered the pre-error state, and fell
 * through once `error` was set. Follows the RTL harness `Plugins.unit.test.tsx` established for
 * this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a form id that does not resolve", () => {
  it("renders only the not-found error, never a live Save button underneath it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "form definition 'bogus' was not found" }, 404));

    render(<FormEditor formId="bogus" />);

    expect(await screen.findByText(/was not found/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create form/i })).not.toBeInTheDocument();
    // The fields table (`Add field` control) must not be reachable either — the whole editor body.
    expect(screen.queryByRole("button", { name: /add field/i })).not.toBeInTheDocument();
  });
});

describe("a later save failure, after the form already loaded", () => {
  it("keeps the editor on screen and shows the error inline, rather than blanking it", async () => {
    const form = {
      id: "f1",
      name: "Contact",
      slug: "contact",
      status: "active",
      fields: [],
      notify: { enabled: false, recipients: [] },
    };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: form }))
      .mockResolvedValueOnce(jsonResponse({ error: "save failed" }, 500));

    render(<FormEditor formId="f1" />);

    const saveButton = await screen.findByRole("button", { name: /^save$/i });
    saveButton.click();

    expect(await screen.findByText("save failed")).toBeInTheDocument();
    // Still on screen, not replaced by an error-only view.
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });
});
