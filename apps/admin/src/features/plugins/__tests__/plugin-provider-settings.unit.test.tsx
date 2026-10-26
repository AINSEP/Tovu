import { act, fireEvent, render, screen, waitFor } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import type { AdminPluginProviderSettings } from "@/lib/api";
import { PluginProviderSettingsDialog } from "../PluginProviderSettingsDialog";
import { PluginRow } from "../PluginRow";
import { createFakePluginsPort } from "../hooks/plugins-dependencies.hooks";
import { usePluginProviderSettings } from "../hooks/use-plugin-provider-settings.hooks";

/**
 * @file The provider plugin settings card (2026-10-26) over the fake port: declared fields render,
 * secrets are password inputs that never show a value, a blank secret keeps the saved one, and load
 * and save failures surface as alerts. 2026-10-25 redesign: "<Name> settings" title, declared
 * defaults and options (select + "Custom…"), the show/hide eye, Save's pending state, and a
 * successful Save handing off to `onSaved` (the screen closes the card and toasts).
 */

const t = (key: string) => key;
const UNREADABLE_NOTICE = "Saved keys for this plugin can't be read on this machine. Enter them again here and save.";
const LEGACY_NOTICE = "A key for this plugin was saved in an older format that Tovu no longer reads. Enter it again here and save.";

function card(overrides: Partial<AdminPluginProviderSettings> = {}): AdminPluginProviderSettings {
  return { pluginId: "observability-opentelemetry", store: "project", keyId: "plugin-state:observability-opentelemetry:provider.config", usedByThisSite: false, usedBy: [], projectAvailable: true, appliesAt: "now", fields: [
    { name: "endpoint", label: "OTLP endpoint", hint: "https://…", secret: false, required: true, saved: true, value: "https://old.example.test" },
    { name: "headers", label: "OTLP headers", secret: true, required: false, saved: true },
  ], ...overrides };
}

function dialogWith(port: ReturnType<typeof createFakePluginsPort>, { onClose = () => {}, onSaved = () => {} }: { onClose?: () => void; onSaved?: () => void } = {}) {
  const useSettings = (pluginId: string) => usePluginProviderSettings({ pluginId, port, t });
  return render(<PluginProviderSettingsDialog plugin={{ id: "observability-opentelemetry", name: "OpenTelemetry" }} agentHandleBase="row-otel" onClose={onClose} onSaved={onSaved} useSettings={useSettings} />);
}

/** The control itself: the secret's eye button is also labelled "Show <label>". */
const control = (label: RegExp) => screen.getByLabelText(label, { selector: "input, select" }) as HTMLInputElement;
const findControl = (label: RegExp) => screen.findByLabelText(label, { selector: "input, select" }) as Promise<HTMLInputElement>;

function posthogCard(overrides: Partial<AdminPluginProviderSettings["fields"][number]> = {}): AdminPluginProviderSettings {
  return card({ pluginId: "analytics-posthog", fields: [
    { name: "host", label: "Region / host", secret: false, required: true, saved: false, default: "https://us.i.posthog.com", allowCustom: true,
      options: [{ value: "https://us.i.posthog.com", label: "US Cloud" }, { value: "https://eu.i.posthog.com", label: "EU Cloud" }], ...overrides },
    { name: "apiKey", label: "Project API key", secret: true, required: true, saved: false },
  ] });
}

function posthogDialog(providerSettings: Record<string, AdminPluginProviderSettings>, onSaved = () => {}) {
  const port = createFakePluginsPort({ providerSettings });
  const useSettings = (pluginId: string) => usePluginProviderSettings({ pluginId, port, t });
  render(<PluginProviderSettingsDialog plugin={{ id: "analytics-posthog", name: "PostHog" }} agentHandleBase="row-posthog" onClose={() => {}} onSaved={onSaved} useSettings={useSettings} />);
  return port;
}

