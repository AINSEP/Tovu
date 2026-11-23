import { InMemoryWidgetRegionBindingRepo } from "@jini-ai/cms/widgets";
import { InMemoryEntryRefsRepo } from "@jini-ai/cms/widgets";
import { TrashAwareInMemoryMenuRepo } from "@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo";
import { InMemoryNavLocationBindingRepo } from "#src/features/navigation/index";
import { InMemoryFormDefinitionRepo } from "@jini-ai/cms/forms";
import { InMemoryContentTypeRepo, NoopContentTypeIndexProvisioner } from "#src/features/content-types/index";

export function composeNavFormContentRepos(_required: Record<string, never> = {}, _optional = {}) {
  // SPEC-043/ADR-047 (widgets) — hoisted alongside `entryRepo` for the same reason: both the admin
  // `widgets` routes and the public site-render path (`routes/site/pages.ts` → `resolvePageWidgets`,
  // W-004) must see the SAME binding/ref-index state, not two independent in-memory instances.
  const widgetBindingRepo = new InMemoryWidgetRegionBindingRepo();
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const menuRepo = new TrashAwareInMemoryMenuRepo();
  const navLocationBindingRepo = new InMemoryNavLocationBindingRepo({});
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  // Collections plan R1 — hoisted above `wireCoreResolvers` (was constructed later, inline, only for
  // the Admin-UI backend-gap deps object below) so the `recent-entries` widget's "Collection list"
  // mode and the rest of the app (content-type CRUD routes, etc.) share the SAME store — a second
  // `new InMemoryContentTypeRepo()` here would be an empty, disconnected double nothing ever
  // registers a content type into, silently breaking every collection-configured widget.
  const contentTypeRepo = new InMemoryContentTypeRepo();
  const contentTypeIndexProvisioner = new NoopContentTypeIndexProvisioner();
  return { menuRepo, navLocationBindingRepo, formDefinitionRepo, contentTypeRepo, contentTypeIndexProvisioner, entryRefsRepo, widgetBindingRepo };
}
