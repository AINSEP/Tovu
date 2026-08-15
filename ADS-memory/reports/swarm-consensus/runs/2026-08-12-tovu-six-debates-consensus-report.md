> # ⚠️ SUPERSEDED — DO NOT ACT ON THIS FILE
>
> This is the **interim 2-round** report. The authoritative document is
> **`2026-08-12-tovu-six-debates-FINAL.md`** in this same directory (3 rounds, audited).
>
> **This file contains claims that were later verified FALSE. Specifically:**
> - **"SQLite has no JSON type at all"** — WRONG by ~18 months. SQLite has had JSONB since 3.45; this repo's `better-sqlite3` bundles 3.49.2. Verified by probe.
> - **"Persisting JSONB is a data-durability risk because the format may change between releases"** — WRONG. `sqlite.org/jsonb.html`: *"JSONB is intended to be portable and backwards compatible for all future versions of SQLite… you should not have to export and reimport your SQLite database files when you upgrade."*
> - The **actual** reason `text("*_json")` remains the SQLite default is **tooling ergonomics** (Drizzle has no `jsonb` builder and `customType.fromDriver` cannot rewrite the SELECT), **not durability**.
> - Its Debate 3 recommendation to keep an `org.tovu.commands` extension namespace was **later reversed** (Codex reversed; the Coordinator conceded).
> - Its Debate 1 marker/manifest facts were corrected in Round 2.
>
> Retained only as an audit trail of how the positions moved. Read FINAL instead.

---

# Consensus Report — Six Tovu Architecture Debates (INTERIM, 2 rounds — SUPERSEDED)

**Date:** 2026-08-12
**Mode:** debate (2 rounds each; Round 3 pending for debates 1, 4, 5)
**Controls:** `max_rounds=2`, `min_confidence=0.90`, per-run model pins
**Primary model:** Claude Opus 5 (1M) — `claude-opus-5[1m]`
**Context packets:** `ADS-memory/reports/swarm-consensus/context/CTX-*-2026-08-12.md`
**Raw offloads:** `ADS-memory/.local-artifacts/swarm-consensus/offloads/2026-08-12-*/`

---

## The Swarm

| Role | CLI | Requested Model | Resolved Model | CLI Version | Selection Source | Status | Attempts |
|---|---|---|---|---|---|---|---|
| Primary | host | `claude-opus-5[1m]` | Claude Opus 5 (1M) | n/a | host | Responded (all rounds) | 1 |
| Peer | codex | `gpt-5.6-sol` @ `xhigh` | `gpt-5.6-sol`, `model_reasoning_effort=xhigh` | codex-cli 0.147.0 | per_run_override + session_success | Responded (11/12) | 1 |
| Peer | agy | `gemini-3.6-flash-high` | Gemini 3.6 Flash (High) | agy 1.1.12 | per_run_override, proven by `agy models` | Responded (12/12, 1 retry) | 2 |
| Peer | agy | `gemini-3.1-pro-high` | Gemini 3.1 Pro (High) | agy 1.1.12 | per_run_override, proven by `agy models` | Responded (12/12, 1 retry) | 2 |
| In-host participant | Agent tool | `sonnet` | Claude Sonnet 5 | n/a | Addition case (user-requested) | Responded (12/12) | 1 |

`gemini` CLI 0.47.0 present but unused (dead on this account). Model identity proven before dispatch; no peer ran on an inferred model.

## Dispatch Diagnostics

| CLI | Output Mode | stdout Parser | stderr Summary | Retry Notes |
|---|---|---|---|---|
| codex | json (JSONL) | `item.completed` → `agent_message` | clean; no `error`/`turn.failed` in any run | none needed |
| agy | text under `script` PTY | full stdout, ANSI-stripped | one `capacity_or_rate_limit` (3.1 Pro, R1) | 1 retry; 1 transport failure (below) |
| Agent tool | text | final message + written file | n/a | none |

**Transport failures encountered and resolved:**

1. **`agy` session bleed (R1, debate 1).** Gemini 3.6 Flash returned a fully-formed answer to a *different* packet (`CTX-agentic-frontend-control-and-tool-scale-2026-07-26`, from another repo weeks earlier), with `file://` citations into a foreign scratchpad. Its own 60s ACK probe minutes earlier had correctly returned `CTX-CODE-TIER-2026-08-12`. Classified `malformed_or_no_output` (stale-session contamination), excluded from synthesis, re-dispatched with `--new-project` plus an explicit "discard stale context / verify the packet ID" guard. Fixed. Evidence retained as `gemini-3.6-flash-round1-CONTAMINATED.txt`.
2. **`agy --print-timeout` requires a duration** (`120s`), not a bare integer — a bare integer exits 2 with a usage dump.
3. **`agy` now has `--output-format json`** and a separate `--effort` flag; the skill doc's "no JSON mode" note is stale.

