/**
 * @file The credential-shape vocabulary shared by `features/webhooks/secret-scan-guard.ts` (the
 * repo-wide static check) and `contracts/core/secret-redaction.ts` (the runtime tool-failure
 * redactor, 2026-09-16).
 *
 * Moved here verbatim out of `secret-scan-guard.ts` rather than imported from it, because that file
 * runs `import.meta.dirname` and `pathToFileURL(process.argv[1])` at module top level (its own
 * `main()` guard) — importing a CLI check into the daemon/API runtime risks a boot crash wherever
 * `process.argv[1]` is not the check script itself. `contracts/core` must also not depend on
 * `features/`, so this file is the shared, dependency-free home for the patterns themselves; the
 * guard re-imports and re-exports them, so its own scan behavior (and `npm run check:secret-scan`)
 * is unchanged.
 *
 * Character classes intentionally match each vendor's real alphabet — see `secret-scan-guard.ts`'s
 * own file header for why every exact-length pattern is lookaround-anchored rather than a bare
 * `{n}`, and why a fixed-length format like Google's needs the exact-length trap guarded against.
 */

export interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

// Named once and reused (by SECRET_PATTERNS here and by the guard's ALLOWLIST) rather than repeated
// as a literal in multiple places.
export const PEM_PATTERN_NAME = "PEM private key block";

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
