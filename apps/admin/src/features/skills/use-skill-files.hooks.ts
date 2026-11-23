import { useCallback as useQueryFetchCallback } from "react";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { createElement, useState } from "react";
import { ErrorNotice } from "@jini-ai/ui/panel-kit";
import type { PackageFilesModalProps } from "../plugins/PackageFilesModal";
import { packageFilesRead, packageFilesViewState, type PackageFilesRead } from "../plugins/rules";
import { listSkillFiles, type InstalledSkill, type SkillFiles } from "./api";
import { skillFailure } from "@jini-ai/admin/screens/skills/skill-failure";

import { type Translate } from '@jini-ai/core/text';
import { SKILL_FAILURE_HOST } from "./skill-failure-host";
interface SkillFilesDependencies {
  readonly toolId: string | null;
  readonly read: (required: { toolId: string }, optional?: Record<string, never>) => Promise<SkillFiles>;
  readonly t: Translate;
}

const identity: Translate = key => key;

/** A missing or removed selection returns to the skill instructions instead of showing stale bytes. */
function skillSelectedPath({ loaded, selectedPath }: { loaded: PackageFilesRead | null; selectedPath: string }): string {
  return loaded?.listing?.files.some(file => file.relativePath === selectedPath) ? selectedPath : "SKILL.md";
}

/** Mirrors the plugin files hook's stale-read guard; defaults to the skill's instructions. */
export function useSkillFiles({ toolId, read, t }: SkillFilesDependencies) {
  const [selection, setSelection] = useState<{ toolId: string | null; path: string } | null>(null);
  const queryFetch = useQueryFetchCallback(async () => {
    if (toolId === null) throw new Error("skill files have no selected skill id");
    try { return await read({ toolId }); }
    catch (error) { if (error instanceof Error) throw error; throw new Error("Could not load skill files.", { cause: error }); }
  }, [read, toolId]);
  const query = useFetchQuery({ key: ["skills", "files", toolId ?? ""], fetch: queryFetch }, { enabled: toolId !== null, staleTime: 0 });
  const skillCopy: Translate = key => {
    if (key === "Loading package files…") return t("Loading skill files…");
    if (key === "No files to show for this plugin.") return t("No files to show for this skill.");
    return t(key);
  };
  const readResult = packageFilesRead(query);
  const loaded: PackageFilesRead | null = readResult?.error ? { ...readResult, error: t(readResult.error) } : readResult;
  const failure = query.error ? skillFailure({ ...SKILL_FAILURE_HOST, error: query.error, message: "Could not load skill files.", t }) : null;
  const selectedPath = selection?.toolId === toolId ? selection.path : "SKILL.md";
  const validPath = skillSelectedPath({ loaded, selectedPath });
  return {
    ...packageFilesViewState({ read: loaded, selectedPath: validPath, translate: skillCopy }),
    failure,
    selectFile: ({ path }: { path: string }, _optional = {}) => setSelection({ toolId, path }),
    t: skillCopy,
  };
}

/** The shared modal accepts these props directly; no Skills-specific modal component needed. */
export function useSkillFilesModal({ skill, onClose }: { skill: InstalledSkill | null; onClose: () => void }, { t = identity }: { t?: Translate } = {}): PackageFilesModalProps | null {
  const files = useSkillFiles({ toolId: skill?.toolId ?? null, read: listSkillFiles, t });
  if (!skill) return null;
  return {
    title: t("{name} skill files").replace("{name}", () => skill.name),
    subtitle: t("Read-only view of this skill's files; nothing runs from this screen."),
    headerExtras: files.failure ? createElement(ErrorNotice, { failure: files.failure, t }) : undefined,
    files: files.files, selectedFile: files.selectedFile, onSelectFile: (path) => files.selectFile({ path }),
    status: files.status, listNotice: files.listNotice,
    handlePrefix: "skill-file", t: files.t, onClose,
  };
}
