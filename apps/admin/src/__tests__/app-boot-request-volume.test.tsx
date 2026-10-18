import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "../App";
import { FetchQueryProvider } from "./fetch-query-provider.test-helper";
import { appShellApiBody } from "./app-shell-api.fixture";
import { publishSettingsRefresh, resetSettingsRefreshBus } from "../lib/settings-refresh-bus";
import { createAssistantLastConversationStore } from "../hooks/assistant-chats-dependencies.hooks";

/** Real App boot: record the transport, including StrictMode and the delayed settings-feed open. */
class BootEventSource {
  static sources: BootEventSource[] = [];
  readyState = 1;
  private events = new EventTarget();
  constructor(readonly url: string) { BootEventSource.sources.push(this); }
  addEventListener(kind: string, listener: EventListener) { this.events.addEventListener(kind, listener); }
  removeEventListener(kind: string, listener: EventListener) { this.events.removeEventListener(kind, listener); }
  emit(kind: string) { if (this.readyState !== 2) this.events.dispatchEvent(new MessageEvent(kind)); }
  close() { this.readyState = 2; }
}

const namespaces = ["core.language", "core.interface", "core.appearance", "core.execution"];
const resources = ["/auth/me", "/system/sites", "/system/assistant-full-cli", "/chart-providers", "/assistant/execution-credential"];

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  window.history.replaceState({}, "", "/admin");
  BootEventSource.sources = [];
  vi.stubGlobal("EventSource", BootEventSource);
  // Exercise the browser's per-tab fallback deterministically; ownership transport has its own tests.
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubGlobal("tovuVoice", undefined);
  vi.stubGlobal("tovuFiles", undefined);
});

afterEach(() => {
  cleanup();
  resetSettingsRefreshBus();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shares boot reads, retains per-pane health probes, and honors post-save settings notifications", async () => {
  const calls: URL[] = [];
  createAssistantLastConversationStore({ principalId: "owner-a" }).write("saved-chat");
  let locale = "en";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if ((init?.method ?? "GET") === "GET") calls.push(url);
    let body: unknown = appShellApiBody({ url: url.href }, { locale });
    if (url.pathname.endsWith("/auth/me")) body = { user: { id: "owner-a", username: "admin" }, effectivePermissions: ["*"] };
    if (url.pathname.endsWith("/password-status")) body = { usesDefaultPassword: false };
    if (url.pathname === "/api/agents") body = { agents: [{ id: "claude", name: "Claude", available: true }] };
    if (url.pathname.endsWith("/system/sites")) body = { switchingEnabled: true, sites: [], currentSite: { name: "test", dir: "/tmp/test" } };
    if (url.pathname.endsWith("/assistant/settings")) body = { adminAssistantEnabled: true };
    if (url.pathname.endsWith("/assistant-full-cli")) body = { enabled: false, canEdit: true };
    if (url.pathname.endsWith("/chart-providers")) body = { data: { generation: "boot", providers: [] } };
    if (url.pathname.endsWith("/execution-credential")) body = { data: { isSet: false, masked: null, baseUrl: null } };
    if (url.pathname.endsWith("/deployment-overview")) body = { mode: "local" };
    if (url.pathname === "/api/assistant/chats") body = { conversations: [{ id: "saved-chat", title: "Saved conversation", createdAt: "2026-10-17T00:00:00Z", updatedAt: "2026-10-17T00:00:00Z" }] };
    if (url.pathname === "/api/assistant/chats/saved-chat/messages") {
      // The real conversation controller restores/re-keys the pane after its history arrives.
      await new Promise(resolve => setTimeout(resolve, 1_200));
      body = { messages: [{ id: "saved-reply", role: "assistant", content: "Saved reply", runStatus: "succeeded", events: [
        { kind: "text", text: "Saved reply" },
        { kind: "tool_result", toolUseId: "saved-tool", content: "ok", isError: false },
      ] }] };
    }
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  }));

  render(<StrictMode><FetchQueryProvider><App /></FetchQueryProvider></StrictMode>);
  // Drain boot responses and query notifications before opening the real settings subscription.
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(document.querySelector("#main-content")).not.toBeNull();
  const feed = [...BootEventSource.sources].reverse().find(source => source.url.includes("/settings/events") && source.readyState !== 2);
  expect(feed).toBeDefined();
  act(() => feed!.emit("open"));
  // Cover both measured delayed waves; do not stop at the first successful render.
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(screen.getByText("Saved reply")).toBeInTheDocument();

  const count = (suffix: string) => calls.filter(url => url.pathname.endsWith(suffix)).length;
  for (const resource of resources) expect(count(resource), resource).toBe(1);
  // One inventory read plus a health probe on each pane mount (initial and restored history).
  expect(count("/api/agents")).toBe(3);
  const settingCount = (namespace: string) => calls.filter(url => url.pathname.endsWith("/settings/effective") && url.searchParams.get("namespace") === namespace).length;
  for (const namespace of namespaces) expect(settingCount(namespace), namespace).toBe(1);

  locale = "fr";
  act(() => publishSettingsRefresh(["core.language"]));
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(document.documentElement.lang).toBe("fr");
  expect(settingCount("core.language")).toBe(2);
  expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
  for (const namespace of namespaces.slice(1)) expect(settingCount(namespace), namespace).toBe(1);
  for (const resource of resources) expect(count(resource), resource).toBe(1);
  expect(count("/api/agents")).toBe(3);
});
