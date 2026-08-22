# AGENTS.md

## Repository-Specific Instructions

- For any work anywhere in this repository, read and follow `AI-Dev-Shop/AGENTS.md`.
- Treat `AI-Dev-Shop/AGENTS.md` as the mandatory bootstrap and governing agent instruction file for this workspace, not just for the `AI-Dev-Shop/` subtree.
- On the first user message in this repository, boot with `AI-Dev-Shop/AGENTS.md` loaded before any substantive reply.
- If `AI-Dev-Shop/AGENTS.md` is missing or unreadable, state that explicitly and stop.

## Always Consult

Before proposing architecture changes, implementation plans, or new platform modules in this workspace, consult:

- `ADS-memory/docs/architecture/sections/13-user-friction-coverage-living-backlog.md`
- `ADS-memory/docs/architecture/sections/14-meta-coding-framework-spec-first-test-first-pattern-first.md`
- `ADS-memory/knowledge/project_memory.md` when the task needs this project's accumulated decisions

Both section files are also chapters 13 and 14 of the single-file
`ADS-memory/docs/architecture/tovu-architecture.md`; `ADS-memory/docs/architecture/READING-ORDER.md`
is the shorter path in. Treat that architecture as **target, not built** — it predates most of the code.

Path note (corrected 2026-08-22): these lines previously pointed at `tovu-architecture.md`,
`tovu/PROJECT_MEMORY.md`, and `tovu/src/INFO.md` — a stale `tovu/`-prefixed layout from before this
repo became its own root. **None of those three paths has existed for some time.** Every agent booting
here was being told to read files that are not there, and at least one external peer model had to
caveat its entire first answer because of it. The content itself was never missing, only misfiled.
There is no repo-wide module-layout document; module layout lives in each domain's own
`src/<domain>/INFO.md` (25 of them) and is not an Always-Consult item.

## Audit Scope

Unless the user explicitly expands the scope, code audits, security reviews, bug hunts, and refactor reviews in this repository must inspect only the final source state under:

- `src/**`
- `apps/**`

Treat all other top-level paths as out of scope for those audits, including history, overwritten intermediate versions, generated output, documentation, development material, and `AI-Dev-Shop/**`.

## Execution Rules

- Treat sections 13 and 14 as governing constraints for architecture decisions.
- Do not bypass dependency inversion or modular boundaries for speed.
- Prefer swappable ports/adapters over provider-coupled implementations in core.

## Cloud Dispatch — Standing Rules

Applies to every unattended run launched against this repository: `RemoteTrigger`, scheduled
routines, any agent working with no human watching. Every rule here has already cost a real run.

**1. Set up before reading a single source file.** This repo declares ~10 dependencies as
`file:../Jini/packages/*`, so the Jini checkout must sit beside it named **exactly** `Jini`. And
Jini's `dist/` is gitignored — a fresh clone has no build output, so every `@jini-ai/*` import
resolves to nothing. Run `pnpm install && pnpm -r build` in Jini first. Then record a **green
baseline on the unmodified tree**, so a setup failure is never mistaken for your own breakage.

**2. Commit and push every 5–10 minutes, or per logical unit — whichever comes first.** Never
batch a job into one commit at the end. `wip:` prefixes are fine; history can be squashed, lost
work cannot be recovered. Two reasons:
- **Partial work must survive.** 300 of 523 edits committed beats 523 edited and lost.
- **Your commits are the only telemetry.** The trigger API exposes no transcript or session URL.
  From outside, an agent that has not pushed in 15 minutes is indistinguishable from a dead one.

**3. Never gate a commit on tests passing.** Commit the work, *then* verify, *then* commit fixes.
Report failures honestly rather than withholding work. A brief that required green-before-commit,
combined with a missing setup step, produced 65 minutes of work and zero output.

**4. Always `git pull --rebase` immediately before pushing. Never force-push.** A human may be
committing to the same branch concurrently. If a rebase will not resolve cleanly, push to a named
fallback branch and say so prominently in the report.

**5. Report every pushed SHA and the branch.** Not "done" — the actual commits, so the work can
be found. Confirm the push succeeded; do not trust "I'm finished."
