# Swarm Consensus Report — Settings Architecture

**Date:** 2026-07-09
**Mode:** debate (2 rounds) · **min_confidence:** 0.90 (reached) · **swarm_timeout:** 300s
**Topic:** Architecture for a typed, schema-registered **Settings** surface scoped global/workspace/user (replaces WP `wp_options`) — Admin Section Spec Sweep item.
**Context packet:** `.local-artifacts/swarm-consensus/context/CTX-settings-architecture-2026-07-09.md`
**Outcome:** **CONSENSUS — dedicated "Layered Settings Ledger" (B-family).** Option A (settings-as-entries) rejected; the lone A advocate converted.
**Round 3 (design & audit):** a concrete design round followed — see the companion **`20260709-settings-r3-design-report.md`** (full DDL/resolver/ops + an 8-item surfaced-issues register; the punch-list there supersedes the one below).

## The Swarm
| Slot | Model | Proof |
|---|---|---|
| Primary | host Opus 4.8 | host |
| Peer | Codex `gpt-5.5` @ reasoning xhigh | smoke-proven live 2026-07-09 (bare `-m gpt-5.5`) |
| Peer | Gemini 3.1 Pro (High) via `agy` | smoke-proven live 2026-07-09 |
| Peer (in-host, added) | Fable subagent | Agent tool, model `fable` |

## Dispatch Diagnostics
- CLI versions (diagnostics only): codex-cli 0.144.0, agy 1.1.0, claude 2.1.201.
- Codex model NAME note: this host's codex is ChatGPT-account auth → suffixed IDs (`gpt-5.5-codex`, `-terra`) return 400; bare `gpt-5.5` and `gpt-5.6-terra` work. All background `agy`/`codex` launches used `< /dev/null` (stdin-close, the known hang-fix).
- agy had **no file-read access** → designed from the packet's Architecture Summary in both rounds (disclosed).

## Individual Responses
**Primary (Opus 4.8):** R1 "C+" (dedicated table, reuse discipline = B-family); **conceded** its "user prefs in identity store" to the content.db `(workspace_id, principal_id)` + Runner-federation correction.
**Codex (`gpt-5.5` xhigh):** R1 **B-prime** → R2 **B-family, held, confidence 0.94.** Four tables (`settings_definitions/values/revisions/aliases`); reject A on content-lifecycle mismatch; row-per-key; user-scope locked; rule-of-two dissolved.
**Gemini (`agy`):** R1 **A** (settings-as-entries, on a rule-of-two claim) → R2 **B-refined, converted, confidence 0.95.** *"Option A does not survive this. I concede"* — the authz-collapse argument (an agent with `content.write` could rewrite site security posture) + the ADR text it hadn't seen.
**Fable:** R1 **B-refined** → R2 **held, confidence 0.88.** Delivered the decisive kill (Δ1 below), row-per-key subsumes the large-doc case, rule-of-two = port-question vs DRY-question conflation.

## Synthesis — the agreed architecture ("Layered Settings Ledger")

**Shape:** a dedicated Settings surface that **reuses ADR-022's never-brick *discipline* (write chokepoint + same-tx append-only revisions + CI canary + `pluginId` attribution + schemas-as-data registry) but NOT its `entries` table.**

1. **Three tables in per-site `content.db`:**
   - `setting_definitions` — schemas-as-data: `namespace`, `key` (UNIQUE together), `owner` (core/site/plugin), `schema_json` (bounded/total validation language — the ADR-022 amendment / ADR-024 §5 language), `default_json` (**defaults live here** → structural factory-reset), `scopes` (subset of global/workspace/user this key admits), `secret` flag, `version` (bump on retype), `status`, `alias_of` (reversible rename, depth ≤1).
   - `setting_values` — **row-per-key**: `PK(scope, scope_id, namespace, key)`, `workspace_id` (NULL iff global, else required per ADR-007), `value_json` (validated on write), `def_version`. User rows: composite FK `(workspace_id, scope_id) → principals(workspace_id, id)` (ADR-021 §4).
   - `setting_revisions` — append-only, full post-state + actor + `pluginId` + monotonic seq (extend the ADR-022 §4a CI canary to these tables).
