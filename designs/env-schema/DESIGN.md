# One settings/env schema per repo — DESIGN r2 (2026-11-16, planning only)

Measured against Tovu `origin/refactor/terra` @ `80b00f5b` and Jini `origin/refactor/terra` @ `02edbb68`
(the same commits the first pass and the judge used). No source code was changed. No secret value appears
in this folder (names only).
Personas: software-architect (lead), devops, security, programmer, tdd. Skills: implementation-guardrails,
hexagonal-architecture, testable-design-patterns, test-design, security-review.

**r2 = revision after the Codex judgment (`CODEX-JUDGE.md`, "needs rework": 2 blockers, 8 majors, 2 minors).**
Every finding was re-checked against the code. All 12 are accepted; none is rebutted. The answer to each is in
[Judge response](#judge-response) at the end. Text marked **r2** changed because of it.

## Summary
1. **Today (re-measured, comment lines no longer counted):** Tovu has **176** product env names (146 with a
   read expression, 13 found only in a declared list, 17 only named by a launcher or `.env.example`). Jini has
   **147** (74, 47, 26) and no list at all. Product code touches `process.env` / `import.meta.env` directly in
   **125** Tovu files and **52** Jini files.
2. **Target:** each repo has one schema: a plain list of specs. One pure parser turns `(schema, env map)` into
   a frozen typed config plus plain-words warnings. **The parser never stops boot.** The few places that stop
   boot today keep their own validators.
3. **Jini:** contract (types + pure parser + renderers) in `@jini-ai/core`. Jini domain packages read no env.
   Only the two host presets (`server`, `cli`) and `bin/` entries own a schema.
4. **r2 — names are an installation surface.** A name an operator can have stored anywhere (a dashboard, a
   compose file, a shell profile) is **frozen**: no rename, no delete. Result: **0 renames** (was 7) and
   **1 delete** (was 4: the one name nothing can read). The two CLI deny switches stay.
5. **r2 — no single "snapshot at the entry point".** Credentials are consumed at import time and arrive later
   over startup IPC. §2.6 gives the real sequence, the owner of each value and each handoff.
6. **Gate:** extend the existing owner `@jini-ai/devops/checks/hardwiring` with four env rules and its debt
   ratchet. Environment-as-data code (child env builders, allow-lists) is a permanent, declared class, not debt.
7. **Migration:** 7 Jini steps (J0–J5, J7) and 10 Tovu steps (T0–T9, T3 in two parts), each with its own
   compile/build matrix.
   Rough cost **0.5M Opus + 4.4M Sonnet** (±50%).
8. **Owner decisions:** 8, in §8. One real conflict between two owner rules is flagged there (D3).

Files: `VARS.tsv` (560 rows), `INDEX.md`, `CODEX-JUDGE.md`, `work/env-reads.mjs` (scanner),
`work/build-vars.py` (builds VARS.tsv), `work/counts.py` (prints §0.1), `work/refusal-census.{py,tsv}`,
`work/reads-{tovu,jini}.tsv.gz` (every hit).

---

## 0. What was measured, and what was not

### 0.1 Counts ("product" = not tests, not scripts, not build config, by path; comment lines excluded)

| | Tovu | Jini |
|---|---|---|
| Product env names | **176** (175 keep, 1 delete) | **147** (all keep) |
| ...with a read expression in product code | 146 | 74 |
| ...only inside a declared list, read through a computed key (**r2**, hand-read) | 13 | 47 |
| ...only named (set for a child, or listed in `.env.example`) | 17 | 26 |
| Secret names | 18 | 32 |
| By who can store the name (`surface` column) | operator 83, operator+launcher 3, vendor 1, launcher 35, platform 26, developer 28 | vendor 58, platform 44, launcher 17, operator 14, developer 14 |
| Script/build-only names | 40 | 12 |
| Test-only names | 116 | 67 |
| Rows that are not env at all | 13 constants/comments (not in the file) | 2 worker bindings (kept, `decision = not-env`) |
| Files touching `process.env`/`import.meta.env` directly | 125 (264 sites) | 52 (83 sites; 46 files in packages) |
| Named direct reads | 86 | 20 |
| Whole-object uses of `process.env` | 172 (48 passed on, 57 `= process.env` defaults, 62 child `env:`, 5 spreads) | 59 (22, 32, 3, 2) |
| Named reads on an injected map | 245 | 112 |
| Computed-key reads | 44 (5 on `process.env`) | 91 (2 on `process.env`) |
| Scanner hits on comment lines (now excluded) | 820 in product files | 300 |
| Listed in `.env.example` | 63 (90 names read in product code are not listed) | no file |

The first pass counted comment mentions as reads (judge finding 11), which is why "147 files / 349 sites"
became 125 / 264 and why browser `DEV` reads are **5**, not 7. Two Tovu names (`JINI_DAEMON_TOKEN`,
`TOVU_AGENT_PLUGIN_OVERLAYS_DIR`) turned out to be comment-only in product code and are now test-only rows.

### 0.2 Limits (regex scanner, nothing run)
- The scanner sees `process.env.X`, `process.env['X']`, `import.meta.env.X`, destructuring, `<…env>.X`, any
  `.TOVU_X` / `.JINI_X` member (**r2**), computed keys, and `TOVU_`/`JINI_` literals and object keys.
- **r2 — declared lists.** A name that appears only inside an array, map or object literal is invisible to a
  read-expression scan. `build-vars.py` `DECLARED_SETS` now adds nine such lists, each read by hand at the
  cited lines (provider credentials, agent and login-shell allow-lists, proxy names in both spellings, the
  Postgres child env, agent identity keys, host signals, two Tovu child allow-lists). **Not yet hand-read:**
  `agent-runtime/src/defs/*`, `model-discovery-adapters.ts`, `claude-code-models.ts`, `executables.ts`, and
  prefix/suffix patterns such as `excludedPrefixes: ["TOVU_", "JINI_"]` (`agent-daemon-scope.ts:1107`). Those
  names are **not** in the totals above (open gap 1).
- `prod_read_sites` is a count of non-comment hits. A string that only looks like a read can still be counted.
- **Phase is a heuristic** (path, plus "is the read behind `=>`"). Hand-checked only where quoted here.
- **Defaults:** 153 rows still say `NOT VERIFIED`. T0 fills them; the characterization test proves each.
- Nothing was run: no install, no typecheck, no tests. Commands are quoted from `package.json`.

---

## 1. Findings that shape the design

1. **An owner for the rule exists.** `packages/devops/src/checks/hardwiring.ts` has `HW1-env-default`, which
   *allows* `?? process.env`. Jini runs it from `scripts/guard.ts`; Tovu from CI. It scans package `src`
   trees only (`scripts/check-hardwiring.ts:22-25`, `scripts/lib/package-sources.ts:48-60`): plugin payloads
   and examples are outside it.
2. **Jini mostly takes an env map already, then falls back to the ambient one**
   (`backend-config.ts:103`, `tool-execution-routes.ts:84`). The work is deleting defaults.
3. **Jini also takes the variable's NAME from the host** (`tokenEnvVar`, `allowedOriginsEnvVar`, …) and reads
   `env[name]`, and it prints that name in refusals (`tool-execution-routes.ts:69-76`).
4. **In Tovu an env map is three things:** the OS environment, the transport from a parent to a child, and an
   in-process per-site snapshot (`agent-daemon-scope.ts:167`). The parser must work on any map.
5. **Names are duplicated on both sides of every launch** (38 launch bindings no operator should set).
6. **Other lists of env names already exist and drift:** `REQUIRED_SECRETS` (`deploy-config.ts:216`),
   `STARTUP_SECRET_KEYS` (`startup-secrets.ts:4`), `BASELINE_AGENT_ENV_KEYS`, `.env.example`, `Dockerfile`,
   compose, the Admin deployment page (`apps/admin/src/features/deployment/rules.ts:355`,
   `deployment-overview.ts:95`).
7. **Some names come from declarations or saved data, not code:** host signals, object-store declarations,
   static-publish credentials, admin-surface public config, a site's saved `storage.secretRef.env`
   (`site-key-dependent-data.ts:80`), Jini `PROVIDER_CREDENTIAL_ENV_VARS`.
8. **At least five boolean dialects.** The schema records each variable's accepted words.
9. **r2 — credentials are consumed before `main()` runs.** `local-owner-signin.ts:111` reads and deletes two
   keys while the module is being imported; startup secrets arrive later over IPC
   (`startup-secrets.ts:26-32`, awaited at `index.ts:153`); tokens then move into in-memory holders
   (`daemon-access.ts`). A design that says "parse once, first statement" is wrong here.
10. **r2 — several switches are security vetoes.** `TOVU_AGENT_FORBID_BASH=1`,
    `TOVU_AGENT_NATIVE_FALLBACKS=0|false`, `TOVU_AGENT_FULL_CLI_ACCESS=0|false` and
    `TOVU_AGENT_PERMISSION_MODE=restricted` each deny local CLI access on their own
    (`assistant-native-fallbacks.ts:46-54,60-66`). Access defaults ON when the setting is absent.
11. **r2 — an object called `env` is not always strings.** In the Cloudflare worker payload `env.TOVU_FORMS`
    is a D1 database and `env.ASSETS` an asset fetcher (`forms-receiver.mjs:27,80,298`).

The untangle DESIGN never mentions env. It does say core may not read `process` (gate `L6-base-purity`),
hosts own composition roots, and `server`/`cli` are host presets. This design follows that.

---

## 2. The mechanism

### 2.1 Pieces and where they live

| Piece | Home | Why there |
|---|---|---|
| Spec/issue types | `@jini-ai/core` `src/contracts/env.ts` | Shared vocabulary for two hosts. Types only. |
| `parseEnv`, `formatEnvIssue`, `describeEnvForDiagnostics`, `renderEnvExample`, `renderEnvDocs`, `launchEnvFor` | `@jini-ai/core` `src/env/*.ts` | Pure, no `process`, no `node:*`, no dependency. |
| Jini preset schema | `packages/server/src/env/schema.ts`, `packages/cli/src/env/schema.ts` | The only Jini code that is a host. |
| Tovu schema | `apps/website/src/contracts/env/*.schema.ts` + `tovu-env.ts` | Next to the existing env policy modules. **To verify in T0:** Vite configs and scripts can import it without pulling server code. |
| Gate | `@jini-ai/devops` `src/checks/env-access.ts` | Existing owner of the rule and of the ratchet (`hardwiring.ts` is 406 lines; a sibling keeps both under 500). |
| Generated files | `.env.example`, environment docs | Rendered from the schema, `--check` in CI. |

Rejected: a schema library; a Jini package of its own; a `SecretValue` wrapper class (D7).

### 2.2 The spec (sketch; r2 changes marked)

```ts
export type EnvValueType = 'string' | 'int' | 'flag' | 'enum' | 'url' | 'origin' | 'path' | 'list' | 'json' | 'duration-ms';
export type EnvKind = 'config' | 'launch-binding' | 'dev-flag' | 'test-hook' | 'ambient' | 'vendor' | 'external' | 'build';

export interface EnvVarSpec<Field extends string = string> {
  readonly name: string;
  readonly field: Field;
  readonly kind: EnvKind;                     // role only
  readonly secret: boolean;                   // r2: confidentiality is its own axis, not a kind
  readonly type: EnvValueType;
  readonly accepts?: { readonly on?: readonly string[]; readonly off?: readonly string[]; readonly values?: readonly string[]; readonly min?: number; readonly max?: number };
  readonly default?: string;
  readonly readers: readonly string[];
  readonly phase: 'build' | 'import' | 'boot' | 'live';   // r2: 'import' = consumed during module evaluation
  readonly setBy: 'operator' | 'launcher' | 'platform' | 'ci';
  readonly validation: 'schema' | 'owner';    // r2: 'owner' = the parser hands the raw string on, unjudged
  readonly owner?: string;                    // r2: file of the validator that owns it (required for 'owner')
  readonly activeWhen?: { readonly name: string; readonly in: readonly string[] };   // r2
  readonly overriddenBy?: string;             // r2: e.g. '--host'. Docs only; precedence is the entry point's job
  readonly security?: 'deny-switch' | 'trust-widening';    // r2: see §2.4a
  readonly delivery?: 'env' | 'startup-ipc' | 'consume-at-import';   // r2: only 'env' fields exist in the config
  readonly display?: 'value' | 'presence';    // r2: what diagnostics may show; default 'presence'
  readonly deploy?: 'boot-blocking' | 'recommended';
  readonly locksSetting?: string;
  readonly doc: { readonly section: string; readonly summary: string; readonly fix: string; readonly example?: string };
}
export interface EnvFamily { readonly id: string; readonly source: 'pattern' | 'declaration' | 'saved-data'; readonly secret: boolean; readonly reader: string; readonly doc: EnvVarSpec['doc'] }
/** r2: never holds a raw value. Built inside parseEnv, at the boundary. */
export type EnvValueEcho = { readonly kind: 'unset' } | { readonly kind: 'hidden'; readonly length: number } | { readonly kind: 'shown'; readonly text: string };
export interface EnvIssue { readonly name: string; readonly problem: 'missing' | 'invalid' | 'unknown-name'; readonly received: EnvValueEcho; readonly expected: string; readonly usedInstead?: string; readonly fix: string }

/** Pure. O(s + e) for s specs and e env entries; no I/O; never logs; never throws on a bad value. */
export function parseEnv<C>(
  required: { readonly schema: EnvSchema<C>; readonly env: Readonly<Record<string, string | undefined>> },
  optional: { readonly declared?: readonly EnvVarSpec[] } = {},
): { readonly config: C; readonly sources: Readonly<Record<string, string>>; readonly issues: readonly EnvIssue[] };
```

Owner limits inside the files (lesson 8):
- `parseEnv` orchestrates four helpers (`readOne`, `coerce`, `checkUnknownNames`, `assemble`), each under 50 lines.
- Coercion is a lookup table `COERCERS: Record<EnvValueType, Coercer>` (a 10-arm `switch` would be complexity 11).
- Every exported function takes `(required, optional = {})`.
- A slice is a declarative array of about 40 specs. Tovu needs about 9 slices.
- `tovu-env.ts` builds one schema value from the slices. It is not a re-export shell.
- **r2 (lesson 20):** "is it set" is `value !== undefined && value.trim() !== ''` everywhere, written once in
  `readOne`. No truthiness checks on coerced values (`0`, `false` and `""` are real values). The config is
  deep-frozen and `list`/`json` fields are frozen copies, so no consumer can mutate what another reads.

`sources` maps a config field back to the variable that set it, because existing code shows the **name** to
the user (`fullCliEnvLock`, `media-store.ts:66,72`).

### 2.3 Validation: who judges a value, when, and what wins (r2, rewritten)

**The parser never refuses.** It warns and uses the default. A refusal is thrown only by the validator that
throws it today, at the point where it throws it today, with the same typed error and text.

Three rules replace the first pass's "closed refuse list":

1. **`validation: 'owner'`** — the value has an existing validator with its own rules. The parser passes the
   raw string through as `string | undefined` and reports nothing. The owner stays the single judge. Verified
   so far:

   | Variable | Owner | Today |
   |---|---|---|
   | `TOVU_HOST` (and `--host`) | `server/runtime/boot/bind-host.ts:66-80` | Invalid value throws `ValidationError`. **Security:** falling back would widen the listener. The fallback when unset differs by entry (`serve.ts`: loopback; `index.ts`: all interfaces), so the default is the entry's argument, not the spec's. |
   | `TOVU_TRUST_PROXY` | `server/inbound/shared/trust-proxy.ts:28-41` | `true` throws at app construction. |
   | `TOVU_MEDIA_BLOB_STORE` + declared companions | `features/object-storage/media-store.ts:66,72` | Unknown selector or missing companion throws (a plain `Error`: see §5 row 9). |
   | Startup-secret IPC | `server/runtime/boot/startup-secrets.ts:30` | Malformed delivery throws. |
   | `JINI_SQLITE_BACKEND`, `JINI_PG_*` | `packages/server/src/storage/backend-config.ts:44-110` | Unknown backend throws; the `JINI_PG_*` fields are judged **only when** the backend is `postgres`. |
   | `TOVU_LOCAL_SITE_LIMIT` | `server/runtime/lifecycle/local-site-host.ts:17-20` then the supervisor | Warm mode turns `limit` into `max(1, limit - 1)` before the supervisor validates. Same raw value, two contexts. |

2. **`activeWhen`** — a spec that only matters under another setting (`JINI_PG_SSL_MODE` when
   `JINI_SQLITE_BACKEND` is `postgres`) is neither coerced nor warned about while inactive. A wrong but unused
   value changes nothing, exactly as today.
3. **Precedence is decided once, by the entry point, before the owner is called:** command-line flag, then
   environment, then the entry's own fallback. The spec records the flag in `overriddenBy` so the docs and the
   warning text can say "set by `--host`". The parser never sees flags.

**Census.** `work/refusal-census.tsv` lists every product `throw` / `process.exit(` with an env name in the
six lines above it: **56 candidate sites** (45 Tovu, 11 Jini). Five are classified. **T0 and J1 may not move a
reader until every row is classified** as boot refusal, request-time error or launch-contract check. The
first pass claimed its list was exhaustive; it was not (it missed `TOVU_HOST`).

**Owner rule "never a boot refusal in production for a non-critical value".** This design adds no refusal.
If the census finds an existing boot refusal for a non-critical value, turning it into a warning is a visible
behaviour change and goes to the owner as a one-line decision (D4), never silently.

Warning text is built by `formatEnvIssue` from the spec. Plain words, the variable, the fix:

```
TOVU_SITE_CHAT_RATE_LIMIT is set to "abc". Tovu expected a whole number from 1 to 1000.
Tovu is using 60 instead.
To fix: set TOVU_SITE_CHAT_RATE_LIMIT to a number such as 60, or remove it.

TOVU_PUBIC_URL is set, but Tovu has no setting with that name. Did you mean TOVU_PUBLIC_URL?
Nothing was changed. To fix: rename it where you set it.
```

(The variable in the first example is illustrative; T0 picks a real schema-validated one.)

Other rules, unchanged from the first pass: all issues are printed, not the first; a missing value that is
only *recommended* in production warns (as `boot-readiness-gate.ts` does now); an unknown `TOVU_*`/`JINI_*`
name warns with the nearest known name; **parity first** — each spec's `accepts` reproduces today's accepted
words, and any new warning for input that is silently accepted today is listed in the step's report.

### 2.4 Confidentiality (r2, rewritten)

Confidentiality is a separate axis from role (`secret`, not a `kind`). Four layers, none replaces another:

1. **Existing shape redaction stays the owner of "this text looks like a secret".**
   `packages/contracts/src/secret-redaction.ts` (`redactSecretShapes`, vendor shapes from Jini core
   `SECRET_SHAPE_PATTERNS`) and the diagnostics `url_credentials` rule are untouched. So is
   `sanitizeDaemonUrlForDisplay` (`packages/cli/src/daemon-url.ts:104-114`). `scripts/check-log-safety.mjs`
   is a check on logging syntax, not a name list. **The first pass was wrong to say these would "take names
   from the schema": neither keeps a name list.**
2. **Env-map display is an allow-list.** `describeEnvForDiagnostics({ schema, env })` shows a value only when
   its spec says `secret: false` **and** `display: 'value'`. Everything else prints as `set (12 characters)`
   or `not set`: secrets, unknown names, and every family name (object-store credential fields, a site's
   `storage.secretRef.env` connection string, provider keys). A name that is not in the schema can therefore
   never leak a value. `url` and `origin` values pass through a userinfo-and-query stripper first, because a
   non-secret URL setting can carry credentials. The result still goes through layer 1.
3. **Issues cannot carry a secret.** `EnvIssue.received` is an `EnvValueEcho`, built inside `parseEnv` with
   the same rule as layer 2. There is no raw-value field on the issue or on any error, so `JSON.stringify`,
   `util.inspect`, `.stack` and a rebuilt `Error` are all safe by construction.
4. **Redaction is not permission to disclose (lesson 24).** Which variables are set is itself operator
   information. Env diagnostics go to stderr, the server log file and the owner-only Admin system page.
   Never to a visitor-facing response; telemetry gets counts only.

Also: a `secret: true` spec may not have a `*-build` reader or a `VITE_` name (schema test); `.env.example`
renders a secret as `NAME=` with its `fix` text; the generator has no access to values.

**Startup delivery stays as it is.** `STARTUP_SECRET_KEYS` becomes "specs with `delivery: 'startup-ipc'`",
pinned first by a literal test. Fields with `delivery !== 'env'` are **not part of the config object**: their
single owner keeps them behind its accessor (§2.6), so no second long-lived copy of a credential is created.

Not in this design: building child environments from an allow-list everywhere (D5).

### 2.4a Security switches (r2, new)

A spec with `security: 'deny-switch'` (the four CLI switches in finding 10) or `'trust-widening'`
(`TOVU_TRUST_PROXY`, `TOVU_HOST`, `TOVU_DEV_*` owner sign-in) gets three guarantees:
- It is never deleted, renamed, defaulted differently or given a new accepted word by a migration step. A
  schema test pins the list of such specs and their deny values with an inline literal (AP6).
- Each has its own deny test at an outcome only it protects (lesson 21): with exactly that one switch set and
  nothing else, `resolveFullCliAccess` is `false`, `fullCliEnvLock` returns that switch's name, and for
  `TOVU_AGENT_FORBID_BASH` the strict prompt block is selected (`assistant-system-overlay.ts:144-147`).
- A removal can only happen as its own security change with owner sign-off, and only if the old deny value
  keeps denying. A warning is not a restriction.

### 2.5 Families, declared lists and native bindings (r2)

**Families** cover names the schema cannot list in advance. Each has exactly one reader file.

| Family | Names come from | Secret | Reader today |
|---|---|---|---|
| F1 host signals | plugin `HostSignal.env` declarations | no | `contracts/core/host-signals.ts:84` |
| F2 object-store settings | `ObjectStoreEnvDeclaration` | some fields | `features/object-storage/media-store.ts:70-78` |
| F3 static-publish credentials | deploy-target declarations | yes | `features/deployments/static-publish/credentials.ts:133,147` |
| F4 admin-surface public config | names a plugin surface declares, narrowed by the host pattern `^TOVU_…_(APP_ID\|CLIENT_ID\|BROWSER_KEY\|PUBLIC_KEY)$` | no | `features/agent-plugins/admin-surfaces/public-config.ts:15-27` |
| F5 per-site storage secret reference | the site's **saved** `storage.secretRef.env` | **yes, always** | `platform/site-dir/site-key-dependent-data.ts:80`, `cli/commands/storage-move.ts:42` |
| F6 provider credentials (Jini) | `PROVIDER_CREDENTIAL_ENV_VARS` and agent definitions | yes | `integrations/…/dispatch/credentials.ts:16-21`, `daemon/src/http/research.ts`, `agent-runtime/src/defs/*` |

F6 was called an "open set" in the first pass. It is finite and inspectable: 20 names in one map. They are in
VARS.tsv now. A family is for names that come from **installed or saved data** (F1–F5), not for lists that
sit in source.

**Declared lists in source** (allow-lists, credential maps) stay where they are, as domain policy. The schema
does not copy them. A schema test imports each list and asserts every name in it has a spec of kind
`ambient` or `vendor`, so the list and the docs cannot drift, and the security list is still owned by its
security owner (`BASELINE_AGENT_ENV_KEYS` is not merged with anything).

**Native bindings are not env.** A Cloudflare worker's `env` holds objects (`TOVU_FORMS` is a D1 database
with `prepare()`, `ASSETS` an asset fetcher) and `secret_text` bindings (`TOVU_FORMS_SECRET`). The plugin
creates both names and the code that reads them in **one** upload (`cloudflare/lib/forms.mjs:273-282`), so
they are a contract inside the plugin, not an installation setting and not a string map. They are outside the
schema, outside `parseEnv`, and VARS.tsv marks both `not-env`. The gate treats worker modules as their own
class (§3). Whether the binding names may contain `TOVU` is the untangle plan's question (D6).

