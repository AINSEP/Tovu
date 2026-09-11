# fs-files denylist gap sweep — 2026-09-10

Read-only audit of `apps/website/src/features/fs-files/{fs-files.ts,layout.ts,agent-tools.ts}` after
the 2026-09-10 flip from a five-member named-root allowlist to default-allow over two whole-tree
roots (`repo` = `resolveProductRoot()`, `site` = `resolveSiteRoot()`), gated by `FS_FILES_DENYLIST`.
Goal: find credential/PII-bearing files reachable under those two roots that the current denylist
does not catch.

**No values were read into or printed by this report.** Every claim below is evidenced by a file
path, a key/pattern NAME, or a labeled-fixture string (`CANARY`, `FAKE`, `NOT-REAL`, `FULLSECRETVALUE`
etc.) — never a live secret.

## Scope and method

- Inventory: `git status --ignored --porcelain` (261 entries) plus `find`/`file` over both roots.
- `node_modules`, `.git`, `dist` excluded from directory walks by path, per instructions — but note
  (as `fs-files.ts`'s own header does) that `EXCLUDED_LISTING_DIR_NAMES` only hides these three from
  `fs_list_files` *listings*; `fs_read_file` will happily read a path inside any of them if the caller
  already knows it. I did **not** sweep `node_modules` contents (out of scope per dispatch), so a
  vendored package carrying a committed fixture credential is unchecked — see "What I could not
  check."
- `command grep` used throughout (this shell's `grep` is ugrep and ignores `--include`/`--exclude`).
- High-confidence secret-VALUE regexes run repo-wide (excl. `node_modules`/`.git`/`dist`): AWS
  (`AKIA[0-9A-Z]{16}`), Anthropic/OpenAI (`sk-ant-`, `sk-proj-`, `sk-`), GitHub (`ghp_`/`gho_`),
  GitLab (`glpat-`), Google (`AIza`), Slack (`xox[baprs]-`), PEM private-key headers, and
  `scheme://user:pass@host` connection strings.
- `git log`/`.git/config` checked for an embedded PAT in the remote URL — clean, no token in the
  origin URL.

## Ranked findings

### 1. `.mcp.jini-*.json` (44 files) + `.mcp.json` — ALREADY CLOSED, verify only
The task brief describes these as "being added now." I read the live `fs-files.ts` and the pattern
is already in `FS_FILES_DENYLIST.filenamePatterns`:

```
/^\.mcp(?:\..*)?\.json$/i
```

This matches both `.mcp.json` and every `.mcp.jini-<uuid>.json`. Confirmed by direct regex test
against real filenames from `git status --ignored`. **No further action needed here** — reporting it
as closed rather than open so it isn't miscounted as a live gap.

### 2. No new denylist gap found
I could not find a credential-bearing file under `repo`/`site` that misses every current pattern.
Every credential-**shaped** hit from the repo-wide scans above resolved to one of:
- Already denied: `.env`, `.env.bak-before-forbid-bash` (matches `^\.env(?:\..*)?$`), `.certs/*.pem`
  and `apps/admin/.certs.disabled/*.pem` (matches `\.pem$`), `sites/tovu-com/{chat,content}.db*` and
  `sites/tovu-com/ops/*.db*` and `apps/website/sites/tovu-com/content.db` (matches `\.db$`/`\.db-wal$`/
  `\.db-shm$`).
- Clearly-labeled test/fixture values, not real keys — e.g. `sk-ant-KEYSTROKE-LEAK-CANARY`,
  `sk-ant-ECHO-FROM-PREFIX-CANARY`, `sk-ant-SECRET-FOR-ANTHROPIC-ONLY` (all in `development/e2e/byok-*.spec.ts`
  and their Playwright `error-context.md` failure captures), `sk-ant-test-FAKE-KEY-NOT-REAL`
  (`ADS-memory/.local-artifacts/2026-08-04-byok-e2e/run.js`, `ADS-memory/reports/findings/2026-08-04-byok-e2e-verification.md`),
  `AIzaTest-FAKE-GEMINI-KEY-NOT-REAL-0000000000` (`apps/website/src/features/webhooks/secret-scan-guard.ts`
  and its test — this is the redaction guard's OWN unit-test fixture), `glpat-FIXTUREGITLABTOKENCCCC3333`
  / `glpat-FIXTURE_TO_BE_CORRUPTED` (`development/scripts/__tests__/backfill-vendor-credentials.test.ts`),
  and `sk-ant-api03-FULLSECRETVALUE-wxyz` (`ADS-memory/.local-artifacts/handoff/terra-audit-scope/runs/r2/audit-fixes-terra.jsonl` —
  a captured codex transcript of a PAST fix to a key-redaction bug; the string is a unit-test fixture
  for `maskedKeyLabel`, confirmed by reading the surrounding diff context).
- Pattern-definition code, not key material: `development/scripts/lib/secret-patterns.ts` and
  `apps/website/src/features/webhooks/secret-scan-guard.ts` both contain the *regex* that matches a
  PEM header (`-----BEGIN...PRIVATE KEY-----`), not a key.
- Unrelated collisions: every other `BEGIN` hit repo-wide was `BEGIN IMMEDIATE` (SQLite transaction
  syntax in `features.json`'s embedded source comments and a coverage JSON's embedded source text),
  not `BEGIN...PRIVATE KEY`.

Also checked and clean: `.claude/settings.local.json` (only `allow`/`enabledMcpjsonServers`/
`outputStyle`/`permissions` keys — Claude Code tool-permission config, no secrets), `postfiber.json`
(a stale Playwright DOM-scrape artifact — `href`/`names`/`found` keys, the "names" are React
component names, not credentials or PII), `sites/tovu-com/config.json`, `.site-meta.json`,
`development/.jini-link-state.json` (all benign structural metadata — domain/port/siteId/schema
version, nothing credential-shaped), one sampled plugin `mcp.json` under
`sites/tovu-com/agent-plugins/.../packages/sha256/*/` (empty `{"mcpServers": {}}` stub). No
`.npmrc`, `.netrc`, SSH private keys, `credentials.json`, `client_secret*.json`, `*.tfvars`,
`*.keystore`, `*.jks`, `*.pfx`, `*.crt`, or `*.cer` exist anywhere in the tree today. Upload
`blobs/*` sampled as PNG/WebP images (binary — blocked by the binary sniff regardless of
extension). `ADS-memory/docs/user-complaints/*` is cross-model WordPress/WooCommerce complaint
*research* (per its own README), not real Tovu customer data.

## Proposed hardening (no live gap forced this, but the family is cheap to close now)

None of these have a real instance in the repo today, but they're the standard shapes a denylist
built the same way `.pem`/`.key`/`.p12` was would naturally also cover, and the owner's own framing
("treat a new credential-shaped file... as a gap to close here, not a one-off") argues for closing
the family now rather than after the next accidental discovery:

```ts
// Certificate/keystore siblings of the existing .pem/.key/.p12 entries
/\.crt$/i,
/\.cer$/i,
/\.cert$/i,
/\.pfx$/i,
/\.jks$/i,
/\.keystore$/i,
// JSON Web Key material
/\.jwk$/i,
/\.jwks$/i,
// Exact-basename credential files (no useful extension to pattern-match on)
/^\.npmrc$/i,
/^\.netrc$/i,
/^id_(rsa|dsa|ecdsa|ed25519)$/i,          // NOT the .pub sibling — that's public
// Common default OAuth/service-account export names
/^credentials\.json$/i,
/^client_secret.*\.json$/i,
```

## Dev-server log verdict: FALSE POSITIVE — no real credential values

`development/.dev-server.log` (1,736,716 bytes): 270 case-insensitive "token" hits, 1 "password" hit.
Checked every hit after filtering known component/hook/table names. Result: **all** remaining hits
are coverage-report or Vite HMR **filenames** —
`coverage-lib-audit/lcov-report/.../access-tokens-dependencies.hooks.ts.html`,
`.../use-access-tokens.hooks.ts.html`, `.../use-reset-password-fields.hooks.ts.html` — not values.
Grepped explicitly for `Authorization:`, `Bearer `, `Set-Cookie`, and session-cookie phrasing: zero
matches. No PEM header, no `AKIA`/`sk-ant-`/`ghp_`/etc. shape anywhere in the file.

Separately, and NOT a designed control: the file is 1,736,716 bytes against `fs-files.ts`'s own
`MAX_FS_FILE_BYTES = 1_000_000`, so `fs_read_file` cannot return it at all right now — it throws
before ever reaching the binary/content checks. This is incidental (log rotation, a fresh dev
session, or simply a quieter day would drop it under the cap) and should not be cited as why the log
is safe; the verdict above is based on content, not size.

## What I could not check (named explicitly)

- `node_modules` contents — excluded by the dispatch's own scoping instruction, so a vendored
  package's own committed test fixture is unchecked. `fs_read_file` does not exclude
  `node_modules` from direct reads (only `fs_list_files` does), so this is a real blind spot, not a
  formality.
- `.git` packfiles/loose objects for a since-removed secret still present in history — checked
  `.git/config` only (clean). A secret committed once and later deleted is not reachable through
  `fs_read_file` as a normal path today, but I did not attempt to enumerate loose objects.
- Did not manually read every file under `ADS-memory/` (see the `find -maxdepth 2` tree in this
  sweep — dozens of subdirectories, hundreds of reports/specs). Coverage there is by targeted
  high-confidence regex only, not exhaustive prose review; a secret pasted into a report without a
  recognizable prefix (a raw password with no `password=` label, an internal hostname, a bare
  session-cookie value) would not have been caught.
- Did not open every one of the ~11 plugin packages' `plugin.json`/`mcp.json` under
  `sites/tovu-com/agent-plugins/.../packages/sha256/*/` — sampled one (empty stub) and relied on the
  regex sweep for the rest.
- Did not inspect image blob bytes beyond `file`'s type sniff (i.e., did not check whether any
  upload is a screenshot that visually shows a credential — out of scope for a text-credential sweep,
  and the tool cannot return binary content as text anyway).

## Can the denylist model hold?

Conditionally yes, with one caveat stated plainly: a denylist is inherently a list of shapes someone
already thought of, and `layout.ts`'s own header already says this out loud for the `.db` case
("the protection moved from 'never a root' to 'denied by pattern,' which is a strictly weaker
guarantee — a pattern can miss a shape nobody anticipated, a missing root cannot"). This sweep did
not find a live miss today, but that is a snapshot, not a guarantee: the very first gap (`.mcp.json`)
was found by accident after the roots widened, not by a systematic check like this one. The binary
sniff is doing real, load-bearing work here — it is why raw key material embedded in an image or a
`.db` file can't leak as text even before a filename pattern exists for it — but it does nothing for
text-shaped secrets (PEM, JSON, YAML, `.env`-style), which is exactly where every pattern in this
list lives. My honest recommendation: keep the denylist, but treat this sweep as something to
re-run (or better, automate as a CI check diffing `git status --ignored` against
`FS_FILES_DENYLIST`) on every future root-widening, not a one-time clearance.
