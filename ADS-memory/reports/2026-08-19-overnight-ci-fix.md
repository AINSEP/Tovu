# Overnight CI fix — general-work, 2026-08-19

Scope: get CI green on `general-work` after the CommonJS → native ESM migration
(SPEC-049). Work done unattended, per the Cloud Dispatch standing rules in
this repo's root `AGENTS.md`. Restricted paths (owned by a concurrent
session, not touched): `apps/admin/**`, `src/themes/static/**`,
`src/features/theme/**`.

Environment setup (per `AGENTS.md` Cloud Dispatch rule #1): Node 24 via nvm;
Jini cloned fresh as a true sibling at `../Jini` on the matching `general-work`
branch, `pnpm install --frozen-lockfile && pnpm -r run build` — the same
sequence CI's `ci.yml` uses, to get a same-shape reproduction of CI's
freshly-built Jini `dist/` rather than whatever was locally lying around.

Status legend: ✅ fixed & verified · ⬜ not yet reached · 🟡 pre-existing, reported only.

## ✅ Typecheck (root) — FIXED (commit `39b4b640`)

**Symptom:** CI's `Typecheck (root)` step failed; local `npm run typecheck`
passed. Task brief flagged this as "the most informative failure" and asked
to solve the discrepancy first.

**Reproduction:** built Jini fresh exactly as CI does (see Environment setup
above), then ran `npm run typecheck` against it. Failure reproduced
immediately:

```
src/assistant/mcp-ui-sandbox-proxy-route.ts(1,10): error TS2305: Module
'"@jini-ai/ui/mcp-ui/surfaces"' has no exported member 'SANDBOX_PROXY_HTML'.
```

**Root cause:** `SANDBOX_PROXY_HTML` never existed in Jini — `git log --all
--source -S SANDBOX_PROXY_HTML` across every branch of `AINSEP/Jini` returns
zero commits. `src/assistant/mcp-ui-sandbox-proxy-route.ts` predates the ESM
migration entirely (added in `1c49c082`, "AI-driven whiteboard rendering on
Studio Playground" — the commit immediately before migration Phase 0 began).
It was written against a speculative design: serve a same-origin "sandbox
proxy" HTML page so the real `@mcp-ui/client` `AppRenderer` could point an
iframe's `src` at it. Jini's actual, shipped MCP-UI hosting
(`useMcpUiHost`/`McpUiHost` in `packages/ui/src/react/mcp-ui/`) took a
different, simpler approach instead: a surface is a self-contained HTML
*string*, rendered via iframe `srcdoc` under `sandbox="allow-scripts"` — no
separate origin, no proxy route, no `@mcp-ui/client` dependency at all (Jini
has no such dependency in any package.json). That design choice is documented
in `useMcpUiHost.ts`'s own module doc. So the export this file imported was
never implemented, and per Jini's real architecture, isn't needed.

**Why CI caught it and local didn't:** this is the *first* time this
workflow has ever successfully reached the Jini-build step and run typecheck
against a truly fresh Jini `dist/` for `general-work` (see `ci.yml`'s own
header history — the sibling-checkout mechanism was only fixed 2026-08-17).
Locally, whatever Jini `dist/` happened to be checked out/built previously
apparently predated this file's introduction, or was never rebuilt after it
landed, so the missing export was never exercised.

**Fix:** deleted the dead route (`src/assistant/mcp-ui-sandbox-proxy-route.ts`)
and its one registration call in `src/server/modules/assistant.ts`
(`registerMcpUiSandboxProxyRoute(app)` + its import). Root `tsconfig.json`
excludes `apps`, so this fix is fully contained to server-side dead code —
no need to touch `apps/admin`.

**Not fixed here, reported instead (restricted path):**
`apps/admin/src/components/AssistantDock/AssistantDock.tsx` passes a
`sandboxProxyUrl` property into `registerMcpUiSurfaceRenderer(...)` — that
options type in Jini (`packages/chat/src/react/components/McpUiSurfaceCard.tsx`)
is `{ onToolCall?, onOpenLink?, name?, maxHeight? }` and has **never** had a
`sandboxProxyUrl` field. This is the same pre-existing, pre-migration bug,
on the other side of the same (never-real) contract. It doesn't block root
CI (root typecheck excludes `apps/`), but it will very likely surface in the
`Typecheck (admin)` step later in this same workflow. `apps/admin/**` is a
path this task must not touch (owned by a concurrent session) — flagging
here rather than fixing.

**Evidence:**
```
$ npm run typecheck
> tovu@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit && npm run typecheck:e2e

> tovu@0.1.0 typecheck:e2e
> tsc -p development/tsconfig.e2e.json --noEmit
(clean exit, no output)
```
Run against Jini `general-work` @ `c38ce9e6` built fresh via
`pnpm install --frozen-lockfile && pnpm -r run build`.

---

## Remaining gates (in task order)

⬜ `npm test`
⬜ `check:boundaries`
⬜ `check:architecture`
⬜ `check:inventory`
⬜ `check:src-complexity-drift`
⬜ `lint`
⬜ `complexity` (ESLint)
⬜ admin typecheck + build (not owned by this task; watch for the
  `sandboxProxyUrl` fallout noted above)
⬜ `route-coverage` floor/diff/baseline checks

## 🟡 Known pre-existing failures (not from this migration, per task brief — not chased, reported only)

- `lint`: `Function 'useAccessTokens' has a complexity of 10. Maximum allowed
  is 9` in `apps/admin` (restricted path in any case).
- `check:architecture`: module API surface metric regression 201 → 202,
  predates this work.
- `src/core/embeds/__tests__/marker.canary.test.ts` breaks on a missing
  fixture `src/themes/static/basic/pages/blog-sidebar-template.html`,
  absent from HEAD; fallout from a concurrent session's in-flight theme
  reorganization (`src/themes/static/**` is restricted).

This report is updated as each gate is worked, not only at the end.
