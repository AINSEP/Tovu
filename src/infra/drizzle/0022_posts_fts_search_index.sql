-- Custom SQL migration file, put your code below! --
--
-- Durable full-text search index over `posts`, backing the `content_post_search` agent tool.
--
-- Hand-written rather than generated, because neither object below is expressible in
-- `infra/db/schema.ts`: drizzle-orm's sqlite-core has no `CREATE VIRTUAL TABLE` builder, and the
-- three triggers exist only to serve that virtual table. Produced via
-- `npx drizzle-kit generate --custom --name=posts_fts_search_index`, which is the supported path for
-- exactly this case — it wrote the `_journal.json` entry and the `0022_snapshot.json` baseline, so a
-- later `db:generate` still diffs against a consistent snapshot instead of re-proposing 0021.
--
-- TWO objects, not one, and the split is the point.
--
-- `post_search_document` is an ORDINARY table holding the searchable projection of one post: its
-- title, its slug, and the plain text walked out of its TipTap/ProseMirror `body_json`. The
-- extraction is a TypeScript job (`features/post/search.ts`'s `extractPostPlainText`) because
-- walking arbitrary nested document JSON for text nodes is not something SQL should be asked to do
-- — but the RESULT is stored here so it is inspectable by any dump/query tool, and so the FTS index
-- has a real content table to hang off.
--
-- `post_search_fts` is the FTS5 index, in external-content mode (`content='post_search_document'`)
-- — the same shape `@jini-ai/sqlite`'s `tool_catalog`/`tool_catalog_fts` pair already uses in this
-- codebase. What differs from that precedent is HOW it is kept current: the tool catalog is a
-- disposable snapshot of static code, so it is rebuilt wholesale on every reseed. Posts are mutable
-- user data with no reseed moment, so this index is maintained incrementally by the three triggers
-- below (the canonical FTS5 external-content trigger set from the SQLite docs). That keeps the sync
-- rule in ONE place — the database — rather than requiring every writer of `post_search_document`
-- to remember a second write.
--
-- Why `post_search_document` and not `content='posts'` directly: FTS5 external content indexes the
-- literal column values of its content table, and `posts.body_json` is raw TipTap JSON. Indexing
-- that would tokenize the document's own structural vocabulary — `type`, `doc`, `content`,
-- `paragraph`, `text`, `attrs` — into every row, which is both noise in the term dictionary and an
-- active ranking hazard (every post would match "content").
--
-- What is deliberately NOT indexed here: `status`, `kind`, `workspace_id`, and `deleted_at`. Those
-- are filters, not text, and they change WITHOUT the searchable text changing (publish, trash,
-- restore). Keeping them out means a status change or a soft delete needs no index write at all —
-- `searchPostIndex` joins back to `posts` and filters on the live row, so the index can never
-- disagree with the current status/trash state of a post. See `features/post/search-index.sqlite.ts`.
--
-- `tokenize='porter unicode61'` — `unicode61` (FTS5's default) for diacritic folding and
-- punctuation splitting, plus the Porter stemmer on top so "pricing" finds a page titled "Prices".
-- That stemmer is English-only, which is a real limitation on a non-English corpus; it is applied
-- symmetrically to the document AND the query, so the worst case for other languages is that two
-- forms of a word stay distinct terms — never that an exact term stops matching. Accepted
-- deliberately: the product use case is "where's the page about X", where recall on word forms
-- matters more than the tokenizer being language-neutral.
--
-- Backfill of pre-existing rows is NOT done here, for the same reason the extraction is not:
-- `body_json` has to be walked in TypeScript. `backfillPostSearchIndex` (same file) does it at boot,
-- indexing only the posts that are missing, so a warm database pays one cheap anti-join per start.

CREATE TABLE `post_search_document` (
	`post_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`body_text` text NOT NULL
);
--> statement-breakpoint
CREATE VIRTUAL TABLE `post_search_fts` USING fts5(
	title,
	slug,
	body_text,
	content='post_search_document',
	content_rowid='rowid',
	tokenize='porter unicode61'
);
--> statement-breakpoint
CREATE TRIGGER `post_search_document_ai` AFTER INSERT ON `post_search_document` BEGIN
	INSERT INTO `post_search_fts`(rowid, title, slug, body_text)
	VALUES (new.rowid, new.title, new.slug, new.body_text);
END;
--> statement-breakpoint
CREATE TRIGGER `post_search_document_ad` AFTER DELETE ON `post_search_document` BEGIN
	INSERT INTO `post_search_fts`(`post_search_fts`, rowid, title, slug, body_text)
	VALUES ('delete', old.rowid, old.title, old.slug, old.body_text);
END;
--> statement-breakpoint
CREATE TRIGGER `post_search_document_au` AFTER UPDATE ON `post_search_document` BEGIN
	INSERT INTO `post_search_fts`(`post_search_fts`, rowid, title, slug, body_text)
	VALUES ('delete', old.rowid, old.title, old.slug, old.body_text);
	INSERT INTO `post_search_fts`(rowid, title, slug, body_text)
	VALUES (new.rowid, new.title, new.slug, new.body_text);
END;
