/** Bind the admin's installed Jini versions to Vite's dependency-cache identity. */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { sourceTreeStamp } from "@jini-ai/devops/local-dev";

/**
 * Read local and hoisted Jini manifests once when the admin config loads. Installed versions,
 * rather than manifest ranges or lockfiles, also detect upgrades to linked packages.
 * Missing scopes are allowed; filesystem errors propagate from Jini's existing stamp helper.
 * The complete manifests are hashed so no separate version parser or stamp storage is needed.
 * @param input The admin app directory.
 * @param ports Filesystem seams for deterministic tests; defaults read this installation only.
 * @returns A stable fingerprint, independent of directory enumeration order.
 * @example await adminJiniDependencyFingerprint({ adminDir: __dirname })
 * @complexity O(b + p log p) time/O(p + m) space for p packages, b bytes and largest manifest m.
 */
export async function adminJiniDependencyFingerprint({ adminDir }: { adminDir: string }, {
  scopeExists = existsSync,
  listPackages = (directory: string) => readdirSync(directory),
}: {
  scopeExists?: (directory: string) => boolean;
  listPackages?: (directory: string) => readonly string[];
} = {}): Promise<string> {
  const scopes = ["node_modules/@jini-ai", "../../node_modules/@jini-ai"];
  const installed = scopes.flatMap((relativeScope) => {
    const scope = path.resolve(adminDir, relativeScope);
    if (!scopeExists(scope)) return [];
    return listPackages(scope).map((name) => path.join(scope, name, "package.json"));
  });
  return sourceTreeStamp({ roots: installed.sort() });
}
