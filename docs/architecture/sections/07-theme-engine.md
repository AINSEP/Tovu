## 7. Theme Engine

The theme engine in the core knows nothing about React or Vue. It operates on an abstract representation of templates, regions, and slot render instructions. Framework bindings translate this into actual components.

```typescript
// packages/theme/src/types.ts

/**
 * A theme is a collection of templates, settings, and regions.
 * It does NOT contain React/Vue/Svelte components — those live
 * in the framework binding layer.
 */
export interface ThemeDefinition {
  name: string;
  version: string;

  /** Template hierarchy — maps route patterns to template IDs */
  templates: TemplateHierarchy;

  /** Named regions where plugins can inject content */
  regions: string[];

  /** User-configurable settings */
  settings: Record<string, ThemeSettingDefinition>;

  /** Assets (CSS, fonts, images) */
  assets?: ThemeAssets;
}

export interface TemplateHierarchy {
  /** Ordered list of templates to try for each route type */
  rules: TemplateRule[];
  /** Default fallback template */
  fallback: string;
}

export interface TemplateRule {
  /** Pattern: 'single-{contentType}', 'archive-{taxonomy}', 'page-{slug}', etc */
  pattern: string;
  /** Template identifier — resolved by the framework binding */
  template: string;
  /** Priority (higher = tried first) */
  priority?: number;
}

// packages/theme/src/resolver.ts

/**
 * Pure function. Given a route context, returns the template ID to use.
 * No framework dependencies.
 */
export function resolveTemplate(
  hierarchy: TemplateHierarchy,
  context: RouteContext,
): string {
  const sorted = [...hierarchy.rules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const rule of sorted) {
    if (matchPattern(rule.pattern, context)) {
      return rule.template;
    }
  }
  return hierarchy.fallback;
}

/**
 * Slots/Regions — plugins register content for named regions.
 * The framework binding decides HOW to render each instruction.
 */
export interface SlotContent {
  pluginId: string;
  slotName: string;
  priority: number;
  /**
   * Framework-agnostic render instruction.
   * Could be: { type: 'html', html: '...' }
   * Or: { type: 'component', componentId: 'seo-meta-tags' }
   * Or: { type: 'data', data: {...} }
   * The framework binding interprets this.
   */
  content: SlotRenderInstruction;
}
```

The framework bindings translate these abstract instructions into actual components:

```typescript
// packages/react/src/hooks/useTemplate.ts
import { resolveTemplate } from '@tovu/theme';

export function useTemplate(context: RouteContext) {
  const tovu = useTovu();
  const templateId = resolveTemplate(tovu.theme.hierarchy, context);
  // Dynamic import of the React component for this template
  const Component = tovu.theme.components.get(templateId);
  return Component;
}

// packages/react/src/components/TovuSlot.tsx
export function TovuSlot({ name, context }: { name: string; context?: any }) {
  const tovu = useTovu();
  const slotContents = tovu.theme.getSlotContents(name);

  return (
    <>
      {slotContents
        .sort((a, b) => a.priority - b.priority)
        .map((slot) => (
          <SlotRenderer key={slot.pluginId} instruction={slot.content} />
        ))}
    </>
  );
}
```

---

