import { useCallback } from "react";
import { t as translateSkills } from "@jini-ai/admin/screens/skills/skills-i18n";

/** Keep the Skills translator stable until its locale changes. */
export function useSkillsTranslator({ locale }: { locale: string }, _options = {}) {
  return useCallback((key: string) => translateSkills({ locale, key }), [locale]);
}
