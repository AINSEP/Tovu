import { randomBytes } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { fingerprintRootKeyHex, parseRootKeyHex, type RootKeyRejection } from "./keyring.env.js";
import {
  findKeyDependentData,
  readSiteKeySourceMaterial,
  readSiteMetaJson,
  resolveSiteKeyFingerprint,
  resolveSiteKeyId,
  siteKeySources,
  type SiteKeySource,
} from "./site-key-sources.js";
import { resolveRuntimeMode, type RuntimeMode } from "#src/contracts/core/runtime-mode";
import { writeJsonFileAtomic } from "#src/platform/site-dir/atomic-write";
import { CONTENT_DB_FILENAME } from "#src/platform/site-dir/layout";

/**
 * @file Site-key plan (`ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md`) §A.2 — the ONE
 * writer for a site's key file. The CLI's old `tovu root-key ensure` command
 * (`cli/commands/root-key.ts`) was absorbed into {@link ensureSiteKeyForBoot} and deleted outright
 * (Stage A3b, `abc4807d5`) — `planRootKeyEnsure`/`RootKeyEnsurePlan` (that command's own pure
 * decision table) went with it as dead code (site-key plan §A.6: zero callers once the CLI command
 * was gone). `findKeyDependentData` (the content.db scan both that command and this module's own
 * `ensureSiteKey` use) moved OUT to `site-key-sources.ts` in the same pass — the admin Site Token
 * route's `"missing-with-data"` state needs the identical scan and cannot import this module (see
 * that function's own doc for why); it is a pure reader, so the shared reader layer is its correct
 * home, not this one.
 *
 * Purpose:
 * `ensureSiteKey` runs once per server boot, local mode only (A.2): a per-site file already there
 * and valid is a no-op; missing with an env/legacy-file key already in effect ADOPTS that exact
 * material into the per-site file (never re-keys, never orphans); missing with nothing anywhere
 * and no key-dependent data yet MINTS a fresh one; missing with key-dependent data already sealed
 * REFUSES rather than silently starting a new key nothing can decrypt with. Production is always a
 * no-op — it never had a per-site file to begin with (A.1's "why per-site rather than one key per
 * OS user"; A.3's "production never mints").
 *
 * The write itself is race-safe with no single-instance lock (A.2's "atomic write, safe with many
 * instances running at once"): a temp file is written and fsynced, then linked onto the final
 * path — `link(2)` refuses `EEXIST` atomically, so at most one process's bytes ever become the
 * file. Both the winner and every loser then read the FINAL file back rather than trusting their
 * own in-memory candidate, so two instances racing (one adopting, one minting) always converge on
 * the same key — see {@link atomicCreateSiteKeyFile}.
 *
 * Architectural role:
 * `features/webhooks` domain writer. Depends on `keyring.env.ts` (shared hex validator and
 * fingerprint) and `site-key-sources.ts` (candidate ordering) — never the reverse: both keyrings
 * stay readers (`allowFileAutoGenerate: false`), and this module is the only place `randomBytes`
 * feeds a site key file. Nothing under `server/inbound/**` may import this module (site-key plan
 * §A.3: "no request path can reach it") — Stage A3a's own wiring test enforces that; this file
 * does not import anything from `server/inbound` in either direction.
 */

// ---------------------------------------------------------------------------
// ensureSiteKey — the per-site decision table and its one writer.
// ---------------------------------------------------------------------------

/** {@link planSiteKeyEnsure}'s own pure decision-table outcomes only. `"mismatch"` (site-key plan
 *  §A.4) is deliberately NOT one of them — no input to that pure function can ever produce it; it is
 *  a POST-hoc outcome {@link withFingerprintReconciliation} derives afterward, from `.site-meta.json`'s
 *  own stamped fingerprint, which `planSiteKeyEnsure` never sees. Keeping it out of this narrower type
 *  (rather than folding it into {@link SiteKeyEnsureAction} and switching on that everywhere) is what
 *  lets `ensureSiteKey`'s own `switch (plan.action)` stay genuinely exhaustive over the 6 real planned
 *  outcomes, instead of carrying a dead `"mismatch"` case no plan input could ever reach. */
export type SiteKeyEnsurePlanAction = "noop" | "adopt" | "mint" | "refuse" | "invalid" | "production-noop";

export interface SiteKeyEnsurePlan {
  readonly action: SiteKeyEnsurePlanAction;
}

/** {@link EnsureSiteKeyResult.action}'s full range: every {@link SiteKeyEnsurePlanAction} the pure
 *  decision table can produce, plus `"mismatch"` — see {@link SiteKeyEnsurePlanAction}'s own doc for
 *  why that one extra value lives at this (I/O result) level and not the plan level. */
