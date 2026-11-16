# Wave B cloud lane brief (shared by every lane; your lane id is in your prompt)

UNATTENDED: no human is watching. Never ask; measure. Do not create, update or run any RemoteTrigger, and do not reschedule yourself.

## Setup
1. Tovu = https://github.com/AINSEP/Tovu.git, Jini = https://github.com/AINSEP/Jini.git (public). Use pre-cloned copies if present (e.g. /home/user/Tovu, /home/user/Jini), else `git clone`. In both: `git fetch origin refactor/terra main && git checkout refactor/terra && git reset --hard origin/refactor/terra`. Record both HEAD SHAs.
   Both repos are attached as session sources, so pushing `wave-b/<lane>` works. If a push is refused (403), say so in the report and stop; never work around it. The d2 server-port design commits (e.g. `f6e1401ed`, needed by C4) are on Jini branch `design-d2`: `git -C <Jini> fetch origin design-d2`.
2. Plan files: `git -C <Tovu> fetch origin plan/terra-2026-11-15 && git -C <Tovu> worktree add <Tovu>/../plan origin/plan/terra-2026-11-15`. Then U = `<plan>/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/` and M = `.../move-templates/`.
3. Path mapping: the sheets were written on a Mac. Read `/Users/la/Programming/jini-terra-base` as your Jini checkout, `/Users/la/Programming/tovu-codex-trial-terra` as your Tovu checkout, `/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/` as `<plan>/ADS-memory/.local-artifacts/terra-refactor-2026-11-13/`. Blob guards were taken at Jini `465122282` / Tovu `fd90d9c72`; HEAD may be a few commits later. A guard mismatch on a file you must edit = re-read the file; continue only if the sheet's intent still applies unambiguously, else SKIP that step and record it.
4. Tooling: image Node is v22. Install Node 24 from the nodejs.org tarball into ~/.local/node24, `export PATH=$HOME/.local/node24/bin:$PATH` in every command, `corepack enable --install-directory $HOME/.local/node24/bin`. Jini: `pnpm install --config.prefer-workspace-packages=true`. Tovu (only if your lane edits Tovu): `npm ci`; build `@tovu/sdk` BEFORE linking; link Tovu to your Jini checkout with Tovu's own link script.

## What to do
1. Read U/LANES.md section "Wave B final" (your lane's row, the coordinator-only list and the file-overlap notes), then your lane's sheet(s) in U/sheets/ in full. Revision/override sections and banners win over older body text. Also read U/DESIGN.md §7 (owner answers).
2. Do ONLY your lane's hand edits (the "Lane-owned paths" / "Files touched" of your sheet): create the contracts, move the code, delete the old definitions (no shells), wire the ports. Do NOT run the repoint TSVs; a serial applier pass does that after every lane has landed. EXCEPTION, lane C2 only: after your hand edits, run applier pass B0 yourself (`node U/scripts/apply-repoint.mjs --tsv U/sheets/<f>.repoint.tsv --repo-root jini=<Jini> --repo-root tovu=<Tovu> --phase wave`, for C2, C2-addendum, C1-plus in that order; `--dry-run` first; exit 1 = stale row → record and stop the pass), then do the MANUAL rows of those TSVs.
3. package.json: you MAY add the `exports` + `jini.entries` + README row for a subpath your lane creates, and the matching `.changeset/<pkg>-<slug>.md` (minor for new exports). This deviates from "coordinator-only" because each lane runs on its own branch; the coordinator merges. Do not touch the lockfile or `scripts/injection-debt.json` (list the debt entries you retire in your report instead).
4. Checks, in the cloud box (owner rule: changed files only, no full suites): build and typecheck every Jini package you touched (`pnpm --filter <pkg> build`, typecheck script); run that package's test files that you changed or that cover changed source (`vitest run --maxWorkers=2 <files>` or `vitest related`); run the Jini complexity + size ratchets and `guard`. If your lane edits Tovu: typecheck the touched Tovu workspace after linking. Record failures that your lane causes vs ones that need the later applier pass (importers still on old specifiers are EXPECTED until the pass; list them, do not fix them).

## Owner rules (binding)
- A Jini package imports only itself, `@jini-ai/core` and `@jini-ai/protocol` (host-preset `server`/`cli` excepted; tests may import `/testing` and `/conformance`). Every other cross-package need is a port the host wires.
- NO re-export shells, forwarders, deprecated aliases or exceptions. Moved code is deleted at the old path.
- No library types (Kysely etc.), vendor fields, Express or `process.env` in core / Jini domain packages.
- Exported functions take `(required, optional = {})`; never `_optional?: Record<string, never>`; no-required shape `(_required = {}, { … } = {})`. Plugin-facing kits (SourceControlProviderKit, deploy, form-destination, HttpClientPort) stay positional.
- Functions ≤ 50 lines; cyclomatic and cognitive complexity ≤ 10 (extract helpers, never exempt).
- Behaviour change = failing test FIRST (run it RED, then GREEN). Pure moves change no behaviour.
- Never remove assertions, test injections or overrides to make something fit; a test that no longer fits = SKIP + record.
- "Why" comments move with the code, reworded neutral in Jini; Tovu-specific why stays in Tovu.
- No Tovu text in Jini (`rg -n -i "tovu|site-chat|apps/(admin|website|desktop)"` on every Jini file you touched prints nothing).
- Repos are public: no exploit detail in comments or commit messages.

## Git
- Branch `wave-b/<lane>` from refactor/terra in Jini, and in Tovu only if your lane edits Tovu. Commit per logical step with explicit paths. Messages end with a blank line + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Push ONLY `wave-b/<lane>` branches. Never push main, refactor/terra or plan/*. Never force-push.
- Last commit on the Jini branch: `cloud-results/wave-b/<lane>.md` (the report below), so the coordinator can drop it at merge.

## Report (`cloud-results/wave-b/<lane>.md` + your final message, 15 lines max)
DONE / PARTIAL / SKIPPED; branch names + SHAs; every step done or skipped (+ reason); new subpaths + package.json edits; debt entries retired; checks run with every error listed (file:line + message) classified LANE-CAUSED / NEEDS-APPLIER-PASS / PRE-EXISTING / ENV; anything the sheet got wrong; context used and wall-clock time.
