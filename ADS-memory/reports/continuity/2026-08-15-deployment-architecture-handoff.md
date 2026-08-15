# Handoff: deployment architecture settled — ready to build the Deploy section

Generated: 2026-08-15
Source agent/session: Coordinator (Review Mode), Claude Opus 5 (1M), Claude Code on darwin
Target: Claude Code (fresh session), same repo

> **Save-location note:** written to `ADS-memory/reports/continuity/` rather than the skill's default
> `.local-artifacts/handoff/`, deliberately. `.local-artifacts` is gitignored and one `git clean`
> from gone; this handoff and its companion doc are meant to survive.

## Next-Agent Prompt

```
Read AI-Dev-Shop/AGENTS.md first, then development/docs/deployment/deployment-constraints.md
in full — it is the output of a 4-model fact-checking debate and it exists specifically to stop
you re-deriving wrong answers about deployment. Then read
ADS-memory/reports/continuity/2026-08-15-deployment-architecture-handoff.md.

We are starting the Deploy section. Do not propose Vercel/Cloudflare as hosts for the Tovu
server, do not describe the Postgres migration as "in flight", and do not plan a static exporter
around the sitemap — the constraints doc explains why all three are wrong, with path:line
evidence. Begin by confirming with the owner which of the two products in §9 they are building,
because it changes what the panel is.
```

## Current State

Deployment architecture is **researched and settled; no deployment code has been written.** The
session produced understanding, not implementation. `panels.tsx` still carries the untouched
`id: "deployment"` stub (`soon: true`, placeholder tabs Home/GitHub/AWS).

A `/debate` run with 4 participants (Opus 5 primary, Sonnet 5 subagent, `gpt-5.6-sol`, two agy
Gemini models) fact-checked 21 claims against source. **Six were wrong or materially overstated.**
Three further blockers were discovered that nobody was looking for.

## Completed Work

- **`development/docs/deployment/deployment-constraints.md`** — NEW, the primary deliverable. 11
  sections, every claim carrying `path:line` or a cited URL. Read this before any deployment design.
- **`development/todos.md`** — appended a first-run onboarding wizard entry (deferred by owner, but
  flagged load-bearing; the reversibility requirement is the hard part).
- **Debate artifacts** — `ADS-memory/reports/swarm-consensus/offloads/2026-08-13-deploy-arch/`
  (6 files: each participant's response, the primary's pre-dispatch frozen position, and the exact
  evidence bundle the agy peers were limited to). Packet at
  `ADS-memory/reports/swarm-consensus/context/CTX-tovu-deploy-architecture-2026-08-13.md`.
- **Unrelated work that also landed this session** (both committed, both verified):
  - `settings-raw` feature deleted — Tovu `ef3e5f4` + `1c30c1e`. Build green, 186 scoped tests pass.
  - `TabbedDialog` extracted from `SettingsDialogShell` — Jini `79f05be3`, Tovu `ce950a3`. CSS
    renamed `jini-settings-dialog-*` → `jini-tabbed-dialog-*`. **`data-testid`s deliberately NOT
    renamed** — 9 Tovu Playwright specs hard-code the old prefix and could not be run to verify.

## Active Files And Artifacts

| Path | Why it matters |
|---|---|
| `development/docs/deployment/deployment-constraints.md` | **Read first.** The settled facts and the six corrections. |
| `development/todos.md` (tail) | Onboarding wizard rationale + reversibility requirement. |
| `apps/admin/src/panels.tsx` (`id: "deployment"`) | The stub to be replaced. Its Home/GitHub/AWS tabs are the wrong shape. |
| `ADS-memory/.../offloads/2026-08-13-deploy-arch/codex-gpt56sol-round1.md` | Most rigorous ledger; found the multi-tenancy, password and origin blockers. |
| `ADS-memory/reports/swarm-consensus/runs/2026-08-12-tovu-six-debates-FINAL.md` §6 | Prior debate: the `Release`/`Environment`/`DeploymentTarget`/`DeploymentRun` domain, and the `EgressPolicy` warning (no `allowedHosts`; pin origin inside the adapter, `maxRedirects: 0`). |

