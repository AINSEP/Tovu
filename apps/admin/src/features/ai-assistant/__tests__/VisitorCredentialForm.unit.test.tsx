import { fireEvent, render, screen, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { DEFAULT_PROVIDER_PRESETS } from "@jini-ai/integrations/media-providers/catalog";
import { describe, expect, it, vi } from "vitest";

import {
  VisitorCredentialForm,
  VisitorCredentialKeyActions,
  VisitorCredentialKeyFooter,
  VisitorCredentialSettingsFooter,
  visitorCredentialApiKeyPlaceholder,
  visitorCredentialKeyStatusMessage,
} from "../AiAssistant";
import {
  visitorCredentialSaveStatusMessage,
  visitorCredentialSettingsStatusMessage,
  type VisitorCredentialFormController,
} from "../hooks/use-visitor-credential-form.hooks";
import { t as translateAiAssistant } from "../ai-assistant-i18n";
import { visitorProviderGroups } from "../rules";
import { VisitorAssistantPanel } from "../VisitorAssistantPanel";

/**
 * @file Direct tests for the units pulled out of `VisitorCredentialForm` in the complexity pass
 * (34/17, the highest cyclomatic score in the app -> 8/0). Before this file, `VisitorCredentialForm`
 * had NO direct test coverage of its own — only `useVisitorCredentialForm` (the hook) did, via
 * `use-visitor-credential-form.unit.test.ts`. It is exercised indirectly whenever
 * `AiAssistant.unit.test.tsx` renders `<AiAssistant />` (the Visitor tab is the default active tab),
 * but nothing there asserts on it by name.
 *
 * Three testing strategies, one per extracted shape:
 * - `visitorCredentialKeyStatusMessage` / `visitorCredentialSaveStatusMessage` /
 *   `visitorCredentialApiKeyPlaceholder` — pure functions, asserted directly with no rendering.
 * - `VisitorCredentialKeyActions` / `VisitorCredentialKeyFooter` — plain React components given
 *   their narrow props, so button and status states are driven without the real hook or `fetch`.
 * - `VisitorCredentialForm` — exercised through its own `useVisitorCredentialFormHook` injection
 *   seam (already existed before this pass; unused by any test until now), the same convention
 *   `WidgetInstanceEditor.tsx` and `Posts.tsx` use.
 */

function fakeController(overrides: Partial<VisitorCredentialFormController> = {}): VisitorCredentialFormController {
  return {
    loadState: { status: "ready" },
    config: { protocol: "google", providerId: "google-gemini", apiKey: "", baseUrl: "https://generativelanguage.googleapis.com", model: "" },
    editConfig: vi.fn(),
    preset: null,
    discovery: { status: "idle" },
    connectionTest: { status: "idle" },
    stored: null,
    saveState: { status: "idle" },
    settingsSaveState: { status: "idle" },
    dirty: false,
    hasUsableKey: false,
    hasStoredKey: false,
    storedKeyIsForOtherEndpoint: false,
    configuredPresetIds: new Set(),
    providerGroups: visitorProviderGroups(new Set()),
    selectPresetById: vi.fn(),
    selectPreset: vi.fn(),
    saveKey: vi.fn(async () => undefined),
    saveSettings: vi.fn(async () => undefined),
    runKeyTest: vi.fn(async () => undefined),
    runTestConnection: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("visitorCredentialKeyStatusMessage", () => {
  it("reports the model count when discovery is ok", () => {
    expect(visitorCredentialKeyStatusMessage({ status: "ok", models: ["a", "b"] })).toBe("Key works — 2 models available.");
  });

  it("describes the control when idle", () => {
    expect(visitorCredentialKeyStatusMessage({ status: "idle" })).toBe("Checks the key against the provider and lists the models it can use.");
  });

  it("reports in-flight while loading", () => {
    expect(visitorCredentialKeyStatusMessage({ status: "loading" })).toBe("Asking the provider which models this key allows…");
  });

  it("returns null on error (the error itself renders separately)", () => {
    expect(visitorCredentialKeyStatusMessage({ status: "error", message: "boom" })).toBeNull();
  });
});

describe("visitorCredentialApiKeyPlaceholder", () => {
  it("returns undefined when nothing is stored", () => {
    expect(visitorCredentialApiKeyPlaceholder(null)).toBeUndefined();
  });

  it("returns undefined when stored but the server sent no mask", () => {
    expect(visitorCredentialApiKeyPlaceholder({ isSet: true, masked: null, provider: "google", baseUrl: null, model: null, updatedAt: null })).toBeUndefined();
  });

  it("returns the mask when one is stored and the server sent it", () => {
    expect(
      visitorCredentialApiKeyPlaceholder({ isSet: true, masked: "••••ab12", provider: "google", baseUrl: null, model: null, updatedAt: null }),
    ).toBe("••••ab12");
  });

  it("returns undefined when the stored key belongs to another endpoint, so the new provider's field reads empty", () => {
    expect(
      visitorCredentialApiKeyPlaceholder(
        { isSet: true, masked: "••••mw4w", provider: "google", baseUrl: "https://generativelanguage.googleapis.com", model: null, updatedAt: null },
        true,
      ),
    ).toBeUndefined();
  });
});

describe("visitorCredentialSaveStatusMessage", () => {
  it("asks for this provider's key in plain language when the stored key belongs to another endpoint", () => {
    expect(
      visitorCredentialSaveStatusMessage(
        { status: "idle" },
        { isSet: true, masked: "••••mw4w", provider: "google", baseUrl: "https://generativelanguage.googleapis.com", model: null, updatedAt: null },
        undefined,
        true,
      ),
    ).toBe("Your saved key is for a different provider. Paste a key for this one.");
  });

  it("reports Saving… while saving, regardless of stored", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "saving" }, null)).toBe("Saving…");
  });

  it("reports success once saved", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "saved", at: null }, null)).toBe("Saved to the server, encrypted.");
  });

  it("reports the stored key when idle and a key is stored", () => {
    expect(
      visitorCredentialSaveStatusMessage({ status: "idle" }, { isSet: true, masked: "••••ab12", provider: "google", baseUrl: null, model: null, updatedAt: null }),
    ).toBe("Stored on the server, encrypted. Paste a new key to replace it.");
  });

  it("prompts to paste a key, naming the button that writes it, when idle and nothing is stored", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "idle" }, null)).toBe("Paste your key, check it with Show, then press Save key.");
  });

  it("returns null on error (the error itself renders separately)", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "error", message: "boom" }, null)).toBeNull();
  });
});

