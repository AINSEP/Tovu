import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  VisitorCredentialForm,
  VisitorCredentialKeyFooter,
  visitorCredentialApiKeyPlaceholder,
  visitorCredentialKeyStatusMessage,
  visitorCredentialSaveStatusMessage,
} from "../AiAssistant";
import type { VisitorCredentialFormController } from "../hooks/use-visitor-credential-form.hooks";

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
    dirty: false,
    hasUsableKey: false,
    hasStoredKey: false,
    configuredPresetIds: new Set(),
    selectPreset: vi.fn(),
    saveCredential: vi.fn(async () => undefined),
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
  it("reports Saving… while saving, regardless of dirty/stored", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "saving" }, true, null)).toBe("Saving…");
  });

  it("reports success once saved", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "saved", at: null }, false, null)).toBe("Saved to the server, encrypted.");
  });

  it("prompts to press Save when idle and dirty", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "idle" }, true, null)).toBe("Not saved yet — press Save.");
  });

  it("reports the stored key when idle, clean, and a key is stored", () => {
    expect(
      visitorCredentialSaveStatusMessage({ status: "idle" }, false, { isSet: true, masked: "••••ab12", provider: "google", baseUrl: null, model: null, updatedAt: null }),
    ).toBe("Stored on the server, encrypted. Paste a new key to replace it.");
  });

  it("prompts to paste a key when idle, clean, and nothing is stored", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "idle" }, false, null)).toBe("Paste your key, check it with Show, then press Save.");
  });

  it("returns null on error (the error itself renders separately)", () => {
    expect(visitorCredentialSaveStatusMessage({ status: "error", message: "boom" }, false, null)).toBeNull();
  });
});

describe("VisitorCredentialKeyFooter", () => {
  it("disables Save until the form is dirty", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ dirty: false })} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("enables Save once dirty and a key exists (typed or stored)", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ dirty: true, config: { ...fakeController().config, apiKey: "sk-live" } })} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("keeps Save disabled when dirty but neither a typed nor a stored key exists", () => {
    render(<VisitorCredentialKeyFooter {...fakeController({ dirty: true, hasStoredKey: false })} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls saveCredential when Save is clicked", async () => {
    const user = userEvent.setup();
    const saveCredential = vi.fn(async () => undefined);
    render(<VisitorCredentialKeyFooter {...fakeController({ dirty: true, hasStoredKey: true, saveCredential })} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveCredential).toHaveBeenCalledTimes(1);
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

describe("VisitorCredentialForm", () => {
  it("renders the intro copy, provider chips, and key field via the injected hook", () => {
    const useFake = () => fakeController();
    render(<VisitorCredentialForm useVisitorCredentialFormHook={useFake} />);

    expect(screen.getByText(/This key is for your visitors, not for you/)).toBeInTheDocument();
    expect(screen.getByText("Protocols")).toBeInTheDocument();
    expect(screen.getByText("Gateways")).toBeInTheDocument();
    // The Save button lives inside `VisitorCredentialKeyFooter`, reached here through the real
    // `ByokProviderForm`'s `apiKeyFooter` slot — proves the wiring survived the extraction, not just
    // the footer component in isolation.
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
