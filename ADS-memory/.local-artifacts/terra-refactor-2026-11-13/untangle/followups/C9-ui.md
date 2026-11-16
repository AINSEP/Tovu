# Follow-up: C9-ui (apply on top of `wave-b/C9-ui` after C9a has landed; section B after pass B1)

Source: Codex review r2 (`4-c8-c9-c10.md`, `6-lanes.md`), judged by r2-sheets-b 2026-11-15. Same wrapper decision as `followups/C9a.md`: test wrappers land with wave B, using real implementations bound test-only.
Tests: named files only, `--maxWorkers=2`; package runs only in the wave-B cloud gate. Leave no test process running. Commit with `git commit -F msg -- <paths>`.

## A. On the C9-ui branch

### A1. Stale guard (C9-ui.md "STOP: blob mismatch on any of the 7 files")
At Jini `b7666092e`, `Select.tsx` is already `006d6240`, not `7043cc36`. C2 and C2-addendum also rewrite `SecretInput.tsx` (and the `CustomSelect`/`Select` lines) in B0, before C9-ui. The lane hand-edits none of these 7 files (they are TSV rows), so a blob mismatch there is not a reason to STOP. If the lane STOPped on it, resume with this content check instead:
`rg -n "useOverlayContainer" packages/ui/src/features/admin-widgets/components/Select/Select.tsx packages/ui/src/features/interactive-ui/providers/shadcn/select.tsx packages/ui/src/react/components/CustomSelect.tsx`
It must print exactly one import line per file, each from `'@jini-ai/ui-kit/react'`.

### A2. Tovu `apps/admin/src/integrations/jini-kits.ts` (second writer after C9a)
Merge C9-ui's binding into C9a's file. Do not replace the file:
- add to the existing `@jini-ai/ui-kit/react` import: `SecretInput as KitSecretInput, useOverlayContainer, useSecretReveal`. The alias keeps it apart from ui's own `SecretInput` component.
- add `import type { UiKit } from '@jini-ai/ui/react-kit';`
- append `export const uiKit = { components: { SecretInput: KitSecretInput }, hooks: { useOverlayContainer, useSecretReveal } } satisfies UiKit;`
`apps/site-chat/src/jini-kits.ts` and `apps/desktop/src/renderer/jini-kits.ts` hold only the `uiKit` lines (with their own imports).

### A3. Fake forwards ref (kit.unit.test "SecretInput facade forwards ref")
`packages/ui/src/react/__tests__/fake-ui-kit.tsx`: `SecretInput` fake = `forwardRef<HTMLInputElement, …>((p, ref) => <input ref={ref} type="password" aria-label={p.label} />)`, with `displayName = 'FakeSecretInput'`. Red first: the ref case fails with `ref.current === null` before the change.

### A4. Coordinator line in `packages/ui/src/index.ts` (changed by r2-sheets-b)
`C9-ui.repoint.tsv` row 5 now REPOINTS `export { useOverlayContainer } from '@jini-ai/ui-kit/react'` to `'./react/kit.js'`. That is ui's own facade, not a ui-kit shell. The coordinator adds `UiKitProvider, type UiKit` to that same line:
`export { useOverlayContainer, UiKitProvider, type UiKit } from './react/kit.js';`
The former row 9 (chat `AgentRuntimePicker.tsx` → `@jini-ai/ui-kit/react`) is deleted. Chat keeps its existing `@jini-ai/ui` import, so no new injection-debt key is created. C9b later moves it to chat's kit.

## B. After pass B1 (C9-ui rows applied)

### B1. Delete the emptied shell file
If `packages/ui/src/react/components/SecretInput.hooks.ts` still exists, `git rm -q -- packages/ui/src/react/components/SecretInput.hooks.ts`. The former row 6 was removed from the TSV because the lane may already have deleted the file, and a DROP on a missing file is STALE. Check: `rg -n "SecretInput\.hooks" packages examples` prints nothing.

