// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "@jini-ai/ui";

import { useAiAssistantLocaleSync, useWiredAiAssistantLocaleSync } from "../hooks/use-ai-assistant-locale-sync.hooks";

/**
 * @file `useAiAssistantLocaleSync` — the `useWiredX` dependency-injection conversion (owner-ruled
 * in-scope: "same treatment, inject them too", same as every other `useAdminLocale()`-adjacent
 * reach in this audit). `useI18n()`'s `{ locale, setLocale }` pair is injected as
 * `{ activeLocale, setLocale }` rather than called directly, so the first `describe` block below
 * describes "the provider's locale disagrees with the prop" with a plain fake `setLocale` — no
 * `I18nProvider` mounted at all. No prior test file existed for this hook.
 */

describe("useAiAssistantLocaleSync", () => {
  it("calls setLocale on mount when the provider's active locale disagrees with the prop", () => {
    const setLocale = vi.fn();
    renderHook(() => useAiAssistantLocaleSync({ locale: "es" }, { activeLocale: "en", setLocale }));

    expect(setLocale).toHaveBeenCalledWith("es");
  });

  it("does not call setLocale when the provider already agrees", () => {
    const setLocale = vi.fn();
    renderHook(() => useAiAssistantLocaleSync({ locale: "en" }, { activeLocale: "en", setLocale }));

    expect(setLocale).not.toHaveBeenCalled();
  });

  it("re-syncs when the locale prop changes after mount", () => {
    const setLocale = vi.fn();
    const { rerender } = renderHook(
      ({ locale, activeLocale }) => useAiAssistantLocaleSync({ locale }, { activeLocale, setLocale }),
      { initialProps: { locale: "en", activeLocale: "en" } },
    );
    expect(setLocale).not.toHaveBeenCalled();

    rerender({ locale: "fr", activeLocale: "en" });
    expect(setLocale).toHaveBeenCalledWith("fr");
  });

  it("re-syncs when the injected activeLocale itself drifts, without the prop changing", () => {
    // Proves the effect actually reads the INJECTED activeLocale, not just the prop — a fake that
    // silently ignored `activeLocale` would still pass the two tests above.
    const setLocale = vi.fn();
    const { rerender } = renderHook(
      ({ activeLocale }) => useAiAssistantLocaleSync({ locale: "en" }, { activeLocale, setLocale }),
      { initialProps: { activeLocale: "en" } },
    );
    expect(setLocale).not.toHaveBeenCalled();

    rerender({ activeLocale: "de" });
    expect(setLocale).toHaveBeenCalledWith("en");
  });
});

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
