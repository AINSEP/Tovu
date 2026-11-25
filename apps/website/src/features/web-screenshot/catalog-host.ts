import { createWebScreenshotCatalog } from "@jini-ai/diagnostics/web-evidence/web-screenshot/agent-tools";
import { DEFAULT_WAIT_MS, MAX_FULL_PAGE_HEIGHT_PX, MAX_URL_LENGTH, MAX_WAIT_MS, VIEWPORT_NAMES } from "@jini-ai/integrations/web-screenshot/web-screenshot";

/** Same gate as `web_fetch_page`: any admin who may use the assistant may look at public pages through it. */
export const WEB_SCREENSHOT_PERMISSION = "admin.assistant.use";

export const webScreenshotAgentToolCatalog = createWebScreenshotCatalog({
  limits: { maxUrlLength: MAX_URL_LENGTH, maxFullPageHeightPx: MAX_FULL_PAGE_HEIGHT_PX, maxWaitMs: MAX_WAIT_MS, defaultWaitMs: DEFAULT_WAIT_MS, viewportNames: VIEWPORT_NAMES },
  permission: WEB_SCREENSHOT_PERMISSION,
  sitePathDescription: "A page of THIS Tovu site, root-relative, e.g. '/' or '/about' — rendered from the site's current content and its active theme (or themeId). Pass this or url, not both.",
  themeIdDescription: "sitePath only: render the page through this INSTALLED theme instead of the active one, WITHOUT activating it (visitors keep seeing the active theme). Use it to check a theme copy you are editing, e.g. 'luvira-copy'.",
});
