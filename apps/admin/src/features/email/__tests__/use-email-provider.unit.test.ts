import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { useEmailProvider } from "../hooks/use-email-provider.hooks";
import { createEmailFake, MAIL_PLUGIN, PROVIDER } from "./email.test-helpers";

/** @file Provider saves never switch lanes; switching requires a separate confirmed action. */
describe("useEmailProvider", () => {
  it("requires a new key, trims fields, clears secrets after save and refreshes status", async () => {
    const api = createEmailFake();
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }, { onChanged }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    await act(() => result.current.saveKey(PROVIDER));
    expect(result.current.notice?.text).toBe("Enter the key first.");
    expect(api.saveProviderKey).not.toHaveBeenCalled();
    act(() => {
      result.current.setDraftField(PROVIDER.id, "token", "  secret  ");
      result.current.setDraftField(PROVIDER.id, "baseUrl", " https://example.com/mail ");
      result.current.setDraftField(PROVIDER.id, "username", "  ");
    });
    await act(() => result.current.saveKey(PROVIDER));
    expect(api.saveProviderKey).toHaveBeenCalledExactlyOnceWith({ providerId: PROVIDER.id, input: { token: "secret", baseUrl: "https://example.com/mail" } });
    expect(api.activateProvider).not.toHaveBeenCalled();
    expect(result.current.drafts[PROVIDER.id]).toEqual({});
    expect(result.current.notice).toMatchObject({ tone: "ok", text: "Key saved." });
    expect(onChanged).toHaveBeenCalledOnce();
    await waitFor(() => expect(api.listProviders).toHaveBeenCalledTimes(2));
  });

  it("drops \"Enter the key first.\" as soon as that provider's field is typed in", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    await act(() => result.current.saveKey(PROVIDER));
    act(() => result.current.setDraftField("other-provider", "token", "x"));
    expect(result.current.notice?.text).toBe("Enter the key first.");
    act(() => result.current.setDraftField(PROVIDER.id, "token", "x"));
    expect(result.current.notice).toBeNull();
  });

  it("switches only after confirmation, and cancel makes no request", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    act(() => result.current.askSwitch(PROVIDER));
    expect(api.activateProvider).not.toHaveBeenCalled();
    act(() => result.current.askSwitch(null));
    await act(() => result.current.confirmSwitch());
    expect(api.activateProvider).not.toHaveBeenCalled();
    act(() => result.current.askSwitch(PROVIDER));
    await act(() => result.current.confirmSwitch());
    expect(api.activateProvider).toHaveBeenCalledExactlyOnceWith({ providerId: PROVIDER.id });
    expect(result.current.pendingSwitch).toBeNull();
    expect(result.current.notice?.text).toBe("Now sending with this provider.");
  });

  it("keeps a failed key draft for retry and reports the safe API message", async () => {
    const api = createEmailFake();
    api.saveProviderKey.mockRejectedValue(new ApiError("Key refused", 400));
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    act(() => result.current.setDraftField(PROVIDER.id, "token", "secret"));
    await act(() => result.current.saveKey(PROVIDER));
    expect(result.current.notice).toMatchObject({ tone: "error", text: "Key refused" });
    expect(result.current.drafts[PROVIDER.id]?.token).toBe("secret");
    expect(result.current.busyId).toBeNull();
    expect(api.activateProvider).not.toHaveBeenCalled();
  });
});

