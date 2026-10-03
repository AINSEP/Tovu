# S0 spike — can two processes share one PGlite over `@electric-sql/pglite-socket`?

Date: 2026-09-28 · Plan row S0 of `ADS-memory/.local-artifacts/plans/2026-09-28-storage-adapter-plan.md`
Spike code (gitignored): `ADS-memory/.local-artifacts/spikes/s0-pglite-socket/` — PGlite 0.5.8, pglite-socket 0.2.11, pg 8, Node 24.2, macOS 13 (x64).

## Verdict: GO, with conditions

The model works: the API process owns PGlite and serves it on a Unix socket, and other processes connect with plain `pg`. Transactions from different clients were isolated. No lost updates. Data survived kill -9. Reopen is fast.

But the stock package has **one bug that returns wrong query results**, plus design constraints that the kernel must enforce. Conditions 1–3 are required before R1 ships. The fallback (embedded-postgres, D1) is not needed.

### Required conditions

1. **Fix the extra ReadyForQuery (wrong-answer bug).** PGlite 0.5.8 core handles an error in an extended-protocol message (Parse/Bind/Execute) by sending `ErrorResponse + ReadyForQuery` right away. The later `Sync` then sends a *second* `ReadyForQuery`. Raw frames were `1 E Z Z`; Postgres sends `1 E Z`. This happens in core PGlite, both per-message and batched (`repro-core.mjs`). Over the socket, **every later query on that connection gets the answer to the query before it** (`repro-shift.mjs`: asked a/b/c/d, got "(no rows)"/a/b/c). The data loader also failed on it: ROLLBACK after a failed insert returned `25P02`. How often it shows depends on timing: a `pg.Pool` usually hides it (0/5 600 wrong in `test-err.mjs` even without the fix). But a direct `ROLLBACK` in a catch block triggers it. **Fix (proven):** in the owner, drop `Z` frames from PGlite's answer to any typed message other than `Sync`/`Query` (`owner.mjs`, `FIX_RFQ`, ~15 lines). With the fix, every repro is correct and all suites stay green. The fix needs a pinned PGlite version and a regression test (the raw-frame check in `repro-shift.mjs`).
2. **The owner must not query PGlite in-process while it serves the socket.** The multiplexer's transaction affinity only covers socket clients. An in-process `db.query` from the owner ran *inside another client's open transaction*. It read that client's uncommitted row (dirty read). Its own INSERT **was silently lost** when that client died and its transaction rolled back (`test-isolation.mjs` 1d). The owner must reach the database the same way as everyone else: over its own socket, or through the same queue. Over the socket is no slower (see latency).
3. **Vendor and patch the handler instead of depending on the package as-is.** The server is ~300 lines of Apache-2.0 code. Besides the fix in condition 1, code reading found a wedge: if `execProtocolRawStream` throws, `processQueue` returns without resetting `processing = true`, and **no later query from anyone is ever processed**. This was not triggered in the spike. There is also no idle/transaction timeout by default (`idleTimeout: 0`). Vendoring also drops the 7 extension packages, which only the CLI's `-e` flag uses.

### Constraints the kernel must respect (by design, not bugs)

- **One transaction at a time, database-wide.** While a client has a transaction open, every other client waits, **including the connect/startup handshake**. A client that sat idle in a transaction blocked a probe for the whole 3 s window. When that client was killed with SIGKILL, the server rolled back and released the others within **10 ms**. A long-running transaction starves everyone: autocommit writes made 0 progress while `bigTx` ran. So the socket transport should use `oneConnection` / turn-lock semantics like the PGlite driver, not the node-postgres "concurrent transactions" assumption. A pool larger than 1 per client process gives no parallelism. Keep daemon transactions short, and add a server-side idle-in-transaction timeout.
- **One Postgres session is shared by all clients** (`session-bleed.mjs`, `pg_backend_pid()` = 42 for both clients). Client A's `SET search_path` and `SET statement_timeout` were visible to B. A's temp tables were visible to B. Named prepared statements collide ("prepared statement "s1" already exists"). **Session advisory locks give no mutual exclusion** (both clients got `pg_try_advisory_lock(42)`). Rules: use `SET LOCAL` only, no named prepared statements, no temp tables, no session-level locks. The kernel's `pg_advisory_xact_lock` is harmless, but redundant here because transactions are already serialized.
- **Socket path ≤ 104 bytes on macOS** (`sun_path`). The spike's path was 96 bytes. Site directories can be deeper than that, so put the socket in a short runtime dir, not the site dir.
- **Durability: fsync does nothing in PGlite on Node.** `defaultStartParams` includes `-F` (fsync off). Even without `-F`, emscripten NODEFS has no `fsync` stream op, so `_fd_sync` returns 0. Commits survive a process crash (proven below) but are **not guaranteed across an OS crash or power loss**. This applies to PGlite in general, not just the socket, and is roughly SQLite with `synchronous=OFF`. It belongs in the storage ADR. It does not block S0.

