# C2 addendum: `secretControlAttrs` into `@jini-ai/core/agent-handles` (no shells) — needed by C9-ui

Planning only, 2026-11-15. Not part of `C2.md` (another agent owns it); runs after C2 lands (`packages/core/src/agent-handles/index.ts` exists). Executor: Sonnet, Jini only, ~10k.

- **Move:** `secretControlAttrs` (`packages/ui-kit/src/attrs.ts:8–19`, doc comment + body verbatim) → NEW `packages/core/src/agent-handles/secret-attrs.ts`; add `export { secretControlAttrs } from './secret-attrs.js';` to C2's `core/src/agent-handles/index.ts`. Pure (no DOM, no state): it strips `data-agent-*` props and adds the `data-agent-private` marker, which is agent-addressing vocabulary next to `AGENT_PRIVATE_ATTRIBUTE`. If C2's `element-handles.ts` exports `AGENT_PRIVATE_ATTRIBUTE = 'data-agent-private'`, use it in the return literal's key only if the inferred return type stays `{ 'data-agent-private': '' }` (else keep the literal; say so in the commit).
- **Delete:** the declaration in `ui-kit/src/attrs.ts` (`KitAttrs`, `AgentSpec`, `AgentAttrsPort` stay); the `ui-kit/src/index.ts:4` re-export (shell).
- **Repoint** (`C2-addendum.repoint.tsv`, 6 Jini files, 0 Tovu): ui-kit `react/SecretInput.tsx`, `react/agent-attrs.hooks.ts`, `react/native/Controls.hooks.ts` (ui-kit → core is a base edge), and ui `react/components/SecretInput.tsx:3` (removes one of ui's 7 `ui → ui-kit` lines, so C9-ui's kit no longer needs it).
- **Tests:** `ui-kit/src/attrs.test.ts` (2 cases, both this function) moves to `core/src/agent-handles/__tests__/secret-attrs.test.ts`.
- **Gate:** core purity rule passes on the new file; no `@jini-ai/ui-kit` import remains for this name.

## r2-sheets-b revision (2026-11-15; Codex review r2; wins over everything above)
- ui-kit gains `"dependencies": { "@jini-ai/core": "workspace:^" }` (3 runtime imports of `@jini-ai/core/agent-handles`); coordinator updates the lockfile. Applied by `../followups/C2.md` A1.
