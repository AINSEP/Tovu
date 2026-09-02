import pluginManifestSource from "./bundled/ui-ux-design/plugin.json?raw";
import frontendAccessibilitySkillSource from "./bundled/ui-ux-design/skills/frontend-accessibility/SKILL.md?raw";
import gstackDesignSkillSource from "./bundled/ui-ux-design/skills/gstack-design/SKILL.md?raw";
import gstackDesignReferencesConsultationSource from "./bundled/ui-ux-design/skills/gstack-design/references/consultation.md?raw";
import gstackDesignReferencesHtmlSource from "./bundled/ui-ux-design/skills/gstack-design/references/html.md?raw";
import gstackDesignReferencesReviewSource from "./bundled/ui-ux-design/skills/gstack-design/references/review.md?raw";
import gstackDesignReferencesShotgunSource from "./bundled/ui-ux-design/skills/gstack-design/references/shotgun.md?raw";
import gstackDesignReferencesUpstreamNotesSource from "./bundled/ui-ux-design/skills/gstack-design/references/upstream-notes.md?raw";
import interfaceDesignOriginalSource from "./bundled/ui-ux-design/skills/interface-design/ORIGINAL.md?raw";
import interfaceDesignSkillSource from "./bundled/ui-ux-design/skills/interface-design/SKILL.md?raw";
import interfaceDesignReferencesCommandsAuditSource from "./bundled/ui-ux-design/skills/interface-design/references/commands/audit.md?raw";
import interfaceDesignReferencesCommandsCritiqueSource from "./bundled/ui-ux-design/skills/interface-design/references/commands/critique.md?raw";
import interfaceDesignReferencesCommandsExtractSource from "./bundled/ui-ux-design/skills/interface-design/references/commands/extract.md?raw";
import interfaceDesignReferencesCommandsInitSource from "./bundled/ui-ux-design/skills/interface-design/references/commands/init.md?raw";
import interfaceDesignReferencesCommandsStatusSource from "./bundled/ui-ux-design/skills/interface-design/references/commands/status.md?raw";
import interfaceDesignReferencesExamplesSystemPrecisionSource from "./bundled/ui-ux-design/skills/interface-design/references/examples/system-precision.md?raw";
import interfaceDesignReferencesExamplesSystemWarmthSource from "./bundled/ui-ux-design/skills/interface-design/references/examples/system-warmth.md?raw";
import interfaceDesignReferencesSystemTemplateSource from "./bundled/ui-ux-design/skills/interface-design/references/system-template.md?raw";
import shadcnUiReadmeSource from "./bundled/ui-ux-design/skills/shadcn-ui/README.md?raw";
import shadcnUiSkillSource from "./bundled/ui-ux-design/skills/shadcn-ui/SKILL.md?raw";
import shadcnUiExamplesAuthLayoutSource from "./bundled/ui-ux-design/skills/shadcn-ui/examples/auth-layout.tsx?raw";
import shadcnUiExamplesDataTableSource from "./bundled/ui-ux-design/skills/shadcn-ui/examples/data-table.tsx?raw";
import shadcnUiExamplesFormPatternSource from "./bundled/ui-ux-design/skills/shadcn-ui/examples/form-pattern.tsx?raw";
import shadcnUiResourcesComponentCatalogSource from "./bundled/ui-ux-design/skills/shadcn-ui/resources/component-catalog.md?raw";
import shadcnUiResourcesCustomizationGuideSource from "./bundled/ui-ux-design/skills/shadcn-ui/resources/customization-guide.md?raw";
import shadcnUiResourcesMigrationGuideSource from "./bundled/ui-ux-design/skills/shadcn-ui/resources/migration-guide.md?raw";
import shadcnUiResourcesSetupGuideSource from "./bundled/ui-ux-design/skills/shadcn-ui/resources/setup-guide.md?raw";
import shadcnUiScriptsVerifySetupSource from "./bundled/ui-ux-design/skills/shadcn-ui/scripts/verify-setup.sh?raw";
import uiUxDesignSkillSource from "./bundled/ui-ux-design/skills/ui-ux-design/SKILL.md?raw";
import uiUxDesignReferencesBrandAndVoiceSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/brand-and-voice.md?raw";
import uiUxDesignReferencesComponentsAndStatesSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/components-and-states.md?raw";
import uiUxDesignReferencesDelightAndMotionSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/delight-and-motion.md?raw";
import uiUxDesignReferencesFoundationsSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/foundations.md?raw";
import uiUxDesignReferencesInclusiveAiImagerySource from "./bundled/ui-ux-design/skills/ui-ux-design/references/inclusive-ai-imagery.md?raw";
import uiUxDesignReferencesKoleJainUiuxConceptsSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/kole-jain-uiux-concepts.md?raw";
import uiUxDesignReferencesOpenaiFrontendSkillSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/openai-frontend-skill.md?raw";
import uiUxDesignReferencesPremiumUiSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/premium-ui.md?raw";
import uiUxDesignReferencesResearchAndValidationSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/research-and-validation.md?raw";
import uiUxDesignReferencesSamCrawfordPremiumWebsitesSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/sam-crawford-premium-websites.md?raw";
import uiUxDesignReferencesSelfMadeWebDesignerCoreSkillsSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/self-made-web-designer-core-skills.md?raw";
import uiUxDesignReferencesVisualStorytellingSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/visual-storytelling.md?raw";
import vercelWebDesignGuidelinesSkillSource from "./bundled/ui-ux-design/skills/vercel-web-design-guidelines/SKILL.md?raw";
import webComplianceSkillSource from "./bundled/ui-ux-design/skills/web-compliance/SKILL.md?raw";
import webComplianceReferencesAuditEvidenceSource from "./bundled/ui-ux-design/skills/web-compliance/references/audit-evidence.md?raw";