export type SiteKeyEnsureAction = SiteKeyEnsurePlanAction | "mismatch";

/** One material check's outcome — never carries a "why" beyond what {@link planSiteKeyEnsure}
 *  needs to decide; the payload (`hex`/`reason`) a caller needs afterward stays in the caller's
 *  own variable, this type is not threaded back out of the pure decision. */
export type SiteKeyMaterialCheck = { readonly kind: "absent" } | { readonly kind: "valid" } | { readonly kind: "invalid" };

export interface PlanSiteKeyEnsureInput {
  readonly mode: RuntimeMode;
  /** This site's own `~/.tovu/site-keys/<id>.hex`. */
  readonly perSite: SiteKeyMaterialCheck;
  /** The first-present candidate among every OTHER source (env var, legacy shared file) — i.e.
   *  `siteKeySources` with `perSite` excluded. */
  readonly other: SiteKeyMaterialCheck;
  /** Irrelevant unless both `perSite` and `other` are `"absent"` — a caller may pass `false`
   *  unconditionally otherwise, the same convention the now-deleted CLI decision table
   *  (`planRootKeyEnsure`, site-key plan §A.6) used for its own equivalent field. */
  readonly siteDbsWithKeyData: boolean;
}

/**
 * Pure decision table for `ensureSiteKey` (site-key plan §A.2). Order mirrors the plan's own
 * prose:
 *
 * 1. Production never touches a per-site file at all — always `"production-noop"`, regardless of
 *    every other input (A.1: production keeps the env-var/legacy-volume mechanism unchanged).
 * 2. A valid per-site file is always a no-op — this function only ever fills a GAP, never
 *    re-validates or repairs an already-usable key.
 * 3. An INVALID per-site file is reported, never silently treated as absent and never overwritten.
 * 4. Per-site absent, and some other source resolves to valid material → adopt that exact material
 *    (§A.2: "this mirrors exactly what the server already uses, so nothing can become
 *    undecryptable").
 * 5. Per-site absent, and the one other source present is invalid → reported the same way #3 is;
 *    adopting broken material would just move the breakage.
 * 6. Nothing anywhere: existing key-dependent data blocks a fresh mint (would orphan it).
 * 7. Only once every other check passes does this mint a fresh key.
 *
 * @complexity O(1) — a fixed sequence of checks over already-computed inputs.
 */
export function planSiteKeyEnsure(input: PlanSiteKeyEnsureInput): SiteKeyEnsurePlan {
  if (input.mode === "production") return { action: "production-noop" };
  if (input.perSite.kind === "valid") return { action: "noop" };
  if (input.perSite.kind === "invalid") return { action: "invalid" };
  // perSite.kind === "absent" from here on.
  if (input.other.kind === "valid") return { action: "adopt" };
  if (input.other.kind === "invalid") return { action: "invalid" };
  // other.kind === "absent" too — nothing anywhere.
  if (input.siteDbsWithKeyData) return { action: "refuse" };
  return { action: "mint" };
}

export interface EnsureSiteKeyInput {
  /** This site's own directory — only its `content.db` is scanned for key-dependent data (A.2:
   *  "its dependency-data check scans only this site's content.db (per-site keys)"), never every
   *  sibling site the way the CLI's `tovu root-key ensure` did. */
  readonly siteDir: string;
  /** `.site-meta.json`'s `siteKeyId` (A.1/A.4). */
  readonly siteKeyId: string;
  /** Defaults to {@link resolveRuntimeMode}. Test-injected so a suite never depends on the real
   *  `TOVU_RUNTIME_MODE`. */
  readonly mode?: RuntimeMode;
  /** Defaults to `process.env`. Test-injected so a suite never touches real env vars. */
  readonly env?: NodeJS.ProcessEnv;
  /** Defaults to `homedir()`. Test-injected so a suite never touches the real `~/.tovu`. */
  readonly home?: string;
  /** Defaults to `process.cwd()`. Only reaches {@link siteKeySources}'s production branch, which
   *  `ensureSiteKey` never takes (production is always `"production-noop"`) — kept for symmetry
   *  with {@link siteKeySources}'s own input shape and so a future caller has a real seam if that
   *  ever changes. */
  readonly cwd?: string;
}

