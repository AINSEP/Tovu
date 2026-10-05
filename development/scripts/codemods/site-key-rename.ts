import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Node, Project, SyntaxKind, type Identifier, type SourceFile } from "ts-morph";

// Temporary, task-specific tool. C7 removes this directory after the product rename.
const replacements = [
  ["IntegrationsRootKey", "SiteKey"], ["INTEGRATIONS_ROOT_KEY", "SITE_KEY"],
  ["RootKey", "SiteKey"], ["rootKey", "siteKey"], ["ROOT_KEY", "SITE_KEY"],
  ["SiteToken", "SiteKey"], ["siteToken", "siteKey"], ["SITE_TOKEN", "SITE_KEY"],
] as const;

export function renamedSiteKeyIdentifier({ name }: { name: string }, _optional = {}): string {
  // Separate analytics secret; the binding plan explicitly excludes this exact environment name.
  if (name === "ANALYTICS_ROOT_KEY_SEED") return name;
  // This is a batch of vendor bearer tokens issued while creating a site, not its sealing key.
  if (name === "AdminCreatedSiteTokens") return "AdminCreatedSiteAgentPluginTokens";
  return replacements.reduce((result, [before, after]) => result.replaceAll(before, after), name);
}

export interface RenameRow { file: string; before: string; after: string; result: "rename" | "collision" | "out-of-scope" }

/** References may cross declaration files, but must stay inside the explicitly authorized set.
 * Dry runs perform the same edits in memory so later collision checks see the proposed state.
 */
export function renameSiteKeyDeclarations(
  { project, files }: { project: Project; files: readonly SourceFile[] },
  { declarationFiles = files }: { declarationFiles?: readonly SourceFile[] } = {},
): RenameRow[] {
  const allowed = new Set(files.map(file => file.getFilePath()));
  const rows: RenameRow[] = [];
  for (const file of declarationFiles) {
    // Positions change during a rename, so retain nodes rather than source offsets.
    const names = file.getDescendantsOfKind(SyntaxKind.Identifier).filter(isDeclarationName);
    for (const node of names) {
      if (node.wasForgotten()) continue;
      const before = node.getText();
      const after = renamedSiteKeyIdentifier({ name: before });
      if (before === after) continue;
      const locations = project.getLanguageService().findRenameLocations(node);
      const symbol = node.getSymbol();
      const scope = declarationScope(node);
      const collision = scope.getDescendantsOfKind(SyntaxKind.Identifier).some(other =>
        other !== node && other.getText() === after && isDeclarationName(other) && declarationScope(other) === scope && other.getSymbol() !== symbol);
      const exportCollision = file.getExportSymbols().some(other => other.getName() === after && other !== symbol);
      const result = collision || exportCollision ? "collision"
        : locations.some(location => !allowed.has(location.getSourceFile().getFilePath())) ? "out-of-scope" : "rename";
      rows.push({ file: file.getFilePath(), before, after, result });
      if (process.env.SITE_KEY_RENAME_PROGRESS === "1") console.log(`${path.relative(process.cwd(), file.getFilePath())}: ${before} -> ${after} [${result}]`);
      if (result === "rename") node.rename(after, { renameInComments: false, renameInStrings: false, usePrefixAndSuffixText: false });
    }
  }
  return rows;
}

function isDeclarationName(node: Identifier): boolean {
  const parent = node.getParentOrThrow();
  if (Node.isImportSpecifier(parent)) return parent.getAliasNode() === node;
  if (Node.isExportSpecifier(parent)) return false;
  if (Node.isPropertyAccessExpression(parent) || Node.isJsxAttribute(parent)) return false;
  return Node.hasName(parent) && parent.getNameNode() === node;
}

function declarationScope(node: Identifier): Node {
  const parent = node.getParentOrThrow();
  if (Node.isParameterDeclaration(parent)) return parent.getParentOrThrow();
  if (Node.isPropertyDeclaration(parent) || Node.isPropertySignature(parent) || Node.isPropertyAssignment(parent) || Node.isShorthandPropertyAssignment(parent) || Node.isMethodDeclaration(parent) || Node.isMethodSignature(parent)) return parent.getParentOrThrow();
  return parent.getFirstAncestor(ancestor => Node.isBlock(ancestor) || Node.isSourceFile(ancestor) || Node.isModuleBlock(ancestor)) ?? node.getSourceFile();
}

/** A manifest records the plain-mv operations. Import/export declarations and dynamic imports
 * are edited through their AST nodes; unrelated prose and similarly named modules stay intact.
 */
