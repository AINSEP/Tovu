# One settings/env schema per repo — DESIGN (2026-11-16, planning only)

Measured against Tovu `origin/integ/wave-b-r2` @ `80b00f5b` and Jini `origin/integ/wave-b-r2` @ `02edbb68`.
No source code was changed. No secret value appears in this folder (names only).
Personas: software-architect (lead), devops, programmer, security, tdd. Skills: implementation-guardrails,
hexagonal-architecture, testable-design-patterns, test-design. `interface-design` was read and is **not
applicable** (it is a visual-UI skill; this design has no UI).

## Summary
1. **Today:** Tovu names **166** product env variables (148 have a read expression in product code; the rest
   are named through lists, launch code or `.env.example`). Jini names **104** (examples and plugin payloads
   included) and has no list at all. Tovu product code touches `process.env` / `import.meta.env` directly in
   **147 files**; Jini in **65**.
2. **Target:** each repo has one schema: a plain list of specs (name, type, default, secret, who reads it,
   when, what to do when it is wrong). One pure parser turns `(schema, env map)` into a frozen typed config
   plus a list of plain-words issues. Only process entry points touch `process.env`.
3. **Jini:** the contract (types + pure parser + renderers) lives in `@jini-ai/core`. Jini domain packages
   read no env at all; they take typed values or ports. Only the two host presets (`server`, `cli`, untangle
   Q1) and `bin/` entries own a schema and read `process.env`.
4. **Gate:** extend the existing owner, `@jini-ai/devops/checks/hardwiring` (rule `HW1-env-default`, already
   run by both repos), with three env rules and the existing debt ratchet. No second scanner.
5. **Migration:** 8 Jini steps (J0–J7) and 10 Tovu steps (T0–T9), each green alone. 7 renames, 4 deletes, all
   without aliases. Rough cost **0.4M Opus + 4.2M Sonnet** (±50%).
6. **Seven owner decisions** are in §8. D1 (may host presets read env) and D2 (after the deps/app split or
   before) gate the order.

Files: `VARS.tsv` (525 rows), `INDEX.md`, `work/env-reads.mjs` (scanner), `work/build-vars.py` (builds
VARS.tsv), `work/reads-{tovu,jini}.tsv.gz` (every hit: repo, name, file, line, kind, scope, area).

---

## 0. What was measured, and what was not

### 0.1 Counts (re-measured; "product" = not tests, not scripts, not build config, by path)

| | Tovu | Jini |
|---|---|---|
| Product names in VARS.tsv | 166 (159 keep, 3 rename, 4 delete) | 104 (100 keep, 4 rename) |
| ...of which have a read expression in product code | 148 | 66 |
| Script/build-only names | 45 | 12 |
| Test-only names (read or written only in tests) | 118 | 80 |
| Scanner hits that are not env (constants, comments) | 19 (listed in `build-vars.py` `NOT_ENV`) | 2 |
| Files touching `process.env`/`import.meta.env` directly | 147 (349 sites) | 65 (59 in packages with 104 sites, 6 in examples) |
| Named direct reads (`process.env.X`) | 89 | 22 |
| Whole-object uses of `process.env` | 244 (114 passed on, 57 `= process.env` defaults, 66 child `env:`, 7 spreads) | 94 (56, 32, 4, 2) |
| Named reads on an injected env object (`env.X`) | 241 | 113 |
| Computed-key reads (`env[expr]`) | 45 (5 on `process.env`) | 93 (2 on `process.env`) |
| `process.env.X = …` writes in tests | 572 | 99 |
| Product code that mutates `process.env` | 6 sites, 4 files (`startup-secrets.ts:21,25`, `index.ts:57,210`, `desktop-mcp-runtime.ts:75`, `daemon-access.ts:38`) | 1 (`examples/reference-web/src/daemon.ts:338`) |

### 0.2 The 11-11 survey against today

| Survey claim | Today | Why it differs |
|---|---|---|
| Tovu reads ~165 | 148 with a read expression; 166 product names | Close. The survey counted 7 dev-script names (`FIND_*`, `SITE_POWER_*`) as product. |
| 144 missing from `.env.example` | **92** | `.env.example` now lists **63** names, not 16. |
| 6 listed but never read | **7 have no read expression in our code; 0 are dead** | 4 `OTEL_*` (read by the OpenTelemetry SDK: 11-11 hand check, not re-verified), `TOVU_PORT` (docker-compose only), `TOVU_INSTALL_BROWSER` (Docker build arg), `TOVU_AGENT_NATIVE_FALLBACKS` (read through a name list, `assistant-native-fallbacks.ts:52`). |
| Jini reads ~77, no list | 104 names; no list (confirmed: no tracked `.env*.example`) | My scan adds examples, plugin `.mjs` payloads and names passed as string literals. |
| Dynamic reads: 5 Tovu, 1 Jini | 5 and 2 on `process.env`; **40 and 91 more on injected maps** | The survey only looked at `process.env[expr]`. |

The brief describes `env-sprawl.tsv` as "repo, name, file, line". The file on the inputs branch is
`var, repo, file_count, sources, files` (no lines), so every line number here comes from my own scan.
The brief says the lessons file has 22 rules; the file at `origin/plan/size-designs-2026-11-16` has **11**. All 11 are applied (§6).

### 0.3 Limits of the scanner (regex, no TypeScript install)
- It sees `process.env.X`, `process.env['X']`, `process.env[CONST]` (same-file const), `import.meta.env.X`,
  destructuring, `<anything ending in env>.X`, computed keys, `TOVU_`/`JINI_` string literals and object
  keys, and ALL_CAPS literals in files that touch an env object.
- It does not resolve a constant imported from another file, so some reads show up only as a literal
  (for example `TOVU_EXECUTION_MODE`, `TOVU_DESKTOP_AGENT_SERVICE`). Those rows show `prod_read_sites = 0`
  with a "named, not read here" phase.
- A name inside a doc comment counts as a hit. `prod_read_sites` is therefore an upper bound.
- `scope` is by path. `packages/db/src/testing/**` counts as test; `skills/**/scripts/**` as script.
- **Phase is a heuristic** (file path, plus "is the read behind `=>` on the same line"). It was hand-checked
  only for the variables quoted in this document.