export interface BundledAgentPluginSourceFile {
  readonly relativePath: string;
  readonly content: string;
}

/**
 * Compile-time inventory of package files that Tovu is allowed to display.
 *
 * This is intentionally an explicit import list rather than a dynamic path, glob, HTTP request,
 * or filesystem bridge. A file added to the package stays invisible until it is reviewed and
 * added here, and user-controlled text can never escape the plugin root. (A static
 * `import.meta.glob` was evaluated and rejected for this: it keeps the "never an arbitrary
 * runtime file read" half of that guarantee, but not the "invisible until reviewed" half, and its
 * only working pattern reaches into `node_modules`' physical layout rather than the package's own
 * `exports` map -- see git history around 2026-08-12 for the full comparison.)
 *
 * All 7 skills the `ui-ux-design` plugin currently bundles (`frontend-accessibility`,
 * `gstack-design`, `interface-design`, `shadcn-ui`, `ui-ux-design`, `vercel-web-design-guidelines`,
 * `web-compliance`) are listed here, not just the one this catalog used to carry alone -- Tovu
 * displays the whole plugin its `plugin.json` manifest actually describes, including the 3
 * `shadcn-ui/examples/*.tsx` files and 1 `shadcn-ui/scripts/*.sh` file that aren't markdown.
 *
 * ---------------------------------------------------------------------------
 * `./bundled/ui-ux-design/` is a vendored copy, not a live reach into Jini
 * ---------------------------------------------------------------------------
 * These 44 imports used to be RELATIVE paths straight into a sibling `Jini/` checkout
 * (`../../../../../../Jini/packages/agent-plugins/ui-ux-design/...`), which only resolved on a
 * machine that happened to have that checkout at that exact location -- Tovu's first-ever
 * standalone Fly build failed on exactly this. `@jini-ai/agent-plugins` is not a fix: its
 * `package.json` declares `./ui-ux-design/*` in its `exports` map, but the package itself has
 * never been published (`npm view @jini-ai/agent-plugins` 404s, unlike e.g. `@jini-ai/core`), so
 * importing through it would only trade one unresolvable path for another.
 *
 * `./bundled/ui-ux-design/` is a plain, checked-in copy of the same 44 files, made byte-identical
 * to Jini's `packages/agent-plugins/ui-ux-design/` at vendor time. It intentionally does NOT live
 * under `content/agent-plugins/` (where `site-compliance` lives): that directory is walked by
 * `seedBundledAgentPlugins()` on the server and installs-and-activates-inactive whatever it finds
 * there as a real, executable Agent Plugin -- this package is meant to stay "catalogued, not
 * executed" (`agent-plugin-catalog.ts`'s own `availability` field), so it lives under this app's
 * own `src/` instead, where nothing on the server side ever looks. It also is NOT part of this
 * app's TypeScript program or lint scope (`tsconfig.json`'s `exclude`, `eslint.config.mjs`'s
 * top-level `ignores`) -- its `.tsx` files are inert reference text this modal displays as a
 * string, not real source Tovu compiles or executes, and they reference dependencies (shadcn/ui
 * primitives, `@tanstack/react-table`) this project deliberately does not have.
 *
 * To refresh after an upstream change: re-copy each file this module imports from Jini's
 * `packages/agent-plugins/ui-ux-design/` into the matching path under `./bundled/ui-ux-design/`
 * here, byte-for-byte, and update `AgentPluginBundle.unit.test.ts`'s `EXPECTED_SKILLS`/
 * `SKILLS_WITHOUT_FRONTMATTER` if the shape changed. Never hand-edit a vendored file directly.
 */
