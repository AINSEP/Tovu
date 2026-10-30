import { useCallback as useQueryFetchCallback } from "react";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useState } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { PackageFilesModalProps } from "../plugins/PackageFilesModal";
import { packageFilesRead, packageFilesViewState, type PackageFilesRead } from "../plugins/rules";
import { listSkillFiles, type InstalledSkill, type SkillFiles } from "./api";

interface SkillFilesDependencies {
  readonly toolId: string | null;
  readonly read: (toolId: string) => Promise<SkillFiles>;
  readonly t: Translate;
}

const identity: Translate = key => key;

/** Mirrors the plugin files hook's stale-read guard; defaults to the skill's instructions. */
export function useSkillFiles({ toolId, read, t }: SkillFilesDependencies) {
  const [selection, setSelection] = useState<{ toolId: string | null; path: string } | null>(null);
  const queryFetch = useQueryFetchCallback(async () => {
    try { return await read(toolId!); }
    catch (error) { throw new Error(error instanceof Error ? error.message : "Could not load skill files."); }
  }, [read, toolId]);
  const query = useFetchQuery({ key: ["skills", "files", toolId ?? ""], fetch: queryFetch }, { enabled: toolId !== null, staleTime: 0 });
  const skillCopy: Translate = key => {
    if (key === "Loading package files…") return "Loading skill files…";
    if (key === "No files to show for this plugin.") return "No files to show for this skill.";
    return t(key);
  };
  const loaded: PackageFilesRead | null = packageFilesRead(query);
  const selectedPath = selection?.toolId === toolId ? selection.path : "SKILL.md";
  const validPath = loaded?.listing?.files.some(file => file.relativePath === selectedPath) ? selectedPath : "SKILL.md";
  return {
    ...packageFilesViewState(loaded, validPath, skillCopy),
    selectFile: (path: string) => setSelection({ toolId, path }),
    t: skillCopy,
  };
}

/** The shared modal accepts these props directly; no Skills-specific modal component needed. */
export function useSkillFilesModal(skill: InstalledSkill | null, onClose: () => void): PackageFilesModalProps | null {
  const files = useSkillFiles({ toolId: skill?.toolId ?? null, read: listSkillFiles, t: identity });
  if (!skill) return null;
  return {
    title: `${skill.name} skill files`,
    subtitle: "Read-only view of this skill's files; nothing runs from this screen.",
    files: files.files, selectedFile: files.selectedFile, onSelectFile: files.selectFile,
    status: files.status, listNotice: files.listNotice,
    handlePrefix: "skill-file", t: files.t, onClose,
  };
}
