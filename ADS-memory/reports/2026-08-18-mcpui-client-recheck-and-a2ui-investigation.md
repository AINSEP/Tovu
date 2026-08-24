# MCP-UI client recheck + A2UI investigation

**Date:** 2026-08-18
**Scope:** Pure research, no code changes. Re-verify the `@mcp-ui/client` bug at the current latest version, and investigate A2UI (`a2ui-project/a2ui`) package adoption for Jini's `agentic/core/a2ui/`.

---

## Task 1 — `@mcp-ui/client`: verdict = **STILL BROKEN**, but not identically to before

**Latest published version as of today: `7.1.1`** — the exact same version already tested previously. No new release has shipped (last publish: 2026-05-09, per npm `time` metadata). So "did they fix it since" is moot in one sense — there's nothing newer to check — but I re-ran the repro from scratch anyway, isolated, independent of any project tsconfig.

### Repro (isolated scratch dir, plain `node`, v24.2.0)

```
mkdir mcpui-client-test && cd mcpui-client-test
npm init -y
npm install @mcp-ui/client@latest   # resolves 7.1.1
```

**ESM (`import()`) — works, once you use the current API name:**
```
Module keys: [
  'AppBridge', 'AppFrame', 'AppRenderer', 'PostMessageTransport',
  'UI_EXTENSION_CAPABILITIES', 'UI_EXTENSION_CONFIG', 'UI_EXTENSION_NAME',
  'getResourceMetadata', 'getUIResourceMetadata', 'isUIResource'
]
```
Note: `UIResourceRenderer` (the old name from the previous check) is gone — it was renamed to **`AppRenderer`** somewhere around v6.0.0, when the package rebranded to "App"/`AppBridge` terminology aligned with its new `@modelcontextprotocol/ext-apps` dependency. Confirmed by grepping the bundled dist for `[AppRenderer] Error creating bridge` log lines and the trailing `rc.displayName="AppRenderer"`. So a check that asks for `mod.UIResourceRenderer` will get `undefined` even though the package is fine — that name doesn't exist anymore. **ESM import is not broken; the previous investigation's specific symbol name is just stale.**

**CJS (`require()`) — genuinely broken:**
```
Module keys: []
```
`require('@mcp-ui/client')` returns a **completely empty object**. All ten exports silently vanish.

**Root cause, confirmed by reading the shipped `dist/index.js`:** the package's `package.json` has `"type": "module"`, but `exports["."].require` points at `./dist/index.js`, which is a hand-rolled UMD wrapper:
```js
(function(T,I){typeof exports=="object"&&typeof module<"u"?I(exports,require(...)):...})(this,function(...){ ... T.AppBridge=ec, T.AppRenderer=rc, ... })
```
Because the package declares `"type": "module"`, Node's `require(esm)` interop (stable in Node 22+/24) parses this `.js` file as an **ES module**, not CJS. In ESM scope, `exports`/`module`/`require`/`this` are not the CJS globals — `typeof exports` evaluates to `"undefined"` (not `"object"`), so the UMD wrapper's own CJS-detection branch never fires. It falls through to the `globalThis` branch instead, which mutates `globalThis.McpUiClient` as a side effect rather than using `module.exports`/ESM `export`. The file has zero `export` statements, so as an ES module it has an empty exports namespace — which is exactly what `require()` returns.

**Verdict: still a real, reproducible bug in the current (and only) published version, 7.1.1.** It's a `type: module` + UMD-build mismatch in their build tooling, not the AI-imagined "obviously they'd catch that" scenario the repo owner was skeptical of — it's a genuinely easy-to-miss packaging bug because their own test suite almost certainly only exercises the ESM entry point. No GitHub issue/changelog search turned up an open ticket for this specific interop bug (didn't find the repo's GitHub org confirmed — `npm view` returned no `repository` field for `@mcp-ui/client`; maintainer is `idosal` per npm, consistent with the known `idosal/mcp-ui` project, but I did not get a canonical GitHub URL to check issues against, so "never acknowledged" is not proven, just "not found via npm metadata"). Practical takeaway for Tovu/Jini: **the moment any consumption path goes through plain CJS `require()` — ts-node/jest without ESM config, a bundler set to `require` condition, etc. — this package silently returns nothing.** `import()`/ESM consumption is fine, provided the API is called by its current name (`AppRenderer`, not `UIResourceRenderer`).

---

## Task 2 — A2UI: verdict = **real upstream exists, Jini's hand-roll reason still holds up today**

### Does `a2ui-project/a2ui` publish a real npm package?

