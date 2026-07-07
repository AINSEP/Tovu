### A10. Compound AI Systems

**What it is:** Orchestrated pipelines of specialized AI components rather than a single large model doing everything. A router classifies the request, a retriever fetches context, a generator produces output, and a verifier checks quality.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Router    │────▶│  Retriever  │────▶│  Generator  │
│  (classify) │     │   (RAG)     │     │  (Claude)   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                    │
       │            ┌──────┴──────┐             │
       │            ▼             ▼             │
       │      ┌─────────┐   ┌─────────┐        │
       │      │ Vector  │   │  Graph  │        │
       │      │   DB    │   │   DB    │        │
       │      └─────────┘   └─────────┘        │
       │                                        │
       ▼                                        ▼
┌─────────────┐                        ┌─────────────┐
│   Direct    │                        │  Verifier   │
│   Answer    │                        │  (quality   │
│  (no RAG)   │                        │   check)    │
└─────────────┘                        └─────────────┘
```

**Why it matters:** Better quality through specialization. Cost optimization — use a small model for routing and classification, a large model only for generation. Each component is independently swappable and testable.

**When to use for Tovu:** When the AI copilot needs to handle a wide range of request types (search, create, edit, analyze, explain) with different resource requirements. The router prevents every request from going to the most expensive model. DSPy can be used to optimize the pipeline's prompts automatically against quality metrics.

```python
import dspy

class ContentPipeline(dspy.Module):
    def __init__(self):
        self.router = dspy.ChainOfThought("query -> intent: create|edit|search|analyze")
        self.searcher = dspy.RAG(k=5)
        self.creator = dspy.ChainOfThought("topic, style -> draft_content")
        self.verifier = dspy.ChainOfThought("output, intent -> is_valid: bool, issues: list")

    def forward(self, query: str, context: dict = None):
        intent = self.router(query=query).intent

        if intent == "search":
            return {"type": "search_results", "data": self.searcher(query)}
        elif intent == "create":
            draft = self.creator(topic=query, style=context.get("style", "professional"))
            verification = self.verifier(output=draft, intent=intent)
            return {"type": "draft", "data": draft, "warnings": verification.issues}
```

---

