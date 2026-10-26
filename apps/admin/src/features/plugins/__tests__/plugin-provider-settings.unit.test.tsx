import { fireEvent, render, screen, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it } from "vitest";

import type { AdminPluginProviderSettings } from "@/lib/api";
import { PluginProviderSettingsDialog } from "../PluginProviderSettingsDialog";
import { PluginRow } from "../PluginRow";
import { createFakePluginsPort } from "../hooks/plugins-dependencies.hooks";
import { usePluginProviderSettings } from "../hooks/use-plugin-provider-settings.hooks";

/**
 * @file The provider plugin settings card (2026-10-26) over the fake port: declared fields render,
 * secrets are password inputs that never show a value, a blank secret keeps the saved one, and load
 * and save failures surface as alerts.
 */

const t = (key: string) => key;
const UNREADABLE_NOTICE = "Saved keys for this plugin can't be read on this machine. Enter them again here and save.";
const LEGACY_NOTICE = "A key for this plugin was saved in an older format that Tovu no longer reads. Enter it again here and save.";

function card(overrides: Partial<AdminPluginProviderSettings> = {}): AdminPluginProviderSettings {
  return { pluginId: "observability-opentelemetry", store: "project", appliesAt: "next-start", fields: [
    { name: "endpoint", label: "OTLP endpoint", hint: "https://…", secret: false, required: true, saved: true, value: "https://old.example.test" },
    { name: "headers", label: "OTLP headers", secret: true, required: false, saved: true },
  ], ...overrides };
}

function dialogWith(port: ReturnType<typeof createFakePluginsPort>, onClose = () => {}) {
  const useSettings = (pluginId: string) => usePluginProviderSettings({ pluginId, port, t });
  return render(<PluginProviderSettingsDialog plugin={{ id: "observability-opentelemetry", name: "OpenTelemetry" }} agentHandleBase="row-otel" onClose={onClose} useSettings={useSettings} />);
}

