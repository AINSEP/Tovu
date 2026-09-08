# higgsfield external MCP row — recovery investigation (READ-ONLY)

Date: 2026-09-08. Investigation only — no writes were made to any database. `uptime` at time of
investigation: `14:28 up 19 days, load averages: 74.10 80.38 89.70` (shared, heavily loaded host —
timings below are wall-clock, not CPU-bound).

## Verdict: FULLY RECOVERABLE, but not via the admin UI's normal "add server" form

A byte-for-byte copy of the row — config **and** the live OAuth connection (tokens included) —
survives in a same-day backup. Restoring it requires a direct row `INSERT` into
`external_mcp_servers`, not the public save-form path, because the save form has no field for
injecting an already-sealed OAuth blob or already-issued tokens (see §6). The direct-row path is
lossless; the form-based path is not (see below). **I did not run either — this is a proposal for
you to execute or approve.**

## 1. Which database / table

- Live DB: `sites/tovu-com/content.db` (SQLite, WAL mode). Repo root's own `content.db` (0 bytes,
  untracked) is an unrelated decoy — ignore it.
- Table: `external_mcp_servers`, defined at `apps/website/src/platform/db/schema.ts:2246` (header
  comment above it, ~2199-2245, is the governing doc).
- Read/write path: `apps/website/src/platform/db/sqlite/external-mcp-repo.sqlite.ts`; business
  logic in `apps/website/src/assistant/external-mcp-store.ts`; delete route at
  `apps/website/src/server/inbound/admin-http/routes/external-mcp/delete.ts`.

## 2. Soft or hard delete?

**Hard delete.** No `deleted_at`/tombstone column exists on `external_mcp_servers` (confirmed by
reading the full column list in `schema.ts` and by the live schema dump below). `delete.ts:21-24`
calls `deleteExternalMcpServer({repo}, {workspaceId, serverId})`, which reaches
`external-mcp-repo.sqlite.ts:137-139`'s `deleteByServerId` — a plain `.delete(externalMcpServers)`
Drizzle call. No audit-log table records a before-image; I found no `history`/`audit` reference
anywhere under `routes/external-mcp/`.

Confirmed live: `SELECT count(*) FROM external_mcp_servers` against `file:content.db?mode=ro`
returns **0**. Higgsfield was the workspace's only row, and the table really is empty right now.

## 3. WAL / freed-page recovery — dead end on the live file

- `content.db-wal` (mtime 14:25:54) postdates `content.db` (mtime 14:17:54): the delete's
  checkpoint already landed in the main file, and the WAL now holds only later, unrelated activity.
  `command grep -ac higgsfield content.db-wal` → **0** hits.
- `content.db` itself DOES contain raw "higgsfield" bytes in unallocated space (SQLite doesn't
  zero freed pages) — but every occurrence I checked, at multiple byte offsets across the file, is
  **assistant chat transcript text** (tool descriptions and debug conversation mentioning
  `mcp__higgsfield__*` tool ids), not the roster row.
- I searched for strings that are unique to the roster row itself and would only appear there:
  the literal URL `mcp.higgsfield.ai/mcp`, the OAuth client id `DWjbUpAZxhRW2AgE`, and
  `mcp.higgsfield.ai/oauth2`. **All three returned zero matches anywhere in `content.db`.** The
  specific page(s) that held the roster row have already been overwritten by later writes.
  Freelist/page-carving the live file is not viable — there is nothing left to carve.

## 4. Backups — found, and one is very fresh

