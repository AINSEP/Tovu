import { runBootDataRepairs } from "#src/server/runtime/composition/boot-data-repairs";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { contentKernel } from "../db/content-kernel.js";
import { closeSqliteConnection, openPostgresKernel, sqliteKernel } from "../db/kernel/index.js";
import { migrateContentDatabase } from "../db/migrations/index.js";
import { prepareContentStore } from "../db/prepare-content-store.js";
import { openSqliteContentConnection } from "../db/sqlite/content-db.js";
import { writeJsonFileAtomic } from "./atomic-write.js";
import { seedSiteThemes } from "./seed-site-themes.js";
import { InitDirNotEmptyError, InternalError, ValidationError } from "./errors.js";
import { resolveProductRoot } from "./product-root.js";
import { readTemplate, type ReadTemplateOptional } from "./read-template.js";
import { resolveInstallDirTarget } from "./resolve-install-dir-target.js";
import { runtimeSchemaVersion } from "./schema-guard.js";
import type { ConfigJson, SiteMetaJson, SiteStorage } from "./types.js";
import type { ContentDbSeedData } from "../db/sqlite/content-db.js";
import { nonEmptyTables } from "#src/features/database-transfer/pg-store-copy";
import { openSiteStore } from "#src/server/runtime/composition/open-site-store";
import { sealConnectionStringForNewSite } from "#src/server/runtime/composition/storage-secret";
import { createSqliteIdentityRouteDeps } from "../../features/identity/wiring.js";
import { createPermissionGrantRegistry } from "../../features/identity/permission-grants.js";
import { resolveNewSiteAdminPassword } from "./new-site-owner.js";

/**
 * @file SPEC-003 C-007 — `initSite`, `tovu init`'s full orchestration.
 *
 * Purpose:
 * Create a complete install dir from the starter template, per BR-01's 8-step ordering, with
 * INV-02's commit-marker discipline (CIC U-003) and INV-01's path-containment discipline (CIC
 * U-004) both enforced structurally rather than left to caller discipline.
 *
 * Cleanup design (CIC U-003-B1/B2/B3, U-003-ORD1): a `wroteAnything` flag is set to `true` only
 * AFTER each mutating step actually succeeds (never before attempting it). On failure, cleanup is
 * attempted ONLY if something was actually written — an immediate failure before any write (e.g.
 * a pre-existing, permission-locked EMPTY target where even the first subdirectory create is
 * denied) leaves a pre-existing target exactly as the operator left it, never attempting to
 * remove a directory this call did not itself populate. Once anything has been written, cleanup
 * removes the ENTIRE target (including the directory node itself, even if it pre-existed) — INV-02
 * defines "no partial install dir survives", not "no partial install dir survives unless an
 * operator's own empty directory happened to be the target." If that removal itself fails (e.g. a
 * read-only grandparent blocking the final directory-entry removal), the surfaced error names the
 * partial directory's path rather than swallowing the cleanup failure silently (U-003-B3).
 *
 * Architectural role:
 * `site-dir` domain logic. No dependency on `cli/**` or `express`. Every fs write in this file is
 * derived from the ONE `target` variable `resolveInstallDirTarget` returns — never re-derived
 * from the raw `dir` argument (INV-01, CIC U-004-B1).
 */

/**
 * Plain, empty-on-init placeholder dirs. `themes` is deliberately NOT here: it is SEEDED (real
 * stock content copied in via `seedSiteThemes()`), not just `mkdirSync`'d empty — an empty
 * `themes/` immediately after init would be indistinguishable from "already seeded" to
 * `seedSiteThemes()`'s own (deliberately presence-only, contents-blind) check on the site's first
 * `tovu serve`, permanently bricking every fresh site's theme list. See step 4b below.
 */
const SUBDIRS = ["uploads", "plugins", "overrides"] as const;
const MAX_NAME_LENGTH = 200;

