### A9. AG-UI (Agent-User Interaction Protocol)

**What it is:** CopilotKit's emerging standard for bidirectional communication between AI agents and UI layers. Goes beyond a chat interface — agents can stream live UI components, pause for human confirmation, and share reactive state with the frontend.

**Why it matters:** Enables agents to render structured UI (grids, forms, previews) rather than plain text. Human-in-the-loop flows (approve before save, confirm before delete) are first-class, not bolted-on. The UI updates in real time as the agent works.

**Key capabilities:**

| Feature | Description |
|---|---|
| Streaming Tool Calls | UI updates as agent executes each step |
| Generative UI | Agent dynamically creates React components |
| Human Confirmation | Agent pauses; UI presents approve/reject |
| Shared State | Agent and UI share reactive state object |
| Action Suggestions | Agent surfaces clickable next-step buttons |

**When to use for Tovu:** The `CopilotPanel` in `@tovu/react/admin` is the natural integration point. AG-UI is most valuable when the AI copilot performs multi-step operations (search → preview → confirm save) where streaming intermediate UI is better UX than a final text response.

```typescript
// Server-side agent streams UI events
class ContentAgent extends Agent {
  async *handleMessage(message: string) {
    yield { type: 'status', message: 'Searching content...' };

    const results = await this.tools.search_content({ query: message });

    // Stream a rendered grid component, not a text list
    yield {
      type: 'generative_ui',
      component: 'ContentGrid',
      props: { items: results, onSelect: 'select_content' }
    };

    yield {
      type: 'suggestions',
      actions: [
        { label: 'Create new post', tool: 'create_draft' },
        { label: 'Refine search', tool: 'search_content' }
      ]
    };
  }
}

// Client-side React
function AdminDashboard() {
  const { messages, sendMessage, pendingToolCalls } = useCopilot({
    agent: '/api/content-agent',
  });

  return (
    <CopilotProvider>
      <CopilotPanel>
        {pendingToolCalls.map(call => (
          <ToolCallCard
            key={call.id}
            call={call}
            onApprove={() => call.approve()}
            onReject={() => call.reject()}
          />
        ))}
        <CopilotInput onSend={sendMessage} />
      </CopilotPanel>
    </CopilotProvider>
  );
}
```

---

