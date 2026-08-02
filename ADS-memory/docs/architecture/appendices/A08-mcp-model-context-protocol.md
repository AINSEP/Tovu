### A8. MCP (Model Context Protocol)

**What it is:** Anthropic's open standard for connecting AI models to external tools, resources, and data sources. Often described as "USB for AI" — a single standardized interface that any agent or model can use to discover and invoke capabilities.

**Why it matters:** Agents can discover tools dynamically at runtime. Plugins written once are callable by any MCP-compatible AI system (Claude, GPT, local models). Removes the need for bespoke per-model integrations.

**When to use for Tovu:** Already a first-class concern — `@tovu/protocol/mcp` generates an MCP server from the tool registry. Every plugin that calls `tovu.ai.registerTool()` is automatically exposed over MCP. The pattern to maintain: tools are registered once in the domain layer; the protocol layer handles exposure.

```typescript
import { MCPServer } from '@anthropic-ai/mcp';

const server = new MCPServer({
  name: 'cms-content-tools',
  version: '1.0.0',
  tools: [
    {
      name: 'search_content',
      description: 'Semantic search across all CMS content',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          contentType: { type: 'string', enum: ['post', 'page', 'all'] },
          limit: { type: 'number', default: 10 }
        },
        required: ['query']
      },
      handler: async ({ query, contentType, limit }) => {
        const embedding = await embed(query);
        return db.contents.select()
          .where(contentType !== 'all' ? { type: contentType } : {})
          .orderBy(sql`embedding <-> ${embedding}`)
          .limit(limit);
      }
    }
  ],
  resources: [
    {
      uri: 'content://posts/{id}',
      name: 'Single Post',
      mimeType: 'application/json',
      handler: async ({ id }) => db.contents.findUnique({ where: { id } })
    }
  ]
});

server.listen({ port: 3001 });
```

---