---

## ⚠️ Coordinator Protocol Disclosures

Recorded because they affect how this report should be weighted.

1. **Primary Participation failure on debates 4, 5, 6.** No blind Round 1 position was frozen before dispatch for those three. Positions were written afterward and are labelled *informed, not blind* in the offloads. They should not carry equal weight to a genuine blind first pass in the agreement math for those debates. Debates 1, 2, 3 were properly frozen pre-dispatch; all six Round 2 rebuttals were frozen before reading any Round 2 output.
2. **The Coordinator supplied a false premise to Round 1 of debate 5.** The packet asserted *"SQLite has no JSON type at all."* This was wrong and ~18 months stale — SQLite has had JSONB since 3.45, and this repo's driver bundles 3.49.2. Several Round 1 answers reasoned from it. Corrected facts were reissued at the head of the Round 2 packet with an explicit correction notice.
3. **A durability finding post-dates Round 2 dispatch.** SQLite's "JSONB is for internal use only / the format may change" documentation was retrieved *after* the Round 2 packets went out. Codex and both Geminis therefore argued the storage-spelling question without it. Their divergence from the Primary and Sonnet on that point is an information gap, not a settled disagreement, and must be re-put to them in Round 3.

**Peer weighting:** per standing owner instruction (reiterated and increased 2026-08-12), both Gemini models are downweighted; a position held only by a Gemini peer with no Codex or Claude-family corroboration is flagged low-confidence rather than counted equally. Applied throughout. Note both Geminis nonetheless produced two genuine catches this session (below).

---

# Debate 1 — The `code` tier (React / Vue / Angular)

## Debate Trace

| Round | Primary (Opus 5) | Codex 5.6 Sol xhigh | Sonnet 5 | Gemini 3.6 Flash | Gemini 3.1 Pro |
|---|---|---|---|---|---|
| R1 | Option B + two-class admission | Unlisted E: source+artifact package | B+C as one design | B | B |
| R2 | **Held**, hardened: author builds, Tovu never `npm install` | **CHANGED**: R1 allowed self-hosted local rebuild → R2 rejects it on supply-chain grounds | Held: author builds locally for v1 | Held; build-time authoring, tier is wrong unit | Held; explicitly adopts two theme classes |

**Movement of record:** Codex reversed its build-lifecycle vote between rounds, attributing the change to the supply-chain argument — *"A worker or ordinary child process would not contain dependency installers, native modules, network access, or hostile package scripts."*

**Sonnet 5's independent version of the same argument**, worth preserving because it names the failure mode rather than the principle: Tovu-runs-build *"is not a smaller version of that same problem moved to build time — it's the same problem: arbitrary code execution with no allowlist, just relocated from render-time (Option A, already rejected) to build-time… unlike SSR's output-is-a-string mitigation, a build step's entire job is to execute code."* And on why gating the feature behind containment fails in practice: the repo's track record on *"a strictly smaller, strictly better-understood trust surface"* — ADR-010's CSS sanitizer — is *"not yet,"* so *"gating the feature behind containment that doesn't exist yet, in a single release, means shipping without the gate in practice."*

## Decision Ledger

| Decision Point | Opus 5 | Codex 5.6 Sol | Sonnet 5 | Gemini Flash | Gemini Pro | Agreement | Key Why / Movement |
|---|---|---|---|---|---|---|---|
| Server-side framework execution | Reject | Reject | Reject | Reject | Reject | **Yes 5/5** | `worker_threads` = resource isolation, not code isolation; no allowlist analogue for arbitrary JS |
| Implement a `code` tier at all | No | No | No | No | No | **Yes 5/5** | Framework is an authoring concern; artifact stays `static` |
| Who runs the build | Author/CI | Author/CI | Author | Author/CI | Author | **Yes 5/5** | Tovu has no arbitrary-code build boundary; CSS sanitizer still unshipped on a smaller trust surface |
| Two theme classes (authored vs built) | Yes | Yes | Yes | Yes | Yes | **Yes 5/5** | Built releases cannot preserve per-file reset or AI repair; declare it, don't degrade silently |
| `parseTier` silent coercion | Fail closed | Fail closed | — | Fail closed | — | Yes | Unknown tier currently becomes `"declarative"` and fails confusingly |
| Web Components role | Islands only | Weaker for whole-page | — | — | — | Partial | Shadow DOM fights global token injection |

