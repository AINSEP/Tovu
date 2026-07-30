# SEC-003 — Security Review: Site Install Dir (`tovu init` / `tovu serve` / `tovu --help`)

- **Feature:** SPEC-003 (site-install-dir)
- **Date:** 2026-07-28
- **Reviewer:** Security Agent (`AI-Dev-Shop/agents/security/skills.md`, `AI-Dev-Shop/skills/security-review/SKILL.md` loaded)
- **Scope:** first-ever security pass on this feature. `src/cli/**`, `src/site-dir/**`, `templates/**` (all untracked/new), `src/server/deps.ts` (modified). Reviewed against the working tree, not a commit diff.
- **Verdict:** **1 High** finding requires explicit human sign-off before this feature ships. No Critical.

---

## Trust boundary map

| Boundary | Crossing | Trust change |
|---|---|---|
| Operator shell → `tovu` process | `argv` (`<dir>`, `--name`, `--port`), `PORT`/`TOVU_*` env | Operator-trusted. Commander tokenizes; no shell is ever invoked. |
| Install dir on disk → `serve` | `config.json`, `.site-meta.json`, `content.db` | **Semi-trusted.** The spec (`feature.spec.md:38`, `api.spec.md §7`) declares this an additive compatibility surface shared with a *future desktop host*, i.e. files this runtime did not necessarily write. |
| `site-dir` → `server/deps.ts` | new `overrides: { db, workspaceId }` | Internal, in-process. |
| Network → bound listener | full public site + `/admin` HTTP surface | **Unauthenticated → authenticated.** This is the boundary the High finding sits on. |

Sensitive data in scope: the argon2 password hash, session rows, and all site content inside `content.db`; media bytes under `uploads/`.

---

## Findings

### SEC-003-01 — Default owner credentials on a listener bound to all interfaces

```
ID:          SEC-003-01
Severity:    High
Component:   tovu serve <dir>  (src/cli/commands/serve.ts → server/deps.ts → identity/seed.ts)
Type:        Use of hardcoded credentials + unintended network exposure (CWE-798, CWE-1327)
```

**Description**

`runServeCommand` binds with `app.listen(port)` and no host argument (`src/cli/commands/serve.ts:88`). Node defaults to the unspecified address, so the listener accepts connections on **every interface**, not loopback.

The same boot path reaches `createSqliteRouteDeps` → `createSqliteIdentityRouteDeps` → `buildIdentityRouteDeps` (`src/identity/wiring.ts:87`), which calls `seedIdentity` with `input: { workspaceId }` only. `seedIdentity` therefore falls through to its own defaults (`src/identity/seed.ts:201-202`):

```ts
const ownerUsername = normalizeUsername(input.ownerUsername ?? process.env.TOVU_ADMIN_USER ?? "admin");
const ownerPassword = input.ownerPassword ?? process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev";
```

That owner is granted the wildcard permission `*` (`src/identity/seed.ts:253-262`). `templates/starter/seed-content.json` ships no identity rows, so **every** dir created by `tovu init` gets these exact credentials on its first `tovu serve`, with no prompt, no randomization, and no forced rotation.

**Why this is a new finding rather than an inherited one:** `feature.spec.md:183` records the Article VI (Security-by-Default) **EXCEPTION** with the justification *"Carried over: no auth layer; serve is local-dev/self-hosted"*, and `api.spec.md:19` assigns `CLI_SERVE` the `LOCAL_PROCESS` auth profile. That risk acceptance is **stale**: SPEC-006 landed a real identity layer (principals, argon2 hashing, sessions, roles, policies) after this spec was written. The premise "no auth layer" no longer holds — there *is* an auth layer, it has a published default password, and the acceptance has never been re-reviewed against it. SPEC-003 is also what converts a `npm start` dev server into a shipped `tovu` bin described to end users as *"the website product you own"* (`src/cli/program.ts:29`), which is what turns the stale acceptance into a shipping risk.

**Exploit scenario**

