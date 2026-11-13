### tovu:apps/desktop/src/renderer/CreateWebsiteOnboarding.tsx
- **Over:** `CreateWebsiteOnboarding` 136 (file 308, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-10
- **Tests:** `apps/desktop/src/renderer/CreateWebsiteOnboarding.test.ts`, `CreateWebsiteOnboarding.render.test.ts`, `CreateWebsiteOnboarding.database-options.render.test.ts`, `app/CreateWebsiteHost.render.test.ts` (renderer runner). No mocks of the module.
- **Responsibility map:**

| unit | statements / JSX | job |
|---|---|---|
| A | policy, `usePluginTokens`, `useForm(...)` destructure, `useDestination`, `showErrorFooter` | form state (stays; all hooks already injected) |
| B | `<div className="onboarding__intro">` | page intro + back link |
| C | first `<div className="onboarding-section">` (Website details: name input, destination hint, name error) | website name field |
| D | second `onboarding-section` with `<DatabasePicker …/>` | database choice (stays — 1:1 forwarding to `DatabasePicker`) |
| E | `<div className="onboarding__actions">` | error footer + Cancel / Create buttons |

- **Splits** (same file, sub-components at module level directly above `CreateWebsiteOnboarding`, in render order; plain props only):
  1. `OnboardingIntro({ onBack }: { onBack: () => void })` ← unit B JSX verbatim.
  2. `WebsiteNameSection({ name, nameError, setName, destinationHint }: WebsiteNameSectionProps)` ← unit C JSX verbatim (incl. `namePasteHandler({ setName })`, `autoFocus`). Prop types: `name: string; nameError: string | null` (use the `CreateWebsiteFormState` field types: `CreateWebsiteFormState["nameError"]` etc.), `destinationHint: ReturnType<typeof useNewSiteDir>`.
  3. `OnboardingActions({ showErrorFooter, formError, onBack, canCreate, isSubmitting }: OnboardingActionsProps)` ← unit E JSX verbatim.
  The commented-out "Owner 2026-10-06: hidden" JSX blocks stay in `CreateWebsiteOnboarding`, in place, word for word.
- **Importers to update:** none (no export moves).
- **After:** `CreateWebsiteOnboarding` ~97; file ~330; new sub-components ≤ 25 each.
- **Risks / notes:** `autoFocus` on the name input must stay on the same element (tests focus it). Keep the `useForm` doc comment above `CreateWebsiteOnboarding`. If the count lands at 101-103, also lift the `<h3>Database</h3>` head into `DatabasePicker`'s caller as a `DatabaseSectionHead()` sub-component (3 lines saved) — do not restructure `DatabasePicker`.
