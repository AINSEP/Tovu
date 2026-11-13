### jini:packages/ui/src/react/components/CustomSelect.tsx
- **Over:** `CustomSelect` 101 (file 493 — any in-file helper would push it past 500, so a file split comes first)
- **Phase:** now · **Batch:** size-40
- **Tests:** `packages/ui/src/react/__tests__/components/CustomSelect.test.tsx`, `packages/ui/src/react/__tests__/components/default-agent-handles.test.tsx`, `packages/ui/src/react/__tests__/components/agent-handles-driver.integration.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `CustomSelectOriginTheme`, `resolveCustomSelectSchemeAttributes`, `resolveCustomSelectOriginTheme`, `useCustomSelectOriginTheme` | theme of the place the menu opened from |
| B | types, constants, pure geometry/keyboard helpers, `useCustomSelect` | select behaviour (stays) |
| C | `customSelectMenuStyle`, `mountCustomSelectMenu`, `CustomSelectMenuOptions`, `CustomSelect`, `CustomSelectOptionButton` | render (stays) |

- **Splits:**
  1. NEW `CustomSelect-origin-theme.ts` — job: resolve the opener's theme/scheme. Moves unit A with all comments (the long block above `useCustomSelectOriginTheme` included). Exports `CustomSelectOriginTheme`, `resolveCustomSelectOriginTheme`, `useCustomSelectOriginTheme`. Imports nothing from the original.
  2. SUB-COMPONENT `CustomSelectMenu` (same file, above `CustomSelect`) ← the `const menu = (` JSX block; plain props = the names it reads (`menuRef`, `idBase`, `onMenuKeyDown`, `originTheme`, `originPage`, `agentProps`, `className`, `portal`, `menuClassName`, `ariaLabel`, `position`, `menuHeader`, `base`, `options`, …; take the exact list from the block). `CustomSelect` keeps `const menu = <CustomSelectMenu … />`.
- **Importers to update:** `packages/ui/src/react/__tests__/components/CustomSelect.test.tsx` (`resolveCustomSelectOriginTheme` → `../../components/CustomSelect-origin-theme.js`); any barrel: `rg -n "CustomSelectOriginTheme|resolveCustomSelectOriginTheme|useCustomSelectOriginTheme" packages/ui/src --glob '!**/CustomSelect*.ts*'` (found only the test today).
- **After:** CustomSelect.tsx ~455; `CustomSelect` ~75; new file ~50.
- **Risks / notes:** check `packages/ui/src/react/index.ts`/components barrel for `export * from './components/CustomSelect.js'` — if present, add `export * from './components/CustomSelect-origin-theme.js'` there (barrel is the public entry; keeps package API).