**Agreement: 100% on the four load-bearing points.**

## Final Recommendation — Debate 1

Do not build a `code` tier. Frameworks become a build-time authoring path emitting the existing `static` contract. The author or publisher CI builds; Tovu verifies integrity hashes and serves the artifact, never resolving dependencies or executing package scripts. Declare two lifecycle classes explicitly. Ship a `theme verify` conformance check **before** the first framework theme — token injection is a single literal-string `.replace()` at `static-render.ts:402` that silently no-ops, so a bundler changing one byte of that `<link>` tag produces a page with no design tokens and no error. Fix `parseTier` to fail closed first, regardless.

Round 3 produces code.

---

# Debate 2 — Composer slash commands

## Decision Ledger

| Decision Point | Opus 5 | Codex | Sonnet 5 | Gemini Flash | Gemini Pro | Agreement | Key Why |
|---|---|---|---|---|---|---|---|
| Package owns mechanism, host owns effect | Yes | Yes | Yes | Yes | Yes | **Yes 5/5** | `slots.ts:77-80` forbids the package switching on a host taxonomy |
| Finish or delete | Finish | Finish | Finish | Finish | Finish | **Yes 5/5** | Parser, keyboard, ARIA and 18 tests already green |
| Option D (declared kind dispatched by package) | **Withdrawn R2** | Reject | Reject | Reject | Reject | Yes | Violates the package's own written design law |
| Port Lexical? | **No** | — | No (Option 2 ranked second) | — | — | Yes (where stated) | Argument placeholders render in the popover rows, not inline in the input |
| Trigger grammar must change | Yes | Yes | Yes | Yes | Yes | **Yes 5/5** | `^\/([^\s/]*)$` closes the palette on the first space |

**Correction accepted by the Primary:** Sonnet showed the anchored regex can be *extended* — `/^\/([^\s/]*)(?:(\s+)([\s\S]*))?$/` — keeping the draft equal to the whole trigger, so `replaceComposerSlashTrigger`'s whole-draft replacement needs **no change**. The Primary's "coupled invariants must change together" framing was over-stated; the resolution is choosing the right anchor.

**Primary error corrected by both Gemini peers:** the Primary claimed no host dispatch path existed. `AssistantDock.tsx:270-273` already dispatches (`resolveTovuComposerDiscoveryRoute` → `navigate`) and `/mcp` navigation works today. What actually remains is that `Composer.tsx:92-96` calls `setDraft` unconditionally *before* notifying the host, forcing `/mcp` to ship `insertText: ""` as a neutralizing hack.

## Final Recommendation — Debate 2

Build a **capability projection**: Tovu projects its live registry (~20 `tool-registrations.ts`/`agent-tools.ts` modules, `tool-catalog-query.ts`, MCP federation) into descriptors carrying label, description, argument schema, preview source, execute binding, and confirmation requirement. The composer renders and parses; it never learns what a skill or plugin is. Extend the trigger regex while keeping it anchored end-to-end. Stop discarding the promise at `Composer.tsx:89`. Keep the textarea — do not port Lexical on current evidence.

---

# Debate 3 — Agent Plugins → commands

## Decision Ledger

| Decision Point | Opus 5 | Codex | Sonnet 5 | Gemini Flash | Gemini Pro | Agreement | Key Why |
|---|---|---|---|---|---|---|---|
| Skills → context injection | Yes | Yes | Yes | Yes | Yes | **Yes 5/5** | A Skill is markdown: no args, no return, no side effects |
| MCP → existing federation trust layer | Yes | Yes | Yes | Yes | Yes (via D) | Yes | Only adversarially-designed answer in the codebase |
| Absorb into `.tovu-plugin` runtime (Option D) | Reject | Reject | Reject | Reject | **Accept** | 4–1 | **Structurally impossible**, verified: loader needs SHA-256 `integrity` + `sdkRange` + ESM entry; capability vocab is 3 tokens; only hook is `content.entry.beforeSave`; `adminSurfaces` "UNUSED in v1" |
| `org.tovu.commands` namespace | Metadata only | **CHANGED R2 → Reject** | Metadata only | Reject | Reject | **3–2 against** | See movement note below |
| Ship MCP execution in v1 | No | No | No | — | — | Yes | Allowlist-authorship gap unsolved |

