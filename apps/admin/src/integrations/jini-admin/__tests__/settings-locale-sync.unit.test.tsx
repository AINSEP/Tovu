// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "@jini-ai/ui";

import { useWiredSettingsLocaleSync } from "../settings-locale-sync.hooks";

/**
 * @file The host half of the settings locale sync: `useWiredSettingsLocaleSync` binds the UI
 * library's real `useI18n()` to Jini's injected `useSettingsLocaleSync`
 * (`@jini-ai/admin/screens/settings/hooks/use-settings-locale-sync.hooks`, whose own suite covers the
 * pure effect with a fake `setLocale`).
 */

/** Renders `useI18n().locale` as text, so a test can observe the REAL provider's locale after
 *  `useWiredSettingsLocaleSync` runs inside it. */
function LocaleProbe({ locale }: { locale: string }) {
  useWiredSettingsLocaleSync({ locale });
  const { locale: activeLocale } = useI18n();
  return <span data-testid="active-locale">{activeLocale}</span>;
}

describe("useWiredSettingsLocaleSync", () => {
  it("composes the real useI18n() — a real I18nProvider's locale follows the prop", async () => {
    render(
      <I18nProvider initialLocale="en">
        <LocaleProbe locale="fr" />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("active-locale").textContent).toBe("fr"));
  });
});