describe("adding email providers", () => {
  it("lists disabled outbound-mail plugins only, without activating the sole choice", async () => {
    const api = createEmailFake();
    api.listAgentPlugins.mockResolvedValue({ agentPlugins: [MAIL_PLUGIN, { ...MAIL_PLUGIN, pluginId: "enabled", enabled: true }, { ...MAIL_PLUGIN, pluginId: "other", provides: ["search"] }] });
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    await waitFor(() => expect(result.current.choices).toEqual([MAIL_PLUGIN]));
    expect(api.setAgentPluginEnabled).not.toHaveBeenCalled();
  });

  it("waits for activation, blocks concurrent writes, refreshes and selects by owning plugin, preserving drafts", async () => {
    const api = createEmailFake();
    api.listAgentPlugins.mockResolvedValue({ agentPlugins: [MAIL_PLUGIN] });
    let finish!: (value: Awaited<ReturnType<typeof api.setAgentPluginEnabled>>) => void;
    api.setAgentPluginEnabled.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    await waitFor(() => expect(result.current.choices).toHaveLength(1));
    act(() => result.current.setDraftField(PROVIDER.id, "token", "keep-this"));
    let pending!: Promise<string | undefined>;
    act(() => { pending = result.current.addProvider({ pluginId: MAIL_PLUGIN.pluginId }); });
    expect(result.current.adding).toBe(MAIL_PLUGIN.pluginId);
    await act(() => result.current.addProvider({ pluginId: "another" }));
    expect(api.setAgentPluginEnabled).toHaveBeenCalledExactlyOnceWith("mail-plugin", { enabled: true });
    expect(api.listProviders).toHaveBeenCalledTimes(1);
    api.listProviders.mockResolvedValue({ setting: { transactional: null, bulk: null }, providers: [PROVIDER, { ...PROVIDER, id: "different-adapter-id", pluginId: MAIL_PLUGIN.pluginId }], refusals: [] });
    await act(async () => { finish({ agentPlugin: { ...MAIL_PLUGIN, enabled: true } }); expect(await pending).toBe("different-adapter-id"); });
    expect(result.current.choices).toEqual([]);
    expect(result.current.drafts[PROVIDER.id]?.token).toBe("keep-this");
    expect(api.activateProvider).not.toHaveBeenCalled();
    expect(api.saveProviderKey).not.toHaveBeenCalled();
    expect(result.current.adding).toBeNull();
  });

  it.each(["enable", "refresh", "refused", "missing"])("shows %s failure plainly and Retry can complete the addition", async (failure) => {
    const api = createEmailFake();
    api.listAgentPlugins.mockResolvedValue({ agentPlugins: [MAIL_PLUGIN] });
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    if (failure === "enable") api.setAgentPluginEnabled.mockRejectedValueOnce(new ApiError("Permission refused", 403));
    if (failure === "refresh") api.listProviders.mockRejectedValueOnce(new ApiError("Read refused", 403));
    if (failure === "refused") api.listProviders.mockResolvedValueOnce({ setting: { transactional: null, bulk: null }, providers: [PROVIDER], refusals: ["Adapter refused from 'mail-plugin'", "Unrelated refusal from 'other-plugin'"] });
    await act(async () => { expect(await result.current.addProvider({ pluginId: MAIL_PLUGIN.pluginId })).toBeUndefined(); });
    expect(result.current.addError).toBe(failure === "enable" ? "Permission refused" : failure === "refresh" ? "Read refused" : failure === "refused" ? "Adapter refused from 'mail-plugin'" : "The plugin did not load an email provider.");
    expect(result.current.adding).toBeNull();
    api.listProviders.mockResolvedValue({ setting: { transactional: null, bulk: null }, providers: [{ ...PROVIDER, pluginId: MAIL_PLUGIN.pluginId }], refusals: [] });
    await act(async () => { expect(await result.current.retryAdd()).toBe(PROVIDER.id); });
    expect(result.current.addError).toBeNull();
    expect(api.activateProvider).not.toHaveBeenCalled();
  });

  it("keeps the controller stable across unchanged renders", async () => {
    const api = createEmailFake();
    const { result, rerender } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    await waitFor(() => expect(result.current.choices).toEqual([]));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    const previous = result.current;
    rerender();
    expect(result.current).toBe(previous);
  });

  it("uses the missing-provider fallback when only another plugin refused", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    api.listProviders.mockResolvedValue({ setting: { transactional: null, bulk: null }, providers: [], refusals: ["Refused from 'other-plugin'"] });
    await act(() => result.current.addProvider({ pluginId: MAIL_PLUGIN.pluginId }));
    expect(result.current.addError).toBe("The plugin did not load an email provider.");
  });

  it("distinguishes forbidden reads from an empty catalog and retries the read", async () => {
    const api = createEmailFake();
    api.listAgentPlugins.mockRejectedValueOnce(new ApiError("Cannot list plugins", 403));
    const { result } = renderHook(() => useEmailProvider({ api, pluginApi: api }));
    await waitFor(() => expect(result.current.addError).toBe("Cannot list plugins"));
    expect(result.current.choices).toBeNull();
    await act(() => result.current.retryAdd());
    await waitFor(() => expect(result.current.choices).toEqual([]));
    expect(result.current.addError).toBeNull();
    expect(api.setAgentPluginEnabled).not.toHaveBeenCalled();
  });
});
