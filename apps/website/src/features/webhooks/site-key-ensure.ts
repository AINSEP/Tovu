import { randomBytes, randomUUID } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { fingerprintSiteKeyHex, parseSiteKeyHex, type SiteKeyRejection } from "./keyring.env.js";
import {
  readSiteKeySourceMaterial,
  readSiteMetaJson,
  resolveSiteKeyFingerprint,
  resolveSiteKeyId,
  siteKeySources,
  type SiteKeySource,
} from "./site-key-sources.js";
import { resolveRuntimeMode, type RuntimeMode } from "#src/contracts/core/runtime-mode";
import { writeJsonFileAtomic } from "#src/platform/site-dir/atomic-write";
import { buildSiteMetaForNewKey } from "#src/platform/site-dir/key-only-site-meta";

/**
 * @file Site-key plan (`ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md`) §A.2 — the ONE
 * writer for a site's key file. The CLI's old `tovu site-key ensure` command
 * (`cli/commands/site-key.ts`) was absorbed into {@link ensureSiteKeyForBoot} and deleted outright
 * (Stage A3b, `abc4807d5`) — `planSiteKeyEnsure`/`SiteKeyEnsurePlan` (that command's own pure
 * decision table) went with it as dead code (site-key plan §A.6: zero callers once the CLI command
 * was gone). `findSiteKeyDependentData` (the per-site scan `ensureSiteKey` uses, on every storage
 * kind) lives in `platform/db/key-dependent-data.ts` on the storage kernel; the admin site key
 * route imports it there, and the boot callers inject it here ({@link KeyDependentDataScan}), so
 * this feature never value-imports `platform/db`.
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
 * §A.3) — Stage A3a's own wiring test enforces that; this file does not import anything from
 * `server/inbound` in either direction. The one request path that runs it, the admin site key
 * `generate` (2026-09-29), receives {@link ensureSiteKeyForSite} from the composition root, so a
 * request writes a key only by these same rules and never by a writer of its own.
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
  /** The candidate among every OTHER source (env var, legacy shared file) — i.e. `siteKeySources`
   *  with `perSite` excluded: the one holding the key `.site-meta.json` names when any does,
   *  otherwise the first present. */
  readonly other: SiteKeyMaterialCheck;
  /** Irrelevant unless both `perSite` and `other` are `"absent"` — a caller may pass `false`
   *  unconditionally otherwise, the same convention the now-deleted CLI decision table
   *  (`planSiteKeyEnsure`, site-key plan §A.6) used for its own equivalent field. */
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
  /** This site's own directory — only this site's store is scanned for key-dependent data (A.2:
   *  per-site keys), never every sibling site the way the CLI's `tovu site-key ensure` did. */
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
  /** The per-site scan ({@link KeyDependentDataScan}). */
  readonly findSiteKeyDependentData: KeyDependentDataScan;
}

/** `platform/db/key-dependent-data.ts`'s `findSiteKeyDependentData`: whether the site in `siteDir`
 *  holds data only the current key can open, on whichever storage it runs (SQLite, PGlite,
 *  Postgres, or a sealed `.storage-secret.json`), failing closed. Injected by the boot callers. */
export type KeyDependentDataScan = (siteDir: string) => Promise<boolean>;

export interface EnsureSiteKeyResult {
  readonly action: SiteKeyEnsureAction;
  /** Absent for `"production-noop"` — production has no per-site file to name. */
  readonly perSiteFilePath?: string;
  /** Present for `"noop"`, `"adopt"`, `"mint"`, and `"mismatch"` — the fingerprint of the key
   *  ACTUALLY in the per-site file right now (site-key plan §A.2's fingerprint stamp reuses this
   *  same value). For `"mismatch"` this is the file's real fingerprint, never the stale value still
   *  sitting in `.site-meta.json` — see {@link reconcileSiteKeyFingerprint}. */
  readonly fingerprint?: string;
  /** Present for `"invalid"` — which {@link SiteKeyRejection} the offending material failed. */
  readonly reason?: SiteKeyRejection;
}