1. A user runs `tovu init mysite && tovu serve mysite` on a laptop joined to a shared network (café, co-working space, hotel, conference Wi-Fi).
2. The listener is reachable at `http://<laptop-lan-ip>:3000`. Nothing in the boot line (`src/cli/commands/serve.ts:102`) tells the user the site is exposed beyond their machine.
3. An attacker on the same L2 segment scans for port 3000, finds `/admin`, and authenticates as `admin` / `tovu-dev`.
4. The owner principal holds `*`, so the attacker has full administrative control: read/modify/delete all content, manage members and their PII, reach the database-ops surface (restore points, `dbOps`), and configure integrations/webhooks — including outbound egress from the victim's host.

The same exposure applies to any host with a public IP and no firewall, where it is internet-wide rather than LAN-local.

**Affected files**

- `src/cli/commands/serve.ts:88` — `app.listen(port)` with no host binding
- `src/identity/seed.ts:201-202` — hardcoded `admin` / `tovu-dev` defaults
- `src/identity/wiring.ts:87-90` — seeds with defaults, never passing explicit credentials
- `src/server/deps.ts:199` — the serve path's entry into identity seeding
- `ADS-memory/specs/003-site-install-dir/feature.spec.md:183` — the stale Article VI exception

**Mitigation** (do not auto-patch; these are options for the human decision)

1. **Bind loopback by default.** `app.listen(port, "127.0.0.1")`, with an explicit opt-in (`--host`) required to widen. This alone reduces the finding to Low and is the smallest correct change.
2. **Remove the hardcoded password default.** On first boot with no owner user, either generate a random password and print it once to stdout, or refuse to boot until `TOVU_ADMIN_PASSWORD` is set. Keeping `"tovu-dev"` as a *silent* default is the core of the finding.
3. **Make the exposure visible.** The boot line should state the bound host, and warn loudly when bound non-loopback while a default-credential owner still exists.
4. **Re-adjudicate the Article VI exception** in `feature.spec.md` against the post-SPEC-006 reality. The current text asserts a fact about the system that is no longer true.

**Verification steps**

1. `tovu init /tmp/sec003 && tovu serve /tmp/sec003`
2. From a second host on the same network: `curl -i http://<host-lan-ip>:3000/admin` → must not connect once mitigation (1) ships.
3. Attempt admin login with `admin` / `tovu-dev` → must fail once mitigation (2) ships.
4. Confirm `curl http://127.0.0.1:3000/` still serves the site (no regression to the intended local flow).

**Human Sign-Off Required: YES.** This affects authentication and network exposure. Per `security-review/SKILL.md`, a High finding touching authentication cannot ship on agent judgement alone.

---

### SEC-003-02 — Schema guard fails *open* on a malformed `.site-meta.json`; the stamp is never validated

```
ID:          SEC-003-02
Severity:    Medium
Component:   src/site-dir/read-site-dir.ts → src/site-dir/schema-guard.ts
Type:        Improper input validation on a safety control (CWE-20, CWE-754)
```

**Description**

`readSiteDir` validates `config.json` properly (`validateConfig`, `read-site-dir.ts:58-69`) but reads `.site-meta.json` through a bare TypeScript cast with **zero runtime validation** (`read-site-dir.ts:84`):

```ts
const meta = readJsonFile(dir, ".site-meta.json") as SiteMetaJson;
```

`meta.schemaVersion` then flows straight into `compareSchemaVersion`, whose branches are `>` and `===` against a number (`schema-guard.ts:78-91`). Both comparisons are false for every non-numeric value, so control falls through to `return "migrate"`. I confirmed the coercion behaviour empirically against a runtime index of 5:

| `schemaVersion` value | `compareSchemaVersion` result |
|---|---|
| `undefined` (field absent) | `"migrate"` |
| `null` | `"migrate"` |
| `"v12"` (any non-numeric string) | `"migrate"` |
| `{}` / `[]` / `true` | `"migrate"` |
| `"3"` (numeric *string* equal to runtime) | `"migrate"` — not `"compatible"` |

The guard exists to enforce AC-06 / REQ-05 / INV-05: *a site whose schema is newer than the runtime must never have its `content.db` touched*. It fails **open** — a malformed or field-missing stamp is treated as "older, safe to migrate", so `bootSiteDir` proceeds to open the db and run `migrate()` (`boot-site-dir.ts:76`), then rewrites the stamp with the current runtime's values (`boot-site-dir.ts:86-90`), erasing the evidence that the original stamp was ever unreadable.

