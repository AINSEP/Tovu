import { t as pageEditorT } from "../pages/page-editor-i18n";

/** Bind shared page-editor copy for the email editor toolbar. */
export function createEmailPageTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string) => pageEditorT({ locale, key });
}
