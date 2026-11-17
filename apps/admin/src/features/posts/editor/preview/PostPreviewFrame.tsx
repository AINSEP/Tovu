import { PAGE_PREVIEW_IFRAME_SANDBOX } from "../../../pages/rules";
import { useThemePreviewFrame } from "../../../themes/hooks/use-theme-preview-refresh.hooks";
import { usePostPreviewIframeEscape } from "../../hooks/use-post-editor-ui.hooks";
import { type Translate } from "@jini-ai/core/text";

/**
 * The three-way surface choice from `PostPreview`'s own doc comment (live site / template preview /
 * pending-content preview), as a top-level function so its branching scores independently of
 * `PostPreview`'s own complexity — same pattern `features/pages/PageEditor.tsx`'s `PagePreviewFrame`
 * uses for its own equivalent. Only `canShowLiveSite`/`canShowTemplatePreview` are named booleans;
 * the pending-content case is this function's own unconditional final `return`, needing no name of
 * its own — the exact same "its negation needs no name" collapse `PagePreviewFrame` already applies
 * to its own two-branch equivalent (see `PagePreview`'s own doc for that precedent), one branch later
 * here since Posts keep the GET/POST split Pages collapsed into one.
 */
export function PostPreviewFrame({
  canShowLiveSite,
  canShowTemplatePreview,
  bodyJson,
  slug,
  templatePreviewUrl,
  previewFormRef,
  previewFormTarget,
  expanded,
  onCollapse,
  t,
}: {
  canShowLiveSite: boolean;
  canShowTemplatePreview: boolean;
  /** See `PostPreview`'s own `bodyJson` prop doc — only ever `JSON.stringify`'d into the hidden
   *  form field below. */
  bodyJson: unknown;
  slug: string;
  /** Pre-built by `usePostEditor` — see `PostPreview`'s own doc, branch 2. */
  templatePreviewUrl: string;
  previewFormRef: (node: HTMLFormElement | null) => void;
  previewFormTarget: string;
  expanded: boolean;
  onCollapse: () => void;
  t: Translate;
}) {
  const iframeRef = usePostPreviewIframeEscape({ expanded: expanded, onCollapse: onCollapse });
  const fresh = useThemePreviewFrame({
    // Reuse the authenticated route's consent exclusion; keep the sandbox opaque.
    liveUrl: templatePreviewUrl,
    templateUrl: templatePreviewUrl,
    canShowLiveSite,
  }, { navigation: "entry" });
  if (fresh.canShowLiveSite) {
    return (
      <iframe
        ref={iframeRef}
        key={`${fresh.liveUrl}-${slug}`}
        src={fresh.liveUrl}
        title={t("Post preview")}
        className="page-preview-iframe"
        sandbox={PAGE_PREVIEW_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
      />
    );
  }
  if (canShowTemplatePreview) {
    return (
      <iframe
        ref={iframeRef}
        key={fresh.templateUrl}
        src={fresh.templateUrl}
        title={t("Post preview")}
        className="page-preview-iframe"
        sandbox={PAGE_PREVIEW_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <>
      {/* `hidden`, not left out of the DOM — a hidden form still submits fine, and this keeps it
          out of layout without relying on CSS. Posts to the SAME endpoint the branch above's iframe
          `src` points `GET` at; `templateChoice` rides the query string exactly as it does there, so
          a pending template choice AND pending content are both honored by one submit. */}
      <form key={`form-${fresh.templateUrl}`} ref={previewFormRef} method="post" target={previewFormTarget} action={fresh.templateUrl} hidden>
        <input type="hidden" name="bodyJson" value={JSON.stringify(bodyJson)} />
      </form>
      <iframe
        ref={iframeRef}
        key={fresh.templateUrl}
        name={previewFormTarget}
        title={t("Post preview")}
        className="page-preview-iframe"
        sandbox={PAGE_PREVIEW_IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
      />
    </>
  );
}
