You are performing a rigorous code audit as an external reviewer. Answer directly; do not perform any startup ceremony.

DO NOT READ `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, or any `AI-Dev-Shop/` or `ADS-memory/` file. They are irrelevant to this task and expensive. If you open one by reflex, stop and move on.

## Repo
`/Users/la/Programming/Jini` — a TypeScript monorepo ("Jini") providing an agent/chat engine and settings UI consumed by host applications. Branch `feat/settings-execution-canary`.

## What you are auditing and why

This is the FOURTH batch. Batches 1–3 covered chat persistence, the connectors/memory React trees, the provider connection test, the source-config-list feature, and the host's settings domain.

**This batch is `packages/ui-core/src/features/` in its entirety — 61 files, ~5,700 lines, across 13 feature domains.** `ui-core` is the **framework-free logic layer**: `rules.ts` (validation and state transitions), `ports.ts` (the interfaces host apps must implement), `types.ts`, `constants.ts`, `dependencies.ts`, and `index.ts` barrels. The React components in `packages/ui/src/features/` bind to it, and host applications implement its ports.

Two properties make this layer disproportionately worth auditing:

- **The `rules.ts` files are frequently the ONLY validation.** A React component calls a rule, gets `{ ok: true }`, and proceeds. If a rule accepts something it should reject — a URL, a credential shape, a filesystem path, a state transition — nothing downstream re-checks it. Judge each rule as if it is the last line of defence, because it usually is.
- **`ports.ts` defines what host apps must implement.** A port whose contract is ambiguous, or whose required security property is documented in prose rather than enforced by its types, becomes a per-host bug.

Assume nobody has looked hard at any of it.

Read each file in full. The 13 domains, under `packages/ui-core/src/features/`:

```
about/            {index,rules,types}.ts
appearance/       {constants,index,rules,types}.ts
connectors/       {constants,index,ports,rules,types}.ts
execution/        {constants,dependencies,index,ports,rules,types}.ts
integrations/     {constants,dependencies,index,ports,rules,types}.ts
language/         {index,types}.ts
media-providers/  {dependencies,index,ports,rules,types}.ts
memory/           {async-commit-guard,constants,formatters,index,ports,rules,types}.ts
notifications/    {constants,index,rules,types}.ts
privacy/          {index,rules,types}.ts
project-locations/{dependencies,index,ports,rules,types}.ts
skills/           {dependencies,index,ports,rules,types}.ts
source-config-list/{constants,dependencies,index,ports,rules,types}.ts
```

Read surrounding/imported files freely to judge correctness — in particular the React consumers under `packages/ui/src/features/<same-domain>/` to see whether a rule's result is actually respected — but FINDINGS must be about the files above.

## What matters most, in priority order

1. **Validation rules that are the sole guard.** For every `rules.ts` that validates a URL, endpoint, host, filesystem path, command, or credential: find the input it wrongly ACCEPTS. Concretely — does a base-URL or endpoint rule permit `file:`, `data:`, `javascript:`, a userinfo-embedded host (`https://evil.com@internal/`), a link-local or loopback address (`169.254.169.254`, `127.0.0.1`, `[::1]`, `0.0.0.0`), a DNS name that resolves there, or a redirect-capable URL? `connectors`, `media-providers`, `integrations`, `source-config-list`, and `execution` are the likely candidates. A sibling audit already confirmed a real SSRF-via-redirect in this repo's `agent-runtime` connection test, so treat permissive URL acceptance here as high severity, not theoretical.

2. **Path and command handling in `execution` and `project-locations`.** `execution/rules.ts` (507 lines) is the largest file here and governs how a locally-installed CLI agent is selected and configured; `project-locations` governs filesystem locations. Look for path traversal, acceptance of relative or symlinked paths where absolute-and-resolved is required, shell metacharacters surviving validation, and any value a rule blesses that could reach a spawn argument or env var in a host app.

