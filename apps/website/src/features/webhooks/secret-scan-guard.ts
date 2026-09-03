import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * @file Repo-scanning static check (same shape as `seal-aad-invariant.ts` in this folder): fails
 * when a credential-shaped string is committed to a TRACKED file anywhere in this repo.
 *
 * ## Why this exists
 * On 2026-09-02 this repo was force-pushed to a public mirror and Google flagged a live Gemini API
 * key within minutes — a real `AIza…` credential, 39 characters, sitting as fixture plaintext in
 * `apps/website/src/features/webhooks/__tests__/secret-sealer.aesgcm.test.ts`. It was revoked and
 * the fixture fixed (see that file's history), but nothing in CI would have caught it before the
 * push. This check closes that gap going forward.
 *
 * ## Why length-anchored patterns, not name/filename heuristics
 * The leaked key sat in a file named like an ordinary AES-GCM sealer test — a filename or
 * "looks like a fixture" heuristic would not have caught it. The only reliable signal is the
 * credential's own SHAPE: a known vendor prefix plus its exact (or minimum) real length. This repo
 * already has nine other credential-shaped strings living in test/e2e fixtures on purpose — real
 * Anthropic keys are ~108 chars, every "sk-ant-" fixture hit here today is 28-32; real GitHub PATs
 * are 93 chars, the one fixture hit here is 32. Every pattern below is anchored to the real
 * credential's minimum (or exact) length for exactly this reason: a check loose enough to fire on
 * every fixture gets disabled within a day; a check anchored to the true length stays quiet on
 * fixtures and fires only on the real shape.
 *
 * ## The exact-length trap (why lookaround, not `{n}` alone)
 * Google's `AIza` + 35 format is fixed-length (39 total). A naive `/AIza[0-9A-Za-z_-]{35}/` still
 * matches the first 39 characters of any LONGER valid-charset run — e.g. a synthetic
 * `AIzaTest-Fake…` fixture in `development/e2e/byok-google-tool-schema.spec.ts` is 44 characters,
 * and an unanchored exact-count pattern matches its first 39 as a false positive (verified by hand
 * while building this check). Every exact-length pattern below is wrapped in
 * `(?<![charset])…(?![charset])` lookaround so it only matches a token of EXACTLY that length, not
 * a length-N prefix of something longer.
 *
 * ## Binary files
 * `git ls-files` includes binary files (e.g. `sites/tovu-com/content.seed.db`, a tracked SQLite
 * seed) that `git grep -I` silently skips. This check does NOT skip them: every tracked file's raw
 * bytes are decoded with `latin1` (a lossless 1:1 byte→char mapping — never throws, never
 * reinterprets multi-byte sequences) and scanned with the same regexes. Every pattern here is
 * ASCII-only, so an ASCII-shaped credential embedded anywhere in a binary blob is still found
 * byte-for-byte, without needing a separate `strings`-equivalent extraction pass. Large binary
 * media (images/fonts/video/audio) IS skipped, by extension (`SKIP_EXTENSIONS` below) —
 * credential-shaped ASCII text does not legitimately occur in those formats, and scanning
 * multi-megabyte video fixtures under `development/e2e/fixtures/video/` would slow this check for
 * zero security value. `.db`/`.sqlite` files are NOT in that skip list and ARE scanned.
 *
 * ## Allowlist
 * A small, (file + pattern + exact matched value)-scoped allowlist (`ALLOWLIST` below) covers
 * known, individually verified-safe fixtures that legitimately share a real credential's shape —
 * in practice this is only ever needed for Google's fixed-length format (the other nine known
 * fixtures are already excluded by length, no allowlist needed) plus pre-existing,
 * already-confirmed-inert PEM blobs. Scoping includes the exact matched VALUE, not just
 * (file, pattern name): a real credential later added to an allowlisted file under a DIFFERENT
 * pattern is still caught, and — the gap this used to have — so is a DIFFERENT real credential of
 * the SAME pattern later added to that same file, since its matched text won't equal the
 * allowlisted value.
 *
 * ## History scanning
 * `scanRepoForSecrets` only ever looked at the current tip — a credential committed and later
 * removed in a subsequent commit was still fully recoverable from `git log`/`git show`, yet the
 * check reported clean. `scanGitHistoryForSecrets` closes that gap: it walks every blob object
 * reachable from any local branch or tag (`git rev-list --objects --all`), deduped by blob SHA
 * (a content hash, so identical file content across commits/paths is scanned exactly once), and
 * applies the same patterns/skip-list/allowlist. `main()` runs both and fails if either finds an
 * un-allowlisted hit. This does NOT rewrite or remove anything from history — a real hit still
 * requires the separate, human-approved history-rewrite step the file's Usage note already calls
 * out for the tip case.
 *
 * Usage: npx tsx apps/website/src/features/webhooks/secret-scan-guard.ts
 * Exit codes: 0 = no un-allowlisted credential-shaped string found in any tracked file. 1 = at
 *             least one was found.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");

