import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { ChatPaneComposerHandle, ComposerDiscoveryGroup } from "@jini-ai/chat/react";
import { rankComposerDiscoveryGroups } from "@/features/plugins/composer-capabilities";
import type { SelectedComposerSkill } from "@/features/plugins/selected-skills";

/** Uses the existing plugin tray and the same sticky-until-removed context behavior. */
export function useSelectedSkills() {
  const [selectedSkills, setSkills] = useState<readonly SelectedComposerSkill[]>([]);
  const addSkill = useCallback((skill: SelectedComposerSkill) => {
    setSkills(previous => [...previous.filter(existing => existing.toolId !== skill.toolId), skill]);
  }, []);
  const removeSkill = useCallback((toolId: string) => {
    setSkills(previous => previous.filter(skill => skill.toolId !== toolId));
  }, []);
  const chips = useMemo(() => selectedSkills.map(skill => ({ pluginRefId: skill.toolId, label: `${skill.name} · Skill` })), [selectedSkills]);
  const skillOnlyPrompt = selectedSkills.map(skill => skill.name).join(", ");
  return { selectedSkills, addSkill, removeSkill, chips, skillOnlyPrompt };
}

/** Jini owns filtering/keyboard behavior but exposes no rank or draft-change slot. Capture the
 * composer's change event at its existing host wrapper and supply an ordered catalog. Read the
 * live textarea for picks too, covering programmatic voice/draft restore without polling. */
export function useComposerDiscoveryDraft(catalog: readonly ComposerDiscoveryGroup[]) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const captureDraft = useCallback((event: FormEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLTextAreaElement && event.target.closest(".jini-composer")) setDraft(event.target.value);
  }, []);
  const readDraft = useCallback(() => rootRef.current?.querySelector<HTMLTextAreaElement>(".jini-composer textarea")?.value ?? "", []);
  const groups = useMemo(() => rankComposerDiscoveryGroups(catalog, draft), [catalog, draft]);
  const refreshDraft = useCallback(() => setDraft(readDraft()), [readDraft]);
  return { rootRef, captureDraft, readDraft, groups, draft, refreshDraft };
}

/** The package disables Send for empty drafts and exposes only insertText to hosts. This explicit
 * send action uses that public handle to seed a skill-name-only turn at send time, then delegates
 * to the pane's usual Send (including its runtime/upload guards). Selection itself stays blank. */
export function useSkillOnlySend(input: {
  prompt: string;
  composerHandle: RefObject<ChatPaneComposerHandle | null>;
  discovery: ReturnType<typeof useComposerDiscoveryDraft>;
}) {
  const { prompt, composerHandle, discovery } = input;
  useEffect(() => { discovery.refreshDraft(); }, [prompt, discovery.refreshDraft]);
  const sendSkills = useCallback(() => {
    if (!prompt || discovery.readDraft().trim() || !composerHandle.current) return;
    const textarea = discovery.rootRef.current?.querySelector<HTMLTextAreaElement>(".jini-composer textarea");
    if (textarea?.disabled || !discovery.rootRef.current?.querySelector(".jini-composer-send:not(.jini-composer-send--stop)")) return;
    flushSync(() => composerHandle.current?.insertText(prompt));
    const send = discovery.rootRef.current?.querySelector<HTMLButtonElement>(".jini-composer-send:not(.jini-composer-send--stop)");
    send?.click();
  }, [prompt, composerHandle, discovery.readDraft, discovery.rootRef]);
  return { sendSkills, canSendSkills: prompt.length > 0 && discovery.draft.trim().length === 0 };
}