### 2.6 The real bootstrap sequence and who owns each value (r2, rewritten)

There are three tiers, as before: **process config** (frozen per process), **site binding** (the map a
parent supplied for one site scope; the shared daemon must never fall back to `process.env` for it), and
**site settings** (the database; env may only give a default or an operator lock, `locksSetting`).

What changed: process config is **not** one snapshot taken by the first statement. In an ES module every
static import is evaluated before the importing file's first statement, and one secret source is
asynchronous. The server entry (`apps/website/src/index.ts`) really runs like this, and the design keeps
this order:

| # | When | Owner | Reads | Leaves behind | Handoff |
|---|---|---|---|---|---|
| S0 | module evaluation of the import graph | `boot/local-owner-signin.ts:111` | `TOVU_DESKTOP_OWNER_SIGNIN`, `TOVU_DESKTOP_OWNER_PID`, `TOVU_PUBLIC_URL` | **deletes** the first two from `process.env` (`:104-105`) so no child inherits them | exported `bootLocalOwnerSignIn` policy object. Specs: `delivery: 'consume-at-import'`, `phase: 'import'`. Nothing else may read these names (schema test: one reader). |
| S1 | entry module body | `index.ts:55-64` | `PORT`, `TOVU_START_AUTO_PORT` (read then deleted), `TOVU_DB`, `TOVU_HOST` (owner validator, may throw) | – | becomes `parseEnv(bootSyncSlice, process.env)`: the non-secret, synchronous slice. Still before `main()`. |
| S2 | first line of `main()` | `registerPluginSdkResolver` | – | – | must stay before the first `await` (`index.ts:141-149`). |
| S3 | `await initializeStartupSecrets()` | `boot/startup-secrets.ts` | the six `startup-ipc` names from env **and** from the launcher's IPC message | **deletes** them and the marker from `process.env` (`:20-25`) | `startupSecretEnvironment()` accessor. The only way to see these values. |
| S4 | `ensureAgentDaemonToken`, `ensureToolExecToken` | `assistant/daemon-access.ts` | via S3's accessor | tokens in in-memory holders; generated when absent | `get…Token()` accessors, read per use. |
| S5 | **`loadServerConfig()`** | entry | `startupSecretEnvironment({ env: process.env })` | – | the frozen typed config for everything else. Runs **after S3 and S4**, never before. Contains no `startup-ipc` or `consume-at-import` field. |
| S6 | readiness gate, `createApp(deps)` | existing owners | `config` | – | `deps.ts` / `app.ts` receive `config` (T3). |
| S7 | after `listen` | `boot-listener` / `site-listener-origin` | – | **writes** `process.env.PORT` (`index.ts:210`) so children inherit the real port | a launch-binding write, listed as such. The resolved port is state owned by the listener, not config. |