Secondary effect, directly relevant to the INV-02 question: a `.site-meta.json` containing only `{}` satisfies `readSiteDir` and therefore functions as a **valid commit marker**. `initSite` itself can never produce such a file (see the INV-02 clearance below), but `serve` accepts one from any other source.

**Exploit scenario**

This is a fail-open of a data-integrity control rather than an attacker-driven path — an attacker who can write `.site-meta.json` can already write `content.db`. The realistic trigger is the compatibility surface the spec explicitly plans for:

1. A future desktop host or a newer `tovu` (ADR-011/ADR-012, `feature.spec.md:38`, `api.spec.md §7`) writes `.site-meta.json` with `schemaVersion` serialized as a string, or adds a field-rename that leaves `schemaVersion` absent.
2. The user opens that site with an **older** `tovu serve`.
3. The guard returns `"migrate"` instead of throwing `SiteNewerThanRuntimeError`. The older runtime applies its own migrations to a newer database.
4. `content.db` is corrupted in a way no exit code reported, and the stamp is rewritten so the next boot looks clean.

**Affected files**

- `src/site-dir/read-site-dir.ts:84` — unvalidated cast
- `src/site-dir/schema-guard.ts:74-91` — `>` / `===` fall-through to `"migrate"`
- `src/site-dir/boot-site-dir.ts:72` — the guard's only call site

**Mitigation**

Validate `.site-meta.json` at the same boundary and to the same standard as `config.json`. Minimum: `Number.isInteger(schemaVersion) && schemaVersion >= 0` and `typeof schemaTag === "string" && schemaTag.length > 0`, throwing `SiteDirInvalidError` otherwise. Independently, invert `compareSchemaVersion`'s default so only a value proven strictly less than the runtime index returns `"migrate"` — an unrecognized stamp must fail **closed**, never migrate.

**Verification steps**

1. Build a valid install dir, then rewrite `.site-meta.json` with `schemaVersion: "v12"`. `tovu serve` must exit `SITE_DIR_INVALID` (3) or `SITE_NEWER_THAN_RUNTIME` (4) — never boot.
2. Repeat with the `schemaVersion` field deleted, with `null`, and with `{}` as the whole file. All must refuse.
3. Confirm `content.db`'s mtime is unchanged after each refusal — the guard must run before the db is opened.
4. Confirm a well-formed older stamp still migrates and re-stamps (no regression to BR-06).

**Human Sign-Off Required:** No (Medium — track and fix), but it should be fixed before the desktop host consumes this surface, since that is the scenario that makes it live.

---

### SEC-003-03 — `serve` writes outside the install dir and creates files the layout contract excludes (INV-01 / INV-04 violation)

```
ID:          SEC-003-03
Severity:    Medium
Component:   src/cli/commands/serve.ts → src/server/deps.ts
Type:        Unintended write location / broken containment contract (CWE-668)
```

**Description**

INV-01 (`feature.spec.md:117`) states: *"`init` and `serve` must never write any file outside the target install dir (stdout/stderr excepted)."* INV-04 (`feature.spec.md:120`) narrows serve's in-dir write set to `content.db` plus the two stamp fields. The serve path violates both.

`runServeCommand` correctly derives `dbPath` from the resolved target (`serve.ts:83`), but `createSqliteRouteDeps` resolves three other filesystem roots from **`process.cwd()`**, not from the install dir:

- `mediaUploadsDir()` — `deps.ts:107` → `process.env.TOVU_MEDIA_UPLOADS_DIR ?? join(process.cwd(), "uploads")`. This is `LocalFsBlobStore`'s `rootDir` (`deps.ts:480`), which writes uploaded media bytes via `join(this.rootDir, storageKey)` (`src/media/blob-store.fs.ts:34,38-41`). **Media uploaded through a served site lands in the operator's current working directory, outside the install dir** — a direct INV-01 violation. Meanwhile `initSite` dutifully creates an `<target>/uploads/` that nothing ever writes to (`init-site.ts:39`).
- `builtInThemesDir()` — `deps.ts:112` → `process.cwd()/themes`, passed to `discoverThemes` (`deps.ts:429`). The seed sets `activeThemeId: "tovu-official"`, so the *same install dir serves different content depending on which directory the operator invoked `tovu serve` from*, and a `themes/` directory that happens to sit in the cwd is loaded as render templates. (Liquid rendering is tag/filter-allowlisted via `lintLiquidTemplate`, which caps the impact; and an attacker who can plant files in your cwd already has substantial access. Noted as configuration confusion, not as an independent RCE path.)
- `defaultDatabaseJournalDbPath(dbPath)` — `deps.ts:142` → `<target>/ops/database-journal.db`, with `mkdirSync(..., { recursive: true })` at `deps.ts:356`. This one is *inside* the target, but `REQ-01` says the layout is *"exactly"* the seven listed entries and *"No other files are required or created"*, and INV-04 says `content.db` is the only file serve writes. First boot silently adds an `ops/` subtree to a layout the spec describes as a **frozen** desktop-host compatibility contract (`feature.spec.md:38`).

