import { sql } from "kysely";

import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Step `0001_post_search`: post full-text search on Postgres/PGlite (storage-adapter plan F1,
 * R1 plan R1f) — the `tovu_search` text-search configuration, the `post_search_document` projection
 * with its stored `tsvector`, and the GIN index `features/post/search-index.postgres.ts` queries.
 *
 * SQLite: nothing. Its FTS5 index is part of the legacy chain (drizzle 0022), so `0000` already
 * built it.
 *
 * `tovu_search` is `'simple'` with word tokens mapped to a Snowball English stemmer that has no
 * stop-word list: it stems like FTS5's `porter` tokenizer and, unlike `'english'`, keeps "the".
 */

export const POST_SEARCH_ID = "0001_post_search";

const STATEMENTS = [
  sql`CREATE TEXT SEARCH DICTIONARY tovu_search_stem (TEMPLATE = snowball, Language = english)`,
  sql`CREATE TEXT SEARCH CONFIGURATION tovu_search (COPY = simple)`,
  sql`ALTER TEXT SEARCH CONFIGURATION tovu_search ALTER MAPPING FOR asciiword, word, numword, asciihword, hword, numhword, hword_part, hword_asciipart, hword_numpart WITH tovu_search_stem`,
  sql`CREATE TABLE post_search_document (
    post_id text PRIMARY KEY REFERENCES posts (id) ON DELETE CASCADE,
    title text NOT NULL,
    slug text NOT NULL,
    body_text text NOT NULL,
    search tsvector NOT NULL
  )`,
  sql`CREATE INDEX post_search_document_search_idx ON post_search_document USING GIN (search)`,
];

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect === "sqlite") return;
  for (const statement of STATEMENTS) await kernel.execute(statement);
}

export const postSearch = (checksum: string): MigrationStep => ({ id: POST_SEARCH_ID, checksum, up });
