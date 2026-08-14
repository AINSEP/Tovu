import { CodeWithLines } from "@jini-ai/ui";
import { PreviewModalShell } from "@jini-ai/ui/renderers";

import type { ThemeTier } from "../../lib/api";
import { useWiredTemplateSource } from "./hooks/use-post-template-source.hooks";

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
  /** The selected template's filename (`theme.json`'s `templates` entry, e.g.
   *  `"blog-post.html"`) — never `""`/`null`; `PostEditor.tsx` only renders the button that opens
   *  this modal once a real template is chosen. */
  readonly templateFilename: string;
  readonly onClose: () => void;
  /** Injectable seam for the template-source fetch. Defaults to the real
   *  {@link useWiredTemplateSource}; a test can pass a fake here to exercise the modal's rendering
   *  without a real `fetch`. */
  readonly useTemplateSourceHook?: typeof useWiredTemplateSource;
}

export function PostTemplateModal({
  themeId,
  themeTier,
  templateFilename,
  onClose,
  useTemplateSourceHook = useWiredTemplateSource,
}: PostTemplateModalProps) {
  const fetchState = useTemplateSourceHook(themeId, themeTier, templateFilename);

  let stageContent;
  if (themeTier === null) {
    stageContent = (
      <p role="status">
        Could not determine the active theme&apos;s (&quot;{themeId}&quot;) capability tier, so this
        cannot tell whether it has a plain-HTML template to show.
      </p>
    );
  } else if (themeTier !== "static") {
    // Honest no-op rather than a request that can only 404 (see file header) — named for what IS
    // true (this theme's tier) rather than implying the template itself is missing.
    stageContent = (
      <p role="status">
        The active theme (&quot;{themeId}&quot;) is a {themeTier} theme — its page templates are not
        plain HTML files under this admin, so there is nothing to show here.
      </p>
    );
  } else if (fetchState.status === "loading") {
    stageContent = <p role="status">Loading template…</p>;
  } else if (fetchState.status === "error") {
    stageContent = (
      <p role="alert">
        Could not load &quot;{templateFilename}&quot; from the &quot;{themeId}&quot; theme: {fetchState.message}
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
    />
  );
}