/**
 * Mirrors `server/runtime/composition/deps.ts`'s `builtInThemesDir()` formula exactly — same env
 * var, same `resolveProductRoot()` primitive — without importing that module. `deps.ts` lives
 * behind this domain's own CLI/Express-agnostic boundary (INV-06, the `site-dir-no-server-express-
 * or-cli-imports` dependency-cruiser rule); importing it here would both break that boundary and
 * drag the entire server composition graph into `tovu init`.
 */
function stockThemesDir(): string {
  return process.env.TOVU_STOCK_THEMES_DIR ?? path.join(resolveProductRoot(), "content", "themes");
}

export interface InitSiteRequired {
  dir: string;
  /** Explicit new owner password; omission means tovu-dev, independently of process env. */
  adminPassword?: string;
  /**
   * Site display name; defaults to the target directory's basename (BR-03). Kept in the SAME
   * input object (not a separate options parameter) to match Contract Map C-007's Inputs shape
   * (`{ dir: string; name?: string }`) and the certified test suite's call sites verbatim —
   * a deliberate deviation from this codebase's default `func(required, options)` convention,
   * justified by the certified Contract Map being the binding shape for this exported function.
   */
  name?: string;
  /**
   * Where the site keeps its data (R1f "hidden creation"): only `tovu init --storage` sets it; the
   * admin's create-site flow and the sites MCP tools never do. Default SQLite.
   */
  storage?: SiteStorage;
  /** A `postgres` site with `secretRef: "site"`: the connection string init seals into the site folder. */
  connectionString?: string;
}

export interface InitSiteResult {
  siteId: string;
  dir: string;
}

/**
 * BR-03: `--name` (trimmed) when provided, else the target directory's basename. A
 * provided-but-empty name is VALIDATION, not a fall-through (EC-06).
 *
 * Exported (2026-09-05) — `duplicate-site.ts` needs the IDENTICAL display-name rule for its own
 * `name?` parameter (same shape as this function's own `required.name`), and a second copy of a
 * validation rule is exactly the kind of drift risk this codebase's own `RAW_SQL_MANAGED_TABLES`/
 * `declaredShape()` precedents (`db/migration/manifest.ts`) exist to avoid.
 */
export function resolveSiteName(target: string, name: string | undefined): string {
  if (name === undefined) return path.basename(target);
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`initSite: --name must be 1..${MAX_NAME_LENGTH} chars after trim`);
  }
  return trimmed;
}

/**
 * CIC U-003 cleanup-then-rethrow, split out of `initSite`'s own `catch` so that nested branching
 * doesn't compound `initSite`'s cognitive complexity. Always throws (never returns) — see
 * `initSite`'s own doc for the full cleanup-on-failure contract this implements (U-003-B1/B2/B3,
 * EC-10, RT-003).
 */
export function cleanupAndRethrow(err: unknown, target: string, wroteAnything: boolean): never {
  if (wroteAnything) {
    try {
      fs.rmSync(target, { recursive: true, force: false });
    } catch (cleanupErr) {
      // CIC U-003-B3 / EC-10 / RT-003: the cleanup failure itself must name the partial dir
      // rather than being swallowed silently — the commit marker was never reached, so `serve`
      // still refuses this dir (INV-02 holds), but an operator needs to know manual removal is
      // required.
      throw new InternalError(
        `initSite: cleanup failed after a mid-flight error — manual removal required at ${target}: ${(cleanupErr as Error).message}`
      );
    }
  }
  if (err instanceof ValidationError || err instanceof InitDirNotEmptyError || err instanceof InternalError) {
    throw err;
  }
  throw new InternalError(`initSite: failed while creating ${target}: ${(err as Error).message}`);
}