/** Binary media extensions that never legitimately carry credential-shaped ASCII text; skipped by
 *  extension to keep this check fast (see file header). Everything else — including `.db`/
 *  `.sqlite` — IS scanned via the latin1 byte-preserving decode. */
const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".icns", ".webp", ".avif",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".mp4", ".webm", ".mov", ".mp3", ".wav",
  ".pdf",
]);

/** Above this size, skip scanning (bounds worst-case runtime). No legitimate credential fixture
 *  needs a file this large — the largest tracked non-media file today is ~1.6MB. */
const MAX_SCAN_BYTES = 8 * 1024 * 1024;

export interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

// Named once and reused below (SECRET_PATTERNS + two ALLOWLIST entries) rather than repeated as a
// literal three times.
const PEM_PATTERN_NAME = "PEM private key block";

// Built at runtime, matching __tests__/secret-scan-guard.test.ts's own PEM fixture technique: the
// literal PEM header text, written whole, is itself a tracked credential-shaped string that this
// file's own repo-wide scan would flag, so the two ALLOWLIST entries below reference this instead
// of writing that text out directly.
const PEM_HEADER_VALUE = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");

// Character classes intentionally match each vendor's real alphabet; see file header for why every
// exact-length pattern is lookaround-anchored rather than a bare `{n}`.
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "Google API key (AIza)", pattern: /(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}(?![A-Za-z0-9_-])/ },
  { name: "Anthropic API key (sk-ant-)", pattern: /(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_-]{90,}/ },
  { name: "generic sk- secret key (OpenAI-shaped)", pattern: /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9]{40,}/ },
  { name: "GitHub personal access token (classic, ghp_)", pattern: /(?<!\w)ghp_\w{36}(?!\w)/ },
  { name: "GitHub OAuth token (gho_)", pattern: /(?<!\w)gho_\w{36}(?!\w)/ },
  { name: "GitHub fine-grained PAT", pattern: /(?<!\w)github_pat_\w{80,}/ },
  { name: "npm access token", pattern: /(?<!\w)npm_\w{36}(?!\w)/ },
  { name: "Slack token", pattern: /(?<![A-Za-z0-9-])xox[baprs]-[A-Za-z0-9-]{12,}/ },
  { name: "AWS access key ID", pattern: /(?<![0-9A-Z])AKIA[0-9A-Z]{16}(?![0-9A-Z])/ },
  { name: "Fastmail app password (fm2_)", pattern: /(?<![A-Za-z0-9+/=])fm2_[A-Za-z0-9+/=]{20,}/ },
  { name: PEM_PATTERN_NAME, pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

interface AllowlistEntry {
  /** Repo-root-relative path, forward slashes, matching how `git ls-files` reports it. */
  readonly file: string;
  readonly patternName: string;
  /** The exact matched substring this entry covers. Required — see file header's Allowlist
   *  section for why (file, patternName) alone is too broad. */
  readonly value: string;
  readonly reason: string;
}

// Every entry here was individually verified NOT to be a real credential (2026-09-02 security
// audit that shipped with this check) before being added. Scoped to (file, pattern, value) — see
// header.
const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    file: "development/e2e/byok-google-tool-schema.spec.ts",
    patternName: "Google API key (AIza)",
    value: "AIzaTest-FAKE-GEMINI-KEY-NOT-REAL-0000000000",
    reason:
      "Synthetic FAKE_GEMINI_KEY fixture (44 chars, self-identifying 'Test-Fake' body) exceeds the real 39-char AIza length — see file header's exact-length-trap note for why this needs an explicit allowlist entry despite the lookaround anchor being correct. (In practice this pattern's lookaround means this value never actually matches, since 44 valid-charset chars follow the AIza prefix; the entry is kept as documentation and a backstop.)",
  },
  {
    file: "apps/admin/.certs.disabled/localhost-key.pem",
    patternName: PEM_PATTERN_NAME,
    value: PEM_HEADER_VALUE,
    reason:
      "mkcert-issued localhost dev TLS private key. Confirmed inert 2026-09-02: apps/admin/vite.config.ts reads from .certs/, not .certs.disabled/, and no tracked source references the .certs.disabled path. Throwaway, regenerable via `mkcert localhost 127.0.0.1 ::1`, not a real secret.",
  },
  {
    file: "ADS-memory/reports/swarm-consensus/offloads/2026-08-12-deploy/sonnet5-round3.md",
    patternName: PEM_PATTERN_NAME,
    value: PEM_HEADER_VALUE,
    reason: "Design-report code sample explicitly labeled '(test fixture)' — not real key material.",
  },
];

