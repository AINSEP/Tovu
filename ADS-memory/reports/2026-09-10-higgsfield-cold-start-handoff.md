# Handoff — Higgsfield cold start from chat (tovu-12 -> tovu-34), 2026-09-10

Goal: drive a Higgsfield cold start entirely from the Tovu assistant chat — OAuth sign-in, image
generation, land the image in Media. Owner's framing: "I wanna make sure this plugin works from
nothing."

## Deliberate clean slate

- `external_mcp_servers` is EMPTY (0 rows). The `higgsfield` row was deleted on the owner's
  instruction. Backup incl. sealed OAuth columns:
  `ADS-memory/.local-artifacts/higgsfield-backup/external_mcp_servers-20260910-205007.sql`
- `higgsfield-media` is already `enabled: true` in the workspace activations.
- Dev server restarted ~20:52, healthy. `.env` has `TOVU_PUBLIC_URL=https://localhost:3000`
  (now redundant — see 7cf490c9 — and leaving it means the new fallback is not exercised).

## Landed tonight, branch `restructure/apps-website-phased`

| Commit | What |
|---|---|
| `e30548ea` | Plugin `mcp.json` provisions a REAL `external_mcp_servers` row. Verbatim server key as the connection id (no hash suffix), so `mcp__higgsfield__*` in SKILL.md is correct. An existing row is ADOPTED, never overwritten. 15/15. |
| `7cf490c9` | OAuth callback origin auto-derives from the process bind origin; `TOVU_PUBLIC_URL` is now a fallback for proxied deploys, not a prerequisite. |
| `3c4e30d8` | **The blocker.** OAuth handshake state moved from an in-memory Map to `content.db` (migration 0062). Assistant tools run in the DAEMON, a different process from the web server, so a chat-started sign-in minted state the callback could never see. 42/42, incl. redemption via a second store instance, replay refusal, single-use. |
| `d9774b3d`, `106680bc` | Operator-chosen fs root (`root: "custom"`), persisted per workspace at `<site>/.fs-custom-root.json`. Unrelated to Higgsfield. |
| `1a3d749a` | REVERT of `8b76c276` (desktop folder drag-drop). Do not resurrect: it armed only the small folder chip, and in a browser the bridge is absent by design, so a dropped folder went to Jini's attachment path and hit the 20MB cap. |

## Where it is still not pure chat

Chat CAN: create the row, start OAuth and hand over the link, detect completion via
`content_read.external_mcp` -> `oauth.status`, set both tool lists, then generate -> poll ->
`media_import_from_url`.

Chat CANNOT: complete the sign-in (human does that in their own browser), or restart the assistant.
Federation config is read ONCE at daemon start by design, so a write grant does nothing until a
restart. The admissions banner has that button.

## Verified connection facts (fetched live 2026-09-10)

`https://mcp.higgsfield.ai/mcp`, `streamable_http`, OAuth ONLY — there is no API key, never ask for
one. PKCE S256; `token_endpoint_auth_methods_supported` includes `"none"` (public client, no secret
to store). Tovu self-configures endpoints and client id via RFC 8414 discovery + RFC 7591 dynamic
registration, so leave every `oauth*Endpoint` and `oauthClientId` UNSET. The only value a human
supplies is the URL. Full report: `ADS-memory/reports/2026-09-10-higgsfield-mcp-research.md`.

SKILL.md's 7 tool names matched the live allowlist before deletion — trust it over the open web.
Higgsfield does not publish its tool list at all.

## Traps

- An API restart is needed to pick up `3c4e30d8`. Migration 0062 auto-applies on open.
- Every save under `apps/website/src` kills the daemon (~3s) and destroys a live chat run.
- `generate_image` declares `readOnlyHint:false` -> must be in BOTH `allowedToolNames` and
  `writeAllowedToolNames`, or it is refused `remote-declares-not-read-only` — a refusal visible only
  in the daemon log, never to the model. Never invent a reason for a missing tool.
- Never pass `sync:true` to `job_status` (server waits ~25s, transport aborts at 15s).
- Model choice is an account paywall: `z_image` works; `gpt_image_2` / `recraft_v4_1` return
  "Requires basic plan or higher".
- Another session's uncommitted files — do not touch: `assistant/tool-registrations.ts` + its
  contracts test, `features/agent-plugins/{tool-registrations,activation}.ts` + activation test,
  `features/forms/tool-registrations.ts`, `composition/tool-catalog-manifest.ts`,
  `development/todos.md`, untracked `features/agent-plugins/uninstall.ts` + its two tests.

## Open, not started

- Per-site plugin memory — spec at `ADS-memory/specs/2026-09-10-agent-plugin-memory.md`. Stops
  SKILL.md hardcoding per-account facts.
- Widen the folder drop to the whole composer; rebuild `apps/admin/dist` (current one is a stale
  Aug 31 prebuilt, gated by `check-no-linked-jini.mjs` because Jini is symlinked).
- In-chat `plugins_set_enabled` does not get the MCP provisioning wiring (admin route only).
- `external-mcp-repo.sqlite.test.ts`: 5 pre-existing fixture failures (`aadVersion`/
  `oauthAadVersion`), predate tonight, left alone.
- Admin UI button coverage + the dead uninstall affordance:
  `ADS-memory/reports/2026-09-10-admin-ui-button-test-todo.md`.
