import { t as translateForAiAssistant } from "./ai-assistant-i18n";

/** Bind this screen's copy to the current locale. */
export function createAiAssistantTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForAiAssistant({ locale, key });
}
