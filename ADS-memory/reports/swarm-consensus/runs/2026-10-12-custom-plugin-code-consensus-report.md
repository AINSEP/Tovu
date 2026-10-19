# Consensus report — custom site plugin code in Tovu (debate, 2 rounds) — 2026-10-12

## The Swarm
| Role | Participant | Model | Reasoning | CLI Version |
|---|---|---|---|---|
| Primary | Coordinator tovu-e7 (host) | Claude Opus 5.5 (claude-opus-5-5) | session default | Claude Code (host) |
| Peer (external) | Codex | gpt-6.1-sol | high | codex-cli 0.161.0 |
| Peer (in-host subagent, owner-requested) | debate-opus | Claude Opus 5.5 | opus-high | — |
| Peer (in-host subagent, owner-requested) | debate-sonnet | Claude Sonnet 5.5 | sonnet-xhigh | — |
Gemini not requested by the owner → not dispatched.

## Dispatch Diagnostics
- Codex model proof: exact-model smoke `codex exec -m gpt-6.1-sol` → "OK <<SWARM_END>>" this session (saved plan said stale gpt-5.6-sol; pinned gpt-6.1-sol from ~/.codex/config.toml).
- Packets: context/CTX-custom-plugin-code-2026-10-12.md (R1, neutral), CTX-custom-plugin-code-2026-10-12-R2.md (R2, Coordinator R2 + all R1 verbatim). Codex via stdin, read-only sandbox; subagents read the packet file.
- ACKs: all four answers begin with the packet-bound ACK line. No failures/retries. Codex exec has no streaming, so ACK was checked on completion.
- Answers: runs/2026-10-12-custom-plugin-code/R{1,2}-{primary-opus55,codex,opus-subagent,sonnet-subagent}.md

## Individual Responses
### Primary (Claude Opus 5.5)
R1: B (`plugins/` + `custom-plugins/<id>/{src,dist}`), compile on seal, tsc advisory, assistant code sandboxed + approval. 0.75. R2: two sealed origin roots, source separate, load-probe, tsc blocking w/ override, flip `!sealedHere`. 0.8. (Files R1/R2-primary-opus55.md.)
### Codex gpt-6.1-sol (high)
R1: B with immutable releases + activation record; tsc blocking at publish; real constrained runtime before assistant code runs generally. 0.89. R2: two sealed roots + top-level `plugin-source/`; assistant v1 = explicit full-authority opt-in until isolation; no assistant deps; defer client JS; build port. 0.88.
### Claude Opus 5.5 subagent
R1: E — one sealed root, origin on install record, separate `plugin-source/` (cites 2026-08-20 4/4). 0.75. R2: CHANGED to two roots: `custom/{installed,source,seals}`; corrected that the worker only supports probe/beforeSave; allows deps + client JS with consent. 0.8.
### Claude Sonnet 5.5 subagent
R1: two roots, origin by root, sealed package carries src; tsc advisory + load-probe; found `confirmEnable = !sealedHere`. 0.7. R2: CHANGED to tsc blocking; source to top-level `plugin-source/`; conceded multi-root is cheap (installer takes installDir); added crash-loop breaker; no assistant deps; no client JS v1. 0.8.

## Debate Trace
- Folder shape: R1 split (B ×3 variants vs E). R2: all four → two sealed origin roots; Opus-sub moved because of the owner's literal requirement + backup semantics; Sonnet showed multi-root = second instance of existing code.
- Source location: R2 all agree source must be outside every discovery root (`source` would be a valid plugin id; only a dot-skip hides `.drafts` today). Split on name: `custom/source` (Opus-sub) vs top-level `plugin-source/` (Codex, Sonnet).
- Type-check: R1 2 blocking / 2 advisory → R2 all blocking by default with recorded owner/developer override; assistant cannot self-waive; load-probe also required.
- Assistant trust: worker isolation is NOT available now (protocol carries probe + beforeSave only) — agreed after verification. Agreed now-measures: flip `!sealedHere`, consent card at first enable + capability/dependency widening worded "full server authority", no `node:*` imports for assistant code, probe, auto-rollback, crash-loop breaker. Codex holds: until isolation, that consent is an explicit full-authority opt-in. Opus-sub: don't gate the feature on a dateless sandbox.
- npm deps (assistant): 3 none in v1 (Codex, Sonnet, Primary-leaning) vs Opus-sub allow-with-consent.
- Client JS v1: 2 defer (Codex, Sonnet) vs Opus-sub allow; Primary R2 leaned developer-only → final: defer, theme scripts meanwhile.
- Compile: unanimous — authoring machine only, never boot/deploy, behind a build port; packaged-desktop esbuild must be proven.

