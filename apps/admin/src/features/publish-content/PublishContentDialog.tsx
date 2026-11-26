import { bindPublishContentDialog } from "@jini-ai/cms/react/publish-content/PublishContentDialog";
import { Dialog } from "@jini-ai/ui-kit/react";
import "../../styles/native-domain-dialogs.css";
import { usePublishContentConfirm } from "./hooks/use-publish-content-confirm.hooks";

export const PublishContentDialog = bindPublishContentDialog({
  kit: { Dialog },
  hooks: { usePublishContentConfirmHook: usePublishContentConfirm },
  deps: { formRecipientNotice: "Form notification recipients stay local on each site; copying a form does not copy them." },
});
