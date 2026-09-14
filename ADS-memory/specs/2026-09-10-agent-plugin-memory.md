# Spec — per-site Agent Plugin memory

Status: DRAFT, not started. Owner-requested 2026-09-10; owner decisions recorded 2026-09-14 (see "Decisions").

## The problem

Two kinds of site-specific knowledge have no home today.

**1. Facts a plugin learns about this site's account.**
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

**2. Project knowledge the user wants a plugin to know (added 2026-09-14, owner).**
A user often has idiosyncratic knowledge about their own project that a plugin should always apply —
naming conventions, brand rules, which account or project to use, things that went wrong before. They
must be able to save it for one plugin, and it must NOT be overwritten when that plugin is updated.

## Why not write into the package

Installed packages live at `<site>/agent-plugins/ws/<workspace>/packages/sha256/<digest>/`. The
digest IS the directory's identity. Writing inside it makes the name a lie and breaks
`installAgentPlugin`'s "already published, skip" short-circuit, and an update installs a new digest
directory, so anything written into the old one would be left behind.

The read-only `chmod` is NOT the reason. `install.ts:511-519` says plainly it is "best-effort
defense against an ACCIDENTAL same-process write ... not a security boundary" — that part is our own
typo-guard and could be changed. The content-addressing is the real constraint, and it is worth
keeping: **the digest is what proves a downloaded marketplace package is what the vendor published.**
Trading it away to gain writability would cost more than it buys.

## Shape

A writable SIBLING of the packages directory, per workspace, keyed by plugin id — the same position
`activations.json` already occupies — named `memory/`, with one subfolder per kind of knowledge:

    <site>/agent-plugins/ws/<workspace>/
      packages/sha256/<digest>/     immutable, verifiable (unchanged)
      activations.json              mutable (exists today)
      memory/<pluginId>/            NEW — mutable, per plugin
        learned/                    what the plugin discovered about this site's account
        notes/                      what the user wrote about their project for this plugin

Properties shared by both subfolders:
- Scoped per workspace AND per plugin id. A plugin can never read or write another plugin's memory.
- Keyed by plugin id, not digest, so it survives plugin updates and reinstalls — that is the point.
- Size-capped per plugin, same posture as the install byte caps.
- Path containment via `package-paths.ts`'s `assertContainedOnDisk`, as the package reader already
  does — one implementation, not two.
- UTF-8 text only (notes, not assets).

How the two subfolders differ:

| | `learned/` | `notes/` |
|---|---|---|
| Written by | the plugin (its skill, via the write tool) | the user in the admin, or the assistant on the user's explicit request |
| Nature | cache: deleting it must degrade to "rediscover", never to broken | source of truth: cannot be rediscovered |
| On plugin update | kept (may be refreshed by the plugin) | kept, never modified |
| On plugin uninstall | kept (see Decisions) | kept, never silently deleted |
| Loaded into the agent | on demand, via the read tool | automatically, whenever the plugin's skill is used |

## What goes in it

`learned/` — facts the plugin LEARNED about this site's account:
- the real tool list + schemas from an authenticated `tools/list`
- which models this account may use, and which are plan-gated (with the verbatim error)
- vendor quirks discovered at runtime

`notes/` — project knowledge the USER provides for this plugin:
- conventions, preferences and constraints specific to their project
- context the plugin cannot discover (which project or account to use, what to avoid)

## What must NOT go in it — each has a correct home already

| Not this | Where it belongs | Why |
|---|---|---|
| Credentials, tokens, OAuth secrets | `external_mcp_servers` sealed columns | already sealed with AAD; a text file is not |
| OAuth handshake / pending state | DB, short TTL | needs atomic single-use consume across processes — see [[reference-assistant-tools-run-in-a-separate-process]] |
| Tool allowlists / write grants | the connection row, operator-set | a downloaded package must never grant itself access — the rule built 2026-09-10 in `federate-mcp.ts` (provisioning is not authorization) |

That last row is the one to hold firm on, and it applies to `notes/` too: a note can tell the plugin
how to behave, but it can never grant a tool or widen access. The plugin may SUGGEST tool names in its
`mcp.json`; only the operator grants them.

## Access

- A read/write tool pair, scoped so the calling plugin's id selects the directory — the plugin must
  not be able to name someone else's. Follow `theme_write_file`'s shape for the write tool (UTF-8
  text, containment-checked). The plugin's own write tool may write only `learned/`.
- `notes/` is edited by the user: an admin editor on the Agent Plugins page (next to the plugin's file
  viewer), plus an assistant tool that writes a note only when the user asks for it.
- At skill activation, the contents of `notes/` are added to the plugin's context automatically.
  Because this costs tokens on every run, `notes/` has its own size cap.

## Decisions (owner, 2026-09-14)

1. **Name:** the folder is `memory/`, holding both the plugin's learned knowledge and the user's
   project knowledge, in `learned/` and `notes/` subfolders.
2. **Tovu-only extension.** The public Agent Plugins standard is not ours to change. Plugins written to
   that standard keep working unchanged; Tovu adds `memory/` alongside them.
3. **Survives updates and reinstalls** (keyed by plugin id, not package digest).
4. **Loading:** `notes/` loads automatically when the plugin is used; `learned/` is read on demand.
   (Coordinator default, accepted by the owner.)

## Open questions

1. On uninstall, `memory/` is kept (same reasoning as a provisioned external-MCP row surviving — the
   operator earned it, and silent deletion is unrecoverable). Should the uninstall confirmation offer
   an explicit "also delete this plugin's memory" choice?
2. Size caps for `learned/` and `notes/` — pick numbers against real skill context budgets.

## First slice

Do not build the general facility first. Build it for `higgsfield-media`: let the skill record this
account's model verdicts and the authenticated tool list in `learned/`, have the skill read them
instead of its hardcoded table, and let the user add one note that the skill then applies. If that
removes real guessing, generalize. If it does not, the general facility would not have helped either.

## Related

- Agent Plugins page (owner decision 2026-09-14): one list; every plugin has an On/Off switch; any
  plugin the user added (manual test install, install from a link, future Marketplace) also gets
  Uninstall behind a confirmation; plugins built into Tovu are labelled "Built in" and can only be
  switched off; the separate "Downloaded" tab is removed.
- Manual plugin install for testing (owner ask 2026-09-14, later): a developer can attach a plugin they
  wrote or vibe-coded by hand, test it, and uninstall it.
