# Tovu: generating railway.json

For a coding agent or the operator's terminal, use
`tovu deploy config --target railway --region <region>` to generate `railway.json`. There is no
chat config-generation tool today: explain the gap and hand the command to the operator or a
coding agent. `railway.json` has no variables section, so the command prints a
`railway variables set` step for Tovu's production switch (`TOVU_RUNTIME_MODE=production`) and the
local site's `TOVU_SITE_ID`, then Tovu's notes (the headless-Chromium opt-in). Keep one instance:
Tovu's state is one SQLite file on the volume.
