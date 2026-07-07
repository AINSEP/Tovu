## 6. Configuration

`tovu.config.ts` is the user-facing entry point — the single file where a user wires their chosen adapter stack into the core. It is intentionally modeled after the ergonomics of `next.config.ts` and `drizzle.config.ts`.

```typescript
// tovu.config.ts (in the user's project)
import { defineConfig } from '@tovu/sdk';

// Adapters — user chooses their stack
import { postgres }         from '@tovu/db-postgres';
import { supabaseAuth }     from '@tovu/auth-supabase';
import { supabaseStorage }  from '@tovu/storage-supabase';
import { pgSearch }         from '@tovu/search-postgres';
import { honoHttp }         from '@tovu/http-hono';
import { claude }           from '@tovu/ai-claude';

// Plugins
import seo        from '@tovu/plugin-seo';
import analytics  from '@tovu/plugin-analytics';
import ecommerce  from '@tovu/plugin-ecommerce';

export default defineConfig({
  // Database
  database: postgres({
    connectionString: process.env.DATABASE_URL!,
    poolSize: 20,
  }),

  // Auth
  auth: supabaseAuth({
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
  }),

  // Storage
  storage: supabaseStorage({
    bucket: 'media',
  }),

  // Search
  search: pgSearch({
    vectorDimensions: 1536,  // for pgvector
  }),

  // HTTP layer
  http: honoHttp({ port: 3000 }),

  // AI
  ai: claude({
    model: 'claude-sonnet-4-20250514',
  }),

  // Protocols
  protocols: {
    mcp:  { enabled: true },
    a2a:  { enabled: true, agentCard: { name: 'My Site', skills: [] } },
    agui: { enabled: true },
  },

  // Content types (can also be defined in separate files)
  content: {
    types: './content/**/*.ts',  // glob for content type definitions
  },

  // Plugins
  plugins: [
    seo(),
    analytics({ provider: 'plausible' }),
    ecommerce({ currency: 'USD' }),
  ],

  // Theme (optional — headless mode if omitted)
  theme: './theme',
});
```

To swap the entire database, change one import and one line in this file. Everything else — plugins, content types, auth, the whole CMS — is untouched.

---

