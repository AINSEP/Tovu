import { t as mediaT } from "../../features/media/media-i18n";
import { useMediaEditDialog, type MediaEditDialogController, type MediaEditDialogValue } from "@jini-ai/admin/shell/components/MediaEditDialog/MediaEditDialog.hooks";
import { embedPolicy } from "../../integrations/jini-admin/embed-policy-ports";
import { describeMediaHtmlAttributeError } from "@jini-ai/admin/screens/media/rules";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";

/**
 * Binds the real `useAdminLocale()` — the zero-argument-dependencies half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `MediaEditDialog.tsx` composes this and a test
 * composes `useMediaEditDialog` (`@jini-ai/admin/shell/components/MediaEditDialog/MediaEditDialog.hooks`)
 * with a fixed `locale` and these same host collaborators.
 */
export function useWiredMediaEditDialog(
  { initial, onSave, onCancel }: {
    initial: MediaEditDialogValue; onSave: (value: MediaEditDialogValue) => void; onCancel: () => void;
  },
  _options: Record<string, never> = {},
): MediaEditDialogController {
  const locale = useAdminLocale();
  return useMediaEditDialog({
    initial, onSave, _onCancel: onCancel,
    deps: { locale, translate: mediaT, describeHtmlAttributeError: ({ error, locale: errorLocale }) => describeMediaHtmlAttributeError({ error, locale: errorLocale, translate: mediaT }), htmlAttributePolicy: embedPolicy },
  });
}
