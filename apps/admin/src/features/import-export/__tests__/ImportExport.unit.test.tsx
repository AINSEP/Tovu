import { render, screen } from "@/__tests__/fetch-query-render";
import { expect, it } from "vitest";
import { ImportExport } from "../ImportExport";
import { IMPORT_EXPORT_DICT, t } from "../import-export-i18n";

it("links each card to the screen that owns the flow, with a distinct accessible name", () => {
  render(<ImportExport />);
  expect(screen.getByRole("heading", { level: 1, name: "Import & Export" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Export Site" }).getAttribute("href")).toBe("/admin/sites?tab=export");
  expect(screen.getByRole("link", { name: "Open Import Site" }).getAttribute("href")).toBe("/admin/sites?tab=import");
  expect(screen.getByRole("link", { name: "Open Static Site" }).getAttribute("href")).toBe("/admin/deployment?tab=static-site");
});

it("renders through the translator it is given", () => {
  render(<ImportExport useTranslate={() => (key) => `[${key}]`} />);
  expect(screen.getByRole("heading", { level: 1, name: "[Import & Export]" })).toBeTruthy();
  expect(screen.getByText("[Read-only HTML of the published pages, for any static host.]")).toBeTruthy();
});

it("carries every key in every locale", () => {
  const keys = Object.keys(IMPORT_EXPORT_DICT.es);
  for (const [locale, entries] of Object.entries(IMPORT_EXPORT_DICT)) expect(Object.keys(entries), locale).toEqual(keys);
  expect(t({ locale: "fr", key: "Open" })).toBe("Ouvrir");
  expect(t({ locale: "fr", key: "Operations" })).not.toBe("Operations");
});
