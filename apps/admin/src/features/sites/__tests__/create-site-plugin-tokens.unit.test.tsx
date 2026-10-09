import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AdminSitesSnapshot, AdminTokenSignInPlugin } from "@/lib/api";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { CreateSiteOnboarding, type CreateSiteOnboardingProps } from "../CreateSiteOnboarding";
import { createFakeSitesPort } from "../hooks/sites-dependencies.hooks";
import type { SitesPort } from "../hooks/sites-port.hooks";
import { useCreateSitePluginTokens, type CreateSitePluginTokensController } from "../hooks/use-create-site-plugin-tokens.hooks";
import { useSites } from "../hooks/use-sites.hooks";
import { createdTokensNoteKey, tokensForCreate } from "../rules";
import { resolveSiteDatabaseOptions, useCreateSiteDatabase } from "../Sites.hooks";

/**
 * @file Create-site onboarding's optional inline token fields: the pure rules, the
 * `useCreateSitePluginTokens` hook against the fake port, the create call through `useSites`, and
 * the disclosures in `CreateSiteOnboarding`. An empty field must leave the create body exactly
 * as it always was.
 */

const fakeT = (key: string): string => key;
const SUPABASE: AdminTokenSignInPlugin = { pluginId: "supabase", displayName: "Supabase", helpUrl: "https://supabase.com/dashboard/account/tokens" };

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const snapshot: AdminSitesSnapshot = {
  switchingEnabled: true,
  sites: [],
  currentSite: { dir: "/repo/sites/alpha", name: "alpha", dirOverridden: false, listed: true },
  persistedSiteName: null,
};

describe("rules", () => {
  it("tokensForCreate trims, drops empty fields, and is undefined when nothing was typed", () => {
    expect(tokensForCreate({})).toBeUndefined();
    expect(tokensForCreate({ supabase: "   ", other: "" })).toBeUndefined();
    expect(tokensForCreate({ supabase: "  sbp_x  ", other: " " })).toEqual({ supabase: "sbp_x" });
  });

  it("createdTokensNoteKey: saved and failed each have a line; none or absent has none", () => {
    expect(createdTokensNoteKey("saved")).toBe("will connect when this site first starts.");
    expect(createdTokensNoteKey("failed")).toBe("couldn't be saved. Open the site and ask the assistant to connect it.");
    expect(createdTokensNoteKey("none")).toBeNull();
    expect(createdTokensNoteKey(undefined)).toBeNull();
  });
});

describe("useCreateSitePluginTokens", () => {
  it("offers one empty field per plugin the server lists, and collects only what was typed", async () => {
    const port = createFakeSitesPort(snapshot, { listTokenSignInPlugins: () => Promise.resolve({ plugins: [SUPABASE] }) });
    const { result } = renderHook(() => useCreateSitePluginTokens(port), { wrapper });

    await waitFor(() => expect(result.current.fields).toHaveLength(1));
    expect(result.current.fields[0]).toEqual({ ...SUPABASE, token: "" });
    expect(result.current.tokensForCreate()).toBeUndefined();

    act(() => result.current.setToken("supabase", " sbp_typed "));
    expect(result.current.fields[0]?.token).toBe(" sbp_typed ");
    expect(result.current.tokensForCreate()).toEqual({ supabase: "sbp_typed" });
    expect(result.current.displayNames(["supabase", "unknown"])).toEqual(["Supabase", "unknown"]);

    act(() => result.current.clear());
    expect(result.current.fields[0]?.token).toBe("");
    expect(result.current.tokensForCreate()).toBeUndefined();
  });

  it("no plugins listed: no fields", async () => {
    const listTokenSignInPlugins = vi.fn().mockResolvedValue({ plugins: [] });
    const port = createFakeSitesPort(snapshot, { listTokenSignInPlugins });
    const { result } = renderHook(() => useCreateSitePluginTokens(port), { wrapper });
    await waitFor(() => expect(listTokenSignInPlugins).toHaveBeenCalled());
    expect(result.current.fields).toEqual([]);
  });
});

