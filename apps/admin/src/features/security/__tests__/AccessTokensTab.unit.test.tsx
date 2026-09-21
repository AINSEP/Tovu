import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccessTokensTab } from "../AccessTokensTab";
import type { AccessTokensController } from "../hooks/use-access-tokens.hooks";
import type { OtherCredentialsController } from "../hooks/use-other-credentials.hooks";

/**
 * @file Regression coverage for the owner-reported bug: this page's search box was filling itself
 * in with "admin" (Tovu's default owner login) on its own, with nothing in the app writing that
 * value. Root cause: the `<input>` in `AccessTokensSearch` (`AccessTokensTab.tsx`) carried no
 * `autoComplete` attribute. That alone would be enough on many pages, but this page's own shape
 * makes it worse: nothing here wraps the search box in a `<form>`, yet every already-connected
 * `TokenRow` keeps a real `type="password"` token input in the DOM inside its (closed-by-default)
 * `<details>` — collapsed, not unmounted. Chrome's FORMLESS credential-autofill heuristic groups a
 * page's text-like fields with whatever password fields it finds by DOM proximity; it does not
 * require a `<form>` tag or the password field to be visible. A page holding any saved rows at all
 * (the common case here — this tab exists to show already-connected tokens) therefore looks to
 * Chrome like a login surface, and it offers the site's saved login for the first text-like field,
 * same as `ProvidersTab.tsx`'s own token input already guards against with `autoComplete="off"`
 * (`ProvidersTab.tsx:332`) — this test applies that same established local fix to this input.
 *
 * LIMITATION (stated per the dispatch brief, not glossed over): this only asserts the rendered
 * `autocomplete` attribute. This repo's Playwright Chromium profile carries no saved credentials,
 * so actual browser autofill can never fire in CI and this test cannot reproduce or prove the bug
 * fixed end-to-end — it proves the guard is present, nothing more. Only the owner's real browser,
 * which already showed the bug once, can confirm autofill no longer happens.
 */

/** Minimal `AccessTokensController` fake — this test only cares about the search box, so every
 *  field is a safe no-op/empty default; `groups: []` (not `undefined`) is what makes
 *  `AccessTokensBody` render past its loading gate. */
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

/** Minimal `OtherCredentialsController` fake, same reasoning as {@link makeAccessTokens}. */
function makeOtherCredentials(overrides: Partial<OtherCredentialsController> = {}): OtherCredentialsController {
  return {
    groups: [],
    loadError: null,
    totalCount: 0,
    matchCount: 0,
    setDraftToken: () => {},
    replace: async () => {},
    remove: async () => {},
    t: (key: string) => key,
    ...overrides,
  };
}

describe("AccessTokensTab search box", () => {
  it("disables browser autocomplete so Chrome cannot silently fill in a saved login", () => {
    render(<AccessTokensTab useAccessTokensHook={() => makeAccessTokens()} useOtherCredentialsHook={() => makeOtherCredentials()} />);

    expect(screen.getByLabelText("Search access tokens")).toHaveAttribute("autocomplete", "off");
  });
});

/**
 * `AccessTokensCategoryFilter`'s `role="tab"` pills had no `onKeyDown` — the same missing WAI-ARIA
 * tabs keyboard pattern `TabBar.tsx` had (plan finding F5, sink). Reuses `TabBar.hooks.tsx`'s
 * `resolveTabBarKeyTarget`/`resolveTabBarTabIndex`/`useTabBarKeyboard` rather than reimplementing
 * the same logic — `ACCESS_TOKEN_CATEGORIES`'s `{ id, label }` shape structurally satisfies
 * `TabBarTab`, and none of these categories are ever disabled.
 */
describe("AccessTokensTab category filter keyboard (WAI-ARIA tabs)", () => {
  it("moves focus and calls setCategory on the next category on ArrowRight", async () => {
    const user = userEvent.setup();
    const setCategory = vi.fn();
    render(
      <AccessTokensTab
        useAccessTokensHook={() => makeAccessTokens({ setCategory })}
        useOtherCredentialsHook={() => makeOtherCredentials()}
      />,
    );

    screen.getByRole("tab", { name: "All" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(setCategory).toHaveBeenCalledWith("source-control");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Source control" }));
  });

  it("moves focus to the last category on End", async () => {
    const user = userEvent.setup();
    const setCategory = vi.fn();
    render(
      <AccessTokensTab
        useAccessTokensHook={() => makeAccessTokens({ setCategory })}
        useOtherCredentialsHook={() => makeOtherCredentials()}
      />,
    );

    screen.getByRole("tab", { name: "All" }).focus();
    await user.keyboard("{End}");

    expect(setCategory).toHaveBeenCalledWith("general");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "General" }));
  });

  it("gives only the active category a roving tabindex of 0, and leaves the Add custom provider button untouched", () => {
    render(
      <AccessTokensTab
        useAccessTokensHook={() => makeAccessTokens({ category: "media" })}
        useOtherCredentialsHook={() => makeOtherCredentials()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Media" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "+ Add custom provider" })).not.toHaveAttribute("tabindex");
  });
});
