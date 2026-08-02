### A14. Structured Outputs / Constrained Decoding

**What it is:** Force models to produce valid, schema-conforming JSON at the token level — not via prompt instructions, but via constrained sampling during inference. The output is guaranteed to match a Zod/JSON Schema definition.

**Why it matters:** 100% valid structured output with no parsing errors. Full TypeScript type safety on the result. Eliminates defensive parsing code and retry logic for malformed responses.

**When to use for Tovu:** Everywhere the AI layer produces structured data consumed by the application — content analysis, SEO scoring, metadata extraction, schema generation. The `tool_choice: { type: 'tool', name: 'X' }` pattern on Anthropic's API is already the implementation of this.

```typescript
const ContentAnalysisSchema = z.object({
  seoScore: z.number().min(0).max(100),
  readabilityGrade: z.number().min(1).max(12),
  issues: z.array(z.object({
    type: z.enum(['seo', 'grammar', 'style', 'accessibility']),
    severity: z.enum(['low', 'medium', 'high']),
    message: z.string(),
    suggestion: z.string()
  })),
  summary: z.string()
});

// Output is GUARANTEED to match the schema — no defensive parsing needed
const response = await claude.messages.create({
  messages: [{ role: 'user', content: `Analyze: ${content}` }],
  tools: [{ name: 'analyze_content', input_schema: zodToJsonSchema(ContentAnalysisSchema) }],
  tool_choice: { type: 'tool', name: 'analyze_content' }
});

const analysis = response.content[0].input as z.infer<typeof ContentAnalysisSchema>;
// TypeScript knows: analysis.seoScore is number, analysis.issues[0].severity is 'low'|'medium'|'high'
```

---