Gemini 3.1 Pro's Option D is a **solo Gemini position contradicted by verified source** — flagged low-confidence and closed.

**Movement of record — Codex reversed on the namespace, and its reasoning collapses this debate into Debate 2.** Round 1 it accepted `extensions["org.tovu.commands"]` for presentation and binding metadata; Round 2 it rejects it: *"Once first-party tools, connectors, federated tools, Skills, and future unknown kinds all need the same projection, an Agent-Plugin-only namespace is redundant. More importantly, executable bindings and authoritative argument schemas must be produced by the host adapter, not by the package being classified."*

That second clause is the stronger argument and it generalizes the trust principle: the thing being classified must not author its own binding — the same reason a plugin cannot author its own MCP allowlist. It also means the two positions still holding "metadata only" (Primary, Sonnet) are defending a namespace that a host-owned registry makes unnecessary. **The Coordinator concedes this point**: with a source-neutral descriptor contract, an Agent-Plugin-specific namespace earns nothing that the adapter cannot supply. Recommendation below is updated accordingly.

## The Trust Gap — the debate's central unsolved problem

`mcp-federation`'s allowlist is designed to be authored by someone *other than* the thing being classified; its "self-declared hints demote only, never promote" rule only protects *within* an already-independently-vetted allowlist. A plugin-supplied `mcp.json` has no independent author. Namespacing stops impersonation but not exposure — *a namespaced `mcp__ui-ux-design__execute_sql` is still `execute_sql`*.

**Converged answer (Primary and Sonnet independently):** the **operator** is the independent author. A plugin's MCP servers land *proposed*, never admitted; enabling a plugin does not admit its tools; an operator inspects the real `mcp.json` and admits per-tool. Sonnet correctly ranks this second for v1 because no persistence or admin surface exists for it yet, and ships Skills-only with MCP servers **previewable but structurally inert** (`execute: { kind: "unavailable", reason }`) surfaced in the UI.

## Final Recommendation — Debate 3

Agent Plugins are **one adapter feeding Debate 2's capability projection**, not a parallel command system. Ship Skills as context injection. Render MCP servers as previewable and explicitly unavailable. Build operator-authored per-plugin admission before any MCP execution. **Do not define an `org.tovu.commands` extension namespace** — the host adapter produces labels, argument schemas and execute bindings from the portable components themselves, so the namespace adds a proprietary surface without adding capability, and a package must not author its own binding.

**Unanswered and upstream of everything:** what does "installed" mean? The screen says *Installed*, the only plugin is bundled, the Marketplace is inert by design, and the standard defines no install protocol.

---

# Debate 4 — Plugin system

## The finding that reframed the debate

`loader.ts:147-158`, in its own words: steps (4)–(5) — invoke `setup()` with the capability-scoped SDK, then attach declared hooks — *"are still NOT called from inside this function."* Verified: `loadPlugin()` **awaits `importModule(entryPath)` and discards the result** (`loader.ts:141-143`), and the only production caller of `attachLoadedPlugin()` is Site Glue (ADR-057), outside SPEC-005's scope. So a plugin enabled through the SPEC-005 path never runs `setup()` and never attaches its hook. AC-01 is not provable end-to-end through its documented path.

Scope corrected on inspection: this is **four working units and one missing wire**, not an unbuilt foundation.

## Decision Ledger

| Decision Point | Opus 5 | Codex | Sonnet 5 | Gemini Flash | Gemini Pro | Agreement | Key Why |
|---|---|---|---|---|---|---|---|
| Wiring is a precondition | Yes | Named as caveat | Yes (narrow, fast) | — | — | Yes | No end-to-end proof point exists without it |
| Bottleneck: trust or surface | Surface | — | Surface (more lopsidedly) | Reject C | Reject C | Split, Geminis low-confidence | One hook gates every plugin at every tier |
| Tier-2 sandbox now | Defer | Defer | Defer | Rung-1 carve-out | Rung-1 carve-out | Yes on defer | Hardening a loop that doesn't run |
| Recovery/quarantine urgency | Same batch as wiring | — | **Same batch** | — | — | Yes | EC-10 is *latent* only because nothing can attach; the fix makes it live |
| Converge all three extension systems | Reject | — | Reject | — | — | Yes | Different consumers, different risk shapes |