describe("visitorCredentialSettingsStatusMessage", () => {
  it("reports progress and a settings-only confirmation, and nothing otherwise", () => {
    expect(visitorCredentialSettingsStatusMessage({ status: "saving" })).toBe("Saving…");
    // Never "Saved to the server, encrypted." — this button sends no key, and borrowing the key
    // footer's line would recreate the exact false confirmation the split removed.
    expect(visitorCredentialSettingsStatusMessage({ status: "saved", at: null })).toBe("Settings saved.");
    expect(visitorCredentialSettingsStatusMessage({ status: "idle" })).toBeNull();
    expect(visitorCredentialSettingsStatusMessage({ status: "error", message: "boom" })).toBeNull();
  });
});

describe("VisitorCredentialKeyActions", () => {
  it("disables Save key on a blank field", () => {
    render(<VisitorCredentialKeyActions {...fakeController()} />);
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();
  });

  it("enables Save key once a key is typed", () => {
    render(<VisitorCredentialKeyActions {...fakeController({ config: { ...fakeController().config, apiKey: "sk-live" } })} />);
    expect(screen.getByRole("button", { name: "Save key" })).toBeEnabled();
  });

  it("keeps Save key disabled on a blank field even when one is already STORED", () => {
    // A stored key does not make the empty field writable — the same narrowing the admin panel's
    // Save key carries (f39be651). Pressing it would offer to write nothing.
    render(
      <VisitorCredentialKeyActions
        {...fakeController({ hasStoredKey: true, stored: { isSet: true, masked: "••••ab12", provider: "google", baseUrl: null, model: null, updatedAt: null } })}
      />,
    );
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();
  });

  it("keeps Save key disabled for a whitespace-only field", () => {
    render(<VisitorCredentialKeyActions {...fakeController({ config: { ...fakeController().config, apiKey: "   \t   " } })} />);
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();
  });

  it("calls saveKey when Save key is clicked", async () => {
    const user = userEvent.setup();
    const saveKey = vi.fn(async () => undefined);
    render(<VisitorCredentialKeyActions {...fakeController({ config: { ...fakeController().config, apiKey: "sk-live" }, saveKey })} />);

    await user.click(screen.getByRole("button", { name: "Save key" }));

    expect(saveKey).toHaveBeenCalledTimes(1);
  });

  it("disables Test Key until a usable key exists", () => {
    render(<VisitorCredentialKeyActions {...fakeController({ hasUsableKey: false })} />);
    expect(screen.getByRole("button", { name: "Test key" })).toBeDisabled();
  });

  it("calls runKeyTest when Test Key is clicked", async () => {
    const user = userEvent.setup();
    const runKeyTest = vi.fn(async () => undefined);
    render(<VisitorCredentialKeyActions {...fakeController({ hasUsableKey: true, runKeyTest })} />);

    await user.click(screen.getByRole("button", { name: "Test key" }));

    expect(runKeyTest).toHaveBeenCalledTimes(1);
  });
});