export interface EnsureSiteKeyResult {
  readonly action: SiteKeyEnsureAction;
  /** Absent for `"production-noop"` — production has no per-site file to name. */
  readonly perSiteFilePath?: string;
  /** Present for `"noop"`, `"adopt"`, `"mint"`, and `"mismatch"` — the fingerprint of the key
   *  ACTUALLY in the per-site file right now (site-key plan §A.2's fingerprint stamp reuses this
   *  same value). For `"mismatch"` this is the file's real fingerprint, never the stale value still
   *  sitting in `.site-meta.json` — see {@link reconcileSiteKeyFingerprint}. */
  readonly fingerprint?: string;
  /** Present for `"invalid"` — which {@link RootKeyRejection} the offending material failed. */
  readonly reason?: RootKeyRejection;
}

/**
 * The only writer of a site's key file (site-key plan §A.2). Safe to call on every boot: a valid
 * existing file is read, not rewritten, and the two write-producing outcomes (`"adopt"`, `"mint"`)
 * both go through {@link atomicCreateSiteKeyFile}'s race-safe create.
 *
 * @throws whatever the underlying `fs`/`better-sqlite3` calls throw for a path that exists but
 *   cannot be read (permissions, a torn file, a corrupt database) — this function never swallows
 *   those into a wrong decision.
 * @complexity O(1) fs/env reads plus {@link findKeyDependentData}'s cost, and only on the one
 *   branch (`perSite` and `other` both absent) that needs it.
 */
export function ensureSiteKey(input: EnsureSiteKeyInput): EnsureSiteKeyResult {
  const env = input.env ?? process.env;
  const mode = input.mode ?? resolveRuntimeMode({ env });

  if (mode === "production") {
    return { action: "production-noop" };
  }

  const home = input.home ?? homedir();
  const cwd = input.cwd ?? process.cwd();
  const sources = siteKeySources({ mode, env, home, cwd, siteKeyId: input.siteKeyId });
  const perSiteSource = sources.find((source): source is SiteKeySource & { path: string } => source.kind === "per-site-file");
  if (!perSiteSource) {
    // Invariant guard, not a real runtime branch: `siteKeyId` is always passed above, and
    // `siteKeySources` always includes a per-site candidate when one is given.
    throw new Error("ensureSiteKey: siteKeySources did not return a per-site-file candidate for a given siteKeyId");
  }
  const perSiteFilePath = perSiteSource.path;
  const otherSources = sources.filter((source) => source.kind !== "per-site-file");

  const perSiteRaw = readSiteKeySourceMaterial(perSiteSource, env);
  const perSiteParsed = perSiteRaw === undefined ? undefined : parseRootKeyHex(perSiteRaw);

  const otherRaw = findFirstPresentMaterial(otherSources, env);
  const otherParsed = otherRaw === undefined ? undefined : parseRootKeyHex(otherRaw);

  const contentDbPath = join(input.siteDir, CONTENT_DB_FILENAME);
  let hasKeyDataMemo: boolean | undefined;
  const siteHasKeyData = (): boolean => {
    hasKeyDataMemo ??= existsSync(contentDbPath) ? findKeyDependentData([contentDbPath]) : false;
    return hasKeyDataMemo;
  };
  const needsDataCheck = perSiteParsed === undefined && otherParsed === undefined;
  const siteDbsWithKeyData = needsDataCheck ? siteHasKeyData() : false;

  const plan = planSiteKeyEnsure({
    mode,
    perSite: materialCheckOf(perSiteParsed),
    other: materialCheckOf(otherParsed),
    siteDbsWithKeyData,
  });

  switch (plan.action) {
    case "noop": {
      if (!perSiteParsed?.ok) throw new Error("ensureSiteKey: 'noop' plan implies a valid per-site key");
      return withFingerprintReconciliation(input.siteDir, "noop", perSiteFilePath, fingerprintRootKeyHex(perSiteParsed.hex), () => false);
    }
    case "invalid": {
      const rejected = perSiteParsed?.ok === false ? perSiteParsed : otherParsed?.ok === false ? otherParsed : undefined;
      if (!rejected) throw new Error("ensureSiteKey: 'invalid' plan implies a rejected key");
      return { action: "invalid", perSiteFilePath, reason: rejected.reason };
    }
    case "adopt": {
      if (!otherParsed?.ok) throw new Error("ensureSiteKey: 'adopt' plan implies valid adoptable material");
      // The stamp is checked BEFORE the write: once a per-site file exists it outranks every other
      // source, so adopting a key the stamp already proves wrong would make it permanent and block
      // the right key from ever being adopted. With no key-dependent data the stamp protects
      // nothing, so adoption goes ahead and the stamp is updated.
      const candidateFingerprint = fingerprintRootKeyHex(otherParsed.hex);
      const stamped = resolveSiteKeyFingerprint({ siteDir: input.siteDir });
      if (stamped !== undefined && stamped !== candidateFingerprint && siteHasKeyData()) {
        return { action: "mismatch", perSiteFilePath, fingerprint: candidateFingerprint };
      }
      const written = atomicCreateSiteKeyFile(perSiteFilePath, otherParsed.hex);
      return withFingerprintReconciliation(input.siteDir, "adopt", perSiteFilePath, fingerprintRootKeyHex(written), () => !siteHasKeyData());
    }
    case "refuse":
      return { action: "refuse", perSiteFilePath };
    case "mint": {
      const generatedHex = randomBytes(32).toString("hex");
      const written = atomicCreateSiteKeyFile(perSiteFilePath, generatedHex);
      // `mint` is only planned when the site has no key-dependent data, so a stale stamp (a moved or
      // copied site folder) protects nothing — it is replaced rather than left as a permanent,
      // false "mismatch".
      return withFingerprintReconciliation(input.siteDir, "mint", perSiteFilePath, fingerprintRootKeyHex(written), () => !siteHasKeyData());
    }
    case "production-noop":
      // Unreachable here (the mode==="production" branch above already returned) — kept only so
      // this switch stays exhaustive against SiteKeyEnsureAction without a `default` escape hatch.
      return { action: "production-noop" };
  }
}

