# Gemini 3.8 Flash adversarial audit — server / assistant / cli / contracts slice

Scope: everything committed Thu 2026-09-03 and Fri 2026-09-04 under
`apps/website/src/server/**`, `apps/website/src/assistant/**`,
`apps/website/src/cli/**`, `apps/website/src/contracts/**`.

Commit range audited: `5d90b1b5^..04f7bf78` (112 commits touch this slice;
185 files changed under it, 71 non-test source files).

Orchestrator: this agent. Judge: `gemini-3.8-flash-high` via `agy --print`,
diff-in-prompt, no repo tool access. Every Gemini finding below was verified
against current HEAD before being marked CONFIRMED.

## Status

IN PROGRESS — skeleton committed before any chunk was audited, per
instructions. This section and the findings below are appended and
re-committed as each chunk completes.

Chunks planned:
- [ ] A — public-http routes (site render/media/forms/seo/robots/sitemap/llms/health)
- [ ] B — admin-http routes (sites/media/newsletter/posts/pages/plugins/credentials/entries/seo/etc.)
- [ ] C — assistant module (tool-failure-recovery, external-mcp-oauth/reauth, mcp-federation, agent-daemon-server)
- [ ] D — runtime/composition/boot + contracts (entry-refs, embeds) + cli (theme validate/migrate)

## Summary counts

(filled in when all chunks complete)

- Chunks audited: 0/4
- Findings raised by Gemini: TBD
- Confirmed: TBD
- Discarded (disproved): TBD
- Unverified (needs a test run): TBD

## Findings (ordered by severity)

(none yet — audit in progress)