/**
 * The only writer of a site's key file (site-key plan §A.2). Safe to call on every boot: a valid
 * existing file is read, not rewritten, and the two write-producing outcomes (`"adopt"`, `"mint"`)
 * both go through {@link atomicCreateSiteKeyFile}'s race-safe create. A per-site file the stamp does
 * not name is replaced only when another source holds the stamped key, and is moved aside as a
 * backup first ({@link moveSiteKeyFileAside}), never deleted.
 *
 * @throws whatever the underlying `fs` calls throw for a path that exists but cannot be read
 *   (permissions, a torn file) — this function never swallows those into a wrong decision. The
 *   injected scan fails closed on an unreadable database instead of throwing.
 * @complexity O(1) fs/env reads plus the injected scan's cost, and only on the branches that need it.
 */
export async function ensureSiteKey(input: EnsureSiteKeyInput): Promise<EnsureSiteKeyResult> {
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

  const perSiteRaw = readRawSiteKeyMaterial(perSiteSource, env);
  const perSiteParsed = perSiteRaw === undefined ? undefined : parseSiteKeyHex(perSiteRaw);

  // A source holding exactly the key `.site-meta.json` names is the right one to adopt wherever it
  // sits in the order; only without such a source does the first-present rule apply.
  const stampedFingerprint = resolveSiteKeyFingerprint({ siteDir: input.siteDir });
  const stampedOtherRaw = findStampedMaterial(otherSources, env, stampedFingerprint);

  // A per-site file the stamp does not name (a different key, or malformed) while another source
  // holds the stamped key: the per-site file would otherwise outrank the right key forever. It is
  // moved aside, never deleted, and the stamped key takes its place.
  if (perSiteRaw !== undefined && stampedOtherRaw !== undefined && !matchesFingerprint(perSiteParsed, stampedFingerprint)) {
    const stampedParsed = parseSiteKeyHex(stampedOtherRaw);
    if (!stampedParsed.ok) throw new Error("ensureSiteKey: stamped material implies a valid key");
    moveSiteKeyFileAside(perSiteFilePath, perSiteRaw);
    const written = atomicCreateSiteKeyFile(perSiteFilePath, stampedParsed.hex);
    return withFingerprintReconciliation(input.siteDir, "adopt", perSiteFilePath, fingerprintSiteKeyHex(written), async () => false);
  }

  const otherRaw = stampedOtherRaw ?? findFirstPresentMaterial(otherSources, env);
  const otherParsed = otherRaw === undefined ? undefined : parseSiteKeyHex(otherRaw);

  let hasKeyDataMemo: boolean | undefined;
  const siteHasKeyData = async (): Promise<boolean> => {
    hasKeyDataMemo ??= await input.findSiteKeyDependentData(input.siteDir);
    return hasKeyDataMemo;
  };
  const needsDataCheck = perSiteParsed === undefined && otherParsed === undefined;
  const siteDbsWithKeyData = needsDataCheck ? await siteHasKeyData() : false;

  const plan = planSiteKeyEnsure({
    mode,
    perSite: materialCheckOf(perSiteParsed),
    other: materialCheckOf(otherParsed),
    siteDbsWithKeyData,
  });

  switch (plan.action) {
    case "noop": {
      if (!perSiteParsed?.ok) throw new Error("ensureSiteKey: 'noop' plan implies a valid per-site key");
      return withFingerprintReconciliation(input.siteDir, "noop", perSiteFilePath, fingerprintSiteKeyHex(perSiteParsed.hex), async () => false);
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
      const candidateFingerprint = fingerprintSiteKeyHex(otherParsed.hex);
      if (stampedFingerprint !== undefined && stampedFingerprint !== candidateFingerprint && (await siteHasKeyData())) {
        return { action: "mismatch", perSiteFilePath, fingerprint: candidateFingerprint };
      }
      const written = atomicCreateSiteKeyFile(perSiteFilePath, otherParsed.hex);
      return withFingerprintReconciliation(input.siteDir, "adopt", perSiteFilePath, fingerprintSiteKeyHex(written), async () => !(await siteHasKeyData()));
    }
    case "refuse":
      return { action: "refuse", perSiteFilePath };
    case "mint": {
      const generatedHex = randomBytes(32).toString("hex");
      const written = atomicCreateSiteKeyFile(perSiteFilePath, generatedHex);
      // `mint` is only planned when the site has no key-dependent data, so a stale stamp (a moved or
      // copied site folder) protects nothing — it is replaced rather than left as a permanent,
      // false "mismatch".
      return withFingerprintReconciliation(input.siteDir, "mint", perSiteFilePath, fingerprintSiteKeyHex(written), async () => !(await siteHasKeyData()));
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
async function withFingerprintReconciliation(
  siteDir: string,
  action: "noop" | "adopt" | "mint",
  perSiteFilePath: string,
  fingerprint: string,
  mayRestamp: () => Promise<boolean>
): Promise<EnsureSiteKeyResult> {
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
  if (await mayRestamp()) {
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
  /** The per-site scan ({@link KeyDependentDataScan}). */
  readonly findSiteKeyDependentData: KeyDependentDataScan;
}

/**
 * Site-key plan §A3a's actual boot-path call site: `cli/commands/serve.ts` and `src/index.ts` call
 * this, not {@link ensureSiteKey} directly, so neither has to resolve `siteKeyId` itself. Resolves it
 * from `siteDir`'s own `.site-meta.json` via {@link resolveSiteKeyId} and, only when that succeeds,
 * calls through to {@link ensureSiteKey}.
 *
 * A `siteDir` with NO `.site-meta.json` at all is not a hypothetical: the default `sites/<name>/`
 * directory `index.ts` boots (`npm start`/`npm run dev`) is deliberately never given one — it is not
 * a `tovu init`/`tovu serve <dir>` install directory (`content-db-schema-guard.ts`'s own header).
 * Before this fix that meant exactly that site's key was silently never ensured — no error, no log
 * line, and every later admin request just quietly found no key. Local mode now closes that gap
 * itself: an ABSENT `.site-meta.json` gets a brand-new one ({@link
 * mintMinimalSiteMetaJson}) carrying a fresh `siteKeyId` — complete when the db already has
 * migrations to derive a schema stamp from, key-only otherwise ({@link mintSiteMetaForBootIfAbsent})
 * — then boot proceeds exactly as it would have for a site that already had one. Production never does this (A.1/A.3: production
 * never mints a site identity any more than it mints a key) — a `siteDir` with no meta file in
 * production keeps its pre-site-key env/legacy-file-only behavior, exactly as before this feature
 * existed. A `.site-meta.json` that EXISTS but cannot be parsed (corrupt, oversized, not an object)
 * is a different case — {@link resolveSiteKeyId} already treats that as "no per-site candidate", and
 * this function must never paper over a corrupt file by replacing it with a fresh one; only a
 * genuinely absent file is ever minted (see {@link mintMinimalSiteMetaJson}'s own exclusive-create
 * guard).
 *
 * The whole boot-time attempt — minting the meta file, and {@link ensureSiteKey}'s own key-file
 * write — is wrapped in one try/catch (2026-09-24 fix): a boot whose `~/.tovu` (or equivalent) cannot
 * be written must still start the server. `ensureSiteKey` itself deliberately keeps its own
 * never-swallow contract (its own `@throws` doc) for a caller that wants to fail loudly; this
 * function is the boot-path wrapper specifically, and a boot-time key failure is exactly the class
 * of thing `site-key-boot-notice.ts` exists to surface at the terminal, not crash the process over —
 * the admin status route already reports a missing key the same way it does for any other reason one
 * was never created.
 *
 * @throws never — every failure below (meta-mint or the underlying `ensureSiteKey` write) is caught,
 *   logged once, and reported as `undefined`, the same "nothing to give a caller" result as a siteDir
 *   with no resolvable `siteKeyId` at all.
 * @complexity O(1) fs read for `resolveSiteKeyId`, plus at most one more small fs write
 *   ({@link mintMinimalSiteMetaJson}), plus {@link ensureSiteKey}'s own cost when it runs.
 */
export async function ensureSiteKeyForBoot(input: EnsureSiteKeyForBootInput): Promise<EnsureSiteKeyResult | undefined> {
  try {
    return await ensureSiteKeyForSite(input);
  } catch (err) {
    // Boot must never go down over this — see this function's own header. `console.error` (not the
    // `warn`-level line `site-key-boot-notice.ts` prints moments later on the same terminal) so an
    // operator can tell "the key mechanism itself failed" apart from "no key happens to exist yet".
    console.error(`[site-key] could not ensure a site key at boot for ${input.siteDir}: ${(err as Error).message}`);
    return undefined;
  }
}

/**
 * {@link ensureSiteKeyForBoot} without its catch: resolves (or, in local mode, mints) this site's
 * `siteKeyId`, then runs {@link ensureSiteKey}. Also the admin site key route's `generate`, injected
 * by the composition root (`server/runtime/composition/app.ts`) so that route mints, adopts and
 * refuses by exactly the rules boot uses rather than a second writer of its own.
 *
 * @returns `undefined` when no `siteKeyId` resolves (production with no meta file, or a meta file
 *   that exists but is unreadable).
 * @throws whatever {@link ensureSiteKey} or the meta-file mint throws.
 * @complexity Same as {@link ensureSiteKeyForBoot}.
 */
export async function ensureSiteKeyForSite(input: EnsureSiteKeyForBootInput): Promise<EnsureSiteKeyResult | undefined> {
  const env = input.env ?? process.env;
  const mode = input.mode ?? resolveRuntimeMode({ env });
  const siteKeyId = resolveSiteKeyId({ siteDir: input.siteDir }) ?? (await mintSiteMetaForBootIfAbsent(input.siteDir, mode));
  if (!siteKeyId) return undefined;
  return ensureSiteKey({
    siteDir: input.siteDir,
    siteKeyId,
    mode,
    env,
    home: input.home,
    cwd: input.cwd,
    findSiteKeyDependentData: input.findSiteKeyDependentData,
  });
}

/** A fresh 32-byte site key as 64 hex characters — the key "Start fresh" installs when no working
 *  key is present. Lives here so this module stays the one place a site key is generated.
 *  @complexity O(1). */
export function mintSiteKeyHex(): string {
  return randomBytes(32).toString("hex");
}

export interface InstallSiteKeyInput {
  readonly siteDir: string;
  /** The key to install — a pasted old token already proven to open this site's data, or the key
   *  "Start fresh" keeps or mints. */
  readonly hex: string;
  readonly mode?: RuntimeMode;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly cwd?: string;
}

/** `installed`: the key file now holds `hex` and the stamp names it. `env-key-set`: an env var
 *  holding a DIFFERENT key outranks every file (production), so nothing was written. */
export type InstallSiteKeyResult =
  | { readonly outcome: "installed"; readonly keyFilePath: string; readonly fingerprint: string }
  | { readonly outcome: "env-key-set" };

/**
 * Makes `hex` this site's key — the site key tab's recovery writer (design §4.3/§4.6: "Unlock
 * with token", "Start fresh"). The caller has already decided `hex` is right; this only writes it.
 *
 * The target is the first key file in this site's source order (the per-site file locally, the
 * durable-volume file in production). An env var ahead of it that holds a different key would
 * outrank any file, so that is refused (`env-key-set`); one holding `hex` already is fine. A target
 * file holding a different key (or garbage) is moved aside as a backup, never deleted. Then
 * `.site-meta.json`'s `siteKeyFingerprint` is set to `hex`'s (other fields kept; a missing meta
 * file is minted locally, left alone in production).
 *
 * @returns `undefined` when no `siteKeyId` resolves in local mode (an unreadable meta file).
 * @throws {Error} `hex` is not a valid key (nothing written), or the file ends up holding another
 *   key (a concurrent writer won the race), or whatever `fs` throws.
 * @complexity O(n) in the (fixed-size) source list, plus a few small file reads/writes.
 */
export function installSiteKey(input: InstallSiteKeyInput): InstallSiteKeyResult | undefined {
  const parsed = parseSiteKeyHex(input.hex);
  if (!parsed.ok) throw new Error(`installSiteKey: not a valid site key (${parsed.reason})`);
  const env = input.env ?? process.env;
  const mode = input.mode ?? resolveRuntimeMode({ env });
  const siteKeyId = resolveSiteKeyId({ siteDir: input.siteDir }) ?? mintSiteKeyIdIfAbsent(input.siteDir, mode);
  if (mode !== "production" && !siteKeyId) return undefined;
  const sources = siteKeySources({ mode, env, home: input.home ?? homedir(), cwd: input.cwd ?? process.cwd(), siteKeyId });
  const fingerprint = fingerprintSiteKeyHex(parsed.hex);

  for (const source of sources) {
    if (source.kind === "env") {
      const material = readSiteKeySourceMaterial(source, env);
      if (material === undefined) continue;
      if (!matchesFingerprint(parseSiteKeyHex(material.raw), fingerprint)) return { outcome: "env-key-set" };
      stampFingerprint(input.siteDir, fingerprint);
      return { outcome: "installed", keyFilePath: `env:${material.envVarName}`, fingerprint };
    }
    if (source.path === undefined) continue;
    const current = readRawSiteKeyMaterial(source, env);
    if (current !== undefined && !matchesFingerprint(parseSiteKeyHex(current), fingerprint)) moveSiteKeyFileAside(source.path, current);
    const written = atomicCreateSiteKeyFile(source.path, parsed.hex);
    if (fingerprintSiteKeyHex(written) !== fingerprint) throw new Error("installSiteKey: another process wrote a different key at the same moment; nothing was stamped");
    stampFingerprint(input.siteDir, fingerprint);
    return { outcome: "installed", keyFilePath: source.path, fingerprint };
  }
  throw new Error("installSiteKey: this site has no key file to write");
}

/** Sets `.site-meta.json`'s `siteKeyFingerprint`, keeping every other field; no meta file is left
 *  alone. @complexity O(1). */
function stampFingerprint(siteDir: string, fingerprint: string): void {
  const meta = readSiteMetaJson(siteDir);
  if (meta === undefined || meta.siteKeyFingerprint === fingerprint) return;
  writeJsonFileAtomic(join(siteDir, ".site-meta.json"), { ...meta, siteKeyFingerprint: fingerprint });
}

/**
 * `.site-meta.json` has no `siteKeyId` (or `siteId`) to resolve at all — for local mode only, mints
 * a brand-new, minimal `.site-meta.json` carrying just a fresh `siteKeyId`, and returns it. Never
 * called in production (checked by the caller before reaching this function) and never touches a
 * `siteDir` whose `.site-meta.json` already exists in ANY form, parseable or not — see
 * {@link mintMinimalSiteMetaJson}'s own doc for why.
 *
 * @complexity O(1) — one `randomUUID`, one attempted exclusive file create.
 */
function mintSiteKeyIdIfAbsent(siteDir: string, mode: RuntimeMode): string | undefined {
  if (mode === "production") return undefined;
  const siteKeyId = randomUUID();
  return mintMinimalSiteMetaJson(siteDir, siteKeyId, { siteKeyId });
}

/**
 * {@link mintSiteKeyIdIfAbsent} for the boot path, which can wait on a db read: when the site's
 * `content.db` already has migrations applied, the minted file is a COMPLETE `.site-meta.json`
 * (`buildSiteMetaForNewKey` — schema stamp derived from the db, `siteId` = the fresh `siteKeyId`), so
 * `tovu serve`/the desktop accept the folder straight away. With no migrated db yet (a brand-new dev
 * site: the composition creates it after this runs) it falls back to the key-only shape, because
 * minting nothing would leave this boot without a site key; the dev boot completes that file once
 * the db is migrated (`src/index.ts`).
 *
 * @complexity O(m) in the bundled journal's entry count (one read-only db open), plus one exclusive
 *   file create.
 */
async function mintSiteMetaForBootIfAbsent(siteDir: string, mode: RuntimeMode): Promise<string | undefined> {
  if (mode === "production") return undefined;
  const siteKeyId = randomUUID();
  const complete = await buildSiteMetaForNewKey({ dir: siteDir, siteKeyId });
  return mintMinimalSiteMetaJson(siteDir, siteKeyId, complete ?? { siteKeyId });
}

/**
 * Creates `<siteDir>/.site-meta.json` holding `content` — either just the fresh `siteKeyId`, or the
 * complete meta {@link mintSiteMetaForBootIfAbsent} derived for it — EXCLUSIVELY (`flag:
 * "wx"` — fails atomically with `EEXIST` if anything is already there) — race-safe the same way
 * {@link atomicCreateSiteKeyFile} is, and for the identical reason (site-key plan §A.2's "no
 * single-instance lock": this owner runs many local instances of the same site at once). Never
 * overwrites, never merges into, never repairs an existing file, however corrupt or incomplete —
 * "preserve anything present" means exactly that: the moment ANY `.site-meta.json` exists at
 * `siteDir`, this function's job is already done (or was never its job at all), and it must not
 * guess at what a caller who wrote that file intended.
 *
 * On `EEXIST` (this call lost a boot race against another instance, or — vanishingly unlikely given
 * the caller already checked — a file appeared between that check and this write) reads back
 * whatever is now on disk via {@link resolveSiteKeyId} rather than trusting its own candidate,
 * exactly the "both winner and loser converge on the same reality" rule {@link
 * atomicCreateSiteKeyFile} documents for the key file itself. That real file may turn out to have no
 * resolvable id at all (e.g. the winner's own write raced a THIRD process that got there first with
 * a corrupt file) — this function reports that honestly as `undefined` rather than minting a SECOND
 * file the first write already made unnecessary.
 *
 * The file is key-only because this runs before the db is opened, so no schema stamp can be
 * derived yet. It does not stay that way: the boot completes it once the db is migrated
 * (`platform/site-dir/key-only-site-meta.ts`, called from `src/index.ts` and `bootSiteDir`), keeping
 * the `siteKeyId` minted here.
 *
 * @returns the minted (or, on a lost race, the already-present) `siteKeyId`, or `undefined` when
 *   neither this call's own write nor a re-read of an existing file resolves to one.
 * @throws whatever `writeFileSync` throws other than `EEXIST` (permissions, a missing/non-directory
 *   parent, disk full) — this function does not itself decide what a write failure means; its one
 *   caller, {@link ensureSiteKeyForBoot}, is the boot-time safety net that catches it.
 * @complexity O(1) — one `randomUUID`, one attempted exclusive file write.
 */
function mintMinimalSiteMetaJson(siteDir: string, siteKeyId: string, content: { siteKeyId?: string }): string | undefined {
  const metaPath = join(siteDir, ".site-meta.json");
  try {
    writeFileSync(metaPath, JSON.stringify(content, null, 2), { flag: "wx", mode: 0o600 });
    return siteKeyId;
  } catch (err) {
    if (!isErrorCode(err, "EEXIST")) throw err;
    return resolveSiteKeyId({ siteDir });
  }
}

/** {@link planSiteKeyEnsure}'s input shape from a raw {@link parseSiteKeyHex} result (or
 *  `undefined` for "nothing there"). */
function materialCheckOf(parsed: ReturnType<typeof parseSiteKeyHex> | undefined): SiteKeyMaterialCheck {
  if (parsed === undefined) return { kind: "absent" };
  return parsed.ok ? { kind: "valid" } : { kind: "invalid" };
}

/** The material of the first source in `sources` holding a valid key whose fingerprint is
 *  `stampedFingerprint`, or `undefined` when nothing is stamped or no source matches. A match is
 *  proof it is the key the site's data was sealed with, so a broken or different source earlier in
 *  the order does not hide it.
 *  @complexity O(n) in `sources.length` — one read and one hash per source. */
function findStampedMaterial(
  sources: readonly SiteKeySource[],
  env: NodeJS.ProcessEnv,
  stampedFingerprint: string | undefined
): string | undefined {
  if (stampedFingerprint === undefined) return undefined;
  for (const source of sources) {
    const raw = readRawSiteKeyMaterial(source, env);
    const parsed = raw === undefined ? undefined : parseSiteKeyHex(raw);
    if (parsed?.ok && fingerprintSiteKeyHex(parsed.hex) === stampedFingerprint) return raw;
  }
  return undefined;
}

/** Whether `parsed` is a valid key whose fingerprint is `fingerprint`. @complexity O(1). */
function matchesFingerprint(parsed: ReturnType<typeof parseSiteKeyHex> | undefined, fingerprint: string | undefined): boolean {
  return parsed?.ok === true && fingerprint !== undefined && fingerprintSiteKeyHex(parsed.hex) === fingerprint;
}

/**
 * Renames a wrong site key file to `<name>.wrong-<timestamp>` beside it (`0600`) so a key is never
 * lost, even one that turned out to be the wrong one. Only moves the file when it still holds
 * `expectedContent`: another instance that already replaced it must not have its fix moved aside.
 * A file already gone (another instance moved it first) is not an error.
 *
 * @returns the backup path, or `undefined` when nothing was moved.
 * @throws whatever `fs` throws other than `ENOENT`.
 * @complexity O(1) — one read, one rename, one chmod.
 */
function moveSiteKeyFileAside(filePath: string, expectedContent: string): string | undefined {
  let current: string;
  try {
    current = readFileSync(filePath, "utf8");
  } catch (err) {
    if (isErrorCode(err, "ENOENT")) return undefined;
    throw err;
  }
  if (current !== expectedContent) return undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.wrong-${stamp}-${randomBytes(2).toString("hex")}`;
  try {
    renameSync(filePath, backupPath);
  } catch (err) {
    if (isErrorCode(err, "ENOENT")) return undefined;
    throw err;
  }
  chmodSync(backupPath, 0o600);
  return backupPath;
}

/** The first source in `sources` that has ANY material — present-but-invalid still counts and
 *  stops the scan (site-key plan §A.2: adopting silently past a broken source would still be
 *  wrong, the same reasoning `keyring.env.ts`'s own env-then-file resolution already follows). */
function findFirstPresentMaterial(sources: readonly SiteKeySource[], env: NodeJS.ProcessEnv): string | undefined {
  for (const source of sources) {
    const raw = readRawSiteKeyMaterial(source, env);
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
    if (!isErrorCode(err, "EEXIST")) throw err;
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

/** Whether a failed fs call failed with exactly `code` (e.g. `EEXIST`: the target path was already
 *  taken), as opposed to a genuine I/O or permission fault that must keep propagating. Shared by
 *  {@link atomicCreateSiteKeyFile}'s `linkSync` and {@link mintMinimalSiteMetaJson}'s `writeFileSync(…,
 *  {flag:"wx"})` — both are "only the FIRST writer wins, everyone else reads the result back"
 *  primitives — and by {@link moveSiteKeyFileAside}'s `ENOENT` (another instance moved it first). */
function isErrorCode(err: unknown, code: "EEXIST" | "ENOENT"): boolean {
  if (typeof err !== "object" || err === null || !("code" in err)) return false;
  return (err as { code?: unknown }).code === code;
}

function readRawSiteKeyMaterial(source: SiteKeySource, env: NodeJS.ProcessEnv): string | undefined {
  return readSiteKeySourceMaterial(source, env)?.raw;
}