describe("useSites create with tokens", () => {
  it("an empty field sends only the name", async () => {
    const createSite = vi.fn().mockResolvedValue({ site: { name: "gamma", dir: "/repo/sites/gamma", siteId: "id-1" }, agentPluginTokens: { status: "none", pluginIds: [] } });
    const port = createFakeSitesPort(snapshot, { createSite, listTokenSignInPlugins: () => Promise.resolve({ plugins: [SUPABASE] }) });
    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.pluginTokens.fields).toHaveLength(1));

    act(() => result.current.setCreateName("gamma"));
    await act(async () => result.current.createSite());

    await waitFor(() => expect(result.current.createdName).toBe("gamma"));
    expect(createSite).toHaveBeenCalledWith({ name: "gamma", adminPassword: "tovu-dev" });
    expect(result.current.createdTokens).toBeNull();
  });

  it("a typed token rides with the create, is cleared after it, and the created line names the service", async () => {
    const createSite = vi.fn().mockResolvedValue({ site: { name: "gamma", dir: "/repo/sites/gamma", siteId: "id-1" }, agentPluginTokens: { status: "saved", pluginIds: ["supabase"] } });
    const port = createFakeSitesPort(snapshot, { createSite, listTokenSignInPlugins: () => Promise.resolve({ plugins: [SUPABASE] }) });
    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.pluginTokens.fields).toHaveLength(1));

    act(() => {
      result.current.setCreateName("gamma");
      result.current.pluginTokens.setToken("supabase", "sbp_typed");
    });
    await act(async () => result.current.createSite());

    await waitFor(() => expect(result.current.createdName).toBe("gamma"));
    expect(createSite).toHaveBeenCalledWith({ name: "gamma", adminPassword: "tovu-dev", agentPluginTokens: { supabase: "sbp_typed" } });
    expect(result.current.createdTokens).toEqual({ names: ["Supabase"], note: "will connect when this site first starts." });
    expect(result.current.pluginTokens.fields[0]?.token).toBe("");
  });

  it("a refused token keeps what was typed, so the person can fix it", async () => {
    const createSite = vi.fn().mockRejectedValue(new Error("That Supabase access token didn't work."));
    const port = createFakeSitesPort(snapshot, { createSite, listTokenSignInPlugins: () => Promise.resolve({ plugins: [SUPABASE] }) });
    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.pluginTokens.fields).toHaveLength(1));

    act(() => {
      result.current.setCreateName("gamma");
      result.current.pluginTokens.setToken("supabase", "sbp_bad");
    });
    await act(async () => result.current.createSite());

    await waitFor(() => expect(result.current.writeError).not.toBeNull());
    expect(result.current.createdName).toBeNull();
    expect(result.current.pluginTokens.fields[0]?.token).toBe("sbp_bad");
  });
});

function tokensController(overrides: Partial<CreateSitePluginTokensController> = {}): CreateSitePluginTokensController {
  return { fields: [], setToken: vi.fn(), tokensForCreate: () => undefined, displayNames: (ids) => [...ids], clear: vi.fn(), ...overrides };
}

// Production cannot provision hosted content databases. Exercise future selectable states through
// the real selection hook with an injected capability list, rather than changing that boundary.
const useSelectableDatabase: typeof useCreateSiteDatabase = (input) => useCreateSiteDatabase(input, {
  options: resolveSiteDatabaseOptions(input.t).map((option) => ({ ...option, available: true })),
});

function WiredOnboarding({ port }: { port: SitesPort }) {
  const controller = useSites(port, fakeT);
  return <CreateSiteOnboarding controller={controller} onCancel={() => {}} useDatabase={useSelectableDatabase} />;
}

function renderOnboarding(pluginTokens: CreateSitePluginTokensController, useDatabase = useCreateSiteDatabase) {
  const controller: CreateSiteOnboardingProps["controller"] = {
    createName: "",
    adminPassword: "",
    setAdminPassword: vi.fn(),
    adminPasswordInputType: "password",
    adminPasswordRevealLabel: "Show admin password",
    toggleAdminPasswordVisibility: vi.fn(),
    setCreateName: vi.fn(),
    createNameError: null,
    createSite: vi.fn(),
    creating: false,
    switchingEnabled: true,
    pluginTokens,
    t: fakeT,
  };
  return render(<CreateSiteOnboarding controller={controller} onCancel={vi.fn()} useDatabase={useDatabase} />);
}

