# Cloud dispatch — ROOT CAUSE FOUND (2026-08-20 ~18:45Z)

Supersedes the "status UNKNOWN" section of
`ADS-memory/reports/continuity/2026-08-20-session-handoff-coverage-and-complexity-campaign.md`.

## Verdict

Cloud dispatch infrastructure **works**. The **model call fails.**

Evidence, read directly from the cloud session UI
(`https://claude.ai/code/session_01MmsVPAyMPEETuT8T5N3A27`, smoke test 2):

```
Initialized session
  [ok] Set up a cloud container
  [ok] Cloned repository
  [ok] Started Claude Code
  [X]  An API error occurred
       "An error occurred while executing Claude Code. You can try again
        by sending a new message or starting a new session."
```

The agent never emitted a single turn. That is why every dispatch produces
no commit, no branch, no report — there is nothing to produce.

## Ruled OUT (do not re-investigate)

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Wrong repo URL in trigger | NO | `https://github.com/leonaburime-ucla/Tovu-AI-CMS` matches `git remote -v` exactly |
| Private repo / no clone access | NO | session log shows **"Cloned repository" succeeded** |
| No GitHub write permission | NO | `gh api repos/...` → `permissions.push: true, admin: true` |
| `persist_session` flag | NO | smoke 1 `false` and smoke 2 `true` both died identically |
| Trigger never fires | NO | all 20 triggers show `last_fired_at` + `ended_reason: run_once_fired` |
| Bad call shape / env id | NO | `env_01GWF3Hkm8ubh9TFhDvAis5r` is the same env used by all 20 triggers |
| Container/setup failure | NO | "Set up a cloud container" and "Started Claude Code" both succeeded |

## Still open

Why the API call errors. The UI's "View details" reveals only a timestamp — no
status code, no request id. Candidates not yet distinguished:

1. Transient API incident during the 17:49–18:36Z window (4 dispatches, all in ~47 min).
2. Account/plan-level usage limit on the cloud fleet (account shown: `Noel · Max`).
3. The `Claude_Code_Remote` MCP connection
   (`https://api.anthropic.com/v1/code/mcp/meta`, attached to every trigger)
   failing at startup and aborting the first turn.

**Cheapest next test:** press `Try again` on the smoke-test-2 session, or
`RemoteTrigger {action:"run", trigger_id:"trig_01VvHwYkthBEtVF12eFcKnyX"}`.
Same-error → systemic (chase 2 or 3). Success → it was 1, and cloud dispatch is usable.

## Historical note

No cloud session has **ever** produced a commit in this repo. Only two commit
authors exist across all branches (`Leona Burime`, `Claude <noreply@anthropic.com>`
— the latter from local Claude Code). `origin/cloud/adr-052-reconcile` was authored
locally by Leona on 2026-08-03, not by a cloud agent. The 2026-08-19 06:09Z
"Overnight: fix Tovu CI" trigger also produced nothing.

## Trigger inventory, today

| id | fired (UTC) | persist_session | result |
|---|---|---|---|
| `trig_019hEwrYkhtC1oyVjJHPPXMv` | 17:58:53 | false | nothing |
| `trig_01PX3kySVzpnMuKNyeVWTjNG` | 18:12:22 | false | nothing |
| `trig_01XGbVJTUpGHzC4DWZrnNQXV` (smoke 1) | 18:32:58 | false | nothing |
| `trig_01VvHwYkthBEtVF12eFcKnyX` (smoke 2) | 18:36:43 | **true** | **API error, confirmed in UI** |

---

## UPDATE 18:51Z — retry ran, SAME ERROR. Not transient.

`RemoteTrigger {action:"run", trigger_id:"trig_01VvHwYkthBEtVF12eFcKnyX"}` → HTTP 200,
`last_fired_at: 2026-08-20T18:51:30Z`. Session UI now shows two identical failures
15 minutes apart:

```
Scheduled check-in → Initialized session → An API error occurred   (18:36Z)
Scheduled check-in → Resumed session     → An API error occurred   (18:51Z)
```

`origin/general-work` unchanged at `81f88354`. No smoke branch. **Suspect 1
(transient API incident) is ELIMINATED.**

## Config is byte-identical across all 20 triggers

Every trigger since 2026-08-04 carries the same two things, and **not one of the 20
has ever produced a commit**:

- `mcp_connections: [{name: "Claude_Code_Remote", url: "https://api.anthropic.com/v1/code/mcp/meta",
  permitted_tools: [], transport_type: "http"}]`
- a **raw** `allowed_tools` array (`['Bash','Read','Write',...]`) with no `preset:` entry —
  the sole exception, `trig_017GzgEqMaPZukCVetTWKtHj` (2026-08-19), used
  `['preset:default','Task','Bash','Glob',...]` and **also produced nothing.**

A 16-day, 20-for-20 failure streak also argues against a usage limit (limits reset).
The remaining hypothesis is that one of those two config fields is malformed for this
API and aborts the first turn.

## Next test: bisect the trigger config

Create one minimal trigger — **no `mcp_connections`, no `allowed_tools`**, trivial
prompt, same repo/env — and fire it. Then add back one field at a time.

- works → bisect tells us which field is poison; strip it from the real briefs and go.
- still fails → the fault is in the account/environment, not the call, and this needs
  Anthropic support with session id `session_01MmsVPAyMPEETuT8T5N3A27`.

