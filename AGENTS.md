# AGENTS.md

## Repository-Specific Instructions

- For any work anywhere in this repository, read and follow `AI-Dev-Shop/AGENTS.md`.
- Treat `AI-Dev-Shop/AGENTS.md` as the mandatory bootstrap and governing agent instruction file for this workspace, not just for the `AI-Dev-Shop/` subtree.
- On the first user message in this repository, boot with `AI-Dev-Shop/AGENTS.md` loaded before any substantive reply.
- If `AI-Dev-Shop/AGENTS.md` is missing or unreadable, state that explicitly and stop.

## Always Consult

Before proposing architecture changes, implementation plans, or new platform modules in this workspace, consult:

- `tovu-architecture.md` section `13. User Friction Coverage (Living Backlog)`
- `tovu-architecture.md` section `14. Meta-Coding Framework (Spec-First + Test-First + Pattern-First)`
- `tovu/PROJECT_MEMORY.md` when the task is about the `tovu/` project
- `tovu/src/INFO.md` when the task is about module layout in `tovu/`

## Execution Rules

- Treat sections 13 and 14 as governing constraints for architecture decisions.
- Do not bypass dependency inversion or modular boundaries for speed.
- Prefer swappable ports/adapters over provider-coupled implementations in core.
