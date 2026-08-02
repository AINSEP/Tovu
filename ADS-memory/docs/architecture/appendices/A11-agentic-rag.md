### A11. Agentic RAG

**What it is:** Retrieval-Augmented Generation where the agent controls the retrieval process — deciding when to retrieve, reformulating queries when results are insufficient, verifying source relevance, and iterating until confidence is high enough.

| Traditional RAG | Agentic RAG |
|---|---|
| Single fixed query → retrieve → generate | Multiple retrieval cycles |
| Fixed retrieval strategy | Adaptive strategy per query |
| No relevance verification | Agent evaluates and rejects poor results |
| Static chunking | Dynamic context assembly |

**Why it matters:** Substantially better answer quality for complex queries. The agent can fill gaps by reformulating, resolve contradictions between sources, and fall back to web search when the internal corpus is insufficient.

**When to use for Tovu:** When the AI copilot is answering questions about a site's content corpus, or when the ecommerce/analytics plugins need to synthesize answers across multiple data sources. Simpler single-pass RAG is fine for straightforward semantic search; Agentic RAG is worth the added latency for research-type queries.

```typescript
class AgenticRAG {
  async retrieve(query: string): Promise<RetrievalResult> {
    let currentQuery = query;
    let allResults: Document[] = [];

    for (let i = 0; i < 5; i++) {
      const results = await this.vectorSearch(currentQuery, { limit: 10 });
      allResults = [...allResults, ...results];

      const evaluation = await this.evaluateRelevance(results, query);

      if (evaluation.isComplete) break;

      if (evaluation.needsMoreContext) {
        // Reformulate to fill identified gaps
        currentQuery = await this.reformulateQuery(query, results, evaluation.missingAspects);
        continue;
      }

      break;
    }

    const ranked = await this.rerankResults(allResults, query);
    return { documents: ranked.slice(0, 10), confidence: this.calculateConfidence(ranked) };
  }
}
```

---

