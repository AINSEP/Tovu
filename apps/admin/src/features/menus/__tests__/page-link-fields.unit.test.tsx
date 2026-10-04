import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { AdminMenuItem } from "@/lib/api";
import { MenuPageLinkFields } from "../MenuPageLinkFields";
import { MENUS_DICT } from "../menus-i18n";

it("selects pages by id and retains unpublished/missing references with an admin hint", () => {
  let item: AdminMenuItem = { id: "footer-about", label: "About", target: { kind: "entryRef", entryId: "about" } };
  const pages = [{ id: "about", title: "Our story", status: "published" as const, publicPath: "/about" }, { id: "contact", title: "Contact", status: "draft" as const, publicPath: "/contact" }];
  const onChange = (_path: number[], update: (old: AdminMenuItem) => AdminMenuItem) => { item = update(item); };
  const { rerender } = render(<MenuPageLinkFields item={item} path={[0]} pages={pages} onChange={onChange} t={(key) => key} />);
  expect(screen.getByRole("combobox", { name: "Page" })).toHaveValue("about");
  expect(screen.queryByText("Page not published")).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Page" }), { target: { value: "contact" } });
  expect(item.target).toEqual({ kind: "entryRef", entryId: "contact", entryType: "page", lastKnownHref: "/contact" });
  rerender(<MenuPageLinkFields item={item} path={[0]} pages={pages} onChange={onChange} t={(key) => key} />);
  expect(screen.getByText("Page not published")).toBeVisible();
  item = { ...item, target: { kind: "entryRef", entryId: "trashed" } };
  rerender(<MenuPageLinkFields item={item} path={[0]} pages={pages} onChange={onChange} t={(key) => key} />);
  expect(screen.getByRole("combobox", { name: "Page" })).toHaveValue("trashed");
  expect(screen.getByText("Page not published")).toBeVisible();
});

it("localizes page selection and the publication hint in every feature locale", () => {
  for (const [locale, dictionary] of Object.entries(MENUS_DICT)) {
    for (const key of ["Page", "Choose a page…", "Page not published"]) expect(dictionary[key], `${locale}: ${key}`).toBeTypeOf("string");
  }
});