export function isAllowlisted(file: string, patternName: string, value: string): boolean {
  return ALLOWLIST.some((e) => e.file === file && e.patternName === patternName && e.value === value);
}

function listTrackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT, encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

export interface SecretScanHit {
  readonly patternName: string;
  /** Character offset within the scanned text where the match starts. */
  readonly index: number;
  /** The exact matched substring — the allowlist is scoped to this, not just (file, patternName),
   *  so a NEW different secret matching the same pattern in an already-allowlisted file is still
   *  caught (see file header's Allowlist section). */
  readonly value: string;
}

/** Core scanner, unit-testable directly against synthetic text (no filesystem, no git).
 *  @complexity O(p*n), p = pattern count (fixed, small), n = text length. */
export function scanTextForSecrets(text: string): SecretScanHit[] {
  const hits: SecretScanHit[] = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      hits.push({ patternName: name, index: match.index, value: match[0] });
      if (match[0].length === 0) re.lastIndex += 1; // guard against zero-length matches looping
    }
  }
  return hits;
}

export interface SecretScanViolation {
  /** Repo-root-relative path, forward slashes. */
  file: string;
  patternName: string;
  /** 1-based line number, or "binary" when the file's content is not text (a NUL byte was found in
   *  its first 8000 bytes — the same heuristic `git`/`grep -I` use to classify binaries). */
  line: number | "binary";
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Real-repo scan: every tracked file (per `git ls-files`), latin1-decoded so binary content is
 *  scanned byte-for-byte alongside text (see file header). */
export function scanRepoForSecrets(): SecretScanViolation[] {
  const violations: SecretScanViolation[] = [];
  for (const relFile of listTrackedFiles()) {
    const ext = path.extname(relFile).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) continue;

    const absFile = path.join(REPO_ROOT, relFile);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absFile);
    } catch {
      continue; // e.g. a tracked file removed locally but not yet staged as deleted
    }
    if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) continue;

    const buf = fs.readFileSync(absFile);
    const isBinary = buf.subarray(0, 8000).includes(0);
    const text = buf.toString("latin1");

    for (const hit of scanTextForSecrets(text)) {
      if (isAllowlisted(relFile, hit.patternName, hit.value)) continue;
      violations.push({
        file: relFile,
        patternName: hit.patternName,
        line: isBinary ? "binary" : lineNumberAt(text, hit.index),
      });
    }
  }
  return violations;
}

interface HistoricalBlob {
  readonly sha: string;
  /** Repo-root-relative path this blob was found under (its first-seen path — a blob can appear
   *  under multiple paths/commits; content, not path, is what's deduped on). */
  readonly path: string;
}

/** Every blob object reachable from any local branch or tag, deduped by blob SHA (a content hash,
 *  so identical file content is scanned exactly once regardless of how many commits or paths
 *  reference it). See file header's History scanning section. */