3. **Secret handling in `memory/formatters.ts` and every `constants.ts`.** `formatters.ts` (366 lines) turns structured data into display strings. Verify no formatter can render a credential, token, or connection string into output — check the *fallback* and *unknown-shape* branches specifically, since those are where redaction is usually forgotten. In `constants.ts` files, look for any hardcoded token, key, default password, or production endpoint.

4. **`memory/async-commit-guard.ts` — concurrency correctness.** Read this one with particular care; its name states its purpose. Determine exactly what it guarantees, then find the interleaving that breaks it: concurrent commits, a commit racing a reset/cancel, a rejected promise leaving the guard permanently latched (so every later commit is refused), a guard that never releases on the throw path, or reentrancy from a synchronous callback.

5. **State-transition rules.** Across domains, `rules.ts` files encode which transitions are legal (connect/disconnect, enable/disable, test/save, consent granted/revoked). Look for transitions that lose data, that can be driven into an unreachable or stuck state, that silently coerce an invalid value to a valid-looking default, or that treat an *unknown* enum member as permitted rather than refused. Unknown-value-defaults-to-allowed is a real finding; report it.

6. **`privacy/rules.ts` specifically.** This governs a consent record. Verify consent cannot be inferred, defaulted-to-granted, or silently carried across a change of scope or principal, and that revocation is total rather than partial.

7. **Public API surface and contract drift.** The `index.ts` barrels and `ports.ts` files define what host apps import and implement. Look for: accidental exports of internals; missing exports of types needed to *use* an exported function; a port whose implementer could satisfy the types while violating a security property stated only in a comment; and any place `types.ts` and `rules.ts` disagree about what a value can be (an optional field the rules treat as required, a union member no rule handles).

8. **Mutation of caller-owned data.** This is a pure layer consumed by React. A rule or formatter that mutates its argument rather than returning a new value causes stale renders and cross-component corruption in the consumer. Report only where a concrete consumer is actually affected.

## Caveats that will otherwise waste your time
- The working tree has UNCOMMITTED modifications in this repo (`packages/ui/src/react/chat/components/MessageRow.tsx`, `packages/chat-core/src/persistence/title.ts`, `packages/sqlite/src/db/chat-history/store.ts`, `packages/ui/src/features/i18n/context.tsx`, `packages/ui/src/react/chat/components/ConversationList.tsx`, plus new files under `packages/ui/src/react/chat/`). None are in your list. Audit what is on disk; do not report uncommitted state as a defect.
- `project-locations` is **not mounted by the current host application** — it ships as library code for a different consumer. Audit it as a library, and do not report "unused" or "not wired up".
- Do NOT report missing or incomplete CSS — this layer emits none, and styling is separately tracked.
- Several files carry long explanatory header comments recording prior decisions. They are evidence of intent, not proof of correctness — verify the code matches the comment, and **report it as a finding when it does not**.
- Do not report: formatting, naming preferences, "add a comment", "extract a helper", "this should be a shared constant", test-coverage gaps as such, or anything you cannot tie to a concrete failure.
- 61 files is a lot. If you must triage, weight by priority order above — `execution`, `connectors`, `memory`, `media-providers`, `source-config-list`, `integrations`, and `privacy` carry nearly all the risk; `about`, `language`, `appearance`, and `notifications` carry least. Say explicitly what you triaged away.

## Output format — strict

Return ONLY findings, most severe first. For each:

**[SEVERITY: CRITICAL | HIGH | MEDIUM | LOW] Short title**
- **File:** `path:line`
- **What is wrong:** one or two sentences.
- **Failure scenario:** concrete inputs or event sequence → the actual bad outcome. If you cannot write this, do not report the finding.
- **Fix:** the specific change.

End with `## Assessed and found clean` listing which of the eight priority areas you checked and believe are sound, and which domains (if any) you triaged away unread, so absence of a finding is distinguishable from not having looked.

Do not pad. A short correct report beats a long speculative one. Do not report anything you have not verified by reading the actual code path.
