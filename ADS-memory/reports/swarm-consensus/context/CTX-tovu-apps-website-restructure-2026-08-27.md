# Swarm Consensus Context Packet

**Date:** 2026-08-27
**Slug:** tovu-apps-website-restructure
**Project Type:** brownfield
**Question:** How should Tovu's current `src/` tree be organized once it relocates under `apps/website`, and how should the sibling Tovu-Runner desktop app be structured to consume it?
**Intended Consumers:** Primary model + peer CLIs (Codex, Gemini via agy)

## Goal

Produce a ranked slate of structural proposals for two linked repos:

1. **Tovu** (`/Users/la/Programming/Tovu`) — what goes where once `src/` is relocated under `apps/website`, and what the rest of the repo root looks like.
2. **Tovu-Runner** (`/Users/la/Programming/Tovu-Runner`) — a sibling Electron desktop app that consumes Tovu. It may itself be poorly structured and open to real changes, not just "how it reads Tovu."

## Scope

**In scope:** internal layout of the code currently in `src/`; where genuinely shared code lives once `src/` no longer exists as a top-level name; how Tovu-Runner's own folders should be organized to consume Tovu; the versioning/packaging boundary between the two repos.

**Out of scope:** whether the rename itself happens (decided, see Constraints); splitting large files by line count (see Constraints); renaming or relocating `sites/`, `content/`, `development/`, or `packages/sdk`.

## Architecture Summary

Tovu is a Node/TypeScript CMS. Its `src/` currently holds an Express server (routes, HTTP handlers, a 2450-line SSR renderer), ~10 domain folders (analytics, widgets, seo, media, identity, navigation, origin, assistant, connectors), a features/ folder (comments, forms, members, newsletter, redirects, webhooks), a partially-relocated contracts/ and platform/ from a halted refactor, a CLI, and a test-fixture folder (theme-archive) that looks dead but backs ~20 live tests. `apps/admin` (React SPA) and `apps/site-chat` already exist as siblings to `src/`. `packages/sdk` is the published `@tovu/sdk` plugin contract, wired as an npm workspace.

Tovu-Runner is a separate git repo, Electron, `src/{main,renderer,shell}`, currently thin (early "rebuild/v1" branch, ~23 TS files). **Verified fact, not assumption:** Tovu-Runner does NOT import Tovu as a library or npm-workspace-linked package. Its own build comment states this explicitly: *"Runner never imports Tovu as a library — it spawns Tovu's CLI as a child process, so what has to ship is a whole runnable tree."* At package time, `development/scripts/stage-tovu-runtime.mjs` copies Tovu's built `dist/` plus its production `node_modules` closure (excluding devDependencies) into `staging/tovu-runtime/`, which `electron-builder` ships as `extraResources`. Tovu-Runner's own `package.json` dependencies are all `@jini-ai/*` packages via `file:../Jini/packages/*` — none point at Tovu. This means "packaging for reuse in Tovu-Runner" is currently a **process-spawn + staged-build-artifact** model, not a workspace-link model like `packages/sdk` uses. Whether that should change is itself an open question for this debate, not a settled fact.

## Relevant Files And Artifacts

| Path | Why it matters |
|---|---|
| `ADS-memory/reports/peer-review/2026-08-27-codex-sol-5.6-xhigh-tovu-directory-architecture.md` | Prior single-model peer review of Tovu's `src/` (Codex gpt-5.6-sol @ xhigh). Written before the owner decided to rename `src/` to `apps/website` — its `apps/server/{public-http,admin-http,composition}` proposal and "one deployed server" argument still stand; its `src/{modules,platform,contracts,kernel}` proposal assumed `src/` stays at root, which is now void. Treat as one input, not a verdict. |
| `Tovu/.dependency-cruiser.cjs` | 99 forbidden-import rules, all naming `src/` paths — will need rewriting under any outcome. Not a criterion, a cost. |
| `Tovu/src/server/http/site/render.ts` | 2450 lines. Public renderer. |
| `Tovu-Runner/development/scripts/stage-tovu-runtime.mjs` | The actual mechanism by which Tovu-Runner consumes Tovu today (see Architecture Summary). |
| `Tovu-Runner/src/main/tovu-cli.ts` | Spawns Tovu's CLI; declares `TOVU_MIN_NODE_MAJOR`, which must stay in sync with Tovu's `engines.node`. |

## Constraints

**Fixed, not up for debate:**
- `sites/` stays (per-site content.db, uploads, themes, plugins).
- `content/` stays (shipped stock data).
- `development/` keeps its name.
- `packages/sdk` stays as-is (published `@tovu/sdk` plugin contract, npm workspace).
- `src/` is renamed to `apps/website`. The debate is about what goes inside it and around it, not whether the rename happens.
- Large files (`render.ts` 2450 lines, `app.ts` 1272, `deps.ts` 1171) are NOT to be split by line count in this pass. The owner's standard is cyclomatic/cognitive complexity ≤10 per function, measured *after* reorganizing. Do not propose file-splitting as a structural fix; you may note where complexity is likely to be a problem, but the fix is deferred and measured later, not designed now.
- `src/theme-archive` looks dead but backs ~20 live test call sites. Any proposal must relocate it, never delete it.

