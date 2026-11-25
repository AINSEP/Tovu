import { useAdminExecutionMode } from "@/features/ai-assistant/hooks/use-admin-execution-mode.hooks";
import { useWiredAdminExecutionCredential } from "@/hooks/use-admin-execution-credential.hooks";
import { useAdminLocale, useWiredAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useTovuSettingsExecution } from "@/hooks/use-tovu-execution-adapters.hooks";
import { useTovuExecutionPolicy } from "@/hooks/use-tovu-execution-policy.hooks";
import { useWiredAiAssistant, useAiAssistantTab } from "@/features/ai-assistant/hooks/use-ai-assistant.hooks";
import { useAdminThemeBoundary } from "@/admin-themes/use-admin-theme.hooks";
import { useWiredAiAssistantLocaleSync } from "@/features/ai-assistant/hooks/use-ai-assistant-locale-sync.hooks";
import { DEFAULT_PROVIDER_PRESETS } from "@jini-ai/integrations/media-providers/catalog";
import { render, screen, waitFor } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { ByokProviderForm, I18nProvider, SETTINGS_DIALOG_DICTIONARIES } from "@jini-ai/ui";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultAdminLocalePort } from "@/hooks/admin-locale-dependencies.hooks";
import { AiAssistant } from "../AiAssistant";
import { t as translateAiAssistant } from "../ai-assistant-i18n";

const requiredAiAssistantHooks = {
  useAdminExecutionModeHook: useAdminExecutionMode,
  useAdminExecutionCredentialHook: useWiredAdminExecutionCredential,
  useAdminLocaleHook: useAdminLocale,
  useTovuSettingsExecutionHook: useTovuSettingsExecution,
  useExecutionPolicy: useTovuExecutionPolicy,
  useAiAssistantHook: useWiredAiAssistant,
  useAdminThemeBoundaryHook: useAdminThemeBoundary,
  useAiAssistantTabHook: useAiAssistantTab,
  useWiredAdminLocaleHook: useWiredAdminLocale,
  useAiAssistantLocaleSyncHook: useWiredAiAssistantLocaleSync,
};

/**
 * @file The runtime's "No API key saved. Save one to test the connection." refusal reaches
 * `ByokProviderForm` as a host-supplied `connectionTest.message`, and rendered in English in every
 * locale. `@jini-ai/ui` now routes that message through its own `t()`, and its shipped
 * `SETTINGS_DIALOG_DICTIONARIES` carry the sentence in all 21 locales — the same dictionaries both
 * Tovu mounts hand their `I18nProvider` (`AiAssistant.tsx`, `SettingsUi.tsx`).
 *
 * Mounted the way `AiAssistant.tsx` does it: the screen's own translator first
 * (`t(connectionTest.message)`, which has no entry for this key and passes it through), then the
 * package form under the package dictionaries.
 */
const NO_KEY = "No API key saved. Save one to test the connection.";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderLikeAiAssistant(locale: string) {
  return render(
    <I18nProvider
      initialLocale={locale as "de"}
      dictionaries={SETTINGS_DIALOG_DICTIONARIES}
      fallbackLocale="en"
      syncDocumentAttributes={false}
    >
      <ByokProviderForm
        presets={DEFAULT_PROVIDER_PRESETS}
        config={{ protocol: "openai", providerId: "custom", apiKey: "", baseUrl: "https://example.test/v1", model: "m" }}
        onConfigChange={vi.fn()}
        preset={null}
        modelDiscovery={{ status: "idle" }}
        connectionTest={{ status: "error", message: translateAiAssistant({ locale: locale, key: NO_KEY }) }}
        onTestConnection={vi.fn()}
      />
    </I18nProvider>,
  );
}

describe("ByokProviderForm's no-key connection-test message in the Tovu admin", () => {
  it("renders in German, not raw English", () => {
    renderLikeAiAssistant("de");
    expect(screen.getByRole("alert").textContent).toBe(
      "Kein API-Schlüssel gespeichert. Speichern Sie einen, um die Verbindung zu testen.",
    );
  });

  it("stays byte-identical in English", () => {
    renderLikeAiAssistant("en");
    expect(screen.getByRole("alert").textContent).toBe(NO_KEY);
  });

  it("translates the refusal through AiAssistant's real provider mount", async () => {
    const user = userEvent.setup();
    vi.spyOn(defaultAdminLocalePort, "loadLanguage").mockResolvedValue("de");
    const fetchMock = vi.fn(async (url: string) => {
      let body: unknown;
      if (String(url).endsWith("/assistant/settings")) {
        body = { data: { publicEnabled: false } };
      } else if (String(url).endsWith("/assistant/site-credential")) {
        // The view says a key exists, but the probe refuses (e.g. it was removed in another tab).
        body = { data: { isSet: true, masked: "••••test", provider: "openai", baseUrl: "https://example.test/v1", model: "m", updatedAt: null } };
      } else if (String(url).endsWith("/assistant/execution/test-connection")) {
        body = { ok: false, message: NO_KEY };
      } else {
        throw new Error(`Unexpected request: ${url}`);
      }
      return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AiAssistant {...requiredAiAssistantHooks} tabId="visitor" />);

    const testConnection = await screen.findByRole("button", { name: "Verbindung testen" });
    await waitFor(() => expect(testConnection).toBeEnabled());
    await user.click(testConnection);

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Kein API-Schlüssel gespeichert. Speichern Sie einen, um die Verbindung zu testen.",
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/assistant/execution/test-connection"))).toBe(true);
  });
});
