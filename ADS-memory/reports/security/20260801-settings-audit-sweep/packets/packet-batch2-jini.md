You are performing a rigorous code audit as an external reviewer. Answer directly; do not perform any startup ceremony.

DO NOT READ `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, or any `AI-Dev-Shop/` or `ADS-memory/` file. They are irrelevant to this task and expensive. If you open one by reflex, stop and move on.

## Repo
`/Users/la/Programming/Jini` — a TypeScript monorepo ("Jini") providing an agent/chat engine consumed by host applications. Branch `feat/settings-execution-canary`. Packages under `packages/*`: `chat-core`, `sqlite`, `ui`, `ui-core`, `agent-runtime`.

## What you are auditing and why
These 13 files are the SECOND batch of least-recently-revisited code on this branch. Batch 1 covered the chat-persistence layer, the connectors/memory feature trees, and the provider connection test. This batch is the **source-config-list feature** (a generic add/edit/test list for user-supplied service configurations), plus three shared UI primitives. They ship to host applications as a library. Assume nobody has looked hard at them.

Read each file in full:

```
packages/ui/src/features/source-config-list/index.ts
packages/ui/src/features/source-config-list/react/components/SourceConfigAddForm.tsx
packages/ui/src/features/source-config-list/react/components/SourceConfigField.tsx
packages/ui/src/features/source-config-list/react/components/SourceConfigItemCard.tsx
packages/ui/src/features/source-config-list/react/components/SourceConfigList.tsx
packages/ui/src/features/source-config-list/react/components/SourceConfigListView.tsx
packages/ui/src/features/source-config-list/react/components/SourceConfigTestControl.tsx
packages/ui/src/features/source-config-list/react/hooks/useSourceConfigAddForm.ts
packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts
packages/ui/src/react/components/Icon.tsx
packages/ui/src/react/components/LanguageMenu.tsx
packages/ui/src/utils/index.ts
packages/ui/src/utils/notifications.ts
```

Read surrounding/imported files freely to judge correctness — in particular `packages/ui-core/src/features/source-config-list/*` (the pure rules/ports layer these components bind to) — but FINDINGS must be about the files above.

## What matters most, in priority order

1. **Credential handling in the config list.** `SourceConfigField.tsx` and `SourceConfigAddForm.tsx` render and collect user-supplied secrets (API keys, tokens) for third-party services, and `SourceConfigTestControl.tsx` triggers a live connection probe with them. Verify a secret cannot end up in: rendered error text, a `title`/`aria-label`/`data-*` attribute, a thrown exception message, component state that outlives the form, or anything logged. A sibling audit already found a real case where a non-error 2xx response path returned an unredacted key, so check the test-control result path specifically.

2. **Async/React correctness in the two hooks.** `useSourceConfigList` and `useSourceConfigAddForm` do async work with local state. Look for: state set after unmount, missing cleanup/abort, stale-closure reads, races where a slower earlier request overwrites a faster later one (particularly the test-connection flow, where results must not be attributed to the wrong item), unstable dependency arrays causing effect loops, and unhandled promise rejections. Report only where a concrete user-visible failure follows.

3. **Test-result attribution and stale state.** `SourceConfigTestControl` shows per-item pass/fail. Verify a result cannot be rendered against a different item than the one tested, and cannot survive an edit that invalidates it — a stale green "connection OK" on a config whose URL or key has since changed is a real finding.

4. **Unsafe rendering.** `Icon.tsx` and the list components render caller-supplied names/labels/URLs. Look for `dangerouslySetInnerHTML`, inline SVG built from a string, `href`/`src` derived from user content (a `javascript:` URL is a real finding), and any icon-name value reaching a DOM API or a dynamic import path unchecked.

5. **`utils/notifications.ts` and `utils/index.ts`.** These are shared helpers on the public surface. Check for: mutation of caller-owned objects, unbounded growth (arrays/maps that accumulate and are never pruned), timers/listeners registered without a disposal path, and any helper whose failure is swallowed silently.

6. **Public API surface.** `features/source-config-list/index.ts` and `utils/index.ts` are barrels defining what host apps can import. Look for accidental exports of internals, missing exports of types needed to *use* an exported function, and breaking-change hazards.

## Caveats that will otherwise waste your time
- The working tree has UNCOMMITTED modifications in this repo (notably `packages/ui/src/react/chat/components/MessageRow.tsx`, `packages/chat-core/src/persistence/title.ts`, `packages/sqlite/src/db/chat-history/store.ts`, `packages/ui/src/features/i18n/context.tsx`, `packages/ui/src/react/chat/components/ConversationList.tsx`). None of those are in your list. Audit what is on disk; do not report uncommitted state as a defect.
- These components may have NO CSS defined for the classnames they emit. This is already known and separately tracked. Do NOT report missing or incomplete styles — it is not your finding to make.
- Do not report: formatting, naming preferences, "add a comment", "extract a helper", test-coverage gaps as such, or anything you cannot tie to a concrete failure.

## Output format — strict

Return ONLY findings, most severe first. For each:

**[SEVERITY: CRITICAL | HIGH | MEDIUM | LOW] Short title**
- **File:** `path:line`
- **What is wrong:** one or two sentences.
- **Failure scenario:** concrete inputs or event sequence → the actual bad outcome. If you cannot write this, do not report the finding.
- **Fix:** the specific change.

End with `## Assessed and found clean` listing which of the six priority areas you checked and believe are sound, so absence of a finding is distinguishable from not having looked.

If you find nothing at a given severity, say so. Do not pad. A short correct report beats a long speculative one. Do not report anything you have not verified by reading the actual code path.
