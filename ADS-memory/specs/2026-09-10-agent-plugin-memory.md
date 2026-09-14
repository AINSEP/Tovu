# Spec — per-site Agent Plugin memory

Status: DRAFT, not started. Owner-requested 2026-09-10.

## The problem

`content/agent-plugins/higgsfield-media/skills/higgsfield-media/SKILL.md` hardcodes facts that are
true of ONE account on ONE day:

- the 7 tool names (`generate_image`, `models_explore`, `job_status`, `jobs_wait`,
  `show_generations`, `reveal_generation`, `show_generation_by_ids`)
- which models work (`z_image` yes; `gpt_image_2`, `recraft_v4_1` "Requires basic plan or higher")
- the shape of `generate_image`'s arguments

A web-research pass on 2026-09-10 could not corroborate ANY of it publicly, and found an MCP
directory stating outright that Higgsfield's tool list is unpublished and discovered live after
authentication. The names turned out to be correct — they match the live allowlist in this install's
own DB — but that is luck of having run it once, not knowledge the plugin can carry.

Every one of those facts is per-account: a different operator on a paid plan gets a different model
verdict, and a vendor shipping a new tool changes the list. A plugin that asserts them globally is
wrong somewhere by construction. **The plugin should DISCOVER them per site and remember, instead of
asserting them from its package.**

## Why not write into the package

Installed packages live at `<site>/agent-plugins/ws/<workspace>/packages/sha256/<digest>/`. The
digest IS the directory's identity. Writing inside it makes the name a lie and breaks
`installAgentPlugin`'s "already published, skip" short-circuit.

The read-only `chmod` is NOT the reason. `install.ts:511-519` says plainly it is "best-effort
defense against an ACCIDENTAL same-process write ... not a security boundary" — that part is our own
typo-guard and could be changed. The content-addressing is the real constraint, and it is worth
keeping: **the digest is what proves a downloaded marketplace package is what the vendor published.**
Trading it away to gain writability would cost more than it buys.

## Shape

A writable SIBLING of the packages directory, per workspace, keyed by plugin id — the same position
`activations.json` already occupies:

    <site>/agent-plugins/ws/<workspace>/
      packages/sha256/<digest>/     immutable, verifiable (unchanged)
      activations.json              mutable (exists today)
      plugin-state/<pluginId>/      NEW — mutable, per plugin

Properties:
- Scoped per workspace AND per plugin id. A plugin can never read or write another plugin's state.
  Survives reinstall/upgrade (keyed by plugin id, not digest) — that is the point.
- Cache-like: deleting the whole tree must degrade to "rediscover", never to broken. Nothing may
  become load-bearing for correctness.
- Size-capped per plugin, same posture as the install byte caps.
- Path containment via `package-paths.ts`'s `assertContainedOnDisk`, as the package reader already
  does — one implementation, not two.

## What goes in it

Facts the plugin LEARNED about this site's account:
- the real tool list + schemas from an authenticated `tools/list`
- which models this account may use, and which are plan-gated (with the verbatim error)
- vendor quirks discovered at runtime

## What must NOT go in it — each has a correct home already

| Not this | Where it belongs | Why |
|---|---|---|
| Credentials, tokens, OAuth secrets | `external_mcp_servers` sealed columns | already sealed with AAD; a JSON file is not |
| OAuth handshake / pending state | DB, short TTL | needs atomic single-use consume across processes — see [[reference-assistant-tools-run-in-a-separate-process]] |
| Tool allowlists / write grants | the connection row, operator-set | a downloaded package must never grant itself access — the rule built 2026-09-10 in `federate-mcp.ts` (provisioning is not authorization) |

That last row is the one to hold firm on. The plugin may SUGGEST tool names in its `mcp.json`; only
the operator grants them.

## Access

A read/write tool pair, scoped so the calling plugin's id selects the directory — the plugin must not
be able to name someone else's. Follow `theme_write_file`'s shape for the write tool (UTF-8 text,
containment-checked). Note the same binary limitation applies and is fine here: this is notes, not
assets.

## Open questions

1. Does plugin state survive plugin UNINSTALL? Proposed: yes, same reasoning as a provisioned
   external-MCP row surviving — the operator earned it, and silent deletion is unrecoverable.
2. Should a skill be able to read its memory as CONTEXT automatically at activation, or only via an
   explicit tool call? Automatic injection is more useful and costs tokens on every run.
3. Does this deserve to be part of the Agent Plugins open standard proposal, or stay a Tovu
   extension? It is exactly the kind of thing a marketplace ecosystem needs.

## First slice

Do not build the general facility first. Build it for `higgsfield-media`: let the skill record this
account's model verdicts and the authenticated tool list, then have the skill read them instead of
its hardcoded table. If that removes real guessing, generalize. If it does not, the general facility
would not have helped either.
