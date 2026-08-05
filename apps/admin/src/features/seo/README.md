# features/seo

The site-wide SEO settings screen (SPEC-008 `ui.spec.md` §2.4) behind the sidebar's
**Marketing → SEO** entry.

| file | what it is |
|---|---|
| `Seo.tsx` | `SeoSettingsScreen` — site-wide `seo.*` settings form plus per-entry override analysis, using `agentHandle` from `@jini-ai/agentic`. |
| `index.ts` | The only surface `panels.tsx` may import. |

## Notes for anyone editing here

`Seo.tsx` has **no unit test**. Treat a change here as unverified until you have driven it in a
browser.