export function fixSiteKeyImports(
  { files, moves }: { files: readonly SourceFile[]; moves: Readonly<Record<string, string>> },
  _optional = {},
): void {
  for (const file of files) {
    for (const node of [...file.getImportDeclarations(), ...file.getExportDeclarations()]) {
      const specifier = node.getModuleSpecifierValue();
      if (specifier === undefined) continue;
      const updated = movedSpecifier({ file: file.getFilePath(), specifier, moves });
      if (updated !== specifier) node.setModuleSpecifier(updated);
    }
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (!["import", "require"].includes(call.getExpression().getText())) continue;
      const argument = call.getArguments()[0];
      if (!argument || !Node.isStringLiteral(argument)) continue;
      const specifier = argument.getLiteralValue();
      const updated = movedSpecifier({ file: file.getFilePath(), specifier, moves });
      if (updated !== specifier) argument.setLiteralValue(updated);
    }
  }
}

/** Wire strings are a separate, explicit operation; cryptographic and compatibility markers
 * remain untouched. In particular, a symbol rename never implicitly renames a serialized field.
 */
export function rewriteSiteKeyLiterals(
  { files, replacements }: { files: readonly SourceFile[]; replacements: Readonly<Record<string, string>> },
  _optional = {},
): void {
  for (const file of files) {
    for (const node of file.getDescendants()) {
      if (![SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateHead, SyntaxKind.TemplateMiddle, SyntaxKind.TemplateTail, SyntaxKind.RegularExpressionLiteral].includes(node.getKind())) continue;
      if (node.getFirstAncestor(ancestor => Node.isImportDeclaration(ancestor) || Node.isExportDeclaration(ancestor))) continue;
      if (node.getSourceFile().getFullText().slice(node.getStart(), node.getSourceFile().getFullText().indexOf("\n", node.getStart())).includes("site-key-frozen:") || node.getText().includes("static-site-token")) continue;
      const declaration = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (declaration?.getName() === "oldPermission") continue;
      const before = node.getText();
      const after = Object.entries(replacements).reduce((text, [oldName, newName]) => text.replaceAll(oldName, newName), before);
      if (before !== after) node.replaceWithText(after);
    }
  }
}

function renameRecoveryKeyFields({ project, files, allFiles }: { project: Project; files: readonly SourceFile[]; allFiles: readonly SourceFile[] }): void {
  const allowed = new Set(allFiles.map(file => file.getFilePath()));
  const map: Record<string, string> = { token: "siteKey", setToken: "setSiteKey", importToken: "importSiteKey" };
  for (const file of files) {
    for (const node of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (node.wasForgotten()) continue;
      const after = map[node.getText()];
      if (!after) continue;
      const locations = project.getLanguageService().findRenameLocations(node);
      if (locations.some(location => !allowed.has(location.getSourceFile().getFilePath()))) throw new Error(`Recovery rename leaves scope: ${file.getFilePath()}`);
      node.rename(after, { usePrefixAndSuffixText: false });
    }
  }
}

function movedSpecifier({ file, specifier, moves }: { file: string; specifier: string; moves: Readonly<Record<string, string>> }): string {
  const resolved = specifier.startsWith("#src/") ? path.resolve("apps/website/src", specifier.slice(5))
    : specifier.startsWith("@/") ? path.resolve("apps/admin/src", specifier.slice(2))
      : specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : undefined;
  if (!resolved) return specifier;
  const extension = /\.(?:js|ts|tsx|css)$/.exec(specifier)?.[0] ?? "";
  for (const [oldPath, newPath] of Object.entries(moves)) {
    if (resolved.replace(/\.(?:js|ts|tsx|css)$/, "") !== path.resolve(oldPath).replace(/\.(?:ts|tsx|css)$/, "")) continue;
    const target = path.resolve(newPath).replace(/\.(?:ts|tsx|css)$/, "") + extension;
    if (specifier.startsWith("#src/")) return "#src/" + path.relative(path.resolve("apps/website/src"), target);
    if (specifier.startsWith("@/")) return "@/" + path.relative(path.resolve("apps/admin/src"), target);
    const relative = path.relative(path.dirname(file), target);
    return relative.startsWith(".") ? relative : "./" + relative;
  }
  return specifier;
}

