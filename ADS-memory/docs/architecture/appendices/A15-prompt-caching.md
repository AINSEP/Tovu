### A15. Prompt Caching

**What it is:** Mark the static portions of a prompt (system instructions, few-shot examples, tool definitions) for server-side caching. On subsequent requests, the cached portion is not re-processed — only the variable user message is.

**Why it matters:** Up to 90% cost reduction on cached portions. Meaningfully lower latency. Makes long, detailed system prompts (style guides, content schemas, tool lists) economically viable in production.

**When to use for Tovu:** Any admin session where the user makes multiple requests shares the same system prompt. The CMS system prompt — content type definitions, style guide, available tools, few-shot examples — can be thousands of tokens and stays static across all requests in a session. Cache it.

```typescript
const response = await claude.messages.create({
  model: 'claude-sonnet-4-20250514',
  system: [
    {
      type: 'text',
      text: longSystemPrompt,      // Content types, style guide, tool descriptions
      cache_control: { type: 'ephemeral' }  // Cache this block
    },
    {
      type: 'text',
      text: fewShotExamples,       // Worked examples of content operations
      cache_control: { type: 'ephemeral' }  // Cache this block too
    }
  ],
  messages: [
    { role: 'user', content: userMessage }  // Only this varies per request
  ]
});

// First request in a session: full prompt processed
// Subsequent requests: cache hit on system + examples; only user message billed at full rate
// Cost implication: cache hit tokens billed at ~10% of input token rate (Anthropic pricing)
// Cache TTL: ~5 minutes of inactivity
```

---

