import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { enableSkill, listSkills, removeSkill, SKILLS_CHANGED_EVENT, type InstalledSkill } from "./api";
import { useSkillInstall } from "./use-skill-install.hooks";
import { useSkillConfirmation } from "./use-skill-confirmation.hooks";
import { useSkillsTabs } from "./use-skills-tabs.hooks";

export const SKILL_FILE_ACCEPT = ".zip,.md,.txt,.json,.yaml,.yml,.csv,.svg,.sh,.py,.js,.ts,.mjs,.png,.jpg,.jpeg,.webp";

export interface SkillRowView {
  skill: InstalledSkill;
  busy: boolean;
  sourceUrl?: string;
  shortCommit?: string;
  expanded: boolean;
  detailId: string;
  onToggleExpanded: () => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
  onInspect: () => void;
}

/** Keeps the existing API, refresh event and stale-load guard behind a render-only view. */
export function useSkills() {
  const tabs = useSkillsTabs();
  const [skills, setSkills] = useState<InstalledSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [removing, setRemoving] = useState<InstalledSkill | null>(null);
  const [inspecting, setInspecting] = useState<InstalledSkill | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const reload = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const installed = await listSkills();
      if (mounted.current && generation === loadGeneration.current) {
        setSkills(installed);
        setError(null);
      }
    } catch (e) {
      if (mounted.current && generation === loadGeneration.current) {
        setError(e instanceof Error ? e.message : "Could not load skills.");
      }
    }
  }, []);
  const onInstalled = useCallback(async () => {
    await reload();
    if (mounted.current) tabs.onShowSkills();
  }, [reload, tabs.onShowSkills]);
  const install = useSkillInstall(onInstalled);
  useEffect(() => {
    mounted.current = true;
    void reload();
    const refresh = () => void reload();
    window.addEventListener(SKILLS_CHANGED_EVENT, refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener(SKILLS_CHANGED_EVENT, refresh);
    };
  }, [reload]);

  async function change(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
      await reload();
      if (mounted.current) setRemoving(null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Could not change skill.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const onCancelRemove = useCallback(() => { if (!busy) setRemoving(null); }, [busy]);
  const confirmation = useSkillConfirmation(removing !== null, onCancelRemove);
  function onConfirmRemove() {
    if (removing) void change(() => removeSkill(removing.toolId));
  }
  function onSubmitGithub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    install.propose({ githubUrl: githubUrl.trim() });
  }
  function onGithubUrlChange(event: ChangeEvent<HTMLInputElement>) { setGithubUrl(event.target.value); }
  function onFilesChange(event: ChangeEvent<HTMLInputElement>) {
    void install.proposeFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }
  function toggleExpanded(id: string) {
    setExpandedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const rows: SkillRowView[] = (skills ?? []).map(skill => ({
    skill,
    busy,
    sourceUrl: skill.source === "uploaded" ? undefined : skill.source.githubUrl,
    shortCommit: skill.source === "uploaded" ? undefined : skill.source.commit.slice(0, 7),
    expanded: expandedIds.has(skill.toolId),
    detailId: `skill-detail-${encodeURIComponent(skill.toolId)}`,
    onToggleExpanded: () => toggleExpanded(skill.toolId),
    onToggleEnabled: () => { void change(() => enableSkill(skill.toolId, !skill.enabled)); },
    onRemove: () => setRemoving(skill),
    onInspect: () => setInspecting(skill),
  }));
  const addBusy = busy || install.busy;
  return {
    ...tabs,
    skills, rows, error, githubUrl, removing, inspecting, busy, install, confirmation,
    onCloseFiles: () => setInspecting(null),
    filesInput, folderInput, addBusy, githubDisabled: !githubUrl.trim() || addBusy,
    loading: skills === null && !error, empty: skills?.length === 0,
    reload, onCancelRemove, onConfirmRemove, onSubmitGithub, onGithubUrlChange, onFilesChange,
    onChooseFiles: () => filesInput.current?.click(),
    onChooseFolder: () => folderInput.current?.click(),
  };
}

export type SkillsController = ReturnType<typeof useSkills>;
