# Env schema design — INDEX (2026-11-16, r2)

Status: **COMPLETE, revised after the Codex judgment** (design only; no source code changed).
Judge findings: **12 accepted, 0 rebutted, 0 blockers left** (`DESIGN.md` → "Judge response").
Measured against Tovu `origin/refactor/terra` @ `80b00f5b` and Jini `origin/refactor/terra` @ `02edbb68`.
Branch: `plan/env-schema-design-2026-11-16`.

## Files

| File | What |
|---|---|
| `DESIGN.md` | Measurements, findings, the mechanism, the bootstrap sequence, the CI check, the migration, the owner-practice check, the 26 lessons, risks, owner decisions, judge response. |
| `CODEX-JUDGE.md` | The adversarial review this revision answers. |
| `VARS.tsv` | 560 rows: every env name. Columns: `name, repo, readers, phase, secret, default, decision, step`, then `kind, new_name, prod_read_sites, prod_files, in_env_example, also_in, evidence, note, surface`. |
| `work/env-reads.mjs` | Read-only scanner (regex). Comment-line hits are tagged `comment:*` and not counted. |
| `work/build-vars.py` | Builds `VARS.tsv`: classification rules, `DECISION`, `NOT_ENV`, and `DECLARED_SETS` (nine hand-read lists of names that are only read through a computed key). |
| `work/counts.py` | Prints the numbers of DESIGN §0.1 from `VARS.tsv` and the scanner outputs. |
| `work/refusal-census.py`, `.tsv` | 56 candidate sites where product code throws or exits next to an env name. 5 classified, 51 to classify in T0/J1. |
| `work/reads-tovu.tsv.gz`, `work/reads-jini.tsv.gz` | Every scanner hit: `repo, name, file, line, kind, scope, area`. Names and paths only. |

Reproduce (from `work/`):
```
node env-reads.mjs tovu <Tovu checkout> > t.tsv
node env-reads.mjs jini <Jini checkout> > j.tsv
python3 build-vars.py t.tsv <Tovu checkout> j.tsv <Jini checkout> <Tovu checkout>/.env.example
gzip -9c t.tsv > reads-tovu.tsv.gz; gzip -9c j.tsv > reads-jini.tsv.gz
python3 counts.py reads-tovu.tsv.gz reads-jini.tsv.gz
python3 refusal-census.py <Tovu checkout> <Jini checkout> > refusal-census.tsv
```

## Headline numbers

| | Tovu | Jini |
|---|---|---|
| Product env names | **176**: keep 175, delete 1, rename 0 | **147**: keep 147, rename 0 |
| ...with a read expression / only in a declared list / only named | 146 / 13 / 17 | 74 / 47 / 26 |
| By role (`kind`) | config 76, launch binding 38, dev flag 27, OS 20, runtime 6, test hook 6, build 2, vendor 1 | vendor 58, OS 42, launch binding 17, config 14, dev flag 12, runtime 2, test hook 2 |
| By who can store the name (`surface`) | operator 83, operator+launcher 3, vendor 1, launcher 35, platform 26, developer 28 | vendor 58, platform 44, launcher 17, operator 14, developer 14 |
| Secret names | 18 | 32 |
| Script/build-only names | 40 | 12 |
| Test-only names | 116 | 67 |
| Not env (kept as rows) | – | 2 Cloudflare worker bindings |
| Listed in `.env.example` | 63 (90 names read in product code are not listed) | no file |
| Files touching `process.env` directly | 125 (264 sites) | 52 (83 sites; 46 files in packages) |

What changed since the first pass: comment lines are no longer counted as reads (1,120 hits removed);
60 names that exist only inside declared lists were added; 7 renames and 3 deletes were withdrawn.

## The mechanism in six lines
1. A schema is a plain list of specs (name, type, accepted words, default, secret, readers, phase, who
   validates it, when it is active, docs). Types and a pure parser live in `@jini-ai/core`.
2. Hosts own the schemas: Tovu in `apps/website/src/contracts/env/`, Jini in its two host presets.
3. **The parser never stops boot.** It warns in plain words that name the variable and the fix. Values that
   stop boot today keep their own validator, error and timing (`validation: 'owner'`).
4. **No single snapshot.** The server entry has a fixed sequence S0–S7: credentials are consumed at import,
   startup secrets arrive over IPC, tokens are minted, and only then is the config parsed. Secrets stay behind
   their owner's accessor and are never copied into the config.
