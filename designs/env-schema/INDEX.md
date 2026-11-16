# Env schema design — INDEX (2026-11-16)

Status: **COMPLETE** (design only; no source code changed). Open gaps are numbered at the end.
Measured against Tovu `origin/integ/wave-b-r2` @ `80b00f5b` and Jini `origin/integ/wave-b-r2` @ `02edbb68`.
Branch: `plan/env-schema-design-2026-11-16` (based on `plan/terra-2026-11-15`).

## Files

| File | What |
|---|---|
| `DESIGN.md` | Measurements, findings, the mechanism, the CI check, the migration, the owner-practice check, risks, owner decisions. |
| `VARS.tsv` | 525 rows: every env name. Columns: `name, repo, readers, phase, secret, default, decision, step`, then `kind, new_name, prod_read_sites, prod_files, in_env_example, also_in, evidence, note`. |
| `work/env-reads.mjs` | Read-only scanner (regex). `node env-reads.mjs <label> <repo-root> > reads.tsv`. |
| `work/build-vars.py` | Builds `VARS.tsv` from the scanner output and the classification rules it contains (`DECISION`, `NOT_ENV`, kind lists). |
| `work/reads-tovu.tsv.gz`, `work/reads-jini.tsv.gz` | Every scanner hit: `repo, name, file, line, kind, scope, area`. Names and paths only, no values. |

Reproduce:
```
node work/env-reads.mjs tovu <Tovu checkout> > t.tsv
node work/env-reads.mjs jini <Jini checkout> > j.tsv
python3 work/build-vars.py t.tsv <Tovu checkout> j.tsv <Jini checkout> <Tovu checkout>/.env.example   # run from work/
```

## Headline numbers

| | Tovu | Jini |
|---|---|---|
| Product env names | **166**: keep 159, rename 3, delete 4 | **104**: keep 100, rename 4 |
| By role | config 77, launch binding 40, dev flag 27, OS 8, runtime 5, test hook 6, build 2, vendor 1 | OS 28, vendor pass-through 25, config 18, launch binding 17, dev flag 12, runtime 2, test hook 2 |
| Secret names | 19 | 12 |
| Script/build-only names | 45 | 12 |
| Test-only names | 118 | 80 |
| Listed in `.env.example` | 63 (92 names read in product code are not listed) | no file |
| Files touching `process.env` directly | 147 (349 sites) | 59 in packages (104 sites) + 6 in examples |

In VARS.tsv, `kind` is the variable's role and `secret` is a separate yes/no column.

## The mechanism in five lines
1. A schema is a plain list of specs (name, type, accepted words, default, secret, readers, phase, what to
   do when wrong, docs). Types and a pure parser live in `@jini-ai/core`; no dependency.
2. Hosts own the schemas: Tovu in `apps/website/src/contracts/env/`, Jini in its two host presets (`server`, `cli`).
3. Only process entry points touch `process.env`. They parse once, print every problem in plain words that
   name the variable and the fix, warn by default, and stop boot only for the short list that stops boot today.
4. Jini domain packages take typed values or ports. The gate extends the existing
   `@jini-ai/devops/checks/hardwiring` rule and its debt ratchet with `HW9-env-access`, `HW10-env-name`,
   `HW11-env-dynamic`. An env name that is not in the schema fails from day one.
5. `.env.example`, the environment docs, `REQUIRED_SECRETS` and `STARTUP_SECRET_KEYS` are generated or
   derived from the schema.

## Steps (each green alone)

| Jini | | Tovu | |
|---|---|---|---|
| J0 | gate + baseline, publish devops | T0 | schema data for 166 names, gate in Tovu mode |
| J1 | contract in core, preset schemas, generated docs | T1 | generated `.env.example` + docs, derived secret lists |
| J2 | platform and OS environment: required `hostEnv` | T2 | OS and runtime facts |
| J3 | server, daemon, mcp, sidecar, cli: values and getters instead of name + map | T3 | server process config (after the deps/app split: D2) |
| J4 | agent-runtime, integrations | T4 | launch bindings parent → child, 3 renames |
| J5 | examples, dev flags, test hooks | T5 | features, platform, assistant, families |
| J6 | 4 Tovu-named names in Jini plugins | T6 / T7 | desktop main / browser builds |
| J7 | debt empty, drop the old allowance | T8 / T9 | dev flags, scripts, tests / deletes, debt to zero |

Order: J0 → J1 → T0 → T1, then J2–J5 and T2/T5/T7 in parallel where files are disjoint; T3 then T4 then T6;
T8, J6, T9, J7 last. Estimate (rough, ±50%): **0.4M Opus + 4.2M Sonnet**, about 14 lane runs.

## Owner decisions (details in DESIGN.md §8)
- **D1** May Jini's host presets and `bin/` entries read `process.env`? Recommended: yes, only they.
- **D2** Tovu T3 before or after the `deps.ts` / `app.ts` size splits? Recommended: after.
- **D3** Delete `TOVU_AGENT_NATIVE_FALLBACKS`, `TOVU_AGENT_FORBID_BASH`, `TOVU_CONSENT_REGION_HEADER`? Recommended: yes; each changes behaviour slightly.
- **D4** Which invalid values may stop boot? Recommended: only what stops boot today.
- **D5** Allow-listed child environments and scrubbing secrets from `process.env`? Recommended: later, as its own security change.
- **D6** Rename the four `TOVU_*` names inside Jini plugins now? Recommended: yes.
- **D7** Opaque secret wrapper type? Recommended: no.

## Flagged conflicts with owner practices
- Practice 1 against the existing gate text: `HW1-env-default` allows `?? process.env`; this design removes that.
- Practice 1 read literally also forbids the host presets from reading env (D1).
- Practice 4 (feature slicing): schema slices sit by area in one folder, not inside each feature (DESIGN §5 row 4).

## Open gaps (what the executor must close first, in T0)
1. Defaults: 12 of 166 Tovu defaults were read from code, 45 are quoted from `.env.example` prose, 91 are
   marked `NOT VERIFIED`. Jini defaults are mostly unverified.
2. `phase` is a path-and-line heuristic; `prod_read_sites` is an upper bound (doc-comment mentions count).
3. Nothing was installed or run: no typecheck, no tests, no gate run.
4. Not verified: that the OTel SDK reads the four `OTEL_*` names; how `JINI_CORE_VERSION` reaches the admin
   bundle; that Vite configs and dev scripts can import the schema folder cleanly; which launcher sets
   `TOVU_STOP_ON_STDIN_EOF`; desktop preload reads; how many Tovu call sites rely on a Jini `env` default.
5. The brief said the lessons file has 22 rules and that `env-sprawl.tsv` has file and line columns. The
   lessons file has 11 rules (all applied) and the TSV has no line column (lines here come from my scan).
6. An earlier commit of `VARS.tsv` on this branch quoted the development placeholder for
   `ANALYTICS_ROOT_KEY_SEED` as its default. It is a public, deliberately insecure placeholder that is already
   in the source, not a real secret; the current file no longer copies defaults of secret variables.
