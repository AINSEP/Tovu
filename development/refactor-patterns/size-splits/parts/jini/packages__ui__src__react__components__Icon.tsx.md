### jini:packages/ui/src/react/components/Icon.tsx
- **Over:** file 675 (`ICON_RENDERERS` table alone 645)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/__tests__/components/Icon.test.tsx`; smoke `packages/ui/src/react/__tests__/components/AgentIcon.test.tsx`, `packages/ui/src/features/tab-launcher-menu/react/components/TabLauncherMenu.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `ICON_RENDERERS` (one flat `Record<IconName, IconRenderer>` of inline SVG arrow functions) | icon artwork table |
| B | `ICON_PATH_DATA`, `Props`, `CommonIconProps`, `IconRenderer`, `Icon` | render one icon (~30 lines) |

- **Splits:** none proposed. The only way under 500 is cutting the artwork table into chunks with no job beyond "more icons" (alphabetical or arbitrary families) — that is a line-count cut, banned by CONVENTIONS rule 1.
- **Importers to update:** n/a.
- **After:** unchanged.
- **Risks / notes:** if the owner prefers a split anyway: NEW `Icon-renderers.tsx` holding `ICON_RENDERERS` + `IconRenderer`/`CommonIconProps` (still 650 lines → would itself need the exception) — no gain.
- **Owner exception candidate:** `ICON_RENDERERS` is one flat generated-like artwork table (645 counted lines, one entry per icon); no responsibility split exists.