The net effect is that "site is a folder" — this feature's entire thesis — does not hold: moving the folder loses the media, and serving from a different cwd changes both the media root and the active theme.

**Exploit scenario**

Not attacker-initiated; the impact is data placement and containment.

1. An operator runs `tovu serve /srv/mysite` from their home directory and uploads media through `/admin`.
2. Bytes are written to `~/uploads/...`, while `content.db` rows in `/srv/mysite` reference them by storage key.
3. The operator archives or moves `/srv/mysite` per the portability contract. Every media asset 404s, and the bytes remain in an unrelated directory the operator does not know contains site data.
4. If `tovu serve` is run from a directory that is itself web-served or world-readable, uploaded content is exposed through a path no one intended.

**Affected files**

- `src/server/deps.ts:107` (`mediaUploadsDir`), `:112` (`builtInThemesDir`), `:142`/`:355-357` (ops journal)
- `src/server/deps.ts:429`, `:480` — the cwd-rooted values reaching real adapters
- `src/cli/commands/serve.ts:83-84` — the call site that knows the resolved target but passes only `dbPath`

**Mitigation**

Pass the resolved install-dir target into `createSqliteRouteDeps` (it already accepts an `overrides` object) and root `uploads/` and `themes/` under it, keeping the `TOVU_*` env vars as explicit escape hatches. Separately, either amend REQ-01/INV-04 to admit `ops/` or relocate the journal — the spec and the code must agree on the frozen layout before the desktop host depends on it.

**Verification steps**

1. `cd /` (or any unrelated dir); `tovu serve /tmp/site`; upload a file via `/admin`.
2. Assert the bytes appear under `/tmp/site/uploads/` and that no `uploads/` was created in the invocation cwd.
3. Re-run from a different cwd; assert the same media still resolves and the active theme is unchanged.
4. Assert the full set of paths written under the target matches REQ-01 exactly (or matches the amended contract).

**Human Sign-Off Required:** No (Medium — track), but this contradicts a spec invariant, so it needs a spec amendment or a code fix, not silent acceptance.

---

### SEC-003-04 — `createSqliteRouteDeps` together-or-neither override guard is not airtight (null vs undefined)

```
ID:          SEC-003-04
Severity:    Low
Component:   src/server/deps.ts:156-194 (createSqliteRouteDeps)
Type:        Incomplete invariant enforcement (CWE-754)
```

**Description**

The lead asked specifically whether the new `overrides` validation is airtight and whether `workspaceId` resolution can be spoofed through it. It is **not** airtight, though the gap is not reachable from the CLI.

The guard tests presence with `!== undefined` (`deps.ts:162-168`) but both consumption sites use `??`, which is null-*and*-undefined tolerant (`deps.ts:173-174`, `:194`). The two predicates disagree on `null`:

```ts
const hasOverrideDb = overrides?.db !== undefined;              // null  → true  (passes the guard)
const db = overrides?.db ?? openContentDb(dbPath, {...seed}, ...); // null  → falls back (opens its own db)
```

So `createSqliteRouteDeps(dbPath, { db: null, workspaceId: "anything" })` passes the together-or-neither check, then **opens and demo-seeds a second database at `dbPath`** while scoping every repo — including `createSqliteIdentityRouteDeps` — to a caller-supplied `workspaceId` that `resolveWorkspace`'s exactly-one-row guard never vetted. That is precisely the "supply an id instead of resolving it" shape CIC U-001 was written to prevent.