/**
 * BR-01 step 2 (EC-01/EC-02/AC-04): target must be absent, or an empty directory, with an existing
 * parent.
 *
 * Exported (2026-09-05) — `duplicateSite` reuses this verbatim for its own target-dir refusal
 * rather than a second "is this a valid init target" implementation (the dispatch that requested
 * `duplicateSite` explicitly named `InitDirNotEmptyError` as established precedent to reuse, not
 * reinvent).
 */
export function validateInitTarget(target: string): void {
  let stat: fs.Stats | undefined;
  try {
    stat = fs.statSync(target);
  } catch {
    stat = undefined;
  }

  if (stat === undefined) {
    if (!fs.existsSync(path.dirname(target))) {
      // behavior.spec.md §4: "Init target depth: parent directory must exist" — no recursive
      // `mkdir -p` of arbitrary ancestors (a typo guard), enforced in the same error class as an
      // occupied target.
      throw new InitDirNotEmptyError(
        `initSite: the parent directory of ${target} does not exist (no recursive creation of arbitrary ancestors)`
      );
    }
    return; // absent, parent exists — a valid init target (EC-01 "absent" branch).
  }
  if (!stat.isDirectory()) {
    throw new InitDirNotEmptyError(`initSite: ${target} exists and is not a directory (EC-02)`);
  }
  if (fs.readdirSync(target).length > 0) {
    throw new InitDirNotEmptyError(`initSite: ${target} exists and is not an empty directory (AC-04)`);
  }
}

/**
 * Create a complete install dir from the starter template (BR-01).
 *
 * @param required.dir - the install dir path; resolved once (path/symlink containment, CIC
 *   U-004) into the single `target` every write below derives from.
 * @param required.name - site display name; defaults to the target directory's basename (BR-03).
 * @param options.withSampleContent - Explicit demo/fixture opt-in; default creation has no entries.
 * @returns `{ siteId, dir }` — `dir` is the RESOLVED target path.
 * @throws {ValidationError} an invalid `--name` (EC-06, behavior.spec.md §4) — nothing created.
 * @throws {InitDirNotEmptyError} the target is occupied (file or non-empty dir, AC-04/EC-01/EC-02)
 *   or its parent is missing — nothing created.
 * @throws {InternalError} a corrupt template (BR-01 step 3, nothing created yet), or any fs/db
 *   failure during steps 4-7 (after best-effort cleanup per CIC U-003).
 * @complexity Bounded per fs/db operation count (3 plain subdirs, 2 JSON writes, one db
 *   open+migrate+seed) — never a function of caller-controlled input size — PLUS one
 *   `seedSiteThemes()` call whose own cost is O(bytes in the stock themes tree), a fixed,
 *   caller-independent size (see that function's own `@complexity`).
 * @overallScore 100
 */