describe("PluginProviderSettingsDialog", () => {
  it("renders the declared fields; a saved secret shows only that it is saved", async () => {
    dialogWith(createFakePluginsPort({ providerSettings: { "observability-opentelemetry": card() } }));
    const endpoint = await screen.findByLabelText(/OTLP endpoint/);
    expect((endpoint as HTMLInputElement).value).toBe("https://old.example.test");
    const headers = screen.getByLabelText(/OTLP headers/) as HTMLInputElement;
    expect(headers.type).toBe("password");
    expect(headers.value).toBe("");
    expect(headers.placeholder).toBe("Saved — leave blank to keep");
    expect(screen.getByText("Saved for every site in this project. Takes effect the next time Tovu starts.")).toBeTruthy();
  });

  it("a key saved the retired way asks to be entered again; saving clears the notice", async () => {
    const providerSettings = { "observability-opentelemetry": card({ legacyCredential: true }) };
    dialogWith(createFakePluginsPort({ providerSettings }));
    const notice = await screen.findByText(LEGACY_NOTICE);
    expect(notice.getAttribute("role")).toBe("note");
    fireEvent.change(screen.getByLabelText(/OTLP endpoint/), { target: { value: "https://new.example.test" } });
    fireEvent.change(screen.getByLabelText(/OTLP headers/), { target: { value: "Authorization=Basic abc" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => expect(screen.queryByText(LEGACY_NOTICE)).toBeNull());
  });

  it("saved keys this machine can't read ask to be entered again; saving clears the notice", async () => {
    const providerSettings = { "observability-opentelemetry": card({ unreadable: true, fields: card().fields.map((field) => ({ ...field, saved: false, value: undefined })) }) };
    dialogWith(createFakePluginsPort({ providerSettings }));
    const notice = await screen.findByText(UNREADABLE_NOTICE);
    expect(notice.getAttribute("role")).toBe("note");
    fireEvent.change(screen.getByLabelText(/OTLP endpoint/), { target: { value: "https://new.example.test" } });
    fireEvent.change(screen.getByLabelText(/OTLP headers/), { target: { value: "Authorization=Basic abc" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => expect(screen.queryByText(UNREADABLE_NOTICE)).toBeNull());
  });

  it("a camelCase field name still gets a valid agent handle (lowercase words joined by hyphens)", async () => {
    const posthog = card({ pluginId: "analytics-posthog", fields: [
      { name: "host", label: "PostHog host", secret: false, required: true, saved: false },
      { name: "apiKey", label: "Project API key", secret: true, required: true, saved: false },
    ] });
    const port = createFakePluginsPort({ providerSettings: { "analytics-posthog": posthog } });
    const useSettings = (pluginId: string) => usePluginProviderSettings({ pluginId, port, t });
    render(<PluginProviderSettingsDialog plugin={{ id: "analytics-posthog", name: "PostHog" }} agentHandleBase="plugins-row-analytics-posthog" onClose={() => {}} useSettings={useSettings} />);
    const apiKey = await screen.findByLabelText(/Project API key/);
    expect(apiKey.getAttribute("data-agent-element")).toBe("plugins-row-analytics-posthog-setting-api-key");
  });

  it("no notice when nothing was saved the retired way", async () => {
    dialogWith(createFakePluginsPort({ providerSettings: { "observability-opentelemetry": card() } }));
    await screen.findByLabelText(/OTLP endpoint/);
    expect(screen.queryByText(LEGACY_NOTICE)).toBeNull();
    expect(screen.queryByText(UNREADABLE_NOTICE)).toBeNull();
  });

  it("saves edits; a blank secret keeps the saved one; the form resets secrets to blank", async () => {
    const providerSettings = { "observability-opentelemetry": card({ store: "site" }) };
    dialogWith(createFakePluginsPort({ providerSettings }));
    const endpoint = await screen.findByLabelText(/OTLP endpoint/);
    expect(screen.getByText("Saved for this site. Takes effect the next time Tovu starts.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Settings saved.");
    expect(providerSettings["observability-opentelemetry"].fields[1]!.saved).toBe(true);
    // A changed endpoint needs the saved secret entered again (it decides where the secret is sent).
    fireEvent.change(endpoint, { target: { value: "https://new.example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Changing OTLP endpoint needs OTLP headers entered again.");
    expect(providerSettings["observability-opentelemetry"].fields[0]!.value).toBe("https://old.example.test");
    fireEvent.change(screen.getByLabelText(/OTLP headers/), { target: { value: "Authorization=Basic abc" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => expect((screen.getByLabelText(/OTLP headers/) as HTMLInputElement).value).toBe(""));
    expect(providerSettings["observability-opentelemetry"].fields[0]!.value).toBe("https://new.example.test");
  });

  it("a load failure and a save failure are shown as alerts; Close and the backdrop close", async () => {
    let closed = 0;
    const missing = dialogWith(createFakePluginsPort({}), () => { closed += 1; });
    expect((await screen.findByRole("alert")).textContent).toBe("No plugin with that id is installed.");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(document.querySelector(".settings-dialog-backdrop")!);
    expect(closed).toBe(2);
    missing.unmount();
    const port = createFakePluginsPort({ providerSettings: { "observability-opentelemetry": card() } });
    port.saveProviderSettings = async () => { throw new Error("down"); };
    dialogWith(port);
    await screen.findByLabelText(/OTLP endpoint/);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/down|failed to save plugin settings/);
  });
});

describe("fake port saves like the real route", () => {
  it("refuses undeclared names and unknown plugins", async () => {
    const port = createFakePluginsPort({ providerSettings: { p: card({ pluginId: "p" }) } });
    await expect(port.saveProviderSettings("p", { token: "x" })).rejects.toMatchObject({ code: "PROVIDER_SETTINGS_INVALID" });
    await expect(port.getProviderSettings("nope")).rejects.toMatchObject({ code: "PLUGIN_NOT_FOUND" });
    await expect(port.saveProviderSettings("p", { endpoint: " ", headers: "" })).rejects.toMatchObject({ code: "PROVIDER_SETTINGS_SECRET_REENTRY" });
    const saved = await port.saveProviderSettings("p", { endpoint: " ", headers: "a=b" });
    expect(saved.fields.map((field) => [field.saved, field.value])).toEqual([[false, ""], [true, undefined]]);
  });
});

describe("PluginRow settings button", () => {
  it("is shown only when the row passes onSettings", () => {
    const plugin = { id: "x", name: "X", version: "1", source: "site" as const, tier: "tier-3" as const, status: "valid" as const, enabled: true, quarantine: null, errors: [] };
    let opened = 0;
    const { rerender } = render(<ul><PluginRow plugin={plugin} t={t} expanded={false} onToggleExpanded={() => {}} agentHandleBase="row-x" action={null} onInspect={() => {}} /></ul>);
    expect(screen.queryByRole("button", { name: "Settings — X" })).toBeNull();
    rerender(<ul><PluginRow plugin={plugin} t={t} expanded={false} onToggleExpanded={() => {}} agentHandleBase="row-x" action={null} onInspect={() => {}} onSettings={() => { opened += 1; }} /></ul>);
    fireEvent.click(screen.getByRole("button", { name: "Settings — X" }));
    expect(opened).toBe(1);
  });
});
