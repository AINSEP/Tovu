import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { Security } from "../Security";
import type { AccessTokensController } from "../hooks/use-access-tokens.hooks";
import type { SecurityPermissionsController } from "../hooks/use-security-permissions.hooks";
import type { SiteTokenController } from "../hooks/use-site-token.hooks";

/**
 * @file `Security` — the page shell around `AccessTokensTab`/`SiteTokenTab` (`resolveActiveTabId`,
 * the page header, and the `TabBar`). Mirrors `SourceControl.unit.test.tsx`'s page-shell block;
 * `AccessTokensTab`'s own body is `AccessTokensTab.unit.test.tsx`'s job, not this file's, so its
 * fixture only needs to satisfy `useAccessTokensHook`'s type — its own `useOtherCredentialsHook`
 * default (real `useWiredOtherCredentials`, unmocked `lib/api`) degrades harmlessly the same way
 * `use-admin-execution-credential`'s own doc describes: a failed fetch in a test environment
 * settles to an empty/unset state rather than throwing. `useSiteTokenHook` is given an explicit
 * fixture instead of relying on that same degrade-harmlessly behavior — `SiteTokenTab`'s own body
 * is covered by `SiteTokenTab.unit.test.tsx`, so this file passes an explicit fixture rather than
 * depending on that suite's real `lib/api` degrade behavior.
 *
 * `useSecurityPermissionsHook` is ALWAYS supplied explicitly below (never left at its real
 * `useWiredSecurityPermissions` default) — the whole point of these tests is the Site Token tab's
 * permission gate (2026-09-10), so each test states which principal it is exercising rather than
 * relying on however an unmocked `/auth/me` happens to degrade in jsdom.
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
    customAddForm: { name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "", saving: false, error: null },
    setCustomAddField: () => {},
    resetCustomAddForm: () => {},
    createCustomCredential: async () => false,
    t: (key: string) => key,
    ...overrides,
  };
}

function makeSiteToken(overrides: Partial<SiteTokenController> = {}): SiteTokenController {
  return {
    status: undefined,
    loadError: null,
    revealing: false,
    revealError: null,
    revealedHex: null,
    reveal: async () => {},
    hideRevealed: () => {},
    generating: false,
    generateError: null,
    generate: async () => {},
    t: (key: string) => key,
    ...overrides,
  };
}

function makePermissions(canManageSiteToken: boolean): SecurityPermissionsController {
  return { canManageSiteToken };
}

function renderPage(options: { tabId?: string | null; canManageSiteToken: boolean }) {
  return render(
    <Security
      tabId={options.tabId}
      useAccessTokensHook={() => makeAccessTokens()}
      useSiteTokenHook={() => makeSiteToken()}
      useSecurityPermissionsHook={() => makePermissions(options.canManageSiteToken)}
    />
  );
}

afterEach(() => {
  // `navigate()` drives real `history.pushState` — same cleanup convention
  // `SourceControl.unit.test.tsx`'s cross-link block uses, so one test's click never leaks into the next.
  window.history.replaceState(null, "", "/");
});

describe("Security — page shell", () => {
  it("renders a page header (Operations kicker, Secrets title) above a TabBar", () => {
    renderPage({ canManageSiteToken: false });
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Secrets" })).toBeInTheDocument();
  });

  it("renders the AccessTokensTab body underneath, not just the tab bar", () => {
    renderPage({ canManageSiteToken: false });
    // `useOtherCredentialsHook` is left at its real default here (unmocked lib/api, degrades to an
    // empty/loading state in a test environment) — this only proves `Security` mounts
    // `AccessTokensTab` at all, which `AccessTokensTab.unit.test.tsx` covers in full.
    expect(screen.getByText("Loading access tokens…")).toBeInTheDocument();
  });

  it("handleTabChange navigates to the clicked tab's own URL, replacing history", async () => {
    const user = userEvent.setup();
    renderPage({ canManageSiteToken: true });
    await user.click(screen.getByRole("tab", { name: /Access Tokens/ }));
    expect(window.location.pathname).toBe("/admin/access-tokens");
    expect(window.location.search).toBe("?tab=access-tokens");
  });

  describe("Site Token tab — gated on admin.security.tokens.manage (2026-09-10)", () => {
    it("shows the Site Token tab and its panel for a principal WITH the permission", () => {
      renderPage({ tabId: "site-token", canManageSiteToken: true });
      const tablist = screen.getByRole("tablist");
      expect(within(tablist).getAllByRole("tab")).toHaveLength(2);
      const tab = within(tablist).getByRole("tab", { name: /Site Token/ });
      expect(tab).toHaveAttribute("aria-selected", "true");
    });

    it("publishes the Site Token tab's agent label describing the corrected site-token wording", () => {
      renderPage({ tabId: "site-token", canManageSiteToken: true });
      expect(screen.getByRole("tab", { name: /Site Token/ })).toHaveAttribute(
        "data-agent-label",
        "Switch to the Site Token tab — view and generate the Site Token that decrypts every credential this install has saved (BYOK/AI keys, publish, source-control, media-provider, and MCP credentials), plus webhook signing and newsletter tokens on a local install"
      );
    });

    it("hides the Site Token tab entirely for a principal WITHOUT the permission", () => {
      renderPage({ canManageSiteToken: false });
      const tablist = screen.getByRole("tablist");
      expect(within(tablist).queryByRole("tab", { name: /Site Token/ })).not.toBeInTheDocument();
      expect(within(tablist).getAllByRole("tab")).toHaveLength(1);
    });

    it("resolves a direct ?tab=site-token link to Access Tokens for a principal WITHOUT the permission, rendering neither the tab nor its panel", () => {
      const { container } = renderPage({ tabId: "site-token", canManageSiteToken: false });
      expect(screen.getByRole("tab", { name: /Access Tokens/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.queryByRole("tab", { name: /Site Token/ })).not.toBeInTheDocument();
      // `SiteTokenTab.tsx`'s own root `<div>` carries `data-agent-element="security-site-token"`
      // (`agentHandle` — a plain data attribute, NOT a real ARIA role/label). Its absence proves the
      // panel itself never mounted, not just that its tab button is hidden.
      expect(container.querySelector('[data-agent-element="security-site-token"]')).not.toBeInTheDocument();
    });

    it("still resolves an absent or unrecognized ?tab= value to Access Tokens regardless of permission", () => {
      renderPage({ tabId: "not-a-real-tab", canManageSiteToken: true });
      expect(screen.getByRole("tab", { name: /Access Tokens/ })).toHaveAttribute("aria-selected", "true");
    });
  });
});
