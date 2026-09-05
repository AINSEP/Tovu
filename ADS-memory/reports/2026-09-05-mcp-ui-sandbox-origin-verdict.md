# MCP-UI Sandbox Origin Verdict — 2026-09-05

Reviewing commit `d3834ec2` ("fix(admin): stop granting MCP-UI surfaces this admin origin's authority").
Settles two claims left open by a prior (Gemini) audit of the `data:`-URL sandbox change.

Status: IN PROGRESS — skeleton committed, investigation underway.

## Claim 1 — Self-navigation bypass
Claim: guest iframe can navigate itself away from the `data:` URL to a same-origin
location and thereby regain the admin origin.

**Verdict: TBD**

## Claim 2 — postMessage handshake origin mismatch
Claim: host (admin) or guest (`data:` iframe) postMessage handshake uses a permissive
target origin (`"*"`) or an origin check an opaque-origin guest can satisfy/spoof,
undoing the isolation the `data:` URL is meant to provide.

**Verdict: TBD**

## Evidence log
(appended as investigation proceeds)