- **Defaults:** 12 of 166 Tovu defaults were read from the code line, 45 are quoted from `.env.example`
  prose, and the rest are marked `NOT VERIFIED` in VARS.tsv. The executor fills them in T0 (each spec needs
  its default anyway, and the characterization test in §4.4 proves it).
- Nothing was run: no install, no typecheck, no tests. Compiler and runner commands are quoted from
  `package.json` and the repo instructions, not exercised.
- I did not split `apps/desktop/src/preload` from desktop main. The renderer has **0** env reads.

---

## 1. Findings that shape the design

1. **An owner for the rule already exists.** `packages/devops/src/checks/hardwiring.ts` (406 lines) has
   `HW1-env-default`: "process.env is allowed only as an injected environment default (`?? process.env` or
   `env = process.env`)", with `bin|cli|testing` files exempt, and `HW6-boot-default`. Jini runs it from
   `scripts/guard.ts:58`; Tovu from `.github/workflows/ci.yml:307`. Jini's debt file holds 15 HW1 entries.
   Tovu mode does not check env at all. **This rule is weaker than owner practice 1**: it blesses the
   ambient default.
2. **Jini mostly takes an env map already, then falls back to the ambient one.** Typical:
   `const e = optional.env ?? process.env` (`server/src/storage/backend-config.ts:103`),
   `{ tokenEnvVar = DEFAULT_…, env = process.env }` (`daemon/src/http/tool-execution-routes.ts:84`).
   88 of Jini's 94 whole-object uses are this default or the object handed straight on (the scan counts both). The work in Jini is deleting defaults, not finding reads.
3. **Jini also takes the variable's NAME from the host** (`tokenEnvVar`, `allowedOriginsEnvVar`,
   `webPortEnvVar`, `bindHostEnvVar`, `resourceRootEnvVar`, `explicitPathEnvVar`) and reads `env[name]`.
   That is most of the 91 computed reads. The host should pass the value.
4. **In Tovu an env map is three different things:** the OS environment, the transport from a parent
   process to a child, and an in-process **per-site settings snapshot**. `scopeConfiguration({ siteId, env, token })`
   (`agent-daemon-scope.ts:167`) builds one per site inside the shared daemon. So the parser must work on any
   map, never assume `process.env`.
5. **Names are duplicated on both sides of every launch.** 74 object keys set a variable for a child and a
   different file reads it. 40 variables are launch bindings that no operator should ever set.
6. **Other lists of env names already exist and drift:** `REQUIRED_SECRETS` (`deploy-config.ts:216`, 4 names),
   `STARTUP_SECRET_KEYS` (`startup-secrets.ts:4`, 6 names), `BASELINE_AGENT_ENV_KEYS` (Jini
   `agent-env.ts:7`), `.env.example`, `Dockerfile`, `docker-compose.yml`, `fly-deploy.yml`,
   `check-site-key-names.sh`. `REQUIRED_SECRETS` still says "boot-blocking" while the gate that reads it
   never refuses (`boot-readiness-gate.ts:35,41`), and `.env.example` still says production "refuses to start".
7. **Open sets of names come from declarations, not from code:** host signals (`host-signals.ts:84`,
   `FLY_APP_NAME`…), object-store declarations (`media-store.ts:70-78`), static-publish credentials
   (`credentials.ts:133,147`), admin-surface public config (a name pattern, `public-config.ts:15`),
   per-site `storage.secretRef.env` (`site-key-dependent-data.ts:80`), Jini `PROVIDER_CREDENTIAL_ENV_VARS`.
8. **At least five boolean dialects:** `=== "1"`; `"1" | "true"`; `!== "off"`; `"0" | "false"` means off;
   `"1" | "true" | "yes"` (Jini `sidecar/src/json-ipc.ts:43`). The schema must record each variable's
   accepted words, or the migration silently changes behaviour.
9. **Duplicates and near-duplicates** (§4.3): two Tovu-owned names wear a `JINI_` prefix; four "who is my
   parent" pids; three "we are hosted" switches plus `NODE_ENV`; four agent-permission switches of which two
   are aliases; `TOVU_STOP_ON_STDIN_EOF` and `JINI_STOP_ON_STDIN_EOF`; an inert `TOVU_ALLOWED_ORIGINS`.
10. **"No Tovu in Jini" is broken by four names** in `packages/agent-plugins` (`TOVU_FORMS`,
    `TOVU_FORMS_SECRET`, `TOVU_GOOGLE_PICKER_APP_ID`, `TOVU_GOOGLE_PICKER_BROWSER_KEY`).

**What the untangle DESIGN already says.** It never mentions env or config. It does say: core may not read
`process` (B2, gate `L6-base-purity`); hosts own composition roots (§3); `server` and `cli` are host presets
that "may import anything" (§7 Q1); domain Node adapters move to the preset (Q8). This design follows those
and adds the env rule they leave open. At `02edbb68` neither `packages/server/package.json` nor
`packages/cli/package.json` carries a `jini.kind` yet, so Q1 is decided but not landed.

---

## 2. The mechanism

### 2.1 Pieces and where they live

| Piece | Home | Why there |
|---|---|---|
| Spec/issue types | `@jini-ai/core` `src/contracts/env.ts` | Shared vocabulary for two hosts (Tovu, the Jini preset). Types only, as the 11-07 rule for `core/contracts` requires. |
| `parseEnv`, `formatEnvIssue`, `redactEnv`, `renderEnvExample`, `renderEnvDocs`, `launchEnvFor` | `@jini-ai/core` `src/env/*.ts` (next to `core/net`, `core/fetch`) | Pure functions, no `process`, no `node:*`, no dependency. Allowed by untangle B2; `L6-base-purity` checks it. |
| Jini preset schema | `packages/server/src/env/schema.ts`, `packages/cli/src/env/schema.ts` | The only Jini code that is a host (Q1). Holds the `JINI_*` names. |
| Tovu schema | `apps/website/src/contracts/env/*.schema.ts` + `tovu-env.ts` (the list of slices) | `apps/website/src/contracts/core/` already holds the env policy modules (`runtime-mode.ts`, `host-signals.ts`, `assistant-native-fallbacks.ts`). Desktop already imports website source by relative path (`apps/desktop/src/tovu-server.ts:19`). **To verify in T0:** that the admin and site-chat Vite configs and `development/scripts` can import it without pulling server code (the slices import only the core type). |
| Gate | `@jini-ai/devops` `src/checks/env-access.ts` (new sibling; `hardwiring.ts` is 406 lines and would pass 500) | The existing owner of the env rule and of the debt ratchet. |
| Generated files | Tovu `.env.example`, `development/docs/deployment/environment.md`; Jini `.env.example`, `docs/ENVIRONMENT.md` | Rendered from the schema, checked in, `--check` in CI (precedent: `check:seed-content-drift`). |