5. **Names an operator can store are frozen.** No rename, no delete, so no install needs a migration.
6. The gate extends `@jini-ai/devops/checks/hardwiring` with `HW9-env-access`, `HW10-env-name`,
   `HW11-env-config-dynamic`, `HW12-env-import-time`. Code whose job is to transform an environment is a
   declared, permanent class; Cloudflare worker bindings are a separate class.

## Steps (each green alone, with the compile/build matrix in DESIGN §4.2)

| Jini | | Tovu | |
|---|---|---|---|
| J0 | gate file, `HW9` + `HW12`, baseline, wider scan roots | T0 | schema data for 176 names, census classified, bootstrap tables, gate on |
| J1 | contract in core, preset schemas, docs, `HW10` + `HW11` on, publish | T1 | generated `.env.example` + docs, derived secret lists |
| J2 | platform and OS environment: required `hostEnv` | T2 | OS and runtime facts |
| J3 | server, daemon, mcp, sidecar, cli: value or getter plus label | T3a / T3b | entries / `deps.ts` + `app.ts` (after the size splits: D2) |
| J4 | agent-runtime, integrations | T4 | launch bindings parent → child (no renames) |
| J5 | examples, dev flags, test hooks | T5 | features, platform, assistant, families (after T3b) |
| J7 | debt empty, drop the old allowance | T6 / T7 | desktop main / browser builds |
| | | T8 / T9 | dev flags, scripts, tests / delete `TOVU_ALLOWED_ORIGINS`, debt to zero |

```
J0 → J1 → publish → T0 → T1
J1 → J2 → J3(after untangle C6) → J7        J1 → J4 → J7        J1 → J5 → J7
T0 → T2 (after J2 bump)      T0 → T7      T0 → T3a → [size designs 01/02] → T3b → T4 → T6 → T8
T3b → T5 → T8                J3 → T9      T8 → T9
```

Estimate (rough, ±50%): **0.5M Opus + 4.4M Sonnet**.

## Owner decisions (details in DESIGN.md §8)
- **D1** May Jini's host presets and `bin/` entries read `process.env`? Recommended: yes, only they.
- **D2** Tovu T3b before or after the `deps.ts` / `app.ts` size splits? Recommended: after.
- **D3** Rename or delete any operator-set name? Recommended: **no, freeze them.** For a value injected by a
  hosting platform, an automatic migration can only be a translation table that stays forever.
- **D4** Turn an existing non-critical boot refusal into a warning? Decide per row once T0 classifies the census.
- **D5** Allow-listed child environments and more scrubbing of `process.env`? Recommended: later, on its own.
- **D6** "No Tovu in Jini" for `agent-plugins` (151 files mention Tovu). Recommended: untangle plan, not here.
- **D7** Opaque secret wrapper type? Recommended: no.
- **D8** `process.env.NODE_ENV` in browser-runtime Jini packages as an allowed build define? Recommended: yes.

## Flagged conflicts with owner rules and practices
- **"No long-lived aliases" against "existing installs keep working, the user never fixes anything":** both
  hold only if operator-set names are never renamed (D3). This design freezes them.
- Practice "Jini never reads `process.env`": the existing gate text allows `?? process.env` (removed here);
  the host presets read env (D1); browser-runtime packages keep the bundler define (D8).
- Practice "no specific server framework in Jini": the first pass proposed a new signature returning
  Express's `RequestHandler`; corrected. Existing Express use in `daemon` is the untangle plan's debt.
- Practice "errors never generic": `media-store.ts:66,72` throws a plain `Error` today. Kept as is (no silent
  change), flagged.
- Practice "feature slicing": schema slices sit by area in one folder, not inside each feature.

## Open gaps (what the executor must close first, in T0 / J1)
1. Declared lists not yet read by hand, so not in the totals: `agent-runtime/src/defs/*`,
   `model-discovery-adapters.ts`, `claude-code-models.ts`, `executables.ts`, and prefix/suffix patterns
   (`agent-daemon-scope.ts:1107`).
2. Defaults: 153 rows still say `NOT VERIFIED`.
3. Refusal census: 51 of 56 candidate sites are not classified.
4. `phase` is a path-and-line heuristic. The S0–S7 table is written for the server entry only; `serve`, the
   daemon entry and desktop main need theirs before their readers move.
5. Nothing was installed or run: no typecheck, no tests, no gate run. Not verified: the sidecar IPC test
   seam; per-package compiler settings (`verbatimModuleSyntax`); that the OTel SDK reads the four `OTEL_*`
   names; that Vite configs and dev scripts can import the schema folder cleanly.
6. How many installs set any of the frozen names is unknown, and is why they are frozen.