---

## UPDATE 18:55Z — the two "suspicious" fields are SERVER DEFAULTS

Created `trig_01VZFLgrrsHdBFtazAfAvVnK` ("BISECT A") deliberately **omitting** both
`mcp_connections` and `session_context.allowed_tools`. The HTTP 200 response came back
with both fields **populated by the server**:

```
mcp_connections: [{name: "Claude_Code_Remote",
                   url: "https://api.anthropic.com/v1/code/mcp/meta",
                   connector_uuid: "bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a",
                   permitted_tools: []}]
allowed_tools:   ["preset:default","Task","Bash","Glob","Grep","Read","Edit","MultiEdit",
                  "Write","NotebookEdit","WebFetch","TodoWrite","WebSearch","BashOutput",
                  "KillBash","Skill","Tmux","Monitor","SendUserFile","REPL"]
```

**Consequence:** neither field is caller-chosen. They appear on all 20 historical triggers
because the API injects them. `mcp_connections` cannot be removed from the caller side at
all, so it cannot be bisected away via `create`. The only variable BISECT A actually
changes is `allowed_tools`: full `preset:default` instead of the restricted
`['Bash','Read','Write']` used by smoke 1/2.

If BISECT A also fails, the fault is **not in the request body**, and the escalation path
is Anthropic support with `session_01MmsVPAyMPEETuT8T5N3A27` plus this trigger id.

---

## Owner hypothesis (2026-08-20): peak-hours capacity throttling

Owner's theory: cloud sessions are refused during US business hours because fleet
capacity is being reserved. **Test it by re-firing late at night.**

Failure timestamps so far, in US Pacific (the relevant business-hours clock):

| UTC | US/Pacific | day | result |
|---|---|---|---|
| 2026-08-04 17:05–17:32 | 10:05–10:32 | Tue | 5 triggers, nothing |
| 2026-08-08 22:33–23:00 | 15:33–16:00 | Fri | 6 triggers, nothing |
| **2026-08-19 06:09** | **2026-08-18 23:09** | **Tue night** | **nothing — OFF-PEAK COUNTEREXAMPLE** |
| 2026-08-20 17:58–18:58 | 10:58–11:58 | Thu | 5 triggers, nothing |

**The theory has one counterexample already:** the 2026-08-19 06:09Z run fired at
23:09 Pacific / 02:09 Eastern — as off-peak as it gets — and also produced nothing.
Its session (`session_01CS8ohFFcss13g61YywXp6M`) is **no longer retrievable**
("This session could not be found"), so we cannot confirm it failed the *same* way
rather than failing for an unrelated reason. The counterexample is suggestive, not decisive.

**Clean overnight test to run:** re-fire `trig_01VvHwYkthBEtVF12eFcKnyX` (smoke 2) at
~03:00 UTC (20:00 PDT) or later and check `origin/general-work` + the session UI. That is
a one-line `RemoteTrigger {action:"run"}` — no new trigger needed, and it keeps every
other variable fixed.

---

## UPDATE 18:59Z — BISECT A also failed. `allowed_tools` eliminated.

`trig_01VZFLgrrsHdBFtazAfAvVnK`, fired 18:59:01Z with the **full server-injected
`preset:default` toolset** (20 tools) instead of smoke 2's restricted
`['Bash','Read','Write']`. `ended_reason: run_once_fired`. `origin/general-work` still
`81f88354` after 8 minutes of 30-second polling. No `cloud/bisect-a` branch.

### Elimination table — 21 triggers, 0 successes

| variable | tested how | verdict |
|---|---|---|
| repo URL | matches `git remote -v` byte for byte | not it |
| clone access (private repo) | session UI: "Cloned repository" ✅ | not it |
| push permission | `gh api` → `push: true, admin: true` | not it |
| container / runtime | session UI: "Set up a cloud container" ✅, "Started Claude Code" ✅ | not it |
| `persist_session` | false (smoke 1) and true (smoke 2) — identical failure | not it |
| `allowed_tools` restricted | `['Bash','Read','Write']` — failed | not it |
| `allowed_tools` full default | `preset:default` + 19 — **failed (BISECT A)** | not it |
| transient API incident | same session retried 15 min later — identical failure | not it |
| `mcp_connections` | **CANNOT be tested from the caller** — server injects it even when omitted | **untested** |

### What is left

Only two live hypotheses, and **neither is fixable from this repo**:

1. The server-injected `Claude_Code_Remote` MCP connector
   (`https://api.anthropic.com/v1/code/mcp/meta`, `permitted_tools: []`) fails at
   startup and aborts the first turn. Cannot be omitted via `create`.
2. Account/fleet-level refusal — the owner's peak-hours capacity theory (see above).

### Escalation payload

If filing with Anthropic support, include:

- session `session_01MmsVPAyMPEETuT8T5N3A27` (two identical failures, 18:36Z and 18:51Z)
- trigger `trig_01VZFLgrrsHdBFtazAfAvVnK` (clean-config bisect, 18:59Z)
- environment `env_01GWF3Hkm8ubh9TFhDvAis5r`
- account `7729cd05-7820-475c-a0f6-ba099bb28863` (display name "Noel", Max plan)
- symptom: container + clone + Claude Code start all succeed; the **first model turn**
  returns a bare "An API error occurred" with no status code and no request id in the UI.
