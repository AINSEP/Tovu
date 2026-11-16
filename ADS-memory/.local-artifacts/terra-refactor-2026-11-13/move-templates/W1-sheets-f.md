# W1 sheets, Group F (continuation of group B) — PARTIAL
Run 2026-11-16, unattended, from Tovu `b28d38c6` / Jini `b7666092` (both `refactor/terra`). Docs only; no source edits. Branch `plan/w1-sheets-f` (from `plan/w1-sheets-b`).
Order given: member-login (#28), skills (#24), db/kernel remaining (#17), site-dir (#25). Stopped before site-dir at the context budget; `split-site-dir.md` is still group B's NOT FILLED triage.

| # | feature | sheet | slices filled | status | untangle overlap |
|---|---|---|---|---|---|
| 28 | website/features/member-login | `sheets/split-member-login.md` | HD-member-login-1 (HARDEN, security: canonical-base64url state codec -> `@jini-ai/oauth` `createSealerStateCodec`, 4 failing tests first), MV-member-login-1 (`decideMemberLogin` -> `@jini-ai/user-management/server`) | 2 READY, after wave B; HD-2 BLOCKED (Q-codec-port); SP-1/2/3 triaged (Opus) | C3:387 (link-service.ts), C4:194 (oidc-login.ts): both READY slices **after wave B** (text-guarded, neither touches the C3/C4 line) |
| 24 | website/features/skills | `sheets/split-skills.md` | SP-skills-1 (core ToolRegistry live-registration adapter -> `@jini-ai/agentic/skills/install`), SP-skills-2 (skill tool loader + registrations -> NEW `@jini-ai/agentic/skills/tools`) | 2 READY, run now | none |
| 17 | website/platform/db/kernel | `sheets/move-kernel.md` (appended) | MV-kernel-2 (`sqlite-only.ts` -> `@jini-ai/db/kernel/sqlite`, 10 importers) | READY **after wave B** (C3t:74 precondition); MV-kernel-3 + SP x4 still Opus/blocked | C3t:74, C3:307,310 |
| 25 | website/platform/site-dir | `sheets/split-site-dir.md` | - | NOT FILLED (budget) | C3t:284 |

## Executable now
SP-skills-1, then SP-skills-2.
## After the wave B (untangle) merge
HD-member-login-1, MV-member-login-1, MV-kernel-2 (plus group B's SP-commands-1).

## Decisions made in the sheets (no owner input needed)
- skills CORE-CONTRACT-NEEDED resolved WITHOUT a core change: `InstalledSkillToolPorts` + `SkillToolRegistrationHost` declared in the moved agentic file (precedent: `AgentPluginHostToolPorts` in agent-plugins); `SkillFileReadPort` structurally mirrors agent-plugins' `SkillFileReader.read`. New subpath `./skills/tools` because the code needs `@jini-ai/core` at runtime and core is an optional peer of agentic.
- member-login `stateCodec`: real HARDEN (Jini had no canonical-base64url check). Tovu-observable behaviour unchanged (both call paths map every error to LOGIN_INVALID); `check:seal-aad` unaffected (Tovu keeps `sealState`).
- member-login `link-policy.ts`: `MemberRecord` narrowed to a structural `{ id, status }`; pure MOVE.

## Coordinator question
- Q-codec-port (HD-member-login-2): add `createSealerStateCodec` to the `OAuthFlowOperations` core contract so `@jini-ai/integrations` hosted-mcp can drop its two codec copies that lack the canonical check (behaviour change in Jini; failing tests first). Recommended: yes.