## Evidence

### 1. Isolation — two client processes (`test-isolation.mjs`; ran with and without the fix, same results)

| Check | Result |
|---|---|
| A: BEGIN, write, hold 1.5 s, write, COMMIT; B reads meanwhile | B blocked until A committed; saw `[a1,a2]`, never a partial state |
| B: BEGIN, write, ROLLBACK | Nothing leaked: `[a1,a2]` |
| Lost updates: 2 processes × pool 4, 800 read-modify-write transactions, 20% rolled back | 640 committed, final value 640, **0 lost**, 0 errors |
| Extended-protocol interleaving: 2 processes × pool 4 × 2 000 parameterized queries with different shapes | **0 wrong**, 0 errors |
| Same, with 1 in 7 queries failing on purpose (`test-err.mjs`) | 0 wrong (pool evicts the desynced client; see condition 1 for the direct-client case) |
| Client idle in a transaction | Blocks everyone; SIGKILL of that client → rollback + release in 10 ms |
| Owner in-process query during a client transaction | **Dirty read + lost write** (condition 2) |

### 2. kill -9 of the owner mid-write (`test-crash.mjs`, 4 rounds, with the fix; an earlier unfixed run matched)

| Round | In flight when killed | Acked by client | Rows after reopen | Acked-but-missing | Uncommitted rows survived | Reopen | Client back after |
|---|---|---|---|---|---|---|---|
| 1 | autocommit writer | 876 | 876 | 0 | – | 0.52 s | 0.85 s |
| 2 | writer + big open transaction | 336 | 336 | 0 | 0 | 0.50 s | 0.64 s |
| 3 | autocommit writer | 1 483 | 1 483 | 0 | – | 0.58 s | 0.84 s |
| 4 | writer + big open transaction | 352 | 352 | 0 | 0 | 0.51 s | 0.84 s |

There were no torn rows. The dev-site content survived all crashes (entries 29, agent_tool_attempts 4 315, entry_revisions 90). A retrying `pg.Pool` reconnected without help. In the unfixed run, reopen took 0.6–1.8 s. Opening a new data dir for the first time (initdb) took about 21 s.

### 3. Memory and latency

Data: the dev site's `content.db`, copied through `sqlite3 -readonly .backup` (the original was not touched). It was loaded over the socket into the frozen `POSTGRES_BASELINE` (256 statements, 92 tables, 2.4 s), then 9 866 rows in 3.2 s, for a 19 MB database. A 20× synthetic copy (193 660 rows, 132 MB) was used for RSS.

**Owner RSS: about 340–410 MB, flat with data size.** Bare Node is 38 MB, and PGlite adds about 300 MB (WASM heap). The fresh DB was 359–407 MB; after the 1× load and bench, 337–408 MB; after the 20× load and scans, 388–398 MB. Cutting `shared_buffers` from 160 MB to 16 MB did not lower it (419 MB). This cost already exists for any PGlite site. Sharing means the daemon does **not** pay it a second time.

Latency in ms, p50 / p95 (1 000 reads, 250 scans, 300 write transactions; `bench.mjs`):

| Query | SQLite (WAL, sync=NORMAL) | PGlite in-process | pg over socket (separate process) |
|---|---|---|---|
| Point read by id | 0.055 / 0.145 | 0.75 / 4.70 | 0.67 / 1.95 |
| List 20, ordered | 0.074 / 0.151 | 0.98 / 4.80 | 0.62 / 0.94 |
| GROUP BY over 4.3k rows | 2.5 / 16.6 | 5.1 / 18.7 | 3.7 / 4.8 |
| Transaction: UPDATE + INSERT | 0.14 / 0.75 | 2.0 / 5.4 | 1.57 / 2.9 |

The socket is **not slower** than in-process PGlite; its tail latency was better in this run. Both are about 10× SQLite, but still sub-millisecond to low-millisecond, which is fine for CMS traffic.

### 3b. Memory floor (`memfloor.mjs`, Node 24.2, PGlite 0.5.8, macOS `footprint`)

**§3's 340–410 MB was a transient, not the floor.** It is V8 TurboFan recompiling hot PGlite WASM functions in the background right after open/first queries (physical-footprint peak 600–715 MB). It is freed within ~10 s. Steady physical footprint with default settings is **~245 MB**, and **~100–120 MB** with small `shared_buffers`. RSS overcounts by 20–40 MB against `footprint`.

One PGlite, existing data dir unless noted, a few reads/writes, then a 20x load (200 000 rows, 155 MB DB, GROUP BY, index build, LIKE scan). Footprint in MB; "idle" = 10 s after the step. Bare Node = 18.

