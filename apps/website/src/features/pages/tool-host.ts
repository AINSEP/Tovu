import type { AuthorizeFn, ChangeSetRepoPort, ExecuteCommandFn, OutboxPort } from "@jini-ai/core/contracts/events";
import type { Clock, IdGenerator } from "@jini-ai/core/primitives";
import type { PostRepoPort } from "@jini-ai/cms/posts/post";
import type { PagesHtmlDocumentStoreFactory, RecordedHtmlWrites, RecordPageHtmlWritePort } from "@jini-ai/core/contracts/site/page-html-store";
import { createPagesAgentToolCatalog } from "@jini-ai/cms/pages/agent-tools";
import { PAGES_EDIT_HTML_PERMISSION } from "./permissions.js";
import { ASSISTANT_CONTENT_EDIT_GUIDANCE } from "@tovu/contracts/assistant-content-guidance";
import { PAGE_HTML_CONTRACT } from "../../contracts/core/page-html.js";
import { recordAssistantPageHtmlWrite } from "@jini-ai/cms/pages/html-change-recording";
import type { PageHtmlOperation } from "@jini-ai/core/contracts/site/page-html-store";
import { NO_THEME_ID } from "#src/contracts/core/theme-ids";
import { resolveActiveTheme, themeRosterPorts, type DiscoveredTheme } from "../theme/index.js";
import { syncThemeRoster } from "@jini-ai/cms/themes/preview/roster";
import { scanHtmlRegions } from "@jini-ai/vibecoding/html/node";
import { handlesMadeAmbiguous, locateRegion, moveRegion, regionHandlesIn, replaceRegionInner, untaggedTopLevelSections } from "@jini-ai/vibecoding/html";

export interface PagesToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  pagesHtmlStore: PagesHtmlDocumentStoreFactory;
  postRepo: PostRepoPort;
  /** The host's render-time theme inputs; absent only in standalone page-store consumers. */
  themes?: DiscoveredTheme[];
  themesDir?: string;
  resolveActiveThemeId?: () => Promise<string>;
  /** Renders a doc body as Page HTML. Absent only in standalone page-store consumers. */
  docBodyAsPageHtml?: (required: { bodyJson: unknown }, optional?: Record<string, never>) => string;
  /** The command gateway every real assistant HTML change is recorded through (one scoped change set each). */
  executeCommand: ExecuteCommandFn;
  clock: Clock;
  idGen: IdGenerator;
  changeSets: ChangeSetRepoPort;
  outbox?: OutboxPort;
  /** FIX 11: whether this composition has one rollback boundary over an HTML write and its record. */
  recordedHtmlWrites: RecordedHtmlWrites;
}

/**
 * Give page authors the vocabulary the public renderer actually uses, including fallback themes.
 * No token names are invented for an unstyled site or a standalone page-store consumer.
 * @param required.deps The host's current theme roster and active-theme resolver.
 * @returns The resolved theme's default tokens and light overrides, or null without a theme.
 * @throws Propagates host settings/discovery failures rather than advertising stale token names.
 * @complexity O(t) in installed themes, plus the existing roster sync when disk state changed.
 */
async function readPageTheme(
  { deps }: { deps: PagesToolDeps },
  _options: Record<string, never> = {},
) {
  if (!deps.themes || !deps.resolveActiveThemeId) return null;
  if (deps.themesDir) syncThemeRoster({ ...themeRosterPorts, themes: deps.themes, themesDir: deps.themesDir });
  const theme = resolveActiveTheme({ deps: { themes: deps.themes }, activeThemeId: await deps.resolveActiveThemeId() });
  if (theme === null || theme === NO_THEME_ID) return null;
  return { id: theme.manifest.id, tokens: theme.tokens, tokensLight: theme.tokensLight };
}

export const pagesAgentToolCatalog = createPagesAgentToolCatalog({ editHtmlPermission: PAGES_EDIT_HTML_PERMISSION, authoringContract: PAGE_HTML_CONTRACT, editGuidance: ASSISTANT_CONTENT_EDIT_GUIDANCE });

/** Short, HTML-free summaries: change-set summaries are listed to the model and to History. */
const SUMMARY: Readonly<Record<PageHtmlOperation, string>> = {
  pages_write_html: "Assistant rewrote a page's HTML",
  pages_write_region: "Assistant edited a page section",
  pages_move_region: "Assistant moved a page section",
};


export function bindPagesToolHost(_required: Record<string, never> = {}, _optional: Record<string, never> = {}) {
  return {
    catalog: pagesAgentToolCatalog,
    editHtmlPermission: PAGES_EDIT_HTML_PERMISSION,
    regions: { scanHtmlRegions, handlesMadeAmbiguous, locateRegion, moveRegion, regionHandlesIn, replaceRegionInner, untaggedTopLevelSections },
    readTheme: readPageTheme,
    recordWrite: ({ deps }: { deps: PagesToolDeps }): RecordPageHtmlWritePort => (required, optional) => recordAssistantPageHtmlWrite({ deps: { ...deps, editPermission: PAGES_EDIT_HTML_PERMISSION, summary: SUMMARY }, ...required }, optional),
  };
}
