# Cloud brief — `@jini-ai/vibecoding` `./node` then `./react` adapters

Unattended cloud dispatch. No human is watching — verify everything by measuring, and do not ask
questions you can answer yourself.

## Where you are

Two repos are mounted. **All edits go in `Jini`.** `Tovu-AI-CMS` is READ-ONLY reference (you need
its handoff reports). **Make no commits in Tovu-AI-CMS.**

```bash
cd Jini           && git checkout main && git pull origin main
cd ../Tovu-AI-CMS && git checkout main && git pull origin main
```

At dispatch: Jini `main` = `96f0a5c8`, Tovu `main` = `f84ae88`.

Read `AI-Dev-Shop/agents/programmer/skills.md` in the Tovu repo before any work and confirm in your
first output that you loaded it. Do **not** read `AGENTS.md` or `CLAUDE.md` — the
`<<SUBAGENT_DISPATCH>>` marker in your trigger message exempts you.

## Context — do not re-derive

`@jini-ai/vibecoding` (`packages/vibecoding/`) is a new package: a framework-free edit loop for
AI-generated HTML pages. It has two tiers today, both green at **49/49** tests.

**`/core`** — the edit loop, plus `src/core/history.ts`: operation-level undo/redo over
`snapshot`/`restore`, adding **no new verb** to `EditTarget`. Documented limit: undoing a creation
cannot remove the part (upsert, no delete verb).

**`/html`** — `src/html/regions.ts`, the Pages adapter. Parts are tagged regions of **one** document,
addressed via `data-agent-element` and its handle grammar. Two properties that must not break:

1. `validate` refuses any candidate that changes the handle **multiset** — a model that can write
   `data-agent-element` into a region it may edit would otherwise grant itself a new addressable
   part at the next `listParts()`.
2. Writes are **byte-preserving outside the edited region** (splice across inner offsets).

The HTML parser is an **injected port, not a dependency** — no parser exists anywhere in Jini and the
package is `"runtime": "universal"`. **Do not add a parser dependency**; if you believe one is
required, stop and report it as a decision for the user.

Read `packages/vibecoding/` in full before writing anything. Also read, in the Tovu repo,
`ADS-memory/reports/refactors/2026-08-03-handoff-image-capability-and-vibecoding.md` for the
decisions already locked.

---

## Task

1. **`./node`** — the filesystem tier. Parts are files on disk; `EditTarget`'s verbs map to real file
   reads/writes. Respect the existing seam: this is an adapter behind the **same contract** `/html`
   implements, not a new contract.
2. **`./react`** — only after `./node` is green.

Follow the conventions the existing two tiers establish rather than inventing new ones: same test
style, same doc-comment density, same export shape in `package.json`.

If while reading you conclude `./node` needs a contract change affecting `/core` or `/html`, **stop
and report** rather than making it — that is a design decision for the user, not an implementation
detail.

## Constraints

- Tests: `npm --prefix packages/vibecoding run test`. A root-level `npx vitest` has **no jsdom** and
  will fail DOM tests misleadingly.
- Run **only** scoped package tests. Do **not** run any full-repo suite.
- `npm run guard` must show no NEW violations.
- Stay strictly inside `packages/vibecoding/`. Commit **by explicit path** — never `git add -A`, and
  never `git add` a directory.

## MANDATORY — persisting your work

When done, or if stuck, or if running low on context:

1. `git add` your files **by explicit path** and commit.
2. `git push`. If pushing to `main` fails or would conflict, push to a NEW branch
   `cloud/vibecoding-node-react` and say so in your report.
3. **Never finish with uncommitted work. Unpushed work is lost work.**

Report: what you built, test counts, any contract tensions you hit, and the branch + SHA you pushed.
