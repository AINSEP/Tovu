import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ClockPort, IdGeneratorPort } from "@jini-ai/cms/core";

import { SqliteMenuRepo } from "#src/features/navigation/repo.sqlite";
import { SqlitePostRepo } from "#src/features/post/index";
import { createPublishContentSeedHash, type PublishContentSeedHashFn } from "#src/features/publish-content/seed-hash";
import { SqliteRedirectRepo, type RedirectsWriteDeps } from "#src/features/redirects/index";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqliteMediaRepo } from "#src/platform/db/sqlite/media-repo.sqlite";

/**
 * @file The SQLite composition root's D1 seed-version lookup: `features/publish-content/seed-hash.ts`
 * over the stock `content.seed.db` this instance was hydrated from
 * (`builtInContentSeedDbPath()`, the same file `hydrateContentDbFromSeed()` copied into `content.db`
 * on first boot).
 *
 * Why a migrated COPY, not the shipped file read-only: the live `content.db` is "seed + every
 * migration since", and the repos below query the CURRENT schema. Opening the seed read-only would
 * hand a newer repo an older schema; migrating the shipped file in place would mutate a stock build
 * artifact. Copying it to a private temp file and running the ordinary `openContentDb()` migration
 * on the copy reproduces exactly what an untouched live row looks like today — so its hash is
 * comparable with the live row's hash by construction. The copy happens once per process, on the
 * first import plan, never at boot.
 */

export interface CreateSqlitePublishContentSeedHashInput {
  /** `builtInContentSeedDbPath()` — absent on any install that ships no seed (answers `null`). */
  readonly seedDbPath: string;
  /** The live workspace id. The live `content.db` IS the seed plus edits, so ids agree; a seed from
   *  another workspace simply finds nothing and every row stays a `conflict`. */
  readonly workspaceId: string;
  readonly clock: ClockPort;
  readonly idGen: IdGeneratorPort;
  /** The live bag, reused only for its non-repo fields; `repo`/`db` are swapped for the seed's. The
   *  redirect handler's `inspect()` reads nothing but `repo`. */
  readonly redirectsWriteDeps: RedirectsWriteDeps;
}

/**
 * @complexity O(1) to create. The first lookup copies and migrates the seed (O(seed bytes)); every
 *   later lookup is one indexed read.
 */
export function createSqlitePublishContentSeedHash(input: CreateSqlitePublishContentSeedHashInput): PublishContentSeedHashFn {
  return createPublishContentSeedHash({
    loadSeedDeps: () => {
      if (!existsSync(input.seedDbPath)) return null;
      const copyPath = join(mkdtempSync(join(tmpdir(), "tovu-publish-seed-")), "content.seed.db");
      copyFileSync(input.seedDbPath, copyPath);
      const seedDb = openContentDb(copyPath);
      const redirectRepo = new SqliteRedirectRepo(seedDb);
      return {
        workspaceId: input.workspaceId,
        postRepo: new SqlitePostRepo(seedDb),
        clock: input.clock,
        idGen: input.idGen,
        mediaRepo: new SqliteMediaRepo(seedDb),
        menuRepo: new SqliteMenuRepo(seedDb),
        redirectsWriteDeps: { ...input.redirectsWriteDeps, repo: redirectRepo, db: redirectRepo },
      };
    },
  });
}