A second, milder case: `workspaceId: ""` is `!== undefined`, so it passes the guard, and `"" ?? …` yields `""` (nullish coalescing does not treat empty string as absent). Every repo is then scoped to a workspace that does not exist, yielding a silently empty application rather than an error.

**Exploitability:** none from the CLI. `bootSiteDir` always returns a real handle and a `resolveWorkspace`-validated id (`boot-site-dir.ts:94,102`), and the TypeScript signature types `db` as non-nullable `ContentDb`. This is a defense-in-depth gap in a guard the CIC treats as load-bearing, reachable only by an in-process caller that violates the type or by future JS callers.

**Affected files**

- `src/server/deps.ts:162-168` (guard), `:173-174` and `:194` (consumption)

**Mitigation**

Make the two predicates agree. Either test with `!= null` in the guard, or reject a nullish-but-present field explicitly. Additionally reject a non-empty-string `workspaceId` at the boundary rather than accepting `""`.

**Verification steps**

1. Unit test: `createSqliteRouteDeps("/tmp/x.db", { db: null, workspaceId: "w" })` must throw, not open a db.
2. Unit test: `{ db: realDb, workspaceId: "" }` must throw.
3. Confirm the legal shapes still work: both fields supplied, and neither supplied.

**Human Sign-Off Required:** No.

---

### SEC-003-05 — Untrusted install-dir bytes reach the terminal unsanitized

```
ID:          SEC-003-05
Severity:    Low
Component:   src/site-dir/boot-site-dir.ts:99, src/site-dir/read-site-dir.ts:53
Type:        Output encoding / information disclosure (CWE-117, CWE-209)
```

**Description**

Two paths write install-dir-controlled bytes to the operator's terminal without sanitization.

1. `bootSiteDir` logs the unvalidated `meta.templateId` verbatim (`boot-site-dir.ts:99`). Since `.site-meta.json` gets no runtime validation (see SEC-003-02), `templateId` may contain ANSI/VT control sequences, allowing terminal-escape injection into the operator's console and into any log that captures it — cursor manipulation, spoofed output lines, and on some terminals clipboard or title manipulation.
2. `readJsonFile` interpolates V8's `JSON.parse` `SyntaxError` message into the thrown error (`read-site-dir.ts:53`), which `cli/errors.ts:108` prints. Modern V8 embeds a snippet of the offending input in that message. Because `statSync` follows symlinks, pointing `config.json` at a small non-JSON file the operator can read (e.g. a credentials file) echoes roughly the first 30 bytes of it into stderr and any log capturing it.

Impact is bounded: the reader is the operator, and both require control over the install dir's contents. Reported for defense in depth.

**Mitigation**

Strip C0/C1 control characters from `templateId` (and any file-sourced string) before writing it to a stream. Report parse failures with the file name, byte offset, and error *kind* only, without echoing V8's message body.

**Verification steps**

1. Set `templateId` to a value containing `[2J`; run `tovu serve`; confirm the warning renders the escape literally and does not clear the screen.
2. Symlink `config.json` to a small non-JSON file; confirm the stderr line names the file and offset but contains none of its bytes.

**Human Sign-Off Required:** No.

---

### SEC-003-06 — Privileged and wildcard-exposed ports accepted without warning

```
ID:          SEC-003-06
Severity:    Low
Component:   src/cli/commands/serve.ts:35-53
Type:        Insecure default / missing warning (CWE-1188)
```

`parsePort` accepts the full `1..65535` range, including privileged ports `1..1023`, from three tiers: `--port`, `config.json.port`, and the `PORT` env var (`serve.ts:48-53`). Binding below 1024 requires elevated privileges, so this only succeeds when `tovu serve` is run as root — a configuration that, combined with SEC-003-01, means a full-privilege process serving an admin UI with default credentials on port 80. Note also that `config.json.port` is a **file-sourced** value: an install dir obtained from elsewhere can silently select the port the operator's machine binds.

The validation itself is sound — the regex `^\d+$` rejects non-integers, negatives, and hex/exponent forms, and each tier fails as `VALIDATION` rather than falling through to the next, matching BR-02.

**Mitigation:** warn when the resolved port is `< 1024`, and warn when the port came from `config.json` rather than the operator's own flag. Optionally refuse to run as root.

**Human Sign-Off Required:** No.

---

