import { useSkillFiles as useJiniSkillFiles, useSkillFilesModal as useJiniSkillFilesModal } from "@jini-ai/agentic/react/skills/use-skill-files.hooks";
import { useSkillInstall as useJiniSkillInstall } from "@jini-ai/agentic/react/skills/use-skill-install.hooks";
import { useSkills as useJiniSkills } from "@jini-ai/agentic/react/skills/use-skills.hooks";
import { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { ErrorNotice } from "@jini-ai/ui/panel-kit";
import { prepareSkillUpload } from "@jini-ai/admin/screens/skills/skill-upload";
import { skillFailure } from "@jini-ai/admin/screens/skills/skill-failure";
import { useSkillConfirmation } from "@jini-ai/admin/screens/skills/use-skill-confirmation.hooks";
import { useSkillsTabs } from "@jini-ai/admin/screens/skills/use-skills-tabs.hooks";
import { packageFilesRead, packageFilesViewState } from "../plugins/rules";
import { enableSkill, installSkill, listSkillFiles, listSkills, removeSkill, SKILLS_CHANGED_EVENT } from "./api";
import { SKILL_FAILURE_HOST } from "./skill-failure-host";

const defaultSkillsPort = { listSkills, enableSkill, removeSkill };
const queryHooks = { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate };
const describeFailure: Parameters<typeof useJiniSkillInstall>[0]["describeFailure"] = required => skillFailure({ ...SKILL_FAILURE_HOST, ...required });

function subscribeChanged(listener: () => void) {
  window.addEventListener(SKILLS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(SKILLS_CHANGED_EVENT, listener);
}

export function useSkillFiles(required: Pick<Parameters<typeof useJiniSkillFiles>[0], "toolId" | "read" | "t">) {
  return useJiniSkillFiles({ ...required, useFetchQueryHook: useFetchQuery, packageFilesRead, packageFilesViewState, describeFailure });
}

export function useSkillFilesModal(required: Pick<Parameters<typeof useJiniSkillFilesModal>[0], "skill" | "onClose">, optional: Parameters<typeof useJiniSkillFilesModal>[1] = {}) {
  return useJiniSkillFilesModal({ ...required, read: listSkillFiles, useSkillFilesHook: useSkillFiles, FailureNotice: ErrorNotice }, optional);
}

export function useSkillInstall(_required = {}, optional: Parameters<typeof useJiniSkillInstall>[1] = {}) {
  return useJiniSkillInstall({ installSkill, prepareSkillUpload, describeFailure }, optional);
}

export function useSkills({ port = defaultSkillsPort, t = key => key }: { port?: typeof defaultSkillsPort; t?: Parameters<typeof useJiniSkills>[0]["t"] } = {}, _optional?: Record<string, never>) {
  return useJiniSkills({ port, t, queryHooks, subscribeChanged, useSkillInstallHook: useSkillInstall, useSkillConfirmationHook: useSkillConfirmation, useSkillsTabsHook: useSkillsTabs, describeFailure });
}
