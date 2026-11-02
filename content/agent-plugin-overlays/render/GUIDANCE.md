# Tovu: generating render.yaml

For a coding agent or the operator's terminal, use
`tovu deploy config --target render --region <region>` to generate `render.yaml`. There is no chat
config-generation tool today: explain that gap and hand the command to the operator or a coding
agent. The command passes Tovu's production switch (`TOVU_RUNTIME_MODE=production`) and the local
site's `TOVU_SITE_ID`, and prints Tovu's notes (the headless-Chromium opt-in) after the plugin's.
Keep one server instance: Tovu's state is one SQLite file on the persistent disk.
