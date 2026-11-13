### jini:packages/ui/src/features/skills/react/components/SkillRow.tsx
- **Over:** `SkillRow` 112 (file 356)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/skills/__tests__/react/components/SkillRow.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | JSX `<div className="jini-skills-row-head">` (~L111-158) | row header: toggle, summary button, actions/confirm |
| B | rest of `SkillRow` | row shell + expanded body |

- **Splits:**
  1. SUB-COMPONENT `SkillRowHead` (same file, below `SkillRow`, before `SkillRowSummaryButton`) ← the head `<div>` JSX. Plain props = names that block reads (from the outline: `enabled`, `skill`, `locale`, `expanded`, `onToggleExpanded`, `labels`, `l`, `agentHandle`, `confirmDelete`, `onCommitDelete`, `onCancelDelete`, `editActionLabel`, `onStartEdit`, `onArmDelete`, enable-toggle handler, `builtIn`, …) — take the exact list from the JSX; type it as `Pick<SkillRowProps, ...> & { l: …; builtIn: boolean; editActionLabel: string }`.
- **Importers to update:** none.
- **After:** `SkillRow` ~68; file ~365.
- **Risks / notes:** pure JSX move; keep the `editActionLabel` comment in `SkillRow`.
