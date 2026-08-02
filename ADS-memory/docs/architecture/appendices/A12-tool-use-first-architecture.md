### A12. Tool-Use-First Architecture

**What it is:** Every agent action — including reasoning, responding, and searching — is expressed as a structured tool call. The agent never produces unstructured free text as its primary output mode; everything goes through the tool interface.

**Why it matters:**

| Benefit | Description |
|---|---|
| Full Observability | Every agent step is a structured, loggable record |
| Human-in-the-Loop | Any tool call can be intercepted for approval before execution |
| Testability | Assert on structured tool calls, not on prose output |
| No Hallucinated Actions | Agent cannot claim to have done something without a tool call record |
| Composability | Tools are reusable across multiple agents |

**When to use for Tovu:** Already the design principle in `@tovu/ai`. The `tool_choice: { type: 'required' }` flag enforces this on every agent call. The "thinking tool" pattern makes agent reasoning visible and debuggable without exposing it to users.

```typescript
const cmsAgentTools = {
  // Makes reasoning observable — logged but not shown to user
  think: {
    description: 'Reason through a problem before acting.',
    parameters: z.object({
      observation: z.string(),
      plan: z.array(z.string()),
      decision: z.string()
    }),
    handler: async (input) => ({ acknowledged: true })
  },

  save_content: {
    description: 'Save content to database. Requires prior draft.',
    parameters: z.object({ draft: ContentSchema, status: z.enum(['draft', 'published']) }),
    requiresApproval: true, // Pause for human confirmation
    handler: async ({ draft, status }) => contentService.save({ ...draft, status })
  },

  // Even the response to the user is a tool call
  respond_to_user: {
    description: 'Send a message to the user.',
    parameters: z.object({
      message: z.string(),
      suggestedActions: z.array(z.string()).optional()
    }),
    handler: async (input) => ({ delivered: true })
  }
};

// Force structured output — no raw text responses
const response = await claude.messages.create({
  messages: [{ role: 'user', content: userMessage }],
  tools: buildToolDefinitions(cmsAgentTools),
  tool_choice: { type: 'required' }
});
```

---

