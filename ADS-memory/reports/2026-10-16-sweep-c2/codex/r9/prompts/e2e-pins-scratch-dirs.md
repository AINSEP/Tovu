# admin-layout.pins E2E journey writes tracked PNGs into ADS-memory/reports — default to a scratch dir

Repos: Tovu (/Users/la/Programming/Tovu, cwd).

RULES: do NOT run tests, typecheck, builds, playwright or any package scripts. Do NOT commit or touch
git state. Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`. REUSE before you
write (search development/e2e for an existing scratch/output-dir helper, e.g. how other journeys pick a
temp or test-results dir). Smallest change. Move "why" comments with code, never delete them.

File: development/e2e/journeys/admin-layout.pins.journey.ts
- :679-680 `const SNAPSHOT_DIR = process.env.VISUAL_PARITY_DIR ?? "ADS-memory/reports/visual-parity-taxonomy-workspace/before";`
- :1223 `const SCREENSHOT_DIR = path.resolve(import.meta.dirname, "../../../ADS-memory/reports/placeholder-tabs-card-parity");`
Both make every E2E run overwrite git-tracked PNGs. Change both defaults to a scratch directory that is
not tracked (an existing gitignored e2e output dir if there is one, else a dir under os.tmpdir()), and
create the dir before writing (page.screenshot creates parents, but keep whatever the code relies on).
KEEP the VISUAL_PARITY_DIR override for SNAPSHOT_DIR exactly as it is (a fix's before/after sets still
go where the caller points). Let SCREENSHOT_DIR honour an env override too only if it is a one-liner
reusing the same variable pattern; otherwise leave it override-free. Update the doc comment near :675
so it states the new default and that VISUAL_PARITY_DIR still overrides it.
