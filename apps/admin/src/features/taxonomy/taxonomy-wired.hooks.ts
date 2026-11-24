import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { useMergeTermSection, type MergeTermSectionController, type MergeTermSectionOptions } from "@jini-ai/admin/screens/taxonomy/hooks/use-merge-term-section.hooks";
import { useNewTaxonomyForm, type NewTaxonomyFormController, type NewTaxonomyFormOptions } from "@jini-ai/admin/screens/taxonomy/hooks/use-new-taxonomy-form.hooks";
import { useNewTermForm, type NewTermFormController, type NewTermFormOptions } from "@jini-ai/admin/screens/taxonomy/hooks/use-new-term-form.hooks";
import { useTaxonomy, type TaxonomyController } from "@jini-ai/admin/screens/taxonomy/hooks/use-taxonomy.hooks";
import { useTermDetailPanel, type TermDetailPanelController, type TermDetailPanelOptions } from "@jini-ai/admin/screens/taxonomy/hooks/use-term-detail-panel.hooks";
import { useTermPicker, type TermPickerController, type TermPickerTarget } from "@jini-ai/admin/screens/taxonomy/hooks/use-term-picker.hooks";
import { t as translate } from "./taxonomy-i18n";
import {
  defaultMergeTermSectionPort,
  defaultNewTaxonomyFormPort,
  defaultNewTermFormPort,
  defaultTaxonomyPort,
  defaultTermPickerPort,
  taxonomyHostKit,
} from "./taxonomy-host-ports";

/**
 * @file The admin's zero-argument taxonomy hooks: each binds one `@jini-ai/admin` taxonomy hook to
 * this host's live port (`taxonomy-host-ports.ts`), the resolved `useAdminLocale()` value and
 * {@link taxonomyHostKit}. `Taxonomy.tsx`/`TermPicker.tsx` mount these; tests compose the Jini
 * hooks directly with the in-memory `createFake*Port`s.
 */

/**
 * Binds the real `/api/.../taxonomy` client — see `new-taxonomy-form-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useNewTaxonomyForm} with
 * `createFakeNewTaxonomyFormPort`.
 */
export function useWiredNewTaxonomyForm(options: NewTaxonomyFormOptions): NewTaxonomyFormController {
  const locale = useAdminLocale();
  return useNewTaxonomyForm({ options: options, port: defaultNewTaxonomyFormPort, locale: locale, kit: taxonomyHostKit });
}

/**
 * Binds the real `/api/.../taxonomy/:id/terms` client — see `new-term-form-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useNewTermForm} with `createFakeNewTermFormPort`.
 */
export function useWiredNewTermForm(options: NewTermFormOptions): NewTermFormController {
  const locale = useAdminLocale();
  return useNewTermForm({ options: options, port: defaultNewTermFormPort, locale: locale, kit: taxonomyHostKit });
}

/**
 * Binds the real `/api/.../taxonomy/terms` client — see `taxonomy-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useTermDetailPanel} with `createFakeTaxonomyPort`.
 */
export function useWiredTermDetailPanel(options: TermDetailPanelOptions): TermDetailPanelController {
  const locale = useAdminLocale();
  return useTermDetailPanel({ options: options, port: defaultTaxonomyPort, locale: locale, kit: taxonomyHostKit });
}

/**
 * Binds the real `/api/.../taxonomy/terms/:id/merge` client — see
 * `merge-term-section-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useMergeTermSection} with
 * `createFakeMergeTermSectionPort`.
 */
export function useWiredMergeTermSection(options: MergeTermSectionOptions): MergeTermSectionController {
  const locale = useAdminLocale();
  return useMergeTermSection({ options: options, port: defaultMergeTermSectionPort, locale: locale, kit: taxonomyHostKit });
}

/**
 * Binds the real `/api/.../taxonomy` client and a `TAXONOMY_DICT`-bound translator — see
 * `taxonomy-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Taxonomy.tsx`
 * composes this and a test composes {@link useTaxonomy} with `createFakeTaxonomyPort`.
 */
export function useWiredTaxonomy(): TaxonomyController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate({ locale: locale, key: key });
  return useTaxonomy({ port: defaultTaxonomyPort, locale, t, kit: taxonomyHostKit });
}

/**
 * Binds the real `/api/.../taxonomy` list and `{assigned,assign,unassign}-terms` client and the
 * resolved `useAdminLocale()` value — see `term-picker-dependencies.hooks.ts`. The zero-argument-deps
 * half of the `useX(dependencies)` / `useWiredX()` pair, so `TermPicker.tsx` composes this and a
 * test composes {@link useTermPicker} with `createFakeTermPickerPort`.
 */
export function useWiredTermPicker(props: TermPickerTarget): TermPickerController {
  const locale = useAdminLocale();
  return useTermPicker({ target: props, port: defaultTermPickerPort, locale, kit: taxonomyHostKit });
}