describe("PluginProviderSettingsDialog", () => {
  it("renders the declared fields; a saved secret shows only that it is saved", async () => {
    dialogWith(createFakePluginsPort({ providerSettings: { "observability-opentelemetry": card() } }));
    const endpoint = await findControl(/OTLP endpoint/);
    expect(endpoint.value).toBe("https://old.example.test");
    const headers = control(/OTLP headers/);
    expect(headers.type).toBe("password");
    expect(headers.value).toBe("");
    expect(headers.placeholder).toBe("Saved — leave blank to keep");
    expect(screen.getByRole("heading", { name: "OpenTelemetry settings" })).toBeTruthy();
    expect(screen.getByText("Saved to your project — not used by any site yet")).toBeTruthy();
    expect(screen.queryByText("Takes effect the next time Tovu starts.")).toBeNull();
  });

  it("a key saved the retired way asks to be entered again; saving clears the notice", async () => {
    const providerSettings = { "observability-opentelemetry": card({ legacyCredential: true }) };
    dialogWith(createFakePluginsPort({ providerSettings }));
    const notice = await screen.findByText(LEGACY_NOTICE);
    expect(notice.getAttribute("role")).toBe("note");
    fireEvent.change(control(/OTLP endpoint/), { target: { value: "https://new.example.test" } });
    fireEvent.change(control(/OTLP headers/), { target: { value: "Authorization=Basic abc" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => expect(screen.queryByText(LEGACY_NOTICE)).toBeNull());
  });

  it("saved keys this machine can't read ask to be entered again; saving clears the notice", async () => {
    const providerSettings = { "observability-opentelemetry": card({ unreadable: true, fields: card().fields.map((field) => ({ ...field, saved: false, value: undefined })) }) };
    dialogWith(createFakePluginsPort({ providerSettings }));
    const notice = await screen.findByText(UNREADABLE_NOTICE);
    expect(notice.getAttribute("role")).toBe("note");
    fireEvent.change(control(/OTLP endpoint/), { target: { value: "https://new.example.test" } });
    fireEvent.change(control(/OTLP headers/), { target: { value: "Authorization=Basic abc" } });
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
    render(<PluginProviderSettingsDialog plugin={{ id: "analytics-posthog", name: "PostHog" }} agentHandleBase="plugins-row-analytics-posthog" onClose={() => {}} onSaved={() => {}} useSettings={useSettings} />);
    const apiKey = await findControl(/Project API key/);
    expect(apiKey.getAttribute("data-agent-element")).toBe("plugins-row-analytics-posthog-setting-api-key");
  });

  it("no notice when nothing was saved the retired way", async () => {
    dialogWith(createFakePluginsPort({ providerSettings: { "observability-opentelemetry": card() } }));
    await findControl(/OTLP endpoint/);
    expect(screen.queryByText(LEGACY_NOTICE)).toBeNull();
    expect(screen.queryByText(UNREADABLE_NOTICE)).toBeNull();
  });

  it("saves edits; a blank secret keeps the saved one; the form resets secrets to blank", async () => {
    const providerSettings = { "observability-opentelemetry": card({ store: "site" }) };
    let saved = 0;
    dialogWith(createFakePluginsPort({ providerSettings }), { onSaved: () => { saved += 1; } });
    const endpoint = await findControl(/OTLP endpoint/);
    expect(screen.getByText("Saved for this site")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toBe(1));
    expect(providerSettings["observability-opentelemetry"].fields[1]!.saved).toBe(true);
    // A changed endpoint needs the saved secret entered again (it decides where the secret is sent).
    fireEvent.change(endpoint, { target: { value: "https://new.example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Changing OTLP endpoint needs OTLP headers entered again.");
    expect(saved).toBe(1); // a refusal keeps the card open
    expect(providerSettings["observability-opentelemetry"].fields[0]!.value).toBe("https://old.example.test");
    fireEvent.change(control(/OTLP headers/), { target: { value: "Authorization=Basic abc" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    await waitFor(() => expect(control(/OTLP headers/).value).toBe(""));
    expect(saved).toBe(2);
    expect(providerSettings["observability-opentelemetry"].fields[0]!.value).toBe("https://new.example.test");
  });

  it("a load failure and a save failure are shown as alerts; Cancel and Escape close", async () => {
    let closed = 0;
    const missing = dialogWith(createFakePluginsPort({}), { onClose: () => { closed += 1; } });
    expect((await screen.findByRole("alert")).textContent).toBe("No plugin with that id is installed.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent(document.querySelector("dialog")!, new Event("cancel", { cancelable: true })); // Escape
    expect(closed).toBe(2);
    missing.unmount();
    const port = createFakePluginsPort({ providerSettings: { "observability-opentelemetry": card() } });
    port.saveProviderSettings = async () => { throw new Error("down"); };
    dialogWith(port);
    await findControl(/OTLP endpoint/);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/down|failed to save plugin settings/);
  });

  it("Save is disabled and busy while the request is out, then hands off to onSaved", async () => {
    const port = createFakePluginsPort({ providerSettings: { "observability-opentelemetry": card() } });
    let release = () => {};
    const realSave = port.saveProviderSettings.bind(port);
    port.saveProviderSettings = (id, values) => new Promise((resolve, reject) => { release = () => { realSave(id, values).then(resolve, reject); }; });
    let saved = 0;
    dialogWith(port, { onSaved: () => { saved += 1; } });
    await findControl(/OTLP endpoint/);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const busy = await screen.findByRole("button", { name: /Saving…/ }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.querySelector(".provider-settings-spinner")).not.toBeNull();
    expect(saved).toBe(0);
    await act(async () => { release(); });
    await waitFor(() => expect(saved).toBe(1));
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("declared defaults, options and the secret eye", () => {
  it("a select with a declared default starts on it when nothing is saved; saving sends it", async () => {
    const providerSettings = { "analytics-posthog": posthogCard() };
    posthogDialog(providerSettings);
    const host = await findControl(/^Region \/ host/);
    expect(host.tagName).toBe("SELECT");
    expect(host.value).toBe("https://us.i.posthog.com");
    expect([...(host as unknown as HTMLSelectElement).options].map((option) => option.text)).toEqual(["US Cloud", "EU Cloud", "Custom…"]);
    fireEvent.change(control(/Project API key/), { target: { value: "phc_x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(providerSettings["analytics-posthog"].fields[0]!.value).toBe("https://us.i.posthog.com"));
  });

  it("a saved value outside the options opens as Custom… with its text", async () => {
    posthogDialog({ "analytics-posthog": posthogCard({ saved: true, value: "https://ph.example.test" }) });
    const host = await findControl(/^Region \/ host/);
    expect(host.value).toBe("\u0000custom");
    expect((screen.getByLabelText("Custom Region / host") as HTMLInputElement).value).toBe("https://ph.example.test");
  });

  it("choosing Custom… shows a URL input; saving sends the typed URL", async () => {
    const providerSettings = { "analytics-posthog": posthogCard() };
    posthogDialog(providerSettings);
    const host = await findControl(/^Region \/ host/);
    expect(screen.queryByLabelText("Custom Region / host")).toBeNull();
    fireEvent.change(host, { target: { value: "\u0000custom" } });
    const custom = screen.getByLabelText("Custom Region / host") as HTMLInputElement;
    expect(custom.type).toBe("url");
    expect(custom.value).toBe("");
    fireEvent.change(custom, { target: { value: "https://ph.example.test" } });
    fireEvent.change(control(/Project API key/), { target: { value: "phc_x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(providerSettings["analytics-posthog"].fields[0]!.value).toBe("https://ph.example.test"));
    // Back to a listed option hides the free text again.
    fireEvent.change(host, { target: { value: "https://eu.i.posthog.com" } });
    expect(screen.queryByLabelText("Custom Region / host")).toBeNull();
  });

  it("the eye shows and hides a secret, and re-masks once the field is cleared", async () => {
    posthogDialog({ "analytics-posthog": posthogCard() });
    const apiKey = await findControl(/Project API key/);
    const eye = screen.getByRole("button", { name: "Show Project API key" }) as HTMLButtonElement;
    expect(eye.type).toBe("button");
    expect(eye.getAttribute("aria-pressed")).toBe("false");
    expect(apiKey.type).toBe("password");
    fireEvent.change(apiKey, { target: { value: "phc_x" } });
    fireEvent.click(eye);
    expect(apiKey.type).toBe("text");
    expect(apiKey.getAttribute("spellcheck")).toBe("false");
    const hide = screen.getByRole("button", { name: "Hide Project API key" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(apiKey, { target: { value: "" } });
    expect(apiKey.type).toBe("password");
    expect(screen.getByRole("button", { name: "Show Project API key" }).getAttribute("aria-pressed")).toBe("false");
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


it("uses a saved project key for this site through the shared port without another dialog", async () => {
  const providerSettings = { "observability-opentelemetry": card() };
  const onSaved = vi.fn();
  dialogWith(createFakePluginsPort({ providerSettings }), { onSaved });
  fireEvent.click(await screen.findByRole("button", { name: "Use the saved key for this site" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  expect(providerSettings["observability-opentelemetry"].usedByThisSite).toBe(true);
  expect(screen.queryByRole("button", { name: "Use the saved key for this site" })).toBeNull();
  expect(screen.getByText("Used by this-site")).toBeTruthy();
});

it("labels an existing site key as site-only when a project store is available", async () => {
  dialogWith(createFakePluginsPort({ providerSettings: { "observability-opentelemetry": card({ store: "site", usedByThisSite: true }) } }));
  expect(await screen.findByText("Saved for this site only")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Use the saved key for this site" })).toBeNull();
});