## Synthesis
Converged design (all four at ≥0.8; min_confidence 0.90 not reached on the two minor splits; max_rounds reached):
```
sites/<name>/
  plugins/<id>/<ver>/            marketplace: installer-only, digest-pinned, rebuildable from plugins.lock.json
  custom/                        irreplaceable; one folder to back up / export / deploy
    installed/<id>/<ver>/        sealed: manifest, server/index.mjs, source/ (inert snapshot), integrity
    source/<id>/                 editable TS, tests (absorbs plugins/.drafts); never scanned by the loader
    seals/<id>/<ver>.json        authoredBy, sourceDigest, typecheck, probe, deps
```
Coordinator choice on the naming split: `custom/{installed,source}` (Opus-sub) — keeps all irreplaceable custom material in one backup unit while keeping source outside the scanned root.
Lifecycle: edit → tsc (blocking; recorded override for owner/dev) → esbuild bundle (SDK external; assistant code: no `node:*`) → child-process load-probe (timeout) → seal with source snapshot → install inactive → consent card if first enable or widened → activate → reload; failure/quarantine → automatic rollback. sdkRange miss after a core upgrade → quarantine, site stays up, assistant re-seals from source.

## Decision Ledger
| # | Decision | Support | Note |
|---|---|---|---|
| 1 | Two sealed origin roots; origin assigned by root, never by manifest; cross-root duplicate ids refused | 4/4 | meets owner's literal requirement |
| 2 | Editable source outside every scanned root; sealed versions carry source snapshot | 4/4 | name: custom/source (chosen) vs plugin-source/ |
| 3 | tsc blocking by default; recorded owner/dev override; assistant can't waive; probe required | 4/4 | |
| 4 | Fix `confirmEnable = !sealedHere`; consent at first enable + widening, "full server authority" wording | 4/4 | security fix, do first |
| 5 | Assistant code: no `node:*`, probe, auto-rollback, crash-loop breaker; worker/workerd isolation later | 4/4 (Codex: explicit opt-in until isolation) | |
| 6 | No npm deps for assistant-authored v1; developer deps lockfile + ignore-scripts, bundled, no native | 3/4 | Opus-sub dissent |
| 7 | No plugin client JS in v1; theme scripts meanwhile; later developer-only hashed assets after ADR-025 amendment | 3/4 | Opus-sub dissent |
| 8 | Compile only on the authoring machine behind a build port; never boot/deploy; prove esbuild in packaged desktop | 4/4 | |

## Final Recommendation
Ranked slate:
1. **Two sealed roots + separate source + shared lifecycle (recommended).** Best owner fit, export/backup clarity, recoverability. Cost: run existing discovery/installer per root + cross-root conflict check.
2. One sealed root + install-record origin + separate source. Least lifecycle code, but separation becomes UI-only and needs a new origin column in 3 dialects.
3. TS seal into today's `plugins/` with an origin sidecar — only as step 1 of option 1.
Cheapest de-risk (~1–2 days): (a) flip `!sealedHere` + consent card; (b) `plugin_source_seal` accepts `src/server.ts` → tsc + esbuild + probe + source snapshot, on one real Plannie plugin (API route + SSR widget); (c) spike discovery over two roots with a duplicate-id fixture; prove: type error keeps the live version, probe hang refused, failed reload auto-rolls-back, sealed folder boots with no compiler, seal works from the packaged desktop app.