describe("VisitorCredentialKeyFooter", () => {
  it("renders the discovery error banner when discovery failed", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ discovery: { status: "error", message: "provider unreachable" } })} />);
    expect(screen.getByText("provider unreachable")).toBeInTheDocument();
  });

  it("translates the server's no-key model-discovery refusal (it is a dictionary key, not provider text)", () => {
    const message = "No API key saved on the server. Save one first.";
    render(
      <VisitorCredentialKeyFooter
        {...fakeController({ discovery: { status: "error", message } })}
        t={(key) => translateAiAssistant({ locale: "de", key: key })}
      />,
    );
    expect(
      screen.getByText("Kein API-Schlüssel auf dem Server gespeichert. Speichern Sie zuerst einen."),
    ).toBeInTheDocument();
    expect(screen.queryByText(message)).not.toBeInTheDocument();
  });

  it("renders the save error banner when saving failed", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ saveState: { status: "error", message: "save failed" } })} />);
    expect(screen.getByText("save failed")).toBeInTheDocument();
  });
});

describe("VisitorCredentialSettingsFooter", () => {
  it("wires Save model settings to saveSettings and never to saveKey", async () => {
    const user = userEvent.setup();
    const c = fakeController({ dirty: true });
    render(<VisitorCredentialSettingsFooter {...c} />);

    await user.click(screen.getByRole("button", { name: "Save model settings" }));
    expect(c.saveSettings).toHaveBeenCalledTimes(1);
    // The whole point of the split: this control cannot reach the key path at all.
    expect(c.saveKey).not.toHaveBeenCalled();
  });

  it("stays enabled with a blank key field — settings are not the key", () => {
    render(<VisitorCredentialSettingsFooter {...fakeController({ dirty: true })} />);
    expect(screen.getByRole("button", { name: "Save model settings" })).toBeEnabled();
  });

  it("is disabled until something actually changed, so it never rewrites what the server just sent", () => {
    render(<VisitorCredentialSettingsFooter {...fakeController({ dirty: false })} />);
    expect(screen.getByRole("button", { name: "Save model settings" })).toBeDisabled();
  });

  it("surfaces its own save error", () => {
    render(<VisitorCredentialSettingsFooter {...fakeController({ dirty: true, settingsSaveState: { status: "error", message: "settings boom" } })} />);
    expect(screen.getByText("settings boom")).toBeInTheDocument();
  });

  it("wears the SAME button class as Save key — the two read as one class of control", () => {
    // Owner ruling, 2026-09-02, matching the admin panel's identical assertion. Class parity, not a
    // colour: `.btn-primary` is the only thing that resolves the burnt-orange `var(--primary)`, so
    // this cannot pass with a hand-picked hex that merely looks similar.
    const c = fakeController({ dirty: true, config: { ...fakeController().config, apiKey: "sk-live" } });
    const { container: keyActions } = render(<VisitorCredentialKeyActions {...c} />);
    const { container: settingsFooter } = render(<VisitorCredentialSettingsFooter {...c} />);

    const saveKey = within(keyActions).getByRole("button", { name: "Save key" });
    const saveSettings = within(settingsFooter).getByRole("button", { name: "Save model settings" });
    expect(saveKey).toHaveClass("btn-primary");
    expect(saveSettings!.className).toBe(saveKey!.className);
  });
});

