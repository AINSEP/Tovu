# SonarQube for Tovu

Local-only setup. There is no CI wiring here — see "The CI reality" below for why, and treat the
steps in this file as the primary (currently *only*) way to run this.

## What's in this directory

- `sonar-project.properties` — scanner config: sources, exclusions, coverage report paths.
- `docker-compose.yml` — SonarQube Community Edition, single container, embedded database.
- `scan.sh` — rewrites `apps/admin`'s coverage report so Sonar can find it, then runs the scanner.
- `.gitignore` — ignores `.generated/`, the scratch dir `scan.sh` writes to.

**Nothing here has been started.** Docker was not run, the server was not brought up, and no scan
has been executed, per this repo's standing rule that Docker only gets started when the owner
explicitly says so.

## How to run it, start to finish

1. **Start the server** (this is the step that actually launches Docker — run it yourself):
   ```bash
   docker compose -f development/sonarqube/docker-compose.yml up -d
   ```
   First boot takes a minute or two. Watch `docker compose -f development/sonarqube/docker-compose.yml logs -f`
   until you see `SonarQube is operational`.

2. **Log in and get a token.** Open http://localhost:9000, log in with `admin` / `admin`, set a new
   password when prompted, then go to **My Account > Security > Generate Token**. Copy it.

3. **(Recommended) Regenerate coverage** so the scan reflects current code, not a stale artifact —
   see "The coverage-path problem" below for why this matters here specifically:
   ```bash
   npm run test:cov
   npm --prefix apps/admin run test:cov
   ```

4. **Run the scan:**
   ```bash
   SONAR_TOKEN=<paste-your-token> development/sonarqube/scan.sh
   # or, to have it regenerate coverage for you as step 1 of the same run:
   SONAR_TOKEN=<paste-your-token> development/sonarqube/scan.sh --with-coverage
   ```
   `scan.sh` runs the scanner via the `sonarsource/sonar-scanner-cli` Docker image — nothing to
   install locally beyond Docker, which is already required for step 1.

5. **Read the results** at http://localhost:9000/dashboard?id=tovu.

6. **Stop it when done:**
   ```bash
   docker compose -f development/sonarqube/docker-compose.yml down
   ```
   (Add `-v` to also delete the analysis history volume; left off by default so re-running later
   doesn't start from zero.)

### If you'd rather not use Docker for the scanner itself

`scan.sh` always uses the Docker scanner image. If you install the `sonar-scanner` CLI natively
instead (e.g. `brew install sonar-scanner` — not run here, per the no-global-installs rule this
task was scoped under), run it directly from the repo root:
```bash
sonar-scanner -Dproject.settings=development/sonarqube/sonar-project.properties \
  -Dsonar.host.url=http://localhost:9000 -Dsonar.token=<your-token> -Dsonar.qualitygate.wait=false
```
You'd still need to do the `apps/admin` lcov path rewrite yourself first (see `scan.sh`'s comments)
or admin's coverage numbers will silently come back as zero.

### Linux note

`scan.sh` defaults `SONAR_HOST_URL` to `http://host.docker.internal:9000`, which is how a container
reaches a Compose service published on a **Mac** host (confirmed this is a Darwin machine). On
Linux, either run `docker run --network=host` in place of `scan.sh`'s `docker run` line, or set
`SONAR_HOST_URL=http://<host-ip>:9000` before invoking it.

### If the server fails to start (Elasticsearch bootstrap check)

`docker-compose.yml` sets `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true` specifically to avoid needing to
raise `vm.max_map_count` on the Docker host for a local evaluation instance. If you remove that
variable later (e.g. moving toward a more production-like setup), you'll need
`sysctl -w vm.max_map_count=262144` on the Docker VM/host first — SonarQube's own docs cover this.

---

## The self-hosted-vs-hosted fork — decided: self-hosted

