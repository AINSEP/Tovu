import { FORMS_TABLES } from '#src/platform/db/content-tables';
import { createFormDefinition, updateFormDefinition, setFormDefinitionStatus } from '#src/features/forms/index';
import { executeCommand } from '@jini-ai/cms/core/commands';
import { registerContentType } from '#src/features/content-types/write-service';
import { WIDGET_REGION_BINDINGS_TABLE } from "@tovu/contracts/widget-tables";
import { buildWidgetHostPorts, READ_ONLY_WIDGET_POST_WRITES } from "#src/features/widgets/deps";
import { findWidgetTypeRegistration } from "@jini-ai/cms/widgets";
import type { TovuPublishPorts } from "#src/features/publish-content/tovu-publish-ports";
import { contributeContentTypePublish } from "@jini-ai/cms/content-types/site/publish-content";
import { contributeCollectionEntryPublish } from "#src/features/entries/publish-content";
import { contributeFormPublish } from "@jini-ai/cms/forms/site/publish-content";
import { contributeMediaPublish } from "#src/features/media/publish-content";
import { contributeMenusPublish } from "@jini-ai/cms/navigation/site/publish-content";
import { contributePagePublish, contributePostPublish } from "@jini-ai/cms/posts/publish-content";
import { registerPublishContentContributor } from "#src/features/publish-content/type-registry";
import { contributeRawRowPublish } from "#src/features/publish-content/raw-row-contributor";
import { contributeRawFilePublish } from "#src/features/publish-content/raw-file-contributor";
import { contributeTaxonomyPublish, contributeTermPublish } from "@jini-ai/cms/taxonomy/site/publish-content";
import { contributeRedirectPublish } from "@jini-ai/cms/redirects/site/publish-content";
import { createRepoPublishHandler, gatewayDeps } from "@jini-ai/cms/publish/content/repo-handler";
import { REDIRECT_TABLES } from "@tovu/contracts/redirect-tables";
import { contributeSiteSettingPublish } from "@jini-ai/cms/settings/site/publish-content";
import { PUBLISHABLE_SETTINGS } from "#src/contracts/core/settings-vocabulary";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import { SETTINGS_WRITE_POLICIES } from "#src/features/settings/settings-write-policies";
import { contributeActiveThemePublish } from "#src/features/theme/active-theme-publish-content";
import { contributeThemeFilesPublish } from "#src/features/theme/publish-content";
import { contributeWidgetAreaPublish, contributeWidgetPublish } from "@jini-ai/cms/widgets/site/publish-content";

const widgetPublishPolicy = {
  bindingTable: WIDGET_REGION_BINDINGS_TABLE,
  buildWidgetHostPorts: () => buildWidgetHostPorts({ postWrites: READ_ONLY_WIDGET_POST_WRITES }, {}),
  findWidgetTypeRegistration, configReferences: { formDefinitionId: "form", menuRef: "menu", categoryTermId: "term" },
  formReference: { field: "formDefinitionId", widgetType: "contact-form" },
};


