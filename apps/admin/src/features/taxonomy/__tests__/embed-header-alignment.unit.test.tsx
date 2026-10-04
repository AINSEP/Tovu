import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { Taxonomy } from "../Taxonomy";
import { useTaxonomy } from "../hooks/use-taxonomy.hooks";
import { createFakeTaxonomyPort } from "../hooks/taxonomy-dependencies.hooks";

it("groups copy embed with the taxonomy row actions at the right of the header", async () => {
  const port = createFakeTaxonomyPort({ groups: [{ taxonomy: {
    id: "categories", name: "Categories", hierarchical: true, status: "active", version: 1, updatedAt: "2026-10-04",
  }, terms: [] }] });
  render(<FetchQueryProvider><Taxonomy useTaxonomyHook={() => useTaxonomy(port, "en", (key) => key)} /></FetchQueryProvider>);
  const copy = await screen.findByRole("button", { name: "Copy HTML embed" });
  expect(copy.parentElement).toHaveClass("page-actions");
  expect(copy.parentElement?.parentElement).toHaveClass("taxonomy-namespace-group-header");
  expect(copy.parentElement?.contains(screen.getByRole("heading", { name: "Categories", level: 2 }))).toBe(false);
});