**Position change of record (Primary):** originally sequenced wire → recover → widen. Sonnet's observation that the wiring fix is precisely what makes EC-10 live — a throwing filter blocks *every* content save, recoverable only by a manual `PATCH` — means shipping the wire without auto-quarantine violates ADR-024's own invariant that *"no feature ships whose failure mode exceeds the current recovery rung."* Adopted: **wire + quarantine are one work item.**

## Unverified-but-checkable, carried forward

- ABI drift: spec types the filter `(entry, ctx) => ExtPatch` with no `Promise`; `hook-registry.ts:170` does `await attachment.filter(...)`. ADR-024 §3 demanded this audit *now*, while zero third parties exist.
- Shallow snapshot: `hook-registry.ts:165` spreads `{ ...entry, ext: {...} }`, leaving nested fields shared across invocations, against §3's "serializable payloads only."
- **Corrected:** a Sonnet claim that the webhook ports have zero callers was **wrong** — it grepped only its staged file set. `delivery.ts`, `subscriptions.ts`, `repo.sqlite.ts`, `repo.memory.ts` and contract tests all use them. Tier-1's webhook primitive has real backing.

## Final Recommendation — Debate 4

Sequence: **(1) wire the enable path + auto-quarantine, as one item, proven by a test that fails today**; (2) hook-catalog growth under ADR-024 §7 per-hook discipline; (3) Tier-1 primitives, webhook dispatch first because its cost is known. Tier-2 sandbox stays deferred. Audit the ABI freeze while it is still free.

---

# Debate 5 — Commerce and the tri-dialect data model

## Verified dialect facts (probe + official docs)

| Engine | `JSONB` type? | Storage | Indexing | Query path known in advance? |
|---|---|---|---|---|
| PostgreSQL | **Yes** | decomposed binary | **GIN over the document** (`jsonb_ops` / `jsonb_path_ops`) | **No** |
| MySQL 8 | No — `JSON` | binary, JSONB-equivalent | *"not indexed directly"* — generated column + B-tree, or multi-valued index | Yes |
| SQLite 3.49.2 | No type | real JSONB blob via `jsonb()` | expression index over `jsonb_extract` (verified working) | Yes |
| MariaDB | No | **`JSON` is a `LONGTEXT` alias** — text | expression/generated column only | Yes |

**⚠️ Verified trap:** `CREATE TABLE t(x JSONB)` in SQLite resolves to **NUMERIC affinity** — probed: `'123'` stored as INTEGER 123. Declaring `JSONB` is strictly worse than `BLOB`.

**⚠️ Durability finding (post-dates Round 2 dispatch):** sqlite.org states JSONB *"is intended for internal use by SQLite only… Applications should not use JSONB outside of SQLite nor try to reverse-engineer the JSONB format,"* and that the on-disk format has reserved space for future change. The bind: JSONB's speed benefit exists only if you store it, and SQLite says don't store it. The SQLite version is a property of an npm dependency — `better-sqlite3` bundles its own (3.49.2 here; the system CLI is 3.44.3, which has no JSONB at all), so an `npm update` swaps the engine under stored rows.

## Decision Ledger

| Decision Point | Opus 5 | Codex | Sonnet 5 | Gemini Flash | Gemini Pro | Agreement | Key Why |
|---|---|---|---|---|---|---|---|
| "JSONB for max flexibility" | Partly right | Partly right | Partly right | Partly right | Partly right | **Yes 5/5** | Right on storage, wrong on query flexibility — GIN is Postgres-only |
| Never index into the document | Yes | Yes | Yes | Yes | Yes | **Yes 5/5** | The only non-portable part |
| SQLite storage spelling | `text` (after durability finding) | `jsonb()` BLOB eventually | `text` | binary where available | opaque payloads only | **Split — information gap** | Codex/Geminis answered without the durability finding |
| MariaDB | Out | Unsupported | Out | — | **Out, explicitly** | **Yes** | LONGTEXT; breaks MySQL replication on JSON columns |
| Products vs `member_tiers` | Extend | — | **Separate + FK** | — | — | Split | `welcomePagePath`/`visibleInPortal` are access-grant concepts |
| Sequencing | Vertical slice | — | Vertical slice | — | — | Yes | No code path writes a commerce row in any dialect today |

## Final Recommendation — Debate 5