/**
 * @file Task 2 of the publish-content (Publish Content) feature — the composition-root wiring
 * point plan §3 rule 1 calls for: "`server/runtime/composition/tool-catalog-manifest.ts`'s
 * `installFirstPartyToolContributors` (or a **sibling** `installFirstPartyPublishContentTypes`)".
 *
 * A sibling, NEW file — deliberately not folded into `tool-catalog-manifest.ts` itself. That file
 * wires the AI-assistant's tool CATALOG (`ToolContributor`s); this registers content TYPES for the
 * Publish Content HTTP feature, a different registry with a different consumer (Task 4's export
 * route and Task 5's planner, not `buildAssistantToolRegistrations`). Keeping the two `install*`
 * functions in separate files means a future Task 3/4 PR that starts calling this one does not have
 * to touch — or risk a merge conflict in — `tool-catalog-manifest.ts`'s own ~35-domain call list.
 *
 * Called from TWO boot paths (2026-09-23): `modules/publish-content.ts` inside `createApp()`, and
 * `tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, which is how the agent daemon
 * (a separate process that never runs `createApp()`) gets the types its publish tools read. The
 * history below explains the original, since-superseded "not yet called" state.
 *
 * Originally NOT YET CALLED from a real boot path. Nothing in the tree yet consumed
 * `listPublishContentContributors()` (Task 4's export route is the first real reader), so calling
 * this from `agent-daemon-server.ts`/`assistant-byok.ts` today would register two contributors that
 * are never read by anything and add a shared-file edit with no test coverage to justify it. Task 4's
 * own composition module (`server/runtime/composition/modules/publish-content.ts`, not yet built)
 * is the natural place to call `installFirstPartyPublishContentTypes()` once there is a real consumer —
 * see `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §1.1/§4 task 4.
 *
 * `media` joined `post`/`page` here only once `features/media/publish-content.ts`'s `apply()` was a
 * real write path rather than Task 12's deliberate throwing stub. Registering a type whose `apply()`
 * throws would have turned a correct refusal into a live bug — a bundle carrying media would have
 * planned cleanly and then aborted the whole run mid-apply. The registration and the working
 * `apply()` therefore land in the same commit, never separately; `__tests__/publish-content-manifest
 * .test.ts` pins both halves (the registry list AND an entity actually applying through the
 * registered contributor), so the pair cannot silently come apart again. `theme-files` followed the
 * same rule (S-F4): registered only once its stage/verify/swap `apply()` was real AND the apply bag
 * (`apply-loop.ts`'s `PublishContentApplyDeps`) required `themesDir`.
 */
const SEEDED_KEYS = new Set(["widget", "widget_area"]);

/** Refuses a seeded key inbound too: `widget`/`widget-area` own those schemas, and a grant limited to
 *  `content-type` must not reach them. */
const seededKeyRefusal = ({ key }: { key: string }, _optional = {}): string | null =>
  SEEDED_KEYS.has(key) ? `content-type '${key}' is seeded on every instance and is never published` : null;

export function installFirstPartyPublishContentTypes(): void {
  registerPublishContentContributor({ contributor: contributePostPublish() });
  registerPublishContentContributor({ contributor: contributePagePublish() });
  registerPublishContentContributor({ contributor: contributeMediaPublish() });
  registerPublishContentContributor({ contributor: contributeRedirectPublish({ createRepoPublishHandler, redirectsTable: REDIRECT_TABLES.redirects }) });
  registerPublishContentContributor({ contributor: contributeMenusPublish() });
  registerPublishContentContributor({ contributor: contributeThemeFilesPublish() });
  registerPublishContentContributor({ contributor: contributeFormPublish({ tableKey: FORMS_TABLES.definitions, permission: 'admin.forms.manage', executeCommand, createFormDefinition, updateFormDefinition, setFormDefinitionStatus }) });
  registerPublishContentContributor({ contributor: contributeContentTypePublish({ seededKeys: SEEDED_KEYS, seededKeyRefusal,
    permission: 'admin.collections.manage', registerContentType }) });
  registerPublishContentContributor({ contributor: contributeTaxonomyPublish() });
  registerPublishContentContributor({ contributor: contributeTermPublish() });
  registerPublishContentContributor({ contributor: contributeCollectionEntryPublish() });
  registerPublishContentContributor({ contributor: contributeWidgetPublish(widgetPublishPolicy) });
  registerPublishContentContributor({ contributor: contributeWidgetAreaPublish(widgetPublishPolicy) });
  registerPublishContentContributor({ contributor: contributeSiteSettingPublish({ createRepoPublishHandler, gatewayDeps: gatewayDeps<TovuPublishPorts>, publishableSettings: PUBLISHABLE_SETTINGS, writePolicies: SETTINGS_WRITE_POLICIES, principalLookup: createSettingsPrincipalLookup }) });
  registerPublishContentContributor({ contributor: contributeActiveThemePublish() });
  registerPublishContentContributor({ contributor: contributeRawRowPublish() });
  registerPublishContentContributor({ contributor: contributeRawFilePublish() });
}