**SonarCloud is free only for public repositories.** This repo is private, so the only way to use
SonarCloud without paying is to make the repo public — off the table. That leaves two real options:
self-hosted SonarQube Community Edition (free, what this setup uses), or a paid SonarCloud/SonarQube
Enterprise plan. Given the setup only needs to run on-demand on one person's machine today (see "The
CI reality" below — there's no CI to integrate with yet anyway), self-hosted Community Edition is
the only option that makes sense to stand up right now. Revisit a paid hosted plan only if this
grows into a team tool with an actual CI pipeline to report into.

---

## How this reconciles with `code-metrics.py`

**Honest answer: less than you'd expect, and less than a generic "add SonarQube" pitch would
imply.** `development/scripts/code-metrics.py` already runs 13 metrics (verified by running it
against `apps/site-chat/src` during this setup: complexity, cognitive_complexity, duplication,
type_safety, dead_code, coupling, blast_radius, circular_dependencies, api_surface, churn,
hotspots, change_coupling, coverage — 12 of 13 measured on that run, `cognitive_complexity` came
back empty, a real gap worth someone's attention separately from this task).

**What SonarQube genuinely adds, that nothing in this repo does today:**
- **An actual bug/vulnerability rule engine**, not just aggregate metrics. `code-metrics.py`
  measures *how complex* or *how duplicated* code is; Sonar's TypeScript/JavaScript ruleset flags
  specific patterns (unsafe comparisons, unreachable code, security hotspots, resource leaks not
  covered by this repo's own custom `effect-resource-cleanup` ESLint rule, etc.) at the line level
  with an explanation. This repo has zero SAST-style scanning today.
- **A persistent, browsable history and triage UI.** `code-metrics.py` produces one markdown
  snapshot per run, with no trend line and no per-issue "acknowledge / won't-fix / resolved"
  workflow. Sonar's web UI is built around exactly that.

**What SonarQube does NOT add here — it substantially overlaps with, and does not replace,
`code-metrics.py`'s more specialized metrics:**
- `coupling`, `blast_radius`, `circular_dependencies`, `api_surface` — all powered by
  `dependency-cruiser` against this repo's own `.dependency-cruiser.mjs` architecture rules.
  SonarQube Community Edition has no equivalent dependency-graph analysis for JS/TS.
- `churn`, `hotspots`, `change_coupling` — git-history-weighted risk scoring. Not something Sonar
  Community does at all.
- `dead_code` — `code-metrics.py` uses `knip`, which does cross-file unused-export analysis. Sonar's
  unused-code rules are shallower (mostly unused local variables/imports within a file).
- `duplication` — both tools do this (Sonar has its own CPD-style engine); not a net-new capability,
  just a second implementation of one this repo already has calibrated (`jscpd`, per the
  2026-08-28 verification that `code-metrics.py`'s own duplication number was previously inflated
  5-7x and has since been fixed).
- `type_safety` (explicit-`any` counts, non-null-assertion counts) — Sonar has no direct equivalent
  metric out of the box.

**Bottom line:** don't stand SonarQube up expecting it to replace or absorb `code-metrics.py`. Its
real value-add is the bug/security rule engine and the persistent UI — genuinely useful, but
narrower than "13 metrics plus SonarQube equals more metrics." Keep both; they answer different
questions.

---

## The complexity-number problem

This repo already has **two** disagreeing cognitive-complexity numbers on `apps/admin`, and adding
SonarQube makes three. Before deciding how to reconcile them, one correction to the premise this
task was scoped under:

**The real hard-enforced ceiling in this repo is 9, not 10.** Verified directly in
`eslint.config.mjs` (lines 188-189: `complexity: ['error', 9]`, `'sonarjs/cognitive-complexity':
['error', 9]`, scoped to `apps/admin/src` and, via `check-src-complexity-drift.ts`, to
`src/server/**` + `src/assistant/**`) and in both drift-check scripts'
own doc comments, which independently state the same "≤9 cyclomatic / ≤9 cognitive-complexity"
ceiling. The repo-wide default everywhere else is `warn`/15 (non-blocking). If "10" is written down
somewhere as the real ceiling, that's stale — update it to 9.

**Which number is authoritative:** the ESLint `error`/9 gate (`eslint.config.mjs` +
`check-admin-complexity-drift.ts` + `check-src-complexity-drift.ts` + their grandfathered
`*-complexity-debt.json` baselines). It's already wired into scoped drift checks that fail on any
*new* violation while tolerating tracked pre-existing debt — exactly the ratchet this repo wants,
and it's the one thing here that can actually run in CI today (once CI is unblocked) without a
server dependency.

**Recommendation: don't let SonarQube's number compete with it.** Treat Sonar's cognitive-complexity
score as informational dashboard context, never a second source of truth or a second gate. Two
concrete steps if the drift between them bothers you:
- Set Sonar's own threshold to match, so its dashboard doesn't just add a third disagreeing number:
  in the SonarQube UI, go to **Quality Profiles > TypeScript > (your profile) > Cognitive Complexity
  of functions should not be too high (`typescript:S3776`)**, copy the profile if needed, and change
  the parameter from its default of 15 to 9. This can't be set from `sonar-project.properties` —
  rule parameters live in Quality Profiles, not scanner properties.
- Do **not** wire Sonar's complexity rule into its Quality Gate as a blocking condition (see next
  section) — the ESLint gate already owns "blocking," and a second blocking gate on the same
  concept with a different engine's exact counting would just produce two different pass/fail
  verdicts on the same commit.

---

## The CI reality

**CI here is billing-blocked, not off.** Triggers fire on every push, but the runner never starts,
and all 8 gates in `.github/workflows/ci.yml` currently execute zero tests as a result. That means
a SonarQube CI integration **cannot be proven green today** — there is no way to demonstrate a
passing (or failing) Sonar CI step against this repo's actual CI, because CI doesn't run at all
right now regardless of what steps are added to it.

Given that, this setup deliberately has **no CI YAML changes**. The local path in this README is not
a stopgap alongside a CI integration — it's the whole thing, until CI billing is resolved. Adding a
`sonar-scanner` step to `ci.yml` today would be unverifiable and would sit dormant exactly like the
rest of that workflow currently does. Revisit once CI actually runs.

---

## Blocks vs reports — decided: reports, not blocks

This repo already made this exact call once: `check:architecture` is deliberately kept RED —
accountability over a green gate, so the failure stays visible instead of being hidden behind a
disabled check. The same reasoning applies to SonarQube's Quality Gate here, for an additional,
more concrete reason: **this codebase has known, already-accepted debt** (the repo-wide `warn`/15
complexity baseline, the `apps/admin` and `src` complexity debt lists, `check:architecture`'s own
red status) that a default Sonar Quality Gate would fail on over pre-existing code on day one — not
because of anything introduced by a given change, producing noise instead of signal.

`scan.sh` passes `-Dsonar.qualitygate.wait=false` explicitly, so a scan's exit code never fails on
gate status. Use the SonarQube web UI as a dashboard to triage new findings, not as a merge gate.
Revisit turning the gate into a real block only after both: (a) CI is unblocked so it could actually
run somewhere, and (b) it's scoped to **new code only** (Sonar's own "New Code" period feature) so
it can't fail on the pre-existing debt this repo has already, explicitly, decided to tolerate.

---

## What's unverified

- Whether `sonarqube:community` (vs. pinning `sonarqube:lts-community`) is the tag you want long
  term — `community` tracks latest, which is fine for a local evaluation instance but means the
  version can move under you across `docker compose pull`s. Pin to `lts-community` if that matters.
- Whether the `typescript:S3776` rule key is exactly right for the SonarQube version you end up
  running — rule keys are generally stable across versions but this was not checked against a
  running instance (none was started for this task).
