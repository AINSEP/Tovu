import { agentHandle } from "@jini-ai/core/agent-handles";
import { PAGE_EXTERNAL_CHANGE_MESSAGE } from "@jini-ai/admin/pages/page-editor-rules";

export const pageExternalChangeBindings = {
  agentHandle,
  copy: {
    messageKey: PAGE_EXTERNAL_CHANGE_MESSAGE,
    regionAgentLabel: "This page was changed outside the editor, probably by the assistant — load the latest version or keep your unsaved edits",
    loadLatestAgentLabel: "Load latest version, discarding my unsaved edits",
    keepEditsAgentLabel: "Keep my edits and ignore the outside change",
  },
};