describe("CreateSiteOnboarding inline database disclosures", () => {
  it("has no standalone Connect services section, including with offered plugins", () => {
    renderOnboarding(tokensController({ fields: [{ ...SUPABASE, token: "" }] }));
    expect(screen.queryByRole("heading", { name: "Connect services" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Connect services" })).toBeNull();
    expect(screen.queryByPlaceholderText("Paste an access token")).toBeNull();
    expect(screen.queryByLabelText("Provider name")).toBeNull();
    expect(screen.queryByLabelText("Connection string or API endpoint")).toBeNull();
    const group = screen.getByRole("group", { name: "Database" });
    expect(group.tagName).toBe("FIELDSET");
    expect(group.querySelector("legend")?.textContent).toBe("Database");
  });

  it("offers no token disclosure without an installed Supabase plugin", async () => {
    const user = userEvent.setup();
    renderOnboarding(tokensController(), useSelectableDatabase);
    await user.click(screen.getByRole("radio", { name: "Supabase" }));
    expect(screen.queryByPlaceholderText("Paste an access token")).toBeNull();
    expect(screen.getByRole("radio", { name: "Supabase" }).hasAttribute("aria-controls")).toBe(false);
  });

  it("shows and focuses the optional password field under Supabase only after selecting it", async () => {
    const user = userEvent.setup();
    const setToken = vi.fn();
    renderOnboarding(tokensController({ fields: [{ ...SUPABASE, token: "" }], setToken }), useSelectableDatabase);
    const radio = screen.getByRole("radio", { name: "Supabase" });
    expect(radio.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByPlaceholderText("Paste an access token")).toBeNull();

    await user.click(radio);
    expect((radio as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "SQLite" }) as HTMLInputElement).checked).toBe(false);
    expect(radio.getAttribute("aria-expanded")).toBe("true");
    const disclosure = document.getElementById(radio.getAttribute("aria-controls")!);
    expect(disclosure).not.toBeNull();
    expect(radio.closest(".site-db-option")?.contains(disclosure)).toBe(true);
    const input = within(disclosure!).getByLabelText("Paste an access token") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("new-password");
    expect(input.required).toBe(false);
    const link = within(disclosure!).getByRole("link", { name: "Create a token" });
    expect(link.getAttribute("href")).toBe(SUPABASE.helpUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("No token? Leave it empty. You can ask the assistant to connect it later.")).toBeTruthy();
    expect(screen.queryByLabelText("Provider name")).toBeNull();

    await user.type(input, "x");
    expect(setToken).toHaveBeenCalledWith("supabase", "x");
    await user.click(screen.getByRole("radio", { name: "SQLite" }));
    expect(radio.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByPlaceholderText("Paste an access token")).toBeNull();
    expect(setToken).toHaveBeenLastCalledWith("supabase", "");
  });

  it("reveals custom DB fields only under its selected radio and focuses the first field", async () => {
    const user = userEvent.setup();
    renderOnboarding(tokensController({ fields: [{ ...SUPABASE, token: "" }] }), useSelectableDatabase);
    const radio = screen.getByRole("radio", { name: "Custom DB Provider" });
    expect(radio.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Provider name")).toBeNull();
    expect(screen.queryByLabelText("Connection string or API endpoint")).toBeNull();

    await user.click(radio);
    const provider = screen.getByLabelText("Provider name");
    const connection = screen.getByLabelText("Connection string or API endpoint");
    const disclosure = document.getElementById(radio.getAttribute("aria-controls")!);
    expect(radio.getAttribute("aria-expanded")).toBe("true");
    expect(radio.closest(".site-db-option")?.contains(disclosure)).toBe(true);
    expect(disclosure?.contains(provider)).toBe(true);
    expect(disclosure?.contains(connection)).toBe(true);
    expect(document.activeElement).toBe(provider);
    expect((provider as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByText("Shown for what's coming. It isn't stored anywhere yet.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Paste an access token")).toBeNull();

    await user.click(screen.getByRole("radio", { name: "Supabase" }));
    expect(radio.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Provider name")).toBeNull();
    expect(screen.queryByLabelText("Connection string or API endpoint")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Paste an access token"));
  });

  it("keeps tokens hidden when another installed plugin has a token field", async () => {
    const user = userEvent.setup();
    renderOnboarding(tokensController({ fields: [{ pluginId: "github", displayName: "GitHub", helpUrl: "https://github.com/settings/tokens", token: "" }] }), useSelectableDatabase);
    await user.click(screen.getByRole("radio", { name: "Supabase" }));
    expect(screen.queryByPlaceholderText("Paste an access token")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Connect services" })).toBeNull();
  });

  it("clears hidden tokens when the onboarding form is left", () => {
    const clear = vi.fn();
    const view = renderOnboarding(tokensController({ clear }));
    view.unmount();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it.each(["SQLite", "Custom DB Provider"])("sends only the name after a typed Supabase token is hidden by selecting %s", async (nextRadio) => {
    const user = userEvent.setup();
    const createSite = vi.fn().mockResolvedValue({ site: { name: "gamma", dir: "/repo/sites/gamma", siteId: "id-1" }, agentPluginTokens: { status: "none", pluginIds: [] } });
    const port = createFakeSitesPort(snapshot, { createSite, listTokenSignInPlugins: () => Promise.resolve({ plugins: [SUPABASE] }) });
    render(<WiredOnboarding port={port} />, { wrapper });
    const radio = screen.getByRole("radio", { name: "Supabase" });
    await waitFor(() => expect(radio.getAttribute("aria-controls")).toBe("site-db-supabase-fields"));
    await user.type(screen.getByLabelText("Folder name"), "gamma");
    await user.click(radio);
    await user.type(screen.getByLabelText("Paste an access token"), "sbp_test_fixture");
    await user.click(screen.getByRole("radio", { name: nextRadio }));
    expect(screen.queryByLabelText("Paste an access token")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Create site" }));
    await waitFor(() => expect(createSite).toHaveBeenCalledWith({ name: "gamma", adminPassword: "tovu-dev" }));
    expect(createSite).toHaveBeenCalledTimes(1);
  });

  it("sends the selected inline token through the existing flow without echoing it into form copy", async () => {
    const user = userEvent.setup();
    const createSite = vi.fn().mockResolvedValue({ site: { name: "gamma", dir: "/repo/sites/gamma", siteId: "id-1" }, agentPluginTokens: { status: "saved", pluginIds: ["supabase"] } });
    const port = createFakeSitesPort(snapshot, { createSite, listTokenSignInPlugins: () => Promise.resolve({ plugins: [SUPABASE] }) });
    const view = render(<WiredOnboarding port={port} />, { wrapper });
    const radio = screen.getByRole("radio", { name: "Supabase" });
    await waitFor(() => expect(radio.getAttribute("aria-controls")).toBe("site-db-supabase-fields"));
    await user.type(screen.getByLabelText("Folder name"), "gamma");
    await user.click(radio);
    const input = screen.getByLabelText("Paste an access token") as HTMLInputElement;
    await user.type(input, " sbp_test_fixture ");
    expect(input.value).toBe(" sbp_test_fixture ");
    expect(view.container.textContent).not.toContain("sbp_test_fixture");
    await user.click(screen.getByRole("button", { name: "Create site" }));
    await waitFor(() => expect(createSite).toHaveBeenCalledWith({ name: "gamma", adminPassword: "tovu-dev", agentPluginTokens: { supabase: "sbp_test_fixture" } }));
    await waitFor(() => expect(input.value).toBe(""));
    expect(view.container.textContent).not.toContain("sbp_test_fixture");
  });

  it("supports keyboard radio selection and moves focus into the revealed token input", async () => {
    const user = userEvent.setup();
    renderOnboarding(tokensController({ fields: [{ ...SUPABASE, token: "" }] }), useSelectableDatabase);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Folder name"));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Set a different admin password"));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show admin password" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "SQLite" }));
    await user.keyboard("[ArrowRight]");
    expect((screen.getByRole("radio", { name: "Supabase" }) as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText("Paste an access token"));
  });
});
