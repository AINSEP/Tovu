# FINAL Consensus Report — Six Tovu Architecture Debates

**Date:** 2026-08-12
**Mode:** debate, 3 rounds (Round 1 blind → Round 2 informed → Round 3 informed + researched + code)
**Primary:** Claude Opus 5 (1M)
**Peers:** Codex GPT-5.6 Sol @ xhigh · Gemini 3.6 Flash (High) · Gemini 3.1 Pro (High) · Claude Sonnet 5 (in-host, Addition case)
**Responses:** 72 of 72 — complete. Every response ACK'd its packet ID and carried the `<<SWARM_END>>` marker; one Gemini capacity failure was retried, one contaminated Gemini run was excluded and re-dispatched, and one truncated Codex persist was repaired and its round re-run.
**Evidence:** `ADS-memory/reports/swarm-consensus/offloads/2026-08-12-*/` — 112 files, all 72 responses across three rounds, plus the raw peer transcripts and the contaminated-run evidence. (Originally written to the gitignored `ADS-memory/.local-artifacts/swarm-consensus/offloads/`; copied to this committable path after the run.)
**Packets:** `ADS-memory/reports/swarm-consensus/context/`

Supersedes the 2-round interim report in this directory where they differ.

---

## How to read this

Every recommendation below survived three rounds, adversarial critique of actual code, and independent verification by the Coordinator against source. Where a position changed, the trigger is named. Where a claim turned out false, it is recorded rather than quietly dropped — that list is at the end and is arguably the most transferable output.

**Peer weighting:** both Gemini models are downweighted per standing owner instruction. Applied. Note also a Round 3 compliance split: research was mandatory, and Gemini 3.6 Flash complied (6/3/8/5/7 citations across debates) while **Gemini 3.1 Pro largely did not** (0 on code-tier, 0 on agent-plugins, 1 on slash). Weight its Round 3 claims accordingly.

---

# 1 — The `code` tier (React / Vue / Angular)

**RECOMMENDATION: don't build a `code` tier. Frameworks compile at build time to the existing `static` contract.**

- **The author or publisher CI builds. Tovu never runs `npm install`.** 5/5, with Codex reversing its Round 1 position explicitly on the supply-chain argument. The decisive framing (Sonnet): a build step's *entire job* is to execute code, so unlike SSR it has no "output is just a string" mitigation. Rejecting worker-sandboxed SSR and then accepting a stranger's `postinstall` is incoherent.
- **Two lifecycle classes, declared:** *authored* themes (mutable, AI-editable, per-file reset — all 7 live themes) and *built releases* (immutable, versioned, editor-read-only, restored atomically). A built theme's **source** keeps per-file reset and AI-authorability; only its **generated tree** loses granularity.
- **SEO — answered with evidence, not reasoning.** Compile-to-static is SSG, not CSR: crawlers get complete HTML. Verified: Googlebot renders JS on a delayed second pass; Bingbot is partial; **GPTBot, ClaudeBot and PerplexityBot execute no JavaScript at all.** So the constraint is: **an island may only add interactivity on top of content already present in the shipped HTML — never be what first-paints content.** That's Astro's own documented model, adopted rather than invented, and enforced at the install gate (an island-marked element must have non-empty content in the raw artifact), not as an ignorable lint.
- **Ship the conformance check before the first framework theme.** Token injection is a single literal-string `.replace()` on `'<link rel="stylesheet" href="../css/styles.css" />'` (`static-render.ts:402`) that **silently no-ops**; asset rewriting hardcodes double-quoted `../css/` and `../js/`. A bundler changing one byte produces a page with no design tokens and no error.
- **Fix `parseTier` to fail closed** — unknown tiers currently coerce to `"declarative"`.
- **Manifest:** a structured `build` object (source, framework, sourceDir, builderVersion, lockfileHash, artifactHashes) **orthogonal to `tier`**, plus the new `author` field. Verified: no `author` field exists today. Keeping it off `tier` means no request-time branch changes.
- **Web Components: islands only.** Declarative shadow DOM fights document-level token injection.
- **React first** (the admin already runs React 19 + Vite 7, so the toolchain exists), Vue second, Angular last.

