import { render, screen } from "@/__tests__/render-with-jini-kits";
import { expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { Taxonomy } from "../TaxonomyScreen";
import { useTaxonomy } from "@jini-ai/admin/screens/taxonomy/hooks/use-taxonomy.hooks";
import { createFakeTaxonomyPort } from "@jini-ai/admin/screens/taxonomy/hooks/taxonomy-dependencies.hooks";
import { createTaxonomyBlockedError, taxonomyHostKit } from "../taxonomy-host-ports";

it("groups copy embed with the taxonomy row actions at the right of the header", async () => {
  const port = createFakeTaxonomyPort({ blockedError: createTaxonomyBlockedError }, { groups: [{ taxonomy: {
    id: "categories", name: "Categories", hierarchical: true, status: "active", version: 1, updatedAt: "2026-10-04",
  }, terms: [] }] });
  render(<FetchQueryProvider><Taxonomy useTaxonomyHook={() => useTaxonomy({ port, locale: "en", t: (key) => key, kit: taxonomyHostKit })} /></FetchQueryProvider>);
  const copy = await screen.findByRole("button", { name: "Copy HTML embed" });
  expect(copy.parentElement).toHaveClass("jini-page-actions");
  expect(copy.parentElement?.parentElement).toHaveClass("jini-taxonomy-namespace-group-header");
  expect(copy.parentElement?.contains(screen.getByRole("heading", { name: "Categories", level: 2 }))).toBe(false);
});
