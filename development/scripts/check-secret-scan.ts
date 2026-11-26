import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveOnPath } from "@jini-ai/agent-runtime";
import { pathToFileURL } from "node:url";
import { PEM_PATTERN_NAME } from "@jini-ai/diagnostics/redaction/secrets-only";
import { createRepoSecretCheck } from "@jini-ai/diagnostics/redaction/repo-secret-scan.node";

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
 * Usage: npx tsx development/scripts/check-secret-scan.ts
 * Exit codes: 0 = no un-allowlisted credential-shaped string found in any tracked file. 1 = at
 *             least one was found.
 *
 * The credential-shape vocabulary shared by `features/webhooks/secret-scan-guard.ts` (the
 * repo-wide static check) and `contracts/core/secret-redaction.ts` (the runtime tool-failure
 * redactor, 2026-09-16).
 *
 * Originally moved out of `secret-scan-guard.ts` rather than imported from it, because that file
 * runs `import.meta.dirname` and `pathToFileURL(process.argv[1])` at module top level (its own
 * `main()` guard) — importing a CLI check into the daemon/API runtime risks a boot crash wherever
 * `process.argv[1]` is not the check script itself. `contracts/core` must also not depend on
 * `features/`; the shared, dependency-free catalog now lives in Jini core `redact.ts`. The
 * guard re-imports and re-exports them, so its own scan behavior (and `npm run check:secret-scan`)
 * is unchanged.
 *
 * Character classes intentionally match each vendor's real alphabet — see `secret-scan-guard.ts`'s
 * own file header for why every exact-length pattern is lookaround-anchored rather than a bare
 * `{n}`, and why a fixed-length format like Google's needs the exact-length trap guarded against.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

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

// Built at runtime, matching __tests__/secret-scan-guard.test.ts's own PEM fixture technique: the
// literal PEM header text, written whole, is itself a tracked credential-shaped string that this
// file's own repo-wide scan would flag, so the two ALLOWLIST entries below reference this instead
// of writing that text out directly.
const PEM_HEADER_VALUE = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");

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

function gitCommand(_required: Record<string, never>, _options: Record<string, never> = {}): string {
  const command = resolveOnPath({ bin: "git" });
  if (!command) throw new Error("git executable is unavailable");
  return command;
}

const checkOptions = {
  runner: (args: Parameters<Parameters<typeof createRepoSecretCheck>[0]["runner"]>[0], options: Parameters<Parameters<typeof createRepoSecretCheck>[0]["runner"]>[1]) => execFileSync(gitCommand({}), [...args], options),
  fs, skipExtensions: SKIP_EXTENSIONS, maxScanBytes: MAX_SCAN_BYTES, exemptions: ALLOWLIST,
  stdout: (text: string) => console.log(text), stderr: (text: string) => console.error(text),
  copy: {
    clean: "check:secret-scan — OK: no credential-shaped string found in any tracked file or git history.",
    tip: (count: number) => `check:secret-scan — ${count} credential-shaped string(s) found in tracked files:`,
    history: (count: number) => `check:secret-scan — ${count} credential-shaped string(s) found in git history ` + "(not necessarily present in the current tree):",
    guidance: "\nA credential-shaped string was found. If it is real: revoke/rotate it immediately. If it was " +
      "found only in git history and is already dead (revoked/rotated), or is a fixture that " +
      "legitimately needs this shape, add a (file, pattern, exact-value)-scoped ALLOWLIST entry in " +
      "secret-scan-guard.ts with a reason, or — preferably — shorten/mutate the fixture so it no " +
      "longer matches a real credential's exact length. A history rewrite to purge a real committed " +
      "secret is a separate, human-approved step — this check cannot and does not do that.",
  },
};

export const { isAllowlisted, run } = createRepoSecretCheck({ ...checkOptions, repoRoot: REPO_ROOT });
export const scanRepoForSecrets = (options?: { readonly repoRoot?: string }) => createRepoSecretCheck({ ...checkOptions, repoRoot: options?.repoRoot ?? REPO_ROOT }).scanTip();
export const scanGitHistoryForSecrets = (options?: { readonly repoRoot?: string }) => createRepoSecretCheck({ ...checkOptions, repoRoot: options?.repoRoot ?? REPO_ROOT }).scanHistory();

// Guarded, matching `seal-aad-invariant.ts`/`check-theme-replaced-elements.ts`: this file's
// exported functions are imported directly by `__tests__/secret-scan-guard.test.ts`, and an
// unguarded `main()` would scan the real repo (and `process.exit(1)` if it ever regresses) as a
// side effect of that import.
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  process.exitCode = run({});
}
