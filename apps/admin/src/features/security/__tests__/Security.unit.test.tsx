import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { Security } from "../Security";
import type { AccessTokensController } from "../hooks/use-access-tokens.hooks";

/**
 * @file `Security` — the page shell around `AccessTokensTab` (`resolveActiveTabId`, the page
 * header, and the one-tab `TabBar`). Mirrors `SourceControl.unit.test.tsx`'s page-shell block;
 * `AccessTokensTab`'s own body is `AccessTokensTab.unit.test.tsx`'s job, not this file's, so the
 * fixture below only needs to satisfy `useAccessTokensHook`'s type — its own `useOtherCredentialsHook`
 * default (real `useWiredOtherCredentials`, unmocked `lib/api`) degrades harmlessly the same way
 * `use-admin-execution-credential`'s own doc describes: a failed fetch in a test environment settles
 * to an empty/unset state rather than throwing.
 */

function makeAccessTokens(overrides: Partial<AccessTokensController> = {}): AccessTokensController {
  return {
    groups: [],
    loadError: null,
    query: "",
    setQuery: () => {},
    category: "all",
    setCategory: () => {},
    totalCount: 0,
    matchCount: 0,
    setExistingField: () => {},
    replaceToken: async () => {},
    removeToken: async () => {},
    makeDefault: async () => {},
    openAddForm: () => {},
    closeAddForm: () => {},
    setAddField: () => {},
    createToken: async () => {},
    customAddForm: { name: "", category: "general", baseUrl: "", token: "", username: "", saving: false, error: null },
    setCustomAddField: () => {},
    resetCustomAddForm: () => {},
    createCustomCredential: async () => false,
    t: (key: string) => key,
    ...overrides,
  };
}

function renderPage(tabId?: string | null) {
  return render(<Security tabId={tabId} useAccessTokensHook={() => makeAccessTokens()} />);
}

afterEach(() => {
  // `navigate()` drives real `history.pushState` — same cleanup convention
  // `SourceControl.unit.test.tsx`'s cross-link block uses, so one test's click never leaks into the next.
  window.history.replaceState(null, "", "/");
});

describe("Security — page shell", () => {
  it("renders a page header (Operations kicker, Security title) above a TabBar", () => {
    renderPage();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Security" })).toBeInTheDocument();
  });

  it("shows exactly one active Access Tokens tab in the TabBar", () => {
    renderPage();
    const tablist = screen.getByRole("tablist");
    const tab = within(tablist).getByRole("tab", { name: /Access Tokens/ });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(1);
  });

  it("resolveActiveTabId falls back to the Access Tokens tab for an absent or unrecognized ?tab= value", () => {
    renderPage("not-a-real-tab");
    expect(screen.getByRole("tab", { name: /Access Tokens/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Access Tokens/ })).toBeInTheDocument();
  });

  it("resolveActiveTabId accepts the one real tab id explicitly", () => {
    renderPage("access-tokens");
    expect(screen.getByRole("tab", { name: /Access Tokens/ })).toHaveAttribute("aria-selected", "true");
  });

  it("renders the AccessTokensTab body underneath, not just the tab bar", () => {
    renderPage();
    // `useOtherCredentialsHook` is left at its real default here (unmocked lib/api, degrades to an
    // empty/loading state in a test environment) — this only proves `Security` mounts
    // `AccessTokensTab` at all, which `AccessTokensTab.unit.test.tsx` covers in full.
    expect(screen.getByText("Loading access tokens…")).toBeInTheDocument();
  });

  it("handleTabChange navigates to the clicked tab's own URL, replacing history", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: /Access Tokens/ }));
    expect(window.location.pathname).toBe("/admin/access-tokens");
    expect(window.location.search).toBe("?tab=access-tokens");
  });
});