/**
 * Site-key plan §A.2's fingerprint stamp / §A.4: after `ensureSiteKey` settles on the key now
 * actually in the per-site file (`"noop"`, `"adopt"`, or `"mint"`), makes sure `.site-meta.json`
 * records that key's fingerprint — atomically, and preserving every other field in the file — so a
 * LATER substitution of the physical key file becomes visible before any decrypt ever fails on it
 * (§A.5's `"mismatch"` banner state).
 *
 * - No readable/parseable `.site-meta.json` at `siteDir` → nothing to stamp against; the caller's
 *   own key-material outcome is untouched. This keeps every pre-A4 `ensureSiteKey` caller (a raw
 *   temp `siteDir` with no meta file at all, e.g. this module's own unit-test fixtures) working
 *   exactly as before this stamp existed.
 * - Field absent → stamped now, merged into the EXISTING parsed object so no other field is lost or
 *   reset (never a fresh object built from scratch).
 * - Field present and equal → nothing written; the file already reflects reality.
 * - Field present and different, and `mayRestamp()` is false (the site has key-dependent data, or
 *   the caller is `"noop"`) → the stamp is evidence, not a cache: this call returns `"mismatch"`
 *   instead of the caller's own action and does not rewrite `.site-meta.json`.
 * - Field present and different, and `mayRestamp()` is true (`"mint"`/`"adopt"` on a site with no
 *   key-dependent data — nothing sealed under the stamped key can be orphaned) → re-stamped to the
 *   key now in the file, and the caller's own action is returned.
 *
 * @complexity O(1) — one bounded JSON read, at most one atomic JSON write.
 */
function withFingerprintReconciliation(
  siteDir: string,
  action: "noop" | "adopt" | "mint",
  perSiteFilePath: string,
  fingerprint: string,
  mayRestamp: () => boolean
): EnsureSiteKeyResult {
  // `readSiteMetaJson` (site-key-sources.ts) — the shared `.site-meta.json` parse both this
  // function and `site-key-sources.ts`'s own `resolveSiteKeyId`/`resolveSiteKeyFingerprint` build
  // on, so a corrupt-file/non-object verdict can never drift between the writer's own
  // reconciliation and the admin route's read-only state derivation.
  const meta = readSiteMetaJson(siteDir);
  if (meta === undefined) {
    return { action, perSiteFilePath, fingerprint };
  }
  const stamped = meta.siteKeyFingerprint;
  if (stamped === undefined) {
    writeJsonFileAtomic(join(siteDir, ".site-meta.json"), { ...meta, siteKeyFingerprint: fingerprint });
    return { action, perSiteFilePath, fingerprint };
  }
  if (stamped === fingerprint) {
    return { action, perSiteFilePath, fingerprint };
  }
  if (mayRestamp()) {
    writeJsonFileAtomic(join(siteDir, ".site-meta.json"), { ...meta, siteKeyFingerprint: fingerprint });
    return { action, perSiteFilePath, fingerprint };
  }
  return { action: "mismatch", perSiteFilePath, fingerprint };
}

export interface EnsureSiteKeyForBootInput {
  /** This site's own directory — same meaning as {@link EnsureSiteKeyInput.siteDir}. */
  readonly siteDir: string;
  readonly mode?: RuntimeMode;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly cwd?: string;
}

