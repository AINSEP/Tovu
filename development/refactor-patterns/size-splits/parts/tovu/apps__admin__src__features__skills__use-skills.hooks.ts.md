### tovu:apps/admin/src/features/skills/use-skills.hooks.ts
- **Over:** `useSkills` 102 (file 147, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/skills/__tests__/use-skills.unit.test.ts`, `skill-dialogs-and-row.unit.test.tsx`, `skills-page-i18n.unit.test.tsx` (same folder), `apps/admin/src/__tests__/fqfix-actions.unit.test.tsx`
- **Responsibility map:**

| unit | statements in `useSkills` | job |
|---|---|---|
| A | `const rows: SkillRowView[] = (skills ?? []).map(skill => ({` | build one row view per installed skill |
| B | everything else | load, write, install, confirm (stays) |

- **Splits:**
  1. HELPER (module level, above `useSkills`, below `skillsFailureState`): `skillRowViews({ skills, busy, expandedIds, toggleExpanded, change, port, setRemoving, setInspecting }: SkillRowViewsInput): SkillRowView[]` ← the `.map(...)` expression verbatim (`skills: InstalledSkill[] | null`, `expandedIds: Set<string>`, `toggleExpanded: (id: string) => void`, `change: (work: () => Promise<unknown>) => Promise<void>`, `port: typeof defaultSkillsPort`, setters `(skill: InstalledSkill | null) => void`). In `useSkills`: `const rows = skillRowViews({ skills, busy, expandedIds, toggleExpanded, change, port, setRemoving, setInspecting });`.
- **Importers to update:** none.
- **After:** file ~152; `useSkills` ~91; `skillRowViews` ~16.
- **Risks / notes:** `change`/`toggleExpanded` are plain per-render functions; passing them keeps identical closures. `githubUrl` in the row is `skill.source.githubUrl` (not the hook's state).
