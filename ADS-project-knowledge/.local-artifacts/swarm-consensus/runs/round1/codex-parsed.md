**(a) Recommended Architecture**

Build a layered theming model, not one universal theme format. The default marketplace-safe theme should be a **sandboxed Liquid template package**: manifest, typed design tokens, CSS, assets, Liquid layouts/partials, and references to a fixed component registry. It can loop, branch, compose layouts, and render structured content, but it cannot execute arbitrary JS or touch the server runtime. Keep today’s JSON block-tree format as an **AI/non-developer visual schema** that compiles to the same render model. Put developer-authored code, animation libraries, custom components, and external capabilities in the existing **plugin plane**, with signed manifests and permissions. Premium themes can depend on trusted plugins, but raw third-party themes remain data, templates, CSS, and assets only.

**(b) Ranked Engine Table**

Scores: 5 = excellent, 1 = poor.

| Rank | Option | TS / Type Safety | Flexibility | Untrusted Safety | AI Generation | Premium / Animated Sites | Maintenance | Best Audience |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | **LiquidJS** | 2 | 4 | 4 | 5 | 3 | 4 | Marketplace themes, designers, AI |
| 2 | **Handlebars** | 2 | 3 | 5 | 5 | 2 | 5 | Safest simple themes, email-like templates |
| 3 | **Nunjucks** | 2 | 4 | 3 | 4 | 3 | 3 | Designers needing inheritance/macros |
| 4 | **Astro / JSX component layer** | 5 | 5 | 1 | 3 | 5 | 3 | Trusted developer themes/plugins |
| 5 | **Eta** | 2 | 5 | 1 | 3 | 4 | 4 | Trusted internal templates |
| 6 | **EJS** | 1 | 5 | 1 | 3 | 4 | 3 | Legacy/trusted-only server templates |
| 7 | **Next as theme runtime** | 5 | 5 | 1 | 2 | 5 | 1 | Full app development, not CMS themes |

**(c) Single Best Default Engine**

The best default is **LiquidJS**. It is expressive enough for real page templates, collections, conditionals, includes, layout inheritance patterns, filters, and designer-readable markup, while still being fundamentally data-driven rather than arbitrary code execution. It is also familiar to marketplace authors because of Shopify/Jekyll-style ecosystems, and AI tools are good at generating it because the syntax is constrained and textual. Handlebars is safer but too limiting as the main authoring surface; Nunjucks is pleasant but easier to overexpose; EJS/Eta are just server-side JavaScript and should not be treated as untrusted themes. Astro/JSX belongs behind the plugin/trusted-code boundary, not in the default install-from-anyone theme path.

**(d) Migration / Evolution Path**

Ship first with the current declarative JSON blocks plus a Liquid layer. The JSON block tree can remain the no-code/AI-friendly representation, while Liquid becomes the advanced theme authoring format. Both should target the same internal render contract: page data, site data, content renderers, components, tokens, assets, and slots.

Then add expressiveness in this order:

1. **Liquid layouts/partials/sections**: allow designers to compose pages without arbitrary code.
2. **Typed theme schema**: JSON Schema or Zod-generated schemas for manifest, tokens, settings, regions, and component props.
3. **Safe component registry expansion**: themes reference components by id and pass validated props.
4. **Plugin-backed components**: premium themes may declare dependencies on signed plugins that provide JS, animation, data fetchers, or interactive islands.
5. **Trusted developer mode**: optionally support Astro/JSX packages only as signed plugins or first-party bundles, never as ordinary untrusted themes.

This path avoids a rewrite because Liquid and JSON blocks can both compile into the same page/component/render pipeline. The main cost is designing the stable render context and validation boundary early.

**(e) Top 3 Risks Or Warnings**

1. **Do not let themes execute arbitrary server-side JS.** EJS, Eta, JSX, Astro, or Next-style code themes destroy the “install from anyone safely” guarantee unless they are treated as trusted plugins with signing, permissions, review, and isolation.

2. **Do not make plugins and themes the same thing.** Themes should control presentation. Plugins should provide capabilities. Blurring them will make marketplace security, migrations, permissions, and user trust much harder.

3. **Do not expose raw TipTap JSON directly to templates as a structure authors manipulate freely.** Provide safe render helpers like `content | renderRichText`, excerpt helpers, table-of-contents helpers, and node-aware component mappings. The template should choose placement and presentation; the renderer should own sanitization, marks, node handling, embeds, and component hydration.

For untrusted third-party themes, the safe server-renderable options are **LiquidJS and Handlebars**, with Nunjucks acceptable only under a stricter posture. Required posture: no filesystem access outside the theme package, no arbitrary helper registration by themes, strict variable mode, prototype/property access hardening, output escaping by default, HTML sanitization for rendered rich text, schema validation for manifests/settings/props, CSS validation or containment rules, asset limits, render timeouts, recursion/include depth limits, and dependency allowlists.

Premium animation belongs in **CSS by default** and **plugins for JavaScript**. A theme may ship rich CSS, keyframes, transitions, fonts, and static assets. If it needs Framer Motion, GSAP, custom hydration, scroll triggers, or client-side state, it declares a dependency on a signed plugin that exposes approved components or islands. The theme references `<Component id="motion.hero">` or an equivalent Liquid tag; it does not import GSAP itself.

Compile-time type-checking of templates matters less than **runtime schema validation and stable render contracts**. TypeScript is valuable for the core renderer, plugin SDK, built-in components, content model, and generated theme schemas. Liquid/Handlebars/Nunjucks will not give meaningful template type safety. JSX/Astro can, but only in the trusted-code tier. For this product, safe installability and AI-validity are more important than pretending marketplace templates are TypeScript programs.

<<SWARM_END>>