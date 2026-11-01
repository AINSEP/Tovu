import { cleanup, fireEvent, render, screen, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAdminLocalePort } from "@/hooks/admin-locale-dependencies.hooks";
import { Themes } from "../Themes";
import { WiredThemePreviewReloadButton } from "../ThemePreviewReloadButton";
import { createFakeThemesPort } from "../hooks/themes-dependencies.hooks";
import { useThemes } from "../hooks/use-themes.hooks";
import { THEMES_DICT, t } from "../themes-i18n";

const REQUIRED_KEYS = [
  "Expand preview for {id}",
  "preview reload failed",
  "failed to load themes",
  "failed to rescan themes",
  "added {themes}",
  "removed {themes}",
  "no changes — {total} themes",
  "{summary}. Duplicate theme ids: {ids} — only one of each will ever load.",
  "This template is inherited from the bundled theme and is read-only.",
];
const COPY = [
  {
    locale: "es", preview: "Ampliar vista previa de basic", rescan: "Volver a escanear temas",
    changed: "añadidos Tovu, Sakura · eliminados Column", unchanged: "sin cambios — temas: 1",
    duplicates: "sin cambios — temas: 1. Identificadores de tema duplicados: basic — solo se cargará uno de cada uno.",
    loadError: "No se pudieron cargar los temas", rescanError: "No se pudieron volver a escanear los temas",
    reload: "Recargar vista previa", reloadError: "No se pudo recargar la vista previa",
  },
  {
    locale: "ja", preview: "basic のプレビューを拡大", rescan: "テーマを再スキャン",
    changed: "追加: Tovu, Sakura · 削除: Column", unchanged: "変更なし — テーマ数: 1",
    duplicates: "変更なし — テーマ数: 1。重複するテーマ ID: basic — 各 ID につき 1 つだけ読み込まれます。",
    loadError: "テーマを読み込めませんでした", rescanError: "テーマを再スキャンできませんでした",
    reload: "プレビューを再読み込み", reloadError: "プレビューを再読み込みできませんでした",
  },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Themes localization: rendered copy and locale-independent severity", () => {
  for (const copy of COPY) {
    const translate = (key: string) => t({ locale: copy.locale, key });

    it(`translates the preview accessible name in ${copy.locale}`, async () => {
      const port = createFakeThemesPort();
      render(<Themes useThemesHook={() => useThemes({ port, t: translate })} />);
      expect(await screen.findByRole("button", { name: copy.preview })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Expand preview for basic" })).not.toBeInTheDocument();
    });

    it(`translates every rescan outcome in ${copy.locale}, preserving ids and warning severity`, async () => {
      const port = createFakeThemesPort();
      const rescan = vi.spyOn(port, "rescanThemes");
      rescan.mockResolvedValue({ added: ["Tovu", "Sakura"], removed: ["Column"], total: 1, availableThemeIds: ["basic"], duplicateIds: [] });
      render(<Themes useThemesHook={() => useThemes({ port, t: translate })} />);
      const button = await screen.findByRole("button", { name: copy.rescan });
      fireEvent.click(button);
      expect(await screen.findByRole("status")).toHaveTextContent(copy.changed);

      rescan.mockResolvedValue({ added: [], removed: [], total: 1, availableThemeIds: ["basic"], duplicateIds: ["basic"] });
      fireEvent.click(button);
      expect(await screen.findByRole("alert")).toHaveTextContent(copy.duplicates);

      rescan.mockResolvedValue({ added: [], removed: [], total: 1, availableThemeIds: ["basic"], duplicateIds: [] });
      fireEvent.click(button);
      expect(await screen.findByRole("status")).toHaveTextContent(copy.unchanged);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      // Theme names are user data: the English word must never decide the toast's severity.
      rescan.mockResolvedValue({ added: ["Duplicate"], removed: [], total: 1, availableThemeIds: ["basic"], duplicateIds: [] });
      fireEvent.click(button);
      expect(await screen.findByRole("status")).toHaveTextContent("Duplicate");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it(`uses structured severity for already translated notices in ${copy.locale}`, async () => {
      const port = createFakeThemesPort();
      render(<Themes useThemesHook={() => ({
        ...useThemes({ port, t: translate }), rescanNotice: copy.duplicates, rescanHasDuplicates: true,
      })} />);
      expect(await screen.findByRole("alert")).toHaveTextContent(copy.duplicates);
    });

    it(`translates a non-Error initial-load failure in ${copy.locale}`, async () => {
      const port = createFakeThemesPort();
      vi.spyOn(port, "getPresentation").mockRejectedValue(null);
      render(<Themes useThemesHook={() => useThemes({ port, t: translate })} />);
      expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    });

    it(`translates a non-Error rescan failure in ${copy.locale}`, async () => {
      const port = createFakeThemesPort();
      vi.spyOn(port, "rescanThemes").mockRejectedValue(null);
      render(<Themes useThemesHook={() => useThemes({ port, t: translate })} />);
      fireEvent.click(await screen.findByRole("button", { name: copy.rescan }));
      expect(await screen.findByText(copy.rescanError)).toBeInTheDocument();
    });

    it(`translates a non-Error preview reload failure in ${copy.locale}`, async () => {
      vi.spyOn(defaultAdminLocalePort, "loadLanguage").mockResolvedValue(copy.locale);
      render(<WiredThemePreviewReloadButton reloadPreviews={async () => { throw null; }} />);
      fireEvent.click(await screen.findByRole("button", { name: copy.reload }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(copy.reloadError));
    });
  }
});

describe("Themes localization: required copy coverage (including keys absent in every locale)", () => {
  it.each(Object.keys(THEMES_DICT))("translates all required keys and preserves interpolation in %s", (locale) => {
    for (const key of REQUIRED_KEYS) {
      const translation = THEMES_DICT[locale]?.[key];
      expect(translation, `${locale}: ${key}`).toBeTruthy();
      expect(translation).not.toBe(key);
      expect(t({ locale, key })).toBe(translation);
      expect(translation?.match(/\{\w+\}/g)?.sort() ?? []).toEqual(key.match(/\{\w+\}/g)?.sort() ?? []);
    }
  });
});
