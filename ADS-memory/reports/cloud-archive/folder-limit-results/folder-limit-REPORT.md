# Folder-limit cloud verify — 2026-10-24 (host: vm, /home/user/Tovu, Node 24.22.0)

**VERDICT: FIX NEEDED (1 likely folder-limit test failure + others to triage) — CANARY ENV-BLOCKED (not run)**

## Jini (verify/folder-limit @ 250649fc)
- `pnpm -r build`: 41/42 projects OK; agent-runtime `tsc` FAILED only on the known test error claude-filesystem-policy.test.ts:180 (TS2375 exactOptionalPropertyTypes). dist still present.
- vitest claude-filesystem-policy: 20/20 pass. daemon agent-executor-filesystem-policy + attachment-site-staging: 10/10 pass.
- tsc --noEmit: agent-runtime 1 error (the known :180 one); daemon 0.

## Tovu (ccdc7e88)
- npm ci OK; sdk built; link:jini OK (57 links changed) against /home/user/Jini.
- Touched tests (26 files): tests 366, pass 359, **fail 7**.
  1. agent-daemon-server.tool-restriction-wiring.unit.test.ts — "native Windows shell launches emit the required value-free limitation notice": run failed before start ("The assistant could not start this execution attempt."); expected warn '[agent-daemon] shell is not folder-limited on this platform'. Guess: FOLDER-LIMIT bug (win32 path in new daemon wiring / test binding).
  2. agent-daemon-server.runtime-guidance-wiring.unit.test.ts — "reply length reaches each run's actual overlay without leaking into the next run": strictEqual mismatch of long site_guide overlay prompt (diff beyond first ~1.6k chars, not isolated). Guess: ccdc7e888 prompt drift / pre-existing — triage.
  3-7. apps/website/src/assistant/__tests__/merged-readers-batch.test.ts — content_post_get, newsletter_get_campaign, redirects_get, widgets_get_instance, widgets_get_region "cannot override the workspace to read a foreign record": got "Conflicting inputs 'regionKey' and 'id' both name 'id'. Send only 'id'." instead of /Unknown input 'workspaceId'/. Guess: ccdc7e888 (slug-as-id targets), not folder-limit.
- Pre-existing files: batch-tool-inputs.test.ts 15/15 PASS; tool-registrations.featured-image-refusal.test.ts 1/1 PASS (both now pass).

## Live canary — ENV-BLOCKED
- claude 2.1.310 present and authenticated (`claude -p` replied OK).
- 9/9 skipped. Run 1 (checkout /home/user): "Home-denial canaries require a checkout under the owner home" (7) + "Required CLI sandbox dependency unavailable" (2). Run 2 (Jini moved to /root, under $HOME): all 9 "Required CLI sandbox dependency unavailable" (bwrap/socat not installed; not installing per rules).
- Key acceptance check NOT exercised; needs an environment with bubblewrap+socat.

No source/test/config edited. Jini checkout was moved to /root/Jini for the canary retry.
