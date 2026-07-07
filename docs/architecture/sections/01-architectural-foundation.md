## 1. Architectural Foundation

Tovu is built on a combination of four interlocking patterns. These are not arbitrary choices — each one was selected because it solves a specific, concrete problem that an AI-native CMS faces.

### Ports & Adapters (Hexagonal Architecture)

**What it is:** The core system defines interfaces ("ports") for every external dependency. Nothing in the core ever imports a real database driver, HTTP framework, storage SDK, or AI provider. Concrete implementations ("adapters") are injected at startup.

**Why Tovu uses it:** A CMS that will outlive any single framework cannot have opinions baked in. When Drizzle gets abandoned, when the Next.js ecosystem shifts, when a better LLM protocol emerges — the core stays completely untouched. Only the adapter layer changes.

**The rule:** Dependencies point inward only. Core packages import nothing from adapters. Adapters import core packages plus their specific external library.

### Modular Monolith

**What it is:** All packages are deployed together as a single unit, but their internal boundaries are as strict as if they were separate services. Module-to-module communication goes through defined contracts, never through direct internal imports across boundaries.

**Why Tovu uses it:** Microservices introduce network latency, distributed tracing complexity, and deployment overhead that is unnecessary before you have the scale to justify it. The modular monolith gives you clean boundaries and the option to extract services later — without paying the complexity tax now.

**The practical benefit:** A plugin author never needs to worry about service discovery, network failures, or message queues just to extend a content type.

### Domain-Driven Design (DDD)

**What it is:** The software model is organized around the actual domain concepts — not around technical concerns like "controllers" or "services." Each package maps to a bounded context with its own language and responsibility.

**Why Tovu uses it:** A CMS has genuine domain complexity: content has types, schemas, relations, and lifecycle events. Auth has roles, permissions, and policies. Media has transforms, pipelines, and storage strategies. DDD gives each of these its own package with clear ownership, rather than bleeding them into a flat "utils" directory.

**In practice:** `@tovu/content` owns everything about content — schema definition, CRUD operations, relations, validation. It does not own database queries (that is `@tovu/db-*`). It does not own HTTP routes (that is `@tovu/api`).

### Vertical Slices (within packages)

**What it is:** Inside each feature area, code is organized by operation rather than by technical layer. Instead of `controllers/`, `services/`, `repositories/` across the whole codebase, each feature's handler, validation, and data access live together.

**Why Tovu uses it:** When you need to change how "create a content item" works, you change one self-contained slice — not three horizontal layers spread across different directories. Teams can own slices. Features can be deleted cleanly.

---

