import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navigate } from "@jini-ai/admin/shell/lib/router";
import { ApiError } from "@/lib/admin-http/request";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import { authApi } from "@/features/auth/api/auth-api";
import { emailApi } from "../email-api";
import { newRequestId, useWiredEmailActivity, useWiredEmailOverview, useWiredEmailProvider, useWiredEmailSender, useWiredEmailTemplateEditor, useWiredEmailTemplates } from "../email-hooks-host";
import { TEMPLATE } from "./email.test-helpers";

vi.mock("@jini-ai/admin/shell/lib/router", () => ({ navigate: vi.fn() }));

/**
 * @file This app's bindings of the Email data hooks: each `useWired*` hands its hook this app's
 * client, its `ApiError` class (so a 403 reads as "forbidden", not a generic failure), its router
 * and its idempotency-key source.
 */
describe("email hooks host bindings", () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.mocked(navigate).mockClear(); });

  it("binds this app's ApiError: a 403 from the client reads as forbidden", async () => {
    vi.spyOn(emailApi, "listTemplates").mockRejectedValue(new ApiError({ message: "Forbidden", status: 403 }));
    vi.spyOn(emailApi, "getTemplate").mockRejectedValue(new ApiError({ message: "Server says no", status: 500 }));
    const templates = renderHook(() => useWiredEmailTemplates());
    const editor = renderHook(() => useWiredEmailTemplateEditor({ id: TEMPLATE.id }));
    await waitFor(() => expect(templates.result.current.view).toEqual({ kind: "forbidden" }));
    await waitFor(() => expect(editor.result.current.view).toEqual({ kind: "error", message: "Server says no" }));
  });

  it("binds this app's ApiError into the Activity tab: a 403 reads as forbidden, other refusals keep the server's message", async () => {
    vi.spyOn(emailApi, "listActivity").mockResolvedValue({ items: [], nextCursor: null, empty: "none_recorded", access: "full" });
    vi.spyOn(emailApi, "listSuppressions").mockRejectedValue(new ApiError({ message: "Server says no", status: 500 }));
    vi.spyOn(emailApi, "readFeedback").mockRejectedValue(new ApiError({ message: "Forbidden", status: 403 }));
    const { result } = renderHook(() => useWiredEmailActivity());
    await waitFor(() => expect(result.current.feedback).toEqual({ kind: "forbidden" }));
    await waitFor(() => expect(result.current.suppressions.view).toEqual({ kind: "error", message: "Server says no" }));
  });

  it.each([
    ["the owner", ["*"], true],
    ["someone without the grant", ["mail.suppressions.manage"], false],
    ["a server that sends no permissions", undefined, false],
  ])("offers Clear test emails to %s only when the session holds mail.capture.clear", async (_who, effectivePermissions, expected) => {
    vi.spyOn(emailApi, "listActivity").mockResolvedValue({ items: [], nextCursor: null, empty: "none_recorded", access: "full" });
    vi.spyOn(emailApi, "listSuppressions").mockResolvedValue({ items: [], nextCursor: null, empty: "none_recorded" });
    vi.spyOn(emailApi, "readFeedback").mockResolvedValue({ available: false, providers: [] });
    const me = vi.spyOn(authApi, "me").mockResolvedValue({ user: { id: "u1" } as never, ...(effectivePermissions ? { effectivePermissions } : {}) });
    const { result } = renderHook(() => useWiredEmailActivity());
    await waitFor(() => expect(me).toHaveBeenCalled());
    await waitFor(() => expect(result.current.capture.canClear).toBe(expected));
  });

  it("opens a new template through this app's router", async () => {
    vi.spyOn(emailApi, "listTemplates").mockResolvedValue({ templates: [] });
    vi.spyOn(emailApi, "createTemplate").mockResolvedValue({ ...TEMPLATE, id: "t 1" });
    const { result } = renderHook(() => useWiredEmailTemplates({ newName: "Untitled" }));
    await act(() => result.current.create());
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ routePath: "/email/templates/t%201" });
  });

  it("sends a test with a fresh well-formed idempotency key per click", async () => {
    vi.spyOn(emailApi, "readUses").mockResolvedValue({ checkedAt: "2026-10-22T00:00:00.000Z", uses: [] });
    const sendTest = vi.spyOn(emailApi, "sendTest").mockRejectedValue(new ApiError({ message: "Unavailable", status: 503 }));
    const { result } = renderHook(() => useWiredEmailOverview());
    await act(() => result.current.sendTest());
    const key = sendTest.mock.calls[0]?.[0].requestId ?? "";
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(result.current.test).toEqual({ kind: "error", message: "Unavailable" });
    expect(newRequestId()).not.toBe(newRequestId());
  });
});

it("keeps a provider refusal and a sender denial distinct in the production hooks", async () => {
  const provider = vi.spyOn(emailApi, "listProviders").mockRejectedValue(new ApiError({ message: "Mail provider catalog is unavailable", status: 409 }));
  const sender = vi.spyOn(emailApi, "readSender").mockRejectedValue(new ApiError({ message: "Forbidden", status: 403 }));
  const dns = vi.spyOn(emailApi, "readDns").mockRejectedValue(new ApiError({ message: "Forbidden", status: 403 }));
  const plugins = vi.spyOn(integrationsApi, "listAgentPlugins").mockResolvedValue({ agentPlugins: [] });
  const onChanged = vi.fn();
  try {
    const providerHook = renderHook(() => useWiredEmailProvider({ onChanged }));
    const senderHook = renderHook(() => useWiredEmailSender({ onChanged }));
    await waitFor(() => expect(providerHook.result.current.view).toEqual({ kind: "error", message: "Mail provider catalog is unavailable" }));
    await waitFor(() => expect(senderHook.result.current.sender).toEqual({ kind: "forbidden" }));
    expect(provider).toHaveBeenCalledTimes(1);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(dns).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
  } finally {
    provider.mockRestore();
    sender.mockRestore();
    dns.mockRestore();
    plugins.mockRestore();
  }
});