| Config | WASM memory | open | after r/w (peak) | r/w + idle | 20x load + idle | point read / GROUP BY (155 MB DB) |
|---|---|---|---|---|---|---|
| defaults (shared_buffers 160 MB) | 189 | 433 | 715 | 241 | **245** | 0.7 ms / 75 ms |
| shared_buffers=16MB | 128 | 235 | 483 | 115 | **121** | 3.0 ms / 210 ms |
| sb 8MB + work_mem 1MB, maint 8MB, wal 256kB, max_connections 1 | 128 | 228 | 415 | 106 | **110** | 5.1 ms / 611 ms |
| sb 1MB + work_mem 256kB, maint 1MB, max_connections 1 | 128 | 334 | 490 | 101 | **97** | 2.5 ms / 808 ms |
| **recommended** (sb 16MB, work_mem 1MB, maint 8MB, wal 256kB, max_connections 1; preset `rec`) | 128 | 238 | 446 | 112 | **118** | 4.6 ms / 362 ms |
| `--liftoff-only`, defaults | 189 | 226 | 228 | 228 | 233 | 1.2 ms / 229 ms |
| `--liftoff-only`, sb 1MB set | 128 | 84 | 88 (no peak) | 88 | **84** | 1.4 ms / 526 ms |
| first-time initdb, sb16 | 128 | 168 (open 17 s) | 159 | 127 | – | – |

Findings:
- **`initialMemory` cannot go below 128 MB.** `pglite.wasm` declares a minimum of 2048 pages; 64/32/16 MB all fail with `LinkError: memory import has N pages which is smaller than the declared initial of 2048`. Only ~37 MB of those 128 MB is resident (vmmap "Memory Tag 255"), so it is not the cost.
- **`shared_buffers` is the real knob.** The default 160 MB grows WASM memory to 189 MB and keeps ~245 MB steady; 16 MB halves that. The spike's 16 MB test in §3 read RSS during the compile spike, so it looked like no change.
- **Compiled code is small at rest.** Compiling the 10 MB module alone adds 11 MB (lazy). The ~300 MB is compiler working memory during tier-up, not kept code. `--liftoff-only` removes the spike (peak 92 MB) at ~1.5–3x slower queries. `--no-wasm-tier-up` does not remove it.
- **initdb leaves ~15–20 MB extra** at idle (127 vs ~110 MB) and costs 4–17 s once; nothing large stays loaded.
- Latency columns are one run each and noisy. For the real 19 MB site DB, 16–32 MB of shared_buffers holds the whole DB.

**Lowest safe config:** `startParams: [...PGlite.defaultStartParams, "-c","shared_buffers=16MB", "-c","work_mem=1MB", "-c","maintenance_work_mem=8MB", "-c","wal_buffers=256kB", "-c","max_connections=1"]` (the `rec` row, run end to end). Steady **~110–120 MB** physical footprint, of which ~18 MB is Node. It passed the reads/writes and the 20x load. The absolute floor is ~84 MB (`--liftoff-only` + sb 1 MB), at a speed cost. The 400–700 MB startup peak stays unless `--liftoff-only` is used; plan for it as headroom, not steady state.

### 4. Package cost (desktop bundle)

| Package | Size |
|---|---|
| `@electric-sql/pglite` (already a repo dependency) | 25 MB |
| `@electric-sql/pglite-socket` | 404 KB |
| 7 extension packages it pulls in (age, pgtap, pg_ivm, pgvector, pg_uuidv7, pg_hashids, pg_textsearch) | 852 KB total (only the CLI `-e` flag uses them) |
| `pg` + deps (already a repo dependency) | 764 KB |

Net new cost is **about 1.3 MB**, or about 0.4 MB if vendored without the extensions.

### Fallback (for reference only; not needed)

`embedded-postgres` 18.4.0-beta.17 is **148 MB unpacked per platform** (`@embedded-postgres/darwin-arm64` and `darwin-x64`, from `npm view`). It was not installed, and its startup time was not measured because S0 passed.

## Files

- `owner.mjs`: the owner process, with the `FIX_RFQ` wire fix.
- `client.mjs`: client scenarios.
- `lib.mjs`: harness helpers.
- `load.mts`: baseline DDL plus data copy over the socket.
- `test-isolation.mjs`, `test-crash.mjs`, `test-err.mjs`, `bench.mjs`: the test suites.
- `repro-shift.mjs`, `repro-core.mjs`, `repro-rollback.mjs`, `repro-kill.mjs`, `session-bleed.mjs`, `mem.mjs`, `fsync.mjs`: focused checks.
- `memfloor.mjs`: §3b memory floor (`node --expose-gc [--liftoff-only] memfloor.mjs <dir> [initialMemoryMB] [default|sb16|sb8|rec|sb1] [load]`, `SLEEP=ms`, `VMMAP=1`).

Data copies and PGlite data dirs were deleted after the run. To regenerate them, run `load.mts` against a fresh `sqlite3 -readonly .backup` copy.
