# C9-ui: `ui`'s own kit for its 7 `ui → ui-kit` lines (Q4 = no exception) — short sheet

> **Revision sections win. Never write a re-export, alias, `@deprecated` or forwarder.**
> **Sheet fix 2026-11-15:** C9-ui OWNS `packages/ui/package.json` in wave B (H1) and runs before C10. C10 does not touch that file; the coordinator adds C10's `"@jini-ai/protocol": "workspace:^"` dependency after C9-ui lands. The duplicate `SecretInput.tsx` `secretControlAttrs` row was removed from `C9-ui.repoint.tsv` (N2: C2-addendum owns it). Mount lists must also cover Jini `examples/reference-web` roots (`src/main.tsx`, `src/verify-mcpui-swap.tsx`, `e2e/*.tsx`) (N4).

Planning only. Jini `jini-terra-base` @ `2b59c1eae`. Written at the context cap; see CHECK items.

## The 7 lines
| File (blob) | Names |
|---|---|
| ui/src/features/admin-widgets/components/Select/Select.tsx:1 (7043cc36) | useOverlayContainer |
| ui/src/features/interactive-ui/providers/shadcn/select.tsx:8 (4da24f9b) | useOverlayContainer |
| ui/src/react/components/CustomSelect.tsx:14 (6ae950ee) | useOverlayContainer |
| ui/src/index.ts:154 (5e1b0263) | re-export useOverlayContainer |
| ui/src/react/components/SecretInput.hooks.ts:2 (83b76034) | re-export useSecretReveal, types SecretRevealRequired/Optional |
| ui/src/react/components/SecretInput.tsx:2 (5f7031c8) | SecretInput (ui-kit's) |
| ui/src/react/components/SecretInput.tsx:3 | secretControlAttrs |

## Decisions
1. `secretControlAttrs` is pure (strips `data-agent-*`, adds the privacy marker): agent-addressing vocabulary → **C2 addendum**: move to `@jini-ai/core/agent-handles` (ui-kit `attrs.ts` re-exports). Not a kit slot (it is called inside `useSecretToggle`, fine either way, but D2 rule (a) wins).
2. Everything else is a slot in **`packages/ui/src/react/kit.tsx`** (`@jini-ai/ui/react-kit` entry, browser), same pattern as C9a: `UiKit { components: { SecretInput }, hooks: { useOverlayContainer, useSecretReveal } }`, `UiKitProvider` (first kit wins), `useUiKit()` throwing a plain-words error, same-name facades.
3. ui's public re-exports keep their names: `ui/src/index.ts:154` and `SecretInput.hooks.ts` re-export the **facades** from `./react/kit.js`, so `@jini-ai/ui`'s API is unchanged, but those names now require `UiKitProvider`. chat and admin get these through their own kits, never through ui's.
4. **Behaviour change to state plainly:** today `useOverlayContainer` works with no provider at all (falls back to `document.body`). After this, every ui Select/CustomSelect/SecretInput needs `UiKitProvider`. Tovu mounts it at every React root that renders ui components: `apps/admin/src/main.tsx`, `apps/site-chat/src/main.tsx` (chat `QuestionForm` renders `SecretInput`), the desktop renderer root, and any `apps/website` React root (CHECK: `rg -ln "SecretInput|CustomSelect|admin-widgets|interactive-ui" apps/*/src`). The bound `useOverlayContainer` is ui-kit's own, which keeps the `document.body` fallback, so behaviour inside the provider is identical.

## `packages/ui/src/react/kit.tsx` (essentials)
```tsx
import { createContext, forwardRef, useContext, useState } from 'react';
import type { ComponentType, InputHTMLAttributes, ReactNode, Ref } from 'react';
export interface SecretRevealRequired { readonly value: unknown; readonly labels: { readonly show: string; readonly hide: string } }
export interface SecretRevealOptional { readonly revealed?: boolean; readonly onRevealedChange?: (revealed: boolean) => void }
export interface SecretReveal { readonly revealed: boolean; readonly inputType: 'password' | 'text'; readonly toggleLabel: string; toggle(): void } // CHECK: copy ui-kit useSecretReveal's real return shape
export interface KitSecretInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>, SecretRevealOptional {
  readonly label: string; readonly toggleLabels?: { readonly show: string; readonly hide: string };
  readonly toggleAttrs?: Readonly<Record<string, string | boolean | undefined>>; readonly ref?: Ref<HTMLInputElement>;
}
export interface UiKit {
  readonly components: { readonly SecretInput: ComponentType<KitSecretInputProps> };
  readonly hooks: {
    useOverlayContainer(required?: Record<string, never>, optional?: Record<string, never>): HTMLElement | null;
    useSecretReveal(required: SecretRevealRequired, optional?: SecretRevealOptional): SecretReveal;
  };
}
const UiKitContext = createContext<UiKit | null>(null);
export function UiKitProvider(required: { kit: UiKit; children: ReactNode }, _optional: Record<string, never> = {}) {
  const [kit] = useState(() => required.kit);
  return <UiKitContext.Provider value={kit}>{required.children}</UiKitContext.Provider>;
}
export function useUiKit(): UiKit {
  const kit = useContext(UiKitContext);
  if (!kit) throw new Error('@jini-ai/ui selects and secret inputs need <UiKitProvider kit={...}> at the app root. '
    + 'The host builds it from its component kit (Tovu: apps/<root>/src/integrations/jini-kits.ts).');
  return kit;
}
export const SecretInput = forwardRef<HTMLInputElement, KitSecretInputProps>(function UiKitSecretInput(props, ref) {
  const Impl = useUiKit().components.SecretInput;
  return <Impl {...props} ref={ref} />;
});
export const useOverlayContainer: UiKit['hooks']['useOverlayContainer'] = (r, o) => useUiKit().hooks.useOverlayContainer(r, o);
export const useSecretReveal: UiKit['hooks']['useSecretReveal'] = (r, o) => useUiKit().hooks.useSecretReveal(r, o);
```
Import-line changes (R5): the three Select files → `{ useOverlayContainer } from '<rel>/react/kit.js'`; `SecretInput.tsx` → `{ SecretInput as KitSecretInput } from './../kit.js'` path `../kit.js`... exact: `'../kit.js'` from `src/react/components/`; `secretControlAttrs` → `@jini-ai/core/agent-handles` (after C2 addendum); `SecretInput.hooks.ts` → `export { useSecretReveal, type SecretRevealRequired, type SecretRevealOptional } from '../kit.js';`; `index.ts:154` → `export { useOverlayContainer, UiKitProvider, type UiKit } from './react/kit.js';`. Then drop `@jini-ai/ui-kit` from ui's `dependencies`.

## Fake, binding, tests
- Fake `packages/ui/src/react/__tests__/fake-ui-kit.tsx`: `useOverlayContainer: () => document.body`, `useSecretReveal` = a `useState` toggle, `SecretInput` = `<input type="password" aria-label={p.label} />`; `renderWithUiKit`. ui's existing tests that render Select/SecretInput wrap with it (R5).
- Tovu `jini-kits.ts` (admin; same 6 lines in site-chat and desktop): `import { SecretInput, useOverlayContainer, useSecretReveal } from '@jini-ai/ui-kit/react'; export const uiKit = { components: { SecretInput }, hooks: { useOverlayContainer, useSecretReveal } } satisfies UiKit;` Coordinator mounts `<UiKitProvider kit={uiKit}>` outermost-but-inside `KitProvider` at each root.
- Test: missing provider throws; first kit kept; `SecretInput` facade forwards `ref`.

## STOP
Blob mismatch on any of the 7 files; `useSecretReveal`'s return shape differs from what `SecretInput.tsx`'s `useSecretToggle` reads (copy the real one); a Tovu root renders ui components and is missing from the mount list.

## Files, cost, unblocks
Jini: NEW `ui/src/react/kit.tsx`, `ui/src/react/__tests__/{fake-ui-kit.tsx,kit.unit.test.tsx}`, EDIT `ui/package.json` (`./react-kit` entry, browser). The 7 repoints + dropping the ui-kit dep belong to R5. Tovu: 3 small binding files; coordinator mounts. Cost ~30k Sonnet (as DESIGN Q4 estimated) + review in the C9 batch. Unblocks: R5's last ui-kit edge, which retires the last `ui → ui-kit` debt entry.

## No-shells revision (2026-11-15) — overrides decisions 1 and 3
1. `secretControlAttrs` moves per **`C2-addendum.md`** (ui-kit's definition and its `index.ts` re-export deleted; no ui-kit shell).
2. **No public re-exports of ui-kit names from ui.** Delete `ui/src/index.ts:154` (`useOverlayContainer`) and the `SecretInput.hooks.ts` re-export of `useSecretReveal`/types. ui's own code uses its kit facades from `./react/kit.js`; ui exports only what it defines (`UiKitProvider`, `type UiKit`, the `SecretInput` component it already exports). **Importers to repoint** (census `rg -n "useOverlayContainer|useSecretReveal|SecretRevealRequired|SecretRevealOptional" packages apps` over Jini + Tovu, excluding ui itself): run before landing; any hit outside ui imports from `@jini-ai/ui-kit/react` instead (hosts may; Jini packages use their own kit). CHECK left: none found in the earlier sheet's notes, not re-verified here (context cap).
3. **Repoint file:** `C9-ui.repoint.tsv` (7 rows, hand-built from the 7 lines; the relative depth for `admin-widgets/components/Select/Select.tsx` and `interactive-ui/providers/shadcn/select.tsx` is `../../../../react/kit.js` — executor confirms with `ls`). These are ui's own files: under the lane rule the wave pass applies them after C9-ui lands; R5 keeps only the test wraps.
4. **CHECK resolved partly:** `SecretReveal` return shape must be copied from ui-kit `useSecretReveal` (unchanged instruction). Mount list CHECK stays for the executor.

## sheets-fix3 (2026-11-15): re-census of the two deleted re-exports
`rg` over Jini `packages`/`examples` and Tovu `apps`/`packages` (Jini `465122282`, Tovu `311d5d7ae`) found 3 importers the TSV lacked; rows added to `C9-ui.repoint.tsv` (now 9 rows):
- `ui/src/react/components/SecretInput.tsx:7` `useSecretReveal` from `./SecretInput.hooks.js` → `../kit.js`.
- `ui/src/features/source-config-list/react/components/SourceConfigField.tsx:5` `useSecretReveal as useSecretInputReveal` from `../../../../react/components/SecretInput.hooks.js` → `../../../../react/kit.js`.
- **chat** `react/features/chat-pane/components/AgentRuntimePicker.tsx:5` `useOverlayContainer` from `@jini-ai/ui` → `@jini-ai/ui-kit/react` (chat already depends on `@jini-ai/ui-kit`, `package.json:250`; interim until C9b/R4 gives chat its own kit slot). This puts one chat file in C9-ui's pass; no other wave-B lane edits that file's line 5 (C2 row 58 edits its `@jini-ai/agentic` line, a different statement).
- `SecretInput.hooks.ts` holds only its comment after the DROP: delete the file (`git rm`).

## r2-sheets-b revision (2026-11-15; Codex review r2; wins over everything above)
1. **`ui/src/index.ts:154` re-exports ui's OWN facade** (row 5 repoints to `./react/kit.js`; coordinator adds `UiKitProvider, type UiKit` to that line). That is not a shell (the facade is defined in ui). The chat `AgentRuntimePicker.tsx` row is deleted: chat keeps its `@jini-ai/ui` import (no new injection-debt key); C9b moves it to the chat kit.
2. Row `SecretInput.hooks.ts` DROP deleted from the TSV (the lane deletes the file; a DROP on a missing file is STALE); `git rm` after B1 if it still exists.
3. Guards: the 7 files are TSV-applied, not hand-edited; blob mismatch is not a STOP (Select.tsx is already `006d6240`). Content check in `../followups/C9-ui.md` A1.
4. Fake `SecretInput` forwards `ref`. Test wrappers land with wave B (ui + chat `ui-kit-render-support.tsx`, real ui-kit bound test-only). Examples' roots mount `UiKitProvider`.
5. **Known latent gap:** chat `embed-widget/react/embed.tsx` (`mountEmbedChat`, no callers in Tovu/examples) renders ChatPane, whose runtime picker and QuestionForm now need `UiKitProvider`; mounting one there would add a chat→ui debt key (gate forbids growth). C9b fixes it via the chat kit. Steps: **`../followups/C9-ui.md`**.
