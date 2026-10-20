import { useFetchQuery, useFetchMutation, useCachedLoader, useInvalidate } from "@jini-ai/ui/fetch-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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

const defaultSkillsPort = { listSkills, enableSkill, removeSkill };

function getSkillsAvailability(
  { skills, error, githubUrl, busy, installBusy }: {
    skills: readonly InstalledSkill[] | null;
    error: string | null;
    githubUrl: string;
    busy: boolean;
    installBusy: boolean;
  },
  _options = {},
) {
  const addBusy = busy || installBusy;
  return {
    addBusy,
    githubDisabled: !githubUrl.trim() || addBusy,
    loading: skills === null && !error,
    empty: skills?.length === 0,
  };
}

/** Keeps the existing API, refresh event and stale-load guard behind a render-only view.
 * The injected port lets action tests exercise retry/refetch ordering without module mocks. */
export function useSkills({ port = defaultSkillsPort }: { port?: typeof defaultSkillsPort } = {}, _optional = {}) {
  const tabs = useSkillsTabs();
  const queryFetch = useCallback(async () => {
    try { return await port.listSkills(); }
    catch (error) { throw new Error(error instanceof Error ? error.message : "Could not load skills."); }
  }, [port]);
  const key = useMemo(() => ["skills", "list"] as const, []);
  const query = useFetchQuery({ key, fetch: queryFetch }, { staleTime: 0 });
  const skills = query.data ?? null;
  const invalidate = useInvalidate();
  const loader = useCachedLoader({ key, fetch: queryFetch }, { staleTime: 0 });
  // The skills API publishes SKILLS_CHANGED_EVENT after accepted writes; that notification
  // already invalidates the list. A second mutation invalidation would restart that fresh read.
  const write = useFetchMutation({ run: ({ input }: { input: () => Promise<unknown> }) => input() });
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? query.error?.message ?? null;
  const [githubUrl, setGithubUrl] = useState("");
  const [removing, setRemoving] = useState<InstalledSkill | null>(null);
  const [inspecting, setInspecting] = useState<InstalledSkill | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    setError(null);
    invalidate({ key: ["skills"] });
    try { await loader.load(); } catch { /* The query exposes the read error. */ }
  }, [invalidate, loader]);
  const onInstalled = useCallback(async () => {
    await loader.load().catch(() => {}); // The query exposes refresh failures separately from accepted writes.
    if (mounted.current) tabs.onShowSkills();
  }, [loader, tabs.onShowSkills]);
  const install = useSkillInstall(onInstalled);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => void reload();
    window.addEventListener(SKILLS_CHANGED_EVENT, refresh);
    return () => {
      mounted.current = false;
      window.removeEventListener(SKILLS_CHANGED_EVENT, refresh);
    };
  }, [reload]);

  async function change(work: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await write.mutate({ input: work });
      await loader.load().catch(() => {}); // The query exposes refresh failures separately from accepted writes.
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
    if (removing) void change(() => port.removeSkill(removing.toolId));
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
    onToggleEnabled: () => { void change(() => port.enableSkill(skill.toolId, !skill.enabled)); },
    onRemove: () => setRemoving(skill),
    onInspect: () => setInspecting(skill),
  }));
  return {
    ...tabs,
    skills, rows, error, githubUrl, removing, inspecting, busy, install, confirmation,
    onCloseFiles: () => setInspecting(null),
    filesInput, folderInput,
    ...getSkillsAvailability({ skills, error, githubUrl, busy, installBusy: install.busy }),
    reload, onCancelRemove, onConfirmRemove, onSubmitGithub, onGithubUrlChange, onFilesChange,
    onChooseFiles: () => filesInput.current?.click(),
    onChooseFolder: () => folderInput.current?.click(),
  };
}

export type SkillsController = ReturnType<typeof useSkills>;
