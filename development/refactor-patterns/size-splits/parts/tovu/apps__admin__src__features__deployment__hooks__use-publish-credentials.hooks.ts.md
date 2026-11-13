### tovu:apps/admin/src/features/deployment/hooks/use-publish-credentials.hooks.ts
- **Over:** `usePublishCredentials` 151 (file 247, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-02
- **Tests:** `apps/admin/src/features/deployment/hooks/__tests__/use-publish-credentials.unit.test.tsx`, `apps/admin/src/features/deployment/hooks/__tests__/use-publish-credentials-wired.unit.test.tsx`, `apps/admin/src/features/deployment/__tests__/StaticSiteTab.unit.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `usePublishCredentials` load block | fetch + seed credentials/executionMode once, load error |
| B | `formStates`, `patchRow`, `setField` | per-row draft form state |
| C | `selections`, `selectingRef`, `credentialsForProviderId`, `selectCredential`, `reconcileCredentials` | token-picker promotion |
| D | `rows` derivation | pure projection to `PublishCredentialRowState[]` |
| E | `savingRef`, `canSaveCredential`, `save`, `verify`, return | save/verify (stays in the hook) |

- **Splits** (same file, module level, above `usePublishCredentials`, in this order):
  1. SUB-HOOK `usePublishCredentialsLoad({ port, locale }: UsePublishCredentialsLoadInput): { credentials; setCredentials; executionMode; loadError }` ← `const query = useFetchQuery({ key: ["deployment", "publish-credentials"]…` through `const loadError = query.error ? publishCredentialsLoadErrorMessage(…` (incl. `seededRef` + its seeding `useEffect` and their "why" comment).
  2. SUB-HOOK `useCredentialRowForms({ targets, locale }: UseCredentialRowFormsInput): { formStates; patchRow; setField }` ← `const [formStates, setFormStates] = useState<Record<…` , `function patchRow(…`, `function setField(…` (keep `patchRow`'s comment). `patchRow`/`setField` keep their current positional signatures (existing closures, not new helpers).
  3. PURE HELPER `buildPublishCredentialRows({ credentials, targets, formStates, selections }: BuildPublishCredentialRowsInput): readonly PublishCredentialRowState[] | undefined` ← the initializer of `const rows: readonly PublishCredentialRowState[] | undefined =` (hook keeps `const rows = buildPublishCredentialRows({...})`).
  4. SUB-HOOK `useCredentialSelection({ port, locale, credentials, setCredentials }: UseCredentialSelectionInput): { selections; credentialsForProviderId; selectCredential }` ← `const [selections, setSelections] = useState<Partial<…` , `const selectingRef = useRef(…`, `function credentialsForProviderId(…`, `async function selectCredential(…`, `async function reconcileCredentials()` (with their "why" comments). `reconcileCredentials` is used only by `selectCredential` — confirm with rg inside the file before moving; if `save`/`verify` also call it, return it too.
  5. Hook order after split: load → row forms → `selectingRef`-free selection hook → `savingRef` → `canSaveCredential`/`save`/`verify` → `rows` → `credentialChangePending` → return. Keep the hook call order identical to today's state-declaration order (load, formStates, selections) so React hook order is stable.
- **Importers to update:** none (no export moves).
- **After:** file ~265; `usePublishCredentials` ~70; each sub-hook < 40.
- **Risks / notes:** `credentials` passed into `useCredentialSelection` is the current render value — same closure semantics as today. Type `RowFormState`/`SelectionState` stay in the file.