function main(): void {
  const args = process.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  const projectName = value("--project");
  if (!args.includes("--project") || !["website", "admin"].includes(projectName)) throw new Error("--project website|admin required");
  const fileIndex = args.indexOf("--files");
  const globs = fileIndex < 0 ? [] : args.slice(fileIndex + 1).filter((_, index, list) => !list.slice(0, index + 1).some(arg => arg.startsWith("--")));
  if (!globs.length) throw new Error("--files <glob list> required");
  if (process.env.SITE_KEY_RENAME_PROGRESS === "1") console.log("Creating project");
  const project = new Project({ tsConfigFilePath: projectName === "website" ? "tsconfig.json" : "apps/admin/tsconfig.json", skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: args.includes("--include-mjs") } });
  project.addSourceFilesAtPaths(projectName === "website" ? ["apps/website/src/**/*.ts", "development/**/*.ts"] : ["apps/admin/src/**/*.{ts,tsx}"]);
  if (args.includes("--include-mjs")) project.addSourceFilesAtPaths(["development/scripts/start.mjs", "development/scripts/__tests__/start.test.mjs"]);
  if (process.env.SITE_KEY_RENAME_PROGRESS === "1") console.log(`Loaded ${project.getSourceFiles().length} source files`);
  // The migration helper itself deliberately retains the old-name map until C7 removes it.
  const files = project.getSourceFiles(globs).filter(file => !file.getFilePath().includes("/codemods/") && !file.getBaseName().startsWith("schema"));
  const baseline = new Map(project.getSourceFiles().map(file => [file.getFilePath(), file.getFullText()]));
  if (args.includes("--jini-facade")) {
    for (const file of files) {
      for (const declaration of file.getExportDeclarations()) {
        if (declaration.getModuleSpecifierValue() !== "@jini-ai/platform/secrets") continue;
        for (const specifier of declaration.getNamedExports()) {
          const before = specifier.getAliasNode()?.getText() ?? specifier.getName();
          const after = renamedSiteKeyIdentifier({ name: before });
          if (before !== after) specifier.renameAlias(after);
        }
      }
      for (const declaration of file.getImportDeclarations()) {
        if (declaration.getModuleSpecifierValue() !== "@jini-ai/platform/secrets") continue;
        for (const specifier of declaration.getNamedImports()) {
          if (specifier.getAliasNode()) continue;
          const before = specifier.getName();
          const after = renamedSiteKeyIdentifier({ name: before });
          if (before !== after) specifier.renameAlias(after);
        }
      }
    }
    const keyring = project.getSourceFileOrThrow("apps/website/src/features/webhooks/keyring.env.ts");
    keyring.getVariableStatement(statement => statement.getDeclarations().some(node => node.getName() === "DEFAULT_ROOT_KEY_ENV_VAR_NAME"))?.remove();
  }
  if (args.includes("--fix-imports")) {
    if (!args.includes("--moves")) throw new Error("--fix-imports requires --moves <JSON manifest>");
    fixSiteKeyImports({ files, moves: JSON.parse(readFileSync(value("--moves"), "utf8")) });
  }
  const declarations = args.includes("--declarations") ? project.getSourceFiles(value("--declarations")) : files;
  const rows = args.includes("--imports-only") ? [] : renameSiteKeyDeclarations({ project, files }, { declarationFiles: declarations });
  if (args.includes("--recovery-fields")) renameRecoveryKeyFields({ project, files: project.getSourceFiles(value("--recovery-fields")), allFiles: files });
  if (args.includes("--string-map")) {
    const stringFiles = args.includes("--string-files") ? project.getSourceFiles(value("--string-files")) : files;
    rewriteSiteKeyLiterals({ files: stringFiles, replacements: JSON.parse(readFileSync(value("--string-map"), "utf8")) });
  }
  for (const row of rows) console.log(`${path.relative(process.cwd(), row.file)}: ${row.before} -> ${row.after} [${row.result}]`);
  if (!args.includes("--dry-run")) {
    for (const file of project.getSourceFiles()) {
      if (file.getFullText() === baseline.get(file.getFilePath())) continue;
      if (!files.includes(file)) throw new Error(`Refusing out-of-scope write: ${file.getFilePath()}`);
      // Write only changed files, avoiding stale saves over another job's unrelated files.
      if (readFileSync(file.getFilePath(), "utf8") !== baseline.get(file.getFilePath())) throw new Error(`Concurrent edit: ${file.getFilePath()}`);
      writeFileSync(file.getFilePath(), file.getFullText());
      console.log(`CHANGED: ${path.relative(process.cwd(), file.getFilePath())}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
