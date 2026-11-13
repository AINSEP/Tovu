### tovu:apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts
- **Over:** `useSiteImport` 118 (file 404, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`, `site-transfer-tabs.unit.test.tsx`, `site-transfer-credential-warnings.unit.test.tsx`, `site-transfer-saved-keys.journey.test.tsx`, `SiteExportTab.static.unit.test.tsx`, `SiteExportTab.history.unit.test.tsx`, `SiteExportTab.secret.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | statements in `useSiteImport` | job |
|---|---|---|
| A | `link`/`setLinkState`, `file`/`setFile` states, `setLink` (+ "A link and a file are two ways…" comment), `chooseFiles` | pick ONE import source (link or zip) |
| B | `password`, `confirm`, `settingOwner`, `ownerError` states, `passwordProblem`, `async function completeOwner()` | set the new site's owner password |
| C | rest (`scope`, `list`, `invalidate`, `refresh`, `importing`, `importError`, `current`, `savedKeysPassword`, `liveAddress`, `arrivedForImport`, `unavailable`, `startImport`, return) | run the import (stays) |

- **Splits** (same file, module level, directly above `useSiteImport`, in run order):
  1. SUB-HOOK `useImportSource({ t, setImportError }: UseImportSourceInput): { link; setLinkState; file; setFile; setLink; chooseFiles }` ← `const [link, setLinkState] = useState("");`, `const [file, setFile] = useState<File | null>(null);`, `const setLink = …`, `const chooseFiles = …` (bodies unchanged). Declare `importError` state before calling it.
  2. SUB-HOOK `useImportOwnerSetup({ port, t, current, setCurrent, savedKeysPassword, setSavedKeysPassword, refresh }: UseImportOwnerSetupInput): { password; setPassword; confirm; setConfirm; settingOwner; ownerError; passwordProblem; completeOwner }` ← the four owner states, `const passwordProblem = passwordProblemFor(…)`, `async function completeOwner()` (body unchanged). Called after `current`/`savedKeysPassword`/`refresh` exist.
  3. `useSiteImport` destructures both results under the same names, so `startImport` and the return object stay byte-identical.
- **Importers to update:** none.
- **After:** file ~420; `useSiteImport` ~78; `useImportOwnerSetup` ~30; `useImportSource` ~22.
- **Risks / notes:** `useState` call order shifts (link/file and owner states move); hooks stay unconditional so behaviour is unchanged. `t` type is `Translate` (already imported); setter types `Dispatch<SetStateAction<…>>`.