## Decisions And Constraints

- **Container-first.** All four debate participants agreed a stateful control plane is unavoidable;
  none chose "make Tovu serverless."
- **Vercel/Cloudflare host rendered output, never the Tovu server.** Blocker is the process model
  (detached child daemon, `app.listen`, `worker_threads`, local disk) — *not* SQLite.
- **Deploy tabs, if built: Home / Providers / History.** Vendors are rows in a list, never tabs.
- **Owner explicitly wants the admin publicly reachable** (`theirsite.com/admin`, password login).
  This forces an always-on control plane and rules out private-authoring static export as the final
  product. It also collides with §4.3 — see risks.
- **Onboarding wizard deferred**, but its answers must never be a one-way decision.
- **Docker work was started and stopped by the owner.** Nothing was written; tree is clean of it.

## Risks And Open Questions

1. **THE open question, and it is the owner's, not an agent's:** which product is this — hosted SaaS
   for non-technical users, or self-hosted for developers? Constraints doc §9. It changes whether the
   Deploy panel is nearly empty (Publish + domain + status) or a full provider-credential surface.
   **Ask before designing.** Owner's stated user ("knows nothing about tech, wants a website to sell
   things") points hard at hosted SaaS.
2. **Multi-workspace hosting does not exist** (`resolve-workspace.ts:15-21`) — one workspace per
   process, chosen at boot. This gates the hosted-SaaS product entirely and is bigger than any
   provider adapter.
3. **Security, true today, independent of deployment:** default owner password `tovu-dev` not caught
   by the production gate; theme JS shares an origin with the admin (XSS→admin takeover). Constraints
   doc §4.2/§4.3. Arguably should be fixed before anything is deployed publicly.
4. **Do not trust this repo's doc comments.** Several encode inference as observation; at least one
   was measurably false. Read code, not prose about code.
5. **Two agy peers never got tools** (one blocked by the harness permission classifier, one hit agy's
   5-minute `--print-timeout`) — both failure modes produce a **silent zero-byte file**. Their
   verdicts came from a curated bundle the coordinator chose. Weight accordingly; do not cite the
   debate as four independent verifications.
6. **Working tree is busy.** Another session's useWiredX DI sweep is in flight
   (`2026-08-15-usewired-di-sweep-handoff.md`); many modified files are not from this session. Check
   `git status` before assuming ownership of anything.

## Suggested Skills

- `codebase-memory` — structural queries over the deployment/theme/render surface.
- `/debate` — only if a genuinely new architectural fork appears; the current one is settled.
- ADS `devops` persona (`AI-Dev-Shop/agents/devops/skills.md`) — if containerization resumes.

## Next Steps

1. **Ask the owner the §9 product question.** Everything downstream depends on it. Do not guess.
2. If hosted SaaS: scope **request-time hostname→workspace resolution** — the real first slice.
3. If self-hosted: resume the Dockerfile. The four hard parts are pre-identified in
   `reference-tovu-docker-build-traps` memory + constraints doc §3 (22 `file:` deps escaping the
   build context is the main event).
4. Either way, consider fixing §4.2/§4.3 first — cheap now, incidents later.
5. Reshape the `deployment` panel stub to Home / Providers / History **only after** step 1.

## Handoff Contract

- **Inputs used:** this session's conversation; `git status --short`; `git log`; direct reads of
  `panels.tsx`, `render.ts`, `theme.ts`, `liquid-sandbox.ts`, `index.ts`, `byok-provider-turn.ts`,
  `submit-service.ts`, `cli/program.ts`, both `package.json`s, `.gitignore`; a 4-participant swarm
  debate; live web verification of Cloudflare Node compatibility and vendor pricing.
- **Output summary:** a durable constraints document that prevents six specific wrong turns, a
  deferred-but-specified onboarding requirement, and a named blocking product question.
- **Risks:** the product question is unanswered; multi-tenancy is absent; two security issues are
  live; two debate peers were evidence-limited.
- **Suggested next assignee:** Coordinator (Review Mode) to put the §9 question to the owner, then
  Software Architect for the chosen slice.
