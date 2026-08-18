import type { EntryListPort } from "../../features/entries";
import type { FormDefinitionRepoPort } from "../../forms";
import type { NavMenuReadModel } from "../../navigation";
import type { WidgetResolver, WidgetTypeKey } from "../types";
import { createContactFormResolver } from "./contact-form";
import { createMenuResolver } from "./menu";
import { createRecentEntriesResolver } from "./recent-entries";

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
  entryList: EntryListPort;
  navMenuReadModel: NavMenuReadModel;
  formDefinitionRepo: FormDefinitionRepoPort;
}

export function createCoreResolvers(deps: CoreResolverDeps): Partial<Record<WidgetTypeKey, WidgetResolver>> {
  return {
    "recent-entries": createRecentEntriesResolver({ entryList: deps.entryList }),
    menu: createMenuResolver({ navMenuReadModel: deps.navMenuReadModel }),
    "contact-form": createContactFormResolver({ formDefinitionRepo: deps.formDefinitionRepo }),
  };
}