Rejected: a schema library (zod is only allowed in `protocol`, and core keeps zero dependencies); a Jini
package of its own (one more package above the domains); a `SecretValue` wrapper class around every secret
(touches every reader of 31 secret names for a risk the redactor and the log-safety check already cover: see D7).

### 2.2 The spec (sketch; types in core)

```ts
export type EnvValueType = 'string' | 'int' | 'flag' | 'enum' | 'url' | 'origin' | 'path' | 'list' | 'json' | 'duration-ms';
export type EnvKind = 'config' | 'secret' | 'launch-binding' | 'dev-flag' | 'test-hook' | 'ambient' | 'external' | 'build';

export interface EnvVarSpec<Field extends string = string> {
  readonly name: string;                      // exact variable name
  readonly field: Field;                      // where it lands in the typed config, e.g. 'server.port'
  readonly kind: EnvKind;
  readonly type: EnvValueType;
  readonly accepts?: { readonly on?: readonly string[]; readonly off?: readonly string[]; readonly values?: readonly string[]; readonly min?: number; readonly max?: number };
  readonly default?: string;                  // written as the operator would write it; absent = optional
  readonly readers: readonly string[];        // 'server' | 'cli' | 'agent-daemon' | 'local-site' | 'desktop-main' | 'admin-build' | ...
  readonly phase: 'build' | 'boot' | 'live';  // live = read again on every use; needs `liveReason`
  readonly liveReason?: string;
  readonly setBy: 'operator' | 'launcher' | 'platform' | 'ci';
  readonly onProblem: 'warn-and-default' | 'refuse';   // refuse needs `refuseReason`
  readonly refuseReason?: string;
  readonly delivery?: 'env' | 'startup-ipc';  // startup-ipc: never left in process.env (today's STARTUP_SECRET_KEYS)
  readonly deploy?: 'boot-blocking' | 'recommended';   // feeds Jini's DeploymentSecret, unchanged shape
  readonly locksSetting?: string;             // site setting this variable overrides, for "locked by X" copy
  readonly doc: { readonly section: string; readonly summary: string; readonly fix: string; readonly example?: string };
}
export interface EnvFamily { readonly id: string; readonly pattern?: RegExp; readonly source: 'pattern' | 'declaration'; readonly kind: EnvKind; readonly reader: string; readonly doc: EnvVarSpec['doc'] }
export interface EnvIssue { readonly name: string; readonly problem: 'missing' | 'invalid' | 'unknown-name' | 'retired'; readonly severity: 'warn' | 'refuse'; readonly received: string; readonly expected: string; readonly usedInstead?: string; readonly fix: string }

/** Pure. O(s + e) for s specs and e env entries; no I/O; never logs. */
export function parseEnv<C>(
  required: { readonly schema: EnvSchema<C>; readonly env: Readonly<Record<string, string | undefined>> },
  optional: { readonly mode?: 'local' | 'production'; readonly declared?: readonly EnvVarSpec[] } = {},
): { readonly config: C; readonly sources: Readonly<Record<string, string>>; readonly issues: readonly EnvIssue[] };
```

Owner limits inside the files (lesson 8):
- `parseEnv` is an orchestrator of four helpers (`readOne`, `coerce`, `checkUnknownNames`, `assemble`), each under 50 lines.
- Coercion is a lookup table `COERCERS: Record<EnvValueType, Coercer>`, one small function per type. A
  10-arm `switch` would be cyclomatic 11, over the owner limit of 10.
- Every exported function takes `(required, optional = {})`.
- A schema slice is a declarative array of at most ~40 specs (about 400 lines), so no file passes 500.
  Tovu needs about 9 slices: `server-core`, `server-features`, `assistant`, `launch-site`, `launch-desktop`,
  `desktop`, `browser-build`, `dev-and-ci`, `ambient-and-external`.
- `tovu-env.ts` builds one array from the slices and exports the schema. It adds a value; it is not a
  re-export shell.

`sources` maps each config field back to the variable that set it. It is needed because existing code
returns the **name** of the variable that locks a setting (`fullCliEnvLock`, `assistant-native-fallbacks.ts:46`)
and error texts name variables (`media-store.ts:66,72`). Dropping the name would change user-visible copy.

### 2.3 Validation at boot, in plain words

One call per process, at the entry point, before any I/O:

```ts
// apps/website/src/index.ts (and each other entry in §2.6)
const { config, issues } = loadServerConfig({ env: startupSecretEnvironment({ env: process.env }) });
reportEnvIssues({ issues }, { log: console.warn });   // prints every issue, not the first
```

Issue text is built by `formatEnvIssue` from the spec, never hand-written per call site and never generic:

```
TOVU_LOCAL_SITE_LIMIT is set to "abc". Tovu expected a whole number from 1 to 20.
Tovu is using 3 instead.
To fix: set TOVU_LOCAL_SITE_LIMIT to a number such as 5 in your .env file, or remove the line.

TOVU_PUBIC_URL is set, but Tovu has no setting with that name. Did you mean TOVU_PUBLIC_URL?
To fix: rename it in your .env file. Nothing was changed.

JINI_AGENT_DAEMON_PORT was renamed to TOVU_AGENT_DAEMON_PORT. The old name is ignored.
To fix: rename it wherever you set it (.env, Docker, your host's dashboard).
```

Rules:
- **Default is warn and carry on.** `onProblem: 'refuse'` is a closed list, each with a `refuseReason`, and
  starts as exactly the values that already stop boot today, so nothing changes silently:
  `TOVU_TRUST_PROXY=true` (`trust-proxy.ts:34`: lets any client spoof its IP), an unknown
  `TOVU_MEDIA_BLOB_STORE` or its missing companions (`media-store.ts:66,72`: media would be written to the
  wrong place), malformed startup-secret IPC (`startup-secrets.ts:30`), Jini's storage backend config
  (`SqliteBackendConfigError`, `backend-config.ts`). Adding to the list is an owner decision (D4).
