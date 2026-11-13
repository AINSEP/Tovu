import { navigate } from "@/lib/router";
import { templateEditUrl } from "./use-template-source.hooks";

export function createGoToTemplateInEditor({ themeId, templateFilename, confirmLeave, onClose }: {
  themeId: string; templateFilename: string; confirmLeave: () => boolean; onClose: () => void;
}, _options = {}) {
  // Closing before navigating (not after — `navigate()` doesn't return a completion signal to
  // sequence on) so this modal's own state never lingers mounted-but-stale under whatever screen
  // Theme Explore renders next.
  function goToTemplateInEditor() {
    if (!confirmLeave()) return;
    onClose();
    navigate(templateEditUrl(themeId, templateFilename));
  }

  return goToTemplateInEditor;
}
