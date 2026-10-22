import type { PresentationSettingsRepoPort } from "../presentation/index.js";
import { resolveActiveThemeId } from "../presentation/index.js";
import { applicableThemeTemplates, NO_THEME_ID, resolveActiveTheme, type DiscoveredTheme } from "../theme/index.js";
import type { PublicPostKind } from "./post.js";

/** Host theme dependencies; production supplies both, older tool fixtures may omit them. */
export interface PostTemplateDeps {
  workspaceId: string;
  presentationRepo?: PresentationSettingsRepoPort;
  themes?: DiscoveredTheme[];
}

/**
 * Lists the templates the rendered active theme offers for this content kind, using the same
 * applicability rule as the admin picker. An absent theme supplies no choices.
 * @param required - Host presentation/theme ports and the stored post/page kind.
 * @param _options - Reserved options; defaults to an empty object.
 * @returns Applicable template filenames in manifest order, or an empty list without a theme.
 * @throws Repository errors other than the existing missing-settings fallback.
 * @complexity One presentation read, then O(t + p) for t themes and p declared templates.
 * @example await readPostTemplateOptions({ deps, kind: "page" });
 */
export async function readPostTemplateOptions(
  { deps, kind }: { deps: PostTemplateDeps; kind: PublicPostKind },
  _options: Record<string, never> = {},
): Promise<string[]> {
  if (!deps.presentationRepo || !deps.themes) return [];
  const activeId = await resolveActiveThemeId({ workspaceId: deps.workspaceId, presentationRepo: deps.presentationRepo });
  const theme = resolveActiveTheme({ themes: deps.themes }, activeId);
  return applicableThemeTemplates({ manifest: theme && theme !== NO_THEME_ID ? theme.manifest : undefined, kind });
}
