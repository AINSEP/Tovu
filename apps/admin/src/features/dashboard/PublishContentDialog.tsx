import { agentHandle } from "@jini-ai/agentic";

import type { Translate } from "../../lib/dictionary-translator";
import { usePublishContentConfirm } from "./hooks/use-publish-content-confirm.hooks";

/**
 * @file The "Publish Content" confirm dialog opened from the Dashboard's new header button.
 *
 * Its job is educational, not just a yes/no gate: the owner's stated worry is operators deploying
 * the site, seeing no change, and not understanding that a deploy ships CODE while this dialog's
 * action ships CONTENT — two different things this app has never distinguished for anyone before.
 * The body copy says that explicitly rather than assuming it's obvious.
 *
 * TODO(publish): there is no publish API yet — `AGENT_PLUGIN_SET_ENABLED`-style backend route,
 * agent tool, none of it exists. Confirm is wired to nothing but is left VISIBLE and disabled
 * (rather than hidden, or the button omitted) so the owner can react to the copy and the flow
 * before any backend work starts. Wire `onConfirm` to the real call once that route exists, and
 * drop the `notice.warning` block below at the same time.
 *
 * Markup, classes (`settings-dialog`/`settings-dialog-backdrop`, `btn-secondary`/`btn-primary`),
 * and behaviour (Escape-to-cancel via the paired hook, Cancel default-focused) mirror
 * `features/plugins/AgentPluginDisableConfirmDialog.tsx` — the most recent precedent for this
 * shape of dialog in this app. Confirm is `.btn-primary` here, not `.btn-danger`: publishing isn't
 * destructive the way removing a plugin or an OAuth connection is, it's the app's one deliberate
 * primary action, so it gets the same burnt-orange fill `.btn-primary` already renders everywhere
 * else (see that class in `styles.css`) rather than borrowing the danger dialog's red. Cancel stays
 * the default-focused control anyway: publishing touches the live site and can skip content
 * without the operator noticing, so the interrupting action is still never the one Enter fires by
 * accident, matching every other confirm dialog's own reasoning even though this one isn't
 * destructive.
 */

export interface PublishContentDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
  /** The screen's own bound translator, threaded down rather than resolved again here — same
   *  convention `AgentPluginDisableConfirmDialog` uses for its own `t`. */
  t: Translate;
  /** Dependency injection seam for tests — see `PostsProps.usePostsHook` for the convention. */
  usePublishContentConfirmHook?: typeof usePublishContentConfirm;
}

export function PublishContentDialog({
  onConfirm,
  onCancel,
  t,
  usePublishContentConfirmHook = usePublishContentConfirm,
}: PublishContentDialogProps) {
  usePublishContentConfirmHook({ onCancel });
  const titleId = "dashboard-publish-content-confirm-title";

  return (
    <div className="settings-dialog-backdrop" onClick={onCancel}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{t("Publish Content")}</h2>
        <p>{t("This sends your posts, pages, and media to the live site.")}</p>
        <p>
          {t(
            "Deploying and publishing are different things. Deploy ships code. Publish ships content. Deploying doesn't update your content — that's why the site looked unchanged.",
          )}
        </p>
        <p>
          {t(
            "Anything edited directly on the live site is skipped, not overwritten. You'll see what got skipped afterward.",
          )}
        </p>
        <p className="notice warning" role="note">
          {t("Not available yet. Publishing isn't built — this button doesn't send anything.")}
        </p>
        <span className="editor-actions">
          {/* Cancel is the default-focused control — see this file's header for why, even though
              this dialog isn't destructive. */}
          <button
            type="button"
            className="btn-secondary"
            autoFocus
            onClick={onCancel}
            {...agentHandle("dashboard-publish-content-cancel", {
              role: "button",
              label: "Close this dialog without publishing",
            })}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled
            onClick={onConfirm}
            {...agentHandle("dashboard-publish-content-confirm", {
              role: "button",
              label: "Publish content to the live site — not available yet",
            })}
          >
            {t("Publish Content")}
          </button>
        </span>
      </div>
    </div>
  );
}