## Areas checked with no exploitable path found

Stated plainly, as requested — each of these was verified against the implementation, not against the existence of a test.

**Command injection — none.** `grep` for `child_process`/`exec`/`spawn` across `src/cli/**` and `src/site-dir/**` (excluding tests) returns **zero** hits. No shell is involved anywhere in the production CLI path: `commander` performs argv tokenization in-process (`program.ts`), and the `<dir>` / `--name` / `--port` values reach only `fs` and `path` APIs, which take strings and never re-interpret them. The integration tests that do spawn processes pass argv arrays with no `shell: true` (verified by grep), so even the test harness has no injection seam. Shell metacharacters in `<dir>` are treated as ordinary filename bytes.

**Path traversal via embedded `..` — no escape.** `resolveInstallDirTarget` calls `path.resolve(dirArg)` first (`resolve-install-dir-target.ts:41`), which collapses `..` lexically before any filesystem call. Both `initSite` (`init-site.ts:115`) and `bootSiteDir` (`boot-site-dir.ts:60`) bind that single result to `target` and derive **every** subsequent path from it via `path.join(target, …)` — I traced each write individually: the four `mkdirSync` calls (`init-site.ts:128,132`), `config.json` (`:138`), `content.db` (`:144`), `.site-meta.json` (`:160`), the stamp rewrite (`boot-site-dir.ts:89`), and the temp file inside `writeJsonFileAtomic` (`atomic-write.ts:34`, which derives its directory from `path.dirname(filePath)`, itself already target-derived). No write is constructed from the raw `dir` argument anywhere. This holds in the implementation, independent of `path-containment.integration.test.ts`.

**Symlink escape — handled, and the deliberate non-canonicalization is correct.** `resolveInstallDirTarget` covers all three shapes: a non-symlink path returned lexically, a live symlink resolved via `realpathSync`, and a dangling symlink followed one level via `readlinkSync` with relative targets re-resolved against the link's own directory (`resolve-install-dir-target.ts:43-65`). Ancestor path segments are deliberately not canonicalized. I checked whether that is a hole and it is not: with no base directory to be confined to, the operator *is* the one naming the path, so following an ancestor symlink grants no privilege the operator's own uid does not already have, and the OS enforces permissions on the real destination regardless. INV-01's guarantee — everything lands under the one resolved target — is unaffected either way.

**No second-order path traversal.** I traced every field read out of the install dir to check whether any file *content* contributes to a filesystem path. `config.json` yields `name` (display only), `domain` (unused), and `port` (integer-validated). `.site-meta.json` yields `schemaVersion`/`schemaTag` (compared, see SEC-003-02), `templateId` (logged, see SEC-003-05), and fields never read. **No path anywhere in this feature is derived from install-dir file content** — the traversal-via-config class of bug does not exist here.

**64 KiB corruption guard — correctly ordered.** The size check runs on `fs.statSync` **before** `fs.readFileSync` and therefore before `JSON.parse` (`read-site-dir.ts:36-49`) — the file's bytes are never loaded into memory when oversized, which is the property that actually matters. `!stat.isFile()` additionally rejects FIFOs, character devices, and directories, so a `config.json` symlinked to `/dev/zero` or a named pipe is refused rather than read unbounded. `statSync` follows symlinks, so the size checked is the real target's. The residual stat/read TOCTOU (a file growing between the two calls) is local-only and requires an actor who already has write access to the install dir; negligible. Note for completeness: `readTemplate` (`read-template.ts:59-60`) and `runtimeSchemaVersion` (`schema-guard.ts:49`) read without a cap, but both read repo-shipped files under `__dirname`, not install-dir input — correct to leave uncapped.

**INV-02 fake commit marker from `initSite` — not reachable.** I worked each failure mode:
- The marker `.site-meta.json` is the physically last write on the success path (`init-site.ts:151-160`), gated behind every prior step.
- It is written atomically — temp file plus `renameSync` in the same directory (`atomic-write.ts:32-37`) — so a crash mid-write leaves an orphan `.tmp` file and no marker, never a truncated marker.
- On any thrown failure, `wroteAnything` (set only *after* each mutating step succeeds, never before attempting it) gates a `rmSync` of the entire target (`init-site.ts:164-166`).
- If that cleanup itself fails, `InternalError` names the surviving directory rather than swallowing it (`:167-175`) — and the marker was still never written, so `serve` refuses the dir.
- On `SIGKILL`/power loss the catch block never runs, but the result is a marker-less directory that `readSiteDir` rejects with `SiteDirInvalidError`.