Full-copy backups/restore-points beside `content.db` (all are pre-migration safety copies written
by Jini's `SqliteDbOpsAdapter`, per `apps/website/src/platform/site-dir/layout.ts:14-18`), sorted by
recency, each queried read-only (`file:...?mode=ro`) for a live `external_mcp_servers` row where
`server_id='higgsfield'`:

| File | mtime | Row present? | Notes |
|---|---|---|---|
| `pre-chat-split-content-20260907-211456.db` | **2026-09-07 21:14:59** | **Yes, complete** | Freshest backup found. Row's own `updated_at` = `2026-09-08T02:05:27.492Z` (a token refresh), `oauth_status='connected'`. |
| `restore-point-backfill-media-slugs-wm16-...db` | 2026-09-07 10:52 | Yes, complete | Staler token snapshot (`updated_at`=`2026-09-07T04:06:26Z`), same config. |
| `content.db.bak` | 2026-09-05 20:31 | Yes | Same config, staler token. |
| `content.db.predelete.bak` | 2026-09-05 21:25 | Yes | Same config, staler token. Name is misleading — it's from an unrelated backfill script's own restore-point convention, not from today's delete. |
| `restore-point-backfill-external-mcp-aad-wm11-...db` | 2026-09-02 13:32 | Yes | Predates `write_allowed_tool_names` being set. |
| `content.db.bak-20260812-205241` | 2026-08-12 | No | Predates higgsfield's creation (`created_at`=2026-08-27). |

No backup postdates `pre-chat-split-content-20260907-211456.db` — I checked for any `*.db` file
newer than it and found only today's live `content.db`/`chat.db` and its own `chat.db` sibling
backup. `command grep -ri higgsfield` over the repo (excluding `node_modules`) turned up nothing
else load-bearing: the cited `ADS-memory/reports/2026-09-08-mcp-panel-dynamic-test.md`, these DB
files, and unrelated chat-transcript mentions.

**Schema check:** `.schema external_mcp_servers` is byte-identical between the live `content.db`
and this backup — no migration ran on this table between 2026-09-07 21:14 and now, so the backup's
row can be inserted into the live table as-is with no column mapping needed.

## 5. OAuth credential storage — what's recoverable and what isn't

- The connection's secret material is one AES-256-GCM blob:
  `oauth_sealed_key_id` / `oauth_sealed_ciphertext` / `oauth_sealed_nonce` / `oauth_sealed_alg`,
  holding `{clientSecret?, tokens?}` (`external-mcp-aad.ts` header).
- The AAD is `external-mcp-oauth:v1:${workspaceId}:${serverId}` — built **only** from the composite
  primary key (`external-mcp-aad.ts:60-67`), both halves of which are already known
  (`workspace-local` / `higgsfield`). Nothing about the AAD was lost with the row.
- The decryption root key lives **outside `content.db` entirely**:
  `apps/website/src/features/webhooks/keyring.env.ts` resolves it from the
  `TOVU_INTEGRATIONS_ROOT_KEY` env var, or else `~/.tovu/integrations-root-key.hex`, under key id
  `"v1"` — matching the row's `oauth_sealed_key_id = "v1"`. Deleting the row did not touch this key.
  `schema.ts`'s table header confirms this is the same shared sealer/keyring instance the
  Composio/BYOK/media-provider stores all reuse.
- **Conclusion:** if the row is restored byte-for-byte (all `oauth_sealed_*` columns included) from
  the backup, the app's normal decrypt-on-read path opens it exactly as it did before deletion —
  this recovers the live OAuth connection, not just the config shell. The DOM's blank
  client-secret field (noted in the earlier report) is irrelevant here — that was a UI-response
  policy, not evidence the secret was ever unrecoverable from storage.
- **Residual risk, stated plainly:** the backup's sealed blob is a snapshot from
  `updated_at=2026-09-08T02:05:27Z`, not the literal instant of deletion (deletion happened roughly
  12 hours later). Its `oauth_expires_at` is `2026-09-09T02:05:26.490Z` — the embedded access token
  is still inside its stated validity window as of now (14:28 PDT / ~21:28 UTC today). If Higgsfield
  issues single-use rotating refresh tokens and a silent refresh happened between the backup and the
  deletion, the embedded *refresh* token could be stale and fail on its next use — but the access
  token itself should keep working until ~tomorrow morning regardless. If that happens, it will
  surface later as `needs_reauth`, not as today's restore failing.
- One more live-but-non-persistent fact: `delete.ts`'s own doc says the effect "lands at the next
  daemon restart" — a still-running daemon process may still hold an already-connected in-memory
  session for higgsfield right now, independent of the DB row. That doesn't survive a restart and
  isn't a recovery path, just an explanation for why nothing may look broken yet.

## 6. `SaveExternalMcpServerInput` shape (the admin-form path — NOT what I recommend using)

From `apps/website/src/assistant/external-mcp-store.ts:907-959`. This is the shape the admin tab's
"save" submits — three-state fields follow `undefined`=keep / `string`=replace / `""`=clear.

| Field | Required? | Value from the backup |
|---|---|---|
| `workspaceId` | required | `workspace-local` |
| `serverId` | required | `higgsfield` |
| `label` | optional | `higgsfield` |
| `transport` | required | `streamable_http` |
| `authMode` | optional (defaults `static_env`) | must pass `"oauth"` explicitly for a new row |
| `enabled` | required | `true` |
| `command` | required string, ignored for `streamable_http` | `""` |
| `url` | required for `streamable_http` | `https://mcp.higgsfield.ai/mcp` |
| `args` | required, space-separated | `""` |
| `allowedToolNames` | required, comma-separated | `generate_image,models_explore,job_status,jobs_wait,show_generations,reveal_generation,show_generation_by_ids` |
| `writeAllowedToolNames` | required, comma-separated (defaults `""`) | `generate_image,reveal_generation` |
| `env` | optional | not used (no env block on this row) |
| `oauth.providerId` | optional | none (self-defined endpoints) |
| `oauth.grant` | — | `authorization_code` |
| `oauth.clientId` | — | `DWjbUpAZxhRW2AgE` |
| `oauth.clientSecret` | SECRET | **not recoverable in plaintext via this path** — see §5 |
| `oauth.scopes` | — | `openid,email,offline_access` |
| `oauth.authorizationEndpoint` | — | `https://mcp.higgsfield.ai/oauth2/authorize` |
| `oauth.tokenEndpoint` | — | `https://mcp.higgsfield.ai/oauth2/token` |
| `principalId` | required (attribution only) | e.g. `7499d195-5c75-4bfd-a13e-8e6c1f8e87da` (the principal who last touched write grants, from the backup) |

**Why this path is inferior to a direct row restore:** `SaveExternalMcpOAuthInput` has no field for
an already-sealed blob or already-issued tokens — going through the form only recreates the
*config shell*. The connection would start `disconnected`/`pending`, and the owner would have to
know the client secret AND re-run the OAuth authorize flow, even though the working, already-sealed
connection still physically exists in the backup file.

## Recommended restore (not executed — for your review)

Direct `INSERT` of the backup's exact row into the live table, generated read-only via
`sqlite3 ... ".mode insert"` against `pre-chat-split-content-20260907-211456.db` (no source file
was modified to produce this):

```sql
INSERT INTO external_mcp_servers VALUES('workspace-local','higgsfield','higgsfield','streamable_http','oauth',1,NULL,'https://mcp.higgsfield.ai/mcp','[]','["generate_image","models_explore","job_status","jobs_wait","show_generations","reveal_generation","show_generation_by_ids"]','[]',NULL,NULL,NULL,NULL,NULL,'authorization_code','DWjbUpAZxhRW2AgE','{"tokenEndpoint":"https://mcp.higgsfield.ai/oauth2/token","authorizationEndpoint":"https://mcp.higgsfield.ai/oauth2/authorize"}','["openid","email","offline_access"]','connected','2026-09-09T02:05:26.490Z',NULL,NULL,'v1','A2Cc4prg94Pvl+F6h9DuA2mC/pidFr9Bt0zGIjPZ2LgNpn8IcyoCteaQEf7nG51gtM7FmFyYKWYS4WVAz4vOZm4R3riQWbPiO/TYafx5fVy78WtT1gxlo5XhArMfdP+x6dmnBX/uJ6C+CRpAXdDzHYb3b2Rzuyn2nORwC3S/X2ggZpbEAaXGoWEiA2PRUw2EJyIjZYYp5fAxQJiBQOaUlOLB+oTTmwH+CxKgB4xGB4Pm6m7P848PZyMlw7mLxlhEh6F4VJz4Hb+8gc6y4t79EmC1fi/b7Cp/diqnLD0runFaOF69kdNSRXC/jfOYX5Gl/u/FzIAVQANtsCe84g5NcIAgmreTwu6tM7ZM1DmG','TOhBl1phA4SuZsdY','aes-256-gcm','2026-08-27T00:35:11.497Z','2026-09-08T02:05:27.492Z','["generate_image","reveal_generation"]','7499d195-5c75-4bfd-a13e-8e6c1f8e87da','2026-09-07T04:06:26.189Z',0,1);
```

Before running it: back up the LIVE `content.db` first (a fresh `.bak` copy), stop/checkpoint
awareness of the daemon (per `delete.ts`'s own comment, a restore needs a daemon restart to be
picked up), and open the live DB read-write only for this one statement — not via any script that
defaults `--db` to the live database incidentally. Whether to touch `created_at`/`updated_at` (I
left them at the backup's own values, i.e. this restores history as it was, not as "now") is a
judgment call for whoever runs it.

## What the owner must still decide / know

- If the direct-row restore is used: nothing further — config and OAuth connection both come back,
  modulo the small refresh-token-staleness risk in §5.
- If the form-based restore is used instead: the owner needs the plaintext OAuth client secret
  (not recoverable from anything I found) and must re-run the OAuth authorize flow.
