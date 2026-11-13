### jini:packages/ui/src/features/execution/react/hooks/use-execution-credential.hooks.ts
- **Over:** `useExecutionCredential` 130 (file 180, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/execution/__tests__/react/hooks/use-execution-credential.test.ts`, `src/features/execution/__tests__/react/hooks/use-execution-credential.lifecycle.test.ts`
- **Responsibility map** (inside `useExecutionCredential`):

| unit | statements | job |
|---|---|---|
| A | `stored`, `storedSettlement` (+ "Guards `setStored`…" comment), `installWrittenView` (+ "A write's own response…" comment), the hydrate `useEffect` (+ "Hydrate the stored view…" comment and its trailing `port`-is-stable comment + existing `eslint-disable-next-line` line) | load + order-guard the stored credential view |
| B | `legacyKey`, `legacyDismissed`, the "Offer the migration prompt…" `useEffect`, `migrateLegacyKey`, `dismissLegacyPrompt` | local→server legacy-key migration prompt |
| C | `saveState`, `settingsSaveState`, `inputRef`, `writes`, `saveKey`, `saveSettings`, derived `storedKeyIsForOtherEndpoint`/`apiKeyPlaceholder`, `return` | key/settings saves + controller — stays |

- **Splits** (same file, sub-hooks at module level above `useExecutionCredential`):
  1. SUB-HOOK `useStoredExecutionCredential<TStored extends ExecutionCredentialView>({ port, effects }: { port: ExecutionCredentialPort<TStored>; effects: ExecutionCredentialEffects<TStored> }): { stored: TStored | null; installWrittenView: (view: TStored) => void }` ← unit A verbatim, all comments word for word (the hydrate effect's deps comment and the pre-existing `// eslint-disable-next-line react-hooks/exhaustive-deps` line move unchanged with the effect — it is the same line, not a new disable; `git diff` must show it moved, not added elsewhere).
  2. SUB-HOOK `useLegacyCredentialMigration<TStored extends ExecutionCredentialView>({ stored, byok, port, effects, writes, installWrittenView, setSaveState }: UseLegacyCredentialMigrationInput<TStored>): { legacyKey: string | null; legacyDismissed: boolean; migrateLegacyKey: () => Promise<void>; dismissLegacyPrompt: () => void }` ← unit B verbatim (the "Clear the local copy ONLY after the PUT…" and "Same cross-mount notification…" comments move). Input field types: `byok: UseExecutionCredentialInput['byok']`, `writes: ReturnType<typeof useSerialWrites>`, `setSaveState: Dispatch<SetStateAction<ExecutionCredentialSaveState>>`.
  3. `useExecutionCredential` order becomes: `const { stored, installWrittenView } = useStoredExecutionCredential({ port, effects });` → `saveState`, `settingsSaveState` → `inputRef` (+comment) → `writes` (+comment) → `const { legacyKey, legacyDismissed, migrateLegacyKey, dismissLegacyPrompt } = useLegacyCredentialMigration({ … });` → `saveKey`, `saveSettings`, derived values, `return` unchanged (`legacyKey: legacyDismissed ? null : legacyKey`).
- **Importers to update:** none (no exports move).
- **After:** file ~195; `useExecutionCredential` ~72; `useStoredExecutionCredential` ~30; `useLegacyCredentialMigration` ~38.
- **Risks / notes:** effect order preserved (hydrate effect still registers before the legacy-prompt effect). `installWrittenView` is now a stable-per-render closure from the sub-hook exactly as before (it was a plain function, not memoized). The file's `@file` doc references "Cross-mount staleness" — keep it in the file header untouched. No `vi.mock` of this file.
