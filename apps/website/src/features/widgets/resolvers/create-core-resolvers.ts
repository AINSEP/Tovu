import type { EntryDisplayListPort } from "#src/features/entries/public-list";
import type { EntryListPort } from "../../entries/index.js";
import type { FormDefinitionRepoPort } from "../../forms/index.js";
import type { NavMenuReadModel } from "../../navigation/index.js";
import type { WidgetResolver, WidgetTypeKey } from "../types.js";
import { createContactFormResolver } from "./contact-form.js";
import { createMenuResolver } from "./menu.js";
import { createRecentEntriesResolver, type ContentTypeLookup } from "./recent-entries.js";

/**
 * @file Assembles the real, DI'd v1 dynamic resolvers against real infrastructure deps.
 *
 * Purpose:
 * The one place that turns "real repo adapters" into "the closed `CORE_RESOLVERS` map"
 * (`resolvers/index.ts`'s `wireCoreResolvers` calls this). Kept separate from `index.ts` itself so
 * the dispatch module (`resolveWidgetType`, exercised by every test in this slice) has no
 * import-time dependency on `features/entries`/`navigation`/`forms` deps that a pure dispatch unit
 * test would otherwise need to construct.
 */
export interface CoreResolverDeps {
  /** Widened by collections plan R1 with `EntryDisplayListPort` — the `recent-entries` widget's
   * "Collection list" mode shares `EntryDisplayListPort.listPublishedForDisplay` with the
   * `{"type":"collection"}` marker (C2). Both composition roots' real `entryRepo` already implements
   * it (`server/runtime/composition/{app,deps}.ts`'s `TrashAwareInMemoryEntryRepo`/`SqliteEntryRepo`). */
  entryList: EntryListPort & EntryDisplayListPort;
  navMenuReadModel: NavMenuReadModel;
  formDefinitionRepo: FormDefinitionRepoPort;
  /** R1 addition — resolves a `collection` config's target content type. See `recent-entries.ts`'s
   * `ContentTypeLookup` for why this is its own narrow port rather than `ContentTypeRepoPort`. */
  contentTypes: ContentTypeLookup;
}

export function createCoreResolvers(deps: CoreResolverDeps): Partial<Record<WidgetTypeKey, WidgetResolver>> {
  return {
    "recent-entries": createRecentEntriesResolver({ entryList: deps.entryList, contentTypes: deps.contentTypes }),
    menu: createMenuResolver({ navMenuReadModel: deps.navMenuReadModel }),
    "contact-form": createContactFormResolver({ formDefinitionRepo: deps.formDefinitionRepo }),
  };
}
