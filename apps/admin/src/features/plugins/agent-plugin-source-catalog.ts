import pluginManifestSource from "./bundled/ui-ux-design/plugin.json?raw";
import skillSource from "./bundled/ui-ux-design/skills/ui-ux-design/SKILL.md?raw";
import brandAndVoiceSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/brand-and-voice.md?raw";
import componentsAndStatesSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/components-and-states.md?raw";
import delightAndMotionSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/delight-and-motion.md?raw";
import foundationsSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/foundations.md?raw";
import inclusiveAiImagerySource from "./bundled/ui-ux-design/skills/ui-ux-design/references/inclusive-ai-imagery.md?raw";
import koleJainSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/kole-jain-uiux-concepts.md?raw";
import openAiFrontendSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/openai-frontend-skill.md?raw";
import premiumUiSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/premium-ui.md?raw";
import researchAndValidationSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/research-and-validation.md?raw";
import samCrawfordSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/sam-crawford-premium-websites.md?raw";
import selfMadeWebDesignerSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/self-made-web-designer-core-skills.md?raw";
import visualStorytellingSource from "./bundled/ui-ux-design/skills/ui-ux-design/references/visual-storytelling.md?raw";

export interface BundledAgentPluginSourceFile {
  readonly relativePath: string;
  readonly content: string;
}

/**
 * Compile-time inventory of package files that Tovu is allowed to display.
 *
 * This is intentionally an explicit import list rather than a dynamic path, glob, HTTP request,
 * or filesystem bridge. A file added to the package stays invisible until it is reviewed and
 * added here, and user-controlled text can never escape the plugin root.
 */
export const UI_UX_DESIGN_SOURCE_FILES: readonly BundledAgentPluginSourceFile[] = [
  { relativePath: "plugin.json", content: pluginManifestSource },
  { relativePath: "skills/ui-ux-design/SKILL.md", content: skillSource },
  { relativePath: "skills/ui-ux-design/references/brand-and-voice.md", content: brandAndVoiceSource },
  { relativePath: "skills/ui-ux-design/references/components-and-states.md", content: componentsAndStatesSource },
  { relativePath: "skills/ui-ux-design/references/delight-and-motion.md", content: delightAndMotionSource },
  { relativePath: "skills/ui-ux-design/references/foundations.md", content: foundationsSource },
  { relativePath: "skills/ui-ux-design/references/inclusive-ai-imagery.md", content: inclusiveAiImagerySource },
  { relativePath: "skills/ui-ux-design/references/kole-jain-uiux-concepts.md", content: koleJainSource },
  { relativePath: "skills/ui-ux-design/references/openai-frontend-skill.md", content: openAiFrontendSource },
  { relativePath: "skills/ui-ux-design/references/premium-ui.md", content: premiumUiSource },
  { relativePath: "skills/ui-ux-design/references/research-and-validation.md", content: researchAndValidationSource },
  { relativePath: "skills/ui-ux-design/references/sam-crawford-premium-websites.md", content: samCrawfordSource },
  {
    relativePath: "skills/ui-ux-design/references/self-made-web-designer-core-skills.md",
    content: selfMadeWebDesignerSource,
  },
  { relativePath: "skills/ui-ux-design/references/visual-storytelling.md", content: visualStorytellingSource },
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
