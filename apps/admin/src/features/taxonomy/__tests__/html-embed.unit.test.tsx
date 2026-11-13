import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminTaxonomy } from "@/lib/api";
import { Taxonomy } from "../Taxonomy";
import { useTaxonomy } from "../hooks/use-taxonomy.hooks";
import { createFakeTaxonomyPort } from "../hooks/taxonomy-dependencies.hooks";
import { taxonomyHtmlEmbed } from "../html-rules";
import { TAXONOMY_DICT } from "../taxonomy-i18n";
import { FORMS_DICT } from "../../forms/forms-i18n";

vi.mock("@/hooks/use-admin-locale.hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-admin-locale.hooks")>()),
  useAdminLocale: () => "en",
  useWiredAdminLocale: () => "en",
}));
afterEach(() => vi.restoreAllMocks());

const category: AdminTaxonomy = { id: "tax-1", name: "Categories", hierarchical: true, status: "active", version: 1, updatedAt: "2026-10-04" };
const tags = { ...category, id: "tax-2", name: "Tags", hierarchical: false };
const wrapper = ({ children }: { children: React.ReactNode }) => <FetchQueryProvider>{children}</FetchQueryProvider>;

describe("taxonomy Copy HTML embed", () => {
  it("copies each saved taxonomy identity via its visible button and shows success/failure", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    const port = createFakeTaxonomyPort({ groups: [category, tags].map((taxonomy) => ({ taxonomy, terms: [] })) });
    render(<Taxonomy useTaxonomyHook={() => useTaxonomy(port, "en", (key) => key)} />, { wrapper });
    const buttons = await screen.findAllByRole("button", { name: "Copy HTML embed" });
    await user.click(buttons[0]);
    expect(writeText).toHaveBeenLastCalledWith(`<div data-embed-config='{"type":"taxonomy","id":"Categories","mode":"html"}'></div>`);
    expect(await screen.findByRole("status")).toHaveTextContent("Copied!");
    await user.click(buttons[1]);
    expect(writeText).toHaveBeenLastCalledWith(`<div data-embed-config='{"type":"taxonomy","id":"Tags","mode":"html"}'></div>`);
    writeText.mockRejectedValueOnce(new Error("denied"));
    await user.click(buttons[1]);
    expect(await screen.findByRole("status")).toHaveTextContent("Could not copy embed");
    writeText.mockRestore();
  });

  it("uses ids for ambiguous names or names shadowing another taxonomy id", () => {
    const duplicate = { ...category, id: "duplicate" };
    expect(taxonomyHtmlEmbed({ taxonomy: category, taxonomies: [category, duplicate] })).toContain('"id":"tax-1"');
    expect(taxonomyHtmlEmbed({ taxonomy: category, taxonomies: [category, { ...tags, id: category.name }] })).toContain('"id":"tax-1"');
    expect(taxonomyHtmlEmbed({ taxonomy: { ...category, name: "O'Reilly" }, taxonomies: [{ ...category, name: "O'Reilly" }] })).toContain("O&#39;Reilly");
  });

  it("translates all new strings in every supported locale", () => {
    for (const locale of Object.keys(FORMS_DICT)) {
      for (const key of ["Copy HTML embed", "Copied!", "Could not copy embed"]) expect(TAXONOMY_DICT[locale]?.[key], `${locale}:${key}`).toBeTruthy();
    }
  });
});
