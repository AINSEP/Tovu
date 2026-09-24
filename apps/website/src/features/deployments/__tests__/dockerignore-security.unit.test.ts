import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * @file Proves the build-context ignore files actually keep secrets and live developer databases
 * out of the image `Dockerfile`'s `COPY . .` (build stage) would otherwise ship — same repo-root
 * file-reading discipline as `dockerfile.unit.test.ts`/`deploy-config.unit.test.ts` (pins the
 * REAL files, not a fixture copy).
 *
 * Two ignore files matter, for two different builders:
 *   - `Dockerfile.dockerignore` — BuildKit's per-Dockerfile convention. This is the one that
 *     actually governs every real build: `docker/build-push-action` (`publish-image.yml`) and any
 *     `docker build` on Docker 23+ (BuildKit is the default builder there, per this Dockerfile's
 *     own header comment) both read it, and it takes FULL precedence over a root `.dockerignore`
 *     when both exist.
 *   - `.dockerignore` (repo root) — matters only as a backstop for a LEGACY, non-BuildKit
 *     `docker build` (`DOCKER_BUILDKIT=0`, or a pre-23 Docker), which has no notion of the
 *     per-Dockerfile convention at all and falls back to this file alone.
 *
 * Both are exercised through a small dockerignore-pattern matcher (gitignore-style: bare names
 * match at any depth, a `/` in the pattern anchors it to the context root, `!` negates, last match
 * wins) rather than grepping the file text for a line — a substring match would pass even if the
 * pattern were spelled in a way that doesn't actually match the real path (e.g. missing the
 * leading `sites/` a `content.db` fixture needs), which is exactly the kind of green-but-wrong test
 * this repo's own coverage discipline calls out.
 *
 * Every "must be ignored" case here is a REAL file this checkout had on disk when this test was
 * written (2026-09-24): a root-level `chat.db`/`content.db` from local dev, and — the actual gap
 * this test found — `apps/website/sites/tovu-com/content.db` (+ WAL/shm), a stray duplicate site
 * directory neither ignore file's "sites, wildcard site name, content.db"-shaped patterns reach
 * because it isn't under the repo-root `sites/` tree the rest of that block itemizes. None of that
 * duplicates real user
 * data by accident — it's what running the dev servers from an unusual cwd leaves behind — but
 * `COPY . .` doesn't know that, and the Dockerfile's own `RUN rm -rf sites` cleanup only touches
 * the repo-root `sites/`, not this one.
 */

const REPO_ROOT = process.cwd();

interface IgnorePattern {
  negate: boolean;
  regex: RegExp;
}

function parseDockerignore(path: string): IgnorePattern[] {
  const raw = readFileSync(path, "utf8");
  const patterns: IgnorePattern[] = [];
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    const patternText = (negate ? line.slice(1) : line).trim();
    if (patternText === "") continue;
    patterns.push({ negate, regex: patternToRegex(patternText) });
  }
  return patterns;
}

function patternToRegex(pattern: string): RegExp {
  const anchoredByLeadingSlash = pattern.startsWith("/");
  let body = pattern.replace(/^\//, "").replace(/\/$/, "");
  const anchored = anchoredByLeadingSlash || body.includes("/");

  let escaped = body.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  escaped = escaped.replace(/\*\*/g, "\u0000DOUBLESTAR\u0000");
  escaped = escaped.replace(/\*/g, "[^/]*");
  escaped = escaped.replace(/\u0000DOUBLESTAR\u0000/g, ".*");

  const prefix = anchored ? "^" : "(^|.*/)";
  // Matches the pattern itself, or anything nested under it (directory-style exclusion).
  return new RegExp(`${prefix}${escaped}($|/.*$)`);
}

function isIgnored(patterns: IgnorePattern[], targetPath: string): boolean {
  let ignored = false;
  for (const { negate, regex } of patterns) {
    if (regex.test(targetPath)) ignored = !negate;
  }
  return ignored;
}

// Paths that must NEVER reach a built image: secrets, or a developer's live/growing database.
const MUST_BE_IGNORED = [
  ".env",
  ".env.local",
  ".env.bak-before-forbid-bash",
  ".certs/localhost-key.pem",
  ".certs.disabled/localhost.pem",
  "apps/admin/.certs.disabled/localhost-key.pem",
  "some/nested/path/server.pem",
  "some/nested/path/server.key",
  "chat.db",
  "chat.db-wal",
  "content.db",
  "content.db-wal",
  "sites/tovu-com/content.db",
  "sites/tovu-com/content.db-wal",
  "sites/tovu-com/content.db-shm",
  "apps/website/sites/tovu-com/content.db",
  "apps/website/sites/tovu-com/content.db-wal",
  "apps/website/sites/tovu-com/content.db-shm",
  ".claude/settings.local.json",
  "node_modules/some-pkg/index.js",
  ".git/config",
];

// Paths the build stage actually reads (Dockerfile: `npm install`, the two app builds, the sdk
// build, and the per-site `content.seed.db` loop) — these must survive both ignore files.
const MUST_NOT_BE_IGNORED = [
  "package.json",
  "package-lock.json",
  "apps/admin/package.json",
  "apps/site-chat/package.json",
  "packages/sdk/package.json",
  "apps/website/src/index.ts",
  "sites/tovu-com/content.seed.db",
  ".env.example",
];

for (const [label, relativePath] of [
  ["Dockerfile.dockerignore (BuildKit — the file that governs every real build)", "Dockerfile.dockerignore"],
  [".dockerignore (repo root — legacy non-BuildKit backstop)", ".dockerignore"],
] as const) {
  test(`${label}: exists`, () => {
    assert.ok(existsSync(join(REPO_ROOT, relativePath)), `${relativePath} must exist at the repo root`);
  });

  test(`${label}: excludes every secret/live-db path`, () => {
    const patterns = parseDockerignore(join(REPO_ROOT, relativePath));
    for (const target of MUST_BE_IGNORED) {
      assert.equal(isIgnored(patterns, target), true, `${relativePath} must exclude "${target}"`);
    }
  });

  test(`${label}: does not exclude anything the build actually needs`, () => {
    const patterns = parseDockerignore(join(REPO_ROOT, relativePath));
    for (const target of MUST_NOT_BE_IGNORED) {
      assert.equal(isIgnored(patterns, target), false, `${relativePath} must NOT exclude "${target}" — the build reads it`);
    }
  });
}
