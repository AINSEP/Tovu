# Tovu: generating render.yaml

For a coding agent or the operator's terminal, use
`tovu deploy config --target render --region <region>` to generate `render.yaml`. There is no chat
config-generation tool today: explain that gap and hand the command to the operator or a coding
agent. The command passes Tovu's production switch (`TOVU_RUNTIME_MODE=production`) and the local
site's `TOVU_SITE_ID`, and prints Tovu's notes (the headless-Chromium opt-in) after the plugin's.
Keep one server instance: Tovu's state is one SQLite file on the persistent disk.


## Host details for skills/render/SKILL.md

Choose the card yourself from its `usedFor` list. Reuse a saved key or working
sign-in for that task. Never offer a replacement unless the person asks.
Check `content_read.custom_credential {}` for a saved key first.
Otherwise open **Connect Render** with
`credential_save { kind: "plugin-provider", target: "render" }`; it saves as `Render API`.
The person creates the key under Account Settings → API Keys. A deploy hook URL
is not a key.
Saving a key deploys nothing. Untested: this connection has not been tried end to end.
Never ask for a key in chat. Never offer to replace a working key unless asked.
