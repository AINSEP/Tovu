## 12. Swappability Examples

These are the concrete scenarios the architecture is designed to handle:

**Scenario: Next.js dies, everyone moves to $NEW_THING**
Write a new `@tovu/new-thing` binding. Core untouched. Plugins untouched. Themes need new templates but all business logic stays.

**Scenario: Drizzle gets abandoned, Prisma 6 is amazing**
Write a new `@tovu/db-prisma` adapter implementing `DatabasePort`. Swap one line in `tovu.config.ts`. Everything else — content types, auth, plugins, AI tools — untouched.

**Scenario: You want to support Cloudflare Workers (no Node APIs)**
Core is already pure TS with no Node dependencies. Write `@tovu/http-workers` adapter. Use `@tovu/db-turso` (edge-native SQLite). Done.

**Scenario: React falls out of favor**
The admin UI needs rewriting — that is real work. But every plugin's business logic, every content type, every hook, every AI tool, every content schema is completely untouched. The new Vue/Svelte/Solid admin just implements the same framework-agnostic component descriptors.

**Scenario: A better AI protocol replaces MCP**
Add a new sub-module in `@tovu/protocol`. Existing MCP tools auto-bridge to the new protocol. Plugin authors change nothing.

**Scenario: You need to run multiple LLM providers**
Register multiple implementations against different tokens. The `LLMPort` interface is the same — you can have `claude` for generation and `openai` for embeddings, each registered under a different service token.

---

The fundamental trade-off: this architecture requires more work upfront because you are building interfaces before implementations. In return, it makes the right things easy to change and the wrong things hard to break. For a project intended to outlive any single framework or infrastructure provider, this is the correct bet.

---

