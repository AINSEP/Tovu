import { findEditorBlockOpening, isEditorSourceError } from "@jini-ai/ui/html-editor";
import { normalizeEmbedMarkerQuoting } from "@jini-ai/cms/widgets/markers";
import { useEditorHtmlJump } from "@jini-ai/admin/pages/hooks/use-editor-html-jump.hooks";
import { useInteractiveEditorFlush } from "@jini-ai/admin/pages/hooks/use-interactive-flush.hooks";
import { adminLogger } from "../../../lib/shell-collaborators";

/**
 * @file Binds this app's editor, CMS and logger into `@jini-ai/admin`'s page-editor hooks, which
 * take them as required fields because the package has no runtime dependency on `@jini-ai/ui` or
 * `@jini-ai/cms`. `usePageEditor` calls these instead of the package hooks directly.
 */

/** `useInteractiveEditorFlush` with this app's source-error check, marker normalizer and logger. */
export function useWiredInteractiveEditorFlush({ setHtml }: { setHtml: (value: string) => void }, _options = {}) {
  return useInteractiveEditorFlush({ setHtml, isEditorSourceError, normalizeEmbedMarkerQuoting, logger: adminLogger });
}

type HtmlJumpArgs = Parameters<typeof useEditorHtmlJump>;

/** `useEditorHtmlJump` with this app's editor's `findEditorBlockOpening`. */
export function useWiredEditorHtmlJump(required: Omit<HtmlJumpArgs[0], "findEditorBlockOpening">, optional: HtmlJumpArgs[1]) {
  return useEditorHtmlJump({ ...required, findEditorBlockOpening }, optional);
}