Yes, confirmed on GitHub and npm:
- **Repo:** `github.com/a2ui-project/a2ui` — real, extremely active. `git ls` via GitHub API: **16,145 stars, 1,268 forks, 320 open issues, not archived, license Apache-2.0**, last push **2026-08-18T18:38** (today, hours before this check). Commit cadence is dense — 4 commits in the last few hours alone at time of check, spanning spec changes, eval tooling, and renderer work. This is not an abandoned or toy project.
- **npm packages**, both under the `@a2ui` org, both `Apache-2.0`, both pointing at the same GitHub repo (`renderers/react` and `renderers/web_core` subdirectories):
  - `@a2ui/react` — latest `0.10.2` (published 2026-07-17)
  - `@a2ui/web_core` — latest `0.10.6` (checked live, newer than what Jini's doc cites)
- No vendor lock-in or licensing concern: Apache-2.0, same bar as AG-UI/MCP-UI.

### Does Jini hand-roll A2UI, and is there a stated reason on file?

**Yes to both.** `packages/agentic/src/core/a2ui/` (folded in from a standalone `@jini-ai/a2ui` package on 2026-07-28) is a from-scratch TypeScript/Zod port of the A2UI v1.0 spec — 18/18 basic-catalog components, 336 tests, cross-validated against the spec repo's own official conformance fixtures. The reasoning is written down in detail in `/Users/la/Programming/Jini/packages/agentic/source-map.md` (section "`@a2ui/web_core` / `@a2ui/react` — checked, not usable as a foundation"), dated 2026-07-28:

> `@a2ui/web_core@0.10.5`'s `package.json` `exports` map only publishes `.` (→ `v0_8`, the default) and `./v0_9`. **There is no `v1_0` export path in the published package**... `@a2ui/react@0.10.1`... same story: v0.8 default, v0.9 available, no v1.0.

This is exactly the "stale justification" pattern the repo owner said to expect broken — **except this time it checks out.** I re-verified against today's latest versions:

```
@a2ui/web_core@0.10.6 exports: "." → v0_8, "./v0_8", "./v0_9", "./v0_9/basic_catalog", data/*, types/*, styles/*
   NO v1_0 export path.
@a2ui/react@0.10.2 exports: ".", "./v0_8", "./v0_9", "./styles"
   NO v1_0 export path.
```

Confirmed via GitHub search that v1.0 support for `web_core` is **actively in progress but not merged**:
- PR #2257 "feat(web_core): v1.0 Zod schemas, version adapters, and composition constraints" — **open**, created 2026-08-14, last updated **today** (2026-08-18T18:19).
- PR #2264 "feat(web_core): implement Stage 3 Sauce-TS bidirectional RPC and @index function" — **open**, same timing.
- PR #2248 "feat(v1_0): multi-version protocol schemas and version adapters" — **closed, not merged**.

**Verdict: the reason is still true today.** A2UI's own upstream spec is at v1.0-release-candidate, but the published SDKs (`@a2ui/web_core`, `@a2ui/react`) only ship v0.8/v0.9, and v1.0 support is mid-flight in open, unmerged PRs as of this afternoon. Jini's port specifically needed v1.0's `callFunction`/`actionResponse` bidirectional RPC and `callableFrom` security boundary — none of that exists in any published SDK version yet. Unlike AG-UI and MCP-UI, **this is not a stale hand-roll-because-X claim; it's current and accurate.** Worth re-checking again once PR #2257/#2264 land and a new `@a2ui/web_core` version publishes with a `v1_0` export — at that point the calculus could flip, since Jini's port is explicitly a *partial* implementation (11 of 14 catalog functions unimplemented, no template `ChildList` expansion) that an official v1.0 SDK release would likely obsolete for the parts it covers.

---

## MCP-UI client rendering code — current locations in Jini (research note only, nothing moved)

Confirmed exact paths:
- `/Users/la/Programming/Jini/packages/chat/src/react/components/McpUiSurfaceCard.tsx`
- `/Users/la/Programming/Jini/packages/chat/src/react/features/chat-pane/create-mcp-ui-tool-caller.ts`
- `/Users/la/Programming/Jini/packages/ui/src/react/mcp-ui/useMcpUiHost.ts` (**not** in `chat` — this one already lives in `@jini-ai/ui`, alongside `McpUiHost.tsx` and `host-message-source.ts` in the same `ui/src/react/mcp-ui/` directory)

So the "MCP-UI client rendering code" is already split across two packages today: the tool-caller + surface card in `@jini-ai/chat`, the sandboxed-iframe host (`useMcpUiHost`/`McpUiHost.tsx`) in `@jini-ai/ui`. Any move to `@jini-ai/agentic` needs to account for both source locations, not just the `chat` package. `@jini-ai/ui`'s `package.json` also currently exports `./mcp-ui` and `./mcp-ui/surfaces` as public subpaths — those are live, published export surfaces that would need to be preserved or re-pointed, not just deleted, if the host code moves out of `ui`.

None of Jini's MCP-UI rendering code (either location) imports anything from `@mcp-ui/client` — confirms the earlier finding still holds: it's hand-rolled independent of the broken-CJS package.

---

## Subpath pattern note (for shaping a `@jini-ai/agentic` restructure)

Every one of Jini's multi-surface packages uses **one npm package with `package.json` `exports` subpaths** — never literal separate npm packages for a split like this. Concrete examples, read directly from each `package.json`:

| Package | Subpaths |
|---|---|
| `@jini-ai/chat` | `.`/`./core`, `./react`, `./react/chat-pane`, `./react/styles/reference.css` |
| `@jini-ai/ui` | `.`, `./core`, `./sketch-editor`, `./lexical-rich-text-editor`, `./html-editor`, `./mcp-ui`, `./mcp-ui/surfaces`, `./interactive-ui` (+ `/manifests`), `./a2ui`, `./renderers`, plus 3 bare `.css` subpaths |
| `@jini-ai/admin` | `.`/`./core`, `./browser`, `./react` |
| `@jini-ai/infra` | `./db/core`, `./db/sqlite` (nested two-segment subpaths — no bare `.` export at all) |
| `@jini-ai/agentic` | `.`/`./core`, `./dom`, `./a2ui` (**this package already exists** — see below) |
| `@jini-ai/sandbox` | `./core`, `./e2b` |

Two consistent conventions across all of them:
1. Every subpath resolves to a matching `dist/<subpath>/index.js` (or `dist/cjs/...` mirror where CJS is also published, e.g. `infra`, `sandbox`) — the subpath string in `exports` always matches the source directory structure 1:1.
2. `chat`, `admin`, and `agentic` all follow the same "bare `.` equals `./core`" pattern — importing the package root gets you the non-UI/non-DOM logic; a named subpath (`react`, `browser`, `dom`) gets you the platform-specific half. `@jini-ai/ui`'s `./mcp-ui` vs `./mcp-ui/surfaces` split is a narrower version of the same idea (host mechanics vs. rendered surface components), and `agentic`'s own `.`/`./dom` split is enforced at the **tsconfig level**, not just the export map — `./dom`-only code compiles under a separate `tsconfig.dom.json` with `lib: ["DOM"]`, and everything outside `src/dom/**` fails to compile if it references `document`/`window`. That's the mechanism, per `agentic/source-map.md`, that makes the split a real guarantee rather than a naming convention.

### Important: `@jini-ai/agentic` already has `./core`, `./dom`, and `./a2ui` subpaths today

This directly bears on the planned restructure. `packages/agentic/src/core/a2ui/` is the **A2UI protocol implementation** (wire types + interpreter, zero DOM/React, published as `@jini-ai/agentic/a2ui`) — not the MCP-UI rendering code. `packages/agentic/source-map.md` also documents `webmcp.ts` and `mcp-ui.ts` living flat at `packages/agentic/src/` root already (single-file protocols, per that doc's own stated rule: "a protocol gets a directory when it has more than one module, not on principle"). So `@jini-ai/agentic` is already the home for AG-UI, GenUI, WebMCP, and A2UI protocol code — the MCP-UI **rendering** components (`McpUiSurfaceCard.tsx`, `create-mcp-ui-tool-caller.ts`, `useMcpUiHost.ts`/`McpUiHost.tsx`) are the one piece of this family of protocols that is *not yet* there, still split between `@jini-ai/chat` and `@jini-ai/ui`. Whatever restructure is planned should treat this as "complete an existing pattern" rather than "design a new package from scratch."

---

## Uncertain / flagged for follow-up

- Could not confirm a canonical GitHub repo URL for `@mcp-ui/client` from npm metadata alone (`repository`/`homepage`/`bugs` fields were all empty) — so "was this bug ever reported/acknowledged upstream" is unresolved, not disproven. Worth a direct GitHub search under `idosal/mcp-ui` (the npm maintainer handle) if that turns out to matter for the decision.
- `@mcp-ui/client`'s last publish was 2026-05-09 — over three months stale relative to today. Combined with the CJS bug being seemingly unaddressed, this package may be lower-velocity/lower-maintenance than `@mcp-ui/server` (already confirmed safe to adopt) or A2UI's upstream (extremely high velocity). Worth weighing in the adoption decision, not just the bug itself.
- A2UI's v1.0 SDK support is close enough (PRs updated same-day as this check) that the "not usable yet" verdict has a real expiration date — flag for re-check next time this decision is revisited, not a permanent conclusion.
