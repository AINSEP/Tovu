# Tovu — Claude Code Entry Point

- **Before anything else, check the prompt itself**: if it begins with `<<SUBAGENT_DISPATCH>>` or `<<PEER_DISPATCH>>`, this is a dispatched/delegated task, not an interactive human session — skip this entire file and `AI-Dev-Shop/AGENTS.md` unconditionally (do not read either one, do not print any startup banner) and go straight to the task. This check has to live here, not only in `AI-Dev-Shop/AGENTS.md`'s own Mandatory Startup section, because a model told to "read AGENTS.md before any substantive reply" has no way to discover a marker-based exception to that instruction without first reading the very file the marker is supposed to let it skip.
- Otherwise: read `AI-Dev-Shop/AGENTS.md` and treat it as the mandatory bootstrap and governing agent instruction file for this entire workspace (not just the `AI-Dev-Shop/` subtree).
- On the first user message in this repository, boot with `AI-Dev-Shop/AGENTS.md` loaded before any substantive reply, per its own Mandatory Startup section.
- If `AI-Dev-Shop/AGENTS.md` is missing or unreadable, state that explicitly and stop.

See `AGENTS.md` at this same root for the full repository-specific instructions (always-consult docs, execution rules).
