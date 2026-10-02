/** Guidance stays host context until dispatch; transcript and title inputs stay user-authored. */
export interface SelectedComposerSkill {
  readonly toolId: string;
  readonly name: string;
  /** Verbatim loadSkillDraft result, including fs_read_file reference descriptors and Task suffix. */
  readonly guidance: string;
}

export function selectedSkillsFromContext(context: Record<string, unknown> | undefined): readonly SelectedComposerSkill[] {
  const skills = context?.selectedSkills;
  if (!Array.isArray(skills)) return [];
  return skills.filter((skill): skill is SelectedComposerSkill => skill !== null && typeof skill === "object" && typeof skill.toolId === "string" && typeof skill.name === "string" && typeof skill.guidance === "string");
}

export function promptWithSelectedSkills(prompt: string, context: Record<string, unknown> | undefined): string {
  const skills = selectedSkillsFromContext(context);
  return skills.length === 0 ? prompt : `${skills.map(skill => skill.guidance).join("\n\n")}${prompt}`;
}

/** Plus selections keep the entire draft; slash selections remove only the active /query. */
export function draftAfterSkillSelection(draft: string, source: "plus" | "slash"): string {
  return source === "slash" ? draft.replace(/^\/[^\s/]*\s*/, "") : draft;
}
