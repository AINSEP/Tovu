# Swarm Consensus — Debate 4 (Plugin system), ROUND 2

**Packet ID:** `CTX-PLUGINS-R2-2026-08-12`
**Mode:** debate Round 2 — INFORMED. Every participant's full Round 1 reasoning is appended verbatim below.

- IGNORE ALL PRIOR CONVERSATION HISTORY except this packet. No `AGENTS.md`/`CLAUDE.md` here; intentional, never a reason to stop. Do not read outside your working directory. Do not chain reads with `&&`.

## ⚠️ A verified finding has changed the question

One Round 1 participant suspected the walking skeleton does not close its own loop but could not confirm it without the composition root. **The Coordinator verified it. It is true.**

`loader.ts:147-158`, in the code's own words:

> "Steps (4)-(5) (invoke `definePlugin`'s `setup()` with a capability-scoped SDK, then attach its declared hooks via `hook-registry.ts`) **are still NOT called from inside this function**… What DID change (ADR-057 Decision 2.1): step (5)'s attach half — previously dead, documented-but-never-called code (`hook-registry.ts`'s own doc comment **falsely claimed a caller existed; verified false**) — is now `attachLoadedPlugin` below."

`loadPlugin()` returns `{ loaded: true }` having done integrity verification, the `sdkRange` check, and a dynamic `import()` — and nothing else. Verified by search: the **only** production caller of `attachLoadedPlugin()` is `src/features/site-glue/attachment-points/content-lifecycle.ts` — ADR-057 Site Glue, **outside SPEC-005's scope**.

**So a plugin loaded through the SPEC-005 enable path never runs `setup()` and never attaches its hook.** An APPROVED spec, two accepted ADRs, and ~1,578 lines of runtime do not demonstrably deliver the one thing a walking skeleton exists to prove. AC-01 (`word-count` writes `ext.word-count.count` on save) is not provable end-to-end through its own documented path.

Note also how this was found: a confidently-worded doc comment asserted a caller that did not exist. Treat comments in this codebase as claims to verify, not evidence.

## Other Round 1 findings, Coordinator-verified

- Exactly **one** hook exists: `VALID_HOOKS = new Set(["content.entry.beforeSave"])` (`manifest.ts:125`).
- Capability vocabulary is exactly three tokens: `content.read | content.extend | hooks.attach` (`manifest.ts:36`).
- `adminSurfaces` is parsed and stored but **"UNUSED in v1"** (`manifest.ts:59-60`).
- `loadPlugin()` requires per-file SHA-256 `integrity`, an `sdkRange`, and an ESM entry — none of which the Agent Plugins format has, making cross-absorption structurally impossible.

## Unverified but checkable (do not assert as settled)

- **ABI-freeze drift:** spec writes the filter as `(entry, ctx) => ExtPatch` with no `Promise`, while `hook-registry.ts:170` does `await attachment.filter(...)`. Harmless in JS, but ADR-024 §3 demanded this audit happen *now*, "while there are zero third parties to break."
- **Shallow snapshot:** `hook-registry.ts:165` spreads `{ ...entry, ext: {...} }`, so nested fields stay shared references across invocations — in tension with §3's "serializable payloads only, no live core objects."

## What Round 1 settled (do not re-argue)

ADR-024's tier model is the right frame at the trust axis. Option B (sandbox-first) stays rejected — already rejected with reasons, and no new evidence reopens it. Option D (converge all three extension systems into one artifact) is rejected; shared tier *vocabulary* is worth keeping, shared artifact format is not.

## The Round 2 ask — CONVERGE (no code this round; Round 3 produces code)

1. **Given the loop is not wired, what is the actual sequencing?** Is "confirm/complete the enable path end-to-end" a precondition to everything else, or can hook-catalog breadth and Tier-1 primitives proceed in parallel? Defend it.
2. **Is the ecosystem bottleneck trust or surface?** One hook gates every plugin at every tier today — a fully-trusted Tier-3 sideloaded plugin still cannot touch admin menus, publish/delete, or queries. Settle whether widening the hook catalog or advancing the trust rungs is the higher-leverage next move.
3. **Recovery/quarantine — an unlisted workstream nobody named.** `EC-10`: a throwing filter **blocks all content saves** while the plugin is enabled, recoverable only by an operator manually calling `PATCH .../plugins/:id {enabled:false}`. ADR-024 promises "an update or plugin must never brick your site," and today's single plugin can brick every save. Rate its urgency against options A and C.
4. **Tier-1's unbuilt primitives.** Its 60–73% demand vindication is conditioned on five core-mediated primitives; only webhook dispatch has visible backing infra (`WebhookSubscriptionRepoPort`/`WebhookDeliveryRepoPort` + `KeyringPort` HKDF signing). Snippet/asset injection, mail adapter, redirect executor, and form-submission sink have none. Does that change the sequencing?
5. **Background/scheduled work.** No hook, no spec, and ADR-024 defers it. WordPress-class ecosystems lean on cron-like work heavily. In or out?
6. **Per-hook discipline cost.** ADR-024 §7 requires explicit priority, declared phase, deterministic order, and defined failure behavior per hook; INV-06 is explicit anti-hook-soup. What is the actual per-hook cost of going wide, and does it change the answer to Q2?

State your current position, whether it changed this round **given the wiring finding**, the strongest argument against the leading opposing position, and what would change your mind.

## Required response format

Begin with exactly:

```
ACK_PACKET_RECEIVED CTX-PLUGINS-R2-2026-08-12 -- I received the packet and will work on it.
```

Headings: `## Position And Movement`, `## Sequencing Verdict`, `## Remaining Disagreements`, `## Strongest Counter-Argument`, `## What Would Change My Mind`.

End with exactly `<<SWARM_END>>` on its own line.

---

# APPENDIX — Every participant's full Round 1 response, verbatim

