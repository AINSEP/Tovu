import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * @file Dev-only TLS gate for the API's own listener (`index.ts`), mirroring
 * `apps/admin/vite.config.ts`'s existing `existsSync`-gated `httpsOptions` so both dev servers
 * agree on ONE scheme instead of the admin SPA being HTTPS-only while the API stayed plain HTTP —
 * the exact split the owner hit directly and called "horribly confusing".
 *
 * Same contract as the admin gate: cert files present -> HTTPS; absent -> plain HTTP, so a fresh
 * clone with no certs still boots (`npm run dev` must never refuse to start over missing TLS
 * material). `TOVU_DISABLE_DEV_TLS` is the one addition beyond that mirror: an explicit opt-out for
 * a caller that spawns this file directly on a machine that already has certs (every hermetic
 * Playwright `webServer` under `development/*.config.ts` does exactly this, hardcoding
 * `http://localhost:<port>` for its own readiness probe and `baseURL`) and must not have its scheme
 * silently flipped just because the OPERATOR happens to have run `mkcert` for their own interactive
 * `npm run dev` session. Without this flag, enabling TLS here would have doubled an already-live
 * bug: `apps/admin/vite.config.ts`'s identical gate already flips ~35 Playwright configs' spawned
 * admin Vite instances to HTTPS whenever `.certs` exists, independent of this change (see handoff
 * report for the full finding) — this module deliberately does not compound that on the API side.
 *
 * Certs live at the repo root (`.certs/`), not `apps/admin/.certs/` — moved so one directory serves
 * both dev servers instead of the API reaching across into `apps/admin`'s own folder. The enable/
 * disable toggle is still a single directory rename, just at the new location:
 * `mv .certs .certs.disabled` (from the repo root) to turn TLS off, `mv .certs.disabled .certs` to
 * turn it back on.
 */

/** Absolute paths to the mkcert-issued cert/key pair, resolved from the repo root. Pure — no I/O. */
export interface DevTlsCertPaths {
  certPath: string;
  keyPath: string;
}

/** The PEM material `node:https`'s `createServer` needs. */
export interface DevTlsCredentials {
  cert: Buffer;
  key: Buffer;
}

export interface DevTlsResolution {
  /** Whether the API should terminate TLS itself for this boot. */
  active: boolean;
  /** Present only when `active` is true. */
  credentials?: DevTlsCredentials;
}

/** Injectable seam for `resolveDevTls`, so its gate logic is testable without touching the real
 *  filesystem or process env. */
export interface DevTlsDeps {
  existsSync?: (path: string) => boolean;
  readFileSync?: (path: string) => Buffer;
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolves the repo-root `.certs/` cert and key paths mkcert writes into — the same pair
 * `apps/admin/vite.config.ts`'s gate reads, so the admin SPA and the API always agree on whether
 * TLS material exists.
 *
 * @param repoRoot - absolute path to the repository root.
 * @complexity O(1).
 */
export function resolveDevTlsCertPaths(repoRoot: string): DevTlsCertPaths {
  return {
    certPath: path.resolve(repoRoot, ".certs/localhost.pem"),
    keyPath: path.resolve(repoRoot, ".certs/localhost-key.pem"),
  };
}

/**
 * Parses `TOVU_DISABLE_DEV_TLS` the same way `site-switcher-enabled.ts`'s `TOVU_ENABLE_SITE_SWITCHER`
 * gate parses its own var (trim + lowercase, `"1"`/`"true"` only) rather than a bare truthy check on
 * the raw string — a bare truthy check treats ANY non-empty value, including the literal string
 * `"false"` or `"0"`, as "disable", which silently inverts an operator who explicitly set
 * `TOVU_DISABLE_DEV_TLS=false` meaning "do not disable TLS" (2026-09-05 audit finding, CONFIRMED
 * against this exact check). Polarity is inverted from that sibling gate on purpose: this is a
 * DISABLE flag, so a true result here gates the "turn TLS off" branch, not the "turn it on" one.
 *
 * Hoisted out of {@link resolveDevTls} (rather than inlined) purely to keep the `?.`/`||` this parse
 * needs off that function's own complexity count — the same hoist-for-complexity shape
 * `deps.ts`'s `assertOverridesPairedOrAbsent` already uses.
 */
function isDevTlsExplicitlyDisabled(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/**
 * Decides whether this boot should terminate TLS itself, and loads the credentials when it should.
 *
 * Fails open to plain HTTP — never mandatory. Three ways HTTP wins: `TOVU_DISABLE_DEV_TLS` is set
 * (the Playwright/E2E escape hatch above), the cert file is missing, or the key file is missing. A
 * fresh clone with no certs therefore boots exactly as it did before this module existed.
 *
 * @param input - the cert/key paths to check, from {@link resolveDevTlsCertPaths}.
 * @param deps - optional filesystem/env overrides for testing; defaults to the real ones.
 * @complexity O(1) time; O(n) space in the loaded PEM file sizes (a few KB).
 */
export function resolveDevTls(input: DevTlsCertPaths, deps: DevTlsDeps = {}): DevTlsResolution {
  const checkExists = deps.existsSync ?? existsSync;
  const readFile = deps.readFileSync ?? readFileSync;
  const env = deps.env ?? process.env;

  if (isDevTlsExplicitlyDisabled(env.TOVU_DISABLE_DEV_TLS)) return { active: false };
  if (!checkExists(input.certPath) || !checkExists(input.keyPath)) return { active: false };

  return {
    active: true,
    credentials: { cert: readFile(input.certPath), key: readFile(input.keyPath) },
  };
}

/**
 * Pure scheme derivation for every URL this boot prints or reports — the one thing
 * `development/scripts/dev.mjs` got wrong before this change (hardcoded `http://` regardless of
 * whether TLS was actually active).
 *
 * @complexity O(1).
 */
export function deriveDevScheme(tlsActive: boolean): "https" | "http" {
  return tlsActive ? "https" : "http";
}
