# Jini nested `@jini-ai/*` pin audit — 2026-09-10

## Method
Resolved a clean tree in a scratch dir (root `package.json`'s `@jini-ai/*` deps only, `npm install --package-lock-only`; local Jini checkout is symlinked and cannot be trusted for this). Read every resolved package's manifest via `npm view <pkg>@<ver> dependencies --json` (registry, not local). For divergent pins, `npm pack` both versions and diffed exported top-level symbols (`export const|function|class|interface|type|enum`) across all `.d.ts` files.

## Finding: the pattern is universal, not isolated to ui/agentic
**Every** `@jini-ai/*` package audited (agent-runtime, agentic, chat, cli, cms, daemon, devops, http-kit, integrations, mcp, sidecar, sqlite, ui) exact-pins **all** of its `@jini-ai/*` dependencies — zero carets anywhere in the family. The ui@0.3.6 incident wasn't a one-off mistake, it's the house style, and it will recur.

## Resolved-tree duplicates (nested copy older than top-level)
| Pinning pkg (self-consistent version) | Pins | Top-level resolves | Symbol diff (pinned → top) | Live or latent? |
|---|---|---|---|---|
| `cli@0.3.0` | `core@0.3.0` | `core@0.3.1` | +`isReadOnlyTool` | **Latent.** cli isn't imported by Tovu app code (only reachable transitively via `mcp`, itself not directly imported either). No cross-boundary object flow found. |
| `sidecar@0.3.0` | `core@0.3.0` | `core@0.3.1` | same as above | **Latent**, same reasoning. |
| `sqlite@0.3.0` | `chat@0.3.0` | `chat@0.3.7` | +9 symbols (Attachment-preview API: `AttachmentPreviewController`, `useAttachmentPreviewModal`, etc.) | **Latent today, highest watch-priority.** `@jini-ai/sqlite` IS a direct, wired Tovu dependency (`apps/website/src/platform/db/sqlite/chat-db.ts`, `server/runtime/composition/deps.ts`). Root's `chat: ^0.3.7` is tight enough (0.x caret) that npm can't collapse this to one copy — the duplicate is real and permanent until sqlite is republished. Each side is internally self-consistent (built against the version it declares), so nothing breaks *today*. It becomes live the moment sqlite's code needs a newer chat export without a matching pin bump — exactly the ui/agentic mechanism. |
| `chat@0.3.0` (nested under sqlite) | `agentic@0.3.0`, `ui@0.3.0` | `agentic@0.3.6`, `ui@0.3.7` | agentic +3 (`agentHandleProps` et al. — the confirmed prior incident); ui +18 (reasoning-control, API-key-warning APIs) | **Latent**, same self-consistency logic, one hop further down. |

The ui@0.3.6→agentic@0.3.0 incident was **live** specifically because ui's own dist code had moved forward (shipped 0.3.6 using 0.3.6-only exports) while its manifest pin was stale at 0.3.0, *and* admin's own range (`^0.3.0`) was loose enough for npm to collapse both consumers onto the stale copy. None of the four pins above show that staleness signature (pinning version == package's own published version) — they're accidental-duplication risk, not currently a broken build.

## Recommendation
Caret ranges (`^0.3.x`) on intra-family deps, not peerDependencies. Caret would have prevented the actual incident: npm resolves to the newest version satisfying every constraint unless something demands an exact old one, so ui declaring `^0.3.0` (kept accurate) would have let admin's install float to 0.3.6 automatically. Cost: republish all ~13 packages once, no consumer-side changes. peerDependencies forces true single-instancing and fails loudly (ERESOLVE) on skew instead of silently duplicating, but costs a coordinated major-version bump across the whole family plus every downstream app (Tovu included) explicitly declaring each transitive `@jini-ai/*` peer — disruptive for a problem carets already solve. Recommend carets now; revisit peers only if caret-pin discipline itself proves unreliable.

## Stale comment (task 2)
`apps/website/src/server/runtime/composition/tool-catalog-manifest.ts` is still dirty with another session's uncommitted changes (`git status --porcelain` shows `M`, matches the pre-existing snapshot). Not touched, per instructions.
