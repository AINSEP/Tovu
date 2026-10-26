import { render, screen, waitFor } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdminPublishCredentialSummary } from "@/lib/api";
import { CLOUDFLARE_PAGES_TARGET } from "../../deployment/__tests__/publish-targets.fixture";
import { AccessTokensTab } from "../AccessTokensTab";
import { createFakeAccessTokensPort } from "../hooks/access-tokens-dependencies.hooks";
import type { AccessTokensPort } from "../hooks/access-tokens-port.hooks";
import { useAccessTokens } from "../hooks/use-access-tokens.hooks";
import type { AccessTokensController } from "../hooks/use-access-tokens.hooks";
import type { OtherCredentialsController } from "../hooks/use-other-credentials.hooks";
import { useCopyKeys } from "../hooks/use-copy-keys.hooks";
import { accessTokenProviderInfo, accessTokenProviders } from "../rules";

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
    worksForOptions: [],
    setExistingField: () => {},
    replaceToken: async () => {},
    removeToken: async () => {},
    makeDefault: async () => {},
    openAddForm: () => {},
    closeAddForm: () => {},
    setAddField: () => {},
    createToken: async () => {},
    customAddForm: { name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "", worksFor: [], saving: false, error: null },
    setCustomAddField: () => {},
    resetCustomAddForm: () => {},
    createCustomCredential: async () => false,
    customKeyBusy: {},
    setCustomKeyUse: async () => {},
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
  it("links to Plugins when the Hosting filter has no providers", () => {
    render(<AccessTokensTab useAccessTokensHook={() => makeAccessTokens({ category: "hosting" })} useOtherCredentialsHook={() => makeOtherCredentials()} />);
    expect(screen.getByText("Enable a hosting plugin to manage its access tokens.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plugins" })).toHaveAttribute("href", "/admin/addons/agent-plugins");
  });

  it("saves and clears Works for with the token and required account fields left blank", async () => {
    const user = userEvent.setup();
    let saved: AdminPublishCredentialSummary = {
      credentialType: "vendor", worksFor: ["plugin-off"],
      id: "cf-works-for", providerId: "cloudflare-pages", label: "Production", configured: true,
      isDefault: true, accountLabel: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const update = vi.fn<AccessTokensPort["publish"]["update"]>(async (_id, input) => {
      saved = { ...saved, worksFor: input.worksFor ?? saved.worksFor };
      return saved;
    });
    const port = createFakeAccessTokensPort({
      publishTargets: { list: async () => [CLOUDFLARE_PAGES_TARGET] },
      publish: { list: async () => ({ credentials: [saved], executionMode: "self-hosted-cli" }), update },
    });
    render(<AccessTokensTab useAccessTokensHook={() => useAccessTokens(port, key => key, "en")} useOtherCredentialsHook={() => makeOtherCredentials()} />);
    await user.click(await screen.findByText("Replace token", { exact: true }));
    await user.click(screen.getByRole("button", { name: "plugin-off", pressed: true }));
    await user.click(screen.getByRole("button", { name: "Save — Production" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("cf-works-for", { worksFor: [] }));
    expect(screen.getByLabelText("API token", { exact: true })).toHaveValue("");
    expect(screen.getByLabelText("Account ID", { exact: true })).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Cloudflare Pages", pressed: false }));
    await user.click(screen.getByRole("button", { name: "Save — Production" }));
    await waitFor(() => expect(update).toHaveBeenLastCalledWith("cf-works-for", { worksFor: ["cloudflare-pages"] }));
  });

  it("renders the autocomplete=off attribute guard on the search field", () => {
    render(<AccessTokensTab useAccessTokensHook={() => makeAccessTokens()} useOtherCredentialsHook={() => makeOtherCredentials()} />);

    expect(screen.getByLabelText("Search access tokens")).toHaveAttribute("autocomplete", "off");
  });
});

describe("AccessTokensTab descriptor input fallbacks", () => {
  // Pins AccessTokensTab.tsx:484: info.tokenLabel ?? translate("Access token").
  it.each([
    { descriptor: { ...CLOUDFLARE_PAGES_TARGET, credential: { tokenField: "token", fields: [] } }, label: "Access token" },
    { descriptor: CLOUDFLARE_PAGES_TARGET, label: "API token" },
  ])("labels the secret input exactly '$label'", ({ descriptor, label }) => {
    const info = accessTokenProviderInfo(accessTokenProviders([descriptor], []), { kind: "publish", providerId: "cloudflare-pages" });
    render(<AccessTokensTab
      useAccessTokensHook={() => makeAccessTokens({
        groups: [{
          info,
          rows: [],
          addForm: { visible: true, name: "", token: "", values: {}, username: "", worksFor: [], readyToSave: false, saving: false, error: null },
        }],
      })}
      useOtherCredentialsHook={() => makeOtherCredentials()}
    />);

    const token = screen.getByLabelText(label, { exact: true });
    expect(token).toHaveAttribute("id", "security-add-publish-cloudflare-pages-token");
    expect(token).toHaveAttribute("type", "password");
  });

  // Pins AccessTokensTab.tsx:574: values[field.name] ?? "" when a successful replacement resets values.
  it("clears the mounted Account ID input after saving a replacement token", async () => {
    const user = userEvent.setup();
    const saved: AdminPublishCredentialSummary = {
    credentialType: "vendor", worksFor: [],
      id: "cf-1",
      providerId: "cloudflare-pages",
      label: "Production",
      configured: true,
      isDefault: true,
      accountLabel: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    };
    const update = vi.fn<AccessTokensPort["publish"]["update"]>(async (id, input) => {
      if (id !== "cf-1" || input.connection?.providerId !== "cloudflare-pages"
        || input.connection.token !== "cf-replacement" || input.connection.accountId !== "acct-replacement") {
        throw new Error("Unexpected Cloudflare replacement request");
      }
      return { ...saved, updatedAt: "2026-08-02T00:00:00.000Z" };
    });
    const port = createFakeAccessTokensPort({
      publishTargets: { list: async () => [CLOUDFLARE_PAGES_TARGET] },
      publish: { list: async () => ({ credentials: [saved], executionMode: "self-hosted-cli" }), update },
    });
    render(<AccessTokensTab
      useAccessTokensHook={() => useAccessTokens(port, (key: string) => key, "en")}
      useOtherCredentialsHook={() => makeOtherCredentials()}
    />);

    await user.click(await screen.findByText("Replace token", { exact: true }));
    const accountId = screen.getByLabelText("Account ID", { exact: true });
    expect(accountId).toHaveValue("");
    await user.type(accountId, "acct-replacement");
    await user.type(screen.getByLabelText("API token", { exact: true }), "cf-replacement");
    expect(accountId).toHaveValue("acct-replacement");
    await user.click(screen.getByRole("button", { name: "Save — Production" }));

    expect(update).toHaveBeenCalledExactlyOnceWith("cf-1", {
      connection: { providerId: "cloudflare-pages", token: "cf-replacement", accountId: "acct-replacement" },
    });
    await waitFor(() => expect(screen.getByLabelText("API token", { exact: true })).toHaveValue(""));
    expect(screen.getByLabelText("Account ID", { exact: true })).toBe(accountId);
    expect(accountId).toHaveValue("");
  });
});

describe("AccessTokensTab empty categories", () => {
  it.each(["ops", "general"] as const)("shows the existing Not connected copy for an empty %s category", (category) => {
    render(<AccessTokensTab useAccessTokensHook={() => makeAccessTokens({ category })} useOtherCredentialsHook={() => makeOtherCredentials()} />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(document.querySelector(".access-tokens-tier .empty-state")).toHaveTextContent("Not connected");
  });
});

describe("AccessTokensTab project copy entry", () => {
  // Entry hidden per owner 2026-10-11; `CopyKeysDialog`/`useCopyKeys` stay wired behind
  // `SHOW_COPY_KEYS_ENTRY` in `AccessTokensTab.tsx`.
  it("renders no copy-keys entry and never lists copy sources", () => {
    const listCredentialCopySources = vi.fn().mockResolvedValue({ sources: [] });
    const copyCredentials = vi.fn();
    render(<AccessTokensTab
      useAccessTokensHook={() => makeAccessTokens()}
      useOtherCredentialsHook={() => makeOtherCredentials()}
      useCopyKeysHook={input => useCopyKeys(input, { port: { listCredentialCopySources, copyCredentials } })}
    />);
    expect(screen.queryByRole("button", { name: "Copy keys from another project…" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Copy keys from another project…" })).toBeNull();
    expect(listCredentialCopySources).not.toHaveBeenCalled();
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

  it.each([
    ["Source control", "ArrowLeft", "All", "all", "source-control"],
    ["General", "Home", "All", "all", "general"],
    ["All", "ArrowLeft", "General", "general", "all"],
    ["General", "ArrowRight", "All", "all", "general"],
  ] as const)("moves focus from %s with %s to %s, including wraparound", async (from, key, to, category, initialCategory) => {
    const user = userEvent.setup();
    const setCategory = vi.fn();
    render(<AccessTokensTab useAccessTokensHook={() => makeAccessTokens({ category: initialCategory, setCategory })} useOtherCredentialsHook={() => makeOtherCredentials()} />);
    screen.getByRole("tab", { name: from }).focus();
    await user.keyboard(`{${key}}`);
    expect(setCategory).toHaveBeenCalledExactlyOnceWith(category);
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: to }));
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

  /** The "+ Add custom provider" button is a real, Tab-reachable control that lives INSIDE this
   *  `role="tablist"` div. A keydown on it bubbles to the tablist's own `onKeyDown`, so without an
   *  origin check the tabs handler would answer arrow keys pressed on a button that is not a tab:
   *  it would silently change the category filter and yank focus off the button the operator was
   *  standing on. Only the keys the tabs pattern owns are affected, which is exactly why this is
   *  invisible until someone Tabs to that button and presses an arrow. */
  it("ignores an arrow key pressed on the non-tab Add custom provider button inside the tablist", async () => {
    const user = userEvent.setup();
    const setCategory = vi.fn();
    render(
      <AccessTokensTab
        useAccessTokensHook={() => makeAccessTokens({ setCategory })}
        useOtherCredentialsHook={() => makeOtherCredentials()}
      />,
    );

    const addButton = screen.getByRole("button", { name: "+ Add custom provider" });
    addButton.focus();
    await user.keyboard("{ArrowRight}");

    expect(setCategory).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(addButton);
  });
});

describe("AccessTokensTab project copy entry, when re-enabled", () => {
  it("renders the entry and opens the copy dialog, which lists the copy sources", async () => {
    const user = userEvent.setup();
    const listCredentialCopySources = vi.fn().mockResolvedValue({ sources: [] });
    render(<AccessTokensTab
      showCopyKeysEntry
      useAccessTokensHook={() => makeAccessTokens()}
      useOtherCredentialsHook={() => makeOtherCredentials()}
      useCopyKeysHook={input => useCopyKeys(input, { port: { listCredentialCopySources, copyCredentials: vi.fn() } })}
    />);
    await user.click(screen.getByRole("button", { name: "Copy keys from another project…" }));
    await waitFor(() => expect(listCredentialCopySources).toHaveBeenCalledTimes(1));
  });
});