/**
 * Site-key plan §A3a's actual boot-path call site: `cli/commands/serve.ts` and `src/index.ts` call
 * this, not {@link ensureSiteKey} directly, so neither has to resolve `siteKeyId` itself. Resolves it
 * from `siteDir`'s own `.site-meta.json` via {@link resolveSiteKeyId} and, only when that succeeds,
 * calls through to {@link ensureSiteKey}.
 *
 * A `siteDir` with no readable `.site-meta.json` (or none present) returns `undefined` and touches
 * nothing — {@link ensureSiteKey} itself throws an invariant-guard error for an empty `siteKeyId`
 * (it assumes a caller only ever invokes it with a real one), so this guard exists precisely to keep
 * that assumption true at the one real call site that cannot itself guarantee a resolvable id. Every
 * real `tovu serve`/`index.ts` boot already validated `.site-meta.json`'s presence upstream
 * (`readSiteDir`), so this is a safety net for the genuinely unusual case (a corrupt or unrepaired
 * site), not the expected path — that site simply keeps its pre-site-key env/legacy-file-only
 * behavior, exactly as before this feature existed.
 *
 * @complexity O(1) fs read for `resolveSiteKeyId`, plus {@link ensureSiteKey}'s own cost when it runs.
 */
export function ensureSiteKeyForBoot(input: EnsureSiteKeyForBootInput): EnsureSiteKeyResult | undefined {
  const siteKeyId = resolveSiteKeyId({ siteDir: input.siteDir });
  if (!siteKeyId) return undefined;
  return ensureSiteKey({ siteDir: input.siteDir, siteKeyId, mode: input.mode, env: input.env, home: input.home, cwd: input.cwd });
}

/** {@link planSiteKeyEnsure}'s input shape from a raw {@link parseRootKeyHex} result (or
 *  `undefined` for "nothing there"). */
function materialCheckOf(parsed: ReturnType<typeof parseRootKeyHex> | undefined): SiteKeyMaterialCheck {
  if (parsed === undefined) return { kind: "absent" };
  return parsed.ok ? { kind: "valid" } : { kind: "invalid" };
}

/** The first source in `sources` that has ANY material — present-but-invalid still counts and
 *  stops the scan (site-key plan §A.2: adopting silently past a broken source would still be
 *  wrong, the same reasoning `keyring.env.ts`'s own env-then-file resolution already follows). */
function findFirstPresentMaterial(sources: readonly SiteKeySource[], env: NodeJS.ProcessEnv): string | undefined {
  for (const source of sources) {
    const raw = readSiteKeySourceMaterial(source, env);
    if (raw !== undefined) return raw;
  }
  return undefined;
}

/**
 * Writes `hex` to `filePath`, race-safe with no single-instance lock (site-key plan §A.2): write a
 * temp file in the same directory (`0600`, fsynced), then `linkSync` it onto `filePath` — `link(2)`
 * fails atomically with `EEXIST` if anything is already there, so at most one process's bytes ever
 * become the file. The loser's temp file is still removed; its `EEXIST` is swallowed, not
 * propagated. Both the winner and every loser then read `filePath` back and return THAT (never
 * their own `hex` argument), so two instances racing on the same `siteKeyId` always converge on
 * the one file that won, whichever process actually wrote it.
 *
 * @param filePath - the target `~/.tovu/site-keys/<id>.hex`. Its containing directory is created
 *   (`0700`) if missing.
 * @param hex - this call's own candidate key material, used only if no one else wins the race.
 * @returns the final file's content (trimmed) — always read from disk, never `hex` verbatim.
 * @throws whatever `fs` throws other than `EEXIST` from the `linkSync` step.
 * @complexity O(1) — a fixed number of syscalls, independent of `hex`'s length.
 */
function atomicCreateSiteKeyFile(filePath: string, hex: string): string {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = join(dir, `.${basename(filePath)}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  const fd = openSync(tmpPath, "w", 0o600);
  try {
    writeSync(fd, hex);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(tmpPath, 0o600);
  try {
    linkSync(tmpPath, filePath);
  } catch (err) {
    if (!isLinkTargetTakenError(err)) throw err;
    // Lost the race — another process's file is now canonical; fall through to read it back.
  } finally {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Already gone (e.g. a concurrent cleanup of the same temp name) — nothing left to remove.
    }
  }
  return readFileSync(filePath, "utf8").trim();
}

/** Whether a failed `linkSync` failed BECAUSE the target path was already taken, as opposed to a
 *  genuine I/O or permission fault that must keep propagating. */
function isLinkTargetTakenError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  return (err as { code?: unknown }).code === "EEXIST";
}