- **Missing but recommended in production** (`deploy` set) is a warning with the fix, as
  `boot-readiness-gate.ts` does now. That gate keeps its own checks; it just reads typed config.
- **Unknown `TOVU_*` / `JINI_*` name** in the environment: warning with the nearest known name. Names of
  families (§2.5) and of other installed tools are not flagged.
- **Retired names** (the 7 renames, the 4 deletes): a warning that names the new variable. The old value is
  **not** used, so this is a tombstone, not an alias. Tombstones go one release later.
- **Parity first.** Each spec's `accepts` reproduces what the code accepts today (finding 8). Where today's
  code silently accepts garbage (`Number("abc")` → `NaN` for `JINI_AGENT_DAEMON_PORT`,
  `agent-daemon-server.ts:207`), the new warning is a visible change and is listed in the step's commit
  message and report. That is the only kind of behaviour change a step may make.
- A refusal throws one typed `EnvConfigError` carrying all issues; the entry point prints them and exits.
  Nothing is swallowed.

### 2.4 Secrets
- `kind: 'secret'` is the single source. Today: 19 Tovu and 12 Jini product names.
- **Never logged:** `formatEnvIssue` prints `received` for a secret as `(hidden, 12 characters)`.
  `redactEnv({ schema, env })` returns a copy with secret values replaced, and is the only way an env map may
  reach diagnostics, "Copy details", crash reports or telemetry. Tovu's redaction policy
  (`packages/contracts/src/secret-redaction.ts`) and Jini's `scripts/check-log-safety.mjs` take the secret
  field names from the schema instead of keeping a list.
- **Never in a browser bundle:** a spec with `kind: 'secret'` may not have a `*-build` reader or a `VITE_`
  name. Schema test.
- **Never in generated docs:** `.env.example` renders a secret as `NAME=` with its `fix` text. The generator
  has no access to values.
- **Startup delivery stays as it is.** `STARTUP_SECRET_KEYS` becomes "specs with `delivery: 'startup-ipc'`".
  `initializeStartupSecrets` keeps deleting them from `process.env`. First a test pins the list with an
  inline literal, then the list is derived.
- **Not in this design:** removing other secrets from `process.env`, or building child environments from an
  allow-list. 66 Tovu sites pass the parent environment to a child, so a child may depend on inheriting
  `TOVU_SITE_KEY`. Tightening that is real security work with a real break risk: D5.
- Public repos: docs and tests use obviously fake values; the existing `check:secret-scan` and
  `.semgrep` rule stay.

### 2.5 Families: names that come from declarations
A family covers names the schema cannot list in advance. Each has exactly one reader file, and the gate
allows a computed key only there.

| Family | Names come from | Reader today |
|---|---|---|
| F1 host signals | plugin `HostSignal.env` declarations | `contracts/core/host-signals.ts:84` |
| F2 object-store settings | `ObjectStoreEnvDeclaration` (`required`, `settings`, `credentialFields`, `secret`) | `features/object-storage/media-store.ts:70-78` |
| F3 static-publish credentials | deploy-target declarations | `features/deployments/static-publish/credentials.ts:133,147` |
| F4 admin-surface public config | pattern `^TOVU_…_(APP_ID\|CLIENT_ID\|BROWSER_KEY\|PUBLIC_KEY)$` | `features/agent-plugins/admin-surfaces/public-config.ts:27` |
| F5 per-site storage secret reference | the site's saved `storage.secretRef.env` | `platform/site-dir/site-key-dependent-data.ts:80`, `cli/commands/storage-move.ts:42` |
| F6 provider credentials (Jini) | `PROVIDER_CREDENTIAL_ENV_VARS`, `TAVILY_ENV_KEYS`, agent definitions | `integrations/…/dispatch/credentials.ts`, `daemon/src/http/research.ts:232`, `agent-runtime/src/defs/*` |

The registry that loads the declarations hands the declared specs to `parseEnv` (`optional.declared`), so a
bad value is reported with the same text as any other and the docs can say "these names come from installed
plugins". The readers keep their own typed errors (lesson 7).

### 2.6 Process config, site binding, site settings

| Tier | What | Parsed from | Lifetime |
|---|---|---|---|
| Process config | bind host, ports, paths, modes, telemetry, limits | `process.env` (+ startup IPC) at the entry point | frozen for the process |
| Site binding | which site this unit serves and how to call back (`TOVU_SITE_DIR`, `TOVU_WORKSPACE`, `TOVU_SITE_LISTENER_ORIGIN`, `TOVU_SITE_CALLBACK_ORIGIN`, `TOVU_SITE_PROCESS_CWD`, tokens) | the map the parent supplied: a child's `process.env`, or the per-site snapshot inside the shared daemon | one site scope |
| Site settings | what an owner edits in Admin (consent, SEO, assistant, media store) | the site database | changes at run time |

Rules:
- A value that differs per site and that an owner edits is a site setting, not env. Env may only give a
  process-wide default or an operator lock. A lock declares `locksSetting`, so Admin keeps saying which
  variable locked the switch (as `fullCliEnvLock` does today). Variables that lock or duplicate a setting
  today: `TOVU_MEDIA_BLOB_STORE`, `TOVU_VISITOR_TOOLS_POLICY`, `TOVU_ADMIN_ASSISTANT`,
  `TOVU_SITE_ASSISTANT_*`, `TOVU_CONSENT_*`, `TOVU_AGENT_*`.
