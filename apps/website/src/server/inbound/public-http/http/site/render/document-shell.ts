import { themeTokenAliasDeclarations } from "#src/features/theme/token-aliases";
import type { DocumentAssets } from "@jini-ai/cms/presentation";
import type { DiscoveredTheme } from "#src/features/theme/index";
import type { SiteChatSelection } from "../site-chat-markup.js";
import { renderDocumentShell } from "@jini-ai/cms/presentation/document-shell";
import { siteAssistantMarkup } from "./site-assistant-mount.js";
import { withEntryListStyleOnce } from "#src/features/theme/entry-list-render";
// Every module counts in fresh render workers; omit the rendering re-export wrapper.
import { renderThemeFontLinks } from "#src/features/theme/font-links";

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

/** Carries the same guessed-name aliases as the static tier's `:root` block — see `token-aliases.ts`. */
function tokensToCss(tokens: Record<string, string>): string {
  const decls = [...Object.entries(tokens), ...themeTokenAliasDeclarations({ tokens })]
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  return `:root { ${decls} }\n  body { font-family: var(--font-body, system-ui, sans-serif); }`;
}

/**
 * `extraHead` is `page-head.ts`'s `serializeHeadElements()` output (SPEC-008
 * ADR-PIPE-008 T048) — already-escaped markup, inserted verbatim. When it
 * contains its own `<title>` (SEO's fold always emits one, per
 * `page-head-contributor.ts`'s priority-100 title element), this shell's own
 * hardcoded `<title>` is suppressed rather than emitting two competing tags.
 */
export function pageShell(required: {
  documentAssets?: DocumentAssets;
  title: string;
  /** `null` when the operator turned the theme off — see {@link RenderSiteRequired.theme}. */
  theme: DiscoveredTheme | null;
  body: string;
  extraHead?: string;
  /** ADR-054 — the `site.assistant.public_enabled` ledger value for this request's workspace,
   *  resolved by the caller (the route handler, which already holds `deps.settingsRepo`; see this
   *  function's own doc). Defaults to `false` — the same fail-closed default the setting itself
   *  carries — so any pre-existing or test caller that does not pass this omits the assistant
   *  rather than silently gaining it. */
  siteAssistantEnabled?: SiteChatSelection;
}, _optional: Record<string, never> = {}): string {
  const { theme, extraHead } = required;
  const siteAssistant = siteAssistantMarkup({ enabled: required.siteAssistantEnabled ?? false });
  // The theme contributes exactly these three things to the document Tovu owns. With no theme they
  // are each ABSENT, not empty: `BASE_STYLE` is Tovu's own reset and stays either way, but a
  // synthesised `:root { }` or a `<link>` to no font family would be markup an operator has to work
  // around. `data-theme` in particular is omitted ENTIRELY rather than emitted empty — `[data-theme]`
  // matches `data-theme=""`, so an empty attribute is a selector someone hits by accident.
  const { themeFontLink, themeStyle } = shellThemeAssets({ theme });
  const document = renderDocumentShell({ title: required.title, body: required.body }, {
    extraHead, documentAssets: required.documentAssets, leadingAssets: siteAssistant,
    themeFontLink, themeStyle, themeId: theme?.manifest.id,
  });
  // Review fix 3a: the same once-per-page default style `finishStaticTierDocument`'s
  // `renderStaticPage` call already injects for a static theme's own `{"type":"collection"}`
  // marker (`static-render.ts`'s `renderStaticPage`) — this was the missing half, so a
  // `recent-entries` cards-layout widget on a templated/handlebars/declarative theme (or no theme)
  // used to render its `.entry-card` markup with no styling at all. Safe to call unconditionally:
  // `withEntryListStyleOnce` only ever matches its OWN `[data-tovu-entry-list]` wrapper attribute,
  // never a theme's own unrelated `.entry-list`-classed markup (`entryList`/`productEntryList`
  // below both use that class for the built-in post/product index).
  return withEntryListStyleOnce({ html: document });
}

function shellThemeAssets({ theme }: { theme: DiscoveredTheme | null }) {
  if (!theme) return { themeFontLink: '', themeStyle: '' };
  return { themeFontLink: renderThemeFontLinks({ manifest: theme.manifest }), themeStyle: `${tokensToCss(theme.tokens)}${theme.css}` };
}