export async function initSite(required: InitSiteRequired, options: ReadTemplateOptional = {}): Promise<InitSiteResult> {
  const { dir, name } = required;
  const adminPassword = resolveNewSiteAdminPassword(required);
  const target = resolveInstallDirTarget(dir);

  const resolvedName = resolveSiteName(target, name); // step 1 (VALIDATION) — before any target/fs check.
  const storage = required.storage ?? { kind: "sqlite" };
  validateStorageInput(storage, required.connectionString); // step 1 too.
  validateInitTarget(target); // step 2 (INIT_DIR_NOT_EMPTY).
  const { template, seed } = readTemplate({ templateId: "starter" }, options); // step 3 (INTERNAL) — nothing created yet.

  const siteId = randomUUID();
  const createdAt = new Date().toISOString();
  let wroteAnything = false;

  try {
    // Step 3b: a Postgres database must be empty, checked before anything is created or sealed.
    await assertPostgresTargetEmpty(storage, required.connectionString);

    // Step 4: directory + subdirectory creation.
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target);
      wroteAnything = true;
    }
    for (const sub of SUBDIRS) {
      fs.mkdirSync(path.join(target, sub));
      wroteAnything = true;
    }

    // Step 4b: themes/ is SEEDED, not plain-`mkdir`'d — see `SUBDIRS`'s own doc for why an empty
    // placeholder here would brick the site's first `tovu serve`. A seed failure is a real init
    // failure, same as any other step-4 sub-step (CIC U-003) — nothing here swallows it.
    seedSiteThemes({ stockDir: stockThemesDir(), siteThemesDir: path.join(target, "themes") }, { siteName: resolvedName });
    wroteAnything = true;

    // Step 5: config.json write.
    const config: ConfigJson = { name: resolvedName, domain: null, port: null };
    writeJsonFileAtomic({ filePath: path.join(target, "config.json"), data: config }, {});

    // Steps 6-7: content.db create + migrate, then seed insertion on its kernel (see
    // read-template.ts's Known-Gap disclosure on why these two BR-01 steps are not independently
    // fault-isolable at the fs level).
    // SQLite: built through the migration runner (ADR-066), so the file is born with the
    // `tovu_migrations` ledger at head and its first boot has nothing to adopt or back up; a new,
    // empty file has nothing to copy, so no backup path. chat.db is created by the first boot's
    // chat runner (`openSiteChatDb`), which takes no copy either.
    // PGlite/Postgres: the store is created (runner to head, content + ai_chat) and seeded instead.
    if (storage.kind === "sqlite") {
      const dbPath = path.join(target, "content.db");
      const db = openSqliteContentConnection(dbPath);
      try {
        await migrateContentDatabase(sqliteKernel<unknown>(db));
        await prepareContentStore(contentKernel(db), { seed });
        // A freshly initialized site must already carry current repair markers, so its first boot
        // does not mutate content.db merely to record a no-op repair. Older sites still repair on boot.
        await runBootDataRepairs({ kernel: contentKernel(db) });
        await seedNewSiteOwner({ kernel: contentKernel(db), seed, adminPassword });
      } finally {
        closeSqliteConnection(db);
      }
    } else {
      await createPgSiteStore({ target, storage, seed, siteKeyId: siteId, connectionString: required.connectionString, adminPassword });
    }

    // Step 8: .site-meta.json write — the commit marker, and the physically LAST write on
    // success (CIC U-003-ORD1), gated on every prior step having already succeeded.
    const runtime = runtimeSchemaVersion();
    const meta: SiteMetaJson = {
      siteId,
      templateId: template.id,
      templateVersion: template.version,
      schemaVersion: runtime.index,
      schemaTag: runtime.tag,
      createdAt,
      // Site-key plan §A.4: a brand-new site's key file is named after its own siteId — explicit
      // here rather than left for `resolveSiteKeyId`'s siteId fallback to infer, so the intent is
      // visible in the file itself and a future `duplicateSite` always has a real value to carry
      // forward (see that function's own `siteKeyId ?? siteId` carry-over).
      siteKeyId: siteId,
      // Written explicitly (absent also means SQLite) so the choice is visible in the file.
      storage,
    };
    writeJsonFileAtomic({ filePath: path.join(target, ".site-meta.json"), data: meta }, {});

    return { siteId, dir: target };
  } catch (err) {
    return cleanupAndRethrow(err, target, wroteAnything);
  }
}

/**
 * `storage` + `connectionString` agree, checked before anything is created: a sealed Postgres site
 * needs its connection string, an env-named one needs that variable set, and nothing else takes one.
 *
 * @throws {ValidationError} naming the missing or extra input (never the connection string).
 */
function validateStorageInput(storage: SiteStorage, connectionString: string | undefined): void {
  const sealed = storage.kind === "postgres" && storage.secretRef === "site";
  const given = connectionString !== undefined && connectionString.trim() !== "";
  if (sealed && !given) throw new ValidationError("initSite: a postgres site sealed in its folder needs its connection string");
  if (!sealed && connectionString !== undefined) throw new ValidationError(`initSite: a ${storage.kind} site takes no connection string here`);
  if (storage.kind === "postgres" && storage.secretRef !== "site") {
    const value = process.env[storage.secretRef.env];
    if (value === undefined || value.trim() === "") {
      throw new ValidationError(`initSite: the environment variable ${storage.secretRef.env} (the site's Postgres connection string) is not set`);
    }
  }
}

