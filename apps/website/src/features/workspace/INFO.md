# features/workspace Overview

Workspace module demonstrates a complete vertical slice.

## Files

- `create.ts`: command handler + validation + conflict checks + outbox enqueue
- `repo.memory.ts`: local repository adapter
- `index.ts`: public exports
- `__tests__/`: executable tests for slice behavior
- `__specs__/`: human-readable behavioral spec
