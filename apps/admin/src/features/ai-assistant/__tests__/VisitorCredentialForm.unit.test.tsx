import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  VisitorCredentialForm,
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
 * - `VisitorCredentialKeyFooter` — a plain React component once given its (now narrow) props, so
 *   every disabled/label/status state is driven directly without needing the real hook or `fetch`.
 * - `VisitorCredentialForm` — exercised through its own `useVisitorCredentialFormHook` injection
 *   seam (already existed before this pass; unused by any test until now), the same convention
 *   `WidgetInstanceEditor.tsx` and `Posts.tsx` use.
 */

function fakeController(overrides: Partial<VisitorCredentialFormController> = {}): VisitorCredentialFormController {
  return {
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
    configuredPresetIds: new Set(),
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
});

describe("visitorCredentialSaveStatusMessage", () => {
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

describe("VisitorCredentialKeyFooter", () => {
  it("disables Save key on a blank field", () => {
    render(<VisitorCredentialKeyFooter {...fakeController()} />);
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();
  });

  it("enables Save key once a key is typed", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ config: { ...fakeController().config, apiKey: "sk-live" } })} />);
    expect(screen.getByRole("button", { name: "Save key" })).toBeEnabled();
  });

  it("keeps Save key disabled on a blank field even when one is already STORED", () => {
    // A stored key does not make the empty field writable — the same narrowing the admin panel's
    // Save key carries (f39be651). Pressing it would offer to write nothing.
    render(
      <VisitorCredentialKeyFooter
        {...fakeController({ hasStoredKey: true, stored: { isSet: true, masked: "••••ab12", provider: "google", baseUrl: null, model: null, updatedAt: null } })}
      />,
    );
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();
  });

  it("keeps Save key disabled for a whitespace-only field", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ config: { ...fakeController().config, apiKey: "   \t   " } })} />);
    expect(screen.getByRole("button", { name: "Save key" })).toBeDisabled();
  });

  it("calls saveKey when Save key is clicked", async () => {
    const user = userEvent.setup();
    const saveKey = vi.fn(async () => undefined);
    render(<VisitorCredentialKeyFooter {...fakeController({ config: { ...fakeController().config, apiKey: "sk-live" }, saveKey })} />);

    await user.click(screen.getByRole("button", { name: "Save key" }));

    expect(saveKey).toHaveBeenCalledTimes(1);
  });

  it("disables Test Key until a usable key exists", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ hasUsableKey: false })} />);
    expect(screen.getByRole("button", { name: "Test Key" })).toBeDisabled();
  });

  it("calls runKeyTest when Test Key is clicked", async () => {
    const user = userEvent.setup();
    const runKeyTest = vi.fn(async () => undefined);
    render(<VisitorCredentialKeyFooter {...fakeController({ hasUsableKey: true, runKeyTest })} />);

    await user.click(screen.getByRole("button", { name: "Test Key" }));

    expect(runKeyTest).toHaveBeenCalledTimes(1);
  });

  it("renders the discovery error banner when discovery failed", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ discovery: { status: "error", message: "provider unreachable" } })} />);
    expect(screen.getByText("provider unreachable")).toBeInTheDocument();
  });

  it("renders the save error banner when saving failed", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ saveState: { status: "error", message: "save failed" } })} />);
    expect(screen.getByText("save failed")).toBeInTheDocument();
  });
});

describe("VisitorCredentialSettingsFooter", () => {
  it("wires Save settings to saveSettings and never to saveKey", async () => {
    const user = userEvent.setup();
    const c = fakeController({ dirty: true });
    render(<VisitorCredentialSettingsFooter {...c} />);

    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(c.saveSettings).toHaveBeenCalledTimes(1);
    // The whole point of the split: this control cannot reach the key path at all.
    expect(c.saveKey).not.toHaveBeenCalled();
  });

  it("stays enabled with a blank key field — settings are not the key", () => {
    render(<VisitorCredentialSettingsFooter {...fakeController({ dirty: true })} />);
    expect(screen.getByRole("button", { name: "Save settings" })).toBeEnabled();
  });

  it("is disabled until something actually changed, so it never rewrites what the server just sent", () => {
    render(<VisitorCredentialSettingsFooter {...fakeController({ dirty: false })} />);
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
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
    const { container: keyFooter } = render(<VisitorCredentialKeyFooter {...c} />);
    const { container: settingsFooter } = render(<VisitorCredentialSettingsFooter {...c} />);

    const saveKey = keyFooter.querySelector("button");
    const saveSettings = settingsFooter.querySelector("button");
    expect(saveKey).toHaveClass("btn-primary");
    expect(saveSettings!.className).toBe(saveKey!.className);
  });
});

describe("VisitorCredentialForm", () => {
  it("renders the intro copy, provider chips, and key field via the injected hook", () => {
    const useFake = () => fakeController();
    render(<VisitorCredentialForm useVisitorCredentialFormHook={useFake} />);

    expect(screen.getByText(/This key is for your visitors, not for you/)).toBeInTheDocument();
    expect(screen.getByText("Protocols")).toBeInTheDocument();
    expect(screen.getByText("Gateways")).toBeInTheDocument();
    // Both save buttons live in footer components reached through the real `ByokProviderForm`'s
    // `apiKeyFooter` and `formFooter` slots — proves the wiring survived the extraction and the
    // split, not just the footer components in isolation.
    expect(screen.getByRole("button", { name: "Save key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeInTheDocument();
  });
});
