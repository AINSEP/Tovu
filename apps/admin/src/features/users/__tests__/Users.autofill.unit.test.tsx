import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { Users } from "../Users";

/**
 * @file Regression coverage for the owner-reported bug: the "New user" form's `type="password"`
 * input (`NewUserForm`, `Users.tsx`) carried no `autoComplete` attribute. Combined with the
 * `type="email"` input right above it inside a real `<form>`, the pair reads to Chrome as a LOGIN
 * form shape, and Chrome offered to autofill the logged-in ADMIN's own saved email/password into a
 * form meant to create a DIFFERENT user account.
 *
 * Fix follows the corrected precedent this repo already established for the identical bug on
 * `security/AccessTokensTab.tsx`'s token field (`fc64f2d9`, superseding `dcc23788`'s
 * `autoComplete="off"` attempt): Chrome has deliberately ignored `autocomplete="off"` on
 * credential-shaped fields since ~2014, precisely to stop sites from blocking password managers.
 * `autoComplete="new-password"` is the value Chrome (and Safari/Firefox) actually honor as "this is
 * an account-creation field, not a saved login" — per WHATWG's own autofill spec, pairing it on the
 * password field is what reclassifies the WHOLE form as signup rather than login, which is also why
 * only the password input needs the attribute (same reasoning `fc64f2d9`'s commit message documents:
 * fixing the password field alone was enough to stop the surrounding fields' autofill too).
 *
 * KNOWN TRADE-OFF, not fixed here: Chrome may now offer to GENERATE a password on this field — a
 * suggestion popup rather than a silent wrong value, the better failure mode per `fc64f2d9`.
 *
 * NOT PROVEN, and cannot be, by this test: Chrome autofill never fires in jsdom/Playwright (no saved
 * credential store exists there). This only asserts the rendered `autocomplete` attribute — the same
 * disclosed limitation `AccessTokensTab.unit.test.tsx` already carries for its own version of this
 * bug. Only the owner's real browser, which already showed the bug once, can confirm it stops.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // Same locale-request carve-out `Users.unit.test.tsx` uses — `useAdminLocale()` would otherwise
  // consume one of this file's strictly-ordered `mockResolvedValueOnce` slots.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    // `useUsers` now also calls `port.me()` unconditionally on mount (password-banner plan,
    // 2026-09-24 Slice 3 deep-link half) — same carve-out as `Users.unit.test.tsx`.
    if (String(url).endsWith("/auth/me")) {
      return Promise.resolve(jsonResponse({ user: { id: "not-a-seeded-user" } }));
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Users — New user form autofill guard", () => {
  it("marks the password field new-password so Chrome cannot silently offer the admin's own saved login", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ users: [] }))
      .mockResolvedValueOnce(jsonResponse({ roles: [] }))
      .mockResolvedValueOnce(jsonResponse({ policies: [] }));
    render(
      <FetchQueryProvider>
        <Users />
      </FetchQueryProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "New user" }));

    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });
});