export const UI_UX_DESIGN_SOURCE_FILES: readonly BundledAgentPluginSourceFile[] = [
  { relativePath: "plugin.json", content: pluginManifestSource },
  { relativePath: "skills/frontend-accessibility/SKILL.md", content: frontendAccessibilitySkillSource },
  { relativePath: "skills/gstack-design/SKILL.md", content: gstackDesignSkillSource },
  { relativePath: "skills/gstack-design/references/consultation.md", content: gstackDesignReferencesConsultationSource },
  { relativePath: "skills/gstack-design/references/html.md", content: gstackDesignReferencesHtmlSource },
  { relativePath: "skills/gstack-design/references/review.md", content: gstackDesignReferencesReviewSource },
  { relativePath: "skills/gstack-design/references/shotgun.md", content: gstackDesignReferencesShotgunSource },
  { relativePath: "skills/gstack-design/references/upstream-notes.md", content: gstackDesignReferencesUpstreamNotesSource },
  { relativePath: "skills/interface-design/ORIGINAL.md", content: interfaceDesignOriginalSource },
  { relativePath: "skills/interface-design/SKILL.md", content: interfaceDesignSkillSource },
  { relativePath: "skills/interface-design/references/commands/audit.md", content: interfaceDesignReferencesCommandsAuditSource },
  { relativePath: "skills/interface-design/references/commands/critique.md", content: interfaceDesignReferencesCommandsCritiqueSource },
  { relativePath: "skills/interface-design/references/commands/extract.md", content: interfaceDesignReferencesCommandsExtractSource },
  { relativePath: "skills/interface-design/references/commands/init.md", content: interfaceDesignReferencesCommandsInitSource },
  { relativePath: "skills/interface-design/references/commands/status.md", content: interfaceDesignReferencesCommandsStatusSource },
  { relativePath: "skills/interface-design/references/examples/system-precision.md", content: interfaceDesignReferencesExamplesSystemPrecisionSource },
  { relativePath: "skills/interface-design/references/examples/system-warmth.md", content: interfaceDesignReferencesExamplesSystemWarmthSource },
  { relativePath: "skills/interface-design/references/system-template.md", content: interfaceDesignReferencesSystemTemplateSource },
  { relativePath: "skills/shadcn-ui/README.md", content: shadcnUiReadmeSource },
  { relativePath: "skills/shadcn-ui/SKILL.md", content: shadcnUiSkillSource },
  { relativePath: "skills/shadcn-ui/examples/auth-layout.tsx", content: shadcnUiExamplesAuthLayoutSource },
  { relativePath: "skills/shadcn-ui/examples/data-table.tsx", content: shadcnUiExamplesDataTableSource },
  { relativePath: "skills/shadcn-ui/examples/form-pattern.tsx", content: shadcnUiExamplesFormPatternSource },
  { relativePath: "skills/shadcn-ui/resources/component-catalog.md", content: shadcnUiResourcesComponentCatalogSource },
  { relativePath: "skills/shadcn-ui/resources/customization-guide.md", content: shadcnUiResourcesCustomizationGuideSource },
  { relativePath: "skills/shadcn-ui/resources/migration-guide.md", content: shadcnUiResourcesMigrationGuideSource },
  { relativePath: "skills/shadcn-ui/resources/setup-guide.md", content: shadcnUiResourcesSetupGuideSource },
  { relativePath: "skills/shadcn-ui/scripts/verify-setup.sh", content: shadcnUiScriptsVerifySetupSource },
  { relativePath: "skills/ui-ux-design/SKILL.md", content: uiUxDesignSkillSource },
  { relativePath: "skills/ui-ux-design/references/brand-and-voice.md", content: uiUxDesignReferencesBrandAndVoiceSource },
  { relativePath: "skills/ui-ux-design/references/components-and-states.md", content: uiUxDesignReferencesComponentsAndStatesSource },
  { relativePath: "skills/ui-ux-design/references/delight-and-motion.md", content: uiUxDesignReferencesDelightAndMotionSource },
  { relativePath: "skills/ui-ux-design/references/foundations.md", content: uiUxDesignReferencesFoundationsSource },
  { relativePath: "skills/ui-ux-design/references/inclusive-ai-imagery.md", content: uiUxDesignReferencesInclusiveAiImagerySource },
  { relativePath: "skills/ui-ux-design/references/kole-jain-uiux-concepts.md", content: uiUxDesignReferencesKoleJainUiuxConceptsSource },
  { relativePath: "skills/ui-ux-design/references/openai-frontend-skill.md", content: uiUxDesignReferencesOpenaiFrontendSkillSource },
  { relativePath: "skills/ui-ux-design/references/premium-ui.md", content: uiUxDesignReferencesPremiumUiSource },
  { relativePath: "skills/ui-ux-design/references/research-and-validation.md", content: uiUxDesignReferencesResearchAndValidationSource },
  { relativePath: "skills/ui-ux-design/references/sam-crawford-premium-websites.md", content: uiUxDesignReferencesSamCrawfordPremiumWebsitesSource },
  {
    relativePath: "skills/ui-ux-design/references/self-made-web-designer-core-skills.md",
    content: uiUxDesignReferencesSelfMadeWebDesignerCoreSkillsSource,
  },
  { relativePath: "skills/ui-ux-design/references/visual-storytelling.md", content: uiUxDesignReferencesVisualStorytellingSource },
  { relativePath: "skills/vercel-web-design-guidelines/SKILL.md", content: vercelWebDesignGuidelinesSkillSource },
  { relativePath: "skills/web-compliance/SKILL.md", content: webComplianceSkillSource },
  { relativePath: "skills/web-compliance/references/audit-evidence.md", content: webComplianceReferencesAuditEvidenceSource },
];

/** Closed lookup: unknown plugin ids expose no files and trigger no IO. */
export function getBundledAgentPluginSourceFiles(pluginId: string): readonly BundledAgentPluginSourceFile[] {
  return pluginId === "ui-ux-design" ? UI_UX_DESIGN_SOURCE_FILES : [];
}

/** Exact allowlist lookup: traversal-like or otherwise unknown paths never resolve. */
export function findBundledAgentPluginSourceFile(
  files: readonly BundledAgentPluginSourceFile[],
  relativePath: string,
): BundledAgentPluginSourceFile | null {
  return files.find((file) => file.relativePath === relativePath) ?? null;
}
