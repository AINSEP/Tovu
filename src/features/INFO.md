# features Overview

Features are vertical slices of business logic.

## Current modules

- `workspace/`: create-workspace command slice and local repository adapter
- `post/`: first content authoring slice for a single post model
- `presentation/`: workspace-scoped theme identity and presentation settings

## Rules

- Features can import from `core/*` contracts.
- Features should not import server/framework code.
- Keep each feature independently testable.
