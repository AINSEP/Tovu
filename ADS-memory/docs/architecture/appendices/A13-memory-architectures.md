### A13. Memory Architectures

**What it is:** Multi-tier memory systems that give agents context beyond the current conversation window. Four distinct memory types serve different temporal and semantic purposes.

| Type | Description | Storage |
|---|---|---|
| **Working Memory** | Current task context, active variables | In-context window |
| **Episodic Memory** | Past interactions with this user | Vector store with timestamps |
| **Semantic Memory** | Learned facts about entities (users, content, site) | Knowledge graph |
| **Procedural Memory** | How to do specific tasks well | Few-shot examples from past successes |

**Why it matters:** Agents with only working memory forget everything between sessions. Episodic memory enables personalization. Semantic memory prevents re-asking for known facts. Procedural memory improves task performance over time.

**When to use for Tovu:** `@tovu/ai/memory` implements this pattern already (working, episodic, semantic tiers). Procedural memory (storing successful task approaches as few-shot examples) is the logical next addition as the copilot accumulates session history.

```typescript
class AgentMemory {
  async recall(query: string, context: RecallContext): Promise<MemoryRecall> {
    // Retrieve from all tiers in parallel
    const [episodic, semantic, procedural] = await Promise.all([
      this.recallEpisodic(query, context),     // Past interactions
      this.recallSemantic(query, context),     // Known entity facts
      this.recallProcedural(context.taskType)  // Relevant past task examples
    ]);

    return this.synthesize(episodic, semantic, procedural);
  }

  async remember(interaction: Interaction): Promise<void> {
    // Store in episodic memory with embedding
    await this.episodic.insert({
      embedding: await embed(interaction.summary),
      metadata: { userId: interaction.userId, timestamp: interaction.timestamp },
      content: interaction.summary
    });

    // Extract entities into semantic memory (knowledge graph)
    for (const entity of interaction.entities) {
      await this.semantic.upsertEntity(entity);
    }

    // If successful task, store as procedural example
    if (interaction.success && interaction.taskType) {
      this.procedural.store(interaction.taskType, {
        input: interaction.input,
        reasoning: interaction.reasoning,
        output: interaction.output
      });
    }
  }
}
```

---

