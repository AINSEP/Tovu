import { agentHandle } from "@jini-ai/agentic";
import { CodeWithLines } from "@jini-ai/ui";
import { PreviewModalShell } from "@jini-ai/ui/renderers";

import type { ThemeTier } from "../../lib/api";
import type { Translate } from "../../lib/dictionary-translator";
import { navigate } from "../../lib/router";
import { templateEditUrl, useWiredTemplateSource } from "./hooks/use-post-template-source.hooks";

/**
 * @file "View Template" (2026-08-10) — read-only inspection of the theme page a post's
 * `templateChoice` renders through on the public site. The owner's own framing: "I just wanna
 * see it" — there is no edit path here, on purpose, and none is added by this file.
 *
 * Reuses the same two Jini-exported building blocks `AgentPluginDetailsModal.tsx` already
 * established for "read-only source in a modal" earlier the same day: `PreviewModalShell` for the
 * accessible dialog/close/Escape chrome, `CodeWithLines` for the line-numbered pane. `CodeWithLines`
 * renders its `text` prop as ordinary JSX children (`{text}`), never `dangerouslySetInnerHTML` — a
 * theme's `pages/*.html` is shown as literal characters, not parsed/executed markup, so React's own
 * default text-node escaping is what keeps this safe to render untrusted-ish theme source.
 *
 * Only a `"static"`-tier theme has anything to fetch: `theme-static-assets.ts` mounts
 * `express.static` for exactly the discovered static-tier theme directories and nothing else (its
 * own file header), so a `"declarative"`/`"templated"`/`"handlebars"`/`"code"` theme has no
 * `/theme-assets/{id}/pages/*.html` route to hit at all — this component checks `themeTier` BEFORE
 * fetching and says so, rather than firing a request that can only ever 404.
 *
 * The fetch itself — real I/O, a raw `fetch()` outside `lib/api` entirely — lives behind
 * `hooks/use-post-template-source.hooks.ts`'s `PostTemplatePort`, split out the same way
 * `SeeMore`/`SeeMore.hooks.tsx` does: this file stays props-and-JSX only, and the
 * `useTemplateSourceHook` prop below lets a test render this JSX against a fake port without a
 * real network round trip.
 *
 * "Edit" header button (owner ask, 2026-09-22): convenience-only navigation to the Theme Explore
 * screen with this same file preselected — the read-only viewer above is unchanged, this never
 * edits anything itself. The target URL is built by `templateEditUrl` (co-located with
 * `templateAssetUrl` in `use-post-template-source.hooks.ts`, same `pagesDir` resolution), rendered
 * into `PreviewModalShell`'s `headerExtras` slot so it lands left of the shell's own Close button
 * with no new chrome to build. Routed through this app's `navigate()` (not a plain `<a href>`) so
 * leaving the editor for Explore is a real SPA navigation, and gated by the same `confirmLeave`
 * `PostEditorHeader`'s back link already uses — an unsaved edit should not silently vanish just
 * because the operator left through this button instead of that one.
 */

export interface PostTemplateModalProps {
  /** The workspace's active theme id — used to build the fetch URL, not for display logic beyond
   *  that (the subtitle below names it for the operator's benefit). */
  readonly themeId: string;
  /** The active theme's capability tier — gates whether a fetch is attempted at all. `null` means
   *  the tier itself could not be determined (the active theme id was absent from
   *  `getPresentation()`'s `availableThemes` — see `use-post-editor.hooks.ts`'s own doc on
   *  `activeThemeTier`), which this treats as its own honest case rather than guessing a specific
   *  tier that might be wrong. */
  readonly themeTier: ThemeTier | null;
  /** The active theme's manifest `apiVersion` (`2`, or `undefined` for v1) — see
   *  `use-post-template-source.hooks.ts`'s `useTemplateSource` for why the fetch URL needs it
   *  (`render/pages/` vs `pages/`, 2026-08-19 architecture audit finding 1). */
  readonly themeApiVersion: 2 | undefined;
  /** The selected template's filename (`theme.json`'s `templates` entry, e.g.
   *  `"blog-post.html"`) — never `""`/`null`; `PostEditor.tsx` only renders the button that opens
   *  this modal once a real template is chosen. */
  readonly templateFilename: string;
  readonly onClose: () => void;
  /** `false` when the operator declined to discard unsaved edits — the Edit button's navigation is
   *  skipped in that case, matching `PostEditorHeader`'s own back-link guard (see
   *  `use-post-editor.hooks.ts`'s `confirmLeave` doc). */
  readonly confirmLeave: () => boolean;
  readonly t: Translate;
  /** Injectable seam for the template-source fetch. Defaults to the real
   *  {@link useWiredTemplateSource}; a test can pass a fake here to exercise the modal's rendering
   *  without a real `fetch`. */
  readonly useTemplateSourceHook?: typeof useWiredTemplateSource;
}

export function PostTemplateModal({
  themeId,
  themeTier,
  themeApiVersion,
  templateFilename,
  onClose,
  confirmLeave,
  t,
  useTemplateSourceHook = useWiredTemplateSource,
}: PostTemplateModalProps) {
  const fetchState = useTemplateSourceHook(themeId, themeTier, themeApiVersion, templateFilename);

  // Closing before navigating (not after — `navigate()` doesn't return a completion signal to
  // sequence on) so this modal's own state never lingers mounted-but-stale under whatever screen
  // Theme Explore renders next.
  function goToTemplateInEditor() {
    if (!confirmLeave()) return;
    onClose();
    navigate(templateEditUrl(themeId, templateFilename, themeApiVersion));
  }

  let stageContent;
  if (themeTier === null) {
    stageContent = (
      <p role="status">
        {translateTemplate(t, "Could not determine the active theme's (\"{themeId}\") capability tier, so this cannot tell whether it has a plain-HTML template to show.", { themeId })}
      </p>
    );
  } else if (themeTier !== "static") {
    // Honest no-op rather than a request that can only 404 (see file header) — named for what IS
    // true (this theme's tier) rather than implying the template itself is missing.
    stageContent = (
      <p role="status">
        {translateTemplate(t, "The active theme (\"{themeId}\") is a {themeTier} theme — its page templates are not plain HTML files under this admin, so there is nothing to show here.", { themeId, themeTier })}
      </p>
    );
  } else if (fetchState.status === "loading") {
    stageContent = <p role="status">{t("Loading template…")}</p>;
  } else if (fetchState.status === "error") {
    stageContent = (
      <p role="alert">
        {translateTemplate(t, "Could not load \"{templateFilename}\" from the \"{themeId}\" theme: {message}", { templateFilename, themeId, message: fetchState.message })}
      </p>
    );
  } else {
    stageContent = <CodeWithLines text={fetchState.html} />;
  }

  return (
    <PreviewModalShell
      className="post-template-modal"
      title={templateFilename}
      subtitle={`Read-only — from the "${themeId}" theme. Not editable here.`}
      views={[{ id: "template-source", label: "Template source", custom: stageContent }]}
      onClose={onClose}
      headerExtras={
        <button
          type="button"
          onClick={goToTemplateInEditor}
          title={t("Edit")}
          {...agentHandle("post-template-edit", {
            role: "button",
            label: `Open "${templateFilename}" in the theme editor`,
          })}
        >
          {t("Edit")}
        </button>
      }
    />
  );
}

function translateTemplate(t: Translate, key: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), t(key));
}