### B2. Test-only real ui kit, in ui and in chat
NEW `packages/ui/src/__tests__/ui-kit-render-support.tsx` and NEW `packages/chat/src/react/__tests__/ui-kit-render-support.tsx`, both the same shape:
```tsx
/** TEST-ONLY: renders with the REAL ui-kit implementations bound into ui's kit, as Tovu binds them
 *  (apps/admin/src/integrations/jini-kits.ts `uiKit`). Moving tests to fake-ui-kit.tsx is R5's job. */
import { createElement, type ComponentType, type ReactNode } from 'react';
import { render as renderOriginal, renderHook as renderHookOriginal, type RenderOptions } from '@testing-library/react';
import { SecretInput, useOverlayContainer, useSecretReveal } from '@jini-ai/ui-kit/react';
import { UiKitProvider, type UiKit } from '<ui: '../react/kit.js' | chat: '@jini-ai/ui/react-kit'>';
export * from '@testing-library/react';
export const testUiKit = { components: { SecretInput }, hooks: { useOverlayContainer, useSecretReveal } } satisfies UiKit;
function scope(wrapper?: ComponentType<{ children: ReactNode }>) {
  return function UiKitScope({ children }: { children: ReactNode }) {
    return createElement(UiKitProvider, { kit: testUiKit, children: wrapper ? createElement(wrapper, { children }) : children });
  };
}
export const render = ((ui: ReactNode, options?: RenderOptions) => renderOriginal(ui, { ...options, wrapper: scope(options?.wrapper) })) as typeof renderOriginal;
export const renderHook: typeof renderHookOriginal = (callback, options) => renderHookOriginal(callback, { ...options, wrapper: scope(options?.wrapper) });
```

### B3. Wrap exactly the failing tests (red first, from the wave-B cloud run)
1. In the wave-B cloud gate, run the `@jini-ai/ui` and `@jini-ai/chat` suites (`vitest run --maxWorkers=2`), and the Jini `examples/reference-web` tests if it has any.
2. For each test file failing with `need <UiKitProvider kit={...}>`, except `packages/ui/src/react/__tests__/kit.unit.test.tsx`: change its `'@testing-library/react'` specifier to the relative path of its package's `ui-kit-render-support.js`. If it imports `render` from another local helper, add the `UiKitProvider` wrap to that helper's wrapper instead and list the helper in the report.
3. Re-run the listed files.
4. Tovu: `apps/admin/src/__tests__/render-with-jini-kits.tsx` (`followups/C9a.md` B4) already includes `UiKitProvider`. Tovu site-chat and desktop have no RTL tests.

### B4. Production React roots that render ui selects or secret inputs
- Tovu `apps/admin/src/main.tsx`, `apps/site-chat/src/main.tsx` and `apps/desktop/src/renderer/main.tsx`: the coordinator mounts `<UiKitProvider kit={uiKit}>` (C9-ui sheet).
- Jini `examples/reference-web` roots (`src/main.tsx`, `src/verify-mcpui-swap.tsx`, `e2e/*.tsx`): mount `<UiKitProvider kit={uiKit}>` with an example-local `uiKit` built from `@jini-ai/ui-kit/react`, as in A2. Examples are hosts.
- **Known latent gap, not fixed in wave B:** `packages/chat/src/embed-widget/react/embed.tsx` (`mountEmbedChat`, a published Jini root) renders `ChatPane`. Its runtime picker (`SearchableModelSelect` → `CustomSelect`) and `QuestionForm` (ui `SecretInput`) now need `UiKitProvider`. No Tovu or example code calls `mountEmbedChat` (rg-checked). Mounting a provider there would add a new chat→ui injection-debt key, and the gate forbids debt growth. C9b (chat kit) fixes it by taking the kit in `EmbedChatWidgetArgs`. Until then, if `embed-widget/react/__tests__/embed.test.tsx` fails in the wave-B run with the UiKitProvider message, wrap that test per B3 and report it.