- Site bindings are parsed with the same parser and the `launch-site` slice, from the supplied map. The
  shared daemon must never fall back to `process.env` for a site scope ("scoped environments remain
  independent", `startup-secrets.ts:37`).
- **Entry points (the only files that may touch `process.env`):** `apps/website/src/index.ts`, the CLI
  commands' top level, `server/inbound/assistant/agent-daemon-server.ts`, the tier-2 plugin worker entry, the
  local-site child entry, `server/runtime/boot/startup-secrets.ts`, `apps/desktop/src/main/index.ts`, the
  Vite configs, `apps/admin/src/lib/build-env.ts` (new), and `development/scripts/**`.

### 2.7 Desktop (Electron)
- The main process is a host entry. It parses the `desktop`, `launch-desktop` and `ambient` slices once.
  Today `main/index.ts` reads at module scope (lines 286, 302, 452, 499, 500, 660); the config load becomes
  the first statement, and the slices import nothing with side effects, so there is no earlier reader (lesson 3).
- Main → server child: the launch binding (§4, T4). `tovu-server.ts` today deletes about a dozen names from a
  copy of the environment and sets others; that becomes one `launchEnvFor` call with the same result, pinned
  by a characterization test first.
- Renderer and preload get settings over the existing IPC bridge only. The gate forbids `process.env` and
  `import.meta.env` under `apps/desktop/src/renderer/**` (0 today).
- Packaged-app facts (`TOVU_PACKAGED_DESKTOP`, `TOVU_BUNDLED_*`, `TOVU_NODE_TOOLCHAIN_DIR`) are launch
  bindings: `setBy: 'launcher'`, never in `.env.example`.

### 2.8 Build-time (Vite) variables
- Browser code has 10 reads: `import.meta.env.DEV` ×7, `MODE` ×2, `VITE_TOVU_SITE_URL` ×1
  (`apps/admin/src/lib/site-url.ts:29`). `apps/admin/src/lib/build-env.ts` becomes the one file that touches
  `import.meta.env` and exports a typed `buildEnv`. Hooks keep receiving plain values, as
  `use-queries-tab.hooks.ts:39` already does (`{ development: import.meta.env.DEV }`).
- `vite.config.ts` files run in Node and read `TOVU_ADMIN_DEV_PORT`, `TOVU_API_URL`, `TOVU_DISABLE_DEV_TLS`,
  `NODE_ENV`. They parse the `browser-build` slice. These specs have `phase: 'build'`.
- `apps/admin/src/vite-env.d.ts` and `apps/site-chat/src/vite-env.d.ts` (`ImportMetaEnv`) are checked
  against the slice by the generator's `--check`.
- Anything named `VITE_*` is public by construction. The schema test in §2.4 keeps secrets out.
- Not verified: how `JINI_CORE_VERSION` (declared in `vite-env.d.ts`) is injected.

### 2.9 What a Jini package looks like after

```ts
// before: packages/daemon/src/http/tool-execution-routes.ts:84
{ tokenEnvVar = DEFAULT_TOOL_EXEC_TOKEN_ENV_VAR, env = process.env } = {}
// after: the host passes a port; the package names no variable
export function requireToolExecutionCaller(required: { readonly toolExecToken: () => string | undefined }, optional = {}): RequestHandler
```

- **Getter, not value, where today's read is per call.** This guard's request handler closes over `env`
  (whether the key is read per request was not checked line by line), and Tovu moves the token between the
  env map and a holder after start-up (`daemon-access.ts:53-55`, `agent-daemon-scope.ts:173`). A plain value
  could be read too early (lesson 3). Rule for every migrated read: note whether it is per call; if so the
  port is a function.
- **Env maps as subject data stay**, as a **required** `hostEnv` argument: building a child's environment
  (`platform/child-environment.ts`, `sandbox-env.ts`, `daemon/agent-executor/agent-env.ts`,
  `agent-runtime/env.ts`), finding executables on `PATH`, resolving home and config directories. Those
  functions read only names in the schema's `ambient` slice or names their own declared allow-list holds.
  The allow-lists stay domain policy (`BASELINE_AGENT_ENV_KEYS` is a security list; it is not merged with
  the docs list).
- Hexagonal summary: inbound adapters = process entries and `bin/`; outbound port = `HostEnvironment`
  (`Readonly<Record<string, string | undefined>>`, already the shape of `core/contracts/runtime/environment.ts`);
  composition roots = Tovu's entries and the two presets; core tests run on plain objects.

---

## 3. The CI check

Extend `@jini-ai/devops/checks` (new file `env-access.ts`, reusing `hardwiring.ts`'s parser, violation and
`diffHardwiringDebt` helpers; the host scripts `scripts/check-hardwiring.ts` and
`development/scripts/check-hardwiring.mjs` pass the new inputs). The check stays generic: the host passes
`envRoots` (globs), `knownEnvNames`, `ambientNames` and `familyReaders`, all read from its schema.

| Rule | Fails when | Ratchet |
|---|---|---|
| `HW9-env-access` | `process.env` or `import.meta.env` is referenced outside `envRoots`. The `?? process.env` and `= process.env` forms count. Replaces HW1's allowance. | Yes. Baseline = today's sites: Jini 104 in packages (15 already HW1 debt), Tovu 349. |
| `HW10-env-name` | a static key read on `process.env`, `import.meta.env` or an object named `env`/`*Env` is not in `knownEnvNames`. Outside `envRoots`, a key that is not in `ambientNames` also fails (a package reading a host setting from a bag). | First part: **no baseline**, hard from day one (VARS.tsv registers every current name). Second part: ratcheted (Jini 113, Tovu 241 reads). |
| `HW11-env-dynamic` | a computed key on an env object outside a file listed in `familyReaders`. A key that is an identifier imported from the schema module counts as static. | Yes (Tovu 45, Jini 93). |

Also, as plain schema tests and one text scan:
- every spec has `summary` and `fix`; no duplicate `name` or `field`; `refuse` has a reason; `live` has a
  reason; no secret in a build reader;
- every schema name is read somewhere, or is `external` (catches "listed but never read");
- `Dockerfile`, compose, workflow, `package.json` script and shell files: a `TOVU_*`/`JINI_*` name not in the
  schema fails (the `deploy-mention` pass of `work/env-reads.mjs`);
- generated `.env.example` and docs are up to date (`--check`);
- tests are scanned too, advisory only (count written to the debt file), like untangle's test advisory.

Gate tests (fixtures, one per case, each must be able to fail: AP12): a root reading `process.env` passes; a
non-root `?? process.env` fails; an unknown name fails even in a root; an ambient name on an injected map
passes; a host-setting name on an injected map fails; a computed key in a family reader passes and elsewhere
fails; a debt hit passes, a higher count fails, a lower count prints "stale debt"; an unknown name in a
Dockerfile fails.

Prerequisite (lesson 5): Tovu CI uses the installed `@jini-ai/devops` (`check-hardwiring.mjs:3`), so J0 must
be published before T0 can turn the rules on in CI.

---

## 4. Migration

### 4.1 Jini (each step: its own commits, package tests + `pnpm guard` + `pnpm typecheck` green alone)

| Step | What | Names | Notes |
|---|---|---|---|
| **J0** | Gate: `env-access.ts`, three rules, baseline debt, fixtures. No behaviour change. Publish devops. | – | Prerequisite of everything. |
| **J1** | Contract in core (types, parser, formatter, redactor, renderers) with tests. Preset schema in `server` and `cli`. Generated `.env.example` + `docs/ENVIRONMENT.md` + `--check`. First consumer in the same step: `server/storage/backend-config.ts` (keeps `SqliteBackendConfigError` and its texts). | 18 config specs (their readers move in J3) | Needs D1. `L6-base-purity` must pass. |
| **J2** | `platform`, `cms` ffmpeg, `db` transfer, `devops` local-dev: `hostEnv` becomes a required argument; no ambient default. | 30 ambient | Breaking for callers that omit it. The compiler lists them; Tovu fixes its call sites in the version-bump commit. |
| **J3** | `server`, `daemon`, `mcp`, `sidecar`, `desktop-host`, `cli`, `http-kit`, `core`: name-plus-map pairs become values or getters (§2.9). `JINI_JSON_IPC_TRACE` becomes an option. | 30 | Largest. After untangle C6 (`AgentRuntimePort`) and R-lanes that move the same files (lesson 10). |
| **J4** | `agent-runtime`, `integrations`: required `hostEnv`; the env credential resolver moves to the preset (untangle Q8); `defs/reasonix.ts:13,15` direct reads become arguments. | 25 vendor | Family F6. |
| **J5** | Examples (own tiny schema or documented exception), `ui`/`ui-kit` `NODE_ENV` (2 sites) become an injected `development` flag, dev flags, test hooks, script-only names. | 15 + 12 | |
| **J6** | The four Tovu-named names in `agent-plugins`. | 4 rename | Needs D6. |
| **J7** | Debt is empty: delete HW1's allowance text; `process.env` only in `envRoots`. | – | |

### 4.2 Tovu (each step green alone: `npm run typecheck`, the area's tests, `check-hardwiring`)

| Step | What | Names | Prerequisites |
|---|---|---|---|
| **T0** | Schema slices as data for all 166 names (start from VARS.tsv; fill every `NOT VERIFIED` default from code). Schema tests. Gate in Tovu mode with baseline. No reader changes. | 166 | J0, J1 published. |
| **T1** | Generate `.env.example` and the environment doc (first output reviewed by diff; today's comment prose moves verbatim into `doc`). Derive `REQUIRED_SECRETS` and `STARTUP_SECRET_KEYS` (pin with literal tests first). Deploy-file scan. | 6 (+63 docs) | T0. |
| **T2** | OS and runtime facts: required `hostEnv`, `runtime-mode`. | 13 | T0; J2 bump. |
| **T3** | Server process config: `loadServerConfig` at each entry; `deps.ts` (25 sites) and `app.ts` (13 sites) receive `config`. | 37 | T0. **D2:** after size designs 01/02 split those files. Entries and non-composition files can go first as T3a. |
| **T4** | Launch bindings: one slice per parent/child pair; the parent builds the child env with `launchEnvFor`, the child parses the same slice. Includes the 3 renames. | 41 | T3. |
| **T5** | `features/`, `platform/`, `assistant/`, `contracts/core/`: functions that take an `env` bag take a typed slice (plus `sources` where they report a name). Families F1–F5. | 21 | T3. |
| **T6** | Desktop main. | 6 | T4. |
| **T7** | Browser builds: `build-env.ts`, Vite configs, `vite-env.d.ts` check. | 2 (+ `DEV`, `MODE`) | T0. |
| **T8** | Dev flags, test hooks, `development/scripts` (stay roots; names must be in the `dev-and-ci` slice), test conversion leftovers. | 32 + 45 script-only | T3–T6. |
| **T9** | Owner-decided deletes (4) and remaining tombstones; `JINI_ALLOWED_ORIGINS`/`JINI_WEB_PORT`/`JINI_BIND_HOST` stop being named in Tovu (after J3); debt to zero. | 4 delete, 3 | D3; J3. |

### 4.3 Renames and deletes (no aliases; one commit changes setter, reader, docs, tests, deploy files)

| Name | Action | Reason | Evidence |
|---|---|---|---|
| `JINI_AGENT_DAEMON_PORT` → `TOVU_AGENT_DAEMON_PORT` | rename, T4 | Tovu-owned; no Jini package reads it (0 files in `packages/*/src`) | `agent-daemon-server.ts:207`, `agent-daemon-port.ts:63`, `Dockerfile`, `.env.example` |
| `JINI_AGENT_DAEMON_URL` → `TOVU_AGENT_DAEMON_URL` | rename, T4 | same; pairs with `TOVU_AGENT_DAEMON_TOKEN` | `agent-daemon-scope.ts:174`, `agent-daemon-port.ts:60` |
| `TOVU_STOP_ON_STDIN_EOF` → `JINI_STOP_ON_STDIN_EOF` | rename, T4 | one meaning, two names; Jini's sidecar already sets the `JINI_` one. **Not verified** which launcher sets the `TOVU_` one | `cli/commands/serve.ts:490`, `agent-daemon-server.ts:67` |
| `TOVU_FORMS`, `TOVU_FORMS_SECRET`, `TOVU_GOOGLE_PICKER_APP_ID`, `TOVU_GOOGLE_PICKER_BROWSER_KEY` | rename, J6 | "No Tovu in Jini"; the host supplies the name | `agent-plugins/cloudflare/worker/forms-receiver.mjs:80`, `google-workspace/lib/picker-flow.mjs:31` |
| `TOVU_AGENT_NATIVE_FALLBACKS` | delete, T9 (D3) | the code calls it an alias of `TOVU_AGENT_FULL_CLI_ACCESS`, while `.env.example` recommends it | `assistant-native-fallbacks.ts:44,52` |
| `TOVU_AGENT_FORBID_BASH` | delete, T9 (D3) | `.env.example` calls it legacy. It also picks the strict prompt, so removal changes behaviour | `assistant-system-overlay.ts:147` |
| `TOVU_CONSENT_REGION_HEADER` | delete, T9 (D3) | "older setting" beside `TOVU_CONSENT_INGRESS`; removal drops one trusted header | `site-cookie-consent.ts:15,24` |
| `TOVU_ALLOWED_ORIGINS` | delete, T9 | inert: passed as a name together with `env: {}` | `visitor-frontend-control.ts:67-68` |

Near-duplicates kept, documented side by side in the schema (D3 can merge them later):
- hosted/production: `NODE_ENV`, `TOVU_RUNTIME_MODE`, `TOVU_HOSTED`, `TOVU_EXECUTION_MODE`, `TOVU_PACKAGED_DESKTOP`;
- parent pid: `TOVU_PARENT_PID`, `TOVU_DEV_SUPERVISOR_PID`, `TOVU_LOCAL_SITE_OWNER_PID`, `TOVU_DESKTOP_OWNER_PID`
  (they also say **which** launcher started the process, which local owner sign-in depends on);
- tokens: `TOVU_AGENT_DAEMON_TOKEN` / `JINI_DAEMON_TOKEN` / `JINI_API_TOKEN`, `TOVU_TOOL_EXEC_TOKEN` / `JINI_TOOL_EXEC_TOKEN`
  (host-side and Jini-side names for one value; they disappear from Tovu when J3 lands);
- databases: `TOVU_DB`, `TOVU_CONTENT_DB`, `TOVU_CHAT_DB`, `TOVU_DATABASE_JOURNAL_DB`;
- site selection: `TOVU_SITE`, `TOVU_SITE_DIR`, `TOVU_DESKTOP_SITE_DIR(S)`, `TOVU_SITES_HOME`, `TOVU_SITE_ROOTS`.

### 4.4 Tests (written before each step; each must be able to fail on the risk it names)
- **Characterization per variable, before its reader changes:** set the variable in a plain map, call the
  current function, assert the outcome. Inputs come from one shared hostile table (unset, `""`, `"  "`,
  `"abc"`, `"0"`, `"-1"`, `"true"`, `"TRUE"`, `"yes"`, `"off"`, a very long string) plus `limit-1`, `limit`,
  `limit+1` for numeric bounds (`TOVU_LOCAL_SITE_LIMIT`: 0, 1, 20, 21). The same table then runs against the
  spec. A difference is either fixed in the spec or listed as a visible change.
- **Eager or lazy:** for each read the scan marks `call` or `request`, a test changes the value after
  construction and asserts whether the behaviour follows. If it does, the spec is `live` with a reason, or the
  port is a getter. This is the test that catches lesson 3.
- **Launch bindings:** for each launcher (desktop → server, local-site, daemon supervisor, daemon scope) pin
  the exact key set and values of the child environment, and the keys removed, with an inline literal. Then
  swap in `launchEnvFor`.
- **Exact error text and type** for every issue kind and every refusal (owner rule; AP1).
- **Security defaults pinned** with inline literals (AP6): trust-proxy none, dev owner sign-in off, API auth
  on, the secret flag of every secret, the refuse list. One refusal test per deny flag.
- **Schema contract** (AP5): per slice, the list of names and each one's `kind` against an inline literal,
  not a regenerated snapshot.
- **Fakes, not mocks:** a test builds its config with a small factory (`makeServerConfig({ ...overrides })`)
  or passes a plain object as `hostEnv`. Tests stop writing `process.env` (572 Tovu and 99 Jini writes today);
  each step converts the tests of the files it touches, and the test advisory count shows what is left.
- Runners as the repos define them (not run here): Tovu `npm run typecheck` (`tsc -p tsconfig.json --noEmit`)
  and its `node --import tsx` test scripts, admin `vitest`; Jini `npm --prefix packages/<pkg> run test`,
  `pnpm typecheck`, `pnpm guard`. The executor confirms each seam exists before relying on it (lesson 11).

### 4.5 Estimate (rough, ±50%)
Basis: the untangle plan priced 572 import lines at about 4.3M Sonnet. Here there are about 450 direct sites (349 Tovu, 104 Jini packages),
354 bag reads and 138 computed reads in product code, simpler per site, plus about 670 test writes.
- Opus: contract + gate design, J3 port shapes, T4 launch slices: **~0.4M**.
- Sonnet: Jini J0–J7 **~1.2M**; Tovu T0–T9 **~3.0M**.
- About 14 lane runs. J0, J1, T0, T1 are sequential; then J2–J5 and T2/T5/T7 can run in parallel where files
  are disjoint. T3 and T4 are sequential and touch the composition files.

---

## 5. Owner practices, one by one

| # | Practice | Status |
|---|---|---|
| 1 | DI from the host; Jini never reads `process.env` | **Met, with one flagged conflict.** The existing rule HW1 explicitly allows `?? process.env` defaults; this design removes that allowance. And the two host presets would read env: read literally, practice 1 forbids that too. D1. |
| 2 | Args `(required, optional = {})` | Met in every sketch. `hostEnv` and config values move into `required` ("app values required with no defaults"). |
| 3 | Functions ≤ 50, files ≤ 500, complexity ≤ 10 | Met by design: coercer lookup table, four parse helpers, slices of about 40 specs, new gate file instead of growing `hardwiring.ts` (406 lines). To check in review: `deps.ts`/`app.ts` do not grow (T3 adds one parameter and removes reads). |
| 4 | Feature slicing | **Partly.** Slices are by area in one folder, not inside each feature folder, because desktop, Vite configs, scripts and the docs generator must import the whole schema without importing feature code. Alternative (a data-only `env.spec.ts` in each feature, listed by `tovu-env.ts`) is possible and costs more import care. Flagged, not blocking. |
| 5 | No barrels, shells, forwarders, aliases | Met. `tovu-env.ts` builds the schema value. Renames have no alias; the tombstone warning does not honour the old value. |
| 6 | Why-comments move with code | Met as a rule of T1 (`.env.example` prose becomes `doc` verbatim) and of every step (for example the `USER` bisection note in `agent-env.ts:10-17` stays on the list it explains). |
| 7 | Generic → Jini; a Jini package imports only itself, core, protocol | Met. Contract in core; gate in devops (run by scripts, imported by no package); preset schemas inside the presets. Tovu names stay in Tovu (lesson 9). |
| 8 | Tests use fakes of interfaces | Met (§4.4). |
| 9 | Errors never swallowed or generic | Met: typed `EnvIssue`, all issues printed, typed `EnvConfigError`, existing typed errors kept. |
| 10 | No new `eslint-disable`/`@ts-ignore`; no silent behaviour changes | Met by the parity rule and the per-step list of visible changes. The debt file is the existing ratchet, not a suppression. |
| 11 | Smallest change; reuse first; no abstraction with one user | Reuse: hardwiring gate and debt, `DeploymentSecret`, startup-secret IPC, `omitEnvironmentKeys`, `resolveRuntimeMode`, `--check` generator pattern. The contract has two users from J1/T0. No schema library, no secret wrapper. |
| 12 | Memory / IO cost | Parse once per process: about 200 specs, no I/O, microseconds, one frozen object. Site bindings: about 15 specs per site scope. `live` reads are O(1). No timers, caches or retained history. Generators and the gate run at dev/CI time only (the gate adds one AST pass over files it already parses). |

Reuse lines (implementation-guardrails):
- `Reuse: CI rule against env reads; searched Jini scripts/ + packages/devops/src/checks, Tovu development/scripts; inspected hardwiring.ts (HW1, HW6), check-hardwiring.{ts,mjs}, hardwiring-debt.json; used extend the existing inspector and debt ratchet; owner record: hardwiring adoption 2026-10-09 (debt file comment).`
- `Reuse: list of deploy secrets; searched "REQUIRED_SECRETS", "DeploymentSecret"; inspected deploy-config.ts:216, devops/src/deploy/config-contracts.ts; used derive from the schema, same shape; owner record: none found.`
- `Reuse: env schema/parser; searched both repos for env/config/settings modules (file-name search) and for zod env schemas; inspected core/contracts/runtime/environment.ts, platform/fs/env-text.ts, platform/secrets/keyring.env.ts, desktop-host/config.ts, server/storage/backend-config.ts; none is a schema; separate because no existing module owns "declare, validate and document a variable"; owner record: none.`

---

## 6. Lessons file applied (11 rules at that ref)

| Rule | Where |
|---|---|
| 1 Partition by real dependencies | Steps follow who sets and who reads (launch pairs, entries), not folders. |
| 2 Inventory before targets | VARS.tsv and the per-hit TSVs came first; the other name lists are in finding 6. |
| 3 Late-bound reads | §2.9 getter rule, §4.4 eager/lazy test, §2.7 module-scope reads, the `env === process.env` check in `startup-secrets.ts:42`. |
| 4 Inputs, outputs, init point, state owner | §2.6 tiers and entry list; config is frozen and owned by the entry; secrets stay owned by `startup-secrets.ts`. |
| 5 Migration graph | §4.1–4.2 prerequisites; J0 → T0 publish order; J2 breaking bump. |
| 6 Characterization tests that can fail | §4.4. |
| 7 Keep distinct contracts | `sources`, existing typed errors, per-variable `accepts`, optional vs default. |
| 8 Limits inside files | §2.2, §5 row 3. |
| 9 Generic vs host binding | Contract in Jini, names in the host; presets hold only `JINI_*`. |
| 10 Untangle lanes first | J3 after C6 and the R-lanes on the same files; T3 after size designs 01/02 (D2). Debt entries are keyed by fingerprint and do not follow moved code by path. |
| 11 Seams and commands exist | Quoted, not run; listed as unverified in §0.3 and §7. |

---

## 7. Risks and what is not verified
- **Eager instead of lazy** (highest). 241 Tovu bag reads happen at call time, and tests rely on changing the
  environment between calls. Mitigation: the eager/lazy test per variable, `live` specs, getters.
- **Per-site snapshot leaking into process config** inside the shared daemon. Mitigation: site bindings are
  parsed only from the supplied map; a test binds two sites with different values.
- **Child processes that depend on inheriting a variable** nobody names. T4 keeps inheritance; D5.
- **Cross-repo order.** J0/J1 must be published before T0; J2 is a breaking bump. I did not count Tovu call
  sites that rely on a Jini `env` default; the compiler will list them.
- **T3 collides with the deps/app size splits** (38 env sites in those two files). D2.
- **Phase and most defaults are not hand-verified** (§0.3). T0 closes this.
- **Not verified:** whether the OTel SDK reads the four `OTEL_*` names; how `JINI_CORE_VERSION` is injected;
  that Vite configs and scripts can import the schema folder cleanly; which launcher sets
  `TOVU_STOP_ON_STDIN_EOF`; preload reads. (Checked: all five `OD_*` hits in Jini are comments, and Jini's
  65 files are 59 in packages plus 6 in examples.)
- The estimate has no measured basis beyond site counts.

---

## 8. Owner decisions

| # | Question | Recommendation |
|---|---|---|
| **D1** | May Jini's host presets (`server`, `cli`) and `bin/` entries read `process.env`? Practice 1 read literally says no. | **Yes, only they.** They are hosts by untangle Q1. Otherwise every host re-types the `JINI_*` schema. The gate lists them as the only roots. |
| **D2** | T3 before or after size designs 01/02 (deps.ts, app.ts split)? | **After.** Do entries and non-composition files first (T3a). |
| **D3** | Merge or delete the near-duplicates: `TOVU_AGENT_NATIVE_FALLBACKS`, `TOVU_AGENT_FORBID_BASH`, `TOVU_CONSENT_REGION_HEADER`; keep `TOVU_HOSTED` and `TOVU_EXECUTION_MODE` beside `TOVU_RUNTIME_MODE`? | Delete the three (each changes behaviour slightly: stated in §4.3). Keep the hosted switches for now. |
| **D4** | Which invalid values may still stop boot? | Only what stops boot today (§2.3 list). Everything else warns. Also fix the stale "boot-blocking" / "refuses to start" wording. |
| **D5** | Build child environments from an allow-list and remove secrets from `process.env` after parsing? | **Later, as its own security change.** T4 keeps today's inheritance and only gives it one owner per launcher. |
| **D6** | The four `TOVU_*` names inside Jini plugins: rename now? | Yes (no external users). The Cloudflare binding rename needs a redeploy of any existing worker. |
| **D7** | Wrap secrets in an opaque type? | No. Schema flag + redactor + log-safety check. Revisit if a leak is found. |
