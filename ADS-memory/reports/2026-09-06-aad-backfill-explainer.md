# What the AAD backfill scripts are, and whether you need to care

**For:** Leona
**Date:** 2026-09-06
**Status:** Explanation + one recommendation. Nothing was run. No script was executed against any database, dry run or otherwise.

---

## The short answer

**There is nothing to backfill on your live database.** Every sealed credential row in
`sites/tovu-com/content.db` is already at the current AAD version. All six scripts would print
"0 to migrate" and exit 0. They are historical tooling, not pending work.

There is one real footgun worth fixing, described at the bottom.

---

## 1. What "AAD" means here, in plain language

Your database stores secrets — API keys, OAuth tokens, connector credentials — **encrypted**, not in
the clear. The encryption used is AES-GCM, which does two jobs at once: it hides the contents, and
it detects tampering.

AAD ("additional authenticated data") is a third thing you can hand the encryption alongside the
secret. It is **not encrypted and not stored** — it is context that gets *bound into the seal*. To
open the blob later, you must supply the exact same context. Get it wrong and decryption fails
loudly rather than returning wrong data.

**Why that matters concretely.** Without AAD, a sealed blob is a portable brick of ciphertext.
Anyone who can write to the database could copy the `sealed_ciphertext` from workspace A's row into
workspace B's row, and the server would decrypt it happily — workspace B now runs on workspace A's
credentials. With the workspace and row identity bound in as AAD, that copied blob simply refuses to
open. It stops *relocation* attacks, which encryption alone does not.

So: newer code seals with AAD. Rows sealed by older code have no AAD binding. The backfill scripts
walk those old rows, decrypt each one under the old rules, re-seal the *same plaintext* under the
new rules, verify it reads back, and stamp an `aad_version` column so nobody re-does it.

There are six, one per credential store, because each store binds different context and lives in a
different table:

| Script | Table it repairs |
|---|---|
| `backfill-composio-config-aad.ts` | `composio_config` |
| `backfill-connector-credential-aad.ts` | `composio_connector_credentials` |
| `backfill-execution-credential-aad.ts` | `admin_execution_credentials` |
| `backfill-external-mcp-aad.ts` | `external_mcp_servers` |
| `backfill-media-provider-credential-aad.ts` | `media_provider_credentials` |
| `backfill-site-assistant-credential-aad.ts` | `site_assistant_credentials` |

They share one engine, `development/scripts/aad-backfill-runner.ts`, extracted tonight across nine
commits. What deliberately stayed per-script: which rows count as pending, which AAD builder
applies, the shape of the write, and every operator-facing string.

## 2. What "external MCP" is, and why it has its own script

MCP servers are outside tool providers that Tovu federates into the site assistant's tool list — the
mechanism behind `apps/website/src/assistant/mcp-federation/`. `external_mcp_servers` is where each
configured server lives, including its secrets, which is why it needs sealing and therefore a
backfill of its own.

**Your one row is Higgsfield** — `https://mcp.higgsfield.ai/mcp`, streamable HTTP, OAuth, connected.

It is genuinely shaped differently from the other five stores, and this is load-bearing:

1. **Two independent sealed blobs per row.** `sealed_*` holds the env block; `oauth_sealed_*` holds
   `{clientSecret?, tokens?}`. Different secret classes, written by different flows, different AAD,
   **separate version columns** (`aad_version` and `oauth_aad_version`). A row can legitimately need
   one migrated and not the other.
2. **It was not in the original five.** The table had no `aad_version` column at all until migration
   `0056_redundant_killraven`, so there was nothing to migrate *to* before that landed.

## 3. Have they been run? Is there stale data in your database right now?

I read `sites/tovu-com/content.db` read-only and counted sealed rows against their version columns:

| Store | Sealed rows | Still at `aad_version` 0 |
|---|---|---|
| `composio_connector_credentials` | 0 | — |
| `admin_execution_credentials` | 1 | **0** |
| `site_assistant_credentials` | 1 | **0** |
| `media_provider_credentials` | 0 | — |
| `external_mcp_servers` (env blob) | 0 | — |
| `external_mcp_servers` (oauth blob) | 1 | **0** |

**Three sealed rows exist. All three are already bound.** Zero stale, zero unsealed, nothing
pending. Your Higgsfield OAuth token is at `oauth_aad_version` 1.

Two honest caveats: this measures your `tovu-com` site database only — other site databases, if any
carry credentials, were not inspected. And "already at version 1" is consistent with either the
scripts having been run, or the rows simply having been written by post-AAD code in the first place;
I cannot tell those apart from the data, and it does not change the answer.

## 4. The `--db` discrepancy — the thing that got escalated

Five scripts default `--db` to `<repo>/infra/content.db`. **`infra/` does not exist in this
repository, and that is the entire point.** `backfill-db-path.ts` refuses to create a missing
database, with this message:

> content database not found at … — refusing to create one. An empty database would report zero rows
> to migrate and look like success.

That guard exists because of a real prior bug: the scripts used to *create* the empty database, find
nothing in it, and print a clean all-clear about data they had never read. A security script
manufacturing a false negative is worse than one that fails. So for five scripts, forgetting `--db`
gives you a loud, clear error.

`backfill-external-mcp-aad.ts:55` defaults to `sites/tovu-com/content.db` instead — **your live
database**, a file that exists. Forgetting `--db` there does not error. It silently proceeds against
production.

**Is that deliberate?** The refactor agent found this, flagged it, and deliberately preserved it
rather than normalising it — the right call, since silently changing a credential script's default
database would be worse than leaving it. Its note in `parseAadBackfillArgs` records the difference
plainly. But the *original* asymmetry looks like drift, not design: `backfill-db-path.ts`'s own
header says "**All five** scripts defaulted to `infra/content.db`", written when there were five.
External-MCP arrived later and did not pick up the convention. Its genuine differences — two blobs
per row, its own version constant — explain its `loadPending()` and `write()`, but none of them
explain a different default database.

**One correction to what you may have been told:** a dry run on these scripts *is* read-only. The
runner opens via `openContentDbReadOnly` when `--apply` is absent, specifically so a dry run cannot
migrate or write the bootstrap watermark row — that was fixed in `c412bc75`. The general repo rule
that migrations auto-apply on open is true, but these six scripts are the exception that was
explicitly hardened against it. `--apply` additionally requires `TOVU_INTEGRATIONS_ROOT_KEY` to
match the live server's root key.

So the live risk is narrow but real: running **`--apply` without `--db`** re-seals rows in your
production database when you believed you were pointed at a fixture.

### Recommendation

Make `backfill-external-mcp-aad.ts` match its five siblings — default to the non-existent path so
the guard forces an explicit `--db`. It costs nothing (the correct invocation always passes `--db`
anyway) and removes the one asymmetry that can hurt you.

This is a **behaviour change to credential tooling**, so if you want it: separate commit, named as
such in the message, no other changes riding along. Say the word and I will dispatch it.

---

## Evidence

- `development/scripts/backfill-db-path.ts` — the guard and its rationale
- `development/scripts/aad-backfill-runner.ts:40-51` — arg parsing and the documented default-path difference
- `development/scripts/aad-backfill-runner.ts:185-190` — read-only open on dry run
- `development/scripts/backfill-external-mcp-aad.ts:55` — the live-DB default
- `development/scripts/backfill-external-mcp-aad.ts:1-35` — the two-blob shape and usage
- `ADS-memory/reports/2026-09-06-fix-aad-backfill.md` — the nine-commit consolidation
- Row counts: read-only `sqlite3` queries against `sites/tovu-com/content.db`
