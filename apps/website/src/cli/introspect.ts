/**
 * SPEC-003: Tovu CLI policy over @jini-ai/cli/introspection's live Commander tree.
 * The --workspace flag once preceded its prose documentation; reading registrations
 * lets Tovu-Runner see the command surface actually available to its subprocess.
 * Group commands only print usage, so the manifest exposes invocable leaves with their
 * full space-separated paths. Only root introspect/help commands are excluded; nested
 * namesakes remain capabilities. The package projects those paths to single-token MCP
 * names, omits boolean switches, and uses strings because argv supplies strings; command
 * handlers retain numeric/enum validation. These adapters have no process or FS effects.
 */
import type { Command } from "commander";
import { introspectProgram as introspectCliProgram, toMcpTools as cliManifestToMcpTools } from "@jini-ai/cli/introspection";
import type { CliManifest, McpToolDefinition } from "@jini-ai/cli/introspection";

export type { CliManifest, IntrospectedArgument, IntrospectedCommand, IntrospectedOption, McpToolDefinition } from "@jini-ai/cli/introspection";

/**
 * Describe Tovu's invocable commands, omitting its self-description commands.
 * @param program The live Commander root; retains the existing CLI caller contract.
 * @returns A JSON-serializable manifest of leaf commands and their fields.
 * @complexity O(c + f) for c commands and f argument/option fields.
 */
export function introspectProgram(program: Command): CliManifest {
  // Meta commands describe this manifest itself, so advertising them again adds no site capability.
  return introspectCliProgram({ program, excludedCommands: ["introspect", "help"] });
}

/**
 * Bind Tovu's tool-name prefix to Jini's MCP projection.
 * @param manifest The live CLI manifest.
 * @returns One MCP definition per command, using the existing tovu_ naming.
 * @complexity O(c + f) for c commands and f argument/option fields.
 */
export function toMcpTools(manifest: CliManifest): McpToolDefinition[] {
  return cliManifestToMcpTools({ manifest, toolNamePrefix: "tovu_" });
}
