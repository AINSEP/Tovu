import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PrincipalSelectorStatus, Settings } from "../Settings";

/**
 * @file `Settings()`'s permission-derivation regression (`lib/permissions.ts`'s
 * `hasPermission()`): `canReadOtherPrincipal` gates `PrincipalSelector`'s visibility (AC-23) via
 * `has("settings.user.read")`. That `has()` used to be a bare `permissions.includes(...)`, so an
 * owner whose only grant is the literal wildcard `["*"]` (never the expanded string
 * `"settings.user.read"` itself) never saw the selector despite holding every permission.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const EMPTY_SETTINGS_PAGE = { data: [] as unknown[] };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mocks the fixed call sequence `Settings`/`SettingsContainer` make on mount: `/auth/me`,
 * `listUsers`, then the auto-loaded `core.presentation` namespace's two `getSettingsEffective`
 * calls (with, then without, a `principalId`). */
function mockMountSequence(effectivePermissions: string[]) {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ user: { id: "p1", username: "owner" }, effectivePermissions }))
    .mockResolvedValueOnce(jsonResponse({ users: [] }))
    .mockResolvedValueOnce(jsonResponse(EMPTY_SETTINGS_PAGE))
    .mockResolvedValueOnce(jsonResponse(EMPTY_SETTINGS_PAGE));
}

it("shows the cross-principal selector for an owner holding only the wildcard grant", async () => {
  mockMountSequence(["*"]);

  render(<Settings />);

  expect(await screen.findByLabelText(/manage another principal's settings/i)).toBeInTheDocument();
});

it("hides the cross-principal selector for a principal without settings.user.read (even holding other settings grants)", async () => {
  mockMountSequence(["settings.global.write"]);

  render(<Settings />);

  // Wait for the screen to finish its initial render/load before asserting an absence.
  expect(await screen.findByLabelText(/namespace/i)).toBeInTheDocument();
  expect(screen.queryByLabelText(/manage another principal's settings/i)).not.toBeInTheDocument();
});

// Direct coverage of the status line extracted out of `PrincipalSelector`'s own render body under
// the tightened ≤9/≤9 pass. Neither branch had a test before this pass — the two tests above only
// cover the selector's permission-gated visibility, never its validationState-driven status line.
describe("PrincipalSelectorStatus", () => {
  it("renders nothing while idle or checking", () => {
    const { container: idle } = render(<PrincipalSelectorStatus validationState="idle" value={null} lastError={null} />);
    expect(idle).toBeEmptyDOMElement();

    const { container: checking } = render(<PrincipalSelectorStatus validationState="checking" value={null} lastError={null} />);
    expect(checking).toBeEmptyDOMElement();
  });

  it("shows the 'now viewing' confirmation once valid with a value", () => {
    render(<PrincipalSelectorStatus validationState="valid" value="member@example.com" lastError={null} />);
    expect(screen.getByText(/now viewing\/editing member@example\.com's user-layer settings/i)).toBeInTheDocument();
  });

  it("renders nothing when valid but value is null (cleared)", () => {
    const { container } = render(<PrincipalSelectorStatus validationState="valid" value={null} lastError={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces the validation error as an alert", () => {
    render(<PrincipalSelectorStatus validationState="error" value={null} lastError="no such principal" />);
    expect(screen.getByRole("alert")).toHaveTextContent("no such principal");
  });

  it("renders nothing when in the error state but lastError is null", () => {
    const { container } = render(<PrincipalSelectorStatus validationState="error" value={null} lastError={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
