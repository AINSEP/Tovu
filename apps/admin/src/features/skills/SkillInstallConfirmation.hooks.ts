import { t as translateForSkillInstallConfirmation } from "@jini-ai/admin/screens/skills/skills-i18n";

/** Bind this screen's copy to the current locale. */
export function createSkillInstallConfirmationTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForSkillInstallConfirmation({ locale, key });
}
