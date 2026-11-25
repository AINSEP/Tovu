import { MediaPickerDialog as JiniMediaPickerDialog } from "@jini-ai/cms/react/media/MediaPickerDialog/MediaPickerDialog";
import { ErrorNotice } from "@jini-ai/ui/panel-kit";
import { useCachedLoader } from "@jini-ai/ui/fetch-query";
import { useJiniMediaPicker } from "@jini-ai/admin/shell/components/MediaPickerDialog/JiniMediaPicker.hooks";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { ApiError } from "../../lib/admin-http/request";
import { useHostMediaPicker } from "../../integrations/jini-admin/module-context";
import { defaultMediaPickerPort, useWiredMediaPickerDialog } from "./media-picker-dependencies.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { t as sharedComponentsT } from "@jini-ai/admin/shell/components/shared-components-i18n";
import { acceptsMedia } from "@jini-ai/admin/media";
import { Dialog } from "@jini-ai/ui-kit/react";
import type { AdminMedia } from "@jini-ai/core/contracts/site/cms-admin-media";
import "../../styles/native-domain-dialogs.css";

export interface MediaPickerDialogProps {
  useJiniMediaPickerHook?: typeof useJiniMediaPicker;
  /** The host picker-context read, injectable like the other hooks here (defaults to the real context). */
  useHostMediaPickerHook?: typeof useHostMediaPicker;
  useAdminLocaleHook?: typeof useAdminLocale;
  onSelect: (item: AdminMedia) => void;
  onCancel: () => void;
  /** Injectable seam for the dialog's data-fetch and Escape-to-cancel hook. Defaults to the real
   *  {@link useWiredMediaPickerDialog}; a test can pass a fake here to exercise `MediaPickerDialog`'s
   *  rendering without invoking `api.listMedia()` or a real `document` keydown listener at all. */
  useDialog?: typeof useWiredMediaPickerDialog;
  /** This dialog's own base handle — see this file's "Agent handles" doc for the full scheme. Omit
   *  to leave it untagged. */
  agentHandle?: string;
  /** Content types this caller can use, e.g. `["image/*"]` (2026-10-05: the featured-image chooser
   *  offered videos). Same matching as Jini's `acceptsMedia`: an asset with no known type is hidden
   *  once a filter is given. Omit (or `[]`) to offer every asset — existing callers' behavior. */
  accept?: readonly string[];
}

/** The host side of the Jini picker bridge: the CMS media list, the host redaction policy and the API incident id. */
export const jiniMediaPickerHostArgs = {
  port: defaultMediaPickerPort,
  errorRedaction: TOVU_ERROR_REDACTION_OPTIONS,
  errorIdOf: (cause: unknown) => cause instanceof ApiError && typeof cause.body?.errorId === "string" ? cause.body.errorId : undefined,
  useCachedLoader,
};

/** Existing callers keep their CMS callbacks; the mounted admin supplies Jini's promise service. */
export function MediaPickerDialog({ useJiniMediaPickerHook = useJiniMediaPicker, useHostMediaPickerHook = useHostMediaPicker, useAdminLocaleHook = useAdminLocale, useDialog, ...props }: MediaPickerDialogProps) {
  return <JiniMediaPickerDialog {...props}
    useJiniMediaPickerHook={useJiniMediaPickerHook}
    useHostMediaPickerHook={() => {
      const picker = useHostMediaPickerHook();
      return useDialog ? null : picker;
    }}
    useAdminLocaleHook={useAdminLocaleHook}
    useDialog={useDialog ?? useWiredMediaPickerDialog}
    pickerHostArgs={jiniMediaPickerHostArgs}
    Dialog={Dialog} FailureNotice={ErrorNotice} translate={sharedComponentsT} acceptsMedia={acceptsMedia}
  />;
}