Relational core; JSON documents for provider-owned payloads only; **never indexed**. Review-time rule: *if a query, index, constraint, join or sort will ever touch it, it is a column; if it is read back whole by id, it is a document.* Keep `text("*_json")` on SQLite (durability); `jsonb` on Postgres and `JSON` on MySQL are safe. **MariaDB out of scope.** Idempotency via `(provider, event_id)` UNIQUE **plus** an atomic ordering guard — `UPDATE … WHERE id = ? AND provider_event_at < ?` — since `version` is local optimistic concurrency, not source ordering. Do not copy Open SaaS's webhook handler: `updateUserCredits` increments per delivery with zero event-id dedup, and Stripe delivers at-least-once.

Round 3 must re-put the durability finding to Codex and both Geminis.

---

# Debate 6 — Deployments

## Decision Ledger

| Decision Point | Opus 5 | Codex | Sonnet 5 | Gemini Flash | Gemini Pro | Agreement | Key Why |
|---|---|---|---|---|---|---|---|
| "Just MCP, tokens + base URLs" | Reject | Reject | Reject | Reject | Reject | **Yes 5/5** | MCP here is stdio **subprocess**, and `HttpClientPort`/`EgressPolicy` appear **zero times** in `mcp-federation/` |
| Default transport | Guarded HTTP adapters | Guarded HTTP adapters | Guarded HTTP adapters | Outbound export | Outbound export | Yes | Reuses SSRF/DNS-pinning protections |
| MCP's role | Adapter choice, never the definition | Same | Same | Same | Same | **Yes 5/5** | |
| GitHub | **App + installation tokens** | — | **App + installation tokens** | — | — | Yes | Repo-scoped, ≤1h, revocable, not bound to a person; `gh` inherits a human's global credential and bypasses `EgressPolicy` |
| Durable run records | Yes | Yes | Yes | — | — | Yes | `module-status.ts` is a boot snapshot, not a run store |
| Callback never supplies workspace | Yes | Yes | Yes | — | — | Yes | Resolve `(providerId, providerRunRef)` → run → workspace |
| First slice | Orchestrate external deploy of an existing artifact | Same | Same | — | — | Yes | CLI has only `init`/`serve`/`introspect` — no build/export exists |

**⚠️ Code correction for Round 3:** the Sonnet adapter assumed `EgressPolicy` has `allowedHosts` and `followRedirects`, and called `http.request(...)`. The **real** contract is `allowedSchemes`, `denyPrivateAddresses`, `devHostAllowlist` (an *exemption* list, not a restriction list), `maxRedirects`, `connectTimeoutMs`, `maxResponseBytes`, `maxDecompressedBytes` — and `HttpClientPort.send(request)`. **There is no host pinning in the policy**, so "this adapter can only reach api.github.com" must be asserted *in the adapter*. The subagent flagged its own uncertainty here rather than bluffing; the design survives, the code does not.

## Final Recommendation — Debate 6

Deployment = promoting an immutable, workspace-scoped release to a named environment through a configured target, tracked to a terminal outcome in durable run records. Provider-neutral port + adapters over the guarded `HttpClientPort`, with origin asserted in the adapter. GitHub via a GitHub App with installation tokens. First slice orchestrates an external deployment of a pre-existing artifact, and the UI says so — Tovu cannot build a site today.

---

## Unresolved Deltas (all debates)

1. **Debate 5 storage spelling** — information gap, not disagreement. Re-put the SQLite durability finding to Codex and both Geminis in Round 3.
2. **Debate 5 products vs member_tiers** — Primary says extend, Sonnet says separate + FK. Genuinely open.
3. ~~**Debate 3 extension namespace**~~ — **RESOLVED in Round 2.** Codex reversed to reject; the Coordinator conceded. Both Geminis had it right in Round 1, which is a case where the downweighted peers reached the correct answer first and the argument for it only arrived later from Codex.
4. **Debate 2 whether `/search` executes via a host route or the agent CLI** — determines whether real execution is possible or everything is a structured prompt.
5. **Debate 4 trust-vs-surface** — Geminis reject hook-catalog growth on execution-model grounds; Sonnet argues that conflates catalog breadth with Tier-3's in-process model. Low-confidence Gemini position.

## Method note

Five separate confidently-stated claims proved false on inspection this session: three stale "TDD-certified stub / intentionally throws" headers over fully-implemented bodies (`discovery.ts:19`, `manifest.ts:22`, `hook-registry.ts:37`, `capability-sdk.ts:26`); a `hook-registry.ts` comment that asserted a caller which did not exist (already corrected in-tree, "verified false"); the Coordinator's own "SQLite has no JSON type"; a subagent's "webhook ports have zero callers"; and a subagent's "both Gemini peers return textually identical output." Verification earned its cost at roughly every other check.
