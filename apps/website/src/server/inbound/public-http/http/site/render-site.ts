import { renderSite as renderSiteWithPorts, type RenderSiteRequired as JiniRenderSiteRequired } from "@jini-ai/cms/public-http/http/site/render-site";
import type { StaticMenuMap } from "../../routes/site/pages/render-context/static-menus.js";
import { renderScriptAssets } from "@jini-ai/cookie-consent/render";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { resolveTemplateId, resolveLiquidTemplateId, resolveHandlebarsTemplateId } from "#src/features/theme/render-contract";
import { renderStaticPage } from "#src/features/theme/static-render";
import { injectSiteAssistantIntoStaticPage } from "./render/site-assistant-mount.js";
import { pageShell } from "./render/document-shell.js";
import { entryContent } from "./render/post-body.js";
import { entryList, productEntryContent, productEntryList } from "./render/components/entry-lists.js";
import { renderBlock } from "./render/blocks.js";

export type RenderSiteRequired = Omit<JiniRenderSiteRequired<StaticMenuMap[string]>,
  "theme" | "footerCredit" | "renderScriptAssets" | "resolveTemplateId" | "resolveLiquidTemplateId" | "resolveHandlebarsTemplateId" |
  "loadLiquidSandbox" | "loadHandlebarsSandbox" | "renderBlock" | "renderStaticPage" | "injectSiteAssistantIntoStaticPage" |
  "entryContent" | "entryList" | "productEntryContent" | "productEntryList" | "pageShell"
> & { theme: DiscoveredTheme | null };

export const renderSite = (required: RenderSiteRequired): Promise<string> => renderSiteWithPorts({
  ...required,
  footerCredit: "powered by Tovu",
  renderScriptAssets,
  resolveTemplateId,
  resolveLiquidTemplateId,
  resolveHandlebarsTemplateId,
  loadLiquidSandbox: () => import("./liquid-sandbox.js"),
  loadHandlebarsSandbox: () => import("./handlebars-sandbox.js"),
  renderBlock,
  renderStaticPage: input => renderStaticPage({ ...input, theme: required.theme! }),
  injectSiteAssistantIntoStaticPage,
  entryContent,
  entryList,
  productEntryContent,
  productEntryList,
  pageShell: input => pageShell({ ...input, theme: required.theme }),
});