/**
 * A new Postgres site needs an empty database: refuses one where any non-ledger table in `public`
 * or `ai_chat` holds a row (`nonEmptyTables`, the storage move's own target check). Otherwise a
 * second `tovu init` against another site's database would mint a new site identity and key that
 * silently shares that site's content and cannot decrypt its credentials. Taking over an existing
 * database is a separate, explicit adopt step (not built yet). A PGlite site's data dir is new with
 * the folder, so it has nothing to check.
 *
 * @throws {ValidationError} naming up to five occupied tables (never the connection string).
 */
async function assertPostgresTargetEmpty(storage: SiteStorage, connectionString: string | undefined): Promise<void> {
  if (storage.kind !== "postgres") return;
  const url = storage.secretRef === "site" ? connectionString : process.env[storage.secretRef.env];
  const kernel = openPostgresKernel<unknown>({ connectionString: (url ?? "").trim(), max: 1 });
  try {
    const occupied = await nonEmptyTables(kernel);
    if (occupied.length === 0) return;
    const named = occupied.slice(0, 5).join(", ") + (occupied.length > 5 ? `, and ${occupied.length - 5} more` : "");
    throw new ValidationError(
      `initSite: the Postgres database already holds data (${named}); a new site needs an empty database. ` +
        "Adopting an existing Tovu database into a new site folder is a separate step that is not available yet."
    );
  } finally {
    await kernel.close();
  }
}

/**
 * A PGlite/Postgres site's store at init: seal the connection string when the site keeps it, then
 * open the store as its owner (PGlite: creates `<site>/pglite/`), which runs both migration
 * histories to head and seeds the template, and close it.
 */
async function createPgSiteStore(required: {
  adminPassword: string;
  target: string;
  storage: Exclude<SiteStorage, { kind: "sqlite" }>;
  seed: ContentDbSeedData;
  siteKeyId: string;
  connectionString: string | undefined;
}): Promise<void> {
  const { target, storage, seed, siteKeyId, connectionString } = required;
  const sealed =
    storage.kind === "postgres" && storage.secretRef === "site" && connectionString !== undefined
      ? await sealConnectionStringForNewSite({ siteDir: target, siteKeyId, connectionString })
      : undefined;
  const store = await openSiteStore(
    { storage, dbPath: path.join(target, "content.db"), chatDbPath: path.join(target, "chat.db"), role: "owner" },
    { seed, sealer: sealed?.sealer }
  );
  try {
    await seedNewSiteOwner({ kernel: store.content, seed, adminPassword: required.adminPassword });
  } finally {
    await store.close();
  }
}

/** Persist the owner before init's commit marker: serve must never choose a new site's password.
 * Uses the same identity repositories and Jini seeder as boot, across all storage backends.
 * Boot still reconciles app-specific grants. @complexity O(1), including one password hash.
 */
async function seedNewSiteOwner(
  { kernel, seed, adminPassword }: { kernel: Parameters<typeof createSqliteIdentityRouteDeps>[0]["db"]; seed: ContentDbSeedData; adminPassword: string },
  _options: Record<string, never> = {},
): Promise<void> {
  const identity = createSqliteIdentityRouteDeps({
    db: kernel,
    workspaceId: seed.workspace.id,
    clock: { nowMs: () => Date.now() },
    idGen: { newId: () => randomUUID() },
    permissionGrants: createPermissionGrantRegistry({}),
    reconcileGrantsOnBoot: false,
    ownerCredentials: { username: "admin", password: adminPassword },
  });
  await Promise.all([identity.identityReady, identity.ownerPrincipalId]);
}