Every path terminates in "no marker" or "complete site". `initSite` cannot produce a directory that looks complete but is not. The related weakness is on the **read** side — `serve` accepts a marker it did not write without validating its contents — which is filed as SEC-003-02.

**EC-05 lock contention — the security posture is correct, not merely test-passing.** `bootSiteDir` wraps the `openContentDb` call in a try/catch that converts *any* open/migrate failure into `SiteCorruptError` (`boot-site-dir.ts:76-80`), which `cli/errors.ts:113-115` maps to exit 5. I verified there is **no fallback branch**: `db` is never assigned on failure, `resolveWorkspace` is never reached, and control never returns to `runServeCommand`, so no listener is ever bound and no degraded/read-only/in-memory mode exists to fall back to. This is a correct fail-closed design. `busy_timeout = 5000` (`content-db.ts:73`) means a *transient* lock is retried rather than treated as corruption, which is the right distinction — only a genuinely sustained lock surfaces as `SITE_CORRUPT`. One non-security note: when `migrate()` throws after `new Database()` succeeded, the underlying handle is not closed before the throw; harmless in a CLI that exits immediately, but it would leak in a long-lived embedding host.

**Media storage keys — no traversal.** Since `tovu serve` now exposes the media surface, I checked `LocalFsBlobStore`: `put` derives its key from `computeBlobStorageKey(input)` (content/hash-derived, `blob-store.fs.ts:38`), not from a user-supplied filename, and `get`/`remove` take keys from database rows. No user-controlled string reaches `join(this.rootDir, …)`. The *root* is wrong (SEC-003-03), but the key handling is sound.

**Secret handling — clean for this feature.** No secrets in `src/cli/**`, `src/site-dir/**`, or `templates/**`. `templates/starter/seed-content.json` contains only a workspace row, 8 demo entries, and presentation settings — no credentials, tokens, or PII. The one hardcoded credential in the boot path lives in `src/identity/seed.ts` and is filed as SEC-003-01.

**Dependency changes — none.** This feature adds no runtime dependency beyond `commander`, which was already present. No CVE review triggered.

---

## Overall threat assessment

The filesystem code in `src/site-dir/**` is the strongest part of this change. Path containment is enforced structurally — one resolution point, one `target` variable, every write derived from it — rather than by convention, and the commit-marker discipline in `initSite` genuinely closes INV-02 across all failure modes including cleanup failure and hard kill. The CLI surface is free of command-injection risk by construction, because no shell is ever involved. These areas do not need rework.

The risk is concentrated at the two ends the filesystem work does not cover.

At the **network boundary**, `tovu serve` binds every interface and boots a site whose seeded owner holds `*` with the password `tovu-dev`. The spec's Article VI exception blesses this on the grounds that there is "no auth layer" — a statement that stopped being true when SPEC-006 landed identity. The acceptance is stale, and SPEC-003 is what turns it from a dev-server footgun into a shipped product default. This is the one finding that must not ship unreviewed.

At the **file-parsing boundary**, `.site-meta.json` is trusted completely while `config.json` is validated properly, and that asymmetry defeats the schema guard: any malformed stamp is read as "older, safe to migrate", so an older runtime will migrate a newer site's database and then rewrite the stamp to hide it. This matters more than its Medium rating suggests, because the spec deliberately designates these files a compatibility surface for a future desktop host — the exact situation in which cross-implementation serialization differences appear.

Separately, the install dir is not as self-contained as the feature claims: media bytes and theme loading are rooted at `process.cwd()`, so "site is a folder" does not survive being moved or being served from a different directory.

**Ship gate:** SEC-003-01 requires explicit human sign-off before this feature ships. SEC-003-02 and SEC-003-03 should be scheduled — 03 needs either a code fix or a spec amendment, since code and spec currently contradict each other on a contract the spec calls frozen. SEC-003-04 through 06 are defense-in-depth and can follow in the next cycle.

No fixes were implemented. Per the Security Agent guardrails, findings are surfaced only; a human decides what ships.
