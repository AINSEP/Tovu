import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ADMIN_LOCALES } from "../../lib/settings-tabs";
import { useAdminLocale } from "../use-admin-locale.hooks";
import { useAdminDocumentLocale } from "../use-admin-document-locale.hooks";

const originalLang = document.documentElement.lang;
const originalDir = document.documentElement.dir;
afterEach(() => { document.documentElement.lang = originalLang; document.documentElement.dir = originalDir; });

it.each(ADMIN_LOCALES.map(({ code }) => code))("sets document lang and direction for supported locale %s", (locale) => {
  renderHook(() => useAdminDocumentLocale({ locale }, {}));
  expect(document.documentElement.lang).toBe(locale);
  expect(document.documentElement.dir).toBe(["ar", "fa", "ur"].includes(locale) ? "rtl" : "ltr");
});

it("follows loaded locale and settings refreshes, including switching back from RTL", async () => {
  let locale = "ar";
  let refresh = () => {};
  const port = {
    loadLanguage: async () => locale,
    subscribeToSettingsRefresh: (listener: () => void) => { refresh = listener; return () => {}; },
  };
  renderHook(() => {
    const loaded = useAdminLocale(port);
    useAdminDocumentLocale({ locale: loaded }, {});
  });
  await waitFor(() => expect(document.documentElement.lang).toBe("ar"));
  expect(document.documentElement.dir).toBe("rtl");
  locale = "fr";
  await act(async () => refresh());
  expect(document.documentElement.lang).toBe("fr");
  expect(document.documentElement.dir).toBe("ltr");
});

it("applies regional RTL tags and supports an injected document root", () => {
  const root = document.createElement("div");
  const { rerender } = renderHook(({ locale }) => useAdminDocumentLocale({ locale }, { root }), { initialProps: { locale: "ar-SA" } });
  expect(root.lang).toBe("ar-SA");
  expect(root.dir).toBe("rtl");
  rerender({ locale: "pt-BR" });
  expect(root.lang).toBe("pt-BR");
  expect(root.dir).toBe("ltr");
});