function listHistoricalBlobs(repoRoot: string): HistoricalBlob[] {
  const objectsOut = execFileSync("git", ["rev-list", "--objects", "--all"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  const pathBySha = new Map<string, string>();
  for (const line of objectsOut.split("\n")) {
    if (!line) continue;
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx === -1) continue; // commit objects are listed with no path suffix
    const sha = line.slice(0, spaceIdx);
    const relPath = line.slice(spaceIdx + 1);
    if (relPath && !pathBySha.has(sha)) pathBySha.set(sha, relPath);
  }
  if (pathBySha.size === 0) return [];

  // rev-list --objects also lists tree objects (with a path); filter to blobs only.
  const shas = [...pathBySha.keys()];
  const typeCheckOut = execFileSync("git", ["cat-file", "--batch-check=%(objectname) %(objecttype)"], {
    cwd: repoRoot,
    input: shas.join("\n") + "\n",
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  const blobs: HistoricalBlob[] = [];
  for (const line of typeCheckOut.split("\n")) {
    if (!line) continue;
    const [sha, type] = line.split(" ");
    if (type === "blob") blobs.push({ sha, path: pathBySha.get(sha)! });
  }
  return blobs;
}

/** Reads every listed blob's content in one `git cat-file --batch` pass, latin1-decoded (same
 *  binary-preserving technique `scanRepoForSecrets` uses; see file header). Keyed by blob SHA. */
function readBlobContents(repoRoot: string, shas: readonly string[]): Map<string, string> {
  const contents = new Map<string, string>();
  if (shas.length === 0) return contents;

  const out = execFileSync("git", ["cat-file", "--batch"], {
    cwd: repoRoot,
    input: shas.join("\n") + "\n",
    encoding: "latin1",
    maxBuffer: 512 * 1024 * 1024,
  });

  let offset = 0;
  while (offset < out.length) {
    const headerEnd = out.indexOf("\n", offset);
    if (headerEnd === -1) break;
    const parts = out.slice(offset, headerEnd).split(" ");
    if (parts.length < 3) break; // malformed/unexpected batch record; stop rather than misparse
    const [sha, , sizeStr] = parts;
    const size = Number(sizeStr);
    const contentStart = headerEnd + 1;
    contents.set(sha, out.slice(contentStart, contentStart + size));
    offset = contentStart + size + 1; // +1 for the trailing newline git appends after each record
  }
  return contents;
}

// A single NUL character, built via fromCharCode rather than an inline escape literal so this
// file's own source never embeds a raw control byte.
const NUL_CHAR = String.fromCharCode(0);

/** History scan: every blob ever committed to any local branch/tag, not just the current tip.
 *  Closes the gap where a secret committed then removed in a later commit is still fully
 *  recoverable from `git log`/`git show` while `scanRepoForSecrets` (tip-only) reports clean.
 *  `repoRoot` defaults to this repo but is overridable so tests can point it at a throwaway repo
 *  instead of mutating real history. */
export function scanGitHistoryForSecrets(options?: { readonly repoRoot?: string }): SecretScanViolation[] {
  const repoRoot = options?.repoRoot ?? REPO_ROOT;
  const violations: SecretScanViolation[] = [];

  const blobs = listHistoricalBlobs(repoRoot).filter(
    (b) => !SKIP_EXTENSIONS.has(path.extname(b.path).toLowerCase()),
  );
  const contents = readBlobContents(repoRoot, blobs.map((b) => b.sha));

  for (const { path: relPath, sha } of blobs) {
    const text = contents.get(sha);
    if (text === undefined || text.length > MAX_SCAN_BYTES) continue;

    const isBinary = text.slice(0, 8000).includes(NUL_CHAR);

    for (const hit of scanTextForSecrets(text)) {
      if (isAllowlisted(relPath, hit.patternName, hit.value)) continue;
      violations.push({
        file: relPath,
        patternName: hit.patternName,
        line: isBinary ? "binary" : lineNumberAt(text, hit.index),
      });
    }
  }
  return violations;
}

function main(): void {
  const tipViolations = scanRepoForSecrets();
  const historyViolations = scanGitHistoryForSecrets();

  if (tipViolations.length === 0 && historyViolations.length === 0) {
    console.log(
      "check:secret-scan — OK: no credential-shaped string found in any tracked file or git history.",
    );
    return;
  }

  if (tipViolations.length > 0) {
    console.error(`check:secret-scan — ${tipViolations.length} credential-shaped string(s) found in tracked files:`);
    for (const v of tipViolations) {
      console.error(`  - ${v.file}:${v.line} [${v.patternName}]`);
    }
  }
  if (historyViolations.length > 0) {
    console.error(
      `check:secret-scan — ${historyViolations.length} credential-shaped string(s) found in git history ` +
        "(not necessarily present in the current tree):",
    );
    for (const v of historyViolations) {
      console.error(`  - ${v.file}:${v.line} [${v.patternName}]`);
    }
  }
  console.error(
    "\nA credential-shaped string was found. If it is real: revoke/rotate it immediately. If it was " +
      "found only in git history and is already dead (revoked/rotated), or is a fixture that " +
      "legitimately needs this shape, add a (file, pattern, exact-value)-scoped ALLOWLIST entry in " +
      "secret-scan-guard.ts with a reason, or — preferably — shorten/mutate the fixture so it no " +
      "longer matches a real credential's exact length. A history rewrite to purge a real committed " +
      "secret is a separate, human-approved step — this check cannot and does not do that.",
  );
  process.exit(1);
}

// Guarded, matching `seal-aad-invariant.ts`/`check-theme-replaced-elements.ts`: this file's
// exported functions are imported directly by `__tests__/secret-scan-guard.test.ts`, and an
// unguarded `main()` would scan the real repo (and `process.exit(1)` if it ever regresses) as a
// side effect of that import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
