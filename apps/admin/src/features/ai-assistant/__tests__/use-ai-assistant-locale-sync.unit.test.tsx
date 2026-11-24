// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "@jini-ai/ui";

import { useWiredAiAssistantLocaleSync } from "../hooks/use-ai-assistant-locale-sync.hooks";

/**
 * @file Host binding of the locale-sync hook to the REAL `useI18n()`. The sync rule itself (the
 * injected `{ activeLocale, setLocale }` cases) is tested beside the hook in `@jini-ai/admin`'s
 * `screens/assistant-settings/__tests__/use-ai-assistant-locale-sync.unit.test.ts`.
 */

/** Renders `useI18n().locale` as text, so a test can observe the REAL provider's locale after
 *  `useWiredAiAssistantLocaleSync` runs inside it. */
function LocaleProbe({ locale }: { locale: string }) {
  useWiredAiAssistantLocaleSync({ locale });
  const { locale: activeLocale } = useI18n();
  return <span data-testid="active-locale">{activeLocale}</span>;
}

describe("useWiredAiAssistantLocaleSync", () => {
  it("composes the real useI18n() — a real I18nProvider's locale follows the prop", async () => {
    render(
      <I18nProvider initialLocale="en">
        <LocaleProbe locale="fr" />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("active-locale").textContent).toBe("fr"));
  });
});
