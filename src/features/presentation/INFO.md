# presentation Overview

Owns workspace-scoped presentation settings for the first shell.

## Responsibilities

- validate which theme is active
- persist workspace presentation settings behind a repo port
- expose a thin read/update contract for admin and content surfaces

## Rules

- Theme renderers remain shell-local.
- Theme identity and validation stay in this feature so shells consume a server-owned setting.
