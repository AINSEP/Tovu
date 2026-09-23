import { render, screen } from "@testing-library/react";
import { ByokProviderForm, I18nProvider, SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import { describe, expect, it, vi } from "vitest";

import { t as translateAiAssistant } from "../ai-assistant-i18n";

/**
 * @file The runtime's "No API key — connection test needs the key from this browser." refusal reaches
 * `ByokProviderForm` as a host-supplied `connectionTest.message`, and rendered in English in every
 * locale. `@jini-ai/ui` now routes that message through its own `t()`, and its shipped
 * `SETTINGS_DIALOG_DICTIONARIES` carry the sentence in all 21 locales — the same dictionaries both
 * Tovu mounts hand their `I18nProvider` (`AiAssistant.tsx`, `SettingsUi.tsx`).
 *
 * Mounted the way `AiAssistant.tsx` does it: the screen's own translator first
 * (`t(connectionTest.message)`, which has no entry for this key and passes it through), then the
 * package form under the package dictionaries.
 */
const NO_KEY = "No API key — connection test needs the key from this browser.";

function renderLikeAiAssistant(locale: string) {
  return render(
    <I18nProvider
      initialLocale={locale as "de"}
      dictionaries={SETTINGS_DIALOG_DICTIONARIES}
      fallbackLocale="en"
      syncDocumentAttributes={false}
    >
      <ByokProviderForm
        config={{ protocol: "openai", providerId: "custom", apiKey: "", baseUrl: "https://example.test/v1", model: "m" }}
        onConfigChange={vi.fn()}
        preset={null}
        modelDiscovery={{ status: "idle" }}
        connectionTest={{ status: "error", message: translateAiAssistant(locale, NO_KEY) }}
        onTestConnection={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("ByokProviderForm's no-key connection-test message in the Tovu admin", () => {
  it("renders in German, not raw English", () => {
    renderLikeAiAssistant("de");
    expect(screen.getByRole("alert").textContent).toBe(
      "Kein API-Schlüssel — der Verbindungstest benötigt den Schlüssel aus diesem Browser.",
    );
  });

  it("stays byte-identical in English", () => {
    renderLikeAiAssistant("en");
    expect(screen.getByRole("alert").textContent).toBe(NO_KEY);
  });
});