describe("VisitorCredentialForm", () => {
  it("keeps defaults and public status hidden until the saved credential arrives", () => {
    const credential = fakeController({ loadState: { status: "loading" } });
    const controller = { settings: { publicEnabled: true, widget: "react" as const }, saving: false,
      saveError: null, setPublicEnabled: vi.fn(async () => undefined), setWidget: vi.fn(async () => undefined) };
    const { rerender } = render(<VisitorAssistantPanel controller={controller} CredentialForm={VisitorCredentialForm}
      t={key => key} useVisitorCredentialFormHook={() => credential} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading saved settings…");
    expect(screen.queryByText("Needs a key")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Provider" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();

    const hydrated = fakeController({ loadState: { status: "ready" }, hasStoredKey: true, hasUsableKey: true });
    rerender(<VisitorAssistantPanel controller={controller} CredentialForm={VisitorCredentialForm}
      t={key => key} useVisitorCredentialFormHook={() => hydrated} />);
    expect(screen.queryByText("Loading saved settings…")).toBeNull();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Provider" })).toBeInTheDocument();
  });

  it("the panel reports a failed credential read instead of the steps", () => {
    const credential = fakeController({ loadState: { status: "error", message: "Stored settings unavailable" } });
    const controller = { settings: { publicEnabled: false, widget: "react" as const }, saving: false,
      saveError: null, setPublicEnabled: vi.fn(async () => undefined), setWidget: vi.fn(async () => undefined) };
    render(<VisitorAssistantPanel controller={controller} CredentialForm={VisitorCredentialForm}
      t={key => key} useVisitorCredentialFormHook={() => credential} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Stored settings unavailable");
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("the panel shows a save error and turns the assistant on through the switch once a key is stored", () => {
    const credential = fakeController({ loadState: { status: "ready" }, hasStoredKey: true, hasUsableKey: true });
    const setPublicEnabled = vi.fn(async () => undefined);
    const controller = { settings: { publicEnabled: false, widget: "react" as const }, saving: false,
      saveError: "Could not save.", setPublicEnabled, setWidget: vi.fn(async () => undefined) };
    render(<VisitorAssistantPanel controller={controller} CredentialForm={VisitorCredentialForm}
      t={key => key} useVisitorCredentialFormHook={() => credential} />);
    expect(screen.getByText("Could not save.")).toHaveClass("save-error");
    const toggle = screen.getByRole("switch");
    expect(screen.queryByText("Save a key in step 1 first.")).toBeNull();
    fireEvent.click(toggle);
    expect(setPublicEnabled).toHaveBeenCalledWith(true);
  });

  it("the panel blocks the switch with its reason until a key is stored", () => {
    const credential = fakeController({ loadState: { status: "ready" }, hasStoredKey: false, hasUsableKey: false });
    const controller = { settings: { publicEnabled: false, widget: "react" as const }, saving: false,
      saveError: null, setPublicEnabled: vi.fn(async () => undefined), setWidget: vi.fn(async () => undefined) };
    render(<VisitorAssistantPanel controller={controller} CredentialForm={VisitorCredentialForm}
      t={key => key} useVisitorCredentialFormHook={() => credential} />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeDisabled();
    const reason = screen.getByText("Save a key in step 1 first.", { selector: "p.visitor-step-hint" });
    expect(toggle.getAttribute("aria-describedby")?.split(" ")).toContain(reason.id);
  });

  it("the panel's widget choice saves vanilla for Pure JS and react otherwise", async () => {
    const credential = fakeController({ loadState: { status: "ready" }, hasStoredKey: true, hasUsableKey: true });
    const setWidget = vi.fn(async () => undefined);
    const controller = { settings: { publicEnabled: false }, saving: false,
      saveError: null, setPublicEnabled: vi.fn(async () => undefined), setWidget };
    render(<VisitorAssistantPanel controller={controller} CredentialForm={VisitorCredentialForm}
      t={key => key} useVisitorCredentialFormHook={() => credential} />);
    const widget = screen.getByLabelText("Widget") as HTMLSelectElement;
    // No stored widget yet: the React widget is what renders.
    expect(widget.value).toBe("react");
    fireEvent.change(widget, { target: { value: "vanilla" } });
    fireEvent.change(widget, { target: { value: "react" } });
    expect(setWidget.mock.calls).toEqual([[{ widget: "vanilla" }], [{ widget: "react" }]]);
  });

  it("reports a failed settings read without displaying default provider fields", () => {
    render(<VisitorCredentialForm useVisitorCredentialFormHook={() => fakeController({
      loadState: { status: "error", message: "Stored settings unavailable" },
    })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Stored settings unavailable");
    expect(screen.queryByRole("combobox", { name: "Provider" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save key" })).toBeNull();
  });

  it("forwards edited keys and provider selections to the controller", async () => {
    const user = userEvent.setup();
    const editConfig = vi.fn();
    const selectPresetById = vi.fn();
    function useFake() {
      const [config, setConfig] = useState(fakeController().config);
      return fakeController({ config, selectPresetById, editConfig: (next) => { editConfig(next); setConfig(next); } });
    }
    render(<VisitorCredentialForm useVisitorCredentialFormHook={useFake} />);

    const keyField = document.querySelector<HTMLInputElement>('input[autocomplete="new-password"]')!;
    await user.type(keyField, "visitor-key-123");
    expect(editConfig).toHaveBeenLastCalledWith({ ...fakeController().config, apiKey: "visitor-key-123" });
    expect(keyField).toHaveValue("visitor-key-123");
    expect(screen.getByRole("button", { name: "Save key" })).toBeEnabled();
    for (const baseUrl of ["https://api.openai.com/v1", "https://openrouter.ai/api/v1"]) {
      const preset = DEFAULT_PROVIDER_PRESETS.find((p) => p.baseUrl === baseUrl)!;
      await user.selectOptions(screen.getByRole("combobox", { name: "Provider" }), preset.id);
      expect(selectPresetById).toHaveBeenLastCalledWith(preset.id);
    }
  });

  it("uses the stored key mask and runs the connection probe with an empty key field", async () => {
    const controller = fakeController({
      config: { ...fakeController().config, model: "gemini-flash-latest" },
      hasUsableKey: true,
      hasStoredKey: true,
      stored: { isSet: true, masked: "••••ab12", provider: "google", baseUrl: null, model: null, updatedAt: null },
      connectionTest: { status: "error", message: "connection refused" },
    });
    render(<VisitorCredentialForm useVisitorCredentialFormHook={() => controller} t={(key) => key === "connection refused" ? "Translated connection failure" : key} />);

    expect(screen.getByPlaceholderText("••••ab12")).toHaveValue("");
    expect(screen.getByText("Translated connection failure")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Test connection" });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(controller.runTestConnection).toHaveBeenCalledTimes(1);
    expect(controller.runKeyTest).not.toHaveBeenCalled();
  });

  it("renders the provider select, key field and separate save actions via the injected hook", () => {
    const useFake = () => fakeController();
    render(<VisitorCredentialForm useVisitorCredentialFormHook={useFake} />);

    const provider = screen.getByRole("combobox", { name: "Provider" });
    expect(within(provider).getByRole("group", { name: "Protocols" })).toBeInTheDocument();
    expect(within(provider).getByRole("group", { name: "Gateways" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^API key/)).toHaveValue("");
    // Save key reaches the real ByokProviderForm's apiKeyActions slot under the input;
    // Save model settings uses modelFooter before Advanced. The Visitor panel now owns the intro copy.
    const saveKey = screen.getByRole("button", { name: "Save key" });
    expect(saveKey.closest(".jini-byok-key-actions")).not.toBeNull();
    expect(saveKey).toBeDisabled();
    const saveModel = screen.getByRole("button", { name: "Save model settings" });
    expect(saveModel).toBeInTheDocument();
    expect(saveModel.compareDocumentPosition(screen.getByText("Advanced")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// The standalone form needs the same host catalog as ExecutionTab for foreign-key hints.
it("warns when an Anthropic key is pasted into the standalone OpenAI form", () => {
  const preset = DEFAULT_PROVIDER_PRESETS.find((entry) => entry.id === "openai")!;
  render(<VisitorCredentialForm useVisitorCredentialFormHook={() => fakeController({
    preset,
    config: { protocol: "openai", providerId: "openai", baseUrl: preset.baseUrl, model: preset.preferredModels[0], apiKey: "sk-ant-" + "x".repeat(40) },
  })} />);
  expect(screen.getByText(/looks like.*Anthropic/i)).toBeInTheDocument();
});

describe("in-flight and settled states of the visitor key and settings controls", () => {
  it("Test key reads Testing… and is disabled while the provider is being asked", () => {
    render(<VisitorCredentialKeyActions {...fakeController({ hasUsableKey: true, discovery: { status: "loading" } })} />);
    expect(screen.getByRole("button", { name: "Testing…" })).toBeDisabled();
  });

  it("Save key reads Saving… while the key is being saved", () => {
    render(<VisitorCredentialKeyActions {...fakeController({ hasUsableKey: true, saveState: { status: "saving" } })} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
  });

  it("Save model settings reads Saving… and is disabled while saving, with the status line beside it", () => {
    render(<VisitorCredentialSettingsFooter {...fakeController({ dirty: true, settingsSaveState: { status: "saving" } })} />);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByText("Saving…", { selector: "p.assistant-save-line" })).toBeInTheDocument();
  });

  it("confirms saved settings and shows a failed save's message", () => {
    const { unmount } = render(<VisitorCredentialSettingsFooter {...fakeController({ settingsSaveState: { status: "saved", at: null } })} />);
    expect(screen.getByText("Settings saved.")).toHaveClass("assistant-save-line");
    unmount();
    render(<VisitorCredentialSettingsFooter {...fakeController({ dirty: true, settingsSaveState: { status: "error", message: "Model not allowed." } })} />);
    expect(screen.getByText("Model not allowed.")).toHaveClass("save-error");
    expect(screen.getByRole("button", { name: "Save model settings" })).toBeEnabled();
  });

  it("the form shows its loading line until the saved credential arrives", () => {
    render(<VisitorCredentialForm useVisitorCredentialFormHook={() => fakeController({ loadState: { status: "loading" } })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading saved settings…");
    expect(screen.queryByRole("combobox", { name: "Provider" })).toBeNull();
  });

  it("offers Custom endpoint only while no catalog preset matches the config", () => {
    const { unmount } = render(<VisitorCredentialForm useVisitorCredentialFormHook={() => fakeController()} />);
    expect(screen.getByRole("option", { name: "Custom endpoint" })).toBeDisabled();
    unmount();
    const preset = DEFAULT_PROVIDER_PRESETS[0]!;
    render(<VisitorCredentialForm useVisitorCredentialFormHook={() => fakeController({ preset })} />);
    expect(screen.queryByRole("option", { name: "Custom endpoint" })).toBeNull();
    expect((screen.getByRole("combobox", { name: "Provider" }) as HTMLSelectElement).value).toBe(preset.id);
  });

  it("marks a provider that already holds a saved key as configured", () => {
    const preset = DEFAULT_PROVIDER_PRESETS[0]!;
    render(<VisitorCredentialForm useVisitorCredentialFormHook={() => fakeController({
      preset, providerGroups: visitorProviderGroups(new Set([preset.id])),
    })} />);
    expect(screen.getByRole("option", { name: `${preset.title} (configured)` })).toBeInTheDocument();
  });
});
