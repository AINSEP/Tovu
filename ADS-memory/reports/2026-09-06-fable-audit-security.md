# Fable security audit — window `4b89cd09..efc6847e` (243 commits, 2026-09-06)

- Lens: SECURITY. Agent: Fable 5.1 (dispatched by team-lead, `<<SUBAGENT_DISPATCH>>`).
- Frozen HEAD: `efc6847ed4490d0f57cd94d16b8cf46a6489a88a`. Code is read at this SHA via `git show efc6847e:<path>`; the working tree is consulted only to check for post-freeze fixes (`git log efc6847e..HEAD`).
- Started 2026-09-06 23:59 local; 1-min load 8.88 (<40).
- Read-only: no tests, builds, typechecks, servers, or writable DB opens. No graph indexer calls.
- Inputs: `AI-Dev-Shop/agents/security/skills.md` (loaded), codex audit reports under `ADS-memory/reports/codex-audit/` (treated as CLAIMS until traced).
- Rules: every finding is **CONFIRMED** (reachable path traced from untrusted input to sink, caller named) or **PLAUSIBLE** (inferred). No secret VALUES appear in this file — file:line only.
- Already fixed, not re-reported: J01, MI-01, MI-02.
- Findings are appended as confirmed; the file is committed at least every 30 minutes.

## Post-freeze commits observed (`git log efc6847e..HEAD` at start)

- `f682eff2` feat(assistant): make a chat run that dies mid-response diagnosable
- `a82f6135` docs(ads-memory): open the Fable bugs-lens audit report (header only)

## Findings

(appended below as confirmed)

