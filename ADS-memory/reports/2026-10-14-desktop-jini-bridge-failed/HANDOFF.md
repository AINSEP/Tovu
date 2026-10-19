# Desktop 0.1.17: in-app assistant has no tools (jini MCP bridge fails) — 2026-10-14

From tovu-0c to tovu-4a. **The owner is very angry.** Tool calls don't work in the shipped desktop app, and no test caught it. Quote: "there should be tests for that. So it's pretty unfucking believable."

## What the owner saw
Screenshot: `ADS-memory/reports/2026-10-14-desktop-jini-bridge-failed/chat-failed-screenshot.png`
Packaged Tovu 0.1.17, new site `order-pinch`, first chat message → "The assistant could not continue this answer."

## Evidence (read-only, from the live site)
- Site: `/Users/la/Documents/Tovu/order-pinch` (port 51116, conversation `091b24a3-3567-4e39-a45c-6cf017572c29`)
- `data.nosync/chat.db` → `assistant_run_attempts.attempt_base_json`: every attempt's Claude init line shows `mcp_servers: [{name:"jini", status:"failed", source:"dynamic"}]`. The daemon then stops the run on purpose ("tools did not load … stopped instead of continuing") → exit 143. 4 runs, same failure each time.
- `ops/logs/daemon.log`: runs f3408066, 17809566, 9cfd6c61, 9b5b6cf7 ended `failed (code=143)`. **No line says WHY the bridge failed.**
- `ops/logs/server.log`: `[assistant] mcp-federation: reload trigger failed — fetch failed` at boot.
- `~/Library/Application Support/Tovu/tovu-desktop-mcp-launcher.sh` runs `app.asar/bin/mcp-bridge.ts` under ELECTRON_RUN_AS_NODE (a .ts file inside asar; might matter, not verified).

## Asks
1. Find the root cause by reproducing the per-run jini bridge launch from the packaged 0.1.17 app.
2. Fix it, and record the bridge's stderr/exit reason in the run log and daemon.log.
3. Add a regression test that boots the packaged app, sends a chat, and asserts the jini MCP status is `connected` and a tool call works. Run it in the release gate.
4. Cut a new desktop release (follow the autonomous release chain; stop at draft publish).