**Judge every proposal against:**
1. Minimal repo root — only what's needed.
2. AI-agent legibility — an agent should predict where things live without grepping.
3. Future-proof for AI capabilities — AI/assistant exposure as an explicit inbound adapter, not scattered direct imports. (Evidence: 25 domain files currently import the assistant runtime directly — e.g. `widgets/tool-registrations.ts`.)
4. Modular, easy to reason about, no dead/duplicate code.
5. Versioning/packaging so Tovu-Runner can reuse Tovu's code, given the verified spawn+stage consumption model above — should this model continue, or should Tovu-Runner move to a different consumption mechanism (workspace link, published package, etc.)? State a position.
6. Update/overwrite Tovu without touching site content — `sites/` already solves this; any new structure must preserve it.
7. Multi-admin deployed security boundary — several employees log into one deployed server; folder structure should make "who can touch what" legible.
8. Tovu-Runner's own structure — is `src/{main,renderer,shell}` the right shape for a fleet-supervisor Electron app, given it spawns N `tovu serve` child processes? Propose changes if warranted.

## Known Unknowns

- Whether Tovu-Runner's spawn+stage model should continue as Tovu's `apps/website` internals get reorganized, or whether reorganizing creates an opportunity to change that consumption model.
- Whether `apps/website` should be one deployed unit or split into multiple (e.g. public vs admin HTTP), independent of the folder-naming question.
- Where genuinely shared code (used by more than one part of Tovu, not published like `packages/sdk`) should live once `src/` no longer exists as a name.

## Tooling Instruction (all participants)

Use `codebase-memory-mcp` (`search_graph`, `trace_path`, `get_code_snippet`, `get_architecture`) as the primary discovery tool for both repos, not `grep`/file search, wherever the tool is available to you. Both project indexes are current as of this packet and both already exclude `node_modules`, build output, and other non-source directories — you do not need to re-scope or re-index:
- Project name for Tovu: `Tovu` (root `/Users/la/Programming/Tovu`, HEAD `8138c299`).
- Project name for Tovu-Runner: `Tovu-Runner` (root `/Users/la/Programming/Tovu-Runner`, HEAD `8820038e`, just re-indexed at 510 nodes / 1071 edges covering all of `src/`).

Fall back to direct file reads or shell search only when graph evidence is missing or looks structurally stale (mismatched paths), per your own judgment — the graph's edges are reliable but path-shaped claims should be spot-checked against the live tree before you rely on them.

## Source-of-Truth Inputs

| Source | Notes |
|---|---|
| `ADS-memory/reports/peer-review/2026-08-27-codex-sol-5.6-xhigh-tovu-directory-architecture.md` | Prior peer review, evidence not verdict |
| Live filesystem, both repos | Ground truth for current-state claims |
| codebase-memory-mcp, both projects | Structural queries; both indexes current as of this packet |

## Shared Prompt Payload

```text
Need: Tovu's `src/` tree (soon to live at `apps/website`) and the sibling Tovu-Runner
Electron app both need a structure that is legible to AI agents and newcomers without
grepping, keeps the repo root minimal, is modular with no dead/duplicate code, supports
safe Tovu updates without touching site data, supports a multi-admin deployed security
boundary, and defines cleanly how Tovu-Runner packages/versions/consumes Tovu's code.

Constraints: see the Constraints section of the attached context packet — several
decisions are fixed and not open for reargument (listed there). Read the full packet
before answering; it contains measured facts (import counts, file sizes, the verified
Tovu-Runner consumption mechanism) that should ground your answer instead of assumption.

Options to evaluate (evaluate all, reject any that don't hold up, propose your own):

A. Single `apps/website` app: everything currently in `src/` collapses into one
   `apps/website/` tree (business modules + server + CLI together), organized by
   business capability internally (e.g. `apps/website/{modules,platform,contracts,cli}`).
   Shared code used elsewhere lives in `packages/`.

B. Split server from domain: `apps/website` holds only the deployable HTTP surface
   (e.g. `public-http/`, `admin-http/`, `composition/` wiring one process), while
   business-capability modules live in a separate top-level home (e.g. `packages/` or
   a new sibling) that both `apps/website` and `apps/admin` can import. This is close to
   a prior single-model peer review's proposal, translated to a world where `src/` no
   longer exists as a name — treat it as one candidate, not the expected answer, and
   give it your strongest critique along with the others.

C. Something else — a structure that rejects both A and B's premises.

For Tovu-Runner specifically: should it keep spawning Tovu's CLI as a child process
against a staged build artifact (its current, verified mechanism), or should the
reorganization of Tovu's `apps/website` change that boundary? State a position with
reasoning, and propose Tovu-Runner's own internal folder structure if you think
`src/{main,renderer,shell}` needs to change.

Adversarial task: identify the best design for each repo, reject weak options
explicitly (including explaining why), and state what evidence would change your
answer. Use codebase-memory-mcp on both projects per the Tooling Instruction in the
packet — do not rely on grep as your primary discovery method.

Blind Spots (required): name (a) an option this packet failed to list, (b) a question
we should be asking but aren't, (c) the single assumption baked into this framing most
likely to be wrong, and why.

Is there a strong option, shift, or decomposition not listed above that you believe is
better or that the framing has missed? If yes, describe it and explain why it's
stronger than the presented options.
```
