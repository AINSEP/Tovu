## 8. Plugin SDK

Plugin authors never interact with ports, adapters, or the kernel directly. They receive a scoped, sandboxed API that only exposes what their declared `permissions` grant access to.

```typescript
// Using @tovu/sdk to write a plugin

import { definePlugin } from '@tovu/sdk';

export default definePlugin({
  name: 'tovu-seo',
  version: '1.0.0',

  // Declare what you need — if you don't declare it, you can't use it
  permissions: [
    'content.read',
    'content.extendSchema',
    'hooks.filter.page.head',
    'admin.panel',
  ],

  setup(tovu) {
    // tovu here is a SCOPED API — not the full kernel.
    // It only exposes what `permissions` declared.

    // Extend any content type with SEO fields
    tovu.content.extendType('*', {
      fields: {
        seoTitle:       { type: 'text',  label: 'SEO Title',        group: 'seo' },
        seoDescription: { type: 'text',  label: 'Meta Description', group: 'seo' },
        ogImage:        { type: 'media', label: 'OG Image',         group: 'seo' },
      },
    });

    // Filter: inject meta tags into page head
    tovu.hooks.addFilter('page.head', async (head, { content }) => {
      const title = content.seoTitle || content.title;
      const desc = content.seoDescription || '';
      return head + `<meta property="og:title" content="${title}">` +
                     `<meta property="og:description" content="${desc}">`;
    });

    // Register admin panel — returns a framework-agnostic descriptor,
    // NOT a React component. The binding layer resolves it.
    tovu.admin.registerPanel({
      id: 'seo-settings',
      label: 'SEO',
      icon: 'search',
      component: {
        pluginId: 'tovu-seo',
        exportPath: './admin/SeoPanel',
      },
    });

    // Register as MCP tool — automatically exposed to AI agents
    tovu.ai.registerTool({
      name: 'analyze_seo',
      description: 'Analyze SEO score for a piece of content',
      parameters: {
        contentId: { type: 'string', description: 'ID of the content to analyze' },
      },
      execute: async ({ contentId }) => {
        const content = await tovu.content.findById(contentId);
        return analyzeSeo(content);
      },
    });
  },
});
```

**Key design decisions in the Plugin SDK:**

- `permissions` is a declare-before-use model. A plugin cannot access anything it has not declared. The sandbox enforces this at runtime.
- `admin.registerPanel` accepts a framework-agnostic component descriptor, not a React component. The framework binding resolves the actual component. This means the same plugin works across React and Vue admin UIs.
- `ai.registerTool` automatically bridges to MCP, A2A, and AG-UI. Plugin authors register a tool once; the protocol layer handles exposure to all AI agent protocols.

---

