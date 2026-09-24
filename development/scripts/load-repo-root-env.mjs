/**
 * @file Shared `.env` loader for the two Tovu dev entry points that need it: `development/scripts/dev.mjs`
 * (`npm run dev`) and `development/scripts/dev-desktop.mjs` (`npm run desktop`). See either script's own
 * header comment for why loading `.env` matters — a missing secret like `TOVU_INTEGRATIONS_ROOT_KEY`
 * otherwise surfaces far downstream as a silently-skipped feature (a stored OAuth MCP server that fails
 * to decrypt, or a `503 SECRET_STORE_UNCONFIGURED`) rather than as unset config at boot.
 *
 * Split into its own file rather than one script exporting it to the other: both `dev.mjs` and
 * `dev-desktop.mjs` run real top-level side effects on import (port preflight setup, console logging),
 * so importing one from the other would also run those, including the OTHER script's own
 * "loaded .env" log line. A dependency-free leaf module has none of that — only this function.
 */
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Loads `.env` from `repoRoot`, if one exists, before anything reads `process.env`.
 *
 * `process.loadEnvFile` is Node's own (v20.12+, no dependency). Verified empirically (Node v24.2.0):
 * it does NOT override a variable already present in `process.env` — a value exported in the calling
 * shell wins, and the file only fills in whatever the shell left unset. `.env` is a floor, not an
 * override, so a developer's own shell exports are never silently replaced by stale file contents.
 *
 * Called from each dev entry point directly (never from `apps/website/src/index.ts`) on purpose: this
 * is the developer-machine boot path, and a `.env` that silently fed into a PRODUCTION boot would be a
 * different and much worse thing. Deployments set real env vars, never a `.env` file, so they are
 * unaffected either way.
 *
 * `npm start` DOES import this file now (`development/scripts/start.mjs`,
 * npm-start-just-works-plan-2026-09-24) — the gap that comment used to describe was the actual
 * defect this plan fixes: an owner's `TOVU_INTEGRATIONS_ROOT_KEY` in `.env` never reached a plain
 * `npm start` boot. `start.mjs` is still not `apps/website/src/index.ts` itself, and still not the
 * Dockerfile's own boot path (`CMD ["node","dist/src/index.js"]`, which never runs `start.mjs`) — so
 * a container or `tovu serve`-packaged boot is exactly as unaffected as before.
 *
 * `existsSync`/`loadEnvFile` are injectable so a test can assert on the exists/load branch without
 * touching the real repo `.env`, or point this at a fixture file in a temp dir for an end-to-end check.
 *
 * @param {string} repoRoot - directory to look for `.env` in (the repo root for both current callers).
 * @param {{existsSync?: (path: string) => boolean, loadEnvFile?: (path: string) => void}} [deps]
 * @returns {boolean} true if a `.env` file was found (and loaded); false if none exists.
 * @complexity O(1) — one stat, one file read delegated to `process.loadEnvFile`.
 */
export function loadRepoRootEnvFile(repoRoot, deps = {}) {
  const checkExists = deps.existsSync ?? existsSync;
  const doLoad = deps.loadEnvFile ?? process.loadEnvFile.bind(process);
  const envFile = path.join(repoRoot, ".env");
  if (!checkExists(envFile)) return false;
  doLoad(envFile);
  return true;
}
