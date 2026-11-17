import { TemplateSourceModal } from "../../../../components/TemplateSource/TemplateSourceModal";
import type { ThemeTier } from "@/features/themes/api/themes-api.types";
import { type Translate } from "@jini-ai/core/text";

/**
 * The "View Template" modal's mount gate — pulled out of `PostEditor` (complexity-ceiling pass,
 * 2026-08-20) as its own top-level function so the three-condition `&&` chain scores in its own
 * scope. Conditionally mounted, not always-mounted-with-`open`: `PreviewModalShell` (the shell
 * `TemplateSourceModal` renders through) is a plain fixed-position overlay `<div>`, not the native
 * `<dialog>` `ConfirmDialog` wraps — there is no `open` prop to toggle, so this follows
 * `AgentPluginDetailsModal`'s own call site (`AgentPlugins.tsx`) instead. `templateChoice` and
 * `activeThemeId` are re-checked here (not just at the "View Template" button's `disabled`) so this
 * can never render with an empty/`null` URL segment even if state changes out from under an
 * already-open modal.
 */
export function PostEditorTemplateModalGate({
  show,
  templateChoice,
  activeThemeId,
  activeThemeTier,
  activeThemeApiVersion,
  onClose,
  confirmLeave,
  t,
}: {
  show: boolean;
  templateChoice: string | null;
  activeThemeId: string | null;
  activeThemeTier: ThemeTier | null;
  activeThemeApiVersion: 2 | undefined;
  onClose: () => void;
  confirmLeave: () => boolean;
  t: Translate;
}) {
  if (!show || !templateChoice || !activeThemeId) return null;
  return (
    <TemplateSourceModal
      themeId={activeThemeId}
      themeTier={activeThemeTier}
      themeApiVersion={activeThemeApiVersion}
      templateFilename={templateChoice}
      onClose={onClose}
      confirmLeave={confirmLeave}
      t={t}
      editAgentHandleId="post-template-edit"
    />
  );
}