**Open, and it should gate any Angular promise:** nobody could confirm Angular can emit the literal unhashed `../css/styles.css` sentinel even with `outputHashing: none`. Flagged honestly rather than assumed.

---

# 2 — Composer slash commands

**RECOMMENDATION: build a capability projection. Package owns mechanism, host owns effect.**

- **5/5 on the split**, and on finishing rather than deleting. `slots.ts:77-80` is a written design law: the package never switches on a host taxonomy.
- **Do not port Lexical.** Settled by evidence, not inference: Open Design's own `TriggerPlugin` uses `/^\/([^\s/]*)$/` — **the identical anchored no-argument regex Jini already has** — and loses its popover on a space too. Its `<server-id>`/`<query>` hints are static `argHint` description text. Its live filtered picker lives in the **plus menu**, never the slash trigger. Porting buys atomic mention pills and nothing this debate needs.
- **Extend the regex while keeping it anchored end-to-end** — `/^\/([^\s/]*)(?:(\s+)([\s\S]*))?$/`. The draft still contains nothing but the trigger, so whole-draft replacement stays safe and needs no change. *(The Coordinator's "coupled invariants must change together" framing was over-stated and is withdrawn.)*
- **Reject the `range: [start,end]` tuple** both Geminis and Codex proposed. Verified across all three designs: it is only ever `[0, draft.length]`, because every parser still anchors at position 0. Dead generality. It becomes correct the day a trigger can start mid-draft.
- **Fix the discarded promise** at `Composer.tsx:89` (`void slots?.onDiscoverySelect?.(...)`), add a re-entrancy guard, and compare the **live** draft (not a pre-await snapshot) for staleness. Do **not** toggle `disabled` (breaks the ARIA combobox focus contract) or `readOnly` (inconsistent AT exposure; TalkBack announces it as "disabled").
- **Replace the four hardcoded `TOVU_COMPOSER_DISCOVERY_GROUPS` entries with an async projection.** Registry enumeration must be async because `tool-registrations.ts` is server-side; model it on this file's own working `fetchAgents()` pattern.
- **Exact-match the command once an argument is typed** — substring matching would keep `/mcp-docs` alive while typing `/mcp supabase` and could hand the wrong handler an argument.

## ⚠️ Coordinator correction — this reverses a Round 3 peer conclusion

A Round 3 peer concluded `/search` can *only* compose text for the agent, because tool execution originates solely in the agent CLI. That is half right and the missing half matters.

`/api/delegated-tool-calls` is indeed agent-CLI-only — *"its only legitimate caller is this run's own spawned `jini-mcp`"* (`agent-daemon-server.ts:578`). **But a second, browser-callable path exists and is already wired in the very file the peer was reading:** `AssistantDock.tsx:72` passes `createMcpUiToolCaller("", { path: "/api/admin/v1/mcp-ui/tool-calls" })`. That route is *"the one legal call site… that turns a browser-authenticated answer into either an exchange delivery or `toolExecutor.execute(...)` — the exact same call a model-issued tool invocation makes."* It is deliberately not run-scoped, so it survives the raising run finishing.

It is gated by a **per-tool allowlist** (`mcp-ui-tool-calls-route.ts:185`, `TOOL_NOT_ALLOWLISTED`), the daemon bearer gate, an admin-session check in the proxy, and a `PendingConfirmationStore` token.

**Consequences:** `/search` **can** execute directly, provided its tool is added to the MCP-UI-redeemable allowlist — a deliberate trust decision, correctly shaped. And **Codex's `ComposerHostBinding` execute-binding dispatch is not dead generality**: there are two genuine binding types (compose-text, allowlisted-tool-call), so the union has something real to switch on. The route is already confirmation-shaped, which maps onto the `needsConfirmation` descriptor field every design independently proposed.

---

# 3 — Agent Plugins → commands

**RECOMMENDATION: Agent Plugins are one adapter feeding debate 2's projection, not a parallel command system.**

- **Skills → context injection.** No trust model needed; a Skill is markdown with no arguments, return value, or side effects.
- **MCP servers → previewable but structurally inert** in v1 (`execute: { kind: "unavailable", reason }`), with the reason surfaced in the UI.
- **Absorbing into the `.tovu-plugin` runtime is impossible, not merely unwise** — verified: the loader requires per-file SHA-256 `integrity`, an `sdkRange`, and an ESM entry; the capability vocabulary is three tokens; the only hook is `content.entry.beforeSave`; `adminSurfaces` is *"UNUSED in v1"*. (Owner has also settled this independently.)
- **No `org.tovu.commands` namespace.** Codex reversed to reject in Round 2 and the Coordinator conceded. The reason generalizes the trust principle: *executable bindings and argument schemas must be produced by the host adapter, not by the package being classified* — the same rule that forbids a plugin authoring its own MCP allowlist.

**Install layout — Coordinator's proposal was wrong and is withdrawn.** I proposed `infra/agent-plugins/ws/<workspaceId>/<pluginId>/`. Verified against source, that contradicts Tovu's own pattern: `discovery.ts` takes a single `installDir` with **no workspace segment**, `FederatedMcpConnectionConfig` carries **no `workspaceId`**, and workspace scoping lives entirely in `activation.ts`. Tovu already separates *installed code* (not workspace-scoped) from *admission* (workspace-scoped).

**Adopted instead** — and Codex and Sonnet converged on this independently in Round 3, both correcting the Coordinator the same way ("directionally right but scopes the wrong thing per workspace"):

```text
infra/agent-plugins/                      # dev default; TOVU_AGENT_PLUGINS_DIR overrides
├── packages/sha256/<archiveDigest>/      # immutable, per-INSTANCE package bytes
├── data/ws/<workspaceId>/<pluginId>/     # writable, per-WORKSPACE PLUGIN_DATA
└── staging/                              # private atomic-extraction dirs
```

Package bytes are content-addressed and shared: one extraction per archive rather than N, and extraction is the highest-risk code in the feature. Only `PLUGIN_DATA` and admission are workspace-scoped — matching Tovu's own existing split. VS Code and Claude Code both key installs by identity, not by project.

**Two refinements from Codex that nobody else raised:**
- A dedicated **`staging/`** directory for atomic extraction, so a partially-extracted or rejected archive is never visible at the live package path.
- **Production should set an absolute `TOVU_AGENT_PLUGINS_DIR`** (e.g. `/var/lib/tovu/agent-plugins`). It still belongs to the instance's data, but it survives immutable-container replacement **and cannot accidentally enter a frontend build context** — a real risk for anything under the repo tree if a bundler ever globs it.

**Extraction is where containment actually breaks:** reject symlink entries outright (the convergent ecosystem fix for tar), canonicalize-then-verify with `realpath` rather than string comparison, cap entries/total bytes/per-file bytes, and keep `PLUGIN_ROOT` read-only against a separate writable `PLUGIN_DATA`.

**The trust gap, and the answer:** `mcp-federation`'s allowlist is designed to be authored by someone *other than* the thing being classified; its "hints demote only, never promote" rule only protects *within* an independently-authored allowlist. A plugin's `mcp.json` has no independent author. **The operator is that author** — a plugin's MCP servers land *proposed*, never admitted; enabling a plugin does not admit its tools.

**Contradiction found and answered, not buried:** VS Code implements the same spec and **implicitly trusts plugin MCP servers on install** — *"they do not show a separate trust prompt at startup."* We hold the opposite because the trust boundary doesn't transfer: a VS Code install is one person clicking into their own single-user process, and that click *is* the review. A Tovu install is a marketplace fetch into an always-on server where the installer and the `admin.integrations.manage` holder may be different principals.

**Now live, per the owner's definition of "installed":** marketplace → download into an `agent-plugins/` folder means real third-party code lands on disk, so the MCP subprocess risk is no longer hypothetical and operator admission is a prerequisite for opening the marketplace — the same shape as ADR-024's *"shipping the marketplace is shipping the sandbox."*

---

# 4 — Plugin system

**RECOMMENDATION: wire the enable path and ship auto-quarantine as ONE work item, before anything else.**

**The finding that reframed the debate:** `loadPlugin()` **awaits `importModule(entryPath)` and discards the result** (`loader.ts:141-143`). Steps (4)–(5) — build the capability-scoped SDK, call `setup()`, attach hooks — are, in the file's own words, *"still NOT called from inside this function."* The only production caller of `attachLoadedPlugin()` is Site Glue, outside SPEC-005's scope. So a plugin enabled through the documented path never runs `setup()` and never attaches its hook; **AC-01 is not provable end to end.**

Scope corrected on inspection: **four working units and one missing wire**, not an unbuilt foundation.

- **Split the wire the way the code already anticipates:** `loadPlugin` captures its own import and calls `setup()` (only it has the module); the **composition root** builds `coreDeps` and attaches via `attachLoadedPlugin` — already named in that function's own doc comment. Keeps one tested attach path.
- **The wire must propagate failures, not swallow them.** Verified: `activation.ts` does `await deps.repo.save(activation)` **before** `await deps.onEnabled?.(...)`, and the `captureInverse`/`rollback` net at `tool-registrations.ts:122-134` only fires if `onEnabled` throws. Otherwise durable state claims a success that never happened.
- **Quarantine on consecutive failures, not one strike.** WordPress trips on the first fatal because a PHP fatal kills the process — there is no second occurrence to count. Tovu's failure is a *caught* `PluginHookFailedError`; both process and plugin survive, so counting is available and one-strike would over-quarantine a flaky-but-legitimate filter. Threshold is a parameter, not a constant. (VS Code, for reference, still doesn't auto-quarantine at all — it profiles and reports.)
- **Why they ship together:** EC-10 is currently *latent* because nothing can attach. The wire is precisely what makes it live — a throwing filter blocks **every** content save, recoverable only by a manual `PATCH`. ADR-024's own invariant forbids shipping a failure mode exceeding the current recovery rung.
- **Do the ABI audit now, while it's free** (ADR-024 §3's own instruction): the spec types the filter `(entry, ctx) => ExtPatch` with no `Promise` while `hook-registry.ts:170` awaits it; and `hook-registry.ts:165`'s shallow spread leaves nested fields shared across invocations. **Clone before freezing** — freezing the shared reference would freeze the caller's live object.
- **Then** hook-catalog growth under §7 per-hook discipline, **then** Tier-1 primitives (webhook dispatch first — it's the one with verified backing infrastructure). Tier-2 sandbox stays deferred.

---

# 5 — Commerce and the tri-dialect data model

**RECOMMENDATION: relational core; JSON documents for provider-owned payloads only; never indexed.**

**Your JSONB question, finally settled — after three Coordinator reversals:**

- **Right about storage.** MySQL's `JSON` is JSONB in all but name (*"converted to an internal format that permits quick read access… by key or array index"*). SQLite 3.45+ has real JSONB and this repo's driver bundles 3.49.2.
- **Wrong about flexibility.** GIN indexes the *document*, so paths need not be anticipated — **Postgres only**. MySQL and SQLite index a *named extracted scalar*, so every queryable field is declared up front, which is most of the way back to a column.
- **Persisting `jsonb()` is safe** — `sqlite.org/jsonb.html` commits to portability and backward compatibility across versions. The Coordinator's earlier "an `npm update` could reinterpret stored bytes" claim was **false** and is withdrawn.
- **What's actually prohibited is decoding the bytes yourself** — and you never need to. Probed on 3.49.2: `json(x)`, `json_extract(x,'$.a')`, `jsonb_extract(x,'$.b.c')`, `json_type(x)` all work directly against a `jsonb()`-written BLOB. Drizzle's doc claiming JSON functions throw on BLOB arguments is **stale**.
- **`jsonb` is not a Drizzle builder** — verified: `sqlite-core` exports `blob, integer, numeric, real, text`. Four participants recommended code that cannot be written.

**So `text("*_json")` stays the SQLite default for tooling ergonomics — not durability.** Drizzle has no builder and `customType.fromDriver` can't rewrite the SELECT, so binary storage means hand-written `sql` fragments at every call site. That names exactly what would unblock it.

**The review-time rule:** *if a query, index, constraint, join or sort will ever touch it — it is a column. If it is read back whole by id — it is a document, never indexed.* "Maybe later" is not a third answer; it is "no", recorded with what would trigger promotion.

**MariaDB is out** — 5/5. Its `JSON` is a `LONGTEXT` alias, and MySQL↔MariaDB row-based replication **fails** on JSON columns. "MySQL or MariaDB" is not one target.

**Products vs `member_tiers`: separate, bridged by one nullable FK.** *(Coordinator conceded; I had argued extend.)* `member_tiers` carries `welcome_page_path` and `visible_in_portal` — meaningless for a one-time sale — and only two recurring price slots with no one-time representation. Commerce owns financial truth; `member_subscriptions` stays the entitlement projection.

**Idempotency AND ordering.** `(provider, event_id)` UNIQUE stops replay but not out-of-order delivery, and `version` is local optimistic concurrency, not source ordering. Use one atomic statement: `UPDATE … WHERE id = ? AND provider_event_at < ?`. **Do not copy Open SaaS's handler** — `updateUserCredits` increments per delivery with zero event-id dedup anywhere in its webhook path, and Stripe delivers at-least-once with retries up to 72 hours. (Open SaaS also models revenue as `Float`.)

**New dialect facts:** MySQL has **no `RETURNING` clause at all**, so upsert-then-read needs a dialect-specific path (and `INSERT … ON DUPLICATE KEY UPDATE` reports 0 affected rows when values are unchanged, unless `CLIENT_FOUND_ROWS` is set). MySQL enforces `CHECK` only from **8.0.16**.

**Sequencing: vertical slice first.** No code path writes a commerce row in any dialect today; MySQL has zero files and Postgres is explicitly *"evaluation-only — no live `pg` client."* Prove checkout end to end on the one real dialect; the second adapter is what tests portability, and you cannot test it against nothing.

---

# 6 — Deployments

**RECOMMENDATION: a Tovu-owned deployment domain with provider adapters over the guarded HTTP client.**

**Your "just MCP — tokens and base URLs" hypothesis is rejected 5/5, on two verified facts:** MCP here is a **stdio subprocess** (*"only stdio is implemented this pass"*; `spawnMcpStdioChannel` calls `child_process.spawn`), and `HttpClientPort`/`EgressPolicy` appear **zero times** anywhere in `mcp-federation/` — so routing deploys through MCP discards the SSRF and DNS-pinning protections. MCP remains a legitimate *adapter choice*; it must never be the *definition*.

- **Domain:** `Release` / `Environment` / `DeploymentTarget` / `DeploymentRun` (+ run events), workspace-scoped, matching repo conventions. `module-status.ts` is a boot snapshot, not a run store.
- **GitHub via a GitHub App with installation tokens** — not `gh`, not a PAT. Verified: tokens expire at exactly 1 hour, narrowable by permission and repository; the App JWT must be RS256 with `exp` ≤10 minutes past `iat`. `gh` inherits a human's global credential, can't be workspace-scoped in a multi-tenant process, and bypasses `EgressPolicy`.
- **⚠️ `EgressPolicy` cannot pin a host.** Its real fields are `allowedSchemes`, `denyPrivateAddresses`, `devHostAllowlist` (an *exemption* from the private-address check — it could not do this job even under a different name), `maxRedirects`, `connectTimeoutMs`, `maxResponseBytes`, `maxDecompressedBytes`, `rateLimit?`. And the method is **`send(request)`**, not `.request()`. **Origin pinning must be asserted inside the adapter**, through a single chokepoint every outbound call is forced through, with `maxRedirects: 0` closing the gap the URL check can't see.
- **Callbacks never supply or infer the workspace.** Resolve `(providerId, providerRunRef)` → run → workspace; an event matching no run is dropped with `202 { ignored: true }`. Materialize `provider_id` on `deployment_runs` rather than joining through a target that might be deleted mid-run.
- **Two latent bugs research caught:** GitHub documents **no ordering** for the deployment-statuses endpoint (take the greatest `id`, not `statuses[0]`), and the real `state` enum has **seven** values, not four. Also `deployment_status` webhooks **never fire for `inactive`** — that state is poll-only.
- **First slice orchestrates an external deployment of a pre-existing artifact, and the UI says so.** The CLI has only `init`, `serve`, `introspect` — there is no build or export command, so Tovu must not imply it can construct a deployable site.

---

# Claims that turned out false on inspection — AUDITED

**This table was itself audited before publication, and the audit found an error in it (row 16).** The count is not a measurement; it is a list, and each row now carries its evidence status. Do not cite the headline number without the status column.

**Status key:** `VERIFIED` = the Coordinator ran a command or read the file and can point at the output. `UNVERIFIED` = a peer's claim carried forward without independent check. `JUDGMENT` = a framing/reasoning correction, not a factual error. `PARTLY WRONG` = the row as originally written overstated the finding.

| # | Claim | Source | Reality | Status |
|---|---|---|---|---|
| 1 | "SQLite has no JSON type at all" | **Coordinator**, Round 1 packet | Wrong by ~18 months. Propagated into four peers' Round 1 reasoning. | **VERIFIED** — `node` probe: `jsonb()` returns a 5-byte blob on 3.49.2 |
| 2 | "Persisting JSONB risks an `npm update` reinterpreting stored rows" | **Coordinator**, Round 2 | False. SQLite commits to backward compatibility. | **VERIFIED** — fetched `sqlite.org/jsonb.html` |
| 3 | Four `infra/` conventions asserted to peers | **Coordinator**, agent-plugins packet | True, but **never staged** — peers were told to ground every claim in `path:line` while handed an ungroundable one. | **VERIFIED** — `.gitignore:21`, `deps.ts:134`, `deps.ts:170`; staging omission is my own action |
| 4 | `ws/<workspaceId>/` for installed plugin bytes | **Coordinator** | Contradicts Tovu's own pattern: installed code is not workspace-scoped, only admission is. | **VERIFIED** — `discovery.ts` `installDir`, no `workspaceId` on `FederatedMcpConnectionConfig`, scoping only in `activation.ts` |
| 5 | "The grammar and the replacement are coupled invariants" | **Coordinator** | Over-stated; an end-to-end anchor preserves the property with no replacement change. | **JUDGMENT** — a reasoning correction, not a false fact |
| 6 | "There is no host dispatch path in the composer" | **Coordinator** | Wrong — dispatch already wired and working for `/mcp`. | **VERIFIED** — `AssistantDock.tsx:270-273`, `agent-plugin-catalog.ts:95` |
| 7 | "`/search` can only ever compose text" | Sonnet R3 | Half right — a second, browser-callable tool path exists behind a per-tool allowlist. | **VERIFIED** — `AssistantDock.tsx:72`, `mcp-ui-tool-calls-route.ts:185` |
| 8 | "The webhook ports have zero callers" | Sonnet R2 | Wrong — grepped only its staged file set, generalized to the repo. | **VERIFIED** — `delivery.ts`, `subscriptions.ts`, `repo.sqlite.ts`, `repo.memory.ts` |
| 9 | "Both Gemini peers return textually identical output" | Sonnet R2 | Wrong — 9–22KB vs 5–7KB, 8 lines in common (the mandated headings). | **VERIFIED** — md5 + byte counts + `comm` |
| 10 | "JSON functions throw on BLOB arguments" | Drizzle's docs, via Sonnet R3 | Stale — pre-3.45 behavior. | **VERIFIED** — probe: `json`, `json_extract`, `jsonb_extract`, `json_type` all work on 3.49.2 |
| 11 | "TDD-certified stub… body intentionally throws" | **Four in-tree file headers** | All four bodies are fully implemented; none throws as a stub. | **VERIFIED** — `discoverPlugins`, `validateManifest`, `runBeforeSave`, `buildCapabilityScopedSdk` all have real bodies |
| 12 | A `hook-registry.ts` comment asserting a caller existed | **In-tree comment** | Already corrected in-tree as "verified false." | **VERIFIED** — `loader.ts:154` |
| 13 | GitHub returns deployment statuses newest-first | Sonnet R2 | Peer reports GitHub documents no ordering. | **UNVERIFIED** — Coordinator did not independently check GitHub's docs. Treat as a peer claim. |
| 14 | `EgressPolicy.allowedHosts` / `followRedirects` | Sonnet R2 code | Neither field exists; the safety property was assumed, not implemented. | **VERIFIED** — `src/http/ports.ts:29-46` |
| 15 | `SecretSealerPort.open({ sealed, key })` | Gemini 3.1 Pro R2 code | `open` takes `{ sealed }` only. | **VERIFIED** — `src/integrations/ports.ts:96` |
| 16 | Reuse of `requestPendingConfirmation` **and** `AgentPluginDetailsModal` called fabricated | Sonnet R2 code, repeated by the Coordinator | ⚠️ **The row as first written was wrong.** `requestPendingConfirmation` is genuinely absent. But **`AgentPluginDetailsModal.tsx` DOES exist** in the repo and does use `PreviewModalShell` — the peer's claim was scoped to its *staged* file set and the Coordinator generalized it to the repo. | **PARTLY WRONG** — corrected here |

**Audited totals:** 13 verified factual errors · 1 judgment/framing correction (row 5) · 1 unverified peer claim (row 13) · 1 row that was itself wrong (row 16). The headline "16 errors" was a count of rows, not of verified errors — say **13 verified** if a number is needed.

**Process failures, both mine:** persisting a peer's output mid-run (captured 463 of 32,987 characters, and that truncated version shipped into the next round's packet — bounded to one debate, repaired, and the completeness guard now keys on the end marker); and dispatching three Round 1 debates plus all of Round 3 without first freezing my own position, which makes the Primary a synthesizer rather than a participant.

**Pattern worth keeping:** the verified errors cluster in three places — confidently-worded doc comments, externally-recalled facts, and packet construction. Not in reasoning. Roughly every other verification found something — including this audit, which found row 16.

---

## Still open — genuinely yours, not the swarm's

1. **Who is the theme author?** Agency shipping to a marketplace vs. site owner editing in the admin. Flips debate 1's UX trade-off.
2. **Should `/search` be allowlisted as MCP-UI-redeemable?** A trust decision that determines whether slash commands ever execute directly.
3. **Can Angular emit the literal asset sentinel?** Gates whether Angular ships at all.
4. **Is workspace isolation in Tovu tenant-grade or activation-only?** Determines whether shared plugin bytes are acceptable.
