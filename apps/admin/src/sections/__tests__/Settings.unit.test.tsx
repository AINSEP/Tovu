import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Settings } from "../Settings";

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
