import { Taxonomy as TaxonomyView } from "@jini-ai/admin/screens/taxonomy/Taxonomy";
import { useTaxonomyRowMenu } from "@jini-ai/admin/screens/taxonomy/TaxonomyRowMenu.hooks";
import type { TaxonomyController } from "@jini-ai/admin/screens/taxonomy/hooks/use-taxonomy.hooks";
import { ServerLabel } from "@/components/status-labels";
import { PublishSectionButton } from "../publish-content/PublishSectionButton";
import {
  useWiredMergeTermSection,
  useWiredNewTaxonomyForm,
  useWiredNewTermForm,
  useWiredTaxonomy,
  useWiredTermDetailPanel,
} from "./taxonomy-wired.hooks";

/**
 * @file The admin's Categories & Tags route: `@jini-ai/admin`'s `Taxonomy` screen bound to this
 * host — every hook to its `useWiredX` binding (live port, admin locale, `taxonomyHostKit`), the
 * row-menu hook, this admin's `ServerLabel` for status pills and its "Publish categories" button.
 */

export interface TaxonomyProps {
  /** Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   *  for `useCustomSelect`. Defaulted to the real hook, so production callers (`panels.tsx`) pass
   *  nothing and behave exactly as before. */
  useTaxonomyHook?: () => TaxonomyController;
}

export function Taxonomy({ useTaxonomyHook = useWiredTaxonomy }: TaxonomyProps = {}) {
  return (
    <TaxonomyView
      useTaxonomyHook={useTaxonomyHook}
      useNewTermFormHook={useWiredNewTermForm}
      useNewTaxonomyFormHook={useWiredNewTaxonomyForm}
      useMergeTermSectionHook={useWiredMergeTermSection}
      useTermDetailPanelHook={useWiredTermDetailPanel}
      useTaxonomyRowMenuHook={useTaxonomyRowMenu}
      StatusLabel={ServerLabel}
      publishButton={<PublishSectionButton section="categories" />}
    />
  );
}
