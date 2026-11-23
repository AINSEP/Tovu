import "@jini-ai/ui/settings-dialog.css";
import "./skills.css";
import { Skills as SkillsScreen } from "@jini-ai/admin/screens/skills/Skills";
import { useSkillsTranslator } from "@jini-ai/admin/screens/skills/Skills.hooks";
import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { PlainTextBlocks } from "@/components/PlainTextBlocks";
import { InstallTabCard, InstallTabFieldRow, InstallTabOption } from "../../components/InstallTabCard/InstallTabCard";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { PackageFilesModal } from "../plugins/PackageFilesModal";
import { SKILL_INSTALL_CONFIRMATION_HOST } from "./skill-install-confirmation-host";
import { SKILL_FAILURE_HOST } from "./skill-failure-host";
import { useSkillFilesModal } from "./use-skill-files.hooks";
import { useSkills } from "./use-skills.hooks";

const SKILLS_COMPONENTS = { PlainTextBlocks, PackageFilesModal, InstallTabCard, InstallTabOption, InstallTabFieldRow };

/** Binds this app's skills data, locale, theme boundary and shared install/file components into `@jini-ai/admin`'s Skills screen. */
export function Skills({ useSkillsHook = useSkills, useLocaleHook = useAdminLocale, useAdminThemeBoundaryHook = useAdminThemeBoundary, useSkillsTranslatorHook = useSkillsTranslator, useSkillFilesModalHook = useSkillFilesModal }: {
  useSkillsHook?: typeof useSkills; useLocaleHook?: typeof useAdminLocale;
  useAdminThemeBoundaryHook?: typeof useAdminThemeBoundary;
  useSkillsTranslatorHook?: typeof useSkillsTranslator;
  useSkillFilesModalHook?: typeof useSkillFilesModal;
} = {}) {
  const hooks = {
    ...SKILL_INSTALL_CONFIRMATION_HOST.hooks,
    useSkills: useSkillsHook, useLocale: useLocaleHook, useAdminThemeBoundary: useAdminThemeBoundaryHook,
    useSkillsTranslator: useSkillsTranslatorHook, useSkillFilesModal: useSkillFilesModalHook,
  };
  return <SkillsScreen hooks={hooks} components={SKILLS_COMPONENTS} failureHost={SKILL_FAILURE_HOST} />;
}
