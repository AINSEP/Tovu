import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminSitesSnapshot, AdminTokenSignInPlugin } from "@/lib/api";
import { FetchQueryProvider } from "@jini-ai/ui/fetch-query";
import { CreateSiteOnboarding, type CreateSiteOnboardingProps } from "../CreateSiteOnboarding";
import { createFakeSitesPort } from "../hooks/sites-dependencies.hooks";
import { useCreateSitePluginTokens, type CreateSitePluginTokensController } from "../hooks/use-create-site-plugin-tokens.hooks";
import { useSites } from "../hooks/use-sites.hooks";
import { createdTokensNoteKey, tokensForCreate } from "../rules";

/**
 * @file Create-site onboarding's optional "Connect services" token fields: the pure rules, the
 * `useCreateSitePluginTokens` hook against the fake port, the create call through `useSites`, and
 * the section's render in `CreateSiteOnboarding`. An empty field must leave the create body exactly
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
    expect(createSite).toHaveBeenCalledWith({ name: "gamma" });
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
    expect(createSite).toHaveBeenCalledWith({ name: "gamma", agentPluginTokens: { supabase: "sbp_typed" } });
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

function renderOnboarding(pluginTokens: CreateSitePluginTokensController) {
  const controller: CreateSiteOnboardingProps["controller"] = {
    createName: "",
    setCreateName: vi.fn(),
    createNameError: null,
    createSite: vi.fn(),
    creating: false,
    switchingEnabled: true,
    pluginTokens,
    t: fakeT,
  };
  return render(<CreateSiteOnboarding controller={controller} onCancel={vi.fn()} />);
}

describe("CreateSiteOnboarding Connect services", () => {
  it("is hidden when no installed plugin takes a token", () => {
    renderOnboarding(tokensController());
    expect(screen.queryByRole("group", { name: "Connect services" })).toBeNull();
  });

  it("shows an optional password field per plugin, with its tokens page opening in a new tab", () => {
    const setToken = vi.fn();
    renderOnboarding(tokensController({ fields: [{ ...SUPABASE, token: "" }], setToken }));

    // Scoped: the Database section has its own "Supabase" card.
    const group = screen.getByRole("group", { name: "Connect services" });
    const input = within(group).getByLabelText("Supabase") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.autocomplete).toBe("new-password");
    const link = within(group).getByRole("link", { name: "Create a token" });
    expect(link.getAttribute("href")).toBe(SUPABASE.helpUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");

    fireEvent.change(input, { target: { value: "sbp_typed" } });
    expect(setToken).toHaveBeenCalledWith("supabase", "sbp_typed");
  });
});