Rules that follow:
- A value read at S0–S4 is **handed over by its owner**, never parsed a second time. That is the explicit
  handoff lesson 4 asks for, and it is what stops a "snapshot" from missing IPC credentials.
- Late-bound reads stay late. `agent-daemon-port.ts:60,63` reads the daemon origin when first asked; the
  migration gives it a getter over `config`, not a value captured at S5 (lesson 3).
- The same table is written for the three other entries before their readers move: `cli/commands/serve.ts`
  (same owners, loopback default), `server/inbound/assistant/agent-daemon-server.ts` (module-scope reads at
  `:23,26,67`, port read at `:207`), and desktop main (§2.7).
- **Files that may touch `process.env`** (the gate's `envRoots`): the entry files above, the CLI commands' top
  level, the tier-2 plugin worker entry, the local-site child entry, Vite configs,
  `apps/admin/src/lib/build-env.ts` (new), `development/scripts/**`, and the two **credential owners**
  `boot/startup-secrets.ts` and `boot/local-owner-signin.ts`. The credential owners are permanent, named
  exceptions, not debt.

Tests for this sequence are subprocess tests, because plain-map tests cannot see module evaluation order (§4.4).

### 2.7 Desktop (Electron)
- Main is a host entry. It parses the `desktop`, `launch-desktop` and `ambient` slices in its module body.
  **r2:** the first pass said "make the load the first statement, so there is no earlier reader". A first
  statement does not run before imported modules. The real guarantee is the other way round: **no module that
  main imports may read env while it is being imported.** Rule `HW12` (§3) checks module-scope references and
  an import-recording test checks reads made through a call. Today main's own module body reads at
  `main/index.ts:302` (`TOVU_DESKTOP_SELFTEST`) and `:452` (`createNativeAgentRuntime({ env: process.env })`);
  both stay in the entry and take `config`.
- Main → server child: one launch binding per pair (§4, T4). `tovu-server.ts` copies and edits the
  environment; that becomes one `launchEnvFor` call with the same result, pinned by a characterization test.
  `TOVU_STOP_ON_STDIN_EOF` stays the binding for the **server** child (`tovu-server.ts:911` →
  `serve.ts:490`). `JINI_STOP_ON_STDIN_EOF` stays the binding for the **daemon** child (Jini
  `sidecar/src/supervision/supervisor-node.ts:107` → `agent-daemon-server.ts:67`). They are two contracts for
  two children and are **not** merged: with one name, a server that was told to stop on stdin end would hand
  the same order to a daemon whose stdin may be closed from the start (`serve.ts:489` warns about exactly that).
- Renderer and preload get settings over the IPC bridge only. The gate forbids env there (0 today).
- Packaged-app facts (`TOVU_PACKAGED_DESKTOP`, `TOVU_BUNDLED_*`, `TOVU_NODE_TOOLCHAIN_DIR`) are launch bindings.

### 2.8 Build-time (Vite) values
- Browser code has **8** executable reads: `import.meta.env.DEV` ×5, `MODE` ×2, `VITE_TOVU_SITE_URL` ×1.
  `apps/admin/src/lib/build-env.ts` becomes the one file that touches `import.meta.env`.
- `vite.config.ts` files run in Node and parse the `browser-build` slice (`phase: 'build'`).
- **Build constants are not env.** `__JINI_CORE_VERSION__` and `__TOVU_ADMIN_VERSION__` come from package
  manifests (`apps/admin/vite.config.ts:127-129`). The first pass listed `JINI_CORE_VERSION` as an env name
  with "injection not verified"; it is removed from the inventory.
- **Bundler defines stay.** `apps/site-chat/vite.config.ts:71` fixes `process.env.NODE_ENV` to
  `"production"` on purpose (React's CommonJS entry needs it and a library build does not inject it). T7 may
  not turn that into a schema read. Jini `ui-kit` (`react/context.ts:8`) and `ui`
  (`html-editor/editor-serialization.ts:22`) read `process.env.NODE_ENV` the same way, and `ui-kit` does it
  while its module is evaluated (`context.ts:14,19`), so an injected flag would need an initialisation call
  that cannot run before the module's own `export const`. **Decision:** in a package whose `jini.runtime` is
  browser, dom or universal, the exact expression `process.env.NODE_ENV` is a build define, allowed by the
  gate and listed as `kind: 'build'`. The first pass's "inject a development flag" item is withdrawn.

### 2.9 What a Jini package looks like after (r2: contract corrected)

Today (`packages/daemon/src/http/tool-execution-routes.ts:84-92`) the Express guard takes
`{ tokenEnvVar, env = process.env }`, reads `env[tokenEnvVar]` **on every request**, and its two refusal texts
name the variable. The first pass proposed a signature that returned Express's `RequestHandler` and dropped
the name. Corrected target:

```ts
// packages/daemon/src/tool-execution/authorize-caller.ts — no framework import
export interface ToolExecutionCaller { readonly peerAddress: string | undefined; readonly authorizationHeader: string | undefined }
export function authorizeToolExecutionCaller(
  required: { readonly caller: ToolExecutionCaller; readonly expectedToken: string | undefined; readonly tokenLabel: string },
  _optional: Record<string, never> = {},
): ApiError | null;   // null = allowed; same three refusals, same codes, same texts as refusalFor() today
```

- **The decision is framework-free.** The existing Express wrapper keeps its place and its return type for
  now and only changes its options to required `{ toolExecToken: () => string | undefined; tokenLabel: string }`.
  It calls the getter per request, as line 88 does today, so Tovu can still place the token after start-up
  (`daemon-access.ts`). Moving the Express binding out of `daemon` into the host is the untangle plan's lane
  ("no specific server framework in Jini"); this design must not add Express to any new signature, and J3
  lands after that lane if it touches the same file.
- **`tokenLabel` carries the provenance.** The host passes the name its operator knows
  (`'TOVU_TOOL_EXEC_TOKEN'`). Exact-text tests pin both refusals before and after.
- **Behavioural check, not structural (lesson 12).** For every name-plus-map pair that becomes a value or a
  getter, the step records: read per call or once; which object the option sits in; what the absent value
  means. A per-call read becomes a function.
- **Env maps as subject data stay**, as a **required** `hostEnv` argument: child environment builders,
  executable lookup on `PATH`, home and config directories. Their allow-lists stay domain policy (§2.5).
- Hexagonal summary: inbound adapters = process entries and `bin/`; outbound port = `HostEnvironment`
  (`Readonly<Record<string, string | undefined>>`); composition roots = Tovu's entries and the two presets;
  core tests run on plain objects.

---

## 3. The CI check (r2, rewritten)

New file `env-access.ts` in `@jini-ai/devops/checks`, reusing `hardwiring.ts`'s parser, violation type and
`diffHardwiringDebt`. The check stays generic. The host passes every input, all derived from its schema or
from named constants in source; no second hand-kept list:

| Input | What | Jini | Tovu |
|---|---|---|---|
| `scanRoots` | where to look | package `src/**` (today) **plus** `packages/agent-plugins/*/{lib,worker,ui}/**/*.mjs` and `examples/*/src/**` | `apps/*/src`, `packages/*/src`, `content/agent-plugins`, `development/scripts` |
| `envRoots` | files that may touch `process.env` | presets' entries, `bin/` | §2.6 list |
| `envDataOwners` | files whose **job** is to transform an environment (filter by allow-list, strip by prefix, merge, normalise, build a child env) | `daemon/src/agent-executor/agent-env.ts`, `platform/src/child-environment.ts`, `platform/src/proxy-env.ts`, `platform/src/sandbox-env.ts`, `db/src/transfer/postgres-target.ts`, `agent-runtime/src/env.ts` | `lifecycle/local-site-process.ts`, `lifecycle/daemon-supervisor.ts`, `apps/desktop/src/tovu-server.ts`, `desktop-agent-service.ts` |
| `familyReaders` | the one reader per family | F6 | F1–F5 |
| `bindingModules` | modules whose `env` is a platform binding namespace | `agent-plugins/cloudflare/worker/*.mjs` | – |
| `knownEnvNames`, `ambientNames` | from the schema | from J1 | from T0 |

| Rule | Fails when | Applies to | End state |
|---|---|---|---|
| `HW9-env-access` | `process.env` / `import.meta.env` is referenced outside `envRoots` (the `?? process.env` and `= process.env` forms count; the build-define exception of §2.8 does not) | all scanned code | debt reaches 0 |
| `HW10-env-name` | (a) a static key is not in `knownEnvNames`; (b) outside `envRoots`, a static key that is not in `ambientNames` is read from an injected map | all, including `envDataOwners` | (a) no baseline; (b) debt reaches 0 |
| `HW11-env-config-dynamic` | a computed key or an iteration over an env map **outside** `envDataOwners` and `familyReaders` | configuration code | debt reaches 0 |
| `HW12-env-import-time` | a module-scope env reference outside `envRoots` | all | baseline today: 0 Jini, 1 Tovu (`local-owner-signin.ts:111`, a named credential owner) |

Why this can reach its end state (judge finding 7): transforming an environment is a different operation from
reading configuration. `envDataOwners` are a **permanent declared class**: inside them computed keys and loops
are correct and are never debt, while rule 10(b) still stops them from reading a host setting by name. The
first pass had one rule for both, so `agent-env.ts:30-32` and `child-environment.ts:84-86` could never leave
the debt file.

`bindingModules` are excluded from the four env rules and get one plugin test instead: every `env.<NAME>` in
a worker module has a binding of that name in what the plugin uploads (`formsWorkerParts().bindings`, plus the
platform's own `ASSETS`).

Also, as schema tests and one text scan: every spec has `summary` and `fix`; no duplicate `name` or `field`;
`validation: 'owner'` names an existing file; `phase: 'live'` and `'import'` name a reason; no secret in a build
reader; every schema name is read somewhere or is `external`; a `TOVU_*`/`JINI_*` name in `Dockerfile`,
compose, workflows or `package.json` scripts that is not in the schema fails; generated files are current;
tests are scanned advisory-only.

Gate fixtures (one per case; each must be able to fail, AP12): a root reading `process.env` passes; a
non-root `?? process.env` fails; an unknown name fails even in a root; an ambient name on an injected map
passes; a host-setting name on an injected map fails **also inside an `envDataOwner`**; a loop over an env map
passes in an `envDataOwner` and fails elsewhere; a computed key passes in a family reader; a worker
`env.DB.prepare()` is not reported; a module-scope read outside a root fails; `process.env.NODE_ENV` passes
in a browser-runtime package and fails in a node one; a debt hit passes, a higher count fails, a lower count
prints "stale debt"; an unknown name in a Dockerfile fails. Lesson 24: the fixtures run against **all** rules
together, so an exemption in one rule cannot be undone by another.

**Rollout order (judge finding 12).** J0 ships the mechanism, `HW9` and `HW12` with a baseline. Those two need
no name list. `HW10` and `HW11` are switched on in **J1** for Jini and **T0** for Tovu, in the same commit
that adds the schema they read their names from. No interim list exists at any point. Tovu CI uses the
installed `@jini-ai/devops` (`check-hardwiring.mjs:3`), so J1 must be published before T0.

---

## 4. Migration

### 4.1 Jini

| Step | What | Names | Needs |
|---|---|---|---|
| **J0** | Gate file, `HW9` + `HW12`, baseline debt, fixtures, extra `scanRoots`. No behaviour change. | – | – |
| **J1** | Contract in core with tests. Preset schemas in `server` and `cli`. Generated `.env.example` + `docs/ENVIRONMENT.md`. `HW10` + `HW11` on. Refusal census rows for Jini classified. First consumer: `server/storage/backend-config.ts` keeps `SqliteBackendConfigError`, its texts and its postgres-only checks (`validation: 'owner'`, `activeWhen`). Publish. | 14 config | J0, D1 |
| **J2** | `platform`, `cms` ffmpeg, `db` transfer, `devops` local-dev: `hostEnv` becomes a required argument. Allow-lists stay in place; schema test imports them. | 42 ambient | J1 |
| **J3** | `server`, `daemon`, `mcp`, `sidecar`, `desktop-host`, `cli`, `http-kit`: name-plus-map pairs become a value or getter plus a label (§2.9). | 17 launch + config | J1; untangle C6 and the R-lanes on the same files |
| **J4** | `agent-runtime`, `integrations`: required `hostEnv`; the env credential resolver moves to the preset; the not-yet-read lists of §0.2 are read and added first. | 58 vendor | J1 |
| **J5** | Examples (own tiny schema), dev flags, test hooks, script-only names. | 14 + 12 | J1 |
| **J7** | Debt is empty: delete `HW1`'s allowance text. | – | J2–J5 |

There is no J6. The four `TOVU_*` names in `agent-plugins` are not renamed here (§4.3).

### 4.2 Tovu

| Step | What | Names | Needs |
|---|---|---|---|
| **T0** | Schema slices as data for all 176 names; fill every `NOT VERIFIED` default from code; classify the 45 Tovu census rows; write the S0–S7 table for the other three entries; schema tests incl. the security-switch pins. Gate on with baseline. **No reader changes.** | 176 | J1 published |
| **T1** | Generate `.env.example` and the environment doc (today's comment prose moves verbatim into `doc`). Derive `REQUIRED_SECRETS` and `STARTUP_SECRET_KEYS` (literal pin tests first). Deploy-file scan. Fix the stale "boot-blocking" / "refuses to start" wording. | 6 (+63 docs) | T0 |
| **T2** | OS and runtime facts: required `hostEnv`, `runtime-mode`. | 26 platform | T0; J2 bump |
| **T3a** | Entries and non-composition server files: `loadServerConfig` at S5 of each entry. | part of 76 config | T0 |
| **T3b** | `deps.ts` (25 sites) and `app.ts` (13 sites) receive `config`. | rest | T3a; size designs 01/02 (D2) |
| **T4** | Launch bindings: one slice per parent/child pair; the parent builds the child env with `launchEnvFor`, the child parses the same slice. No renames. | 38 | T3b |
| **T5** | `features/`, `platform/`, `assistant/`, `contracts/core/`: functions that take an `env` bag take a typed slice (plus `sources` where they show a name). Families F1–F5. | – | **T3b** |
| **T6** | Desktop main. | 6 | T4 |
| **T7** | Browser builds: `build-env.ts`, Vite configs, `vite-env.d.ts` check. Bundler defines untouched. | 2 (+ `DEV`, `MODE`) | T0 |
| **T8** | Dev flags, test hooks, `development/scripts`, test conversion leftovers. | 33 + 40 script-only | T3b–T6 |
| **T9** | Delete the inert `TOVU_ALLOWED_ORIGINS`; `JINI_ALLOWED_ORIGINS`/`JINI_WEB_PORT`/`JINI_BIND_HOST` stop being named in Tovu; debt to zero. | 1 delete | J3 |

**One dependency graph (replaces the two that disagreed):**

```
J0 → J1 → publish → T0 → T1
J1 → J2 → J3(after untangle C6) → J7        J1 → J4 → J7        J1 → J5 → J7
T0 → T2 (after J2 bump)      T0 → T7      T0 → T3a → [size designs 01/02] → T3b → T4 → T6 → T8
T3b → T5 → T8                J3 → T9      T8 → T9
```

`T5` needs `T3b` and never runs beside it. Parallel lanes: `{J2, J4, J5}`, `{T2, T7, T3a}`.

**What each step must compile and build (judge finding 10).** Root `npm run typecheck` covers only
`apps/website/src` and excludes tests (`tsconfig.json:17-25`). A step is green only when every row it touches is green:

| Area | Compile | Build | Tests |
|---|---|---|---|
| Website server | `npm run typecheck` (+ `typecheck:tests`, because tests are excluded from the first) | `npm run build:server` | the area's `node --test` files |
| Dev scripts | `npm run typecheck:scripts` | – | – |
| Desktop | `npm --prefix apps/desktop run typecheck` (preload, renderer, main, live-verify) | `npm --prefix apps/desktop run build` | desktop `test` |
| Admin | `npm --prefix apps/admin run typecheck` | `build:local` | `vitest run` |
| Site chat | `npm --prefix apps/site-chat run typecheck` | `build:local` (three bundles + `check-bundle-mounts`) | `test` |
| Jini | `pnpm typecheck` | `pnpm -r build` (Tovu consumes `dist`) | `npm --prefix packages/<pkg> run test`, `pnpm guard` |

T0, T1, T3a, T3b, T5: website + scripts. T2, T4: website + desktop. T6: desktop + website. T7: admin +
site chat + desktop renderer, and two bundle checks on the built files: `process.env` occurs 0 times in the
site-chat bundles, and no `secret: true` name occurs in any browser bundle. Every Jini bump: Tovu's
`jini-published-typecheck` workflow. All quoted from `package.json`; none was run here.

### 4.3 Names are an installation surface (r2, replaces "renames and deletes")

A name can be stored in places Tovu cannot rewrite: a hosting dashboard, a compose file, a `docker run -e`,
a systemd unit, a shell profile. So:

| Class (`surface` column) | Rule |
|---|---|
| **launcher** (setter and reader ship in the same build) | May be renamed in one commit: setter, reader, tests. No install holds the name. |
| **operator**, **vendor**, **platform** | **Frozen.** No rename, no delete, no changed default, no changed accepted words. If a name is misleading, the docs say so. |
| **developer** (dev flags, test hooks, not in `.env.example`) | May change with a note in the step report. |

What that does to the first pass:

| First pass | r2 | Why (verified) |
|---|---|---|
| Rename `JINI_AGENT_DAEMON_PORT`, `JINI_AGENT_DAEMON_URL` → `TOVU_…` | **Keep** | Operators set the port: `.env.example:26`, `Dockerfile:194`, the Admin deployment page (`rules.ts:355`, `deployment-overview.ts:95`). The URL is operator-readable too (`agent-daemon-port.ts:60`). The only gain was a tidier prefix. |
| Rename `TOVU_STOP_ON_STDIN_EOF` → `JINI_…` | **Keep both** | Two bindings for two children (§2.7). Merging them is a bug, not a cleanup. Found while checking the judge's note that the launcher is visible at `tovu-server.ts:907-912`. |
| Rename four `TOVU_*` names in Jini plugins | **Keep** | Picker names: the source says "sites already set them, and renaming would unconfigure them" (`picker-flow.mjs:29`); the host only accepts the `TOVU_…` pattern (`public-config.ts:15`). Forms names: worker bindings, not env (§2.5). |
| Delete `TOVU_AGENT_NATIVE_FALLBACKS`, `TOVU_AGENT_FORBID_BASH` | **Keep** | Deny switches (§2.4a). Deleting one can turn CLI access on for an install that had it off. |
| Delete `TOVU_CONSENT_REGION_HEADER` | **Keep** | Documented (`.env.example:93`); removal drops a trusted region header for installs that set it (`site-cookie-consent.ts:24`). |
| Delete `TOVU_ALLOWED_ORIGINS` | **Delete (T9)** | Not a setting: the name is passed to a Jini adapter together with `env: {}` (`visitor-frontend-control.ts:67-68`), so no value can ever be read. No install can depend on it. |

**The owner rule "existing installs keep working through a one-time, automatic migration" is met by not
needing one:** no stored name changes meaning, so there is nothing to migrate, on desktop or on a deployed
site. Launch bindings and the desktop app's own files are replaced as a whole by the new build.

**If the owner still wants a rename of an operator name (D3),** this is the only automatic way, and it has a
cost that must be said plainly:
1. Files the install owns are rewritten once: the repo-root `.env` that `load-repo-root-env.mjs` loads is
   edited in place before loading (old key → new key, comments kept, atomic write, one backup, one line
   printed). `platform/site-dir/active-site.ts` already rewrites that file the same way.
2. Values a platform injects cannot be rewritten by Tovu. The entry would have to translate old → new in the
   map it hands to the parser, on **every** boot, for as long as such an install exists. That is an alias. It
   can be confined to one table at the process door, invisible to all other code, but it is long-lived.
3. A deny switch may only be translated in the deny direction.

Rule 2 collides with "no long-lived aliases", and dropping it collides with "the user never fixes anything".
Both cannot hold for a platform-injected name. Freezing is the only option that keeps both rules.

Near-duplicates kept and documented side by side: hosted switches (`NODE_ENV`, `TOVU_RUNTIME_MODE`,
`TOVU_HOSTED`, `TOVU_EXECUTION_MODE`, `TOVU_PACKAGED_DESKTOP`); parent pids (they also say which launcher
started the process); host-side and Jini-side token names; database paths; site selection.

### 4.4 Tests (written before each step; each must be able to fail on the risk it names)
- **Characterization per variable, before its reader changes:** one shared hostile table (unset, `""`,
  `"  "`, `"abc"`, `"0"`, `"-1"`, `"true"`, `"TRUE"`, `"yes"`, `"off"`, a very long string) plus `limit-1`,
  `limit`, `limit+1`. The same table then runs against the spec. A difference is fixed in the spec or listed
  as a visible change.
- **Activation and precedence (r2):** an invalid `JINI_PG_SSL_MODE` with the sqlite backend changes nothing
  and prints nothing; with postgres it throws the same error as today. `--host` beats `TOVU_HOST`; an invalid
  `TOVU_HOST` throws in both entries; unset gives loopback in `serve` and all interfaces in `index`.
  `TOVU_LOCAL_SITE_LIMIT` at 0, 1, 2, 20, 21 in warm and in normal mode.
- **Bootstrap order, in a subprocess (r2):** (1) import the real entry's import graph in a child process and
  assert the two owner sign-in keys are gone from `process.env` and present in `bootLocalOwnerSignIn`;
  (2) start a child with the startup-secret marker and deliver secrets over real IPC, then assert: the config
  consumers see them through the accessor, `process.env` holds none of the six names, a grandchild's
  environment holds none, and a second parse cannot see them; (3) the same with secrets delivered by env;
  (4) malformed IPC still throws and boot does not continue. The executor confirms the sidecar's IPC seam
  exists before relying on it (lesson 11).
- **Import-time reads (r2):** for each Jini package entry and for desktop main's imports, a child process
  swaps `process.env` for a recording proxy before `import()` and asserts which names were read during
  evaluation. Expected: none, except the documented build define.
- **Eager or lazy:** for each read marked `call` or `request`, change the value after construction and assert
  whether behaviour follows.
- **Launch bindings:** pin the exact key set, values and removed keys of each child environment with an
  inline literal, then swap in `launchEnvFor`. The two stdin switches each get a test that the *other* child
  does not receive them.
- **Security switches:** §2.4a, one deny test per switch, written first (AP7), plus one test that an
  environment holding only a legacy switch still has CLI access off after the migration step.
- **Confidentiality (r2):** hostile values (a connection string under an unlisted name, a URL with
  `user:pass@`, a secret with no vendor shape) through `formatEnvIssue`, `describeEnvForDiagnostics`,
  `JSON.stringify(issue)`, `util.inspect(error)` and `error.stack`: the value never appears.
- **Exact error text and type** for every warning kind and every existing refusal (AP1).
- **Schema contract** (AP5): per slice, names, `kind`, `secret`, `security` against an inline literal.
- **Fakes, not mocks:** `makeServerConfig({ ...overrides })` or a plain object as `hostEnv`. Tests stop
  writing `process.env`; each step converts the tests of the files it touches.

### 4.5 Estimate (rough, ±50%)
Basis: the untangle plan priced 572 import lines at about 4.3M Sonnet. Here: 347 direct sites, 357 bag reads
and 135 computed reads in product code, plus about 670 test writes.
- Opus: contract, gate classes, bootstrap tables for four entries, J3 port shapes, T4 slices: **~0.5M**.
- Sonnet: Jini J0–J5, J7 **~1.2M**; Tovu T0–T9 **~3.2M** (T0 grew: census, defaults, bootstrap tables).
- Removed: seven renames, three deletes, J6. Added: subprocess tests, the redaction layer, more names in
  Jini (most are allow-list entries that stay data). No approved exception is excluded from this figure
  (lesson 15).

---

## 5. Owner practices, one by one

| # | Practice | Status |
|---|---|---|
| 1 | DI via typed ports/config; Jini packages never read `process.env` | **Met, with flags.** (a) `HW1` allows `?? process.env`; this design removes that. (b) The two host presets would read env (D1). (c) **r2:** browser-runtime packages keep the bundler define `process.env.NODE_ENV` (§2.8, D8). |
| 2 | Args `(required, optional = {})` | Met in every sketch. |
| 3 | Functions ≤ 50, files ≤ 500, complexity ≤ 10 | Met by design (coercer table, four helpers, 40-spec slices, new gate file). `deps.ts`/`app.ts` must not grow. |
| 4 | Feature slicing | **Partly.** Slices sit by area in one folder so that desktop, Vite configs, scripts and the docs generator can import the schema without feature code. Flagged. |
| 5 | No barrels, shells, forwarders, aliases | Met. `tovu-env.ts` builds a value. **r2:** no rename, so no alias and no tombstone. The first pass's "retired name" warning is removed. |
| 6 | Why-comments move with code | Met as a rule (`.env.example` prose becomes `doc` verbatim; the `USER` bisection note stays on its list). |
| 7 | Generic → Jini; a Jini package imports only itself, core, protocol | Met. Contract in core; gate in devops; Tovu names stay in Tovu. |
| 8 | No specific server framework in Jini | **r2: the first pass broke this** by proposing a new signature that returned Express's `RequestHandler`. Corrected in §2.9. Existing Express use in `daemon` is the untangle plan's debt, not widened here. |
| 9 | Errors never swallowed or generic | Met for new code (typed issues, all printed). **Flag:** `media-store.ts:66,72` throws a plain `Error` today. This design keeps text and type (no silent change); making it typed is a separate, visible change. |
| 10 | No silent behaviour changes | Met by parity-first, `validation: 'owner'`, `activeWhen`, frozen names, and the per-step list of visible changes. |
| 11 | Tests use fakes of interfaces | Met (§4.4). The subprocess tests are the exception, on purpose: the risk is module evaluation order. |
| 12 | Smallest change; reuse first | **r2 is smaller:** 0 renames, 1 delete, no migration machinery, no new store. |
| 13 | Never a boot refusal in production for a non-critical value | Met: the parser cannot refuse. Existing refusals are classified in T0; any non-critical one goes to the owner (D4). |
| 14 | Never auto-change passwords | Met: nothing here writes a credential. The readiness gate keeps warning about the default owner password and changes nothing. |
| 15 | Errors in plain words naming the variable and the fix | Met (`formatEnvIssue`, §2.3). |
| 16 | Existing installs keep working, automatically | Met by freezing every stored name (§4.3). Conflict with "no long-lived aliases" only arises if a rename is ordered (D3). |
| 17 | Memory / IO cost | Parse once per process at S5 (about 200 specs, no I/O, one frozen object) plus one small synchronous slice at S1; about 15 specs per site scope. No timers, caches or retained history. |

Reuse lines (implementation-guardrails):
- `Reuse: CI rule against env reads; searched Jini scripts/ + packages/devops/src/checks, Tovu development/scripts; inspected hardwiring.ts (HW1, HW6), check-hardwiring.{ts,mjs}, scripts/lib/package-sources.ts; used extend the existing inspector and debt ratchet; owner record: hardwiring adoption 2026-10-09.`
- `Reuse: secret redaction; searched "redact", "SECRET_SHAPE", "sanitize"; inspected packages/contracts/src/secret-redaction.ts, Jini core redact.ts (by reference), cli/src/daemon-url.ts:91-114, scripts/check-log-safety.mjs; used keep all three unchanged and add only an allow-list display for env maps | separate because none of them decides "may this variable's value be shown"; owner record: owner ruling "secrets only" quoted in secret-redaction.ts.`
- `Reuse: boot credential handling; searched process.env deletes and module-scope reads; inspected boot/startup-secrets.ts, boot/local-owner-signin.ts, assistant/daemon-access.ts, index.ts:141-159; used keep all three owners and hand their values over; owner record: SPEC-005 / CIC U-002 comment at index.ts:141.`
- `Reuse: .env rewriting (only if D3 orders a rename); searched "loadEnvFile", ".env"; inspected development/scripts/load-repo-root-env.mjs, platform/site-dir/active-site.ts; would extend active-site's line transform; owner record: none.`
- `Reuse: env schema/parser; searched both repos for env/config/settings modules and zod env schemas; inspected core/contracts/runtime/environment.ts, platform/fs/env-text.ts, desktop-host/config.ts, server/storage/backend-config.ts; none is a schema; separate because no module owns "declare, check and document a variable"; owner record: none.`

---

## 6. Lessons file applied (26 rules at `origin/plan/size-designs-2026-11-16`)

The first pass read 11. Rules 14, 16–19 and 23 are about streaming, concurrency, quotas and protocol adapters and do not apply here (no such code is designed).

| Rule | Where |
|---|---|
| 1 Real dependency graph | Steps follow who sets and who reads. |
| 2 Inventory first | VARS.tsv; **r2** declared lists, comment hits removed, unresolved names kept out of totals. |
| 3 Late-bound reads | §2.6 (getters, S5 after S3/S4), §2.9, §4.4 eager/lazy and import-time tests. |
| 4 Inputs, outputs, init point, state owner, handoff | §2.6 table S0–S7. |
| 5 Migration graph | §4.2 one graph, per-step matrix. |
| 6 Characterization tests that can fail | §4.4. |
| 7 Distinct contracts | `sources`, `validation: 'owner'`, optional vs default, existing typed errors. |
| 8 Limits inside files | §2.2, §5 row 3. |
| 9 Generic vs host binding | Contract in Jini, names in the host. |
| 10 Untangle lanes first | J3 after C6; Express move is the untangle lane; T3b after size designs. |
| 11 Seams and commands exist | Quoted, not run; IPC seam to confirm. |
| 12 Behavioural port compatibility | §2.9 (per-call getter, label, object shape). |
| 13 Security gates across the whole chain | §2.4a; the tool-execution guard keeps loopback + token + label; trust-proxy and bind-host stay with their owners. |
| 15 Owner constraints as acceptance criteria | §5 rows 13–16; no exception excluded from the estimate. |
| 20 Truthiness, live objects | §2.2 (explicit absence check, deep-frozen config). |
| 21 Test each redundant guard alone | §2.4a (one deny test per switch). |
| 22 Compiler settings per package | Not verified per package; T0/J1 check `verbatimModuleSyntax` before adding type-only imports of the contract (open gap 5). |
| 24 Redaction ≠ disclosure; both directions; exemptions run together | §2.4 layer 4; §3 fixtures on combined rules; old installs against the new build (§4.3). |
| 25 Export-map entries exist when introduced | J1 adds `@jini-ai/core` `./env` in the commit that creates the files; pure, universal, no Node code. |
| 26 Config/env | §4.3 (installation surface), §2.5 (bindings), §2.4 (confidentiality), §2.3 (activation, precedence), §2.4a (deny switches). |

---

## 7. Risks and what is not verified
- **Eager instead of lazy** (highest). 245 Tovu bag reads happen at call time. Mitigation: §4.4.
- **Bootstrap order.** A reader moved in front of S3 sees no IPC secret. Mitigation: S5 placement, subprocess tests.
- **Per-site snapshot leaking into process config** in the shared daemon. Mitigation: two-site binding test.
- **Child processes that depend on inheriting a variable** nobody names. T4 keeps inheritance (D5).
- **Cross-repo order.** J1 published before T0; J2 is a breaking bump.
- **T3b collides with the deps/app size splits** (38 env sites in those two files). D2.
- **Not verified:** the 51 unclassified census rows; 153 defaults; the declared lists named in §0.2; that
  the OTel SDK reads the four `OTEL_*` names; that Vite configs and scripts can import the schema folder
  cleanly; the sidecar IPC test seam; per-package compiler settings; how many installs set any frozen name.
- The estimate has no measured basis beyond site counts.

---

## 8. Owner decisions

| # | Question | Recommendation |
|---|---|---|
| **D1** | May Jini's host presets (`server`, `cli`) and `bin/` entries read `process.env`? | **Yes, only they.** |
| **D2** | T3b before or after size designs 01/02? | **After.** T3a first. |
| **D3** | Rename or delete any operator-set name (the two `JINI_AGENT_DAEMON_*`, the legacy switches, the consent header)? | **No: freeze them.** A rename needs a permanent translation table at the process door for platform-injected values, which conflicts with "no long-lived aliases". |
| **D4** | An existing boot refusal the census shows to be non-critical: turn it into a warning? | Decide per row when T0 delivers the classified census. None is changed without this. |
| **D5** | Build child environments from an allow-list and scrub more secrets from `process.env`? | **Later, as its own security change.** |
| **D6** | "No Tovu in Jini" for `agent-plugins` (151 files there mention Tovu, including `tovu-admin-surfaces.json` and the worker binding names). | **Out of this design; give it to the untangle plan.** The four env-like names are a small part of it and two of them are not env. |
| **D7** | Wrap secrets in an opaque type? | No. Allow-list display + issue echo + existing shape redaction. |
| **D8** | Is `process.env.NODE_ENV` in browser-runtime Jini packages an allowed build define? | **Yes** (§2.8). The alternative needs an init call that cannot precede module evaluation. |

---

## Judge response

Each finding was checked against Tovu `80b00f5b` and Jini `02edbb68` before it was accepted. **Accepted: 12.
Rebutted: 0.** Blockers left: 0.

| # | Sev. | Verified at | Result | Fix |
|---|---|---|---|---|
| 1 | Blocker | `assistant-native-fallbacks.ts:46-54,60-66`; `assistant-system-overlay.ts:144-147` | **Accepted.** Both switches deny access on their own; access defaults ON. | Deletion withdrawn. §2.4a makes deny switches a protected class with one deny test each and a test that a legacy-only install stays locked. |
| 2 | Blocker | `index.ts:14,141-159`; `boot-readiness-gate.ts:9`; `local-owner-signin.ts:104-111`; `startup-secrets.ts:17-34`; `daemon-access.ts`; Jini `ui-kit/src/react/context.ts:8,14,19` | **Accepted.** Import-time consume-and-delete, async IPC, tokens minted after. | §2.6 rewritten as the real sequence S0–S7 with owners and handoffs; full parse moved to after S3/S4; secrets stay behind owner accessors; subprocess and import-recording tests (§4.4); `HW12`. The ui-kit flag injection is withdrawn (§2.8, D8). |
| 3 | Major | `picker-flow.mjs:29-31,43-46`; `tovu-admin-surfaces.json:30,49`; `public-config.ts:15-27`; `.env.example:26`; `Dockerfile:194`; `rules.ts:355` | **Accepted.** "No external users" was wrong; the source says sites set these names. | §4.3: operator-set names are frozen. All seven renames withdrawn. The automatic-migration option and its unavoidable alias are spelled out for the owner (D3). |
| 4 | Major | `providers.ts:233-253`; `credentials.ts:14-21`; `agent-env.ts:7-32`; `proxy-env.ts:24-31`; `postgres-target.ts:71-74`; `child-environment.ts:21-22,84-86` | **Accepted.** The scanner ignored names that exist only in a declaration. | `DECLARED_SETS` in `build-vars.py` (nine lists, hand-read): +47 Jini, +13 Tovu names. Readers, writers ("written for a child") and comment mentions are now separate. Lists not yet read are named and kept out of totals. Jini secrets 12 → 32. |
| 5 | Major | `site-key-dependent-data.ts:78-82`; `secret-redaction.ts:10-60`; `check-log-safety.mjs:11-38`; `daemon-url.ts:91-114` | **Accepted.** Neither cited owner keeps a name list; dynamic names and URL credentials were not covered. | §2.4: existing shape and URL redaction kept; env-map display becomes an allow-list (unknown and family names show presence only); `EnvIssue` carries an `EnvValueEcho`, never a raw value; disclosure rule; tests. |
| 6 | Major | `bind-host.ts:59-80`; `backend-config.ts:44-47,98-110`; `local-site-host.ts:17-20` | **Accepted.** List incomplete (`TOVU_HOST`); no activation or precedence. | §2.3: the parser never refuses; `validation: 'owner'`, `activeWhen`, `overriddenBy`; census of 56 candidate sites as a T0 gate; tests for inactive settings, flag precedence, warm mode. |
| 7 | Major | Jini `scripts/check-hardwiring.ts:19-27`; `scripts/lib/package-sources.ts:48-60`; `agent-env.ts:30-32`; `child-environment.ts:84-86` | **Accepted.** One rule for config reads and for environment transforms; payloads and examples unscanned. | §3: `envDataOwners` as a permanent class, `HW11` limited to configuration code, explicit `scanRoots` for plugin payloads and examples, fixtures for both kinds. |
| 8 | Major | `forms-receiver.mjs:27,80,275,298`; `cloudflare/lib/forms.mjs:273-282` | **Accepted.** `TOVU_FORMS` is a D1 object; both names are worker bindings made and read by one upload. | §2.5: native bindings are outside the schema and the parser; VARS.tsv marks both `not-env`; `bindingModules` in the gate with a binding-declared test. |
| 9 | Major | `tool-execution-routes.ts:25,69-92` | **Accepted.** Proposed signature exposed Express and dropped the name used in refusals. | §2.9: framework-free `authorizeToolExecutionCaller` plus `tokenLabel`; per-request getter kept; exact-text tests; Express move left to the untangle lane. |
| 10 | Major | `tsconfig.json:17-25`; `package.json:34-37`; `apps/desktop/package.json:13-17`; `apps/admin/package.json:12-16`; `apps/site-chat/package.json:9-13`; `apps/site-chat/vite.config.ts:49-71` | **Accepted.** | §4.2 matrix per step, three site-chat bundles, desktop's four configs, two bundle checks; the fixed `NODE_ENV` define is protected. |
| 11 | Minor | `apps/admin/vite.config.ts:127-129`; `site-url.ts:14`; `admin-dev-origin.ts:4`; `tovu-server.ts:907-912` | **Accepted.** | `JINI_CORE_VERSION` removed (build constant); comment lines no longer count (820 + 300 hits), so `DEV` is 5 and the browser total 8; all §0.1 numbers re-measured with `work/counts.py`; the launcher of `TOVU_STOP_ON_STDIN_EOF` is recorded, which also showed the rename was unsafe. |
| 12 | Minor | `DESIGN.md` r1 lines 408, 465-466; `INDEX.md` r1 | **Accepted.** | One graph in §4.2 (`T5` after `T3b`); `HW10`/`HW11` switch on with the schema in J1/T0, so J0 needs no name list. |

The judge's sample rows: every correction is applied in VARS.tsv (rows for `DEV`, `JINI_CORE_VERSION`,
`TOVU_AGENT_*`, `TOVU_CONSENT_REGION_HEADER`, `TOVU_STOP_ON_STDIN_EOF`, `JINI_SQLITE_BACKEND` now a real read,
`PGPASSWORD` and the other `PG*` names as "written for a child", `TOVU_FORMS*`, the picker names).

Found on my own while checking, not raised by the judge:
- Merging the two stdin-EOF switches would have been a behaviour bug (§2.7).
- Two Tovu names were product rows only because of comments; they are test-only.
- `media-store.ts:66,72` throws a plain `Error` (owner practice 9); kept, flagged.
- 151 files in `agent-plugins` mention Tovu, so the four names were never the size of that problem (D6).