2. **Precedence = pure resolver:** `effective = user ?? workspace ?? global ?? registry-default`; layers are distinct rows (writing workspace never mutates global); `clear` ≠ JSON `null`. Override policy is **declared in the schema** (`scopes`) — a user can't override SMTP host because the definition doesn't admit a user layer, not because a UI hides it.
3. **Authz = ADR-021 as-is,** new flat permission strings: `settings.global.write` (admin), `settings.workspace.write`, `settings.user.write.self` / `.manage`, `settings.read`. No parallel model, no evaluator #2.
4. **Cache LAYERS, never effective values:** `settings:global:{ns}`, `settings:ws:{wsId}:{ns}`, `settings:user:{wsId}:{principalId}:{ns}`. Kills both key-explosion and the effective-doc-in-shared-key cross-tenant leak; ADR-007-compliant (workspaceId in every non-global key; global is the deliberate platform class, a distinct repo method). In-process Map now → `CachePort` later.
5. **User-scope home:** per-site user settings in `content.db` `(workspace_id, principal_id)`; **cross-site human-pref sync is Tovu-Runner's job** (ADR-011 arrow). Only durable typed prefs; ephemeral UI state → client localStorage; no transients/cache/job-state (what rotted `wp_options`).
6. **Plugin settings:** Tier-1 manifest-declared (ADR-024 §1 already lists "settings schemas"); namespace **derived from `pluginId`** (no collisions); core auto-renders the form from schema (zero plugin JS for the default path); custom panels = ADR-025 sandboxed cross-origin iframe + postMessage RPC; writes core-mediated, slot into the ADR-026 atomic envelope; uninstall retains values inert.
7. **Secrets boundary:** "if Tovu *verifies* it → identity (`api_keys`, ADR-021); if Tovu *presents* it → outbound secret." `secret:true` stores only a `secretRef`; plaintext lives in the future Integrations/secret-store; never plaintext in the site folder (ADR-024). Redacted in every settings read; excluded from exports by construction.
8. **Ports (ADR-006):** `SettingsRepoPort` = yes (in-memory + SQLite, the genuine rule-of-two pair). A `SettingsPort` *service* abstraction = **no** (precedent: ADR-021 no-PolicyPort). `settings` is a core library `src/features/settings/` (`registerDefinitions / getEffective / set / clear`).
9. **First consumer:** retire the ad-hoc `PresentationSettingsRepoPort` → `core.presentation.activeThemeId` @ workspace scope; ADR-020 theme presets → `theme.{themeId}` namespace — collapses the two competing settings concepts the packet flagged, and fixes WP's "switch theme, lose config" for free.

**The decisive argument (why not A):** entries are governed by `content.write`, which ADR-013/014/016 deliberately hand to the assistant/agent surface. ADR-021 §3 permission strings scope by **`entityType`, not row-level content-type**, and the only per-resource ABAC seam (§8) is **deferred + fail-closed-nullable in v1**. So settings-as-entries forces either (a) shipping the deferred ABAC engine early just to fence settings, or (b) a shadow `content.write.settings` string = the vocabulary drift ADR-021 §3 forbids, which **reinvents B's permission namespace on top of A's storage anyway**. B gets the fence for free (settings simply aren't the `content` entityType). ADR-024's own warning — *"a settings UI accidentally becomes an authority surface"* — names this failure in advance.

## Decision Ledger
| # | Decision | Status |
|---|---|---|
| D1 | Dedicated Settings ledger, NOT the ADR-022 entries table | **Agreed (4/4)** |
| D2 | Reuse the chokepoint/revision/canary/registry *discipline* | Agreed |
| D3 | Row-per-key storage `PK(scope,scope_id,namespace,key)` | Agreed |
| D4 | Precedence `user??workspace??global??default`; override policy in schema | Agreed |
| D5 | Authz = ADR-021 flat `settings.*` strings; no new model | Agreed |
| D6 | Cache layers not effective values; ADR-007 keys | Agreed |
| D7 | User-scope in content.db `(workspace_id,principal_id)`; cross-site = Runner | Agreed (Primary conceded) |
| D8 | Secrets = `secretRef` only; plaintext to future secret-store | Agreed |
| D9 | `SettingsRepoPort` yes / no `SettingsPort` service (rule-of-two) | Agreed |
| D10 | First consumer: retire presentation settings; theme presets → namespace | Agreed |

## Punch-list to fold before the ADR (must-fix / verify)
1. **Referential-integrity caveat (agy):** confirm plugin settings do NOT need hard FK/cascade to content entries (dangling-ref risk of a separate ledger). Answer via the plugin-settings demand slice.
2. **Sequencing blocker (ADR-024 §6, verbatim):** *capability taxonomy v1 must land BEFORE plugin settings/admin design.* Core settings can proceed; the **plugin-settings** portion is gated on capability taxonomy.
3. **Secret-store dependency:** `secret:true` registrations must be **rejected until** the Integrations/secret-store ADR exists — sequence Settings' secret path with the next ADR (Integrations/API).
4. **Validation-language dependency:** the settings schema language MUST be the same total/bounded language ADR-022's amendment mandates (a computing schema would be Tier-3 in disguise) — confirm it's specified, not assumed.
5. **Resolver kill-test (Fable):** a day-scale spike — precedence as ~5 property-tested invariants; if it can't be stated that cleanly, shed aliases/coercion down to add+tombstone only.
6. **CI-canary extension:** the ADR-022 §4a canary must be extended to `setting_values`/`setting_definitions` (the guarantee is only as strong as the canary).

## Final Recommendation
Adopt the **Layered Settings Ledger (B-family)**. The design is strongly converged (4/4, ≈0.92) and internally consistent with ADRs 006/007/020/021/022/023/024/025/026. **Not yet ADR-ready** — fold the 6-item punch-list, then run `/audit-work` (the todos.md process: debate → **audit** → ADR → spec) before writing the Settings ADR. Sequence the plugin-settings + secret portions behind the capability-taxonomy and Integrations/secret-store work; core settings (incl. retiring the presentation surface) can lead.

## Debate Trace
- **R1:** agy **A** (rule-of-two, no file access) · Codex **B-prime** · Fable **B-refined** · Primary **C+**. Split A-vs-B; user-scope split (Primary identity-store vs Codex/Fable content.db).
- **R2 (informed):** Coordinator disclosed positions + 5 deltas incl. the exact ADR-024 text agy hadn't read. **agy conceded A→B-refined (0.95)** on the authz-collapse + dissolved rule-of-two. Codex held (0.94). Fable held (0.88), tightened the authz kill to the ADR-021 §3 entityType-scoping point. Primary conceded user-scope. → unanimous B-family.
