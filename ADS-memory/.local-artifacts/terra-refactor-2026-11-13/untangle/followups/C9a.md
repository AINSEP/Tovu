# Follow-up: C9a (apply on top of `wave-b/C9a`; section B after pass B1 and after `followups/C9-ui.md` §A)

Source: Codex review r2 (`4-c8-c9-c10.md`, `6-lanes.md`), judged by r2-sheets-b 2026-11-15.
**Decision (coordinator dispatch 2026-11-15): the test wrappers land with wave B, in the same landing batch as the kit repoints, not in R1/R5.**
This is the wave-B form of that decision. Package tests keep rendering the REAL ui/ui-kit implementations through a test-only kit binding, so existing markup assertions keep passing. Cross-package imports in tests are advisory only (`scripts/injection-test-debt.json`, owner Q5). Moving tests onto plain fakes stays R1 work.
Tests: named files only, `--maxWorkers=2`; full package runs only in the wave-B cloud gate. Leave no test process running. Commit with `git commit -F msg -- <paths>`.

## A. On the C9a branch

### A1. Fakes forward refs (kit.unit.test case 3 needs it)
`packages/admin/src/react/__tests__/fake-admin-kit.tsx`: write the `Button` and `IconButton` fakes as `forwardRef<HTMLButtonElement, …>((p, ref) => <button ref={ref} … />)`, which React 18 needs for a function component to receive `ref`. Give them `displayName` `'FakeButton'` / `'FakeIconButton'`. Do the same for every fake whose real slot is a `forwardRef` component: check with `rg -n "forwardRef" packages/ui-kit/src/react/*.tsx` for the slot names `TextField`, `TextArea`, `Select`, `Switch`; each such fake forwards `ref` to its native element.
Red first: run `packages/admin/src/react/__tests__/kit.unit.test.tsx` before the change. Case 3 ("forwards props and ref") fails with `ref.current === null`. After the change it passes.

### A2. Tovu `apps/admin/src/integrations/jini-kits.ts` has two writers (C9a and C9-ui)
C9a lands first. C9-ui's `uiKit` block is merged into the same file by `followups/C9-ui.md` §A2. If the landing merge conflicts on this file, take C9a's file whole, then apply §A2.

## B. After pass B1 (C9a's 85 scripted rows applied: admin components now read the kit)

### B1. NEW `packages/admin/src/__tests__/kit-render-support.tsx` (test-only real kits)
```tsx
/** TEST-ONLY: admin screens rendered with the REAL ui/ui-kit implementations, bound the way Tovu binds them
 *  (apps/admin/src/integrations/jini-kits.ts), so package tests keep asserting real markup. Moving tests onto
 *  plain fakes (fake-admin-kit.tsx) is R1's job (owner Q5). Never used by kit.unit.test.tsx (it tests the missing provider). */
import { createElement, type ComponentType, type ReactNode } from 'react';
import { render as renderOriginal, renderHook as renderHookOriginal, type RenderOptions } from '@testing-library/react';
// <the import block of apps/admin/src/integrations/jini-kits.ts, verbatim, with `type AdminKit` from '../react/kit.js'>
import { UiKitProvider, type UiKit } from '@jini-ai/ui/react-kit';
import { SecretInput, useOverlayContainer, useSecretReveal } from '@jini-ai/ui-kit/react';
import { AdminKitProvider } from '../react/kit.js';
export * from '@testing-library/react';

export const testAdminKit = { /* the object literal of jini-kits.ts `adminKit`, verbatim */ } satisfies AdminKit;
export const testUiKit = { components: { SecretInput }, hooks: { useOverlayContainer, useSecretReveal } } satisfies UiKit;

export function JiniTestKits({ children }: { children: ReactNode }) {
  return createElement(UiKitProvider, { kit: testUiKit, children: createElement(AdminKitProvider, { kit: testAdminKit, children }) });
}
function scope(wrapper?: ComponentType<{ children: ReactNode }>) {
  return function KitScope({ children }: { children: ReactNode }) {
    return createElement(JiniTestKits, { children: wrapper ? createElement(wrapper, { children }) : children });
  };
}
export const render = ((ui: ReactNode, options?: RenderOptions) => renderOriginal(ui, { ...options, wrapper: scope(options?.wrapper) })) as typeof renderOriginal;
export const renderHook: typeof renderHookOriginal = (callback, options) => renderHookOriginal(callback, { ...options, wrapper: scope(options?.wrapper) });
```
Copy the `adminKit` body from the Tovu file exactly as C9a landed it. If `UiKitProvider`'s signature is `(required, optional)` rather than props, use `createElement(UiKitProvider, { kit, children })` as shown: React passes props as the first argument.

### B2. `packages/admin/src/__tests__/fetch-query-support.ts`: the shared wrapper gains the kits
In `scope()`, wrap inside `FetchQueryProvider`:
`createElement(FetchQueryProvider, { children: createElement(JiniTestKits, { children: wrapper ? createElement(wrapper, { children }) : children }) })`,
with `import { JiniTestKits } from './kit-render-support.js';`. The 25 files that use this helper are covered.

### B3. Wrap exactly the tests that need it (red first, from the wave-B cloud run)
1. In the wave-B cloud gate, run `pnpm --filter @jini-ai/admin exec vitest run --maxWorkers=2`.
2. List the test files with a failure whose message contains `need <AdminKitProvider kit={...}>` or `need <UiKitProvider kit={...}>` (the facades' missing-provider errors).
3. For each listed file, never `react/__tests__/kit.unit.test.tsx`:
   - if it imports from `'@testing-library/react'`, change that specifier to the relative path of `src/__tests__/kit-render-support.js`, keeping the names;
   - if it imports `render` from `fetch-query-support`, it is already covered, so STOP and report the file: the failure is something else;
   - if it builds its own provider tree (the 33 MANUAL `FetchQueryProvider` rows in `C9a.repoint.tsv`, e.g. `fqfix-loading.unit.test.tsx`), the specifier switch is still right, because the kits are the outermost wrapper. Keep its own `FetchQueryProvider` import from `@jini-ai/ui/fetch-query` unchanged. Those MANUAL rows are otherwise left for R1.
4. Re-run the listed files. Every one passes, or the run reports the remaining non-provider failures plainly.
The 45 MANUAL rows stay R1 work except where step 3 touches them. Production MANUAL rows (theme hand edits 1–2, media rules hand edit 3) keep their direct ui imports in wave B. That changes no behaviour; the debt keys stay until R1.

### B4. Tovu admin tests
1. NEW `apps/admin/src/__tests__/render-with-jini-kits.tsx`: the same shape as B1, but importing Tovu's real bindings (`adminKit` and `uiKit` from `../integrations/jini-kits`) and wrapping `KitProvider` (Tovu's `tovuKit`/`tovuAgentAttrs` as in `main.tsx`) > `FetchQueryProvider` (`../lib/fetch-query/provider`) > `UiKitProvider` > `AdminKitProvider`. Re-export `@testing-library/react` with wrapped `render`/`renderHook`.
2. Run the Tovu admin suite in the wave-B cloud run. For each test file failing with either missing-provider message, change its `'@testing-library/react'` specifier to the relative path of `src/__tests__/render-with-jini-kits`. If the file already mounts `FetchQueryProvider` or `KitProvider` itself, keep them: inner providers win.
3. Re-run the listed files.

## C. Sheet text fixed (R1 reads it)
`C9a.md` hand edit 3 now imports `type AdminMediaProvidersKit` from `'../../../react/kit-media-providers.js'`, the module that declares it. `kit.tsx` does not re-export it.
